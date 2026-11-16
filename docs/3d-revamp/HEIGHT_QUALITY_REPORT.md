# Building height quality report

Generated 2026-11-16T07:46:46.396Z by `scripts/build_buildings.ts`.

Footprints: Overture Maps release 2026-10-21.0 (`building` + `building_part`), 956,304 building records
after building parts replace their parents (105 parents replaced by parts).

## Height sources

| Source | Kind | Buildings | Share |
|---|---|---:|---:|
| `gob25d` | observed | 581,071 | 60.76% |
| `model` | inferred | 375,108 | 39.22% |
| `floors` | derived | 108 | 0.01% |
| `part` | derived | 14 | 0.00% |
| `overture_height` | observed | 3 | 0.00% |

- `overture_height`: the source `height` attribute (surveyed or mapper-entered).
- `part`: Overture `building_part` height or floor count.
- `floors`: source `num_floors` x typology floor height (+0.9 m parapet/plinth). An estimate, not a measurement.
- `gob25d`: Google Open Buildings 2.5D Temporal, 2023 layer, 2 m sampling of the 0.5 m raster (about 4 m effective
  resolution). Interior pixels only, presence score >= 0.35 (an uncalibrated model score, used as a filter, not a probability),
  at least 3 valid pixels and 20% of owned pixels. Median for large footprints, upper quartile for small ones (edge blending
  biases small roofs low). The model's height accuracy was evaluated outside the Global South; treat as a model estimate.
- `model`: no usable observation. Median of observed heights in the surrounding 375 m x 375 m, scaled by footprint
  size, with deterministic per-building jitter; typology priors where the neighbourhood has fewer than 5 observations.

## Quality

| Quality | Meaning | Buildings |
|---|---|---:|
| A | source height, or raster with >= 12 valid interior pixels covering >= 40% and presence >= 0.5 | 139,549 |
| B | floors-derived, or raster with fewer/partial samples | 441,647 |
| C | inferred by the neighbourhood model | 375,108 |

## Height distribution (all records)

| < 4 m | 4-7 | 7-10 | 10-13 | 13-18 | 18-26 | 26-40 | >= 40 m |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 316,152 | 432,050 | 170,989 | 28,544 | 5,867 | 1,538 | 893 | 271 |

The old pipeline put 99.99% of buildings in a uniform 12-26 m band (`12 + hash % 15`).

## Typology

| Typology | Buildings |
|---|---:|
| GENERIC | 640,362 |
| PLANNED | 227,918 |
| OLD_CITY | 62,605 |
| MARKET | 11,526 |
| INDUSTRIAL | 7,752 |
| INSTITUTIONAL | 3,366 |
| APARTMENT | 2,350 |
| HERITAGE | 425 |

Typology comes from source class/subtype, the land-use class under the footprint (Overture land use + ESA WorldCover),
neighbourhood statistics on a 125 m grid (density, orientation coherence for planned layouts), height, and a few manually
drawn zones (old city, bazaar cores, heritage precincts) listed in `scripts/build_buildings.ts` (`ZONES`).

## Validation against source floor counts / heights

Raster median minus floors-derived height over 134 buildings with both: median difference
-2.3 m, mean absolute difference
4.1 m.

