/**
 * landmarkRegistry — curated list of Lucknow landmarks that get dedicated geometry.
 *
 * Dependency-free on purpose: this module is imported by the renderer, by the tile
 * worker (to suppress bulk extrusions inside a landmark footprint) and by the
 * offline baker (same reason), so it must not pull in three.js.
 *
 * PROVENANCE — this matters, do not blur it:
 *   source: 'places'  x/z copied verbatim from public/overture_tiles_full/
 *                     places_labels.json, i.e. real Overture place records.
 *   source: 'curated' x/z positioned by hand relative to a nearby confirmed record,
 *                     because the dataset has no entry for that monument. These are
 *                     accurate to roughly a city block, not to the metre.
 *
 * The `type` field in places_labels.json is unreliable (Charbagh Railway Station is
 * tagged "beauty_salon", Ekana Stadium "resort", Rumi Gate "real_estate"), so the
 * architectural archetype below is asserted here rather than read from the data.
 */

export type LandmarkArchetype =
  | 'stadium'
  | 'imambara'
  | 'gateway'
  | 'station'
  | 'memorial'
  | 'assembly'
  | 'terminal'
  | 'tower'
  | 'mall'
  | 'campus'
  | 'flagpole';

export interface LandmarkDef {
  id: string;
  name: string;
  /** World metres, same coordinate space as the building tiles. */
  x: number;
  z: number;
  archetype: LandmarkArchetype;
  /** Overall footprint radius in metres; also the bulk-building suppression radius. */
  radius: number;
  /** Ridge/roof height in metres. */
  height: number;
  /** Y-rotation in radians. */
  rotation?: number;
  /**
   * Bulk-building suppression radius in metres. Defaults to `radius * 0.92`.
   * Set explicitly where the *site* is far larger than the built form — an
   * airport's terminal is 185 m across but its airfield is kilometres wide.
   */
  suppressRadius?: number;
  /** Ranking for labels and camera presets. */
  importance: number;
  source: 'places' | 'curated';
}

/** Rumi Darwaza — the anchor the two Imambaras are positioned relative to. */
const RUMI_X = -3839;
const RUMI_Z = -2401;

