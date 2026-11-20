/**
 * metroStations — curated Lucknow Metro Red Line stations and the underground
 * corridor, both of which the bulk transportation data gets wrong.
 *
 * PROVENANCE. Every coordinate here is a real position taken from
 * public/overture_tiles_full/places_labels.json (47,963 Overture places) — either
 * the station's own place record or, where Overture has no record for the
 * station, the landmark it is named after and sits beneath. Nothing is invented.
 * Anchors are then snapped onto the actual metro alignment from the
 * transportation extract, so a station always sits on its own viaduct rather
 * than beside it, and an anchor that turns out to be too far from the alignment
 * to be trustworthy is dropped rather than dragged into place.
 *
 * The Red Line is Lucknow's only operational corridor: 22.9 km, CCS Airport to
 * Munshipulia. Four stations — Charbagh, Hussainganj, Sachivalaya and Hazratganj
 * — are underground, and the ~3.5 km between them runs in bored tunnel under the
 * city centre. The extract does not know that: it flags part of that stretch
 * elevated like the rest of the line, which would stand a viaduct up through
 * Charbagh and Hazratganj. UNDERGROUND_CORRIDOR exists to suppress exactly that.
 */

export interface MetroStation {
  name: string;
  /** Anchor position in world metres, from real place data. */
  x: number;
  z: number;
  /** Underground stations get no surface structure. */
  underground: boolean;
}

/**
 * Ordered south-west (airport) to north-east (Munshipulia).
 *
 * Absent: Alambagh Bus Station, Hazratganj and IT College — Overture carries no
 * place record for them and no unambiguous landmark to anchor to, and guessing a
 * position on a line this visible would be worse than leaving them out.
 */
export const METRO_STATIONS: MetroStation[] = [
  // Round 2: positions from Overture `subway_station` points (2026-10-21.0); underground
  // status from the mapped tunnel ranges. 17 elevated + 4 underground, as UPMRC states.
  { name: 'CCS Airport',            x: -6596, z: 9316,  underground: true  },
  { name: 'Amausi',                 x: -7087, z: 8751,  underground: false },
  { name: 'Transport Nagar',        x: -6694, z: 8025,  underground: false },
  { name: 'Krishna Nagar',          x: -5789, z: 6187,  underground: false },
  { name: 'Singar Nagar',           x: -5326, z: 5218,  underground: false },
  { name: 'Alambagh',               x: -4722, z: 4003,  underground: false },
  { name: 'Alambagh Bus Station',   x: -4247, z: 3506,  underground: false },
  { name: 'Mawaiya',                x: -3992, z: 2745,  underground: false },
  { name: 'Durgapuri',              x: -3441, z: 2000,  underground: false },
  { name: 'Charbagh',               x: -2676, z: 1956,  underground: false },
  { name: 'Hussainganj',            x: -1562, z: 1285,  underground: true  },
  { name: 'Sachivalaya',            x: -1008, z: 932,   underground: true  },
  { name: 'Hazratganj',             x: -840,  z: -7,    underground: true  },
  { name: 'KD Singh Babu Stadium',  x: -1315, z: -442,  underground: false },
  { name: 'Vishwavidyalaya',        x: -1044, z: -1732, underground: false },
  { name: 'IT College',             x: -438,  z: -2344, underground: false },
  { name: 'Badshah Nagar',          x: 1089,  z: -2307, underground: false },
  { name: 'Lekhraj Market',         x: 2368,  z: -2338, underground: false },
  { name: 'Bhootnath',              x: 3207,  z: -2479, underground: false },
  { name: 'Indira Nagar',           x: 4064,  z: -2538, underground: false },
  { name: 'Munshi Pulia',           x: 4562,  z: -4230, underground: false },
];

/**
 * Fallback only (the exact extract carries the mapped tunnel ranges): the bored section
 * from the Charbagh portal through Hussainganj, Sachivalaya and Hazratganj.
 */
export const UNDERGROUND_CORRIDOR: Array<{ x: number; z: number }> = [
  { x: -2290, z: 1930 },
  { x: -1562, z: 1285 },
  { x: -1008, z: 932 },
  { x: -840,  z: -7 },
  { x: -1000, z: -130 },
];

/** Half-width of the tunnel corridor in metres. */
export const UNDERGROUND_RADIUS = 250;

/** Perpendicular distance from a point to a polyline, in metres. */
export function distanceToPolyline(
  px: number, pz: number,
  pts: Array<{ x: number; z: number }>,
): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
    if (d < best) best = d;
  }
  return best;
}

/** True if this point lies in the bored-tunnel section under the city centre. */
export function isInUndergroundCorridor(x: number, z: number): boolean {
  return distanceToPolyline(x, z, UNDERGROUND_CORRIDOR) <= UNDERGROUND_RADIUS;
}
