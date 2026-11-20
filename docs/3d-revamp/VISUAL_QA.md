# Visual QA: 3D city realism upgrade

**How the screenshots were taken.** All images come from the running app on localhost (`npm` dev server on port 3100). The capture script was `scripts/visual_harness.mjs`, run in headless Chrome at 1600×900 through ANGLE/D3D11. The machine has an **NVIDIA GeForce RTX 4070 Laptop GPU**, and the app ran at its default "high" quality tier.

The harness uses the app's dev-only `?harness` mode to set each camera and day/night state. It waits for tile streaming to settle, then measures for 2 s. Before and after shots use identical camera definitions (`qa_shots.json`; the after run adds the landmark shots in `qa_shots_after.json`).

- Before: `screenshots/before/`. Captured from a clean checkout of baseline commit `76290107` with the original 224 MB HLOD. The only additions were the dev-only harness hooks and the one-line night-state fix, so that "day" shots really render daylight. The first baseline capture was discarded: a pre-existing StrictMode bug had rendered some "day" frames in night state.
- After: `screenshots/after/`, branch `feat/3d-city-realism`.
- Quality tiers: `screenshots/tier_medium/`, `screenshots/tier_low/` (same app, `?quality=medium|low`).

The full metrics for each run are in `metrics.json` in each folder.

## Camera positions

App frame: x is metres east and z is metres south of 26.84997 N, 80.95005 E. Azimuth, pitch and distance are orbit parameters.

| Shot | Target (x, z) | Azimuth | Pitch | Distance | Place |
|---|---|---:|---:|---:|---|
| 01 / 02 city | 0, 0 | 0.78 | 0.98 | 22 km | whole city |
| 03 / 09 old city | −3700, −2100 | 2.4 | 0.45 | 900 m | Hussainabad and Chowk, looking over the old city |
| 04 / 13 modern | 5457, −616 | 0.9 | 0.5 | 1 km | Gomti Nagar side, near the railway |
| 05 heritage | −3839, −2401 | 1.57 | 0.25 | 320 m | Rumi Darwaza preset |
| 06 / 10 street | −343, −59 | 0.6 | 0.12 | 170 m | Hazratganj |
| 07 / 08 district | −343, −59 | 0.6 | 0.6 | 3 km | central Lucknow and the Gomti |
| 11 landmarks | each footprint centroid | facade-facing | 0.22–0.35 | 130–450 m | Rumi Darwaza, Bara Imambara, Clock Tower, Chhota Imambara, Residency, Vidhan Sabha, Ambedkar Memorial |
| 12 heritage night | −3760, −2365 | 1.27 | 0.25 | 260 m | Rumi Darwaza floodlit |
| 14 district | −343, −59 | 0.6 | 0.75 | 3.8 km | true district altitude (the app labels shots 07/08 NEIGHBORHOOD, about 1.7 km up) |
| 15 flyover | −5420, 3060 | 2.2 | 0.30 | 240 m | elevated ramp over the railway |
| 16 divided road | 5457, −616 | 0.9 | 0.55 | 420 m | arterial in Gomti Nagar |

## Before and after

| | Before | After |
|---|---|---|
| City, day | ![](screenshots/before/01_city_day.jpg) | ![](screenshots/after/01_city_day.jpg) |
| City, night | ![](screenshots/before/02_city_night.jpg) | ![](screenshots/after/02_city_night.jpg) |
| Old city, day | ![](screenshots/before/03_oldcity_day.jpg) | ![](screenshots/after/03_oldcity_day.jpg) |
| Modern residential area, day | ![](screenshots/before/04_modern_day.jpg) | ![](screenshots/after/04_modern_day.jpg) |
| Heritage landmark | ![](screenshots/before/05_heritage_day.jpg) | ![](screenshots/after/05_heritage_day.jpg) |
| Street level, day | ![](screenshots/before/06_street_day.jpg) | ![](screenshots/after/06_street_day.jpg) |
| District, day | ![](screenshots/before/07_district_day.jpg) | ![](screenshots/after/07_district_day.jpg) |
| District, night | ![](screenshots/before/08_district_night.jpg) | ![](screenshots/after/08_district_night.jpg) |
| Old city, night | ![](screenshots/before/09_oldcity_night.jpg) | ![](screenshots/after/09_oldcity_night.jpg) |
| Street level, night | ![](screenshots/before/10_street_night.jpg) | ![](screenshots/after/10_street_night.jpg) |

### Landmarks (after only; before, they were extruded footprints)

