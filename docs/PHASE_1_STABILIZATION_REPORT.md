# Lucknow Lens — Phase 1 Stabilization Report

**Execution Date:** November 19, 2026  
**Environment:** Windows (x64), Node.js v24.18.0, npm 11.16.0, TypeScript 5.8.2, Three.js 0.185.1, React 19.0.1  
**Scope:** Phase 1 Critical Bug Fixes & Stabilization  

---

## 1. Executive Summary

Phase 1 critical bug fixes and stabilization have been executed and verified. All five core technical tasks were completed with controlled, targeted changes:
1. **Build Pipeline Decoupled:** Frontend development (`dev`) and production builds (`build`) no longer trigger expensive, memory-intensive offline HLOD baking (`bake_hlod.ts`). The commands are now cleanly separated into development (`dev`), client/server production build (`build`), conditional baking (`bake:if-missing`), and full pipeline (`build:full`).
2. **AI Analyst Runtime Crash Resolved:** In `src/MapApp.tsx`, `handleExecuteAIAction` now validates incoming AI actions against an allowlist of valid live layers, rejects invalid or out-of-bounds latitude/longitude coordinates, computes exact 3D coordinates via dynamic equirectangular projection (`project(lat, lon)`), and handles unmapped layers without crashing React.
3. **Elevation-Aware Road Graph Implemented:** In `src/navigation/roadGraph.ts`, road graph node snapping now incorporates elevation buckets (`sy = y < 2.0 ? 0 : round(y / 4.0) * 4.0`). 3D elevation profiles from `buildElevationProfiles` are integrated into graph construction, ensuring flyover decks ($Y \approx 7.5\text{m} - 8.5\text{m}$) and surface streets ($Y = 0.0\text{m}$) receive distinct graph nodes while preserving legitimate ramp connections at ground level.
4. **One-Way Road Restrictions Enforced:** Road directionality attributes (`oneway`, `isLink`, `motorway`, `roundabout`) are now strictly enforced during graph edge construction. One-way connectors and divided carriageways admit only forward traversals, reverse one-way streets admit reverse traversals, and standard residential/secondary roads remain bidirectional. A* pathfinding strictly respects edge directions.
5. **Complete WebGL Resource Disposal Implemented:** `CityRenderer.dispose()` in `src/city/renderer.ts` and `CityViewport.tsx` now perform complete traversal disposal of scene geometries, material textures (diffuse, normal, roughness, emissive), shadow map render targets, renderer lists, canvas DOM detachment, and force WebGL context loss to prevent GPU memory leaks upon unmounting.

---

## 2. Problems Fixed

| # | Component / Subsystem | Bug / Issue Description | Severity | Fix Summary |
|---|---|---|---|---|
| 1 | Build Pipeline (`package.json`, `scripts/bake_hlod.ts`) | `npm run build` and `npm run dev` automatically triggered `prebuild` which called `npm run bake` (allocating 8GB RAM to process 6,944 tiles), locking the machine and preventing normal builds. | **Critical** | Removed automatic `prebuild` trigger. Split into `dev`, `build`, `bake:if-missing`, and `build:full`. Added memory pre-checks in `bake_hlod.ts`. |
| 2 | City Analyst (`src/MapApp.tsx`) | Malformed coordinates, invalid actions, or missing registry keys (e.g. `'weather'`) caused `highlightPOI.id` to throw `TypeError: Cannot read properties of undefined`, unmounting the React app. | **Critical** | Added strict validation, allowlisted layer validation, coordinate range checks, dynamic projection `project(lat, lon)`, and outer `try/catch`. |
| 3 | Navigation Engine (`src/navigation/roadGraph.ts`) | Road graph node snapping `getSnapKey(x, z)` ignored $Y$ elevation. Flyovers at $Y=8.5\text{m}$ and surface roads at $Y=0\text{m}$ merged into identical nodes, allowing vehicles to teleport vertically. | **High** | Added elevation snapping bucket `sy`, incorporated `buildElevationProfiles`, separated surface and deck nodes, and preserved ground-level ramp joins. |
| 4 | Navigation Engine (`src/navigation/roadGraph.ts`, `pathfinder.ts`) | All road edges were unconditionally created bidirectional (`n1 -> n2` and `n2 -> n1`), ignoring expressway dual carriageways, slip road ramps, roundabouts, and one-way streets. | **High** | Extracted `oneway`, `isLink`, `motorway`, and `roundabout` attributes to produce strictly directed edges where required. |
| 5 | Three.js Lifecycle (`src/city/renderer.ts`, `CityViewport.tsx`) | `CityRenderer.dispose()` only invoked `this.renderer.dispose()`, leaking geometries, materials, texture maps, shadow render targets, and canvas elements. | **Medium** | Implemented recursive scene traversal disposal of geometries, textures, materials, shadow maps, context loss, and DOM detachment. |

