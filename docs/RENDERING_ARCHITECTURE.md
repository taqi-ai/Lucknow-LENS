# Lucknow LENS — Rendering Architecture

How the 3D digital twin actually renders, from raw Overture data to pixels.
This is a map of the real pipeline, not aspirational — every path named here
is live code, checked against the repository as of this document's writing.

## 1. Data pipeline (offline, build-time)

```
Overture Maps extract (buildings, places, transportation, water, land use)
        │
        ▼
scripts/generate_overture_tiles.ts   → public/overture_tiles_full/tile_{x}_{z}.json
                                        (500m grid, lod1/lod2 buildings, roads,
                                         waterways, greenAreas)
        │
        ▼
scripts/build_transportation.ts      → overview.json majorRoads/waterways
   - classifies road hierarchy (src/city/ribbon.ts: ROAD_HALF_WIDTH,
     classifyRoad — expressway > trunk > primary > secondary > tertiary >
     residential > service > footway)
   - resolveElevation()/elevationFromName() correct a documented Overture gap:
     many real flyovers are tagged isElevated=false/level=0. Corrected only
     against explicit flyover/overbridge naming, never guessed.
        │
        ▼
scripts/suppress_conflicts.ts        → drops building footprints that fall
                                        inside road/rail/water/airport corridors
        │
        ▼
scripts/place_vegetation.ts          → adds trees to tiles: park interiors
                                        (jittered grid), arterial verges,
                                        riverbank bands — all tested against
                                        the same corridor/area exclusion mask
                                        used by suppress_conflicts (never on
                                        a road, rail bed, water, building, or
                                        the airport movement area)
        │
        ▼
scripts/bake_hlod.ts (`npm run bake`) → public/hlod/*.bin + hlod_manifest.json
                                        (quantized binary super-tiles; see the
                                        file's own header comment for the wire
                                        format — this is what lets the client
                                        upload buildings as plain buffers
                                        instead of triangulating ~1M polygons
                                        on the main thread)
```

`public/hlod/` is generated, not committed (~190 MB, gitignored). It rebuilds
in ~10–15s from the committed tile JSON, and `npm run build` runs it
automatically via a `prebuild` script whenever `hlod_manifest.json` is
missing — a fresh clone always produces a complete deployment.

`scripts/lib/spatialIndex.ts` (`CorridorIndex`, `AreaIndex`) is the one
spatial-hash implementation shared by suppression and vegetation, so the two
passes cannot disagree about where a road or water body is.

## 2. Coordinate system

**`src/geo/projection.ts` is the single canonical lat/lon ↔ world-XZ
transform.** Every subsystem that needs to convert a raw coordinate —
`src/city/cameraController.ts` (`flyTo`), `src/search/SearchIndex.ts`,
`src/osm/overtureParser.ts`, and the offline scripts (`build_transportation.ts`,
`generate_overture_tiles.ts`, `validate_dataset.ts`) — uses this same origin
(`CENTER_LAT=26.84997035, CENTER_LON=80.95005255…`, the actual centroid of the
extracted dataset). Do not add another hardcoded center anywhere: two
divergent centers previously caused `flyTo()` to land ~275–500m from the
landmark it was aimed at, which is the class of bug this module exists to
prevent.

## 3. Runtime rendering (client)

```
src/components/3d/CityViewport.tsx   — mounts one CityRenderer + one
                                        TileStreamer + one LabelManager per
                                        session; owns the animation loop
        │
        ├─ src/city/tileStreamer.ts  — LOD-aware tile loader. Loads the HLOD
        │                              manifest, city overlay (roads/Gomti/
        │                              parks — built once, always resident)
        │                              and per-tile detail in parallel; the
        │                              render loop starts before any of that
        │                              resolves, so first paint is never
        │                              blocked on network.
        │
        ├─ src/city/tileWorker.ts    — off-main-thread tile JSON→geometry
        │                              (buildings, streetlights, trees)
        │
        ├─ src/city/cityOverlay.ts   — always-resident city-wide network:
        │                              roads, railway (bed/rails/sleepers,
        │                              each gated by altitude — bed at every
        │                              zoom, rails ≤12,000m, sleepers
        │                              ≤1,800m), Gomti, parks, bridges
        │
        ├─ src/city/landmarks.ts,
        │  src/city/namedStructures.ts,
        │  src/city/bridges.ts,
        │  src/city/metroStations.ts — dedicated geometry for the ~14
        │                              recognisable landmarks and Lucknow's
        │                              named flyovers/bridges (Gol Market,
        │                              Polytechnic, Lohia Path, Butler,
        │                              Chandganj, Faizabad Road, Matiyari,
        │                              Purania, Ring Road, Lalabagh/Daliganj/
        │                              Nirala Nagar ROBs, Ahimamau, Aishbagh,
        │                              Mohan Road, Vibhuti Khand…). Bulk
        │                              Overture extrusions inside these
        │                              footprints are suppressed upstream so
        │                              there's no duplicate geometry.
        │
        ├─ src/city/labelManager.ts  — one label source of truth: screen-
        │                              space NDC occupancy grid for collision
        │                              avoidance, LOD-gated importance
        │                              thresholds per zoom tier, distance
        │                              fade, day/night contrast tuning
        │
        └─ src/city/buildingMaterial.ts — one shared shader material drives
                                        every building (bulk + HLOD alike).
                                        `SkylineStyle = 'warm' | 'clear' |
                                        'cyberpunk'` plus a separate night
                                        flag select genuinely different
                                        lighting/color profiles, not a tint
                                        over the same values.
```

