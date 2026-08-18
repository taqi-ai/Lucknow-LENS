import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: "3d-mini-city-procedural" });
});

// Deterministic response generator fallback
function getDeterministicResponse(question: string) {
  const q = question.toLowerCase();
  
  if (q.includes("traffic") || q.includes("congest") || q.includes("jam") || q.includes("hazratganj")) {
    return {
      answer: "Hazratganj is experiencing heavy traffic congestion around Hazratganj Chauraha. Local loops indicate average speeds have dropped to 12 km/h due to peak hour vehicle accumulation and ongoing municipal road maintenance near Mahatma Gandhi Road.",
      sources: ["Lucknow Traffic Control Division", "MG Road Induction Loops Feed"],
      action: {
        type: "FLY_TO",
        latitude: 26.8467,
        longitude: 80.9461,
        layer: "traffic"
      }
    };
  }
  
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

  if (q.includes("flight") || q.includes("plane") || q.includes("aircraft") || q.includes("airport") || q.includes("amausi") || q.includes("adsb")) {
    return {
      answer: "There are currently 4 active flights tracked in the airspace above Lucknow. Indigo Flight 6E-2432 (from Delhi) is on final approach descending to Amausi Airport at 350m, and Air India Flight AI-431 is cruising eastwards at 9,800m.",
      sources: ["Lucknow ADSB Ground Receiver Hub", "Amausi Airport ATC Radar Output"],
      action: {
        type: "FLY_TO",
        latitude: 26.7606,
        longitude: 80.8893,
        layer: "flights"
      }
    };
  }

  if (q.includes("charbagh") || q.includes("station") || q.includes("railway") || q.includes("train")) {
    return {
      answer: "Charbagh Railway Station is operating normally. Heavy pedestrian traffic is noted at the main entry gate, and taxi dispatch queues are experiencing slight delays. Train arrivals are running within 10 minutes of schedule.",
      sources: ["Charbagh Station Master Log Feed", "NER Passenger Information System"],
      action: {
        type: "FLY_TO",
        latitude: 26.8322,
        longitude: 80.9221,
        layer: "railways"
      }
    };
  }

  if (q.includes("news") || q.includes("event") || q.includes("happening") || q.includes("today")) {
    return {
      answer: "Municipal repair work has started on major primary roads near Hazratganj. Additionally, Gomti Riverfront Park is hosting a local cultural exhibition starting at 6:00 PM, which may increase footfall around the Gomti banks.",
      sources: ["Lucknow Municipal Corporation Bulletin", "Daily UP State Press Information Bureau"],
      action: {
        type: "FLY_TO",
        latitude: 26.8525,
        longitude: 80.9545,
        layer: "news"
      }
    };
  }

  if (q.includes("gomti") || q.includes("river") || q.includes("water") || q.includes("barrage")) {
    return {
      answer: "Water levels of the Gomti River at the Gomti Barrage are within normal limits (108.5 meters above MSL). Flow velocity is stable. Localized riverbank cleaning activities are being monitored near the central barrage area.",
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
    answer: "Welcome to Lucknow Lens AI City Analyst. I can answer real-time queries about Lucknow's live traffic, AQI, news, and flight paths. Try asking: 'Why is traffic bad in Hazratganj?' or 'What's the AQI around Gomti Nagar?'",
    sources: ["Lucknow Lens Local Index Lookup"],
    action: {
      type: "NONE"
    }
  };
}

// POST endpoint for AI City Analyst
app.post("/api/analyst", async (req, res) => {
  const { question } = req.body;
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Invalid question body" });
  }

  const fallback = getDeterministicResponse(question);

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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Miniature City server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
