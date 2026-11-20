# Lucknow Lens 3D city: technical reconnaissance

This is a read-only investigation of the code and data as they are in the repository on 16 November 2026 (commit `785f6b1a`). It describes what exists. It does not propose a redesign.

**How the numbers were obtained.** Statistics marked *measured* were computed by a script that read every file in `public/overture_tiles_full/` (6,940 tile files), or the raw Overture sample in `data/overture_buildings.geojson`. Anything not measured is marked *unverified*.

**Screenshots.** The screenshots mentioned in the task were not attached to this session, so the visual diagnosis in section 8 is based on the code and on what the map looked like during earlier testing in the browser.

---

## 1. Existing architecture

| Layer | What it is | Where |
|---|---|---|
| Frontend | React 19, Vite 6, Tailwind v4, motion/react | `package.json`, `src/` |
| 3D engine | three.js `^0.185.1` (r185), raw three, not react-three-fiber | `src/city/*`, `src/components/3d/CityViewport.tsx` |
| Map shell | `MapApp.tsx` (UI, preferences, layers) mounts `CityViewport.tsx` (all three.js objects) | `src/MapApp.tsx`, `src/components/3d/CityViewport.tsx` |
| Landing site | A separate React layer in front of the map. It loads the map only on demand. | `src/App.tsx`, `src/landing/*` |
| Backend | One Express app, used only for live data (flights, weather, air quality, news, analyst). It serves no map data. | `server.ts`, `server/providers/*` |
| Offline pipeline | Node/tsx scripts that turn Overture downloads into tiles and binary buffers | `scripts/*.ts` |
| Hosting | Vercel. The app and API are on project `terralyt` (`terralyt-six.vercel.app`). The roughly 700 MB of map data is on a second project, `terralyt-data`, which the app proxies to. | `scripts/build_vercel.mjs`, `package.json` scripts `live` and `live:data` |
| Storage | No database. All map data is static files: JSON and custom binary. | `public/overture_tiles_full`, `public/hlod`, `public/overture`, `public/geo` |

Objects created in `CityViewport.tsx` (lines 139 to 210): `CityRenderer`, `TileStreamer` (which creates `HLODLayer` and `CityOverlay`), `LabelManager`, `AtmosphericSky`, `CameraController`, `EmergencyVisualManager` and `CampusAmbienceManager`.

## 2. Current 3D rendering pipeline

**Initialisation.** `src/city/renderer.ts`, class `CityRenderer`:
- `WebGLRenderer` with a logarithmic depth buffer.
- MSAA and pixel ratio come from `src/city/deviceProfile.ts` (`getDeviceProfile()`), which picks a capability tier.
- `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`.
- `scene.background = null`, because the sky dome is the background.
- There is no post-processing chain: no EffectComposer, SSAO, bloom or SMAA in `src/city`.

**Coordinates.** `src/geo/projection.ts`:
- An equirectangular projection around `CENTER_LAT = 26.84997035`, `CENTER_LON = 80.95005255`.
- `M_PER_LAT = 111320` and `M_PER_LON = 111320·cos(lat)`.
- x is east and z is south (`z = -(lat - CENTER_LAT)·M_PER_LAT`). Units are metres, and Y is up with the ground at 0.
- `scripts/generate_overture_tiles.ts` (`project()`, line 55) uses the same formula.

**Scale-dependent representation.** `src/city/tileStreamer.ts`:
- Altitude bands are `ALT_DISTRICT = 4000`, `ALT_NEIGHBOURHOOD = 1800` and `ALT_STREET = 600`.
- **Full city and district scale:** `HLODLayer` (`src/city/hlodLayer.ts`) draws baked 4 km super-tiles from `public/hlod/s_X_Z.{f,r}.bin`. There are 60 super-tiles, each with a `.f` (fabric) and an `.r` (relief) file, 224 MB in total.
  - The *fabric* stream is every footprint drawn as a flat roof polygon at its height.
  - The *relief* stream is full extrusions for buildings with height ≥ 21 m and area ≥ 1600 m² (`scripts/bake_hlod.ts`, `RELIEF_MIN_HEIGHT` and `RELIEF_MIN_AREA`, lines 64 to 65).
  - Positions are quantised Int16. The header starts with `'LHL0'`.
