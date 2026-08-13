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
* **Dynamic Day / Night Atmosphere**:
  * Toggleable lighting preset switching between daylight and nocturnal city illumination with window light glow effects.
* **Real-time Performance Dashboard**:
  * Live monitoring of FPS, Draw Calls, Active Tiles, Rendered Buildings, Rendered Trees, and Pending Tile Downloads.

---

### 🟡 Planned / Roadmap (Future Digital Twin Expansion)

* **Live Traffic & Mobility Layer**: Real-time traffic congestion heatmaps, speed vectors, and incident alerts.
* **Environmental & AQI Monitoring**: Live Air Quality Index (AQI) station sensors, ambient temperature, and Gomti River water quality telemetry.
* **Flight & Transit Tracking**: Live ADSB aircraft trajectories over Chaudhary Charan Singh International Airport (LKO) and real-time train status for Lucknow Charbagh Railway Station.
* **Lucknow City Live Feeds**: Integration with civic CCTV streams, news alerts, and crowd hotspot detection.
* **AI City Analyst**: LLM-powered urban intelligence assistant answering queries like *"Why is traffic backed up near Hazratganj right now?"* or *"What is the AQI trend around Janeshwar Mishra Park?"*.

---

## 🏗 Architecture

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
│   ├── components/
│   │   ├── 3d/                # Three.js canvas & city viewport
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
