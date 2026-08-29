# Lucknow LENS — Rendering Architecture Audit

Status: **Phase A (audit) complete.** Written against the repository as of the
`main` branch, verified by running the app in headless Chrome and sampling the
live renderer, not by reading the continuation document.

---

## 1. The pipeline as it exists today

```
DATA        public/overture_tiles_full/   6,940 tiles × ~59 KB = 434 MB of JSON
            manifest.json                 tile index (bounds, centers, counts)
            overview.json                 majorRoads 14,471 / waterways 527 /
                                          greenAreas 1,480 / densityBlocks 27,868
            places_labels.json            47,963 places
            road_labels.json              167 roads
              │
TILE        TileStreamer.update(camera)   throttled to 5 Hz
              ├ LOD from camera.position.y (4000 / 1800 / 600 m thresholds)
              ├ radius = base(12k|8k|6k|4k) × (alt/1200), capped 25 km
              ├ frustum test against precomputed Box3 per tile
              └ queue sorted by distance, MAX_CONCURRENT_LOADS = 2
              │
FEATURE     fetch(`/overture_tiles_full/${id}.json`) → JSON.parse (main thread)
            lod ≤ 1 → data.lod1.buildings (95,723 citywide)
            lod ≥ 2 → data.lod2.buildings (959,316 citywide)
              │
GEOMETRY    per building:  THREE.Shape → THREE.ExtrudeGeometry  (main thread)
            per road seg:  THREE.PlaneGeometry, one per segment
            per park:      THREE.ShapeGeometry
            trees:         4 InstancedMesh from shared prototypes
              │
            TileStreamer.mergeGeometries() — hand-rolled, positions only.
            Drops uv + groups, then computeVertexNormals().
              │
MATERIAL    BuildingVisuals: 5 wall + 5 roof MeshStandardMaterial,
            index = hash(building.id) % 5. Day/night by color.setHex().
            Roads: 4 shared MeshStandardMaterial. Parks: 3. Water: 1.
              │
SCENE       CityRenderer.scene
            ├ AtmosphericSky      1 draw call, ShaderMaterial dome, r = 80,000
            ├ HorizonCity         32 InstancedMesh × 400 procedural boxes
            ├ overviewGroup       ground disc r = 150,000 + overview roads/water/parks
            ├ tileGroupParent     one THREE.Group per streamed tile
            └ labels / flights / highlight ring
              │
CAMERA      CameraController — orbit (target, azimuth, pitch, distance),
            critically-damped lerp, soft XZ rubber-band bounds.
            near = 2, far = 150,000, fov = 38, logarithmicDepthBuffer = true
              │
LIGHTING    1 DirectionalLight + 1 AmbientLight + 1 HemisphereLight.
            Shadows: 2048², enabled only below 3,000 m altitude.
              │
POST        none
              │
SCREEN      ACESFilmicToneMapping, exposure 1.2, pixelRatio capped 1.5
```

---

## 2. Measured baseline

Headless Chrome (ANGLE/D3D11), 1600×900, after 25 s at the default DISTRICT view:

| Metric | Value |
|---|---|
| Loaded tiles | **0** |
| Pending tile loads | **153** |
| Buildings rendered | **0** |
| Draw calls | 27 |
| Visible content | ground plane, overview roads, water, parks, labels |

The screenshot is an empty dark map with floating label chips. This is not a
styling problem — **no building geometry ever arrives**.

---

## 3. Bottlenecks, in order of severity

### B1 — Tile streaming cannot converge at DISTRICT / FULL CITY *(critical)*

At LOD 1 the load radius is `8000 × (altitude/1200)`, capped at 25 km. At
district altitude that selects **hundreds to thousands** of 500 m tiles.
`MAX_CONCURRENT_LOADS = 2`, and each tile costs a 59 KB fetch, a synchronous
`JSON.parse`, and N × `ExtrudeGeometry` on the main thread. The queue is
rebuilt from scratch every 200 ms and re-sorted by distance, so tiles that were
mid-queue are constantly displaced. The result is a permanently saturated
pipeline that never produces a visible city.

**500 m tiles are simply the wrong primitive above ~1,500 m altitude.** No
amount of tuning concurrency fixes this; it needs a genuinely coarser
representation.

### B2 — No LOD 0 representation exists