- **Neighbourhood and street scale:** 500 m JSON tiles from `public/overture_tiles_full/tile_X_Z.json`.
  - They are fetched and turned into geometry in a Web Worker (`src/city/tileWorker.ts`) and returned as transferable typed arrays.
  - `STREAM_RADIUS` is `{1: 3200, 2: 2600, 3: 2600}` metres, multiplied by a device factor. Tiles unload beyond 1.5× the radius (`updateStreamedTiles`, line 537).
  - LOD 2 and LOD 3 both read `data.lod2`, so the geometry is identical (`CONTENT_TIER`, line 61).
- **City-wide overlay:** `CityOverlay` (`src/city/cityOverlay.ts`) draws the major roads, water, parks and bridges. It is resident, read from the prebaked `public/hlod/overlay.bin` (12.3 MB) and `overlay_detail.bin` (22.4 MB). Those were built offline by `src/city/overlayGeometry.ts`.

**Draw-call strategy.**
- Buildings share one material (`BuildingMaterialSystem`) and carry no normals.
- Each vertex has a packed `aPack` u8×4: hash, normalised height, baked AO and flags.
- Trees are drawn with per-tile `InstancedMesh`.

## 3. Overture data and actual attribute availability

### 3a. What was downloaded

- **Download step.** `scripts/generate_overture_tiles.ts` runs `overturemaps download --bbox … -f geojsonseq` for the buildings, transportation (segment), places, water and land_use themes (lines 294 to 305).
- **Release.** The state files record Overture release `2026-07-22.0`.
- **The raw full-city files are not in the working tree.** `data/overture_buildings.geojsonseq` is a 134-byte Git LFS pointer to a 470,209,781-byte object. The other `*.geojsonseq` files are pointers too. The full source cannot be re-inspected without pulling LFS.
- **What can be inspected:**
  - `data/overture_buildings.geojson`, a 4,951-building sample over bbox 80.935 to 80.955 E and 26.84 to 26.855 N (central Lucknow)
  - `data/lucknow_transportation_extracted.json` (34 MB)
  - the generated tiles

### 3b. Building attributes in the source (sample of 4,951 buildings, *measured*)

| Attribute | Non-empty | Share |
|---|---|---|
| `height` | 0 | 0% (the key is absent in every record) |
| `num_floors` | 9 | 0.18% |
| `roof_shape` | 9 | 0.18% |
| `facade_color` | 2 | 0.04% |
| `facade_material` | 2 | 0.04% |
| `class` | 87 | 1.8% |
| `subtype` | 96 | 1.9% |
| `names` | 23 | 0.5% |
| `level` | 3 | 0.06% |
| `has_parts` | 4,951 | present on all (value not tallied) |

Source datasets in the sample: Google Open Buildings 3,930 (79%), Microsoft ML Buildings 781 (16%), OpenStreetMap 240 (5%). The machine-learned footprints carry geometry only, which is why almost no attributes exist.

*Unverified:*
- city-wide coverage of these attributes, because the 470 MB source is an LFS pointer
- whether Overture `building_part` features were ever downloaded: the script downloads `-t building` only, and no `building_part` file exists in `data/`

### 3c. What survives into the tiles (*measured* over all 6,940 tiles)

- **Buildings:** 953,513 in `lod2`.
  - Keys per building: `id, points, height, stories, color`. Nothing else is carried: no class, roof shape, floors or facade fields.
  - Average ring length: 5.4 vertices.
  - Only the outer ring of the first polygon is kept. `MultiPolygon` uses `coordinates[0][0]` (line 141), so holes and extra parts are dropped.
- **Heights:**
  - 953,424 of 953,513 buildings (**99.99%**) have an integer height between 12 and 26 m. That is the synthetic fallback `height = 12 + (hash % 15)` (generator, lines 161 to 164).
  - Only 89 buildings have any other height. Histogram: `<6 m`: 2, `6–12`: 64, `12–26`: 953,434, `27–49`: 6, `50+`: 7.
- **Building IDs and hash:**
  - Building ids look like `bld-0.9642886679150586`. The generator reads `props.id`, but the Overture CLI puts `id` at the feature top level, so it falls back to `Math.random()`.
  - So the "deterministic" hash that drives height and palette is random per generation run, though stable afterwards.
