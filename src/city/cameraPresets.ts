/**
 * Cinematic camera presets — framings over the same real Lucknow, not separate
 * scenes. Each entry either anchors to a landmark in landmarkRegistry (so the
 * framing stays correct if a position is refined) or names an explicit point.
 *
 * `distance` is a floor; landmark-anchored presets widen automatically for larger
 * subjects so Ekana and Rumi Darwaza both fill a comparable share of frame.
 */
export interface CinematicPreset {
  label: string;
  x: number;
  z: number;
  azimuth: number;
  /** Radians from horizontal; small = low oblique, PI/2 = straight down. */
  pitch: number;
  distance: number;
}

import { DESTINATIONS } from './destinations';

const LEGACY_PRESETS: Record<string, CinematicPreset> = {
  /** High oblique over the whole city with the Gomti crossing frame. */
  /** What you see through the cabin window while the map loads: low, oblique, the way a city looks from a descending flight. */
  window: {
    label: 'Window seat',
    x: -900, z: 600,
    azimuth: 0.55, pitch: 0.3, distance: 7000,
  },

  hero: {
    label: 'City Hero',
    x: -600, z: 400,
    azimuth: 0.85, pitch: 0.62, distance: 15000,
  },

  /** Low pass along the Gomti corridor through Gomti Nagar. */
  gomti: {
    label: 'Gomti Corridor',
    x: 1200, z: -600,
    azimuth: 2.05, pitch: 0.22, distance: 2400,
  },

  /** Dense commercial core — the best read on street canyons. */
  hazratganj: {
    label: 'Hazratganj',
    x: -382, z: 372,
    azimuth: 0.6, pitch: 0.30, distance: 900,
  },

  /** Stadium hero shot. */
  ekana: {
    label: 'Ekana Stadium',
    x: 6630, z: 4310,
    azimuth: 1.15, pitch: 0.42, distance: 850,
  },

  /** Bara Imambara and Rumi Darwaza in one frame. */
  oldlucknow: {
    label: 'Old Lucknow',
    // Midway between the Bara Imambara and Rumi Darwaza models (landmarkSites.ts).
    x: -3735, z: -2222,
    azimuth: 2.4, pitch: 0.34, distance: 900,
  },

  /** Rumi Darwaza close architectural framing. */
  rumi: {
    label: 'Rumi Darwaza',
    x: -3760, z: -2365,
    azimuth: 1.27, pitch: 0.25, distance: 320,
  },

  /** Hussainabad Clock Tower hero perspective. */
  clocktower: {
    label: 'Clock Tower',
    // The Husainabad Clock Tower footprint (Overture 0c0f3b55), where the model stands.
    x: -4176, z: -2675,
    azimuth: 0.8, pitch: 0.28, distance: 380,
  },

  /** Vidhan Sabha (Legislative Assembly). */
  vidhansabha: {
    label: 'Vidhan Sabha',
    x: -594, z: 700,
    azimuth: 0.1, pitch: 0.32, distance: 680,
  },

  /** Ambedkar Memorial Park complex, Gomti Nagar. */
  ambedkar: {
    label: 'Ambedkar Memorial',
    x: 2425, z: 139,
    azimuth: 1.75, pitch: 0.36, distance: 950,
  },

  /** Railway district. */
  charbagh: {
    label: 'Charbagh',
    x: -2599, z: 2111,
    azimuth: 0.35, pitch: 0.36, distance: 1000,
  },
};

/** Round 3: every registry destination is a preset named `dest:<id>`; legacy ids keep working. */
export const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  ...LEGACY_PRESETS,
  ...Object.fromEntries(DESTINATIONS.map((d) => [`dest:${d.id}`, {
    label: d.name, x: d.x, z: d.z, azimuth: d.azimuth, pitch: d.pitch, distance: d.distance,
  }])),
};