`buildGlobalOverview()` draws ground + overview roads + water + parks. It never
touches `overviewData.buildingDensityBlocks`, and there is no baked city-scale
building layer. `LODLevel` is typed `0|1|2|3` but LOD 0 and LOD 1 both read the
same `data.lod1` arrays — they are not actually distinct levels.

### B3 — `mergeGeometries()` destroys shading information

`TileStreamer.mergeGeometries()` (line ~766) copies only `position` and
`index`, discards `uv` and material `groups`, then calls
`computeVertexNormals()`. Consequences:

- No UVs survive, so textures and any UV-driven facade detail are impossible.
- Normals are recomputed on the merged buffer. `ExtrudeGeometry` output is
  non-indexed, so this happens to yield flat per-face normals — correct, but
  accidental, and it breaks the moment an indexed geometry enters the merge.
- There is no per-vertex channel carrying building identity, height, or a
  wall/roof flag, so the shader has nothing to vary on. This is the direct
  reason buildings read as untextured extruded footprints.

### B4 — Lighting is flat and ambient-dominated

Day: `ambient 1.5` + `hemisphere 1.2` + `directional 3.0`. Roughly half the
illumination is directionless. Combined with a near-white palette
(`0xfffcf7`, `0xf5f1e6`, …) and exposure 1.2, walls facing away from the sun
are barely darker than walls facing it. There is no AO of any kind, so
building–ground contact and street canyons have no darkening at all.

### B5 — Roads are single-quad ribbons

`buildRoadsMesh()` emits one `PlaneGeometry` per segment at a fixed y-offset by
category (0.11–0.14 m). No joins between segments, no width hierarchy beyond
the source `width` field, no bridge/tunnel handling — Overture `level`/`layer`
metadata is not read at all. Roads therefore z-fight-adjacent flat lines rather
than a road network.

### B6 — `manifest.spatialExtent` is undefined *(latent bug)*

The generator never writes `spatialExtent`, so `getSpatialExtent()` silently
falls back to ±15,000 m. Actual data spans roughly ±20,000 m. Camera bounds and
the `HorizonCity` ring are consequently sized against the wrong extent.

### B7 — Per-frame work in the render loop

`CityViewport.animate()` runs every frame:
- `scene.traverse()` over the entire scene graph to apply layer visibility
- `camera.updateProjectionMatrix()` unconditionally
- `flightsGroup.clear()` followed by rebuilding every aircraft from new
  `CylinderGeometry` / `BoxGeometry` / `MeshBasicMaterial` — allocating and
  orphaning ~6 geometries and 3 materials per aircraft per frame

### B8 — Geometry is never disposed on cache eviction

`disposeGroup()` disposes geometries but not materials, and the `tileCache`
eviction path drops `InstancedMesh` instance buffers without releasing them.
Materials are shared so that part is fine, but long sessions still leak.

### B9 — Two dead rendering systems

`CityRenderer.createExtrudedBuildings()`, `createRoads()`, `createWaterways()`,
`createGreenAreas()`, `createInstancedTrees()` and `createLandmarks()` are never
called — `CityViewport` only constructs `CityRenderer` for its scene, camera and
renderer. `HorizonCity` generates 12,800 procedural boxes that violate the
"real data > fake geometry" rule and sit permanently in the scene.

---

## 4. What the data actually supports

| Need | Available? | Source |
|---|---|---|
| Real footprints | yes | `lod2.buildings[].points` (959,316) |
| Heights / stories | yes | `lod2.buildings[].height`, `.stories` |
| Road class | yes | `roads[].type` (motorway/trunk/primary/secondary/tertiary/service/footway) |
| Road width | yes | `roads[].width` |
| Bridges / levels | **no** | not present in the generated tiles |
| Roof shape / material | **no** | not extracted from Overture |
| Terrain elevation | **no** | all `y = 0` |
| Named landmarks | partial | `places_labels.json` (47,963 places, has names + positions) |

Bridges, roof types and terrain would each require re-running extraction against
the Overture source, which is not in the repository. Anything depending on them
has to be derived or curated rather than read.

---

## 5. Design direction

1. **Bake, don't stream, the coarse levels.** LOD 0/1 become pre-baked binary
   super-tiles built offline from the real footprints, so the client uploads
   buffers instead of triangulating polygons.
