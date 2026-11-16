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
