# Lucknow Lens

> **3D Digital Twin of Lucknow, India**  
> An interactive, web-based 3D digital twin platform rendering real-world building footprints, roads, waterways, landmarks, and spatial infrastructure for the city of Lucknow with real-time tile streaming, dynamic atmosphere, and camera controls.

---

## 🚀 Quick Start (Run Locally)

Run Lucknow Lens locally in under 2 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/taqi-ai/Lucknow-LENS.git
cd Lucknow-LENS

# 2. Initialize Git LFS (for raw data assets)
git lfs install
git lfs pull

# 3. Install dependencies
npm install

# 4. Start the local server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

> **Demo Status**: Run locally using the instructions above. Hosted deployment instructions are provided in the [Deployment](#deployment) section.

---

## ✨ Features

### 🟢 Currently Implemented

* **City-Scale 3D Rendering**: Real-world building footprints, roads, waterways, land use, and green zones across the entire Lucknow metropolitan region.
* **Spatial Tile Streaming (`TileStreamer`)**: Zero-flicker dynamic loading/unloading of ~959,000 spatial features partitioned into 6,900+ geographic tiles.
* **Multi-Scale Level of Detail (LOD)**:
  * `FULL CITY`: Macro view with city boundary and key landmarks.
  * `DISTRICT`: Mid-range neighborhood boundaries and major road networks.
  * `NEIGHBORHOOD`: Detailed building footprints and local road geometry.
  * `STREET`: Low-horizon pedestrian perspective with 3D buildings, trees, and detailed place labels.
* **GTA-Style GPS Waypoint & Highlighted Roadmap**:
  * **3D Destination Beacon**: Right-click anywhere in Lucknow, or select any landmark in Search or the Building/POI Inspector to project a vertical holographic light pillar and pulsing beacon.
  * **Instant Sub-Millisecond A* Routing**: Computes the optimal path along Lucknow's real road network (Shaheed Path, Lohia Path, flyovers, arterials, local lanes) completely client-side in ~1.5ms.
  * **Highlighted Purple Roadmap Track**: Bold GTA-style purple highlighted road track pinned along the carriageway with forward flowing illuminated chevrons and glowing borders, dynamically re-routing whenever a new destination is pinned (without artificial moving vehicle dots).
  * **Turn-by-Turn Navigation HUD**: Live maneuver icons, distance countdown, ETA, street names, and color theme switcher (GTA Purple, Neon Pink, Cyber Cyan, Amber Gold).
* **High-Contrast Dark Asphalt Roads & Night Streetlights**:
  * **Black Asphalt Roadways**: Sleek dark asphalt material palette (`#16181d` to `#30353f`) replacing flat dusty grey, providing high visual separation between roads, terrain, and building basements.
  * **Nocturnal Streetlight Glow**: Streetlight luminaires, glowing head beads, and warm sodium road illumination remain active from neighborhood to district altitudes, lighting up Lucknow's road network at night.
* **Collegiate Campus & Green Ambience System**:
  * **Curated Major Estates**: Dedicated landscaped greenery and quads for Lucknow's renowned academic campuses: KGMU Heritage Quad, Lucknow University Badshah Bagh, La Martiniere 200-Acre Estate, SGPGI Medical Campus, IIM Lucknow, and Colvin Taluqdars' Grounds.
  * **Landscaped Green Quads & Turf**: Manicured emerald turf lawns (`#3da344`) framed with sandstone borders and decorative garden pathways that give expansive institutional campuses polite, decorative ambience.
  * **Interactive Campus Badges**: Hoverable 3D academic badges with acreage, founded year, architectural highlights, and campus flora breakdown.
* **Target-Orbit Camera Architecture**:
  * Manual Heading & Tilt controls with 1:1 dial tracking.
  * Continuous endless rotation (supports smooth 360°+ spinning without wrapping pops).
  * Quick-reset to North button.
  * Multi-preset transitions (`Full City`, `District`, `Neighborhood`, `Street`, `Top Map`).
* **Independent Responsiveness Controls**:
  * **Move Sensitivity**: Independent physics damping slider for panning, tilting, and rotating.
  * **Zoom Sensitivity**: Independent exponential scaling for scroll-wheel zoom speed.
* **Importance-Filtered Labels**:
  * Spatial place labels (airports, railway terminals, universities, hospitals, historical monuments).
  * Road labels for major expressways and arterial avenues.
  * Automatic distance and LOD-aware importance filtering.
* **Dynamic Day / Night Atmosphere & Architectural Shading**:
  * **Day Mode Visual Overhaul**: High-contrast roof typology palettes (charcoal slate, dark membrane, gravel decks, vibrant heritage terracotta) that eliminate flat-monolith artifacts.
  * **Natural Daylight Balance**: Warm sunlight key light coupled with cool sky-blue ambient fill, restoring natural 3D depth and crisp shadow definition across building facades.
  * **Daytime Architectural Window Glazing**: Real-time glass specular reflections and enhanced floor banding that glints in sunlight as the camera descends.
  * **Nocturnal Illumination**: City-wide warm sodium window light glow, street-level bounce, and district-level illumination hierarchy.
* **Strategic Transport Gateways & Signature Infrastructure**:
  * **Chaudhary Charan Singh International Airport (Amausi / T3)**:
    * **Full 2,740m Runway 09/27**: Built with official ICAO markings including threshold piano keys, touchdown zone markers, dashed centerlines, chevron blast pads, and large painted numbers (**09** / **27**).
    * **Nocturnal Runway & Taxiway Lighting**: Green threshold approach bars, white runway edge lamps, red stop lines, 4-unit PAPI glideslope boxes, and blue taxiway edge lights.
    * **Terminal 3 (T3) Blue-Glass Wave Canopy**: Modular curved blue-glass vaulted canopy with interior illumination, space-frame arch trusses, and terminal departures viaduct loop.
    * **5 Articulated Aerobridges & Parked Jetliners**: Passenger boarding bridges docked to commercial airliners (IndiGo, Air India, Akasa Air) at apron stands, with active taxiing aircraft.
    * **54m ATC Tower & Apron Helipad**: Cylindrical control tower with a 360° observation cab, rotating radar dome, and a dedicated VIP/rescue helipad with illuminated blue ring and white "H".
  * **Lucknow Charbagh Railway Grand Terminal & Right-Side Monuments**:
    * **Chessboard Mughal-Gothic Palatial Facade**: Faithfully models J.H. Horniman's famous 1926 royal chessboard architecture with red-brick arcades, white Rajput cupolas (chhatris), central dome, and historic clock tower.
    * **Platforms & Foot Overbridges**: 6 passenger boarding platforms sheltered by curved corrugated steel sheds, interconnected by elevated covered foot-overbridges (FOBs).
    * **Rail Corridor & Level Crossing**: Crushed stone ballast beds with broad-gauge steel tracks, station high-mast floodlights, and road-rail grade level crossing boom gates with red/white hazard stripes and warning strobes.
    * **Right-Side Historic Monuments**: Incorporates Lucknow Junction (LJN - NER) Cabway & Steam Engine memorial, the monumental Mawaiya Balanced Cantilever Metro Overbridge (flying 21m above rail tracks), Northern Railway DRM Headquarters, and Ravindralaya Cultural Auditorium & Amphitheater.
  * **Dedicated Transport Inspector & GPS Routing**: Clicking on the Airport or Charbagh Station opens full operational specs with 1-click GTA purple roadmap route calculation.
* **Emergency Services Network (Hospitals, Police, Fire Stations)**:
  * **Real Municipal Facilities**: Backed by real Lucknow geo-coordinates from Overture Places with curated tier-1 hubs (KGMU Trauma Centre, SGPGI, Medanta, Civil Hospital, Lalbagh Fire Station, Chowk Fire Station, Gomti Nagar Fire Station, Hazratganj Kotwali, Chowk Thana, and 160+ precinct posts).
  * **SimCity-Inspired Floating 3D Badges**: Procedural high-DPI floating status badges (Red Medical Cross, Blue Police Shield, Orange Flame) with readable facility name pills beneath each sign, active `24/7 ACTIVE` municipal status, and floating bob animation.
  * **Altitude-Based Density Culling**: Regional landmark hubs are displayed at Full City / District macro altitude to keep macro views pristine and uncluttered, with all local neighborhood chowkis, clinics, and fire posts revealing dynamically upon zoom-in.
  * **Interactive Coverage Radar Overlay**: Custom animated shader projecting a translucent response radius disc (1.5 km to 2.8 km) with concentric radar pulse waves, urban grid lines, and perimeter glow rings when any facility is selected.
  * **Municipal Facility Inspector & GPS Routing**: Detailed info card displaying emergency fleet, capacity, hotline numbers, and one-click routing via the GTA GPS navigation system.
* **Macro City-Scale HLOD Building Massing**:
  * **953,000+ Footprints Resident**: Binary-baked HLOD super-tile system preserving full urban fabric density across all 120 sectors of Lucknow at macro altitude (`[FULL]`).
  * **Extruded 3D Relief Silhouette**: Prominent skyline buildings within 9 km project true 3D walls and heights even from high aerial altitudes, preventing empty ground voids and ensuring seamless transition down to street-level JSON tiles.
  * **Automated Dev Build Verification**: `npm run dev` automatically checks and bakes HLOD assets on demand, ensuring zero empty viewports across any developer setup.
* **Real-time Performance Dashboard**:
  * Live monitoring of FPS, Draw Calls, Active Tiles, Rendered Buildings, Rendered Trees, and Pending Tile Downloads.

---

### 🟢 Live Data (real providers, honest degradation)

Every layer below calls a real upstream API server-side, normalizes it into a shared `status: 'ok' | 'stale' | 'unavailable'` envelope, and caches/retries with backoff. If a provider has no key configured, or is unreachable, the layer reports **unavailable with a stated reason** — it never fabricates a plausible-looking value.

| Layer | Provider | Requires a key? |
| :--- | :--- | :--- |
| Flights | OpenSky Network | No (optional account raises quota) |
| Weather / Air Quality | Open-Meteo | No |
| Trains | RailRadar | Yes — `RAILRADAR_API_KEY` |
| Traffic incidents | TomTom | Yes — `TOMTOM_API_KEY` |
| News | GDELT Project | No (keyless) |
| CCTV cameras | — | No public lawful feed exists; always reports unavailable |
| AI City Analyst | Gemini | Yes — `GEMINI_API_KEY` (falls back to a deterministic rule-based answer without it) |

See [.env.example](.env.example) for the full list of environment variables.

---

## 🏗 Architecture

> For the full rendering pipeline — data flow, coordinate system, LOD tiers, live-data providers, build/deploy — see [`docs/RENDERING_ARCHITECTURE.md`](docs/RENDERING_ARCHITECTURE.md).

```
                       [ Overture Maps Foundation Data ]
                                       │
                                       ▼
                       [ Data Pipeline & Tile Generator ]
                                       │
                                       ▼
                     [ 6,900+ Spatial Geographic Tiles ]
                                       │
                                       ▼
                             ┌───────────────────┐
                             │   TileStreamer    │
                             │ (Distance & LOD)  │
                             └─────────┬─────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │   Three.js 3D City Engine   │
                        │ (Instanced Mesh + Shaders)  │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │   Lucknow Lens UI Dashboard │
                        │  (React 19 + Tailwind v4)   │
                        └─────────────────────────────┘
```

---

## 🛠 Tech Stack

* **Frontend Framework**: React 19, TypeScript 5.8
* **Build Tooling**: Vite 6, Tailwind CSS v4, Lucide Icons
* **3D Graphics & Engine**: Three.js (WebGL), Custom Spatial Tile Engine
* **Server**: Express.js with Node.js
* **Geospatial & Vector Data**: Overture Maps Schema, GeoJSON, Node GIS Pipeline
* **Version Control**: Git & Git LFS

---

## 📊 Dataset & Spatial Streaming

The repository comes bundled with the full, pre-tiled geographic dataset for Lucknow under `public/overture_tiles_full/`.

* **Total Tile Files**: 6,942 spatial tile JSON files (~415 MB total).
* **Maximum File Size**: ~7.68 MB (`overview.json`), well within standard Git file limits.
* **Tile Streamer Logic**: The browser dynamically streams only tiles within the camera's viewing frustum and radius, keeping memory overhead low even on mid-range hardware.

### Data Generation Pipeline (For Contributors)

Normal users do **not** need to run data generation. If you want to re-process or update the Overture dataset:

1. Download the raw Overture GeoJSON/OSM data into the `data/` directory.
2. Run tile partitioning:
   ```bash
   npx tsx scripts/generate_overture_tiles.ts
   ```
3. Extract place & road labels:
   ```bash
   node scripts/extract_labels.cjs
   ```
4. Validate the output dataset:
   ```bash
   npx tsx scripts/validate_dataset.ts
   ```

---

## ⚙️ Development Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express server with Vite middleware on port 3000 |
| `npm run build` | Compiles production assets and bundles server |
| `npm run start` | Runs the compiled production build from `dist/` |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run preview` | Previews production build |
| `npm run smoke` | Boots the built server and verifies `/api/health`, `/api/version`, `/` respond |

---

## 🚢 Deployment

Lucknow Lens is one Node process: Express serves both the API routes and the built static frontend, so it deploys as a single service — no separate frontend/backend hosts needed.

> Hosting it for real users — build-machine memory, cache headers, rate limits, reverse-proxy setup, health checks — is covered in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
npm install
npm run build   # vite build (client) + esbuild bundle (server) -> dist/
npm run start   # node dist/server.cjs, serves API + static bundle on $PORT
```

* **`PORT`** — the server reads `process.env.PORT`, defaulting to 3000. Most PaaS hosts (Render, Railway, Fly.io) inject this automatically.
* **Health check**: `GET /api/health` — reports `status: "ok"` plus per-provider live-feed status. Use this as your host's health-check path.
* **Version**: `GET /api/version` — returns `{ name, version, nodeEnv }`.
* Any host that runs a persistent Node process works (Render, Railway, Fly.io, a VPS with `pm2`/systemd). Static-only hosts (Netlify/Vercel static) are not sufficient on their own since the live-data API routes need a running server.
* Copy `.env.example` to `.env` and fill in the provider keys you want enabled; secrets are read server-side only and never bundled into the client.
* **HLOD is generated, not committed** — `public/hlod/*.bin` is gitignored (it's a ~190 MB derived artifact rebuilt from the committed `public/overture_tiles_full/tile_*.json`). `npm run build` now runs a `prebuild` step that bakes it automatically if `public/hlod/hlod_manifest.json` is missing, so a fresh clone builds a complete deployment with no manual step. Re-run `npm run bake` yourself only when you've changed tile data and want to force a rebake.

### Docker

A [`Dockerfile`](Dockerfile) is included for any container host (Fly.io, Railway, Render's Docker runtime, Cloud Run, a bare VPS with Docker). It's a two-stage build — `npm ci && npm run build` (which bakes HLOD, builds the client, and bundles the server), then a slim runtime image with only production dependencies and `dist/`.

```bash
docker build -t lucknow-lens .
docker run -p 3000:3000 --env-file .env lucknow-lens
```

## ⚙️ CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR to `main`: install deps → `tsc --noEmit` → `npm run build` → `npm run smoke` (boots the built server and checks `/api/health`, `/api/version`, and `/`). The workflow fails the build on any error. There is no automatic deploy step configured — wire one up for your chosen host once you've picked it (most hosts either auto-deploy from a connected GitHub repo, or take a deploy step added to this workflow).

---

## 📂 Project Structure

```
Lucknow-LENS/
├── public/
│   └── overture_tiles_full/   # Pre-tiled 3D spatial city dataset & labels
├── scripts/
│   ├── generate_overture_tiles.ts # GeoJSON to spatial tile generator
│   ├── extract_labels.cjs     # Place & road label extraction pipeline
│   └── validate_dataset.ts    # Dataset integrity checker
├── src/
│   ├── city/
│   │   ├── cameraController.ts# Target-orbit physics camera controller
│   │   ├── tileStreamer.ts    # Spatial tile loader & LOD manager
│   │   └── labelManager.ts   # 3D world-space label projector
│   ├── navigation/            # GTA-style GPS waypoint & A* routing system
│   │   ├── roadGraph.ts       # Spatial graph with 14,000+ Lucknow road segments
│   │   ├── pathfinder.ts      # A* search & turn-by-turn maneuver engine
│   │   ├── waypointVisuals.ts # 3D light beam, pulsing beacon & flowing GPS ribbon
│   │   ├── routeDriver.ts     # Autonomous vehicle cruise & chase camera controller
│   │   └── types.ts           # Route, maneuver & navigator state definitions
│   ├── components/
│   │   ├── 3d/                # Three.js canvas & city viewport
│   │   ├── features/          # Navigation HUD, search, info panel, layer toggles
│   │   └── ui/                # HUD controls, compass widget & performance metrics
│   ├── App.tsx
│   └── main.tsx
├── server.ts                  # Express production & dev server
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 💳 Data Credits & Acknowledgments

* **Data Source**: [Overture Maps Foundation](https://overturemaps.org/) (Buildings, Places, Transportation, Water, Land Use schema).
* **Map Data**: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