export const LANDMARKS: LandmarkDef[] = [
  // ── Stadiums ──────────────────────────────────────────────────────────────
  {
    id: 'ekana', name: 'Ekana Cricket Stadium',
    x: 2723, z: 8446, archetype: 'stadium',
    radius: 165, height: 46, rotation: 0.35, importance: 10, source: 'places',
  },
  {
    id: 'kdsingh', name: "K D Singh 'Babu' Stadium",
    // Was (-2854, -521), which is the ONE outlying Overture record; the other
    // records for this stadium cluster 1.6 km east. Consensus of that cluster.
    x: -1136, z: -659, archetype: 'stadium',
    radius: 95, height: 24, rotation: 0.9, importance: 8, source: 'places',
  },
  {
    id: 'chowk-stadium', name: 'Chowk Stadium',
    x: -4071, z: -2094, archetype: 'stadium',
    radius: 70, height: 17, rotation: 0.2, importance: 6, source: 'places',
  },

  // ── Old Lucknow monuments ─────────────────────────────────────────────────
  {
    // Rotation is not decorative: buildGateway() puts its two piers apart
    // along local X and the walk-through gap along local Z, so at rotation 0
    // the passage runs north-south. The real gate spans Husainabad Road,
    // which runs east-west here (Bara Imambara sits ~270 m due west of this
    // point), so the gap must run east-west too — a quarter turn, not a
    // 17-degree nudge like the previous value.
    id: 'rumi-darwaza', name: 'Rumi Darwaza',
    x: RUMI_X, z: RUMI_Z, archetype: 'gateway',
    radius: 26, height: 18, rotation: Math.PI / 2, importance: 10, source: 'places',
  },
  {
    // No dataset entry. Bara Imambara is ~270 m west of Rumi Darwaza, its main
    // entrance facing the gate. Verified against Google Maps.
    // buildImambara()'s arcaded grand facade runs along local Z=+-hallD/2 at
    // rotation 0, i.e. facing north/south. The facade has to face the
    // Husainabad Road approach (east, toward the gate), so this also needs
    // the quarter turn — same road, same fix as Rumi Darwaza above.
    id: 'bada-imambara', name: 'Bara Imambara',
    x: RUMI_X - 270, z: RUMI_Z - 22, archetype: 'imambara',
    radius: 120, height: 32, rotation: Math.PI / 2, importance: 10, source: 'curated',
  },
  {
    // No dataset entry. Chota Imambara is ~800 m due west of Rumi Darwaza along
    // Husainabad Road, at essentially the same latitude. Verified against Maps.
    // Same road, same facade-orientation fix as Bara Imambara above.
    id: 'chota-imambara', name: 'Chota Imambara',
    x: RUMI_X - 798, z: RUMI_Z - 4, archetype: 'imambara',
    radius: 78, height: 26, rotation: Math.PI / 2, importance: 9, source: 'curated',
  },
  {
    id: 'clock-tower', name: 'Hussainabad Clock Tower',
    // ~467 m west of Rumi Darwaza, between Bara and Chota Imambara along
    // Husainabad Road. Position curated from Maps; the Overture "Ghanta Ghar"
    // record at (-4216, -2354) is 90 m too far east.
    // 221 ft (67.4 m): the tallest clock tower in India, 1881.
    x: RUMI_X - 467, z: RUMI_Z + 11, archetype: 'tower',
    radius: 16, height: 67.4, importance: 9, source: 'curated',
  },

  {
    // The 207 ft (63.1 m) national flagpole in Janeshwar Mishra Park, Gomti
    // Nagar — the tallest in Uttar Pradesh and a replica of the Connaught Place
    // pole. Position from the park's own place record.
    id: 'janeshwar-flag', name: 'National Flag, Janeshwar Mishra Park',
    x: 3837, z: 1678, archetype: 'flagpole',
    radius: 30, height: 63.1, rotation: 0.4, importance: 8, source: 'places',
    // The park is 376 acres; only the flag plaza should clear bulk geometry.
    suppressRadius: 60,
  },

  // ── Civic / transport ─────────────────────────────────────────────────────
  {
    id: 'charbagh', name: 'Lucknow Charbagh Railway Station',
    x: -1499, z: 1574, archetype: 'station',
    radius: 130, height: 30, rotation: 0.1, importance: 10, source: 'places',
  },
  {
    id: 'vidhan-sabha', name: 'Vidhan Sabha (Legislative Assembly)',
    // Was (-738, 4200) — the lone outlier, 3.5 km south of the real building.
    // Four records (UPVidhansabha, Uttar Pradesh Legislative Assembly,
    // Vidhansabha Bhawan, Vidhan Bhawan Gate No 1) cluster here instead.
    x: -703, z: 634, archetype: 'assembly',
    radius: 88, height: 40, rotation: 0.0, importance: 9, source: 'places',
  },
  {
    id: 'ambedkar-memorial', name: 'Ambedkar Memorial Park',
    x: -1407, z: -1452, archetype: 'memorial',
    radius: 130, height: 38, rotation: 0.0, importance: 9, source: 'places',
  },
  {
    id: 'airport', name: 'Chaudhary Charan Singh International Airport',
    x: -9988, z: 9769, archetype: 'terminal',
    radius: 185, height: 22, rotation: 0.62, importance: 10, source: 'places',
    // Clears the whole airfield, not just the terminal building.
    suppressRadius: 1500,
  },

  // ── Contemporary ──────────────────────────────────────────────────────────
  {
    id: 'phoenix-palassio', name: 'Phoenix Palassio',
    x: 5433, z: 1427, archetype: 'mall',
    radius: 105, height: 34, rotation: 0.25, importance: 8, source: 'places',
  },
  {
    id: 'lucknow-university', name: 'University of Lucknow',
    // Overture "Lucknow University" record at (-3454, -6234) is an outlier 6 km
    // north of the real campus. The main campus (Badshah Bagh / Senate House) is
    // at ~26.853°N, 80.934°E — verified against Maps and the Lucknow University
    // metro station.
    x: -1594, z: -337, archetype: 'campus',
    radius: 110, height: 24, rotation: 0.4, importance: 8, source: 'curated',
  },
  {
    id: 'sgpgi', name: 'SGPGI',
    x: -315, z: 11421, archetype: 'campus',
    radius: 120, height: 28, rotation: 0.15, importance: 8, source: 'places',
  },
];

/**
 * Squared-distance test used by the worker and the baker to drop bulk Overture
 * extrusions that would otherwise poke through a landmark's dedicated geometry.
 * Suppression radius is slightly under the visual radius so the surrounding urban
 * fabric still runs right up to the monument.
 */
export function isInsideLandmark(x: number, z: number): boolean {
  for (const lm of LANDMARKS) {
    const r = lm.suppressRadius ?? lm.radius * 0.92;
    const dx = x - lm.x;
    const dz = z - lm.z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
