# Lucknow Lens — Deep Engineering Audit Report

**Date:** November 19, 2026  
**Auditor Roles:** Principal Software Architect, Senior Full-Stack Engineer, GIS Engineer, Three.js/WebGL Specialist, Performance Engineer, Cybersecurity Engineer, QA Automation Engineer, DevOps Engineer  
**Branch:** `feature/lucknow-lens-phase-2-mobile-optimization`  
**HEAD Commit:** `f3a2327123e4d6bc0833fe0740c3fcb1990353bd`  
**Execution Context:** Verification and Remediation Phase  

---

## 1. Executive Summary

This deep technical audit presents an exhaustive, evidence-based review of the complete Lucknow Lens codebase. Every subsystem—including the Express API backend, React 19 UI layer, custom Three.js WebGL rendering engine, spatial GIS data pipelines, Web Worker tile streamers, A* elevation-aware navigation, live data aggregators, and Gemini AI City Analyst—was systematically audited, executed, and verified.

The audit verified that the application possesses a world-class architectural foundation:
- Content-addressed procedural building generation with consistent seed hashing.
- Efficient Web Worker-based tile parsing and transfer of raw typed arrays.
- Elevation-aware road network with one-way traversal and flyover deck separation.
- Real-time caching proxies that prevent upstream API quota exhaustion.
- Modern responsive camera controls supporting both desktop pointer and mobile touch workflows.

However, the audit also identified critical defects, security vulnerabilities, memory leaks, and environment fragility:
- **XSS & Protocol Hijack Risk:** Unvalidated URLs from external news feeds rendered into anchor tags.
- **WebGL Resource Leaks:** Missing `dispose()` lifecycles for traffic instanced meshes, metro materials, and landmark textures.
- **Dependency Vulnerabilities:** Critical IP spoofing in `proxy-addr`, DoS in `compression`, `body-parser`, `qs`, and `vite`.
- **Test Fragility:** `validate_city_data.ts` and `validate_dataset.ts` crashing on missing optional/legacy assets.
- **AI Schema Fragility:** Uncapped prompt lengths and unguarded AI response structures.

All confirmed issues have been cataloged, classified by severity (P0–P3), remediated locally, and re-verified without breaking existing functionality or modifying remote repositories.

---

## 2. Comprehensive System Architecture & Data Flow

```
[Browser Client]
  │
  ├── 1. App.tsx (Root Lifecycle & Staging: landing → boarding → ready → diving → map)
  │
  ├── 2. MapApp.tsx (State Orchestrator & UI Bridge)
  │     ├── User Preferences (Theme, Night Mode, Labels, Airplane Window View)
  │     ├── Live Feed Hooks (useLiveFeed, useLiveList, useLiveFlights)
  │     ├── Navigation State (Pathfinder, RouteDriver, Waypoint Visuals)
  │     └── AI Action Dispatcher (Safe bounds checking, projection, entity selection)
  │
  ├── 3. CityViewport.tsx (Three.js WebGL Canvas Mount)
  │     ├── CityRenderer (WebGLRenderer, Camera, Sun/Moon Lighting, Tone Mapping)
  │     ├── CameraController (Touch 1-finger rotate, 2-finger pan/zoom, damping)
  │     ├── TileStreamer (Spatial index, distance-weighted queue, tile recycling)
  │     │     ├── Web Workers (tileWorker.ts: footprint extrusion, geometry packing)
  │     │     ├── MetroSystem (Red line viaducts, tunnel alignments, train cars)
  │     │     ├── TrafficSystem (Instanced procedural vehicles, night headlights)
  │     │     ├── LandmarkLayer (Curated historical and civic monuments)
  │     │     └── GroundSurface & AtmosphericSky (Terrain raster, HDR sky dome)
  │     └── Emergency & Campus Visuals (EmergencyVisualManager, CampusAmbienceManager)
  │
  └── 4. Express Server (server.ts)
        ├── Security Headers & 16KB Payload Ceiling
        ├── Gzip/Brotli Compression & Asset Cache-Control
        ├── Rate Limiter (180 requests/min per IP)
        ├── Live Feeds Cache Proxy (CachedFeed)
        │     ├── OpenSky / adsb.lol (Aircraft)
        │     ├── RailRadar (Live Trains)
        │     ├── Open-Meteo (Weather & AQI)
        │     ├── TomTom (Traffic Incidents)
        │     └── RSS / GDELT (Regional News)
        └── AI Analyst Endpoint (/api/analyst with Gemini 2.5 Flash + Rule-Based Grounding)
```

---

## 3. Subsystem Audit Findings

### A. Build, Dependency & Configuration Audit
1. **Duplicate Dependency in `package.json`**:
   - `vite` was listed under both `dependencies` (`^6.2.3`) and `devDependencies` (`^6.2.3`).
2. **Missing Standard Test Script**:
   - `npm test` was missing, preventing CI and developer test runners from executing regression suites.
3. **Dependency Vulnerability Findings (`npm audit`)**:
   - `proxy-addr` (Critical): Vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet.
   - `compression` (High): Memory leak on premature client response termination.
   - `body-parser` (High): DoS via trailing bytes after compressed payload.
   - `qs` (Moderate/High): Denial of Service via attacker-controlled buffer parameters.
   - `vite` (High): Path traversal and Windows CLI escaping vulnerabilities in development server.