- **`color`:** set by the generator from hash parity (`#cbd5e1` or `#94a3b8`). It is not from source data.
- **Roads:** 170,552 segments.
  - Classes: residential 96,127; unknown 29,394; tertiary 14,758; service 12,459; unclassified 6,765; trunk 2,534; secondary 1,881; primary 1,476; motorway 696; standard-gauge rail 1,700; footway 1,105; living_street 836; track 292; path 203.
  - 1,378 segments have `level > 0` (elevated); 6,778 are named.
- **Road width** is not from source. It is assigned per class: 6 m for 132,937 segments, and 2.4 to 28 m for the rest. The tile values (6, 9, 12, 16, 17, 22, 28, 4.8, 2.4 and 5.6) differ from the generator's table (15, 10, 8, 6, 2.5), so a later pass rewrote them. That pass is presumably `scripts/build_transportation.ts`; *unverified*.
- **Green areas:** 1,480 polygons, from land_use subtypes `park`, `forest`, `grass` and `nature_reserve` only (line 251). Other land use (residential, farmland, commercial and so on) is discarded.
- **Water:** 527 features, each with a fixed `width: 35`.
- **Places:** 51,222 in tiles. A separate `places_labels.json` holds 47,963 labels.
- **Trees:** 401,573 points `{x, y, z, scale}`. These are **generated**, not observed: `scripts/place_vegetation.ts` places them in parks, along road verges, on the riverbank and on "open ground", then masks them out of roads, water and footprints.

### 3d. Source, derived or generated

| Attribute | Source data | Derived by pipeline | Generated or invented |
|---|---|---|---|
| Footprint outline | ✔ (outer ring only) | | |
| Building height | ✔ for about 89 buildings (0.01%) | | ✔ 12 to 26 m from a hash for 99.99% |
| Floors (`stories`) | | ✔ `ceil(height/3.5)` | (inherits the invented height) |
| Building class in shader | | ✔ from height ≥ 25 m or area ≥ 1200 m² (`buildingGeometry.ts`, `buildBuildings`) | |
| Wall and roof colour | | | ✔ palette index from hash (`buildingMaterial.ts`) |
| Roof shape, facade | not carried, and about 0.2% in source | | flat roof always |
| Road class, name, level | ✔ | | |
| Road width | | ✔ from class | |
| Bridges where level is 0 | | ✔ road × river intersection (`bridges.ts`, `overlayGeometry.findCrossings`) | deck height inferred |
| Named bridge and flyover detail | name match ✔ | | archetype geometry (truss, girder, barrage, flyover) hand-curated (`namedStructures.ts`) |
| Trees | | | ✔ all 401,573 |
| Night windows | | | ✔ shader hash (`buildingMaterial.ts`, `litBldg = step(0.42, hash)`) |
| Terrain elevation | not used | | the ground is flat at Y = 0 |

## 4. Building geometry generation

`src/city/buildingGeometry.ts`, `buildBuildings()`, is shared by the worker and mirrored in `scripts/bake_hlod.ts`.

- `cleanRing()` removes duplicate points, and `triangulate()` uses its own ear-clipping for roofs.
- **Walls.** Each ring edge becomes one quad from Y = 0 to Y = height. There is no plinth, setback, parapet, floor slab, overhang or eave.
- **Roof.** One flat cap at `height`.
- **Footprint filtering.** Footprints under 8 m² are skipped. Height is clamped to the range 2 to 499.
- **Packed attributes:**
  - byte 0: hash & 0xff
  - byte 1: hNorm = height/80
  - byte 2: AO, a fixed 96 at the base and 255 at the top (not computed from neighbours)
  - byte 3: flags = isRoof | class<<1 | orient<<3
  - `orient` is the angle of the longest edge, quantised to 32 steps.
- **Facades** are procedural in the fragment shader (`buildingMaterial.ts`, `FRAG_PARS` from line 134):
  - palette lookup by hash, with ±4% tint jitter
  - a height-based cool/warm gradient and vertical grime
  - floor banding at about 3.2 m along the longest edge, faded out at city scale
  - roof grain noise
  - baked AO, and window panes