Streetlights (`tileStreamer.ts` `addStreetlights()` / `tileWorker.ts`
`buildStreetlights()`) are placed from road geometry — class, width, elevated
status — favoring arterials, junctions and flyovers, and rendered as
instanced emissive meshes rather than per-lamp PointLights. Four instanced
draws per tile: mast, head, a billboarded additive halo, and a ground light
pool. Spacing is deliberately wider than highway practice (68-95 m by class,
`LIT_ROAD_SPACING`) and only motorway/trunk are lit from both sides — at true
30 m spacing every arterial read as a picket fence and the additive halo pass
drowned in overdraw.

Two constraints are easy to break here and were both broken in practice:

* Lamps are **built** on every streamed tile (`lod >= 2`) but only **drawn**
  at street scale, via `setLampsVisible()` on the main thread. Gating
  construction in the worker was the original design and silently produced
  zero lamps once the streamer unified LOD 2 and 3 onto `CONTENT_TIER = 2`.
* The halo and pool are raw `ShaderMaterial`s, and the renderer runs with
  `logarithmicDepthBuffer: true`. Any such shader **must** include three's
  `logdepthbuf_*` chunks, or it writes a depth the rest of the scene does not
  agree with and every fragment fails the depth test — the quads are submitted,
  counted in the draw calls, and invisible. The halo also relocates its vertices
  to the lamp head in the vertex shader, so its `geometry.boundingSphere` is set
  explicitly; the geometry's own bounds describe the wrong place and the
  instanced cull would drop halos that are still on screen.

## 4. Live data

`server.ts` runs one `CachedFeed` per provider (`server/providers/*`) so every
connected client shares a single upstream poll: OpenSky (flights), Open-Meteo
(weather, air quality), RailRadar (trains), TomTom (traffic), GDELT (news).
Each endpoint (`/api/live/*`) reports an honest `status` — `ok`, `stale`, or
`unavailable` — never fabricated data when a key is missing or a provider
times out. `GET /api/health` aggregates all six for a host health check.
Secrets are read server-side only (`.env`, see `.env.example`) and never
reach the client bundle.

## 5. Build & deploy

One Node process serves both the API and the built static frontend
(`server.ts`, prebuilt-bundle branch). `npm run build` = bake HLOD (if
missing) → `vite build` (also copies `public/` into `dist/`, including the
tile data and freshly-baked HLOD) → esbuild-bundle the server. `npm start`
runs `dist/server.cjs`. See the root [`README.md`](../README.md#-deployment)
for environment variables, [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) for
hosting this for real users, and the [`Dockerfile`](../Dockerfile) for a
container build that works on any Docker-capable host.

## 6. Known limitations

Honest gaps, re-verified against current code rather than carried forward
from an earlier draft of this document:

* **Flyover segment grouping.** Named structures (`src/city/namedStructures.ts`)
  are matched and detailed per Overture feature; adjacent segments of one
  physical structure are not merged first, so railings/supports can duplicate
  where Overture split a flyover into multiple features.
* **Streetlight illumination is not a light.** Lamps now carry a shader halo
  and a ground pool (see §3), but both are painted additively — they do not
  illuminate nearby geometry, so a building beside a lamp is no brighter for
  it.
* **Terrain.** All geometry sits at `y = 0`; no elevation source exists.
* **True `level` ranges / real road width.** Overture's schema doesn't carry
  either for this extract; `resolveElevation()`/`ROAD_HALF_WIDTH` are
  reasoned approximations, not measured values.
* **Underpasses.** Deliberately not faked — no tunnel or below-grade flag
  exists in the source data, so none is rendered.
* **Screen-space AO / bloom.** Contact shading is baked per-vertex instead of
  computed as a post-process.
* **Live trains.** The RailRadar adapter and UI states exist (see §4); the
  layer reports `unavailable` until `RAILRADAR_API_KEY` is configured, by
  design — it never fabricates train positions.

Airport surface geometry (runway, taxiway, apron, terminal, parked aircraft —
`src/city/landmarks.ts` `buildTerminal()`), altitude-gated rail LOD (bed/
rails/sleepers — §3), and static train geometry at Charbagh are implemented;
an earlier draft of this document listed them as not started.