| | |
|---|---|
| Rumi Darwaza ![](screenshots/after/11_lm_rumi.jpg) | Bara Imambara ![](screenshots/after/11_lm_bara.jpg) |
| Husainabad Clock Tower ![](screenshots/after/11_lm_clock.jpg) | Chhota Imambara ![](screenshots/after/11_lm_chhota.jpg) |
| The Residency ![](screenshots/after/11_lm_residency.jpg) | Vidhan Sabha ![](screenshots/after/11_lm_vidhan.jpg) |
| Ambedkar Memorial ![](screenshots/after/11_lm_ambedkar.jpg) | Rumi Darwaza, night ![](screenshots/after/12_heritage_night.jpg) |

The landmarks are procedural reconstructions anchored to real footprints. They are not photogrammetry.

### Extra views and quality tiers

| | |
|---|---|
| District at 3.8 km ![](screenshots/after/14_district_3200m_day.jpg) | Flyover ![](screenshots/after/15_flyover_close.jpg) |
| Medium tier, old city ![](screenshots/tier_medium/03_oldcity_day.jpg) | Low tier, street ![](screenshots/tier_low/06_street_day.jpg) |

## What changed visually

- **Heights.** The uniform 4–8 storey slab field is gone. Old Lucknow is 2–4 storey fabric; the periphery is single-storey village fabric; towers stand out in the district view.
- **Rooftops.** Rooftops carry parapets, stair cabins, black Sintex-style tanks, barsatis, solar arrays and tin shelters. Their frequency depends on typology and footprint.
- **Facades** follow the typology:
  - window grids with lintels
  - bazaar ground floors with shutters and signboards, under tin awnings
  - chhajjas over windows
  - balconies on apartments and planned colonies
  - arched openings on heritage buildings
  - red brick on the peripheral fabric
- **Ground.** A continuous ground replaces the dark disc, with land cover, parks, campuses, farmland, sand banks and DEM shading.
- **Roads.** Roads show asphalt and markings, and widths vary by feature.
- **Trees.** Six species follow real tree cover: the mango-orchard belt, avenues, campuses and yards.
- **Day lighting.** A real afternoon sun casts long shadows in a hazy North-Indian atmosphere.
- **Night.** Lighting is warm and cool by occupancy:
  - glowing shopfronts and floodlit heritage buildings
  - light pools along roads
  - a smooth warm glow over dense districts
  - a light-polluted horizon

## Performance (measured)

RTX 4070 Laptop GPU, headless Chrome at 1600×900, dev build, quality "high". Each cell is fps / p95 frame time (ms) / draw calls / triangles (millions) / JS heap (MB). Before and after were captured in the same session with the same harness.

| Shot | Before | After |
|---|---|---|
| 01_city_day | 157 / 9.9 / 90 / 2.69 / 217 | 158 / 9.8 / 92 / 2.75 / 219 |
| 02_city_night | 152 / 9.8 / 89 / 2.70 / 197 | 160 / 9.8 / 91 / 2.76 / 204 |
| 03_oldcity_day | 151 / 10 / 419 / 3.75 / 274 | 158 / 9.8 / 481 / 4.46 / 327 |
| 04_modern_day | 153 / 10 / 355 / 2.65 / 305 | 161 / 9.9 / 450 / 3.98 / 394 |
| 05_heritage_day | 150 / 9.9 / 332 / 3.57 / 380 | 161 / 9.9 / 397 / 4.55 / 296 |
| 06_street_day | 156 / 10 / 597 / 4.16 / 278 | 159 / 9.8 / 608 / 4.80 / 386 |
| 07_district_day | 153 / 9.9 / 494 / 4.63 / 296 | 160 / 9.8 / 422 / 3.98 / 396 |
| 08_district_night | 155 / 10.1 / 646 / 4.68 / 281 | 160 / 9.8 / 508 / 2.90 / 405 |
| 09_oldcity_night | 154 / 9.9 / 347 / 3.63 / 296 | 160 / 9.8 / 336 / 2.96 / 466 |
| 10_street_night | 149 / 10 / 626 / 4.18 / 308 | 161 / 9.8 / 587 / 3.82 / 530 |
| 11 landmarks (7) | – | 156–163 / ≤ 10.0 / 345–589 / 3.5–5.2 / 331–595 |
| 12–13 night extras | – | 154–158 / 9.8–9.9 / 318–351 / 2.5–2.8 / 299–360 |
| 14 district 3.8 km | – | 200 / 6.5 / 441 / 3.64 / 334 |
| 15 flyover / 16 divided road | – | 236–239 / 5.6–6.1 / 318–363 / 3.0–3.3 / 299–368 |

