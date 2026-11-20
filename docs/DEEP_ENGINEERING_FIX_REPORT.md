# Lucknow Lens — Deep Engineering Fix Report

**Date:** November 19, 2026  
**Status:** All Confirmed Issues Remediated & Verified  
**Branch:** `feature/lucknow-lens-phase-2-mobile-optimization`  
**Execution Context:** Strictly Local Modifications (Zero Remote Pushes)  

---

## 1. Summary of Fixed Issues by Severity

| Severity Level | Total Identified | Total Fixed |
| :--- | :---: | :---: |
| **P0 (Critical Security & Application Breaking)** | 1 | 1 |
| **P1 (Major Functionality, Memory & Reliability)** | 5 | 5 |
| **P2 (Moderate Quality, Security & Robustness)** | 4 | 4 |
| **P3 (Configuration & Technical Debt)** | 1 | 1 |
| **Total** | **11** | **11** |

---

## 2. Detailed Technical Fixes

### Fix 1: Protocol Validation for External News Links (SEC-01)
- **Affected File:** [src/components/features/LiveDataPanel.tsx](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/components/features/LiveDataPanel.tsx)
- **Root Cause:** External RSS news items from Hindustan Times and Times of India were rendered directly as `<a href={a.url} target="_blank" rel="noreferrer">`. Malformed or attacker-controlled feed items could theoretically inject `javascript:...` links, resulting in Client-Side Code Execution (XSS).
- **Remediation:** Added `safeExternalUrl(url)` helper ensuring that URLs strictly parse to `http:` or `https:`, falling back to `'#'` otherwise. Added `rel="noopener noreferrer"`.
- **Verification:** Verified safe parsing and rejection of pseudo-protocols.

### Fix 2: Full WebGL Lifecycle Cleanup for `TrafficSystem` (MEM-01)
- **Affected Files:** [src/city/traffic.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/traffic.ts), [src/city/tileStreamer.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/tileStreamer.ts)
- **Root Cause:** `TrafficSystem` had no `dispose()` method. Instanced vehicle bodies, headlight meshes, materials, and scene graph nodes were abandoned in memory when `TileStreamer.dispose()` was called.
- **Remediation:** 
  1. Stored reference to `bodyMaterial`.
  2. Implemented `TrafficSystem.dispose()` disposing all `InstancedMesh` geometries, `bodyMaterial`, lamp geometries, lamp material, and detaching `this.group` from the parent scene.
  3. Called `this.traffic.dispose()` in `TileStreamer.dispose()`.
- **Verification:** Confirmed clean disposal in WebGL memory profiler during unmount.

### Fix 3: Material & Texture Disposal in `MetroSystem` & `LandmarkLayer` (MEM-02, MEM-03)
- **Affected Files:** [src/city/metroSystem.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/metroSystem.ts), [src/city/landmarks.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/landmarks.ts), [src/city/tileStreamer.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/tileStreamer.ts)
- **Root Cause:** 
  - `MetroSystem.dispose()` disposed mesh geometries but left `concreteMat`, `steelMat`, `tunnelMat`, and `trainMat` allocated on the GPU.
  - `LandmarkLayer` had no disposal hook, leaving landmark architecture geometries, grounds materials (`gmat`), national flag shader material, and canvas textures undisposed.
- **Remediation:** 
  1. Disposed all materials and cleared instanced mesh references in `MetroSystem.dispose()`.
  2. Implemented `WavingFlag.dispose()` to dispose flag geometry, material, and `CanvasTexture`.
  3. Added `dispose()` to `LandmarkLayer` interface and implementation, and called `this.landmarks.dispose()` in `TileStreamer.dispose()`.
- **Verification:** Verified clean release without double-free errors.

### Fix 4: Resilient HLOD Validation in `validate_city_data.ts` (TST-01)
- **Affected File:** [scripts/validate_city_data.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/scripts/validate_city_data.ts)
- **Root Cause:** The script synchronously read `public/hlod/hlod_manifest.json` without verifying file existence. In clean checkouts or developer workstations where optional HLOD was unbaked, running the script crashed with `ENOENT`.
- **Remediation:** Wrapped HLOD manifest reading in `if (fs.existsSync(hlodManifestPath))`. If absent, safely reports informational status and continues validating all 6,942 tile JSON files and 953,000+ buildings.
- **Verification:** Executed `npx tsx scripts/validate_city_data.ts` -> Exited 0 with `OK — city data is consistent (format v2)`.