- **Normals.** Reconstructed per fragment from screen-space derivatives; no normal attribute is stored.
- **Textures.** No texture maps are used. There are no `TextureLoader`, `.glb`, `.gltf` or `.ktx2` references under `src/`, and no such files under `public/`.
- **Landmarks.** None of Lucknow's monuments has a hand-built model:
  - Bara Imambara, Rumi Darwaza, the Clock Tower and the rest are drawn from their Overture footprints like any other building.
  - Only labels mark them (`labelManager.ts`).
  - `campusAmbience.ts` adds canvas-texture campus badges and landscaped quads for six named campuses.

## 5. Roads, terrain and vegetation

- **Roads:**
  - `src/city/ribbon.ts`: `appendRibbon` makes polyline strips with mitred joins (`MAX_MITER = 2.6`).
  - `classifyRoad` and `buildElevationProfiles` give real elevated decks, with `deckHeightFor(level)` and a 25 m-per-metre ramp gradient constant.
  - Railways get ballast and rail geometry (`railGaugeFor`).
  - Streamed tiles add local roads in the worker (`buildRoadRibbons`, `buildStreetlights`).
  - Roads are flat colour per class. Day and night colours are tables in `tileStreamer.ts` and `cityOverlay.ts`. There are no lane markings, kerbs, footpaths or texture.
- **Bridges and flyovers:**
  - generic deck, piers (32 m spacing) and rails: `overlayGeometry.appendBridge`
  - named detail for 28 regex matches: `namedStructures.ts`, `NAMED_STRUCTURES`, lines 33 to 72, covering Pucca Pul, Gomti Barrage, the Kukrail bridges and about 20 flyovers or road-over-bridges
- **Water.** Overture waterway lines are ribboned at 35 m. Polygons are triangulated flat. No water shader with reflection or waves was found; *partly unverified*, because the shader details in `cityOverlay.ts` were not fully read.
- **Terrain.** No terrain or ground mesh exists in `src/city`, and `CAMERA_CONFIG.GROUND_Y = 0`.
  - `public/geo/lucknow_dem.json` (a 31×31 Copernicus GLO-90 grid, 102 to 132 m) exists but is used only by the landing page's Geography tab, not by the 3D map.
  - Below the geometry the viewer sees the sky dome's below-horizon colour (`atmosphericSky.ts`, `elevation = dir.y`) blended with fog.
- **Vegetation.** Four instanced prototypes in `tileStreamer.buildTreePrototypes()`, about lines 230 to 250:
  - a 5-sided `CylinderGeometry` trunk
  - an `IcosahedronGeometry(3.4, 1)`
  - a `ConeGeometry(1.9, 8.5, 6)`
  - a `SphereGeometry(4.2, 7, 5)`

  All use plain `MeshStandardMaterial`.
- **Land surface.** Only parks, forest, grass and nature reserve are drawn. There is no surface for residential plots, fields, bare earth, sand banks or paved yards.

## 6. Day and night rendering

- **Lights.** `renderer.ts`, `setupLighting()` and `applyDayNightState()`, lines 78 to 186:
  - one `DirectionalLight` (sun, at a fixed `SUN_OFFSET = (3800, 2350, 1900)`, about 38° up)
  - one `AmbientLight`
  - one `HemisphereLight`
- **Presets.** `applyDayNightState(night)` picks from 6 presets: warm, clear and cyberpunk, each with a day and a night version. Each sets sun colour and intensity, ambient, hemisphere and exposure. For example, warm night is sun `0xffc68a` at 1.1, ambient 1.9, hemisphere 1.7 and exposure 1.6.
- **Fog.** `FogExp2` with density **0**, so it is effectively disabled. In the shader, the aerial-perspective haze was "removed entirely per user request" (`buildingMaterial.ts`, around line 118).
- **Shadows.** Off by default (`shadowMap.enabled = false`, line 49). They are enabled adaptively only at low altitude on capable devices, with a 2048² PCF map.
- **Transition.** `src/city/sceneTween.ts` snapshots every light, material uniform and exposure, applies the new state, then interpolates for `DAY_NIGHT_SECONDS = 2.6`. The sky `AtmosphericSky.setBlend` is tweened alongside.
- **Night building look.** All shader-side, in the `uNight > 0.01` block, about line 255:
  - 58% of buildings are lit, from `step(0.42, hash)`
  - windows are procedural cells with one desaturated lamp colour
  - AO strength is reduced at night
