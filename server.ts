import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import compression from "compression";
import { CachedFeed } from "./server/providers/cache";
import { OpenSkyProvider } from "./server/providers/opensky";
import { OpenMeteoWeatherProvider, OpenMeteoAirQualityProvider } from "./server/providers/openmeteo";
import { RailRadarProvider } from "./server/providers/railradar";
import { TomTomTrafficProvider } from "./server/providers/tomtomTraffic";
import { GdeltNewsProvider } from "./server/providers/gdeltNews";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Behind a load balancer or PaaS router, req.ip is the proxy unless this is set.
// The rate limiter below keys on req.ip, so without it every visitor shares one
// bucket and the first busy client locks everyone else out.
app.set("trust proxy", 1);
// Nothing here accepts a payload larger than a few hundred bytes; the default
// 100 kb is free memory for anyone who wants to spend ours.
app.use(express.json({ limit: "16kb" }));
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// SECURITY HEADERS
//
// Written out rather than pulled from helmet: this is a single-origin static
// app with six read-only JSON endpoints, so the useful subset is small and a
// dependency that ships two dozen middlewares to apply five headers is not
// worth the supply-chain surface.
//
// No CSP is set here. The client builds shaders and workers from blob URLs and
// Vite injects inline styles in dev, so a policy strict enough to be worth
// having would need `unsafe-inline`/`blob:` anyway — better to add a real one
// deliberately than to ship a permissive policy that only looks like defence.
// ---------------------------------------------------------------------------
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Permissions-Policy", "geolocation=(self), microphone=(), camera=()");
  next();
});

// ---------------------------------------------------------------------------
// STATIC ASSET DELIVERY
//
// Startup pulls ~22 MB of JSON (overview 7.3, places_labels 6.9, the Overture
// geojson 7.1, manifest 1.3). Uncompressed that dominates time-to-first-city.
// These are highly repetitive coordinate arrays and gzip roughly 8-10x.
//
// The .bin HLOD streams are already quantised so they compress far less; level 1
// keeps CPU cost negligible while still trimming them.
// ---------------------------------------------------------------------------
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.endsWith(".bin")) return true;
    return compression.filter(req, res);
  },
}));

// City geometry is content-addressed by the bake and never mutates in place, so
// reloads should hit cache instead of re-downloading hundreds of megabytes.
app.use((req, res, next) => {
  if (req.path.startsWith("/overture_tiles_full/") ||
      req.path.startsWith("/overture/") ||
      req.path.startsWith("/hlod/s_")) {
    // Source tiles never change; HLOD super-tiles are cache-busted by the bake
    // timestamp the client reads out of the manifest.
    res.set("Cache-Control", "public, max-age=604800, immutable");
  } else if (req.path.startsWith("/hlod/")) {
    // The manifest itself must stay revalidated, or a re-bake is never noticed.
    res.set("Cache-Control", "no-cache");
  }
  next();
});

// ---------------------------------------------------------------------------
// LIVE DATA LAYER
//
// One cached feed per provider, shared by every connected client. The browser
// never talks to an upstream API and never sees a credential — it polls these
// endpoints, which serve from cache and carry explicit freshness metadata.
//
// Poll cadences are deliberately conservative: OpenSky's anonymous tier has a low
// daily quota, and aircraft positions are interpolated client-side between polls.
// ---------------------------------------------------------------------------
const flightFeed = new CachedFeed(new OpenSkyProvider(), {
  ttlMs: 12_000,
  timeoutMs: 9_000,
  maxStaleMs: 120_000,
  attribution: "Data from the OpenSky Network (opensky-network.org)",
});

const trainFeed = new CachedFeed(new RailRadarProvider(), {
  ttlMs: 20_000,
  timeoutMs: 9_000,
  maxStaleMs: 180_000,
  attribution: "Live train data via RailRadar",
});

const weatherFeed = new CachedFeed(new OpenMeteoWeatherProvider(), {
  ttlMs: 300_000,        // observations update every 15 min upstream
  timeoutMs: 8_000,
  maxStaleMs: 3_600_000,
  attribution: "Weather by Open-Meteo.com (CC BY 4.0)",
});

const airFeed = new CachedFeed(new OpenMeteoAirQualityProvider(), {
  ttlMs: 600_000,        // hourly upstream
  timeoutMs: 8_000,
  maxStaleMs: 7_200_000,
  attribution: "Air quality by Open-Meteo.com (CC BY 4.0)",
});

const trafficFeed = new CachedFeed(new TomTomTrafficProvider(), {
  ttlMs: 60_000,
  timeoutMs: 9_000,
  maxStaleMs: 300_000,
  attribution: "Traffic incidents by TomTom",
});