---

## 3. Files Modified

1. **`package.json`**:
   - Updated `"dev"` to `"tsx server.ts --dev"`.
   - Removed automatic `"prebuild"` hook.
   - Preserved `"build"` as `"vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs"`.
   - Added `"bake:if-missing"` and `"build:full"`.
   - Made `"clean"` script cross-platform using `node -e`.
2. **`scripts/bake_hlod.ts`**:
   - Added `import os from 'os'` and pre-flight memory check in `main()` reporting total and free RAM before processing.
3. **`src/types.ts`**:
   - Augmented `RoadSegmentOSM` interface with optional GIS properties: `level`, `isElevated`, `isLink`, `isTunnel`, `oneway`, and `roundabout`.
4. **`src/MapApp.tsx`**:
   - Imported `project` from `./geo/projection`.
   - Rewrote `handleExecuteAIAction` to validate layer allowlists (`ALLOWED_LIVE_LAYERS`), reject non-finite and out-of-bounds coordinates, compute exact world coordinates via `project(lat, lon)`, and safely guard against undefined entries.
5. **`src/navigation/roadGraph.ts`**:
   - Integrated `buildElevationProfiles` from `../city/ribbon`.
   - Updated `getSnapKey(x, y, z)` with 4-meter vertical bucket quantization (`VERTICAL_SNAP_RESOLUTION = 4.0`), keeping ground junctions ($Y < 2.0\text{m}$) at 0 while separating elevated decks ($Y \ge 2.0\text{m}$).
   - Added directional edge construction respecting `oneway`, `isLink`, `motorway`, and `roundabout` attributes.
   - Updated `findNearestNode` to accept optional `targetY` elevation weighting.
6. **`src/navigation/pathfinder.ts`**:
   - Updated `calculateRoute` to pass `start.y` and `destination.y` to `findNearestNode` for elevation-aware start/destination snapping.
7. **`src/city/renderer.ts`**:
   - Implemented full `dispose()` method: recursive scene traversal, de-duplication sets for geometries, materials, and textures, shadow render target cleanup, WebGL context loss force, and DOM removal.
8. **`src/components/3d/CityViewport.tsx`**:
   - Added cleanup for `highlightGeo` and `highlightMat` in unmount hook.
9. **`scripts/smoke_test.mjs`**:
   - Added brief delay before exiting on Windows to ensure child process SIGINT cleanup without libuv handle assertion errors.
10. **`scripts/verify_phase1.ts`**:
    - Created end-to-end automated unit and integration verification test suite covering all Phase 1 fixes.

---

## 4. Technical Explanation of Fixes

### 4.1 Build Pipeline Decoupling
* **Root Cause:** In npm, any script named `"prebuild"` automatically executes before `"npm run build"`. Because `prebuild` tested for `public/hlod/hlod_manifest.json` (which is not committed to git), every normal `build` or `dev` invocation launched `npm run bake`, which consumed 8GB heap scanning 6,944 tiles.
* **Solution:** Decoupled `dev` from `prebuild`. Changed the conditional bake into an explicit `"bake:if-missing"` script and provided `"build:full"` for complete cold deployments. Standard `npm run build` now compiles the Vite frontend and bundles Express in ~20 seconds without touching the baker.

### 4.2 AI Analyst Runtime Crash
* **Root Cause:** In `MapApp.tsx`, `handleExecuteAIAction` attempted to index `customRegistry[selectedLayer]`. If `action.layer` was `'weather'`, undefined, or an unlisted layer returned by Gemini, `customRegistry[selectedLayer]` returned `undefined`, causing `highlightPOI.id` to trigger a fatal `TypeError` that unmounted the React component tree. Furthermore, coordinates were hardcoded to Gomti Nagar / Hazratganj instead of using the AI-provided coordinates.
* **Solution:** 
  - Validated `action` structure and checked `action.layer` against an allowlist of valid `LayerState['live']` keys.
  - Added coordinate validation rejecting non-finite values and out-of-bounds coordinates (outside $[26.0, 27.5]^\circ\text{N}$, $[80.0, 81.8]^\circ\text{E}$).
  - Dynamically computed local world coordinates $(x, z)$ via `project(lat, lon)` using Lucknow's exact GIS origin.
  - Wrapped execution in a top-level `try...catch` block.

