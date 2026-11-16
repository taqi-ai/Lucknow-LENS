# Round 2: local report

Screenshots: `screenshots/round-2/` (camera list in `qa_shots_round2.json`). Measured on an RTX 4070 Laptop GPU: p95 frame time ≤ 10 ms in all 21 views, no console errors.

## 1. Features implemented
- **Water.** Classified hydrology replaces the old rule that turned every one of 527 water features into a 35 m-wide surface. 274 real surfaces remain. Drains and ditches are no longer drawn as water.
- **River and bridges.** The Gomti is drawn at its measured width (88 m), with a stone embankment along its real banks. Bridges are generated only over rivers and major canals; synthetic river crossings fell from 207 to 8.
- **Grade separation.** It now comes from Overture's exact bridge, tunnel and level ranges, split per segment (234 km of mapped structures, 12 km of tunnels). Short culverts stay near grade, and road tunnels are not drawn on the surface.
- **Metro.** Lucknow Metro is now its own system: U-girder viaduct, T-piers, twin tracks, 17 elevated stations, and surface entrances for the 4 underground stations. The tunnel alignment shows as a dashed line, and animated 4-car trains run on the viaduct. Phase 1B (under construction) is deliberately not drawn.
- **Landmark precincts.**
  - Bara Imambara: the complete complex, including Asafi Masjid with three pear-shaped domes and 11 arches, Shahi Baoli, three gateways, the courts and the garden.
  - Chhota Imambara: the raised tank, the bridge over it, the twin mausoleums, the mosque, the gates and the gardens.
  - Ambedkar Memorial: a paved axial layout with the stupa, 62 elephants, obelisk rows and formal lawns.
- **CCS Airport.** Runway, taxiways, aprons and boundary come from Overture. Runway markings and an ATC tower are added.
- **New monuments.** All are procedural and anchored to Overture footprints or places:
  - Dubagga TV Tower (lattice) and the national flag at Janeshwar Mishra Park (waving, with a 24-spoke Chakra)
  - Satkhanda, Picture Gallery, Jama Masjid, Chhatar Manzil, Safed Baradari
  - Charbagh station, La Martinière, Dilkusha
  - Taj hotel, Renaissance, Ekana stadium
- **Ground.**
  - Big residential, institutional and cantonment polygons keep WorldCover's tree, grass and bare cover, so the Cantonment is no longer a flat green sheet.
  - Fields get individual parcel tones.
  - Stale WorldCover water becomes wetland or sand.
- **Colours.** Natural river colour (no cyan), more neutral wall palettes, softer greens. Random trees are kept out of the landmark precincts and the airport.

## 2. Main files
- **New:** `src/city/metroSystem.ts`, `scripts/py/build_hydrology.py`, `build_transport_extract.py`, `build_metro.py`, `build_landmark_sites.py`
- **Rewritten:** `src/city/landmarks.ts`
- **Modified:** `overlayGeometry.ts`, `ribbon.ts`, `cityOverlay.ts`, `tileStreamer.ts`, `buildingMaterial.ts`, `metroStations.ts`, `scripts/build_transportation.ts`, `place_vegetation.ts`, `bake_hlod.ts`, `suppress_conflicts.ts`, `py/build_ground.py`
- **Generated:** `src/city/landmarkSites.ts`

## 3. Data corrections
These are tracked override files that survive rebuilds:
- `data/overrides/water_overrides.geojson`: remove, reclass or add water features. Currently empty, because classification alone removed the false canals.
- `data/overrides/landmarks.json`: landmark anchors and precinct extents. The Bara Imambara complex matches the NMA coordinates to within 25 m.

New downloads:
- Overture `segment` (100 MB) for exact bridge and tunnel ranges.
- Overture `place` for monument locations.

## 4. Landmarks
All landmark models are procedural reconstructions, not photogrammetry:
- **Complexes:** Bara Imambara with Asafi Masjid, Rumi Darwaza, Chhota Imambara, Ambedkar Memorial.
- **Monuments:** Clock Tower, Residency, Vidhan Bhavan, Dubagga TV Tower, the flag, and the 11 further monuments listed above.

## 5. Transport and water
Roads, flyovers, rail, metro, rivers and canals now each use their own geometry and elevation rules. Bridge outlines from the infrastructure layer are not used yet; they come from segment ranges only.

## 6. Remaining inaccuracies
- **TV tower height.** The Dubagga TV Tower height (150 m) is an estimate; no published figure was found.
- **Landmark layouts.** Ambedkar Park and the Imambara gardens are schematic layouts, not surveyed plans.
- **Assumed geometry.** Taj and Renaissance massing comes from Overture footprints with assumed heights.
- **Not implemented:**
  - Ghats, promenades and per-reach riverbank variety.
  - Dual-carriageway medians.
  - Road markings at junctions.
- **Cantonment ground.** Ground colour in the Cantonment shows patchy blotches where the 10 m canopy class meets other classes.
- **Not reviewed in close-up:** Satkhanda, Picture Gallery, Jama Masjid, Chhatar Manzil, Safed Baradari, Charbagh, La Martinière, Dilkusha and Ekana. Only the Taj and Renaissance were checked in a dedicated shot; the others appear only incidentally in other views.

## 7. Run locally
```bash
npm run dev            # http://localhost:3000 (PORT=3100 for a second copy)
```
To regenerate data:
```bash
python -I scripts/py/build_hydrology.py && python -I scripts/py/build_transport_extract.py && python -I scripts/py/build_metro.py && python -I scripts/py/build_landmark_sites.py && python -I scripts/py/build_ground.py && npm run transport && npm run data:city
```