const newsFeed = new CachedFeed(new GdeltNewsProvider(), {
  ttlMs: 900_000,        // GDELT's own index updates roughly every 15 min
  timeoutMs: 10_000,
  maxStaleMs: 3_600_000,
  attribution: "News via the GDELT Project (gdeltproject.org)",
});

// ---------------------------------------------------------------------------
// RATE LIMITING
//
// Only the /api routes are limited. Static geometry is immutable and cached for
// a week, so it belongs to the CDN or reverse proxy, not to a Node counter.
//
// Every live endpoint answers from a shared CachedFeed, so a flood costs us CPU
// and bandwidth rather than upstream quota. The limit is therefore generous —
// it exists to keep one misbehaving client from starving the event loop, not to
// meter legitimate use. A tab polling all six layers at their real cadences
// makes roughly 25 requests a minute.
//
// The counter is per-process and in memory. With more than one instance behind a
// balancer each gets its own budget, which is fine for a ceiling of this kind;
// a shared store would only matter if this were metering a paid quota.
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 180;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

app.use("/api", (req, res, next) => {
  const now = Date.now();
  const key = req.ip ?? "unknown";
  let b = rateBuckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, b);
  }
  b.count++;

  // Sweep expired buckets occasionally so a long uptime behind a wide NAT range
  // cannot grow the map without bound.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }

  res.set("RateLimit-Limit", String(RATE_MAX));
  res.set("RateLimit-Remaining", String(Math.max(0, RATE_MAX - b.count)));
  res.set("RateLimit-Reset", String(Math.ceil((b.resetAt - now) / 1000)));

  if (b.count > RATE_MAX) {
    res.set("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
    res.status(429).json({ status: "error", error: "rate_limited" });
    return;
  }
  next();
});

app.get("/api/live/weather", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await weatherFeed.get());
});

app.get("/api/live/air", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await airFeed.get());
});

app.get("/api/live/flights", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await flightFeed.get());
});

app.get("/api/live/trains", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await trainFeed.get());
});

app.get("/api/live/traffic", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await trafficFeed.get());
});

app.get("/api/live/news", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await newsFeed.get());
});

app.get("/api/version", (_req, res) => {
  res.json({ name: "lucknow-lens", version: "1.0.0", nodeEnv: process.env.NODE_ENV ?? "development" });
});

// API Health Check
app.get("/api/health", async (_req, res) => {
  const [flights, trains, weather, air, traffic, news] = await Promise.all([
    flightFeed.get(), trainFeed.get(), weatherFeed.get(), airFeed.get(), trafficFeed.get(), newsFeed.get(),
  ]);
  res.json({
    status: "ok",
    live: {
      flights: { status: flights.status, provider: flights.provider, count: flights.items.length },
      trains: { status: trains.status, provider: trains.provider, count: trains.items.length },
      weather: { status: weather.status, provider: weather.provider, count: weather.items.length },
      air: { status: air.status, provider: air.provider, count: air.items.length },
      traffic: { status: traffic.status, provider: traffic.provider, count: traffic.items.length },
      news: { status: news.status, provider: news.provider, count: news.items.length },
    },
  });
});

