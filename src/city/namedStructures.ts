/**
 * namedStructures — signature detail for Lucknow's named bridges and flyovers.
 *
 * The bulk elevated network already draws a deck, piers and a crash barrier for
 * every grade separation in the city. That is right for the anonymous majority,
 * but it makes the Pucca Pul — a 1914 steel bridge — look identical to a slip
 * road, and it gives a gated barrage no gates. This module adds the detail that
 * distinguishes the structures people actually navigate by.
 *
 * PROVENANCE. Every structure here is matched by NAME against a real feature in
 * the transportation extract, and the geometry is built along that feature's own
 * centreline and elevation profile. Nothing is placed by hand: if the named road
 * is not in the data, nothing is drawn. The archetype — truss, barrage, girder,
 * flyover — is the curated part, and each is justified against what the
 * structure actually is.
 */

import type { Pt } from './ribbon';

export type StructureArchetype = 'truss' | 'barrage' | 'girder' | 'flyover';

export interface NamedStructure {
  /** Matched case-insensitively against the feature's `name`. */
  match: RegExp;
  label: string;
  archetype: StructureArchetype;
}

/**
 * Ordered most specific first — the first match wins, so "Old Kukrail Bridge"
 * must be tested before a general /kukrail/ would be.
 */
export const NAMED_STRUCTURES: NamedStructure[] = [
  // Hardinge Bridge, 1914. Locally Pucca Pul or Lal Pul: a steel through-truss
  // over the Gomti linking Daliganj to Chowk, and the reason it needs a truss
  // rather than a flat deck to be recognisable.
  { match: /\bpucca\s*bridge\b/i, label: 'Pucca Pul (Hardinge Bridge)', archetype: 'truss' },

  // A gated barrage, not a road bridge: the carriageway runs over the gate
  // piers, so it gets pier walls down to the water and gate housings above.
  { match: /\bgomti\s*barrage\b/i, label: 'Gomti Barrage', archetype: 'barrage' },

  // River crossings on plate girders.
  { match: /\bold\s*kukrail\s*bridge\b/i, label: 'Old Kukrail Bridge', archetype: 'girder' },
  { match: /\bnew\s*kukrail\s*bridge\b/i, label: 'New Kukrail Bridge', archetype: 'girder' },
  { match: /\bkukrail\s*bridge\b/i, label: 'Kukrail Bridge', archetype: 'girder' },
  { match: /\bnew\s*gomti\s*bridge\b/i, label: 'New Gomti Bridge', archetype: 'girder' },
  { match: /\bpakri\s*ka\s*pul\b/i, label: 'Pakri Ka Pul', archetype: 'girder' },

  // Urban RCC flyovers. Everything below shares one archetype; they differ in
  // length and alignment, which the real centreline already supplies.
  { match: /\bshaheed\s*path\s*flyover\b/i, label: 'Shaheed Path Flyover', archetype: 'flyover' },
  { match: /\blohia\s*path\s*flyover\b/i, label: 'Lohia Path Flyover', archetype: 'flyover' },
  { match: /\bpolytechnic\s*flyover\b/i, label: 'Polytechnic Flyover', archetype: 'flyover' },
  { match: /\bgol\s*market\s*flyover\b/i, label: 'Gol Market Flyover', archetype: 'flyover' },
  { match: /\bbutler\s*flyover\b/i, label: 'Butler Flyover', archetype: 'flyover' },
  { match: /\bchandganj\s*flyover\b/i, label: 'Chandganj Flyover', archetype: 'flyover' },
  { match: /\bfaizabad\s*road\s*flyover\b/i, label: 'Faizabad Road Flyover', archetype: 'flyover' },
  { match: /\bmatiyari\s*flyover\b/i, label: 'Matiyari Flyover', archetype: 'flyover' },
  { match: /\bpurania\s*flyover\b/i, label: 'Purania Flyover', archetype: 'flyover' },
  { match: /\bring\s*road\s*flyover\b/i, label: 'Ring Road Flyover', archetype: 'flyover' },
  { match: /\blalabagh\s*railway\s*crossing\s*flyover\b/i, label: 'Lalabagh ROB', archetype: 'flyover' },
  { match: /\bdaliganj\s*railway\s*crossing\s*flyover\b/i, label: 'Daliganj ROB', archetype: 'flyover' },
  { match: /\bnirala\s*nagar\s*railway\s*crossing\s*flyover\b/i, label: 'Nirala Nagar ROB', archetype: 'flyover' },
  { match: /\blucknow\s*railway\s*flyover\b/i, label: 'Lucknow Railway Flyover', archetype: 'flyover' },
  { match: /\bahimamau\s*flyover\b/i, label: 'Ahimamau Flyover', archetype: 'flyover' },
  { match: /\barjungunj[- ]cantonment\s*flyover\b/i, label: 'Arjunganj–Cantonment Flyover', archetype: 'flyover' },
  { match: /\bvibhuti\s*khanda\s*flyover\b/i, label: 'Vibhuti Khand Flyover', archetype: 'flyover' },
  { match: /\bmohan\s*road\s*flyover\b/i, label: 'Mohan Road Flyover', archetype: 'flyover' },
  { match: /\baishbagh\s*road\s*flyover\b/i, label: 'Aishbagh Road Flyover', archetype: 'flyover' },
  { match: /\barch\s*flyover\b/i, label: 'Arch Flyover', archetype: 'flyover' },
  { match: /\bmavaiyya\s*over\s*bridge\b/i, label: 'Mavaiya ROB', archetype: 'flyover' },
];

