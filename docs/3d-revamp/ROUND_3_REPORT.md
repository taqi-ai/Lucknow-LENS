# Round 3 report (partial delivery)

**Status: Round 3 is NOT complete.** Stage 1 (geographical integrity) is done and verified. Parts of the destination, search and tour work are done. Most of the landmark reconstruction (Charbagh, Hussainabad detail, Janeshwar Mishra Park, Hazratganj, night lighting, labels) was not started. Details below.

## Limitations of the inputs
- The user's bug screenshots (overlapping roads, false water, Cantonment, Dariya Wali Masjid) were not in the repository. Diagnosis is from the data and the code, not from those images.
- Reference images found in the repo root: Charbagh (front and overhead), Rumi Darwaza with Bara Imambara, Ambedkar Memorial, Janeshwar Mishra Park, and an aerial night photo of Gomti Nagar. They are catalogued in `references/round-3/REFERENCE_MANIFEST.md` (originals untouched). Later additions (a second night photo, Vidhan Sabha, Phoenix Palassio) are catalogued too.
- No network research was done this session, so no new data or imagery sources were fetched.

## Stage 0: diagnosis (measured)
| Finding | Evidence |
|---|---|
| Major roads were drawn twice, by `CityOverlay` and by the streamed tiles | 16,660 of 16,666 overview road IDs also appear in tile files |
| The two copies of an elevated road had different shapes | The overlay builds one elevation profile per whole feature. Tiles built per-tile profiles with seam vetoes and then added a further +6.8 m mesh offset. That is the double flyover deck and the floating ends. |
| `polygonOffset` was the intended tie-break | The renderer uses a logarithmic depth buffer, where polygonOffset is not a reliable separator (not verified in isolation) |
| Every elevated road is also major | 1,498 elevated tile runs, 0 non-major |
| Duplicate geometry inside Overture | 5 pairs of identical tertiary roads |
| Tiles carry no water | 0 waterways in all 6,940 tiles, so water has a single owner (the overlay) already |
| Non-open-water polygons were drawn as water | 41 `wastewater` and `basin` polygons |
| The four huge `canal_poly` polygons (67 to 342 ha) are very elongated (compactness about 0.002) | They look like linear river or canal channels at the city edge, not blobs. Left in place; not verified against imagery. |
| Existing camera presets pointed at the wrong places | `charbagh` pointed about 1.1 km from the station site, and `ekana` about 4.5 km from the stadium |

## Stage 1: what was changed
- **Render ownership.** `overlayOwnsRoad()` in `src/city/ribbon.ts` is the single rule: the overlay owns every major, elevated or level>0 road, and tiles draw only the local network. The tile worker filters at runtime, so no tile regeneration was needed. Verified: 0 of 174,223 tile road runs are also drawn by the overlay (`npx tsx scripts/validate_geo.ts`).
- **No lamps under decks.** Streetlights are no longer placed on elevated roads.
- **Road dedupe.** Identical quantised geometry (endpoints, vertex count, level, class) is dropped when the overlay is built.
- **Water.** `wastewater` and `basin` polygons are no longer drawn as water.
- **Rebaked** the overlay (`npm run bake`).
- **Visual check.** A flyover over the Gomti now renders as one deck (`screenshots/round-3/flyover_b.png`).
- **Validation.** `scripts/validate_geo.ts`, independent of the renderer: ownership, duplicates, dangling elevated endpoints and water classes.

## Other work done
- **Plaster colour.** Bara Imambara, Asafi Masjid and Rumi Darwaza now use a pale warm lime-plaster surface (the unused `TANK_WHITE` slot, active only on heritage typology). Chhota Imambara and the Clock Tower still use their original materials. The geometry is unchanged, so the gate count and arrangement are not corrected.
- **Destination registry** (`src/city/destinations.ts`): 17 destinations with ID, aliases, category, camera framing, quality tier and an honest status line. Camera targets come from the generated landmark sites.
- **Search.** Typing matches registry names and aliases first, with a featured list when the box is empty. Selecting a result flies to the registry preset.
- **Explore panel.** Places are grouped by category and use the registry. A "Play highlights" button runs a guided tour (9 s per scene, with Next and Stop).
- **Presets corrected** for Charbagh and Ekana.