### 4.3 Elevation-Aware Road Graph & Separation
* **Root Cause:** In `roadGraph.ts`, `getSnapKey(x, z)` quantized only $X$ and $Z$ with a 20-meter tolerance, discarding elevation. When an elevated flyover deck crossed above a surface road at grade, both segments snapped to the exact same node, enabling pathfinding to switch between flyover and ground arbitrarily.
* **Solution:**
  - Integrated `buildElevationProfiles(roads)` from `src/city/ribbon.ts`, calculating true per-vertex elevations along ramps and flyover decks.
  - Implemented elevation snapping in `getSnapKey(x, y, z)`:
    $$\text{sy} = \begin{cases} 0 & \text{if } y < 2.0\text{m} \\ \text{round}(y / 4.0) \times 4.0 & \text{if } y \ge 2.0\text{m} \end{cases}$$
  - At grade level ($y < 2.0\text{m}$), ramp entrances and surface streets snap to the ground node (`0`), preserving valid on- and off-ramp connectivity.
  - At elevated deck level ($y \ge 7.5\text{m}$), flyovers snap to `8.0` or higher, isolating them from surface streets directly underneath.

### 4.4 One-Way Road Restrictions
* **Root Cause:** `roadGraph.ts` unconditionally created bidirectional edges (`n1 -> n2` and `n2 -> n1`) for every segment, ignoring dual carriageway directions, slip road ramps, and one-way streets.
* **Solution:**
  - Evaluated explicit `oneway` attributes (`true`, `'yes'`, `1`, `-1`, `'reverse'`).
  - Evaluated structural GIS classifications: `motorway` (dual carriageways mapped per-direction in OSM), `isLink` / `*_link` (highway connector slip roads), and `roundabout`.
  - Added edges directionally: forward-only roads omit the reverse edge `n2 -> n1`, reverse one-ways omit the forward edge `n1 -> n2`, and two-way streets maintain bidirectional connectivity.

### 4.5 WebGL Resource Disposal
* **Root Cause:** `CityRenderer.dispose()` previously called only `this.renderer.dispose()`. Textures, geometries, materials, and shadow render targets remained in GPU memory.
* **Solution:**
  - Implemented comprehensive traversal cleanup using de-duplication `Set`s to prevent double-free exceptions on shared geometries.
  - Disposed texture maps (`map`, `normalMap`, `roughnessMap`, `emissiveMap`, etc.) before disposing materials.
  - Disposed `sunLight.shadow.map` render targets and renderer render lists.
  - Called `this.renderer.forceContextLoss()` to immediately release WebGL context resources.
  - Cleanly removed the canvas DOM element from the parent container.

---

## 5. Automated Tests Executed & Results

All tests were executed against the actual codebase.

### Test 1: TypeScript Health Check (`npm run lint`)
* **Command:** `npm run lint` (`tsc --noEmit`)
* **Output:**
  ```
  > lucknow-lens@1.0.0 lint
  > tsc --noEmit
  Exit code: 0
  ```
* **Result:** **PASSED** (0 type errors).

### Test 2: Production Bundle Build (`npm run build`)
* **Command:** `npm run build` (`vite build && esbuild server.ts ...`)
* **Output:**
  ```
  ✓ 8247 modules transformed.
  dist/index.html                           2.18 kB │ gzip:   0.73 kB
  dist/assets/index-Dm8gn4e6.js           417.03 kB │ gzip: 136.56 kB
  dist/assets/MapApp-BQCFix7h.js          446.67 kB │ gzip: 141.93 kB
  dist/assets/three-BkWJUtV4.js           541.14 kB │ gzip: 137.38 kB
  ✓ built in 20.86s
  dist\server.cjs      37.0kb
  dist\server.cjs.map  81.1kb
  Done in 5ms
  Exit code: 0
  ```
* **Result:** **PASSED** (Clean production build without triggering HLOD baker).

### Test 3: Production Server Smoke Test (`npm run smoke`)
* **Command:** `npm run smoke` (`node scripts/smoke_test.mjs`)
* **Output:**
  ```
  Serving prebuilt bundle from dist/
  Miniature City server running on http://localhost:4173
  Smoke test passed: {"status":"ok","live":{"flights":{"status":"ok","provider":"OpenSky Network","count":11},"trains":{"status":"unavailable","provider":"RailRadar","count":0},"weather":{"status":"ok","provider":"Open-Meteo","count":1},"air":{"status":"ok","provider":"Open-Meteo Air Quality","count":1},"traffic":{"status":"unavailable","provider":"TomTom Traffic","count":0},"news":{"status":"ok","provider":"Lucknow news (HT, TOI)","count":30}}}
  Exit code: 0
  ```
* **Result:** **PASSED** (Endpoints `/api/health`, `/api/version`, and `/` returned HTTP 200).

