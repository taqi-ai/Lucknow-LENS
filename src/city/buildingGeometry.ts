/**
 * buildingGeometry — footprint triangulation, massing and procedural rooftop/facade
 * detail for Lucknow buildings.
 *
 * ONE implementation shared by the tile worker (streamed neighbourhood/street tiles) and
 * the offline HLOD baker (scripts/bake_hlod.ts), so a building is the same shape and the
 * same packed attributes whichever representation is drawing it.
 *
 * Two streams:
 *   base    walls + roofs (+ setbacks, pitched industrial / source roof shapes). Used by
 *           streamed tiles and by the HLOD relief/fabric streams.
 *   detail  parapets, stair cabins (mumty), water tanks, rooftop rooms, solar arrays,
 *           tin shelters, AC units, chhajjas, balconies and bazaar awnings. Only built for
 *           tiles near the camera (see TileStreamer DETAIL_RADIUS) — it never enters HLOD.
 *
 * Vertex format (BUILDING_FORMAT_VERSION 2), position Float32 x3 + aPack Uint8 x4:
 *   byte0  hash              per-building seed (jitter, window pattern)
 *   byte1  height / 0.5 m     building eave height, for storey maths
 *   byte2  ao<<4 | surface    baked contact AO (0..15), SURFACE kind (0..15)
 *   byte3  typ<<5 | orient    TYPOLOGY (0..7), longest-edge orientation (32 steps)
 *
 * No normals: flat normals come from screen-space derivatives in the shader.
 * Every procedural choice is seeded from the building's GERS id — never Math.random().
 */

import { ShapeUtils, Vector2 } from 'three';
import { SURFACE, TYPOLOGY, FLOOR_HEIGHT } from './buildingTypes';

export interface Pt { x: number; z: number }

export interface BuildingInput {
  id: string;
  points: Pt[];
  holes?: Pt[][];
  height: number;
  minH?: number;
  floors?: number;
  typ?: number;
  roof?: string;
  part?: number;
}

export interface BuiltGeometry {
  pos: Float32Array;
  pack: Uint8Array;
  count: number;
}

/** Anything that can receive vertices: the float sink here, or the baker's Int16 sink. */
export interface VertexSink {
  push(x: number, y: number, z: number, b0: number, b1: number, b2: number, b3: number): void;
}

/** Byte-identical to SeededRNG.hashString so HLOD and streamed tiles agree. */
export function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Small deterministic PRNG (mulberry32) seeded per building. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return a / 2;
}

export function cleanRing(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(p.x - last.x) < 0.05 && Math.abs(p.z - last.z) < 0.05) continue;
    out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last &&
      Math.abs(first.x - last.x) < 0.05 && Math.abs(first.z - last.z) < 0.05) {
    out.pop();
  }
  return out;
}

export function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Simple-polygon ear clipping, kept for areas (parks, water) and as the fallback when
 * earcut rejects a degenerate footprint.
 */