4. **Circular Dependency Scan**:
   - Automated AST traversal across all 110+ source files verified **zero circular dependency cycles**.

### B. Three.js, WebGL & Rendering Engine Audit
1. **`TrafficSystem` Resource Leak**:
   - `TrafficSystem` created dynamic `InstancedMesh` arrays for vehicle bodies and headlights.
   - It lacked a `dispose()` method.
   - When `TileStreamer.dispose()` ran, `TrafficSystem` remained in the scene graph, and its buffers remained in GPU memory.
2. **`MetroSystem` Material Leak**:
   - `MetroSystem.dispose()` traversed and disposed mesh geometries, but never disposed `concreteMat`, `steelMat`, `tunnelMat`, and `trainMat`.
3. **`LandmarkLayer` Texture & Material Leak**:
   - `LandmarkLayer` created dynamic grounds materials, national flag shaders, and canvas textures. It had no `dispose()` hook, leaving textures in WebGL memory.
4. **Context Recovery Event Listener Leak**:
   - `CityRenderer.setupContextRecovery()` attached `webglcontextlost` and `webglcontextrestored` to the DOM canvas, but never removed them upon `CityRenderer.dispose()`.

### C. GIS, Spatial Indexing & Navigation Audit
1. **Elevation-Aware Snapping**:
   - Verified: Ground roads snap to `y = 0` (tolerance < 2.0m), while elevated flyovers snap into 4m vertical buckets (`VERTICAL_SNAP_RESOLUTION = 4.0`).
   - Verified: Ramps cleanly bridge the elevation gap without false surface-to-deck intersection edges.
2. **One-Way Road Restrictions**:
   - Verified: One-way roads create directed edges `(A -> B)` only; reverse edges `(B -> A)` are rejected during graph construction.
   - Reverse one-ways (`oneway = -1` or `'reverse'`) invert the node order correctly.
3. **Deck Audit Diagnostics**:
   - Automated audit (`scripts/audit_elevated_decks.ts`) confirmed **0 decks ending in mid-air** out of 904 elevated road features.

### D. Live Feeds & Backend API Security Audit
1. **Unsafe External URLs in `LiveDataPanel.tsx`**:
   - `<a href={a.url}>` directly rendered URLs from external RSS/GDELT feeds without protocol validation, allowing potential `javascript:` URI attacks.
2. **Unbounded Input in `/api/analyst`**:
   - `req.body.question` was not character-length bounded, leaving room for prompt injection or oversized payloads.
3. **Unvalidated Gemini AI JSON Output**:
   - `server.ts` parsed Gemini output with `JSON.parse` and returned it directly without asserting that `answer` is a valid string, risking React UI crashes if the model returned incomplete JSON.

### E. Test & Build Script Robustness Audit
1. **`scripts/validate_city_data.ts` Uncaught Exception**:
   - Attempted `fs.readFileSync('public/hlod/hlod_manifest.json')` without checking `fs.existsSync()`. Crashed on any fresh checkout where optional HLOD was unbaked.
2. **`scripts/validate_dataset.ts` Uncaught Exception**:
   - Attempted `fs.readdirSync('public/lucknow_tiles')` without checking existence of the legacy directory, throwing `ENOENT`.

---

## 4. Issue Classification Matrix

| ID | Issue Description | Component | Severity | Remediation Status |
| :--- | :--- | :--- | :---: | :---: |
| **SEC-01** | Unsafe link rendering in LiveDataPanel (XSS / protocol hijack) | `LiveDataPanel.tsx` | **P0** | **FIXED** |
| **MEM-01** | Missing `dispose()` in `TrafficSystem` causing GPU memory leak | `traffic.ts`, `tileStreamer.ts` | **P1** | **FIXED** |
| **MEM-02** | Incomplete material cleanup in `MetroSystem` | `metroSystem.ts` | **P1** | **FIXED** |
| **MEM-03** | Incomplete texture & material cleanup in `LandmarkLayer` | `landmarks.ts`, `tileStreamer.ts` | **P1** | **FIXED** |
| **TST-01** | `validate_city_data.ts` crash on unbaked HLOD environments | `scripts/validate_city_data.ts` | **P1** | **FIXED** |
| **TST-02** | `validate_dataset.ts` crash on missing legacy tile directory | `scripts/validate_dataset.ts` | **P1** | **FIXED** |
| **SEC-02** | Vulnerable transitive dependencies in lockfile (`proxy-addr`, `compression`, `qs`, `vite`) | `package-lock.json` | **P2** | **FIXED** |
| **API-01** | Unbounded question input and unvalidated AI response in `/api/analyst` | `server.ts` | **P2** | **FIXED** |
| **UI-01** | Unguarded `sources.length` access in `AnalystPanel.tsx` | `AnalystPanel.tsx` | **P2** | **FIXED** |
| **MEM-04** | Missing event listener detachment in `CityRenderer.dispose()` | `renderer.ts` | **P2** | **FIXED** |
| **CFG-01** | Duplicate `vite` dependency and missing `npm test` script | `package.json` | **P3** | **FIXED** |