### Test 4: Comprehensive Phase 1 Test Suite (`scripts/verify_phase1.ts`)
* **Command:** `npx tsx scripts/verify_phase1.ts`
* **Output:**
  ```
  --- Test Suite 1: AI Analyst Action Validation ---
    [PASS] Handles null action safely
    [PASS] Rejects extreme out-of-bounds coordinates without crashing
    [PASS] Rejects NaN coordinates safely
    [PASS] Safely resolves unmapped registry layers (e.g. weather)
    [PASS] Dynamically projects origin (0, 0) accurately

  --- Test Suite 2: Elevation-Aware Road Graph ---
    [PASS] Surface crossing node exists at Y ~ 0
    [PASS] Flyover crossing node exists at Y ~ 8.5
    [PASS] Surface road and Flyover have DISTINCT node IDs at crossing
    [PASS] Surface road edges DO NOT connect to elevated flyover deck without ramps
    [PASS] Ramp bottom cleanly connects to surface road at ground level (Y ~ 0)

  --- Test Suite 3: One-Way Road Restrictions ---
    [PASS] Forward edge exists on one-way link (A -> B)
    [PASS] Reverse edge is NOT present on one-way link (B -> A is blocked)
    [PASS] Bidirectional forward edge exists (B -> C)
    [PASS] Bidirectional backward edge exists (C -> B)
    [PASS] Reverse one-way correctly creates edge from destination to origin (200,0 -> 200,100)
    [PASS] Reverse one-way blocks driving in forward array direction
    [PASS] A* successfully navigates forward along one-way link (A -> B, ~100m)
    [PASS] A* obeys one-way restriction and takes ring detour instead of going wrong way (B -> C -> D -> A, ~300m)
    [PASS] Route actually traveled through the ring road detour (Z >= 80m)

  --- Test Suite 4: WebGL Resource Disposal ---
    [PASS] Geometries disposed without duplicate double-free errors
    [PASS] Materials disposed cleanly
    [PASS] Attached texture maps disposed cleanly

  ========================================
  Phase 1 Verification Complete: 22 / 22 tests passed.
  ========================================
  Exit code: 0
  ```
* **Result:** **PASSED** (22/22 unit and integration tests passing).

---

## 6. Remaining Issues & Non-Blockers

1. **Missing Pre-Baked Binary HLOD Assets:**
   - The directory `public/hlod` remains unpopulated in the git repository (it is a derived ~190MB binary dataset generated from 6,944 JSON tiles).
   - In development and standard production builds, `hlodLayer.ts` gracefully falls back to vector footprints when `hlod_manifest.json` is absent (`hasManifest() === false`).
   - Baking requires a machine with $\ge 8\text{GB}$ available RAM via `npm run bake`.
2. **External Live Feeds Availability:**
   - As noted in the smoke test, TomTom Traffic and RailRadar feeds return `status: unavailable` if external credentials or third-party endpoints are offline. The application gracefully displays fallback status without crashing.

---

## 7. Build and Deployment Status

| Pipeline Stage | Command | Status | Notes |
|---|---|---|---|
| Development Server | `npm run dev` | **READY** | Runs `tsx server.ts --dev` directly; no prebuild block. |
| Production Build | `npm run build` | **READY** | Vite + esbuild compiles cleanly in ~20 seconds. |
| Smoke Test | `npm run smoke` | **READY** | Server boots, serves API health, and cleanly terminates. |
| Full Bake Pipeline | `npm run build:full` | **AVAILABLE** | Runs conditional bake only when needed, followed by build. |

---

## 8. Regression Risks & Precautions

* **Navigation Connectivity on Fragmented Links:** In sparsely mapped areas of OSM, if an on-ramp is mapped without an accompanying off-ramp or reverse connection, A* will refuse to route backwards and will take detours or fall back to direct straight-line routing. This is expected routing behavior.
* **Vertical Snapping Margin:** The vertical quantization constant is set to $4.0\text{m}$. Any road with $Y < 2.0\text{m}$ is treated as grade-level surface. Elevated flyovers in Lucknow are built with clearance $> 5.5\text{m}$ (typically $7.5\text{m} - 8.5\text{m}$), ensuring no accidental snapping occurs.

---

## 9. Verification Matrix

| Feature / Fix | Verification Status | Evidence |
|---|---|---|
| Build pipeline decoupling | **IMPLEMENTED AND TESTED** | `npm run build` runs in 20.86s without launching baker. |
| AI Analyst crash prevention | **IMPLEMENTED AND TESTED** | Passed 5 edge-case validation tests (Suite 1). |
| Elevation-aware road graph | **IMPLEMENTED AND TESTED** | Passed 5 elevation separation tests (Suite 2). |
| One-way road restrictions | **IMPLEMENTED AND TESTED** | Passed 9 directional routing & A* detour tests (Suite 3). |
| WebGL resource disposal | **IMPLEMENTED AND TESTED** | Passed 3 resource disposal & de-duplication tests (Suite 4). |
| Server production deployment | **IMPLEMENTED AND TESTED** | Smoke test confirmed HTTP 200 on `/api/health` and `/`. |