- **Night streets.** Lamp emissive 5.2, additive glow billboards (`PlaneGeometry(7.2)`) and ground pools (`PlaneGeometry(15)`), only at street scale (`LAMP_*` constants in `tileStreamer.ts`, around line 69).
- **Sky.** `atmosphericSky.ts`: a camera-following inverted sphere with FBM clouds and hashed stars. Day zenith is `0x3b82f6` and horizon `0xd6e5f0`; night zenith is `0x050c1a` and horizon `0x0c1628`.
- **UI grade.** The map UI also adds a CSS warm grade overlay in `MapApp.tsx`.

## 7. Existing assets and capabilities

**Present and used**
- 953k real footprints, baked into the HLOD and the JSON tiles.
- 170k road segments with class, level and name. 1,378 are elevated with real deck profiles.
- 28 named bridge and flyover archetypes.
- 527 waterways and 1,480 green polygons.
- 401k generated trees.
- 48k place labels and road labels.
- The worker-based streaming system, binary HLOD format and device-tier budgets.
- Scene tweening and the procedural sky.
- Live data layers: flights as an instanced aircraft model built from boxes in `CityViewport.tsx`, plus weather and emergency-services markers.

**Present but not used by the 3D map**
- `public/geo/lucknow_dem.json`, the terrain DEM, which is coarse at 31×31.
- `src/city/buildingHeightEstimator.ts` (`estimateBuildingHeight`), a richer heuristic using area, aspect and properties. Its only caller is `src/osm/overtureParser.ts`. The live tile pipeline does not use it.
- `public/lucknow_tiles/` (297 MB, 8,327 files), an older dataset read only by `scripts/validate_dataset.ts`. It is not deployed.
- `public/overture_tiles_test/` (7.6 MB), which is unused.
- Overture `num_floors`, `roof_shape`, `facade_*` and `class` where they exist (about 0.2 to 2%). The generator reads `num_floors` but drops the rest.
- Land-use subtypes other than parks.
- The `has_parts` flag on buildings, with no building-part geometry.

**Not present:** satellite or aerial imagery, photogrammetry or 3D Tiles, landmark models, texture atlases, PBR material maps, environment maps or an HDRI, and any GLTF/KTX2 loader path.

## 8. Visual problems and their technical causes

| Symptom | Cause in this code or data |
|---|---|
| Buildings read as uniform cuboids | Every building is one prism with a flat cap (`buildBuildings`). The source footprints are mostly machine-learned (95% in the sample) and simplified, averaging 5.4 vertices. No building parts, setbacks or parapets exist. |
| Height and density look wrong | 99.99% of heights are `12 + hash%15`, a uniform 12 to 26 m. That makes the whole city a flat-topped field of 4 to 8 storey blocks, while real Lucknow is mostly 1 to 3 storey low-rise with few towers. Low old-city fabric and the real high-rises are both missing. |
| Skyline "relief" is arbitrary | Relief qualification needs height ≥ 21 m, so it depends on the random hash, not on real tall buildings. |
| Roofs lack detail | One flat cap per building. The shader adds only a ±4% gravel grain (`roofGrain`). There are no water tanks, stair cabins, parapets, solar panels or terraces, which typify Indian rooftops. |
| Repetitive and noisy colours | Colour is chosen from an 8-entry palette by hash per building (`paletteIdx`). With random hashes, neighbours change colour arbitrarily, which reads as confetti or noise rather than district-coherent material. |
| Ground looks artificial or absent | There is no ground mesh or land-cover. Unclassified land shows the sky or fog colour beneath, and roads are flat colour bands of class-assigned width. Only 1,480 parks are drawn, and other land use is discarded by the generator (line 251). |
| Flat terrain | Y = 0 everywhere. The DEM (a 30 m relief range) is unused, so the Gomti has no banks or floodplain shape. |
| Trees look generic | There are four primitive prototypes. All 401k are generated positions, not observed canopy. |
| Day does not look like an Indian city | No haze (fog density 0 and shader haze removed), even though North Indian daylight is typically hazy and warm. The sun angle is fixed and there are no default shadows, so the massing flattens. A clean blue-zenith sky (`0x3b82f6`), a cool ambient (`0xb2c8dc`) and pastel palettes read as a generic Western render. |
| Night looks too dark or unnatural | Light comes only from emissive window cells on a hash-selected 58% of buildings, plus street-scale lamps. Lamps are hidden above street scale, so mid and high altitudes see only windows and a navy sky. There is no bloom, and no city glow on the ground or sky. Commercial streets, markets and monuments get no special lighting. |
| Landmarks are indistinguishable | No monument models. Bara Imambara and the others are extruded footprints with random heights in the same 12 to 26 m band. |
| Whole system | All of these combine. The data, at 99.99% invented heights and no attributes, limits fidelity first. The geometry (prisms only) and the material (hash palettes, no textures) amplify it. Lighting (no haze, no default shadows, sparse night light) removes depth cues. |

