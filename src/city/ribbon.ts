/**
 * ribbon — polyline to triangle-strip conversion with mitred joins.
 *
 * Supports multi-level road classes, physical elevated decks, structural supports,
 * and railway track geometry with ballast and rails.
 */

export interface Pt { x: number; z: number; y?: number }

/** Miter length is clamped so near-doubled-back segments don't produce spikes. */
const MAX_MITER = 2.6;

export interface RibbonOptions {
  /** Half-width in metres. */
  half: number;
  /** Subtracted from every coordinate, keeping buffers in local space. */
  originX?: number;
  originZ?: number;
  /** Y to emit vertices at. */
  y?: number;
  /** Skip segments shorter than this. */
  minSegment?: number;
  /** Optional vertical offset for elevation */
  elevationOffset?: number;
}

/** Drop duplicate / near-duplicate points — they produce NaN normals. */
export function cleanPoints(points: Pt[], minSeg = 0.2): Pt[] {
  const pts: Pt[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < minSeg) continue;
    pts.push(p);
  }
  return pts;
}

/**
 * Per-vertex offset vectors, mitred at interior joints so a polyline widens into
 * a continuous ribbon with no notch at bends.
 */
export function mitredOffsets(pts: Pt[], half: number): { offX: Float64Array; offZ: Float64Array } {
  const n = pts.length;
  const offX = new Float64Array(n);
  const offZ = new Float64Array(n);

  const segDirX = new Float64Array(Math.max(1, n - 1));
  const segDirZ = new Float64Array(Math.max(1, n - 1));
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dz = pts[i + 1].z - pts[i].z;
    const len = Math.hypot(dx, dz) || 1;
    segDirX[i] = dx / len;
    segDirZ[i] = dz / len;
  }

  for (let i = 0; i < n; i++) {
    let nx: number;
    let nz: number;
    if (i === 0) {
      nx = -segDirZ[0];
      nz = segDirX[0];
    } else if (i === n - 1) {
      nx = -segDirZ[n - 2];
      nz = segDirX[n - 2];
    } else {
      // Bisector of the two adjacent segment normals.
      const ax = -segDirZ[i - 1], az = segDirX[i - 1];
      const bx = -segDirZ[i], bz = segDirX[i];
      let mx = ax + bx;
      let mz = az + bz;
      const mlen = Math.hypot(mx, mz);
      if (mlen < 1e-6) {
        // Doubled back on itself — fall back to the incoming normal.
        mx = ax; mz = az;
      } else {
        mx /= mlen; mz /= mlen;
        // Scale so the mitred edge stays `half` from the centreline.
        const cos = mx * ax + mz * az;
        const scale = Math.min(MAX_MITER, 1 / Math.max(0.12, cos));
        mx *= scale; mz *= scale;
      }
      nx = mx; nz = mz;
    }
    offX[i] = nx * half;
    offZ[i] = nz * half;
  }
  return { offX, offZ };
}

/**
 * Append one polyline's triangles to `out` as flat x,y,z triples.
 * Returns the number of vertices appended.
 */
export function appendRibbon(out: number[], points: Pt[], opts: RibbonOptions): number {
  const { half } = opts;
  const ox = opts.originX ?? 0;
  const oz = opts.originZ ?? 0;
  const baseY = opts.y ?? 0;
  const elevOff = opts.elevationOffset ?? 0;

  const pts = cleanPoints(points, opts.minSegment ?? 0.2);
  if (pts.length < 2) return 0;

  const n = pts.length;
  const { offX, offZ } = mitredOffsets(pts, half);

  let added = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const y1 = (p1.y ?? baseY) + elevOff;
    const y2 = (p2.y ?? baseY) + elevOff;

    const l1x = p1.x - ox + offX[i], l1z = p1.z - oz + offZ[i];
    const r1x = p1.x - ox - offX[i], r1z = p1.z - oz - offZ[i];
    const l2x = p2.x - ox + offX[i + 1], l2z = p2.z - oz + offZ[i + 1];
    const r2x = p2.x - ox - offX[i + 1], r2z = p2.z - oz - offZ[i + 1];

    out.push(
      r1x, y1, r1z, l1x, y1, l1z, l2x, y2, l2z,
      r1x, y1, r1z, l2x, y2, l2z, r2x, y2, r2z,
    );
    added += 6;
  }
  return added;
}