Medium tier (old city, street, district night): 158–167 fps, 409–604 draws, 2.7–4.0 M triangles. Low tier: 155–156 fps, 347–572 draws, 2.2–2.7 M triangles. That is about half the triangles of high at street level, with no shadows and no rooftop furniture.

How to read this:

- Both runs sit at about 150–160 fps with a 6–6.5 ms median frame, which is a frame cap in the headless session, not GPU headroom. The fps columns therefore show only that both versions are far above the 30 fps target. The real cost indicators are p95 frame time (≤ 10 ms in every view, both runs), draw calls and triangles.
- Draw calls change by −138 to +95 per view. Near-range detail meshes and six-species trees add draws; the new relief rule and per-tile batching remove some at district scale.
- Triangles rise by up to 50% in daylight close views (detail stream, trees) and fall at night and at district scale.
- JS heap after is 204–595 MB, against 197–380 MB before. The increase comes from tree instance matrices and detail meshes; it is bounded because detail meshes are retired beyond 1.6× the detail radius.
- `metrics.json` errors: none in either run.
- Not measured: GPU memory (WebGL exposes no counter), integrated GPUs and phones. On those, `deviceProfile` picks "medium" for Intel/integrated GPU strings and phones and "low" for weak devices. It can be forced with `?quality=` and is reported by `__LENS.state().quality`.

## Issues found and fixed during QA

| Issue | Cause | Fix |
|---|---|---|
| Heavy horizontal banding on every wall | AO and surface kind shared one vertex byte, so interpolating AO across a wall scrambled the surface code | Surface kind decoded in the vertex shader and passed as a `flat` varying |
| Glossy stripe aliasing on facades | Window mask drove roughness under a low sun | Constant roughness per surface; sine-free hashes |
| Whole scene stuck in night mode after load | Pre-existing bug: StrictMode remounted the viewport, but the night ref still held the first mount's value | Ref reset on viewport init |
| Rooftops vanished into the ground at city scale | Built-up ground albedo was as light as the roofs | Built and residential ground darkened |
| Haze too heavy at 22 km | Fog density | 0.000030 → 0.000019 |
| Night windows clipping to white; ground glowing brown up close | Emissive gains; glow applied at every distance | Lower window and shopfront gains; glow only from altitude, bilinear-sampled |
| Large Gomti Nagar blocks rendered as tin sheds | Geometry-only industrial rule | Industrial now needs land-use evidence or very large sheds on non-urban ground |
| Brown "dead" trees | Flowering tint multiplied green crowns | Tint removed |
| Trees standing on rooftops | Old placement tested building centroids only | Footprint containment test |
| Yard trees in residential lanes | Road mask held major roads only | Every tile's local streets added to the mask (448,191 segments). Trees: 541,539 → 483,520 |
| Flyover barriers and bridge decks offset from ramps | Structures used the old class widths, ribbons the new per-feature widths | One `roadHalfWidth` for ribbons, decks, barriers and named structures |
| Two medians painted on divided roads | Each one-way carriageway drew its own median | Multi-lane markings: lane dashes + edge lines, no painted median |
| Camera presets missed the new landmark models (Clock Tower by 318 m, Old Lucknow by 530 m) | Presets pointed at place labels | Presets re-pointed to the model sites; `npm run audit:landmarks` still passes |
| Baseline "day" shots rendered at night | Pre-existing StrictMode bug | Baseline re-shot from a clean checkout with the fix |

## Remaining visual defects (known)

1. **District view (2–4 km).** Buildings below the relief rule (h ≥ 9 m, or ≥ 300 m², or ≥ 5.5 m and ≥ 100 m²) show as roof caps without walls. At 3.8 km this is hard to see (shot 14); it shows more at low oblique angles over single-storey periphery.
2. **Vidhan Sabha** is the least convincing landmark: its real 210 m outline extruded with a central dome. The others are recognisable but simplified, with no jali, detailed mouldings or the Bara Imambara's maze of courtyards.
3. **Facades are shader-drawn.** Windows have no depth, and the window rhythm is regular within a typology.
4. **Ground resolution.** The 11 m ground texture shows soft colour patches at street level. Procedural detail softens but does not remove them.
5. **The night city at 22 km** is a dim warm field without individual sparkle. There is no bloom pass.
6. **Trees are faceted low-poly.** The palm and eucalyptus silhouettes are stylised.
7. **Water and riverbanks** are unchanged from before, apart from ground classes along the banks. The river is not carved.
8. **Typology is inferred.** For example, 24% of buildings are classed "planned" by orientation coherence. A few large buildings may still get the wrong roof form.
9. **Not observed in the QA shots:** tile seams, z-fighting, buildings floating or sunk, or trees on roofs or roads. These were checked visually only at the listed cameras.