## Highlights tour contents
Six scenes: Husainabad, Charbagh, CCS Airport, Ambedkar Memorial, Ekana, and the Gomti riverfront with the Taj hotel. That is six of the ten requested. Janeshwar Mishra Park and Hazratganj are deliberately **excluded**, because their dedicated models do not exist yet. The tour is a timed sequence of the existing camera transition. Orbits and pans were not added. The camera framings in the registry were not individually reviewed in screenshots, except Husainabad, Bara Imambara, Rumi, Charbagh, Ambedkar and Ekana, which were captured.

## Not done
- Charbagh forecourt, platform canopies and a separate Lucknow Junction (none exists in the data I checked). Three roads at the yard still end at the station wall; they were not investigated.
- Hussainabad corrections: gate count and arrangement from the NMA plan, Teele Wali Masjid, Dariya Wali Masjid (position unverified, no check of its overlap with roads), Chhota Imambara boundary check.
- Janeshwar Mishra Park lakes, islands, tracks. Ambedkar Memorial still uses its schematic layout.
- Hazratganj, Chowk, Aminabad, Kaiserbagh, La Martiniere and Residency district work; Taj hotel and TV tower rework; Ekana bowl detail; airport terminal.
- Cantonment vegetation, land-cover classification, Gomti ghats and promenades, water shader changes.
- Night lighting profiles. Label hierarchy, collision detection and new marker design.
- Debug mode for roads, water override dataset entries, topology-aware ramp rebuild (the existing round 2 elevation-profile logic was kept), and automated checks for water/building and landmark/road overlap.
- Per-site boundary enforcement and landmark spill checks.

## Measured performance
Headless Chrome on an RTX 4070 Laptop GPU, street scale: 223 to 240 fps, p95 frame time 5.4 to 6.7 ms, 301 to 463 draw calls, 2.9 to 4.9 M triangles (`screenshots/round-3/metrics.json`). Not compared against a pre-change baseline in the same session. GPU memory was not measured. Typecheck passes and the production build succeeds. The existing smoke tests were not run.

## Run locally
```bash
npm run dev            # http://localhost:3000
npx tsx scripts/validate_geo.ts
```
Screenshots: `docs/3d-revamp/screenshots/round-3/`.

## Update: later in the session
- **Charbagh station rebuilt** (`charbaghStation()` in `src/city/landmarks.ts`): red-brick body on the real footprint, white cornice, arched verandah front on the city side, and alternating turret/dome and chhatri rhythm on the roof, with a central domed block and two flanking towers. Counts and spacing are stylised; no plan was available. Screenshots: `charbagh_aerial.png`, `charbagh_oblique.png`, `charbagh_front.png`. Charbagh is now in the tour.
- **Night regression fixed.** The new plaster surface had dropped Bara Imambara out of the heritage night floodlight rule; it is restored (`night_bara.png`). The Rumi and Clock Tower night shot (`night_rumi_clock.png`) was captured but not reviewed.
- **Checked:** `tsc`, `vite build`, full `npm run build`, `npm run validate:city` and `npm run smoke` all pass. In the real UI, searching "ambedkar" lists the registry entry first, and Enter flies to the preset (the first Enter, pressed before the results appeared, did nothing). Not clicked through in the UI: Play highlights, Next, Stop, and the category list.
- **Data findings, no model change:**
  - Dariya Wali Masjid has an Overture place at (-3186, -2212). Overlap with roads was NOT checked.
  - The Overture place "Teele Wali Masjid,lucknow" is at (1642, -5890), far from Husainabad. It is probably a wrong place record; the real mosque's location was not established, so it was not modelled.
  - Janeshwar Mishra Park: three pond polygons already exist within about 2 km of the park flag (one 1,336 m long). The remaining gap is landscaping and boundaries, and none was built.
- **Known label noise.** A junk Overture place name ("iPhone 15 128GB price 5500 call me") shows next to the airport. Not filtered.
- **Still unverified:** NMA site plan for the Bara Imambara gates was not fetched. The Bara gate arrangement is therefore unchanged.

