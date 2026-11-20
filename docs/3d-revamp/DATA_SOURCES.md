# Data sources for the 3D city

Everything the map needs at runtime is a local file under `public/`. Nothing calls a remote API, and no API key is needed to show the map. No paid data, imagery or models are used.

This file lists every geographical source and every asset source, with its licence, required attribution and any restrictions. `LOCAL_IMPLEMENTATION_REPORT.md` explains how each one is processed.

## Geographical data

| Source | Used for | Version / date | Licence | Download |
|---|---|---|---|---|
| Overture Maps `building` | Footprints for all 956,233 buildings, IDs, and the rare source height, floors, class and roof shape | Release `2026-10-21.0` (schema v2) | ODbL 1.0. The theme mixes OpenStreetMap, Google Open Buildings (CC BY 4.0 / ODbL) and Microsoft ML Buildings (ODbL) | `overturemaps download --bbox 80.7501301,26.6500106,81.149975,27.0499301 -f geojsonseq -t building` |
| Overture Maps `building_part` | Parts and their heights or floor counts (180 above-ground parts in Lucknow) | `2026-10-21.0` | ODbL 1.0 | same command with `-t building_part` |
| Overture Maps `land_use` | Parks, campuses, plazas, industry, residential land and farmland in the ground surface and typology | `2026-10-21.0` | ODbL 1.0 | `-t land_use` |
| Overture Maps `water` | Water and river surfaces in the ground raster | `2026-10-21.0` | ODbL 1.0 | `-t water` |
| Overture Maps `land_cover`, `infrastructure` | Downloaded and inspected. Not used, because the WorldCover raster is the better land-cover source | `2026-10-21.0` | ODbL 1.0 / CDLA | `-t land_cover`, `-t infrastructure` |
| Overture transportation, places (existing) | Roads, rail, labels and search. These were not re-downloaded; they are the existing `data/lucknow_transportation_extracted.json` and tile places | `2026-07-22.0` | ODbL 1.0 (places: CDLA Permissive 2.0) | existing pipeline |
| Google Open Buildings 2.5D Temporal | Building heights for 579k buildings (61%) | v1, 2023 layer (imagery 2023) | CC BY 4.0 (also available under ODbL; **CC BY 4.0 is the one used here**) | public bucket `gs://open-buildings-temporal-data/v1` via `https://storage.googleapis.com/...`; see `scripts/py/fetch_gob25d.py` |
| ESA WorldCover 10 m | Land-cover classes for the ground surface, tree placement and typology | 2021 v200, tiles N24E078, N24E081, N27E078, N27E081 | CC BY 4.0 | `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/` |
| Copernicus DEM GLO-30 | Landform shading only: hillshade and low-ground moisture in the ground texture | COG tiles N26/N27 × E080/E081 | Copernicus DEM licence: free use with attribution | `https://copernicus-dem-30m.s3.amazonaws.com/` |
| Copernicus DEM GLO-90 (existing) | The landing page's Geography tab (unchanged) | existing `public/geo/lucknow_dem.json` | Copernicus DEM licence | existing |

### Required attribution

Show this wherever the map is published:

> Building footprints, roads, land use and water © OpenStreetMap contributors (ODbL), Overture Maps Foundation, Google Open Buildings (CC BY 4.0) and Microsoft ML Buildings (ODbL).
> Building heights: Google Open Buildings 2.5D Temporal (Google Research, CC BY 4.0), model estimates.
> Land cover: © ESA WorldCover project 2021 / contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover consortium (CC BY 4.0).
> Elevation: Copernicus DEM GLO-30, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.

### Restrictions and caveats

- **ODbL share-alike.** Derived databases built from Overture/OSM data (the tiles, the HLOD and `building_provenance.csv`) are ODbL derivative databases if they are distributed. Rendered images and screenshots are "produced works" and need attribution only.
- **Google Open Buildings 2.5D heights are model outputs.** They are not survey measurements. Google evaluated the model's height accuracy outside the Global South. The `presence` score is an uncalibrated model score: it is used here as a filter, never as a probability.
- **WorldCover is 10 m classification.** It is used for broad land cover, not as a ground texture.
- **The Copernicus DEM is a surface model** that includes buildings and canopy. It is used only after heavy smoothing, for shading, never as terrain height (see the report).

## Investigated and not used

| Source | Finding |
|---|---|
| OpenAerialMap | Catalogue query for bbox 80.75–81.15 E, 26.65–27.05 N on 16 Nov 2026 returned **0 images**. No usable imagery exists. |
| Bhuvan (ISRO) | Not used. Its portal imagery is not licensed for redistribution as a local high-resolution texture. |
| Google Earth / Maps imagery and 3D tiles | Not used, by design: proprietary, and scraping is prohibited. |
| Earth Engine (`GOOGLE/Research/open-buildings-temporal/v1`) | Not needed. The same rasters are in Google's public bucket, read anonymously by the importer, so no Earth Engine account or authentication is involved. |

## Assets

| Asset | Source | Licence |
|---|---|---|
| Building facades, roof surfaces, roads, ground detail, water | Procedural shaders written for this project (`buildingMaterial.ts`, `roadMaterial.ts`, `groundSurface.ts`, `cityOverlay.ts`) | Project code |
| Tree models (neem, mango, ashoka, peepal/banyan, eucalyptus, palm) | Procedural geometry (`treePrototypes.ts`) | Project code |
| Landmark models (Rumi Darwaza, Bara Imambara, Chhota Imambara, Husainabad Clock Tower, The Residency, Vidhan Sabha, Ambedkar Memorial) | Procedural geometry (`landmarks.ts`), anchored to Overture footprints (`public/landmarks/footprints.json`) | Project code. Footprints are ODbL |
| Poly Haven textures | Considered, but **not used**. The procedural materials avoided adding texture downloads, and no texture is fetched at runtime. Poly Haven assets are CC0 if added later. | CC0 (not bundled) |

No purchased models, no paid imagery and no remote texture URLs are used.
