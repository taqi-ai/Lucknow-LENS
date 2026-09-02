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
  { name: 'CCS Airport',            x: -9988, z: 9769,  underground: false },
  { name: 'Amausi',                 x: -7086, z: 8737,  underground: false },
  { name: 'Transport Nagar',        x: -6708, z: 8026,  underground: false },
  { name: 'Krishna Nagar',          x: -5939, z: 5649,  underground: false },
  { name: 'Singar Nagar',           x: -5401, z: 5299,  underground: false },
  { name: 'Alambagh',               x: -4705, z: 3983,  underground: false },
  { name: 'Mawaiya',                x: -4000, z: 2756,  underground: false },
  { name: 'Durgapuri',              x: -3438, z: 1989,  underground: false },
  { name: 'Charbagh',               x: -1499, z: 1574,  underground: true  },
  { name: 'Hussainganj',            x: -3313, z: -3,    underground: true  },
  { name: 'Sachivalaya',            x: -842,  z: 841,   underground: true  },
  { name: 'KD Singh Babu Stadium',  x: -1227, z: -632,  underground: false },
  { name: 'Vishwavidyalaya',        x: -1046, z: -1721, underground: false },
  { name: 'Badshah Nagar',          x: 1049,  z: -2292, underground: false },
  { name: 'Lekhraj Market',         x: 2379,  z: -2375, underground: false },
  { name: 'Bhootnath',              x: 3144,  z: -2786, underground: false },
  { name: 'Indira Nagar',           x: 4097,  z: -2564, underground: false },
  { name: 'Munshi Pulia',           x: 4547,  z: -4226, underground: false },
];

/**
 * Polyline through the underground running section, from the real positions of
 * the stations it connects. Any metro feature whose midpoint falls within
 * UNDERGROUND_RADIUS of this line is forced to grade regardless of what the
 * extract claims, because this stretch is in tunnel.
 */
export const UNDERGROUND_CORRIDOR: Array<{ x: number; z: number }> = [
  { x: -3313, z: -3 },
  { x: -1499, z: 1574 },
  { x: -842,  z: 841 },
  { x: -1227, z: -632 },
];

/** Half-width of the tunnel corridor in metres. */
export const UNDERGROUND_RADIUS = 900;

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