## Update: Hussainabad, flyovers and metro portals
- **NMA site plan unreadable.** The fetch failed with a certificate error, so the plan was not read. The gate layout follows the label list in the brief and the Rumi reference photo.
- **Bara Imambara gates:** reduced from three internal gateways to two (first triple gateway carrying the Naqqar/Naubat Khana gallery, second triple gateway), giving three forecourts. Each gateway is now three-arched. Rumi Darwaza stays the separate external gate. The east wall is opened where an Overture lane crosses it, so no wall stands on a road.
- **Chhota Imambara:** the compound used to run across a tertiary road (centreline about 18 m inside the drawn courtyard). Its outer edge, gateway, tank and gardens are pulled back, and the east wall moved in off a service lane. Checked in `chhota_top.png`; no road crosses the compound now.
- **Still not done:** Teele Wali Masjid and Dariya Wali Masjid (no trustworthy location in the data; not modelled), Asafi Masjid and Baoli were not changed, Husainabad Picture Gallery and Satkhanda were not reviewed.
- **Elevated roads (`buildElevationProfiles`).** An elevated end counted as "continued" if any other elevated end lay within 18 m, including the end of the parallel opposite carriageway. Both decks then held full height and stopped in mid-air. A continuation must now head onward (tangents opposed). Not verified against your original screenshot: I could not identify its exact spot; the three flyovers I checked now ramp down cleanly, and the deck-over-deck case there is the metro viaduct.
- **Metro portals.** The viaduct used to descend to ground level and lie on the road. At each tunnel end it now ramps over 330 m and dives 9 m below the surface, with a concrete headwall and dark opening where it passes through the ground. Depot (at-grade) ends still come down to the surface. Checked at the Hazratganj and Charbagh portals (`portal_hazratganj.png`, `portal_charbagh.png`). The tunnel itself is not visible; the faint dashed alignment on the ground remains. The ramp gradient is about 6.5%, steeper than a real metro; not corrected.

## Update: Janeshwar Mishra Park and hidden lakes
- **Cause of the missing lakes:** Overture already maps both lakes inside the park (16.0 and 12.6 acres against the official 14 and 18; the park polygon is 365 acres against 376). The overlay drew still water at -0.25 m, below the park polygon at +0.04 m, so the park painted over them. Rivers were unaffected.
- **Fix:** lakes, ponds and reservoirs are now drawn at +0.07 m, above the park layer, and get a thin stone bank when over 1 ha. The lakes show with their real irregular shorelines and an island (`jmp_top_before.png`, `jmp_oblique_before.png`; the file names say "before" but were re-captured after the fix).
- **Side effect:** every pond inside any park is now visible. Only the Janeshwar area was reviewed.
- **Not done:** the park interior is still a dense tree carpet, not the open dry lawns and palm lines of the reference photo. There are no fountains, no designed tracks, no boating or sports zones and no walkway lighting, and the island positions and shapes are Overture's, unverified. Janeshwar is back in the tour, but only the lakes are a real improvement; the landscape is not recognisably the park yet.

## Update: Janeshwar landscaping and flag position
- **Flag was in the lake.** The flag site (an Overture place coordinate, not a surveyed flag position) sat inside the 16-acre lake polygon, 16 m from its shore. Moved to (3837, 1738) on the south bank, 22 m from the water, in `data/overrides/landmarks.json`. This is a land point chosen by me, not the real flag's surveyed spot. The sites file, vegetation and HLOD were regenerated.
- **Designed-park planting.** `data/overrides/park_styles.json` and `scripts/place_vegetation.ts` now plant a styled park as open lawns with tree groves (low-frequency noise carves clearings) and a palm line 6 m inland of each lake shore, instead of the uniform tree grid. A new palm-heavy planting kind was added to `treePrototypes.ts`. Only Janeshwar uses it. Screenshots: `jmp_top.png`, `jmp_oblique.png`, `jmp_flag.png`.
- **Still approximate or missing:** the lawns are the default park green, not the dry khaki of the photo. No fountains, no boating zones, no sports facilities, no distinct jogging or cycling tracks (the existing OSM footpaths show), and no night lighting. Palm positions are procedural, not surveyed.