2. **Give geometry a shading channel.** Merge with an explicit per-vertex
   attribute pack (wall/roof flag, normalized height, per-building hash) so one
   shared material can produce facade, roof and AO variation without textures.
3. **Make light directional again.** Cut ambient, add a real sun, add cheap
   vertex-baked contact AO instead of a screen-space pass.
4. **Landmarks are curated, everything else is bulk.** ~20–40 hand-placed
   procedural landmarks over unchanged bulk building rendering.

---

# Post-implementation state

## Pipeline as built

```
DATA     public/overture_tiles_full/  6,940 source tiles (unchanged)
         public/hlod/                 120 baked super-tiles, gitignored
                                      `npm run bake` -> scripts/bake_hlod.ts
           │
TILE     altitude decides the representation:
           > 4000 m  FULL CITY      HLOD fabric only
           1800-4000 DISTRICT       HLOD fabric + relief
           600-1800  NEIGHBOURHOOD  HLOD + streamed tiles within 2.6 km
           < 600 m   STREET         HLOD + streamed tiles within 1.5 km
           │
FEATURE  HLOD  -> fetch .bin, zero parsing, buffer upload only
         tiles -> 4 Web Workers: fetch + JSON.parse + triangulate,
                  transferable typed arrays back to the main thread
           │
GEOMETRY per-vertex: position (i16 quantised for HLOD, f32 for tiles)
                     aPack u8x4 = hash | heightNorm | bakedAO | flags
         no normal attribute — FLAT_SHADED derives them per-fragment
           │
MATERIAL ONE shared MeshStandardMaterial for every building, patched via
         onBeforeCompile. Palette, roof/wall split, weathering, facade
         banding, contact AO, night windows and aerial perspective all
         derive from aPack. Replaced 10 bucketed materials.
           │
SCENE    AtmosphericSky | CityOverlay (roads/Gomti/parks) | HLODLayer
         | streamed tiles | LandmarkSystem | labels | aircraft pool
           │
LIGHTING 1 directional sun (low azimuth) + low ambient + hemisphere.
         Shadow frustum tracks the camera target and scales with altitude.
           │
POST     none. AO is baked per-vertex; haze is in-shader.
```

## Measured, headless Chrome / ANGLE D3D11 / RTX 4070 Laptop / 1600x900

| Scale | buildings | draw calls | triangles | frame p95 |
|---|---|---|---|---|
| Full City | 661,487 | 121 | 2.14 M | 4.7 ms |
| District | 207,503 | 74 | 2.49 M | 4.6 ms |
| Street | 297,200 | 206 | 2.07 M | 4.7 ms |
| Ekana hero | 70,903 | 95 | 0.96 M | 4.7 ms |

Baseline for comparison: 0 buildings, 153 pending tile loads, 27 draw calls.

Frame times are ceiling-limited in the harness (a flat 4.2 ms p50 everywhere),
so these establish "comfortably above target", not a precise ceiling.

## Bottlenecks resolved

B1 tile starvation, B2 missing LOD 0, B3 lossy merge, B4 flat lighting,
B6 wrong spatial extent, B7 per-frame allocations, B9 dead code — all closed.
B5 (roads) partially: ribbons and hierarchy done, vertical separation not.
B8 (disposal) improved but materials are shared and intentionally not disposed
per tile.

---

# Transportation pipeline

`data/lucknow_transportation_extracted.json` (34 MB, 133,757 features) is now the
authoritative source for every road and railway. `npm run transport` projects it,
clips it to the tile bounds, splits it across tiles and rewrites both
`overview.json` and all 6,940 `tile_*.json` road streams; `npm run bake` then
rebuilds the binaries. Buildings are never touched — `overture_buildings.geojsonseq`
is an unfetched LFS pointer, so the tiles are patched, not regenerated.

This closed three defects that predated it:

- **Unreproducible.** No committed script read the extract. `overview.json` had
  been produced out-of-band, so re-running `generate_overture_tiles.ts` would have
  silently discarded the real level/rail data.
- **Extent.** Overture returns whole features that merely touch the query box, so
  roads reached x = -98 km against a ±20 km city. Now clipped.
- **Tile assignment.** A road was filed under the tile containing its *first
  point*, so a 6 km road existed in one 500 m tile and nowhere else.

## Elevation is guarded, not trusted