export function triangulate(ring: Pt[]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];
  const ccw = signedArea(ring) < 0;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? n - 1 - i : i);
  const area2 = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const inTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => {
    const d1 = area2(p, a, b), d2 = area2(p, b, c), d3 = area2(p, c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const out: number[] = [];
  let guard = idx.length * 3;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = ring[i0], b = ring[i1], c = ring[i2];
      if (area2(a, b, c) <= 0) continue;
      let contains = false;
      for (let j = 0; j < idx.length; j++) {
        const k = idx[j];
        if (k === i0 || k === i1 || k === i2) continue;
        if (inTriangle(ring[k], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;
      out.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/** Triangulate a footprint with holes (three's earcut). Returns flat points + indices. */
export function triangulateWithHoles(outer: Pt[], holes: Pt[][]): { pts: Pt[]; idx: number[] } {
  if (holes.length === 0) {
    try {
      const faces = ShapeUtils.triangulateShape(outer.map((p) => new Vector2(p.x, p.z)), []);
      if (faces.length) return { pts: outer, idx: faces.flat() };
    } catch { /* fall through */ }
    return { pts: outer, idx: triangulate(outer) };
  }
  try {
    const faces = ShapeUtils.triangulateShape(
      outer.map((p) => new Vector2(p.x, p.z)),
      holes.map((h) => h.map((p) => new Vector2(p.x, p.z))),
    );
    if (faces.length) return { pts: outer.concat(...holes), idx: faces.flat() };
  } catch { /* fall through */ }
  return { pts: outer, idx: triangulate(outer) };
}

/** Growable Float32/Uint8 vertex sink. */
export class FloatSink implements VertexSink {
  pos: Float32Array;
  pack: Uint8Array;
  count = 0;
  constructor(initial = 4096) {
    this.pos = new Float32Array(initial * 3);
    this.pack = new Uint8Array(initial * 4);
  }
  private grow(): void {
    const next = (this.pos.length / 3) * 2;
    const p = new Float32Array(next * 3); p.set(this.pos); this.pos = p;
    const k = new Uint8Array(next * 4); k.set(this.pack); this.pack = k;
  }
  push(x: number, y: number, z: number, b0: number, b1: number, b2: number, b3: number): void {
    if (this.count >= this.pos.length / 3) this.grow();
    const i3 = this.count * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    const i4 = this.count * 4;
    this.pack[i4] = b0; this.pack[i4 + 1] = b1; this.pack[i4 + 2] = b2; this.pack[i4 + 3] = b3;
    this.count++;
  }
  finish(): BuiltGeometry {
    return { pos: this.pos.slice(0, this.count * 3), pack: this.pack.slice(0, this.count * 4), count: this.count };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepared footprint
// ─────────────────────────────────────────────────────────────────────────────

export interface Prepared {
  id: string;
  ring: Pt[];          // outer, cleaned
  holes: Pt[][];
  area: number;
  cx: number; cz: number;
  height: number;
  minH: number;
  floors: number;
  typ: number;
  roof: string;
  hash: number;
  orientQ: number;     // 0..31
  ang: number;         // radians of longest edge
  hByte: number;
  /** oriented box: centre, half extents along (ux,uz) and (vx,vz) */
  obb: { cx: number; cz: number; ux: number; uz: number; hu: number; hv: number; fill: number };
}

export function prepareBuilding(b: BuildingInput): Prepared | null {
  if (!b?.points || b.points.length < 3) return null;
  const ring = cleanRing(b.points);
  if (ring.length < 3) return null;
  const outerA = Math.abs(signedArea(ring));
  if (outerA < 8) return null;
  const holes = (b.holes ?? []).map(cleanRing).filter((h) => h.length >= 3 && Math.abs(signedArea(h)) > 1);
  const area = outerA - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);

  const height = Math.max(2, Math.min(300, b.height || 8));
  const minH = Math.max(0, Math.min(height - 1, b.minH ?? 0));
  const typ = (b.typ ?? TYPOLOGY.GENERIC) & 7;
  const fh = FLOOR_HEIGHT[typ];

  let sx = 0, sz = 0;
  for (const p of ring) { sx += p.x; sz += p.z; }
  const cx = sx / ring.length, cz = sz / ring.length;

  let bestLen = -1, ang = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const dx = ring[i].x - ring[j].x, dz = ring[i].z - ring[j].z, l = dx * dx + dz * dz;
    if (l > bestLen) { bestLen = l; ang = Math.atan2(dz, dx); }
  }
  const orientQ = Math.round(((ang + Math.PI) / (Math.PI * 2)) * 31) & 0x1f;

  const ux = Math.cos(ang), uz = Math.sin(ang);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of ring) {
    const u = (p.x - cx) * ux + (p.z - cz) * uz;
    const v = -(p.x - cx) * uz + (p.z - cz) * ux;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  const hu = (maxU - minU) / 2, hv = (maxV - minV) / 2;
  const ocx = cx + ux * (minU + hu) - uz * (minV + hv);
  const ocz = cz + uz * (minU + hu) + ux * (minV + hv);
  const fill = outerA / Math.max(1, 4 * hu * hv);

  return {
    id: b.id, ring, holes, area, cx, cz, height, minH,
    floors: b.floors ?? Math.max(1, Math.round((height - minH) / fh)),
    typ, roof: b.roof ?? 'flat', hash: hashString(b.id) & 0xff, orientQ, ang,
    hByte: Math.min(255, Math.round(height / 0.5)),
    obb: { cx: ocx, cz: ocz, ux, uz, hu, hv, fill },
  };
}

const packB2 = (ao: number, surface: number) => ((Math.max(0, Math.min(15, ao)) << 4) | (surface & 15));
const packB3 = (typ: number, orient: number) => (((typ & 7) << 5) | (orient & 31));

/** Writer bound to one building: origin offset and its pack bytes. */
class Emitter {
  constructor(private sink: VertexSink, private p: Prepared, private ox: number, private oz: number) {}
  v(x: number, y: number, z: number, ao: number, surf: number): void {
    const p = this.p;
    this.sink.push(x - this.ox, y, z - this.oz, p.hash, p.hByte, packB2(ao, surf), packB3(p.typ, p.orientQ));
  }
  tri(a: number[], b: number[], c: number[], ao: number, surf: number): void {
    this.v(a[0], a[1], a[2], ao, surf); this.v(b[0], b[1], b[2], ao, surf); this.v(c[0], c[1], c[2], ao, surf);
  }
  /** Quad p1-p2 at [y0,y1], front face toward the right of p1->p2 when ring is CW (x,z with z south). */
  wall(x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, ao0: number, ao1: number, surf: number): void {
    this.v(x1, y0, z1, ao0, surf); this.v(x2, y0, z2, ao0, surf); this.v(x2, y1, z2, ao1, surf);
    this.v(x1, y0, z1, ao0, surf); this.v(x2, y1, z2, ao1, surf); this.v(x1, y1, z1, ao1, surf);
  }
  /** Horizontal polygon facing +Y (or -Y when down). */
  cap(pts: Pt[], idx: number[], y: number, ao: number, surf: number, down = false): void {
    for (let t = 0; t < idx.length; t += 3) {
      const pa = pts[idx[t]], pb = pts[idx[t + 1]], pc = pts[idx[t + 2]];
      if (!pa || !pb || !pc) continue;
      const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
      const up = cross > 0 ? [pa, pc, pb] : [pa, pb, pc];
      const o = down ? [up[0], up[2], up[1]] : up;
      for (const p of o) this.v(p.x, y, p.z, ao, surf);
    }
  }
  /** Oriented box (centre, axes from angle), all faces outward. */
  box(cx: number, cz: number, ang: number, hw: number, hd: number, y0: number, y1: number, wallSurf: number, topSurf: number, ao0 = 9, ao1 = 15): void {
    const ux = Math.cos(ang), uz = Math.sin(ang);
    const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, w]) => ({ x: cx + ux * u - uz * w, z: cz + uz * u + ux * w }));
    const ring = signedArea(c) > 0 ? [...c].reverse() : c;
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      this.wall(a.x, a.z, b.x, b.z, y0, y1, ao0, ao1, wallSurf);
    }
    this.cap(c, [0, 1, 2, 0, 2, 3], y1, 15, topSurf);
  }
  /** Vertical n-gon cylinder with cap. */
  cyl(cx: number, cz: number, r: number, y0: number, y1: number, n: number, surf: number): void {
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) { const a = (-i / n) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r }); }
    const ring = signedArea(pts) > 0 ? [...pts].reverse() : pts;
    for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; this.wall(a.x, a.z, b.x, b.z, y0, y1, 10, 15, surf); }
    const idx: number[] = []; for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
    this.cap(pts, idx, y1, 15, surf);
  }
}