## Update: Hazratganj
- **What changed:** in the building shader (`buildingMaterial.ts`), market-typology buildings within 420 m of the Hazratganj chauraha (centre (-420, 340), taken from the Overture road label "Hazratganj Chauraha") get a colonial treatment: lime-washed ivory, ochre, grey or sage walls, an arcaded ground floor of 4.2 m arched bays with a muted signboard band, arched upper windows, a string course and a projecting cornice, instead of rolling shutters and bright signboards. Checked in `hazratganj_street.png`, `hazratganj_oblique.png`.
- **Limits:** this is shading, not geometry. There are no real colonnades or balconies, no pedestrian zones or sidewalk design, no heritage signage lettering and no period lamps. The precinct is a hard-coded circle in the shader, not a mapped boundary and not data-driven, so it also covers non-frontage blocks inside the circle. Only market-typology buildings are affected (about 70% of buildings in the old Hazratganj zone), so some buildings stay generic. Night appearance was not reviewed.
- Hazratganj is now Tier B and in the tour, but it is the weakest scene in it.

## Update: label clutter
Changes are in `src/city/labelManager.ts`. Checked in `labels_city.png` and `labels_neigh.png`.
- **District tier.** At city and district altitude, nine spaced-capital district names (Hazratganj, Hussainabad, Chowk, Aminabad, Charbagh, Alambagh, Cantonment, Gomti Nagar, Dubagga) rank above everything else. Their anchors are my choices from named places in the data, not boundaries, and Hussainabad's, Chowk's and Dubagga's are approximate. No Hindi names, because the source has none.
- **Name hygiene.** Advertising and phone-number names are dropped (221 of 47,963 matched the spam test, including the "iPhone 15" label). Names are cut at the first `|`, dash or comma, then truncated to 30 characters at a word boundary. A name now appears once per view, so chains such as Motilal Oswal show a single label.
- **Collision rules.** The label rectangles now use the real scaled size (the old code ignored the size setting), with 12 px and 7 px gaps (was 28). Labels may not leave the viewport or sit under the left toolbar, the top pill, the right dock or the footer credit. Labels shown last frame get a ranking bonus so they do not flicker as the camera moves.
- **Selection.** `setSelected(id)` forces a place label ahead of budgets and collisions. It is NOT yet called from the UI, so selecting a place does not use it.
- **Not done:** custom marker icons and category colours, hover and pulse states, smooth fade-in and fade-out (labels still pop), landmark labels anchored beside rather than on the building, the reserved screen rectangles are hard-coded pixel sizes (not measured from the real interface), and I did not test narrow phone widths or night mode.

## Update: night lighting
Changes are in `buildingMaterial.ts` and `roadMaterial.ts`. Checked in `night_hazratganj.png`, `night_ambedkar.png`, `night_city.png` and `night_bara.png` (earlier).
- **Per-building variation.** Each building's window light now has its own brightness (0.4x to 1.35x), so blocks no longer all glow identically. Far-field roof glow also varies per building.
- **Heritage profiles by material.** Lime-plastered walls and red sandstone/brick take a warm amber floodlight (sandstone strongest); white lime-washed domes a softer warm white; gilt finials their own gold glow. Lamp pools repeat about every 9 m along walls, softened so large flat faces do not look striped. These follow my reading of the night photographs in the repo root, not a measured lighting plan.
- **Hazratganj.** The arcaded shopfronts glow warm in each arch with a lit signboard band, and the old bazaar shopfront glow no longer applies inside the colonial precinct.
- **Roads.** The far-view continuous wash is weaker (0.38 to 0.20) and is broken up by low-frequency noise, so corridors read in stretches rather than as uniform strips. Near-field lamp pools are unchanged.
- **Not done:** parks still get no path lighting (they stay dark), no illuminated lake edges at Janeshwar, no riverfront or bridge lighting, no Charbagh platform or yard lighting, no distinct profiles for airport or railway, and no camera-distance logic beyond what existed. Night mode was not re-checked for Chowk, Aminabad or Charbagh. Road lamp pools at street scale are still broad.