The extract's `level` / `isElevated` cannot be believed at feature granularity.
Overture carries `level` as a *linearly referenced* attribute — valid over a
`between` fraction of the geometry — and the extractor flattened it, dropping the
range. Taken literally it puts 986 km of Lucknow in the air, including the
Varanasi–Sultanpur–Lucknow, Gorakhpur and Moradabad mainlines, which are at grade
on embankment.

`resolveElevation()` in `scripts/build_transportation.ts` separates the two
populations: `isElevated` with `level = 0` is a real per-structure OSM `bridge=yes`
tag (567 features, mean 79 m) and is trusted up to 1,500 m; `level > 0` is the
contaminated set and is trusted only below 400 m. Metro is exempt from the cap
because Lucknow Metro genuinely is a continuous viaduct. Result: **925 structures,
135.9 km** (89.2 km road, 46.7 km metro) instead of 986 km.

## Geometry

- **Flyovers** get a real ramp–hold–ramp profile per vertex (`buildElevationProfiles`
  in `ribbon.ts`), not a constant 6.8 m slab. Deck height follows `level`
  (7.5 / 13.0 / 18.5 m); approach gradient is 1:25. Features sharing an endpoint
  are treated as one continuous structure, so a flyover split across many Overture
  features does not ramp up and down at every join. Piers sample the profile and
  stop where the deck reaches grade; the old fixed-height version marched columns
  straight through the ramps.
- **Railways** are real permanent way: a trapezoidal ballast prism, sleepers and
  two running rails at the correct gauge (1,676 mm broad gauge for Indian
  Railways, 1,435 mm for the metro). Elevated rail gets a box girder with parapets
  and slab track instead of ballast.
- Elevated features are excluded from the derived river-bridge search, so nothing
  gets two decks.

Sleepers (531 km of track, 14 MB) live in `overlay_detail.bin`, fetched lazily the
first time the camera drops below 900 m. That keeps the blocking overlay load at
**10.3 MB**, down from 24 MB.

---

# Spatial correctness pass

## Road width — there is no real width to use

Overture's transportation schema carries `road_surface`, `road_flags`,
`subclass`, `level_rules`, `access_restrictions` and `speed_limits`, but **no
`width` and no `lanes`** — verified against both `data/overture_transportation.geojson`
(919 features, full property set) and the 33 MB extract, which has only
`id / subtype / class / name / level / isElevated / coords`. Nothing in the
pipeline discards a width; one was never available. Class estimation is
therefore the mechanism, not a fallback.

What was actually wrong was their size. The old values gave a 28 m motorway
corridor and a 17 m primary, which drove ribbons through the footprints of
buildings that legitimately front onto them. `ROAD_HALF_WIDTH` is now Indian
urban carriageway widths (motorway 22 m, trunk 18 m, primary 14 m, residential
5.6 m overall).

## Building / infrastructure suppression

`scripts/suppress_conflicts.ts` (`npm run suppress`). Overture buildings and
Overture transportation are digitised independently, so footprints sit in
carriageways, across railway yards and in the Gomti.

Runs **offline over the tiles**, so there is no runtime cost, no mask resolution
to trade off, and the HLOD bake inherits the identical result rather than
disagreeing with the streamed tiles.

Conservative by construction:

- a building is dropped only when its **area centroid** lies inside the
  corridor — buildings legitimately abut roads and clip a few metres into any
  corridor estimate, so any-overlap plus a buffer would delete every shopfront
  on every arterial;
- road corridors get **no buffer** beyond the carriageway;
- water and runway polygons are tested exactly, so the riverbank keeps its
  buildings;
- **elevated features are skipped entirely** — a flyover passes over the city
  and the buildings beneath it are real.

Result: 959,316 → 953,513 (5,803 removed, 0.60%) — water 3,247, roadway 1,918,
airfield 327, rail 311.

## Vegetation masking

`scripts/place_vegetation.ts` (`npm run vegetation`). The city shipped with
7,400 trees across 383 of 6,940 tiles, which is why it read as bare. Now
185,078 across 3,106 tiles:

- **parks** — jittered grid clipped to the real green-area polygon
- **verges** — avenue planting offset beyond the carriageway of arterials