## 9. Performance and architectural constraints

**Data volumes** (deployed):
- `overture_tiles_full`: 474 MB, 6,944 files
- `hlod`: 224 MB, 120 super-tile files plus the 2 overlay buffers and a manifest
- `overture`: 3 small GeoJSON files

The app deploy is about 25 MB.

**Current constraints:**
- **Hosting.** Vercel's free tier allows only 5,000 file uploads a day per account. That is why the data project is separate and uploaded as one archive. Adding tens of thousands of new tile files (for example 3D Tiles) would hit this limit. Bandwidth limits on the free tier are a risk for heavy assets; *unverified for actual traffic*.
- **No server-side processing at request time.** Data is static. Any new data has to be baked offline with the `scripts/*` pipeline, which runs with `--max-old-space-size=8192`.
- **The raw source is in Git LFS.** Re-running the generator needs `git lfs pull` or a fresh Overture download.
- **Mobile.** `deviceProfile.ts` already cuts pixel ratio, MSAA, workers, stream radius and lamp glow on phones. The comment there reports about 12 fps before those cuts; *unverified figure*.
- **Rendering.** WebGL only: no WebGPU path and no post-processing. The logarithmic depth buffer is required for the 20 m to 60 km camera range (`CAMERA_CONFIG`), and it disables some depth-based effects unless they are adapted.
- **One shared building material.** Per-building variation is limited to what fits in 4 bytes (`aPack`). New per-building attributes, such as real class, roof type or material, would need a format change in three places that must stay in sync: `buildingGeometry.ts`, `scripts/bake_hlod.ts` (HLOD binary format `LHL0`) and the worker.

**Can large textured meshes or 3D Tiles fit?**
- three.js r185 can load GLTF and KTX2 through the examples loaders, but none are wired in.
- A 3D Tiles renderer would be a new dependency. None exists in `package.json`.
- The camera (`cameraController.ts`) is a custom orbit controller in the local metre frame, so any external tileset must be placed with `projection.ts`. That is an equirectangular projection, not ECEF, so alignment of global-coordinate data needs a transform.
- *Feasibility and performance are unverified.*

**What would break easily:**
- Labels, search, the camera presets ('window' and others), flights, emergency markers and metro stations all use `projection.ts` and Y = 0 ground. Adding terrain height means updating the placement of each.
- `SceneTween` snapshots material uniforms, so new materials need to expose tweenable values or the day/night transition will pop.
- The deploy split (`build_vercel.mjs`) proxies only the `/overture_tiles_full`, `/overture` and `/hlod` paths. New data folders need adding to `DATA_DIRS` and to the proxy route.

## 10. Missing data and capabilities

Some of these could be derived from existing data or generated procedurally rather than sourced.

- **Geographical data:**
  - real building heights or floor counts (99.99% missing in the tiles)
  - land cover for the whole area: residential, agricultural, bare, paved
  - real tree canopy
  - an adequate DEM (the present one is 31×31 at about 1 km spacing)
  - Gomti bank and floodplain shape
  - plot or compound boundaries