/** Walls for a ring between y0 and y1; `inward` flips so faces point into a courtyard. */
function emitRingWalls(e: Emitter, ring: Pt[], y0: number, y1: number, ao0: number, ao1: number, surf: number, inward: boolean): void {
  const cw = signedArea(ring) > 0;
  const r = (cw !== inward) ? [...ring].reverse() : ring;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    e.wall(a.x, a.z, b.x, b.z, y0, y1, ao0, ao1, surf);
  }
}

function isConvex(ring: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
    const cr = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Base massing
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseOptions {
  /** Emit roofs (true) and walls (true). The HLOD fabric stream wants roofs only. */
  walls?: boolean;
  roofs?: boolean;
}

/** Pitched roof on the oriented box: gable ridge along the long axis. */
function emitPitched(e: Emitter, p: Prepared, eave: number, rise: number, surf: number, hipped: boolean): void {
  const { cx, cz, ux, uz, hu, hv } = p.obb;
  const P = (u: number, v: number, y: number) => [cx + ux * u - uz * v, y, cz + uz * u + ux * v];
  const ridgeInset = hipped ? Math.min(hu * 0.6, hv) : 0;
  const a = P(-hu, -hv, eave), b = P(hu, -hv, eave), c = P(hu, hv, eave), d = P(-hu, hv, eave);
  const r1 = P(-hu + ridgeInset, 0, eave + rise), r2 = P(hu - ridgeInset, 0, eave + rise);
  // Determine which winding faces up for this axis orientation.
  const up = (t0: number[], t1: number[], t2: number[]) => {
    const cr = (t1[0] - t0[0]) * (t2[2] - t0[2]) - (t1[2] - t0[2]) * (t2[0] - t0[0]);
    if (cr > 0) e.tri(t0, t2, t1, 15, surf); else e.tri(t0, t1, t2, 15, surf);
  };
  // slopes
  up(a, b, r2); up(a, r2, r1);
  up(c, d, r1); up(c, r1, r2);
  // ends: gable walls (vertical triangles) or hip faces
  if (hipped) { up(b, c, r2); up(d, a, r1); }
  else {
    const gable = (t0: number[], t1: number[], t2: number[]) => {
      // vertical triangle — emit both windings is wasteful; pick outward by centre test
      const mx = (t0[0] + t1[0]) / 2 - cx, mz = (t0[2] + t1[2]) / 2 - cz;
      // (t0,t1,t2) with t2 above faces (-dz, dx); keep it if that points away from the centre.
      const nx = -(t1[2] - t0[2]), nz = (t1[0] - t0[0]);
      if (mx * nx + mz * nz > 0) e.tri(t0, t1, t2, 13, SURFACE.WALL); else e.tri(t1, t0, t2, 13, SURFACE.WALL);
    };
    gable(b, c, r2); gable(d, a, r1);
  }
}

export function emitBase(sink: VertexSink, p: Prepared, ox: number, oz: number, opts: BaseOptions = {}): void {
  const e = new Emitter(sink, p, ox, oz);
  const walls = opts.walls !== false, roofs = opts.roofs !== false;
  const fh = FLOOR_HEIGHT[p.typ];
  const r = rng(hashString(p.id) ^ 0x9e3779b9);
  const ao0 = p.minH > 0 ? 12 : 6;

  // Roof form. Source roof_shape wins; industrial sheds get low metal gables when their
  // footprint is close to a rectangle; everything else is the flat RCC terrace that
  // dominates Indian cities.
  let form = p.roof;
  if (form === 'flat' && p.typ === TYPOLOGY.INDUSTRIAL && p.obb.fill > 0.82 && p.area > 120 && p.height <= 12) form = 'gabled_metal';
  const pitched = (form === 'gabled' || form === 'hipped' || form === 'pyramidal' || form === 'gabled_metal') && p.obb.fill > 0.75 && p.holes.length === 0;

  // Setback: tall convex blocks lose 1-2 floors of plan at the top.
  const setback = !pitched && p.floors >= 9 && p.area > 350 && isConvex(p.ring) && p.holes.length === 0 && r() < 0.55;
  const topH = p.height;
  const lowH = setback ? topH - fh * (r() < 0.5 ? 1 : 2) : topH;

  if (walls) {
    emitRingWalls(e, p.ring, p.minH, lowH, ao0, 15, SURFACE.WALL, false);
    for (const h of p.holes) emitRingWalls(e, h, p.minH, lowH, ao0 - 2, 14, SURFACE.WALL, true);
  }

  if (pitched) {
    const metal = form === 'gabled_metal';
    const rise = metal ? Math.min(3, p.obb.hv * 0.18) : Math.min(p.obb.hv * 0.55, 6);
    if (roofs) emitPitched(e, p, lowH, rise, metal ? SURFACE.METAL : SURFACE.ROOF, form === 'hipped' || form === 'pyramidal');
    return;
  }

  if (roofs) {
    const t = triangulateWithHoles(p.ring, p.holes);
    e.cap(t.pts, t.idx, lowH, 15, SURFACE.ROOF);
  }

  if (setback) {
    const s = 0.8;
    const inner = p.ring.map((q) => ({ x: p.cx + (q.x - p.cx) * s, z: p.cz + (q.z - p.cz) * s }));
    if (walls) emitRingWalls(e, inner, lowH, topH, 11, 15, SURFACE.WALL, false);
    if (roofs) {
      const t = triangulateWithHoles(inner, []);
      e.cap(t.pts, t.idx, topH, 15, SURFACE.ROOF);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail: rooftop furniture and facade projections
// ─────────────────────────────────────────────────────────────────────────────

const RESIDENTIAL = new Set<number>([TYPOLOGY.GENERIC, TYPOLOGY.OLD_CITY, TYPOLOGY.PLANNED, TYPOLOGY.MARKET, TYPOLOGY.APARTMENT]);

/** Point inside the footprint near a chosen corner, for a box of half-size (hw,hd). */
function placeOnRoof(p: Prepared, hw: number, hd: number, pick: number, pull: number): { x: number; z: number } | null {
  const fits = (x: number, z: number) => {
    const ux = Math.cos(p.ang), uz = Math.sin(p.ang);
    for (const [u, w] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      if (!pointInRing(x + ux * u - uz * w, z + uz * u + ux * w, p.ring)) return false;
    }
    for (const h of p.holes) if (pointInRing(x, z, h)) return false;
    return true;
  };
  const n = p.ring.length;
  for (let k = 0; k < 3; k++) {
    const v = p.ring[(Math.floor(pick * n) + k) % n];
    const x = v.x + (p.cx - v.x) * pull, z = v.z + (p.cz - v.z) * pull;
    if (fits(x, z)) return { x, z };
  }
  return fits(p.cx, p.cz) ? { x: p.cx, z: p.cz } : null;
}

export function emitDetail(sink: VertexSink, p: Prepared, ox: number, oz: number): void {
  if (p.roof !== 'flat') return;
  const e = new Emitter(sink, p, ox, oz);
  const r = rng(hashString(p.id) ^ 0x51ed270b);
  const fh = FLOOR_HEIGHT[p.typ];
  const H = p.height;
  const res = RESIDENTIAL.has(p.typ);
  const industrial = p.typ === TYPOLOGY.INDUSTRIAL;
  if (industrial && p.obb.fill > 0.82 && p.area > 120 && p.height <= 12) return; // metal gable, no terrace

  // Parapet: almost universal on Indian flat roofs; lower and plainer on sheds.
  if (r() < (industrial ? 0.35 : 0.9) && p.area > 12) {
    const ph = industrial ? 0.6 : 0.85 + r() * 0.3;
    emitRingWalls(e, p.ring, H, H + ph, 13, 15, SURFACE.PARAPET, false);
    emitRingWalls(e, p.ring, H, H + ph, 10, 15, SURFACE.PARAPET, true);
    for (const h of p.holes) {
      emitRingWalls(e, h, H, H + ph, 13, 15, SURFACE.PARAPET, true);
      emitRingWalls(e, h, H, H + ph, 10, 15, SURFACE.PARAPET, false);
    }
  }

  // Stair cabin (mumty) — the single most characteristic North Indian roof object.
  let cabinTop = -1, cabin: { x: number; z: number } | null = null;
  const cabinChance = p.typ === TYPOLOGY.APARTMENT ? 0.95 : res ? 0.72 : p.typ === TYPOLOGY.INSTITUTIONAL ? 0.5 : 0.15;
  if (p.floors >= 2 && p.area > 40 && r() < cabinChance) {
    const hw = 1.2 + r() * 0.5, hd = 1.5 + r() * 0.6, ch = 2.5 + r() * 0.3;
    cabin = placeOnRoof(p, hw, hd, r(), 0.32 + r() * 0.15);
    if (cabin) {
      e.box(cabin.x, cabin.z, p.ang, hw, hd, H, H + ch, SURFACE.STAIR, SURFACE.ROOF);
      cabinTop = H + ch;
    }
  }

  // Water tanks: black polyethylene (most common), sometimes white; on the cabin or on a stand.
  const tanks = p.typ === TYPOLOGY.APARTMENT ? 2 + Math.floor(r() * 3) : res && r() < 0.78 ? 1 + (r() < 0.2 ? 1 : 0) : r() < 0.25 ? 1 : 0;
  for (let k = 0; k < tanks; k++) {
    const rad = 0.5 + r() * 0.25, th = 1.0 + r() * 0.4;
    const surf = r() < 0.72 ? SURFACE.TANK_BLACK : SURFACE.TANK_WHITE;
    if (cabin && k < 2) {
      const off = (k === 0 ? -0.55 : 0.6);
      e.cyl(cabin.x + Math.cos(p.ang) * off, cabin.z + Math.sin(p.ang) * off, rad, cabinTop, cabinTop + th, 6, surf);
    } else {
      const at = placeOnRoof(p, rad + 0.2, rad + 0.2, r(), 0.25 + r() * 0.3);
      if (!at) continue;
      e.box(at.x, at.z, p.ang, rad * 0.9, rad * 0.9, H, H + 0.6, SURFACE.EQUIP, SURFACE.EQUIP, 10, 12); // stand
      e.cyl(at.x, at.z, rad, H + 0.6, H + 0.6 + th, 6, surf);
    }
  }

  // Rooftop room / barsati covering part of the terrace.
  if (res && p.typ !== TYPOLOGY.APARTMENT && p.area > 80 && p.floors >= 1 && r() < (p.typ === TYPOLOGY.OLD_CITY ? 0.24 : 0.14)) {
    const hw = Math.min(p.obb.hu * 0.45, 4 + r() * 2), hd = Math.min(p.obb.hv * 0.45, 3 + r() * 1.5);
    const at = placeOnRoof(p, hw, hd, r(), 0.4);
    if (at) e.box(at.x, at.z, p.ang, hw, hd, H, H + 2.8, SURFACE.STAIR, SURFACE.ROOF);
  }

  // Solar arrays: tilted toward the south (+z), more common on institutions & new blocks.
  const solarChance = ({ [TYPOLOGY.INSTITUTIONAL]: 0.35, [TYPOLOGY.APARTMENT]: 0.25, [TYPOLOGY.PLANNED]: 0.12,
    [TYPOLOGY.INDUSTRIAL]: 0.2, [TYPOLOGY.GENERIC]: 0.05, [TYPOLOGY.HERITAGE]: 0, [TYPOLOGY.MARKET]: 0.04, [TYPOLOGY.OLD_CITY]: 0.02 } as Record<number, number>)[p.typ] ?? 0;
  if (p.area > 60 && r() < solarChance) {
    const rows = Math.max(1, Math.min(5, Math.floor(p.obb.hv / 1.8)));
    const cols = Math.max(1, Math.min(8, Math.floor(p.obb.hu / 1.2)));
    const tilt = 0.44, pw = 1.0, pl = 1.9;
    let placed = 0;
    for (let i = 0; i < cols && placed < 28; i++) for (let j = 0; j < rows && placed < 28; j++) {
      const x = p.obb.cx + (i - (cols - 1) / 2) * 1.25 * 1.0;
      const z = p.obb.cz + (j - (rows - 1) / 2) * 2.2;
      if (!pointInRing(x, z, p.ring)) continue;
      const y0 = H + 0.35, y1 = y0 + Math.sin(tilt) * pl;
      const dz = Math.cos(tilt) * pl / 2;
      // world-aligned panel facing south: low edge at +z
      e.tri([x - pw / 2, y0, z + dz], [x + pw / 2, y0, z + dz], [x + pw / 2, y1, z - dz], 15, SURFACE.SOLAR);
      e.tri([x - pw / 2, y0, z + dz], [x + pw / 2, y1, z - dz], [x - pw / 2, y1, z - dz], 15, SURFACE.SOLAR);
      placed++;
    }
  }

  // Tin shelter on the terrace (old city / generic / market).
  if ((p.typ === TYPOLOGY.OLD_CITY || p.typ === TYPOLOGY.GENERIC || p.typ === TYPOLOGY.MARKET) && p.area > 50 && r() < 0.12) {
    const hw = 1.6 + r(), hd = 1.3 + r() * 0.8;
    const at = placeOnRoof(p, hw, hd, r(), 0.45);
    if (at) {
      const ux = Math.cos(p.ang), uz = Math.sin(p.ang);
      const P = (u: number, w: number, y: number) => [at.x + ux * u - uz * w, y, at.z + uz * u + ux * w];
      const a = P(-hw, -hd, H + 2.4), b = P(hw, -hd, H + 2.4), c = P(hw, hd, H + 2.0), d = P(-hw, hd, H + 2.0);
      e.tri(a, c, b, 15, SURFACE.METAL); e.tri(a, d, c, 15, SURFACE.METAL);
      e.tri(a, b, c, 9, SURFACE.METAL); e.tri(a, c, d, 9, SURFACE.METAL);
    }
  }

  // AC units / equipment for commercial, institutional and apartments.
  if ((p.typ === TYPOLOGY.MARKET || p.typ === TYPOLOGY.INSTITUTIONAL || p.typ === TYPOLOGY.APARTMENT) && p.area > 100) {
    const n = 2 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const at = placeOnRoof(p, 0.5, 0.4, r(), 0.15 + r() * 0.2);
      if (at) e.box(at.x, at.z, p.ang, 0.5, 0.4, H, H + 0.7, SURFACE.EQUIP, SURFACE.EQUIP, 11, 14);
    }
  }

  // Facade projections along the longest walls: chhajjas over every floor, balconies on
  // planned/apartment stock, tin awnings over bazaar shopfronts.
  if (p.floors >= 1 && !industrial && p.typ !== TYPOLOGY.HERITAGE) {
    const ring = signedArea(p.ring) > 0 ? [...p.ring].reverse() : p.ring; // CW -> outward = right
    const balcony = (p.typ === TYPOLOGY.PLANNED || p.typ === TYPOLOGY.APARTMENT) && r() < 0.75;
    const chhajja = r() < (p.typ === TYPOLOGY.OLD_CITY ? 0.75 : 0.55);
    const awning = p.typ === TYPOLOGY.MARKET;
    // District character (round 3): Hazratganj market frontage gets a real colonnade (arcade slab on
    // square columns); Aminabad and Chowk market/old-city buildings get deeper chhajjas, jharokha
    // balconies and more signboards.
    const inGanj = p.typ === TYPOLOGY.MARKET && Math.hypot(p.cx + 420, p.cz - 340) < 420;
    const inBazaar = (p.typ === TYPOLOGY.MARKET || p.typ === TYPOLOGY.OLD_CITY)
      && (Math.hypot(p.cx + 2340, p.cz - 300) < 450 || Math.hypot(p.cx + 4000, p.cz + 1800) < 650);
    let edges = 0;
    for (let i = 0; i < ring.length && edges < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 3.5 || len > 40) continue;
      edges++;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux; // outward (right of CW edge)
      // sign check: outward should point away from centroid
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const s = ((mx - p.cx) * nx + (mz - p.cz) * nz) >= 0 ? 1 : -1;
      const slab = (y: number, depth: number, t0: number, t1: number, thick: number, surf: number) => {
        const x0 = a.x + ux * t0, z0 = a.z + uz * t0, x1 = a.x + ux * t1, z1 = a.z + uz * t1;
        const ex = nx * depth * s, ez = nz * depth * s;
        const A = [x0, y, z0], B = [x1, y, z1], C = [x1 + ex, y, z1 + ez], D = [x0 + ex, y, z0 + ez];
        const A2 = [x0, y - thick, z0], B2 = [x1, y - thick, z1], C2 = [x1 + ex, y - thick, z1 + ez], D2 = [x0 + ex, y - thick, z0 + ez];
        const upTri = (t0_: number[], t1_: number[], t2_: number[], ao: number, down: boolean) => {
          const cr = (t1_[0] - t0_[0]) * (t2_[2] - t0_[2]) - (t1_[2] - t0_[2]) * (t2_[0] - t0_[0]);
          const faceUp = cr <= 0; // cross<=0 => CCW seen from +Y in this frame
          if (faceUp !== down) e.tri(t0_, t1_, t2_, ao, surf); else e.tri(t0_, t2_, t1_, ao, surf);
        };
        upTri(A, B, C, 15, false); upTri(A, C, D, 15, false);
        upTri(A2, B2, C2, 8, true); upTri(A2, C2, D2, 8, true);
        // front lip
        const fx = ex >= 0 || ez >= 0;
        void fx;
        e.wall(D[0], D[2], C[0], C[2], y - thick, y, 12, 14, surf);
        e.wall(C[0], C[2], D[0], D[2], y - thick, y, 12, 14, surf);
      };
      for (let f = 0; f < Math.min(p.floors, 14); f++) {
        const yb = p.minH + f * fh;
        if (inGanj && f === 0 && len > 6) {
          // Colonnade: 3 m deep arcade roof with square columns every 3.6 m.
          slab(yb + 3.6, 1.6, 0, len, 0.3, SURFACE.STONE);
          for (let t = 0.6; t < len - 0.3; t += 3.6) {
            const cx = a.x + ux * t + nx * 1.45 * s, cz = a.z + uz * t + nz * 1.45 * s, w = 0.2;
            for (const [ax, az, bx, bz] of [[cx - ux * w - nx * w, cz - uz * w - nz * w, cx + ux * w - nx * w, cz + uz * w - nz * w], [cx + ux * w - nx * w, cz + uz * w - nz * w, cx + ux * w + nx * w, cz + uz * w + nz * w], [cx + ux * w + nx * w, cz + uz * w + nz * w, cx - ux * w + nx * w, cz - uz * w + nz * w], [cx - ux * w + nx * w, cz - uz * w + nz * w, cx - ux * w - nx * w, cz - uz * w - nz * w]])
              e.wall(ax, az, bx, bz, yb, yb + 3.6, 10, 14, SURFACE.STONE);
          }
        } else if (awning && f === 0) slab(yb + 2.9, inBazaar ? 1.8 : 1.1, 0.2, len - 0.2, 0.08, SURFACE.METAL);
        if (inBazaar && f >= 1 && len > 5 && r() < 0.6) {
          // Jharokha balcony: projecting box with a parapet.
          const w = Math.min(len * 0.4, 3.6), t0 = (len - w) / 2;
          slab(yb + 0.2, 1.0, t0, t0 + w, 0.15, SURFACE.SLAB);
          slab(yb + fh * 0.85, 1.2, t0 - 0.2, t0 + w + 0.2, 0.12, SURFACE.SLAB);
        }
        if (balcony && f >= 1 && len > 6) {
          const w = Math.min(len * 0.45, 5);
          const t0 = (len - w) / 2;
          slab(yb + 0.15, 1.2, t0, t0 + w, 0.15, SURFACE.SLAB);
          // railing parapet
          const x0 = a.x + ux * t0 + nx * 1.2 * s, z0 = a.z + uz * t0 + nz * 1.2 * s;
          const x1 = a.x + ux * (t0 + w) + nx * 1.2 * s, z1 = a.z + uz * (t0 + w) + nz * 1.2 * s;
          e.wall(x0, z0, x1, z1, yb + 0.15, yb + 1.1, 12, 15, SURFACE.PARAPET);
          e.wall(x1, z1, x0, z0, yb + 0.15, yb + 1.1, 12, 15, SURFACE.PARAPET);
        } else if (chhajja && f < p.floors) {
          slab(yb + fh * 0.8, 0.5, 0.0, len, 0.08, SURFACE.SLAB);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltBuildings {
  base: BuiltGeometry;
  detail: BuiltGeometry | null;
}

/**
 * Build merged geometry for a set of footprints.
 * @param originX/originZ subtracted from every coordinate so buffers stay tile-local.
 * @param exclude return true to drop a footprint (landmark sites get bespoke models).
 * @param withDetail also build the near-range detail stream.
 */
export function buildBuildings(
  buildings: BuildingInput[],
  originX: number,
  originZ: number,
  exclude?: (x: number, z: number) => boolean,
  withDetail = false,
): BuiltBuildings {
  const base = new FloatSink(Math.max(4096, buildings.length * 48));
  const detail = withDetail ? new FloatSink(Math.max(4096, buildings.length * 120)) : null;
  for (const b of buildings) {
    const p = prepareBuilding(b);
    if (!p) continue;
    if (exclude && exclude(p.cx, p.cz)) continue;
    emitBase(base, p, originX, originZ);
    if (detail) emitDetail(detail, p, originX, originZ);
  }
  return { base: base.finish(), detail: detail ? detail.finish() : null };
}