/** Road classes, ordered widest to narrowest, plus dedicated railway and flyover. */
export type RoadClass =
  | 'motorway' | 'trunk' | 'primary' | 'secondary'
  | 'tertiary' | 'residential' | 'service' | 'footway'
  | 'railway' | 'flyover';

/**
 * Carriageway half-widths in metres.
 */
export const ROAD_HALF_WIDTH: Record<RoadClass, number> = {
  motorway: 14,
  trunk: 11,
  primary: 8.5,
  secondary: 6,
  tertiary: 4.5,
  residential: 3,
  service: 2.4,
  footway: 1.2,
  railway: 2.8,
  flyover: 8.0,
};

/** Draw order / elevation, so bigger roads sit visually on top at crossings. */
export const ROAD_LAYER_Y: Record<RoadClass, number> = {
  motorway: 0.32,
  trunk: 0.28,
  primary: 0.24,
  secondary: 0.21,
  tertiary: 0.18,
  residential: 0.15,
  service: 0.13,
  footway: 0.11,
  railway: 0.35,
  flyover: 6.80,
};

export function classifyRoad(type?: string, subtype?: string, level?: number, isBridge?: boolean): RoadClass {
  if (subtype === 'rail' || type === 'rail' || type === 'standard_gauge' || type === 'subway') {
    return 'railway';
  }
  if ((level !== undefined && level > 0) || isBridge) {
    return 'flyover';
  }

  switch (type) {
    case 'motorway': case 'motorway_link': return 'motorway';
    case 'trunk': case 'trunk_link': return 'trunk';
    case 'primary': case 'primary_link': return 'primary';
    case 'secondary': case 'secondary_link': return 'secondary';
    case 'tertiary': case 'tertiary_link': return 'tertiary';
    case 'service': case 'track': return 'service';
    case 'footway': case 'path': case 'pedestrian': case 'steps': case 'cycleway':
      return 'footway';
    default: return 'residential';
  }
}

// ── Elevated structures ─────────────────────────────────────────────────────

export interface ElevatableRoad {
  points: Pt[];
  level?: number;
  isElevated?: boolean;
}

/**
 * Deck height in metres for an Overture `level`.
 *
 * Indian urban practice: 5.5 m statutory clearance under the soffit plus roughly
 * 2 m of girder and deck puts a single-level flyover top at ~7.5 m. Each further
 * level adds another clearance-plus-structure stack.
 */
export function deckHeightFor(level: number): number {
  if (level >= 3) return 18.5;
  if (level >= 2) return 13.0;
  return 7.5;
}

/** Approach gradient, 1:25 (4%) — the steepest normally used on urban flyovers. */
const RAMP_GRADIENT = 25;
/** Two elevated features whose endpoints are this close are one continuous structure. */
const JOIN_TOL = 18;
const JOIN_CELL = 40;

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Give every elevated feature a real vertical profile: ramp up from grade, hold
 * the deck, ramp back down.
 *
 * The reason this is not simply `y = 6.8` (which is what it used to be) is that a
 * constant height makes every flyover a slab floating disconnected above the
 * road it is supposed to join. Ramps are what make it read as a structure.
 *
 * Overture splits a single flyover into many features, so ramping at every
 * feature end would produce a sawtooth. Endpoints shared with another elevated
 * feature are therefore treated as *continuing* and stay at deck height; only
 * genuine free ends descend. `isFreeEnd` lets a caller working on a clipped
 * subset (a 500 m tile) additionally veto ramps at its cut edges.
 */
