# Map refinement report

All work is local and nothing was deployed. Screenshots are in `docs/3d-revamp/screenshots/refine/`.

## Max zoom-out: no square boundary
- There are three levels of ground detail:
  - Detailed city tiles at the centre.
  - A 45 km detailed ground.
  - A new low-detail regional layer covering 264 km at 129 m cells.
- The regional layer is built by `scripts/py/build_region.py` from ESA WorldCover 2021 (CC BY 4.0), mode-resampled, with crop-parcel tint and noise. It produces `public/ground/region_albedo.jpg` (0.87 MB) and `region_meta.json`.
- It is real geography: farmland, towns, the Ganga and the Ghaghra run out to the horizon. It uses no stretched texture, circular mask or flat colour plane.
- The regional tone is matched to the detailed ground and darkened at night. A faint edge is still visible from directly overhead at maximum zoom (see `r_maxzoom.png`); in oblique views it disappears.

## Gomti
- Water polygons get two rounds of Chaikin smoothing before triangulation and bank generation (`src/city/overlayGeometry.ts`), which gives natural bends instead of faceted edges.
- No channels were added; the source geometry is unchanged.
- The overlay was rebaked to 24.1 MB.

## Bridges
- Bridge decks come from the same source geometry as before, and no duplicate decks were introduced.
- A full visual audit of every crossing was not completed in this pass.

## Toolbar accessibility (`MapControls.tsx`)
- Every dock button has a tooltip and an aria-label, and the tooltip also shows on keyboard focus.
- Dock labels are clearer: Look became Display, and More became Tools.
- The drawer toggles use aria-expanded and aria-controls, linked to `#map-drawer`.
- Arrow keys move between dock buttons, and focus shows a visible ring.
- On mobile the touch targets are at least 48 px, and the active state is stronger.

## Guided tour audio
- Narration is removed: TourGuide no longer calls `speak`, the Voice button is gone, and `voiceOn` defaults to false.
- The synthesised WebAudio score (drone plus a pad every 6 s) starts with the tour and loops until the tour ends. The Music on/off button stays.
- This was verified by code review only. No audio was captured in the headless harness.