| Name / id | src height | src floors | reference m | raster median m | valid/owned px | presence |
|---|---:|---:|---:|---:|---:|---:|
| Ganga Dhar Goswami House |  | 2 | 7.1 | 6.8 | 17/33 | 0.70 |
| Mishra's Mangalam |  | 2 | 7.2 | 6.2 | 35/68 | 0.58 |
| Staylo masterprice Palace | 32 | 4 | 32.0 | 5.5 | 60/117 | 0.48 |
| Lucknow West |  | 3 | 10.2 | 3.0 | 1/9 | 0.18 |
| Lucknow Charbagh Station |  | 1 | 7.4 | 8.8 | 2829/3436 | 0.73 |
| Rai Niwas |  | 2 | 7.1 | 6.6 | 54/84 | 0.68 |
| Chowdhary Bhawan |  | 2 | 7.1 | 8.9 | 44/75 | 0.59 |
| sunrise |  | 4 | 13.3 | 6.1 | 37/65 | 0.57 |
| archita |  | 2 | 7.1 | 11.2 | 45/74 | 0.64 |
| 8304fcf0 |  | 2 | 7.1 | 7.9 | 105/147 | 0.73 |
| Mishra Bhawan |  | 3 | 10.2 | 10.6 | 71/108 | 0.72 |
| janma |  | 2 | 7.1 | 8.6 | 28/54 | 0.73 |
| Pandey Niwas |  | 2 | 7.1 | 7.1 | 74/120 | 0.69 |
| Arun Niwas |  | 2 | 7.1 | 7.3 | 23/53 | 0.60 |
| City Montessori School Rajajipuram Campus I |  | 4 | 16.5 | 12.6 | 1693/3729 | 0.38 |
| 8aa32487 |  | 5 | 17.4 | 14.6 | 24/46 | 0.74 |
| Bansal Bhawan |  | 4 | 14.1 | 10.2 | 51/99 | 0.57 |
| c20c6407 |  | 4 | 14.1 | 8.4 | 19/41 | 0.72 |
| 0de7e0bb |  | 5 | 18.9 | 5.9 | 43/65 | 0.57 |
| Kusum Deep Complex |  | 7 | 34.5 | 22.2 | 190/267 | 0.71 |
| Husainabad Clock Tower | 67 |  | 67.0 | n/a | 0/18 | 0.19 |
| aba2d8da |  | 7 | 28.2 | 16.2 | 125/197 | 0.63 |
| Aashiyana |  | 2 | 7.2 | 5.3 | 11/41 | 0.41 |
| 2d6eab21 |  | 2 | 7.1 | 8.7 | 75/156 | 0.55 |
| 01eb74ec |  | 2 | 10.5 | 10.0 | 201/267 | 0.90 |
| Post Master General's Office |  | 3 | 11.7 | 12.1 | 303/519 | 0.59 |
| 327e1b05 |  | 2 | 8.1 | 4.3 | 13/34 | 0.57 |
| cfaa9f68 |  | 3 | 11.7 | 13.1 | 139/212 | 0.54 |
| af44fde3 |  | 2 | 8.1 | 7.5 | 9/13 | 0.47 |
| f6399c69 |  | 4 | 15.3 | 6.0 | 88/181 | 0.47 |
| 47a263f9 |  | 5 | 20.4 | 13.3 | 1142/1364 | 0.57 |
| 0c8a8c53 |  | 9 | 33.3 | 38.4 | 4/20 | 0.66 |
| Nav Chetna Kendra |  | 7 | 26.1 | 14.4 | 592/785 | 0.67 |
| Imperial Crest |  | 10 | 30.9 | 30.0 | 516/1153 | 0.41 |
| Colosol Appartment |  | 4 | 13.3 | 15.2 | 158/236 | 0.66 |
| Jewell Appartment |  | 8 | 24.9 | 17.4 | 428/582 | 0.60 |
| aa5cbe3f |  | 1 | 4.0 | n/a | 0/21 | 0.14 |
| ca3f597a |  | 3 | 10.2 | 10.3 | 304/425 | 0.61 |
| City Montessory School |  | 4 | 13.3 | 2.2 | 15/598 | 0.17 |
| d3db1930 |  | 4 | 15.3 | 11.2 | 23/49 | 0.62 |
| 9af50a27 |  | 1 | 4.8 | 3.2 | 120/471 | 0.29 |
| Sinha Dental Clinic | Implant & Digital Dentistry Centre, Lucknow |  | 1 | 4.5 | 6.6 | 725/963 | 0.58 |
| 71185359 |  | 2 | 7.1 | 7.9 | 28/77 | 0.44 |
| ec3f6f31 |  | 4 | 12.9 | 9.7 | 500/749 | 0.54 |
| 443b51e4 |  | 4 | 12.9 | 8.7 | 370/628 | 0.53 |
| 371c308b |  | 4 | 12.9 | 10.7 | 327/553 | 0.50 |
| 806978ef |  | 4 | 12.9 | 10.6 | 469/682 | 0.59 |
| 186dc4ff | 20 | 4 | 20.0 | 9.7 | 285/509 | 0.64 |
| Vasundhara Complex |  | 3 | 11.7 | 6.3 | 58/104 | 0.57 |
| 529E/87 |  | 4 | 13.5 | 10.8 | 30/74 | 0.52 |
| 15fef11b |  | 3 | 11.7 | 6.2 | 10/25 | 0.53 |
| c75a5565 |  | 3 | 11.7 | 6.7 | 27/48 | 0.62 |
| 3b97a86c |  | 2 | 8.1 | 17.0 | 13/38 | 0.64 |
| f81f39a6 |  | 3 | 11.7 | 10.1 | 18/46 | 0.49 |
| 727b76be |  | 2 | 8.1 | 8.8 | 4/13 | 0.71 |
| 4cd63834 |  | 2 | 8.1 | 4.9 | 8/20 | 0.72 |
| c941da1c |  | 2 | 8.1 | 6.8 | 8/10 | 0.55 |
| f9d0f830 |  | 4 | 15.3 | 10.6 | 33/59 | 0.54 |
| 99a597b4 |  | 4 | 15.3 | 11.6 | 25/49 | 0.66 |
| 7b2af9e1 |  | 3 | 11.7 | 10.6 | 21/44 | 0.63 |

Raster coverage: 956,369 footprints sampled; buildings modelled because no usable observation: 375,121.
Building-part parents: 105. Raster values rejected as implausibly slender (height > max(11 m, 3.2 x sqrt(area)), raster bleed from adjacent towers): 870.