export function matchStructure(name: string | undefined): NamedStructure | null {
  if (!name) return null;
  for (const s of NAMED_STRUCTURES) if (s.match.test(name)) return s;
  return null;
}

/** Separate sinks so each part takes its own material. */
export interface StructureSinks {
  /** Parapet rails and posts — painted steel. */
  rail: number[];
  /** Lighting masts and luminaire housings. */
  lamp: number[];
  /** Steel superstructure: truss chords, verticals, diagonals, bracing. */
  truss: number[];
  /** Heavy concrete: barrage pier walls, gate housings, abutments. */
  mass: number[];
}

/**
 * Fine detail is for discrete structures, not for corridors. Shaheed Path
 * Flyover is 9.3 km and Lohia Path 6 km; railing every few metres along those
 * was 2 million vertices on its own and 25 MB of overlay. Anything longer than
 * this keeps its archetype superstructure but not the filigree — it already has
 * a crash barrier from the bulk elevated layer.
 */
const FINE_DETAIL_MAX_LEN = 1500;

const RAIL_POST_SPACING = 6.0;
const RAIL_HEIGHT = 1.12;
const LAMP_SPACING = 40;
const LAMP_HEIGHT = 8.2;
const TRUSS_HEIGHT = 6.4;
const TRUSS_PANEL = 6.0;

/** Axis-aligned-in-local-frame box, written through a frame transform. */
function boxAt(
  out: number[],
  W: (u: number, y: number, v: number, o: number[]) => void,
  u0: number, u1: number, y0: number, y1: number, v0: number, v1: number,
): void {
  const q = (au: number, ay: number, av: number, bu: number, by: number, bv: number,
             cu: number, cy: number, cv: number, du: number, dy: number, dv: number) => {
    W(au, ay, av, out); W(bu, by, bv, out); W(cu, cy, cv, out);
    W(au, ay, av, out); W(cu, cy, cv, out); W(du, dy, dv, out);
  };
  q(u0, y1, v0, u1, y1, v0, u1, y1, v1, u0, y1, v1);
  q(u0, y0, v1, u1, y0, v1, u1, y0, v0, u0, y0, v0);
  q(u0, y0, v0, u1, y0, v0, u1, y1, v0, u0, y1, v0);
  q(u0, y1, v1, u1, y1, v1, u1, y0, v1, u0, y0, v1);
  q(u0, y0, v1, u0, y1, v1, u0, y1, v0, u0, y0, v0);
  q(u1, y0, v0, u1, y1, v0, u1, y1, v1, u1, y0, v1);
}