- **Aerial imagery:** none at all. No orthophoto for ground texture or roof colour.
- **3D geometry:**
  - building parts and roof shapes
  - photogrammetry or 3D Tiles of the city
  - landmark models (imambaras, Rumi Darwaza, the Clock Tower, the Residency, Vidhan Sabha)
  - street furniture
- **Textures and materials:**
  - facade and roof texture sets
  - PBR maps
  - an environment map
  - road surface and marking textures
  - water normal maps
- **Architectural detail:** Indian-rooftop elements (tanks, parapets, stair cabins), balconies, chhajjas, jali, arches, and plinth and boundary walls.
- **Rendering capabilities:**
  - post-processing: SSAO, bloom, colour grading, TAA or SMAA
  - atmospheric scattering or haze tuned for the region
  - a time-of-day sun path
  - default shadows at more altitudes
  - night light pollution and glow
  - water reflection
- **Performance infrastructure:**
  - texture compression (KTX2/Basis)
  - mesh compression (Draco or meshopt)
  - a CDN or bucket hosting without per-file upload caps
  - a tileset format with screen-space-error LOD (current LOD is altitude bands plus radius)

## 11. Important source files and entry points

| File | Role |
|---|---|
| `src/components/3d/CityViewport.tsx` | Creates every three.js system; the main loop, picking and flights |
| `src/MapApp.tsx` | Map UI, preferences, layer toggles, warm grade overlay |
| `src/city/renderer.ts` | `CityRenderer`: renderer, camera, lights, day/night presets, adaptive shadows |
| `src/city/tileStreamer.ts` | Altitude LOD, tile streaming, trees, lamps, road colours |
| `src/city/tileWorker.ts` | Off-thread tile fetch and geometry (roads, lights, areas, buildings) |
| `src/city/hlodLayer.ts` | Binary super-tile loader (fabric and relief) |
| `src/city/buildingGeometry.ts` | Footprint triangulation, extrusion, `aPack` packing |
| `src/city/buildingMaterial.ts` | The single building shader: palettes, facade, AO, night windows |
| `src/city/cityOverlay.ts`, `overlayGeometry.ts`, `ribbon.ts`, `bridges.ts`, `namedStructures.ts` | Roads, water, parks, bridges, flyovers |
| `src/city/atmosphericSky.ts` | Sky dome, clouds, stars |
| `src/city/sceneTween.ts` | Day/night interpolation |
| `src/city/cameraController.ts`, `cameraPresets.ts` | Camera limits and presets |
| `src/city/deviceProfile.ts` | Per-device budgets |
| `src/city/labelManager.ts` | Landmark and road labels |
| `src/geo/projection.ts` | The one lat/lon ↔ metres projection |
| `scripts/generate_overture_tiles.ts` | Overture download to 500 m JSON tiles (synthetic heights at lines 161 to 164) |
| `scripts/build_transportation.ts` | Road and transport extraction (`npm run transport`) |
| `scripts/place_vegetation.ts` | Generated trees (`npm run vegetation`) |
| `scripts/bake_hlod.ts` | HLOD and overlay binary bake (`npm run bake`) |
| `scripts/build_vercel.mjs` | Deploy packaging and data proxy |

Pipeline order (from the script comments): generate tiles → `npm run transport` → `npm run vegetation` → `npm run bake`.

## 12. Unknowns that could not be verified

- **City-wide source attributes.** The 470 MB building source and the other `geojsonseq` files are Git LFS pointers, so coverage of height, floors, roof and facade fields was measured only on the 4,951-building central sample.
- **Building parts.** It is unknown whether Overture has `building_part` features for Lucknow; none were downloaded.
- **The 89 non-synthetic heights.** It was not confirmed whether they came from Overture `height` or `num_floors`, or from a later pass.
- **Road widths.** The step that rewrote the generator's widths into the tile values (presumably `build_transportation.ts`) was not traced line by line.
- **Water.** The water material and shader details in `cityOverlay.ts` were not fully read.
- **Performance.** Real frame times, draw-call counts, GPU memory and load times were not measured in this pass, and no figures are claimed.
- **Hosting limits.** Vercel free-tier bandwidth behaviour under real traffic is unknown.
- **Imagery licensing.** Whether any licensed aerial imagery or 3D data for Lucknow is available to the project is unknown.
