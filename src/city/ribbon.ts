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
  /**
   * Optional per-vertex (u, v) sink: u = -1 right edge .. +1 left edge, v = metres along
   * the polyline. Lets the road shader draw lane markings, kerbs and asphalt wear.
   */
  uvOut?: number[];
  /** Starting v, so a feature split across calls keeps continuous dashes. */
  vStart?: number;
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
  const uv = opts.uvOut;
  let vAcc = opts.vStart ?? 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    if (uv) {
      const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const v1 = vAcc, v2 = vAcc + segLen;
      vAcc = v2;
      uv.push(-1, v1, 1, v1, 1, v2, -1, v1, 1, v2, -1, v2);
    }
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
 *
 * These are estimates by class, and they are estimates because there is no
 * alternative: Overture's transportation schema carries road_surface,
 * road_flags and subclass but no width or lane count, and neither does the
 * Lucknow extract. Nothing in the pipeline is discarding a real width — one was
 * never available.
 *
 * The previous values were too generous — a 28 m motorway corridor and a 17 m
 * primary — which is what drove road ribbons through the footprints of
 * buildings that legitimately front onto them. These are Indian urban
 * carriageway widths: a 4-lane divided arterial is ~14 m of blacktop, not 17,
 * and a residential street is one car wide each way.
 */
export const ROAD_HALF_WIDTH: Record<RoadClass, number> = {
  motorway: 11,
  trunk: 9,
  primary: 7,
  secondary: 5,
  tertiary: 4,
  residential: 2.8,
  service: 2.2,
  footway: 1.0,
  railway: 2.6,
  flyover: 7.5,
};

/**
 * Per-feature carriageway half-width. Overture carries no width, and the tile `width`
 * field was itself written from the class table (6 m for 133k segments), so it is not
 * evidence. This keeps the class hierarchy but breaks the uniformity: link roads are
 * narrower, unclassified/track/living streets are lanes rather than streets, and each
 * feature gets a deterministic +/-9% variation from its id.
 */