/**
 * Walk a profiled centreline at a fixed step, handing the caller a local frame
 * at each station: `W(alongOffset, y, acrossOffset)` writes a world vertex, so
 * every part below is authored in structure-local coordinates and follows the
 * real alignment through its bends and its gradient.
 */
function walk(
  pts: Pt[],
  step: number,
  fn: (
    W: (u: number, y: number, v: number, out: number[]) => void,
    deckY: number,
    station: number,
    total: number,
  ) => void,
): void {
  const seg: Array<{ x: number; z: number; y: number; ux: number; uz: number; len: number }> = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) continue;
    seg.push({ x: a.x, z: a.z, y: a.y ?? 0, ux: dx / len, uz: dz / len, len });
    total += len;
  }
  if (seg.length === 0) return;

  let s = 0;
  let si = 0;
  let acc = 0;
  while (s <= total) {
    while (si < seg.length - 1 && s > acc + seg[si].len) { acc += seg[si].len; si++; }
    const g = seg[si];
    const t = Math.min(1, Math.max(0, (s - acc) / g.len));
    const cx = g.x + g.ux * g.len * t;
    const cz = g.z + g.uz * g.len * t;
    const next = seg[Math.min(si + 1, seg.length - 1)];
    const deckY = g.y + ((next.y ?? g.y) - g.y) * t;
    const ca = g.ux;
    const sa = g.uz;
    const W = (u: number, y: number, v: number, out: number[]) => {
      out.push(cx + u * ca - v * sa, y, cz + u * sa + v * ca);
    };
    fn(W, deckY, s, total);
    s += step;
  }
}

/**
 * Parapet railing: a top rail carried on vertical posts, both sides. Replaces
 * nothing — it sits on top of the plain crash barrier the bulk layer already
 * draws, which is what a real parapet looks like from the carriageway.
 */
function addRailing(pts: Pt[], half: number, sinks: StructureSinks): void {
  // Post and its span of top rail emitted together at one station, so the rail
  // is continuous without a second, finer pass over the whole polyline.
  walk(pts, RAIL_POST_SPACING, (W, deckY) => {
    for (const side of [-1, 1]) {
      const v = side * half;
      boxAt(sinks.rail, W, -0.05, 0.05, deckY + 0.9, deckY + RAIL_HEIGHT, v - 0.05, v + 0.05);
      // Rail runs from this post to the next; slight overlap hides the joint
      // where the alignment bends.
      boxAt(sinks.rail, W, -0.1, RAIL_POST_SPACING + 0.1,
            deckY + RAIL_HEIGHT - 0.08, deckY + RAIL_HEIGHT, v - 0.06, v + 0.06);
    }
  });
}

/** Lighting masts, alternating sides, with a cantilevered luminaire. */
function addLamps(pts: Pt[], half: number, sinks: StructureSinks): void {
  let n = 0;
  walk(pts, LAMP_SPACING, (W, deckY) => {
    const side = (n++ % 2 === 0) ? -1 : 1;
    const v = side * (half - 0.35);
    boxAt(sinks.lamp, W, -0.11, 0.11, deckY + 1.0, deckY + LAMP_HEIGHT, v - 0.11, v + 0.11);
    // Arm reaching over the carriageway, then the luminaire.
    const armEnd = v - side * 1.9;
    const v0 = Math.min(v, armEnd);
    const v1 = Math.max(v, armEnd);
    boxAt(sinks.lamp, W, -0.07, 0.07, deckY + LAMP_HEIGHT - 0.16, deckY + LAMP_HEIGHT, v0, v1);
    boxAt(sinks.lamp, W, -0.28, 0.28, deckY + LAMP_HEIGHT - 0.34, deckY + LAMP_HEIGHT - 0.16,
          armEnd - 0.24, armEnd + 0.24);
  });
}

/**
 * Steel through-truss: top and bottom chords each side, verticals at every
 * panel point, a diagonal per panel, and portal bracing across the top.
 */