The placement rules are deliberately generous and the **exclusion mask is what
makes them safe**: 85,776 candidates were rejected for falling on a road, on
ballast, in water, on the airfield, on a flyover deck, or inside a building.
Rendered through the existing per-tile `InstancedMesh` path, so citywide
vegetation costs four instanced draws per tile.

Both passes share `scripts/lib/spatialIndex.ts`, so suppression and planting
cannot drift into disagreeing about where a road is.

## Preprocessing order

```
npm run transport    # roads/rail from the extract -> overview.json + tiles
npm run suppress     # remove buildings inside infrastructure
npm run vegetation   # plant trees against the exclusion mask
npm run bake         # HLOD super-tiles + overlay binaries
```

---

# Startup

`src/data/resourceCache.ts` gives every caller the **same promise**, so it is a
parse cache as much as a request cache. The startup profile had
`places_labels.json` (2 MB, 47,963 records) fetched **four times** — LabelManager
and SearchIndex want it independently, and React StrictMode double-invokes the
effect that starts them. Four copies of a 2 MB download is bad; four synchronous
`JSON.parse` calls of it during startup is what made the tab stop responding.

| resource | before | after |
|---|---|---|
| places_labels.json | 4 | 1 |
| road_labels.json | 4 | 1 |
| overlay.bin | 2 | 1 |
| manifest.json | 2 | 1 |
| hlod_manifest.json | 2 | 1 |

TTFC (first frame carrying real building geometry) 1,422 ms → ~1,150 ms on the
dev build, ~6 MB less transfer, zero long tasks. Failed loads are evicted so one
flaky startup cannot poison the app for its lifetime; entries are otherwise
never evicted, which is deliberate — this holds a fixed handful of startup
manifests, not tile traffic, which stays bounded by the streamer's own cache.

---

# Visual profiles

Three genuinely different looks, not tints of one.

**Natural White** — the neutral reference: white sun, faintly cool sky fill,
neutral ground bounce.

**Warm White** — late golden afternoon. This used to be nearly identical to
Natural White because a golden sun was paired with a *cool blue* ambient
(`0xc3d8ef`); a warm key cancelled by a cold fill reads as neutral. Every term
is warm now, with the exposure lifted.

**Cyberpunk** — deep indigo environment, cyan key, magenta ground bounce, neon
windows via the shader's `uCyber` term. It was previously broken rather than
subtle: a 1.25 cyan hemisphere flooded the ground into a flat teal sheet, and
the mode reused the *night* building palette in daylight so every building was a
black silhouette. Fixed with dedicated cyber-day wall **and roof** palettes (the
roof palette did not exist — cyber day selected the night roof stock, and roofs
are what you see from altitude), a much weaker hemisphere, and **style-aware**
ground/park/water/tree colours. Those surfaces were the actual flood: one
enormous ground polygon tinted cyan covers the whole frame.

`__LENS.setStyle(style)` switches profile without React state, for validation.

## Not implemented

- **Live trains.** Adapter and UI states exist; no free API tier available.
- **Screen-space AO and bloom.** Contact shading is baked per-vertex instead.
- **Terrain.** All geometry sits at y = 0; no elevation source exists.
- **True `level` ranges.** Recovering them needs the Overture parquet, which is
  not in the repository; the length guard above is the stand-in.
- **Real road width.** Not in Overture's schema at all (see above). Class
  estimation is the mechanism, not a placeholder for data that exists.
- **Underpasses.** Deliberately not faked. The extract has no tunnel or
  below-grade flag of any kind — `level` is only ever ≥ 0 and there is no
  `road_flags` in the extract — so there is nothing to drive vertical
  separation below grade. Re-extracting with `road_flags` retained would make
  this implementable.
- **Airport environment.** Runway and taxiway centrelines are used as an
  exclusion mask for buildings and trees, but there is no runway surface,
  markings, apron, terminal or stand geometry yet.
- **Static trains and static aircraft.** Not started. Both need external models
  with verified licences, optimisation and LODs.
- **Rail LOD tiers.** The track is one representation at all scales rather than
  corridor → parallel tracks → bed → sleepers by distance.
- **Flyover segment grouping.** Named structures are matched and detailed per
  feature; adjacent segments of one structure are not yet merged, so railings
  and supports can duplicate where Overture split a structure.
- **Streetlight illumination at altitude.** Lamps exist as instanced geometry
  derived from real road classes, but do not yet cast readable light pools.