## Update: park and riverfront lamps
- **What was added:** `scripts/place_lamps.ts` (`npm run lamps`, now part of `data:city`) writes extra lamps into the tiles: 856 along the shores of lakes and ponds over 1 ha, 1,955 along the Gomti channel polygons (one every 60 m, 9 m outside the bank) and 2,161 along park footpaths inside parks over 1.5 ha. The tile worker adds them to the ordinary streetlight instancing, so there are no new draw calls per lamp and the day/night and layer toggles apply to them.
- **Rejected:** lamps inside water, within a road corridor, in landmark precincts, or on elevated roads. Buildings are not checked, so a few lamps may sit inside or beside a building.
- **Checked** in `night_jmp_lake.png` and `night_gomti_taj.png`: Janeshwar's lake edges and park paths show as small warm points with the dark lakes readable, and the Gomti bank carries a dotted line of lamps. 
- **Limits:** the lamps are the standard road-lamp masts, not low bollards. They only appear at street and neighbourhood altitude at night, so they do not show in the wide aerial views. There is no lighting on the water, no bridge lighting, no fountains and no landmark-specific lighting at the riverfront. Riverfront positions come from the Overture river polygons, not a survey of the actual promenade, and ghats and promenades are still not modelled. Only the Janeshwar and Taj-area views were reviewed.

## Update: Ambedkar Memorial rebuilt
- **What changed** (`ambedkarMemorial()` in `landmarks.ts`), composed from the aerial reference photo in `references/round-3/parks/`: a paved core with an inlaid grid inside a lawn-and-tree precinct; two bean-shaped contour-stepped terraces in front; a gateway block; the stupa on a stepped base with four corner domes; a formal garden between four pillar rows; a long rear hall with two large domes; two rows of 31 elephants (62) either side of a water channel; and a stepped circular fountain plaza with a tall pillar ringed by red kiosks. Trees are now clumped on the lawns outside the core instead of two straight rows. Screenshots: `ambedkar_top.png`, `ambedkar_oblique.png`.
- **Still approximate:** positions, the terrace outlines, pillar counts and sizes come from the photograph by eye, not a plan. The 62 elephants are documented, but the 112 ft stupa height is a model value (the stupa here reaches about 40 m with its finial). The real plaza is red and cream sandstone; the model is mostly cream with red domes and kiosks, so it still reads paler than the photograph. The paved core is a rectangle, not the real outline. Night lighting for the new parts was not reviewed. This has not been compared side by side with the photograph at matching camera angles.

## Update: Ambedkar second rebuild (replaces the previous Ambedkar entry)
- Rebuilt after the user's oblique photo and a top-down map view. The top-down view is Google imagery, so it was used only for composition. Nothing was traced: the outline is the Overture precinct polygon and each feature sits at an eyeballed fraction of that polygon's bounding box.
- **Now:** all-paved precinct, four-lobed platform with a small stupa (NW), inlaid circular plazas (large one NE), a square court, two white domed halls (SE), a semicircular tiered amphitheatre (SW), a diagonal avenue of 62 elephants on pedestals, a small triangular pool (SE corner) and narrow edge tree strips plus one grove. No lawn margin. Screenshots `ambedkar_top.png`, `ambedkar_oblique.png`.
- **Wrong or missing against the references:** the elephant avenue is far shorter and sparser than the real one; the amphitheatre is a flat disc segment (no seating tiers or columns); the cloverleaf lobes read as concentric rings rather than white sculpted forms; the domed halls are simple blocks, and the real site's long rectangular buildings, pillar rows and fine patterned paving are absent. Positions are approximate; side-by-side comparison at matching angles was not done. Night lighting for the new layout was not checked.

## Update: Ambedkar avenue and amphitheatre detail
- **Amphitheatre:** eight stepped annular tiers rising toward the outer arc (alternating plaster tones), radial aisles, a low stage disc, and a 47-column colonnade with an entablature on the outer arc. Built in world axes so the arc faces west and the flat edge faces east, as in the references.
- **Avenue:** the 62 elephants (2 x 31, the documented count) now stand on larger pedestals along a long diagonal band with low parapets, shallow steps on both sides, a centre lane and four rows of lamp columns (extra to the 62).
- **Still not right:** the elephants are the same simple blocky statue; the real avenue is longer and denser than 62 statues at this spacing suggest, so the extra "marks" in the references are not reproduced beyond the lamp columns; the amphitheatre's tiers are smooth steps without seat rows or columns inside; proportions are by eye. Screenshots `ambedkar_top.png`, `amb_avenue.png`, `amb_amphi.png`. Night lighting not reviewed.