### Fix 5: Graceful Legacy Tile Check in `validate_dataset.ts` (TST-02)
- **Affected File:** [scripts/validate_dataset.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/scripts/validate_dataset.ts)
- **Root Cause:** The script executed `fs.readdirSync('public/lucknow_tiles')`. The legacy tile directory was superseded by `public/overture_tiles_full/` and is no longer part of the repository, causing `ENOENT`.
- **Remediation:** Wrapped legacy directory check in `if (fs.existsSync(OLD_DIR))` with a clean informational log.
- **Verification:** Executed `npx tsx scripts/validate_dataset.ts` -> Exited 0 with all 25 random tile samples and bounds checks passing.

### Fix 6: Safe Patching of Transitive Vulnerabilities in Lockfile (SEC-02)
- **Affected File:** `package-lock.json`
- **Root Cause:** `npm audit` reported critical IP spoofing in `proxy-addr` and high DoS vulnerabilities in `compression`, `body-parser`, `qs`, `source-map-js`, and `vite`.
- **Remediation:** Executed `npm audit fix` (safe semver patch without `--force`) updating `proxy-addr` (2.0.7 -> 2.0.8), `compression` (1.8.1 -> 1.8.2), `body-parser` (1.20.6 -> 1.20.9), `qs` (6.15.3 -> 6.15.4), `source-map-js` (1.2.1 -> 1.2.4), and `vite` (6.4.3 -> 6.4.6).
- **Verification:** Confirmed zero breaking changes and clean production build.

### Fix 7: Package Manifest Cleanup & Test Script Addition (CFG-01)
- **Affected File:** [package.json](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/package.json)
- **Root Cause:** `vite` was duplicated across `dependencies` and `devDependencies`. `npm test` was missing from scripts.
- **Remediation:** Removed duplicate `vite` from `dependencies` and added `"test": "tsx scripts/verify_phase1.ts"`.
- **Verification:** Executed `npm test` -> 22/22 tests passed cleanly.

### Fix 8 & 9: Server-Side Sanitization & UI Defensive Guard for AI Analyst (API-01, UI-01)
- **Affected Files:** [server.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/server.ts), [src/components/features/AnalystPanel.tsx](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/components/features/AnalystPanel.tsx)
- **Root Cause:**
  - `server.ts` allowed arbitrarily long question strings and passed unvalidated `JSON.parse` output directly to the client.
  - `AnalystPanel.tsx` accessed `response.sources.length` without checking if `sources` was an array.
- **Remediation:**
  - In `server.ts`: Sanitized and bounded `question` to 500 characters. Validated that parsed Gemini responses contain non-empty `answer` strings, falling back to grounded rule-based responses if malformed.
  - In `AnalystPanel.tsx`: Added `Array.isArray(response.sources) && response.sources.length > 0`.
- **Verification:** Verified safe rejection of empty/malformed questions and resilient rendering of responses.

### Fix 10: Canvas Event Listener Detachment in `CityRenderer` (MEM-04)
- **Affected File:** [src/city/renderer.ts](file:///c:/Users/Ujjwal/Desktop/Lucknow-LENS/src/city/renderer.ts)
- **Root Cause:** `webglcontextlost` and `webglcontextrestored` event listeners on the canvas were never detached on `CityRenderer.dispose()`.
- **Remediation:** Retained references to `onContextLost` and `onContextRestored` and called `removeEventListener` in `dispose()`.
- **Verification:** Confirmed clean DOM detachment and garbage collection.

---

## 3. Verification Summary

- **TypeScript Lint (`npm run lint`):** 0 errors.
- **Test Suite (`npm test`):** 22/22 tests PASSED.
- **Production Build (`npm run build`):** Clean build in 22.81s.
- **Smoke Test (`npm run smoke`):** PASSED (Express + Live Feeds).
- **Geo Validation (`scripts/validate_geo.ts`):** PASSED.
- **Dataset Validation (`scripts/validate_dataset.ts`):** PASSED.
- **City Data Validation (`scripts/validate_city_data.ts`):** PASSED.
- **Mobile Benchmark (`scripts/benchmark_mobile.mjs`):** PASSED (142 FPS idle, 110 FPS rotation).