function addTruss(pts: Pt[], half: number, sinks: StructureSinks): void {
  const top = TRUSS_HEIGHT;
  let panel = 0;
  walk(pts, TRUSS_PANEL, (W, deckY, station, total) => {
    const isEnd = station < TRUSS_PANEL * 0.5 || station > total - TRUSS_PANEL * 0.5;
    for (const side of [-1, 1]) {
      const v = side * half;
      // Vertical post.
      boxAt(sinks.truss, W, -0.16, 0.16, deckY + 0.2, deckY + top, v - 0.16, v + 0.16);
      // Diagonal, alternating direction panel to panel, approximated as a
      // stepped chord — cheap and reads correctly at any distance we show it.
      const dir = panel % 2 === 0 ? 1 : -1;
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const u0 = (k / steps) * TRUSS_PANEL;
        const u1 = ((k + 1) / steps) * TRUSS_PANEL;
        const y0 = deckY + 0.2 + (top - 0.2) * (dir > 0 ? k / steps : 1 - k / steps);
        const y1 = deckY + 0.2 + (top - 0.2) * (dir > 0 ? (k + 1) / steps : 1 - (k + 1) / steps);
        const lo = Math.min(y0, y1);
        const hi = Math.max(y0, y1);
        boxAt(sinks.truss, W, u0, u1, lo, hi + 0.14, v - 0.10, v + 0.10);
      }
    }
    // Top chord segment both sides.
    for (const side of [-1, 1]) {
      const v = side * half;
      boxAt(sinks.truss, W, 0, TRUSS_PANEL, deckY + top - 0.22, deckY + top, v - 0.18, v + 0.18);
    }
    // Portal bracing across the top at the ends, and sway bracing between.
    if (isEnd || panel % 2 === 0) {
      boxAt(sinks.truss, W, -0.14, 0.14, deckY + top - 0.20, deckY + top,
            -half - 0.18, half + 0.18);
    }
    panel++;
  });
}

/**
 * Barrage: pier walls dropped from the deck to the riverbed between the gates,
 * each carrying a gate housing above the carriageway.
 */
function addBarrage(pts: Pt[], half: number, sinks: StructureSinks): void {
  const BAY = 12;
  walk(pts, BAY, (W, deckY) => {
    // Pier wall down into the water.
    boxAt(sinks.mass, W, -1.5, 1.5, -4.5, deckY - 0.4, -half - 1.2, half + 1.2);
    // Gate hoist housing standing above the deck.
    boxAt(sinks.mass, W, -1.2, 1.2, deckY + 1.2, deckY + 4.6, -half - 0.6, half + 0.6);
    boxAt(sinks.mass, W, -1.6, 1.6, deckY + 4.6, deckY + 5.1, -half - 0.9, half + 0.9);
  });
}

/** Plate-girder river bridge: deep edge girders and cross-bracing under deck. */
function addGirder(pts: Pt[], half: number, sinks: StructureSinks): void {
  walk(pts, 4.0, (W, deckY) => {
    for (const side of [-1, 1]) {
      const v = side * half;
      boxAt(sinks.truss, W, -2.05, 2.05, deckY - 1.9, deckY - 0.25, v - 0.22, v + 0.22);
    }
  });
  walk(pts, 8.0, (W, deckY) => {
    boxAt(sinks.truss, W, -0.14, 0.14, deckY - 1.7, deckY - 0.5, -half, half);
  });
}

/**
 * Build the signature detail for one named structure along its real centreline.
 * Returns the archetype used, or null if the name is not curated.
 */
export function buildNamedStructure(
  name: string | undefined,
  pts: Pt[],
  half: number,
  sinks: StructureSinks,
  allowFine: boolean,
): StructureArchetype | null {
  const def = matchStructure(name);
  if (!def || pts.length < 2) return null;

  // `allowFine` is decided by the caller from the structure's TOTAL length across
  // all its features. Deciding it here, per feature, does not work: Overture
  // splits Lohia Path Flyover into ten ~600 m pieces, every one of which looks
  // like a discrete structure on its own.
  if (allowFine) {
    addRailing(pts, half, sinks);
    addLamps(pts, half, sinks);
  }

  if (def.archetype === 'truss') addTruss(pts, half, sinks);
  else if (def.archetype === 'barrage') addBarrage(pts, half, sinks);
  else if (def.archetype === 'girder') addGirder(pts, half, sinks);

  return def.archetype;
}
