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
  /** Anchor to a landmark by id, taking its real coordinates. */
  landmarkId?: string;
  /** Explicit world position, used when landmarkId is absent. */
  x?: number;
  z?: number;
  azimuth: number;
  /** Radians from horizontal; small = low oblique, PI/2 = straight down. */
  pitch: number;
  distance: number;
}

export const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  /** High oblique over the whole city with the Gomti crossing frame. */
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
    landmarkId: 'ekana',
    azimuth: 1.15, pitch: 0.42, distance: 850,
  },

  /** Bara Imambara and Rumi Darwaza in one frame. */
  oldlucknow: {
    label: 'Old Lucknow',
    landmarkId: 'bada-imambara',
    azimuth: 2.4, pitch: 0.34, distance: 900,
  },

  /** Rumi Darwaza close architectural framing. */
  rumi: {
    label: 'Rumi Darwaza',
    landmarkId: 'rumi-darwaza',
    azimuth: 1.57, pitch: 0.25, distance: 320,
  },

  /** Hussainabad Clock Tower hero perspective. */
  clocktower: {
    label: 'Clock Tower',
    landmarkId: 'clock-tower',
    azimuth: 0.8, pitch: 0.28, distance: 380,
  },

  /** Vidhan Sabha (Legislative Assembly). */
  vidhansabha: {
    label: 'Vidhan Sabha',
    landmarkId: 'vidhan-sabha',
    azimuth: 0.1, pitch: 0.32, distance: 680,
  },

  /** Ambedkar Memorial Park complex, Gomti Nagar. */
  ambedkar: {
    label: 'Ambedkar Memorial',
    landmarkId: 'ambedkar-memorial',
    azimuth: 1.75, pitch: 0.36, distance: 950,
  },

  /** Railway district. */
  charbagh: {
    label: 'Charbagh',
    landmarkId: 'charbagh',
    azimuth: 0.35, pitch: 0.36, distance: 1000,
  },
};