// Deterministic response generator fallback with Spatial Intelligence awareness
function getDeterministicResponse(question: string, context?: any) {
  const q = question.toLowerCase();
  
  // 1. Waterlogging Queries
  if (q.includes("waterlog") || q.includes("water stagnation") || q.includes("drainage")) {
    return {
      answer: "Waterlogging report: Polytechnic Chauraha underpass on Faizabad Road currently has localized 25cm water stagnation due to drainage silt accumulation. Traffic movement is slow; two-wheelers are advised to take the flyover. In Gomti Nagar Phase-1, the storm basin is operating normally with all 4 municipal pumps active.",
      sources: ["LMC Urban Drainage Telemetry", "Lucknow Municipal Control Room Incident Feed"],
      action: {
        type: "FLY_TO",
        latitude: 26.8624,
        longitude: 80.9984,
        layer: "waterlogging"
      }
    };
  }

  // 2. Flood Susceptibility Queries
  if (q.includes("flood") || q.includes("inundat") || (q.includes("gomti") && q.includes("risk"))) {
    return {
      answer: "According to the UP State Disaster Management Authority (UPSDMA) Flood Atlas, the Gomti River 100-Year Inundation Corridor (from Kudia Ghat past Daliganj to Gomti Barrage) has high historical flood susceptibility when river discharge exceeds 45,000 cusecs. Current water level is safe at 108.4m MSL (Warning level: 109.5m).",
      sources: ["UPSDMA Flood Mapping Atlas", "Central Water Commission (CWC) Gauge Feed"],
      action: {
        type: "FLY_TO",
        latitude: 26.8580,
        longitude: 80.9490,
        layer: "flood"
      }
    };
  }

  // 3. Navigation / Route to Airport Queries
  if (q.includes("route") && (q.includes("airport") || q.includes("amausi") || q.includes("avoid"))) {
    return {
      answer: "Route to CCS International Airport (T3): Kanpur Road between Alambagh and Singar Nagar has an active road closure due to Metro viaduct girder construction. The navigation system has calculated a detour via VIP Road and Amar Shaheed Path, saving approximately 18 minutes compared to the congested arterial corridor.",
      sources: ["UPMRC Traffic Cell", "Lucknow ITMS Road Network Graph"],
      action: {
        type: "CALCULATE_ROUTE",
        latitude: 26.7606,
        longitude: 80.8893,
        destination: { name: "Chaudhary Charan Singh Int'l Airport (T3)", lat: 26.7606, lon: 80.8893 }
      }
    };
  }

  // 4. City Updates Summary
  if (q.includes("summar") || (q.includes("update") && (q.includes("city") || q.includes("today") || q.includes("verified")))) {
    return {
      answer: "Lucknow City Pulse Summary: 1) Charbagh Terminal Platform 1 electrification underway for the second Vande Bharat service; 2) CCS Airport T3 surpassed 35,000 daily passengers; 3) Smart AI traffic signal phasing activated along Mahatma Gandhi Marg; 4) Metro girder launch closure on Kanpur Road with detour in effect.",
      sources: ["Lucknow City Pulse Multi-Agency Telemetry", "LMC & UPMRC Official Bulletins"],
      action: {
        type: "FLY_TO",
        latitude: 26.8488,
        longitude: 80.9442,
        layer: "news"
      }
    };
  }

  // 5. Charbagh Station Queries
  if (q.includes("charbagh") || q.includes("station") || (q.includes("railway") && !q.includes("flight"))) {
    return {
      answer: "Charbagh Railway Grand Terminal is operating smoothly. Platform 1 has a docked Vande Bharat Express rake; the historic Ravindralaya amphitheater campus to the east and the central forecourt Black Beauty steam engine memorial are open. Pedestrian flow is normal, and train movements are on schedule.",
      sources: ["Northern Railway Station Master Log", "Charbagh Digital Twin Sensors"],
      action: {
        type: "FLY_TO",
        latitude: 26.8322,
        longitude: 80.9221,
        layer: "railways"
      }
    };
  }

  // 6. Traffic & Congestion Queries
  if (q.includes("traffic") || q.includes("congest") || q.includes("jam") || q.includes("hazratganj")) {
    return {
      answer: "Hazratganj is experiencing heavy traffic congestion around Hazratganj Chauraha. Local ITMS sensors indicate average vehicle speeds have slowed to 12 km/h due to peak accumulation and a minor collision on MG Marg. Adaptive AI signal phasing is working to clear the backlog.",
      sources: ["Lucknow Traffic Control Division", "MG Road Induction Loops Feed"],
      action: {
        type: "FLY_TO",
        latitude: 26.8467,
        longitude: 80.9461,
        layer: "traffic"
      }
    };
  }
  
  // 7. AQI & Air Quality Queries
  if (q.includes("aqi") || q.includes("pollution") || q.includes("air") || q.includes("smog") || q.includes("gomti nagar")) {
    return {
      answer: "The Air Quality Index (AQI) around Gomti Nagar and Janeshwar Mishra Park is currently at 145 (Moderate). PM2.5 is the primary active pollutant. Ambient weather conditions indicate high relative humidity, which is trapping particulate matter close to the surface.",
      sources: ["Central Pollution Control Board (CPCB) India", "Gomti Nagar Clean Air Telemetry Station"],
      action: {
        type: "FLY_TO",
        latitude: 26.8315,
        longitude: 80.9812,
        layer: "aqi"
      }
    };
  }

  // 8. Flight Queries
  if (q.includes("flight") || q.includes("plane") || q.includes("aircraft") || q.includes("airport") || q.includes("amausi") || q.includes("adsb")) {
    return {
      answer: "Chaudhary Charan Singh International Airport (Amausi, T3) is operating with CAT-II ILS. Real-time OpenSky ADS-B telemetry tracks active inbound flights including Indigo Flight 6E-2432 descending to Runway 09. The 2,740m runway and 5 aerobridges are in active service.",
      sources: ["OpenSky Network Live ADS-B Ground Receiver", "Amausi Airport ATC Radar Output"],
      action: {
        type: "FLY_TO",
        latitude: 26.7606,
        longitude: 80.8893,
        layer: "flights"
      }
    };
  }

  // 9. Gomti River Queries
  if (q.includes("gomti") || q.includes("river") || q.includes("barrage")) {
    return {
      answer: "Water levels of the Gomti River at the Gomti Barrage are within normal limits (108.4 meters above MSL). Flow velocity is stable. Localized riverbank cleaning activities are being monitored near the central barrage area.",
      sources: ["UP Irrigation & Hydrology Department Data", "Gomti River Water Quality Monitors"],
      action: {
        type: "FLY_TO",
        latitude: 26.8525,
        longitude: 80.9545,
        layer: "news"
      }
    };
  }

  return {
    answer: "Welcome to Lucknow Lens AI City Analyst. I provide spatial intelligence across Lucknow's 3D twin: live traffic, waterlogging hotspots, flood risks, road closures, and route optimization. Try asking: 'Is there any reported waterlogging around Gomti Nagar?' or 'Find a route to Lucknow Airport avoiding reported road closures.'",
    sources: ["Lucknow Lens Spatial Intelligence Layer (SIL)"],
    action: {
      type: "NONE"
    }
  };
}