export function buildElevationProfiles(
  roads: ElevatableRoad[],
  isFreeEnd?: (p: Pt) => boolean,
): Map<ElevatableRoad, Pt[]> {
  const out = new Map<ElevatableRoad, Pt[]>();

  const elevated: Array<{ road: ElevatableRoad; pts: Pt[] }> = [];
  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    if (!road.isElevated && !((road.level ?? 0) > 0)) continue;
    const pts = cleanPoints(road.points);
    if (pts.length < 2) continue;
    elevated.push({ road, pts });
  }
  if (elevated.length === 0) return out;

  // Endpoint hash, so "does another elevated feature continue here" is O(1).
  const cellKey = (p: Pt) => `${Math.floor(p.x / JOIN_CELL)},${Math.floor(p.z / JOIN_CELL)}`;
  const index = new Map<string, Array<{ p: Pt; owner: ElevatableRoad }>>();
  const addEnd = (p: Pt, owner: ElevatableRoad) => {
    const k = cellKey(p);
    let bucket = index.get(k);
    if (!bucket) { bucket = []; index.set(k, bucket); }
    bucket.push({ p, owner });
  };
  for (const e of elevated) {
    addEnd(e.pts[0], e.road);
    addEnd(e.pts[e.pts.length - 1], e.road);
  }

  const continuesAt = (p: Pt, self: ElevatableRoad): boolean => {
    const gx = Math.floor(p.x / JOIN_CELL);
    const gz = Math.floor(p.z / JOIN_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = index.get(`${gx + dx},${gz + dz}`);
        if (!bucket) continue;
        for (const e of bucket) {
          if (e.owner === self) continue;
          if (Math.hypot(e.p.x - p.x, e.p.z - p.z) <= JOIN_TOL) return true;
        }
      }
    }
    return false;
  };

  for (const { road, pts } of elevated) {
    const deck = deckHeightFor(road.level ?? 1);
    const n = pts.length;

    // Cumulative arc length.
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    const total = s[n - 1];
    if (total < 1e-3) continue;

    const head = pts[0];
    const tail = pts[n - 1];
    const rampHead = !continuesAt(head, road) && (isFreeEnd ? isFreeEnd(head) : true);
    const rampTail = !continuesAt(tail, road) && (isFreeEnd ? isFreeEnd(tail) : true);

    // A short feature cannot fit two full ramps; sharing the length keeps the
    // gradient sane and simply means it never reaches full deck height.
    const ideal = deck * RAMP_GRADIENT;
    const budget = rampHead && rampTail ? total * 0.45 : total * 0.9;
    const ramp = Math.max(1, Math.min(ideal, budget));

    const profile: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let f = 1;
      if (rampHead) f = Math.min(f, smoothstep(s[i] / ramp));
      if (rampTail) f = Math.min(f, smoothstep((total - s[i]) / ramp));
      profile[i] = { x: pts[i].x, z: pts[i].z, y: deck * f };
    }
    out.set(road, profile);
  }

  return out;
}

// ── Railway track ───────────────────────────────────────────────────────────

/**
 * Track gauge in metres.
 *
 * Overture's `standard_gauge` is a taxonomy label meaning "ordinary heavy rail",
 * not a literal 1,435 mm claim — Indian Railways is 1,676 mm broad gauge, which
 * is what Charbagh and the Lucknow ring lines actually are. Lucknow Metro really
 * is 1,435 mm standard gauge, so `subway` keeps that.
 */
export const RAIL_GAUGE: Record<string, number> = {
  standard_gauge: 1.676,
  subway: 1.435,
};

export function railGaugeFor(type?: string): number {
  return (type && RAIL_GAUGE[type]) || 1.676;
}

/** Separate sinks so each part can take its own material and altitude gate. */
export interface RailSinks {
  /** Ballast prism at grade, or the box girder on a viaduct. */
  bed: number[];
  /** Concrete sleepers. Street-level detail only. */
  sleepers: number[];
  /** The running rails. */
  rails: number[];
}

/**
 * Ballast section for a single track, to prototype dimensions: a 2.75 m sleeper
 * plus a ~0.4 m shoulder each side gives a 3.8 m crown, battered out to 5.4 m at
 * the toe. The previous 7.2 m base was nearly twice the real width, which is why
 * track read as a wide cement road rather than as a railway.
 */
const BALLAST_BASE_HALF = 2.7;
const BALLAST_TOP_HALF = 1.9;
const BALLAST_HEIGHT = 0.55;
const SLEEPER_SPACING = 2.6;
const SLEEPER_HALF = 1.35;
const SLEEPER_RISE = 0.2;
const RAIL_HALF_WIDTH = 0.0375;
const RAIL_RISE = 0.16;

const VIADUCT_HALF = 2.6;
const VIADUCT_SOFFIT_HALF = 2.0;
const VIADUCT_DEPTH = 1.7;
const PARAPET_HALF = 0.18;
const PARAPET_HEIGHT = 1.0;

/** Two triangles for the quad a→b→c→d. Winding is the caller's responsibility. */
function quad(
  out: number[],
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
): void {
  out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  out.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
}