export function roadHalfWidth(cls: RoadClass, type?: string, id?: string): number {
  let h = ROAD_HALF_WIDTH[cls];
  if (type && type.endsWith('_link')) h *= 0.62;
  else if (type === 'living_street') h = 2.0;
  else if (type === 'unclassified' || type === 'unknown' || type === undefined) h = cls === 'residential' ? 2.4 : h;
  else if (type === 'track') h = 1.7;
  else if (type === 'path' || type === 'steps') h = 0.8;
  if (id) {
    let x = 0;
    for (let i = 0; i < id.length; i++) x = ((x << 5) - x + id.charCodeAt(i)) | 0;
    h *= 0.91 + ((Math.abs(x) % 1000) / 1000) * 0.18;
  }
  return h;
}

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
  // Footbridges and subways are walkways: a narrow footway ribbon, never a lane-marked flyover.
  if (type === 'footway' || type === 'path' || type === 'steps' || type === 'pedestrian' || type === 'cycleway') return 'footway';
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
const JOIN_TOL = 6.0;
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
  // Ends are indexed with their OUTWARD tangent. Another feature only "continues" this end
  // if it heads onward, away from it (tangents roughly opposed). Parallel carriageways that
  // merely finish side by side (tangents the same way) do not continue each other: that
  // false "continuation" held both decks at full height and left them ending in open air.
  type End = { p: Pt; owner: ElevatableRoad; tx: number; tz: number };
  const index = new Map<string, End[]>();
  const tangent = (a: Pt, b: Pt): [number, number] => {
    const dx = a.x - b.x, dz = a.z - b.z, L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  };
  const addEnd = (p: Pt, prev: Pt, owner: ElevatableRoad) => {
    const k = cellKey(p);
    let bucket = index.get(k);
    if (!bucket) { bucket = []; index.set(k, bucket); }
    const [tx, tz] = tangent(p, prev);
    bucket.push({ p, owner, tx, tz });
  };
  for (const e of elevated) {
    addEnd(e.pts[0], e.pts[1], e.road);
    addEnd(e.pts[e.pts.length - 1], e.pts[e.pts.length - 2], e.road);
  }
  const joins = (p: Pt, prev: Pt, self: ElevatableRoad, visit: (o: End) => void) => {
    const [tx, tz] = tangent(p, prev);
    const nx = -tz, nz = tx;
    const gx = Math.floor(p.x / JOIN_CELL), gz = Math.floor(p.z / JOIN_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const e of index.get(`${gx + dx},${gz + dz}`) ?? []) {
        if (e.owner === self) continue;
        if (Math.hypot(e.p.x - p.x, e.p.z - p.z) > JOIN_TOL) continue;
        if (tx * e.tx + tz * e.tz > -0.2) continue; // same-way or sideways: not a continuation
        // Reject side-by-side parallel carriageways: ends must align along the road corridor (lateral offset <= 4.5m)
        const latOffset = Math.abs((e.p.x - p.x) * nx + (e.p.z - p.z) * nz);
        if (latOffset > 4.5) continue;
        visit(e);
      }
    }
  };
  const continuesAt = (p: Pt, prev: Pt, self: ElevatableRoad): boolean => {
    let hit = false;
    joins(p, prev, self, () => { hit = true; });
    return hit;
  };

  // Connected structures (pieces joined end to end) share one span length, so a long
  // flyover split into short features does not sawtooth between culvert and deck heights.
  const parent = new Map<ElevatableRoad, ElevatableRoad>();
  const find = (r: ElevatableRoad): ElevatableRoad => {
    let x = r; while (parent.get(x) !== x) x = parent.get(x)!;
    parent.set(r, x); return x;
  };
  const lenOf = new Map<ElevatableRoad, number>();
  for (const e of elevated) {
    parent.set(e.road, e.road);
    let L = 0;
    for (let i = 1; i < e.pts.length; i++) L += Math.hypot(e.pts[i].x - e.pts[i - 1].x, e.pts[i].z - e.pts[i - 1].z);
    lenOf.set(e.road, L);
  }
  for (const e of elevated) {
    const n = e.pts.length;
    for (const [p, prev] of [[e.pts[0], e.pts[1]], [e.pts[n - 1], e.pts[n - 2]]] as Array<[Pt, Pt]>) {
      joins(p, prev, e.road, (o) => { parent.set(find(e.road), find(o.owner)); });
    }
  }
  const compLen = new Map<ElevatableRoad, number>();
  for (const e of elevated) { const r = find(e.road); compLen.set(r, (compLen.get(r) ?? 0) + lenOf.get(e.road)!); }

  const effDeckMap = new Map<ElevatableRoad, number>();
  for (const { road } of elevated) {
    const deck = deckHeightFor(road.level ?? 1);
    const span = compLen.get(find(road)) ?? 0;
    // River bridges always clear the water by a full deck height, however short the mapped piece.
    const eff = (road as { riverBridge?: boolean }).riverBridge ? Math.max(deck, 8.5) : span < 45 ? 0.6 : span < 140 ? Math.min(deck, 1.0 + (span - 45) * 0.07) : deck;
    effDeckMap.set(road, eff);
  }

  // Multi-level joint resolution: where features of different levels meet end-to-end,
  // harmonize the joint height so the deck profile is continuous with no vertical step.
  const jointHeight = (p: Pt, prev: Pt, road: ElevatableRoad, defaultDeck: number): number => {
    let maxD = defaultDeck;
    joins(p, prev, road, (o) => {
      const oDeck = effDeckMap.get(o.owner) ?? defaultDeck;
      if (oDeck > maxD) maxD = oDeck;
    });
    return maxD;
  };

  for (const { road, pts } of elevated) {
    const effDeck = effDeckMap.get(road) ?? 7.5;
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
    const rampHead = !continuesAt(head, pts[1], road) && (isFreeEnd ? isFreeEnd(head) : true);
    const rampTail = !continuesAt(tail, pts[n - 2], road) && (isFreeEnd ? isFreeEnd(tail) : true);

    const targetHead = rampHead ? 0 : jointHeight(head, pts[1], road, effDeck);
    const targetTail = rampTail ? 0 : jointHeight(tail, pts[n - 2], road, effDeck);

    const idealRampHead = Math.abs(effDeck - targetHead) * RAMP_GRADIENT;
    const idealRampTail = Math.abs(effDeck - targetTail) * RAMP_GRADIENT;
    const budget = (targetHead !== effDeck && targetTail !== effDeck) ? total * 0.45 : total * 0.9;
    const rHead = Math.max(1, Math.min(idealRampHead || total * 0.5, budget));
    const rTail = Math.max(1, Math.min(idealRampTail || total * 0.5, budget));

    const profile: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const dHead = s[i];
      const dTail = total - s[i];
      let y = effDeck;
      if (targetHead !== effDeck && dHead < rHead && (rHead + rTail <= total || dHead <= total * 0.5)) {
        const t = smoothstep(dHead / rHead);
        y = targetHead + (effDeck - targetHead) * t;
      } else if (targetTail !== effDeck && dTail < rTail) {
        const t = smoothstep(dTail / rTail);
        y = targetTail + (effDeck - targetTail) * t;
      }
      profile[i] = { x: pts[i].x, z: pts[i].z, y };
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

/**
 * RENDER OWNERSHIP (round 3). CityOverlay owns every major, elevated or
 * grade-separated carriageway: it has one continuous elevation profile per
 * feature and the matching piers. Tiles only draw the local network. Drawing a
 * feature in both layers produced two decks (the tile copy sat 6.8 m higher
 * and had per-tile ramps), so this predicate is the single source of truth.
 */
export function overlayOwnsRoad(r: { isMajor?: boolean; isElevated?: boolean; level?: number }): boolean {
  return Boolean(r.isMajor || r.isElevated || (r.level ?? 0) > 0);
}