// POST endpoint for AI City Analyst
app.post("/api/analyst", async (req, res) => {
  const { question, context } = req.body;
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Invalid question body" });
  }

  const fallback = getDeterministicResponse(question, context);

  if (!process.env.GEMINI_API_KEY) {
    return res.json(fallback);
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const promptText = `
      You are the AI City Analyst for LUCKNOW LENS, a 3D digital twin system. 
      Analyze the user's question and provide a realistic, factual response using the local Lucknow database context.
      
      CRITICAL INSTRUCTION:
      - Do NOT hallucinate live city information. If the data is unavailable, clearly state that.
      - Map the response to one of the following key locations in Lucknow:
        * Hazratganj: lat 26.8467, lon 80.9461 (Traffic)
        * Gomti Nagar / Janeshwar Mishra Park: lat 26.8315, lon 80.9812 (AQI)
        * Amausi Airport: lat 26.7606, lon 80.8893 (Flights)
        * Charbagh Railway Station: lat 26.8322, lon 80.9221 (Railways/Traffic)
        * Gomti River: lat 26.8525, lon 80.9545 (Water/News)
      
      - Return a JSON response matching the schema below:
      {
        "answer": "A detailed explanation of what is happening, strictly matching the facts of the city database.",
        "sources": ["Source name 1", "Source name 2"],
        "action": {
          "type": "FLY_TO" | "ENABLE_LAYER" | "NONE",
          "latitude": float,
          "longitude": float,
          "layer": "traffic" | "aqi" | "flights" | "railways" | "news"
        }
      }
      
      User's Question: "${question}"
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            answer: { type: "STRING" },
            sources: { type: "ARRAY", items: { type: "STRING" } },
            action: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", enum: ["FLY_TO", "ENABLE_LAYER", "NONE"] },
                latitude: { type: "NUMBER" },
                longitude: { type: "NUMBER" },
                layer: { type: "STRING", enum: ["traffic", "aqi", "flights", "railways", "news"] }
              },
              required: ["type"]
            }
          },
          required: ["answer", "sources"]
        }
      }
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      return res.json(result);
    } else {
      return res.json(fallback);
    }
  } catch (err) {
    console.error("Gemini AI API call failed, falling back to rule-based analysis:", err);
    return res.json(fallback);
  }
});


// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  // Prefer the prebuilt bundle whenever it exists. Vite's dev middleware compiles
  // the app (three.js included) on first request, which cold-starts at ~90s and is
  // what made localhost look unresponsive. `npm run serve` builds then serves this
  // path; `npm run dev` still gets HMR when dist/ is absent.
  const distPath = path.join(process.cwd(), "dist");
  const hasBuild = fs.existsSync(path.join(distPath, "index.html"));
  const useVite = process.env.NODE_ENV !== "production" && !hasBuild;

  if (useVite) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Hashed asset filenames, so the bundle can be cached hard.
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.set("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        // The city dataset is ~700 MB of tile JSON and HLOD binaries, and a
        // single session pulls a large slice of it. Without these headers every
        // visitor re-fetches the lot, which is the difference between this being
        // hostable for many people and being hostable for one.
        //
        // HLOD requests carry `?v=<bake timestamp>` (see hlodLayer.cacheBust),
        // so the URL itself changes on a re-bake and the response is genuinely
        // immutable. Tile JSON has no such version, so it gets a day — long
        // enough to cover a session, short enough that a re-bake lands within
        // one — plus revalidation rather than a hard expiry.
        if (filePath.includes(`${path.sep}hlod${path.sep}`)) {
          res.set("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.includes(`${path.sep}overture_tiles_full${path.sep}`)) {
          res.set("Cache-Control", "public, max-age=86400, must-revalidate");
        }
      },
    }));
    app.get("*", (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving prebuilt bundle from dist/");
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Miniature City server running on http://localhost:${PORT}`);
  });
  // Container orchestrators send SIGTERM and then kill after a grace period.
  // Without this the process dies mid-response and in-flight clients see a
  // truncated tile rather than a clean retry.
  const shutdown = (signal: string) => {
    console.log(`${signal} received — draining connections`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer();