/**
 * Real permanent way rather than a flat grey stripe.
 *
 * At grade: a trapezoidal ballast prism, concrete sleepers, and two running
 * rails at the correct gauge. On a viaduct: a box girder with parapets and slab
 * track — metro viaducts carry no ballast, so emitting sleepers there would be
 * wrong as well as expensive.
 */
export function appendRailway(
  sinks: RailSinks,
  points: Pt[],
  opts: {
    gauge: number;
    elevated: boolean;
    originX?: number;
    originZ?: number;
    baseY?: number;
    withSleepers?: boolean;
  },
): void {
  const ox = opts.originX ?? 0;
  const oz = opts.originZ ?? 0;
  const baseY = opts.baseY ?? 0;

  const pts = cleanPoints(points);
  if (pts.length < 2) return;
  const n = pts.length;

  // Unit normals; every part scales the same offset so the cross-section stays
  // square to the track through bends.
  const { offX, offZ } = mitredOffsets(pts, 1);
  const yOf = (i: number) => (pts[i].y ?? baseY);
  const px = (i: number, h: number) => pts[i].x - ox + offX[i] * h;
  const pz = (i: number, h: number) => pts[i].z - oz + offZ[i] * h;

  const railTop = opts.elevated
    ? RAIL_RISE
    : BALLAST_HEIGHT + SLEEPER_RISE + RAIL_RISE;

  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    const y0 = yOf(i);
    const y1 = yOf(j);

    if (opts.elevated) {
      // Deck slab, normal +Y.
      quad(sinks.bed,
        px(i, -VIADUCT_HALF), y0, pz(i, -VIADUCT_HALF),
        px(i, VIADUCT_HALF), y0, pz(i, VIADUCT_HALF),
        px(j, VIADUCT_HALF), y1, pz(j, VIADUCT_HALF),
        px(j, -VIADUCT_HALF), y1, pz(j, -VIADUCT_HALF));

      // Girder webs, tapering in to the soffit.
      quad(sinks.bed,
        px(i, VIADUCT_HALF), y0, pz(i, VIADUCT_HALF),
        px(i, VIADUCT_SOFFIT_HALF), y0 - VIADUCT_DEPTH, pz(i, VIADUCT_SOFFIT_HALF),
        px(j, VIADUCT_SOFFIT_HALF), y1 - VIADUCT_DEPTH, pz(j, VIADUCT_SOFFIT_HALF),
        px(j, VIADUCT_HALF), y1, pz(j, VIADUCT_HALF));
      quad(sinks.bed,
        px(i, -VIADUCT_SOFFIT_HALF), y0 - VIADUCT_DEPTH, pz(i, -VIADUCT_SOFFIT_HALF),
        px(i, -VIADUCT_HALF), y0, pz(i, -VIADUCT_HALF),
        px(j, -VIADUCT_HALF), y1, pz(j, -VIADUCT_HALF),
        px(j, -VIADUCT_SOFFIT_HALF), y1 - VIADUCT_DEPTH, pz(j, -VIADUCT_SOFFIT_HALF));

      // Soffit, normal -Y.
      quad(sinks.bed,
        px(i, -VIADUCT_SOFFIT_HALF), y0 - VIADUCT_DEPTH, pz(i, -VIADUCT_SOFFIT_HALF),
        px(j, -VIADUCT_SOFFIT_HALF), y1 - VIADUCT_DEPTH, pz(j, -VIADUCT_SOFFIT_HALF),
        px(j, VIADUCT_SOFFIT_HALF), y1 - VIADUCT_DEPTH, pz(j, VIADUCT_SOFFIT_HALF),
        px(i, VIADUCT_SOFFIT_HALF), y0 - VIADUCT_DEPTH, pz(i, VIADUCT_SOFFIT_HALF));

      // Parapets along both deck edges.
      for (const side of [-1, 1]) {
        const outer = side * VIADUCT_HALF;
        const inner = side * (VIADUCT_HALF - PARAPET_HALF * 2);
        quad(sinks.bed,
          px(i, outer), y0 + PARAPET_HEIGHT, pz(i, outer),
          px(i, inner), y0 + PARAPET_HEIGHT, pz(i, inner),
          px(j, inner), y1 + PARAPET_HEIGHT, pz(j, inner),
          px(j, outer), y1 + PARAPET_HEIGHT, pz(j, outer));
        const a = side > 0 ? outer : inner;
        const b = side > 0 ? inner : outer;
        quad(sinks.bed,
          px(i, a), y0, pz(i, a),
          px(i, a), y0 + PARAPET_HEIGHT, pz(i, a),
          px(j, a), y1 + PARAPET_HEIGHT, pz(j, a),
          px(j, a), y1, pz(j, a));
        quad(sinks.bed,
          px(i, b), y0 + PARAPET_HEIGHT, pz(i, b),
          px(i, b), y0, pz(i, b),
          px(j, b), y1, pz(j, b),
          px(j, b), y1 + PARAPET_HEIGHT, pz(j, b));
      }
    } else {
      // Ballast crown, normal +Y.
      quad(sinks.bed,
        px(i, -BALLAST_TOP_HALF), y0 + BALLAST_HEIGHT, pz(i, -BALLAST_TOP_HALF),
        px(i, BALLAST_TOP_HALF), y0 + BALLAST_HEIGHT, pz(i, BALLAST_TOP_HALF),
        px(j, BALLAST_TOP_HALF), y1 + BALLAST_HEIGHT, pz(j, BALLAST_TOP_HALF),
        px(j, -BALLAST_TOP_HALF), y1 + BALLAST_HEIGHT, pz(j, -BALLAST_TOP_HALF));

      // Shoulder slopes.
      quad(sinks.bed,
        px(i, BALLAST_BASE_HALF), y0, pz(i, BALLAST_BASE_HALF),
        px(j, BALLAST_BASE_HALF), y1, pz(j, BALLAST_BASE_HALF),
        px(j, BALLAST_TOP_HALF), y1 + BALLAST_HEIGHT, pz(j, BALLAST_TOP_HALF),
        px(i, BALLAST_TOP_HALF), y0 + BALLAST_HEIGHT, pz(i, BALLAST_TOP_HALF));
      quad(sinks.bed,
        px(i, -BALLAST_TOP_HALF), y0 + BALLAST_HEIGHT, pz(i, -BALLAST_TOP_HALF),
        px(j, -BALLAST_TOP_HALF), y1 + BALLAST_HEIGHT, pz(j, -BALLAST_TOP_HALF),
        px(j, -BALLAST_BASE_HALF), y1, pz(j, -BALLAST_BASE_HALF),
        px(i, -BALLAST_BASE_HALF), y0, pz(i, -BALLAST_BASE_HALF));
    }

    // Running rails, both cases.
    const half = opts.gauge / 2;
    for (const side of [-1, 1]) {
      const a = side * (half - RAIL_HALF_WIDTH);
      const b = side * (half + RAIL_HALF_WIDTH);
      quad(sinks.rails,
        px(i, a), y0 + railTop, pz(i, a),
        px(i, b), y0 + railTop, pz(i, b),
        px(j, b), y1 + railTop, pz(j, b),
        px(j, a), y1 + railTop, pz(j, a));
    }
  }

  // Sleepers: ballasted track only, stepped along the true arc length so spacing
  // stays even through bends.
  if (!opts.elevated && opts.withSleepers) {
    let carry = 0;
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const dx = pts[j].x - pts[i].x;
      const dz = pts[j].z - pts[i].z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;
      const nz = ux;
      const y0 = yOf(i);
      const y1 = yOf(j);
      const top = BALLAST_HEIGHT + SLEEPER_RISE;

      for (let d = carry; d < len; d += SLEEPER_SPACING) {
        const t = d / len;
        const cx = pts[i].x + ux * d - ox;
        const cz = pts[i].z + uz * d - oz;
        const cy = y0 + (y1 - y0) * t;
        const hx = ux * 0.13;
        const hz = uz * 0.13;
        const wx = nx * SLEEPER_HALF;
        const wz = nz * SLEEPER_HALF;
        // Top face only — the sides are under 0.2 m and never resolve.
        quad(sinks.sleepers,
          cx - hx - wx, cy + top, cz - hz - wz,
          cx - hx + wx, cy + top, cz - hz + wz,
          cx + hx + wx, cy + top, cz + hz + wz,
          cx + hx - wx, cy + top, cz + hz - wz);
      }
      carry = (carry - len) % SLEEPER_SPACING;
      if (carry < 0) carry += SLEEPER_SPACING;
    }
  }
}
