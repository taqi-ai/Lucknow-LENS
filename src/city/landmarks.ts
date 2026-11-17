import * as THREE from 'three';
import { FloatSink } from './buildingGeometry';
import { SURFACE, TYPOLOGY } from './buildingTypes';
import { LANDMARK_SITES, PRECINCTS, AIRPORT, type LandmarkSite } from './landmarkSites';

/**
 * Landmarks — procedural reconstructions of Lucknow's monuments and their precincts.
 *
 * PROCEDURAL, NOT PHOTOGRAMMETRY. Every model is anchored to real geography resolved by
 * scripts/py/build_landmark_sites.py (Overture footprints / land-use outlines / NMA
 * coordinates) and sized from footprints and published dimensions (NMA: Asafi Masjid
 * 25.13 m; AAI AIP: runway 2,744 x 45 m). Architecture uses the shared building material
 * (lighting, haze, shadows, heritage floodlighting); gardens, paving, water, trees,
 * elephants, the TV tower lattice and the airport surfaces use a vertex-coloured mesh.
 * Footprints inside each site's exclusion ring are removed from tiles and HLOD.
 *
 * Output: three meshes (architecture, grounds, flag) — a handful of draw calls in total.
 */

type V3 = [number, number, number];
const S = { ...SURFACE, /** pale lime plaster: SURFACE.TANK_WHITE slot re-read as plaster on heritage typology */ LIME: SURFACE.TANK_WHITE,
  /** light blue plaster (Chhota Imambara road gates): SURFACE.TANK_BLACK re-read on heritage typology */ BLUE: SURFACE.TANK_BLACK };
const site = (k: string) => LANDMARK_SITES.find((s) => s.key === k);

// ─────────────────────────────────────────────────────────────────────────────
// Architecture kit (building vertex format)
// ─────────────────────────────────────────────────────────────────────────────

class Kit {
  readonly sink = new FloatSink(1 << 16);
  private hash = 0; private hByte = 0; private orient = 0;
  cx = 0; cz = 0; ca = 1; sa = 0;

  begin(s: LandmarkSite, heightM: number, seed: number, angle = s.a): void { this.domeDefault = S.DOME;
    this.cx = s.c[0]; this.cz = s.c[1];
    this.ca = Math.cos(angle); this.sa = Math.sin(angle);
    this.hash = seed & 0xff;
    this.hByte = Math.min(255, Math.round(heightM / 0.5));
    this.orient = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 31) & 31;
  }
  w(p: V3): V3 { return [this.cx + p[0] * this.ca - p[2] * this.sa, p[1], this.cz + p[0] * this.sa + p[2] * this.ca]; }
  local(x: number, z: number): [number, number] {
    const dx = x - this.cx, dz = z - this.cz;
    return [dx * this.ca + dz * this.sa, -dx * this.sa + dz * this.ca];
  }
  private vert(p: V3, surf: number, ao: number): void {
    this.sink.push(p[0], p[1], p[2], this.hash, this.hByte, ((ao & 15) << 4) | (surf & 15), ((TYPOLOGY.HERITAGE & 7) << 5) | this.orient);
  }
  tri(a: V3, b: V3, c: V3, surf: number, out: V3, ao = 14): void {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    const A = this.w(a), B = this.w(flip ? c : b), C = this.w(flip ? b : c);
    this.vert(A, surf, ao); this.vert(B, surf, ao); this.vert(C, surf, ao);
  }
  quad(a: V3, b: V3, c: V3, d: V3, surf: number, out: V3, ao = 14): void { this.tri(a, b, c, surf, out, ao); this.tri(a, c, d, surf, out, ao); }
  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, surf: number, top = surf): void {
    const P = (u: number, y: number, v: number): V3 => [u, y, v];
    this.quad(P(u0, y0, v0), P(u1, y0, v0), P(u1, y1, v0), P(u0, y1, v0), surf, [0, 0, -1], 12);
    this.quad(P(u0, y0, v1), P(u1, y0, v1), P(u1, y1, v1), P(u0, y1, v1), surf, [0, 0, 1], 12);
    this.quad(P(u0, y0, v0), P(u0, y0, v1), P(u0, y1, v1), P(u0, y1, v0), surf, [-1, 0, 0], 12);
    this.quad(P(u1, y0, v0), P(u1, y0, v1), P(u1, y1, v1), P(u1, y1, v0), surf, [1, 0, 0], 12);
    this.quad(P(u0, y1, v0), P(u1, y1, v0), P(u1, y1, v1), P(u0, y1, v1), top, [0, 1, 0], 15);
  }
  lathe(u: number, v: number, profile: Array<[number, number]>, n: number, surf: number, rot = 0): void {
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2 + rot, a1 = ((k + 1) / n) * Math.PI * 2 + rot;
        const p00: V3 = [u + Math.cos(a0) * r0, y0, v + Math.sin(a0) * r0];
        const p01: V3 = [u + Math.cos(a1) * r0, y0, v + Math.sin(a1) * r0];
        const p10: V3 = [u + Math.cos(a0) * r1, y1, v + Math.sin(a0) * r1];
        const p11: V3 = [u + Math.cos(a1) * r1, y1, v + Math.sin(a1) * r1];
        const am = (a0 + a1) / 2;
        const out: V3 = [Math.cos(am), (r0 - r1) / Math.max(0.01, Math.abs(y1 - y0) + Math.abs(r0 - r1)), Math.sin(am)];
        if (r1 < 0.01) this.tri(p00, p01, p10, surf, out, 15); else this.quad(p00, p01, p11, p10, surf, out, 15);
      }
    }
  }
  cylinder(u: number, v: number, r0: number, r1: number, y0: number, y1: number, n: number, surf: number): void {
    this.lathe(u, v, [[r0, y0], [r1, y1], [0, y1]], n, surf, Math.PI / n);
  }
  /** Bulbous dome; bulge 0.1 hemisphere-ish, 0.3 pear (Asafi Masjid). */
  onion(u: number, v: number, r: number, y: number, h: number, surf: number, bulge = 0.18, finial = true): void {
    const prof: Array<[number, number]> = [[r * 0.92, y]];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const rr = r * (1 + bulge * Math.sin(Math.min(1, t * 1.5) * Math.PI)) * Math.pow(Math.cos(t * Math.PI / 2), 0.75);
      prof.push([i === 12 ? 0 : rr, y + 0.15 * r + t * h]);
    }
    this.lathe(u, v, prof, 18, surf);
    if (finial) {
      // inverted-lotus collar + gilt finial
      this.cylinder(u, v, r * 0.16, r * 0.05, y + h * 0.98, y + h + r * 0.12, 8, S.GILT);
      this.cylinder(u, v, r * 0.05, r * 0.02, y + h + r * 0.12, y + h + r * 0.55, 6, S.GILT);
    }
  }
  hemi(u: number, v: number, r: number, y: number, surf: number, squash = 1): void {
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI / 2; prof.push([i === 10 ? 0 : r * Math.cos(t), y + r * squash * Math.sin(t)]); }
    this.lathe(u, v, prof, 22, surf);
  }
  /** Default surface for chhatri domes; plaster-coloured monuments set this to S.LIME after begin(). */
  domeDefault: number = S.DOME;
  chhatri(u: number, v: number, s: number, y: number, surf: number = this.domeDefault): void {
    const p = s * 0.12, h = s * 1.1;
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.box(u + du * s / 2 - p / 2, u + du * s / 2 + p / 2, y, y + h, v + dv * s / 2 - p / 2, v + dv * s / 2 + p / 2, S.STONE);
    this.box(u - s * 0.62, u + s * 0.62, y + h, y + h + s * 0.12, v - s * 0.62, v + s * 0.62, S.STONE);
    this.onion(u, v, s * 0.48, y + h + s * 0.12, s * 0.7, surf, 0.12);
  }
  /** Arched recesses on a face. face 'v0'|'v1' (normal -v/+v) or 'u0'|'u1'. */
  arcade(face: 'v0' | 'v1' | 'u0' | 'u1', at: number, s0: number, s1: number, y0: number, w: number, h: number, count: number, surf: number = S.GLASS, scallop = false): void {
    const off = face.endsWith('0') ? -0.09 : 0.09;
    const out: V3 = face[0] === 'v' ? [0, 0, Math.sign(off)] : [Math.sign(off), 0, 0];
    const step = (s1 - s0) / count;
    for (let i = 0; i < count; i++) {
      const c = s0 + step * (i + 0.5);
      const pts: Array<[number, number]> = [[c - w / 2, y0], [c + w / 2, y0], [c + w / 2, y0 + h - w / 2]];
      for (let k = 1; k < 10; k++) {
        const t = (k / 10) * Math.PI;
        const sc = scallop ? 1 + 0.07 * Math.cos(t * 9) : 1;
        pts.push([c + Math.cos(t) * w / 2 * sc, y0 + h - w / 2 + Math.sin(t) * w / 2 * 1.15 * sc]);
      }
      pts.push([c - w / 2, y0 + h - w / 2]);
      const P = (s: number, y: number): V3 => (face[0] === 'v' ? [s, y, at + off] : [at + off, y, s]);
      const mid = P(c, y0 + (h - w / 2) * 0.6);
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        this.tri(mid, P(a[0], a[1]), P(b[0], b[1]), surf, out, 6);
      }
    }
  }
  /** All four faces of a block get arcades. */
  arcadeAll(u0: number, u1: number, v0: number, v1: number, y0: number, w: number, h: number, spacing: number, surf: number = S.GLASS): void {
    const nu = Math.max(1, Math.round((u1 - u0) / spacing)), nv = Math.max(1, Math.round((v1 - v0) / spacing));
    this.arcade('v0', v0, u0 + 1, u1 - 1, y0, w, h, nu, surf); this.arcade('v1', v1, u0 + 1, u1 - 1, y0, w, h, nu, surf);
    this.arcade('u0', u0, v0 + 1, v1 - 1, y0, w, h, nv, surf); this.arcade('u1', u1, v0 + 1, v1 - 1, y0, w, h, nv, surf);
  }
  /** Merlon / crenellated parapet along the top of a block. */
  merlons(u0: number, u1: number, v0: number, v1: number, y: number, surf: number = S.STONE): void {
    for (let u = u0 + 0.6; u < u1 - 0.6; u += 1.6) { this.box(u, u + 0.8, y, y + 1.1, v0, v0 + 0.5, surf); this.box(u, u + 0.8, y, y + 1.1, v1 - 0.5, v1, surf); }
    for (let v = v0 + 0.6; v < v1 - 0.6; v += 1.6) { this.box(u0, u0 + 0.5, y, y + 1.1, v, v + 0.8, surf); this.box(u1 - 0.5, u1, y, y + 1.1, v, v + 0.8, surf); }
  }
  /** Tapering multi-stage minaret with balconies and a small dome. */
  minaret(u: number, v: number, r: number, h: number, stages: number, surf: number = S.DOME, y0 = 0): void {
    const sh = h / (stages + 0.6);
    for (let i = 0; i < stages; i++) {
      const rr = r * (1 - i * 0.12);
      this.cylinder(u, v, rr, rr * 0.94, y0 + i * sh, y0 + (i + 1) * sh, 10, surf);
      this.cylinder(u, v, rr * 1.35, rr * 1.35, y0 + (i + 1) * sh - 0.35, y0 + (i + 1) * sh, 10, S.STONE);
    }
    const top = y0 + stages * sh;
    this.chhatri(u, v, r * 1.5, top, S.DOME);
  }
  /** Extrude a WORLD ring between y0..y1. */
  extrudeWorldRing(ring: number[][], y0: number, y1: number, surf: number, roofSurf: number): void {
    const loc = ring.map(([x, z]) => this.local(x, z));
    if (loc.length > 2 && Math.hypot(loc[0][0] - loc[loc.length - 1][0], loc[0][1] - loc[loc.length - 1][1]) < 0.01) loc.pop();
    let cu = 0, cv = 0; for (const [u, v] of loc) { cu += u; cv += v; } cu /= loc.length; cv /= loc.length;
    for (let i = 0; i < loc.length; i++) {
      const a = loc[i], b = loc[(i + 1) % loc.length];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], surf, [(a[0] + b[0]) / 2 - cu, 0, (a[1] + b[1]) / 2 - cv], 12);
    }
    let faces: number[][] = [];
    try { faces = THREE.ShapeUtils.triangulateShape(loc.map(([u, v]) => new THREE.Vector2(u, v)), []); } catch { /* skip roof */ }
    for (const f of faces) { const [a, b, c] = f.map((i) => loc[i]); this.tri([a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], roofSurf, [0, 1, 0], 15); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grounds kit (vertex-coloured: paving, lawns, water, hedges, trees, lattice, flags)
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  paveSand: 0xc9b99a, paveRed: 0xa86a52, paveGrey: 0xaaa59a, path: 0xbcae92, lawn: 0x5d7a3e, lawnDry: 0x7a8048,
  hedge: 0x34502a, bed: 0x6a4e34, water: 0x2f4a4f, waterDeep: 0x24393d, crown: 0x3f5a2c, crownDark: 0x2b4422,
  trunk: 0x4a3a2c, bronze: 0x6b5a45, stoneEle: 0xd2b6a0, steelRed: 0xb5402e, steelWhite: 0xd9d6cf, asphalt: 0x4c4c4c,
  runway: 0x3e3f40, mark: 0xe8e6df, markYellow: 0xd7b33c, grassAir: 0x7f8650, apron: 0x9a9890,
};

class Grounds {
  pos: number[] = []; col: number[] = [];
  private c = new THREE.Color();
  cx = 0; cz = 0; ca = 1; sa = 0;
  frame(s: LandmarkSite, angle = s.a) { this.cx = s.c[0]; this.cz = s.c[1]; this.ca = Math.cos(angle); this.sa = Math.sin(angle); return this; }
  w(u: number, y: number, v: number): number[] { return [this.cx + u * this.ca - v * this.sa, y, this.cz + u * this.sa + v * this.ca]; }
  color(hex: number, jitter = 0) { this.c.setHex(hex); if (jitter) this.c.multiplyScalar(1 + jitter); return this; }
  triW(a: number[], b: number[], c: number[]) {
    // Always wind to face up/out using a cheap normal check against the centroid offset.
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  /** Triangle wound so its normal points away from `ctr`. */
  out(a: number[], b: number[], c: number[], ctr: number[]) {
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const m = [(a[0] + b[0] + c[0]) / 3 - ctr[0], (a[1] + b[1] + c[1]) / 3 - ctr[1], (a[2] + b[2] + c[2]) / 3 - ctr[2]];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) this.triW(a, b, c); else this.triW(a, c, b);
  }
  /** Horizontal rectangle in the local frame (facing +Y). */
  rect(u0: number, u1: number, v0: number, v1: number, y: number) {
    const a = this.w(u0, y, v0), b = this.w(u1, y, v0), c = this.w(u1, y, v1), d = this.w(u0, y, v1);
    this.up(a, b, c); this.up(a, c, d);
  }
  disc(u: number, v: number, r: number, y: number, n = 24, r0 = 0) {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const o0 = this.w(u + Math.cos(a0) * r, y, v + Math.sin(a0) * r), o1 = this.w(u + Math.cos(a1) * r, y, v + Math.sin(a1) * r);
      if (r0 <= 0) this.up(this.w(u, y, v), o0, o1);
      else { const i0 = this.w(u + Math.cos(a0) * r0, y, v + Math.sin(a0) * r0), i1 = this.w(u + Math.cos(a1) * r0, y, v + Math.sin(a1) * r0); this.up(i0, o0, o1); this.up(i0, o1, i1); }
    }
  }
  up(a: number[], b: number[], c: number[]) {
    // Normal (b-a)x(c-a) must point +Y for computeVertexNormals.
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny > 0) this.triW(a, b, c); else this.triW(a, c, b);
  }
  /** Box in the local frame (all faces outward). */
  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number) {
    const P = (u: number, y: number, v: number) => this.w(u, y, v);
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, cy = (y0 + y1) / 2;
    const face = (a: number[], b: number[], c: number[], d: number[]) => {
      const ctr = this.w(cu, cy, cv);
      const m = [(a[0] + c[0]) / 2 - ctr[0], (a[1] + c[1]) / 2 - ctr[1], (a[2] + c[2]) / 2 - ctr[2]];
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) { this.triW(a, c, b); this.triW(a, d, c); } else { this.triW(a, b, c); this.triW(a, c, d); }
    };
    face(P(u0, y0, v0), P(u1, y0, v0), P(u1, y1, v0), P(u0, y1, v0));
    face(P(u0, y0, v1), P(u1, y0, v1), P(u1, y1, v1), P(u0, y1, v1));
    face(P(u0, y0, v0), P(u0, y0, v1), P(u0, y1, v1), P(u0, y1, v0));
    face(P(u1, y0, v0), P(u1, y0, v1), P(u1, y1, v1), P(u1, y1, v0));
    face(P(u0, y1, v0), P(u1, y1, v0), P(u1, y1, v1), P(u0, y1, v1));
  }
  /** A simple formal tree: trunk + faceted crown (ashoka column or rounded). */
  tree(u: number, v: number, h: number, columnar: boolean, seed: number) {
    const j = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
    this.color(C.trunk).box(u - 0.2, u + 0.2, 0, h * 0.3, v - 0.2, v + 0.2);
    this.color(columnar ? C.crownDark : C.crown, (j - 0.5) * 0.2);
    const r = columnar ? h * 0.13 : h * 0.32, y0 = h * 0.25;
    const n = 6, rings: Array<[number, number]> = columnar ? [[r * 0.9, y0], [r * 1.15, y0 + h * 0.35], [r * 0.6, y0 + h * 0.6], [0, y0 + h * 0.78]] : [[r * 0.6, y0], [r * 1.0, y0 + r * 0.6], [r * 0.85, y0 + r * 1.3], [0, y0 + r * 1.75]];
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2 + seed, a1 = ((k + 1) / n) * Math.PI * 2 + seed;
        const [r0, h0] = rings[i], [r1, h1] = rings[i + 1];
        const p = (rr: number, hh: number, a: number) => this.w(u + Math.cos(a) * rr, hh, v + Math.sin(a) * rr);
        const A = p(r0, h0, a0), B = p(r0, h0, a1), Cc = p(r1, h1, a1), D = p(r1, h1, a0);
        const ax = this.w(u, (h0 + h1) / 2, v);
        this.out(A, B, Cc, ax); if (r1 > 0) this.out(A, Cc, D, ax);
      }
    }
  }
  /** Strip along a world polyline (runway, taxiway, path) at height y. */
  stripWorld(pts: number[][], half: number, y: number) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue;
      const nx = -(b[1] - a[1]) / L * half, nz = (b[0] - a[0]) / L * half;
      const A = [a[0] + nx, y, a[1] + nz], B = [b[0] + nx, y, b[1] + nz], Cc = [b[0] - nx, y, b[1] - nz], D = [a[0] - nx, y, a[1] - nz];
      this.up(A, B, Cc); this.up(A, Cc, D);
    }
  }
  polyWorld(ring: number[][], y: number) {
    const r = ring.slice(); if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    let faces: number[][] = [];
    try { faces = THREE.ShapeUtils.triangulateShape(r.map(([x, z]) => new THREE.Vector2(x, z)), []); } catch { return; }
    for (const f of faces) this.up([r[f[0]][0], y, r[f[0]][1]], [r[f[1]][0], y, r[f[1]][1]], [r[f[2]][0], y, r[f[2]][1]]);
  }
  /** Elephant statue facing +u (faceU = 1) or -u (-1): barrel body, four legs, domed head,
   *  ears, tusks, a two-segment trunk curling down, tail and a blanket on the back. */
  elephant(u: number, v: number, y: number, s: number, faceU: number) {
    const f = faceU;
    this.color(C.stoneEle);
    this.box(u - 1.5 * s, u + 1.4 * s, y + 1.4 * s, y + 3.0 * s, v - 0.95 * s, v + 0.95 * s);          // body
    this.box(u - 1.3 * s, u + 1.2 * s, y + 3.0 * s, y + 3.25 * s, v - 0.8 * s, v + 0.8 * s);           // back
    for (const du of [-1.1, 1.0]) for (const dv of [-0.55, 0.55]) this.box(u + du * s - 0.3 * s, u + du * s + 0.3 * s, y, y + 1.45 * s, v + dv * s - 0.3 * s, v + dv * s + 0.3 * s);
    // head with a domed forehead
    this.box(u + f * 1.3 * s - 0.05 * s, u + f * 2.35 * s, y + 1.9 * s, y + 3.4 * s, v - 0.62 * s, v + 0.62 * s);
    this.box(u + f * 1.55 * s - 0.2 * s, u + f * 2.2 * s, y + 3.4 * s, y + 3.75 * s, v - 0.42 * s, v + 0.42 * s);
    // ears
    for (const dv of [-1, 1]) this.box(u + f * 1.2 * s - 0.4 * s, u + f * 1.2 * s + 0.4 * s, y + 2.0 * s, y + 3.3 * s, v + dv * 0.75 * s - 0.06 * s, v + dv * 0.75 * s + 0.06 * s);
    // trunk: two segments curling down and forward
    this.color(C.stoneEle, -0.06);
    this.box(u + f * 2.2 * s - 0.01, u + f * 2.55 * s, y + 1.1 * s, y + 2.5 * s, v - 0.2 * s, v + 0.2 * s);
    this.box(u + f * 2.35 * s, u + f * 2.8 * s, y + 0.45 * s, y + 1.2 * s, v - 0.16 * s, v + 0.16 * s);
    // tusks
    this.color(0xe8e0d0);
    for (const dv of [-1, 1]) this.box(u + f * 2.2 * s - 0.01, u + f * 2.75 * s, y + 1.35 * s, y + 1.55 * s, v + dv * 0.38 * s - 0.05 * s, v + dv * 0.38 * s + 0.05 * s);
    // tail and a pink ceremonial blanket
    this.color(C.stoneEle, -0.1);
    this.box(u - f * 1.55 * s, u - f * 1.7 * s, y + 0.9 * s, y + 2.7 * s, v - 0.07 * s, v + 0.07 * s);
    this.color(0xb77f6d);
    this.box(u - 0.9 * s, u + 0.9 * s, y + 3.25 * s, y + 3.4 * s, v - 0.85 * s, v + 0.85 * s);
    this.color(C.stoneEle, -0.1).box(u - 1.8 * s, u + 1.8 * s, y - 0.01, y + 0.08 * s, v - 1.1 * s, v + 1.1 * s);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

/** Monumental gateway block (triple arches, merlons, corner turrets). `du` shifts it along u. */
function gateBlock(k: Kit, du: number, v: number, h: number, gallery: boolean, hw = 24): void {
  k.domeDefault = S.LIME;
  const a = du - hw, b = du + hw, cu = hw * 0.625;
  k.box(a, b, 0, h, v - 6, v + 6, S.LIME);
  k.arcade('v0', v - 6, du - 6, du + 6, 0, 9, h - 3, 1, S.GLASS, true); k.arcade('v1', v + 6, du - 6, du + 6, 0, 9, h - 3, 1, S.GLASS, true);
  for (const sgn of [-1, 1]) { k.arcade('v0', v - 6, du + sgn * cu - 6, du + sgn * cu + 6, 1, 3.4, 6.4, 1); k.arcade('v1', v + 6, du + sgn * cu - 6, du + sgn * cu + 6, 1, 3.4, 6.4, 1); }
  if (gallery) { k.box(a + 4, b - 4, h, h + 5, v - 5, v + 5, S.LIME); k.arcade('v0', v - 5, a + 6, b - 6, h + 0.6, 1.8, 3.6, 9); k.arcade('v1', v + 5, a + 6, b - 6, h + 0.6, 1.8, 3.6, 9); }
  const top = gallery ? h + 5 : h;
  k.merlons(a, b, v - 6, v + 6, top);
  for (const su of [a + 3, b - 3]) { k.cylinder(su, v, 2.2, 1.8, 0, top + 4, 8, S.LIME); k.chhatri(su, v, 3, top + 4); }
  k.chhatri(du, v, 3.2, top);
}

/** Boundary helpers for sites whose outline comes from user-dropped pins (site.bound). */
function boundLocal(k: Kit, s: LandmarkSite): Array<[number, number]> | null {
  return s.bound && s.bound.length > 2 ? s.bound.map(([x, z]) => k.local(x, z)) : null;
}
function insideOf(loc: Array<[number, number]> | null): (u: number, v: number) => boolean {
  if (!loc) return () => true;
  return (u, v) => {
    let c = false;
    for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
      const [ui, vi] = loc[i], [uj, vj] = loc[j];
      if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
    }
    return c;
  };
}
/** Horizontal span [umin, umax] of the outline at a given v. */
function spanAt(loc: Array<[number, number]>, v: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
    const [u0, v0] = loc[j], [u1, v1] = loc[i];
    if ((v0 - v) * (v1 - v) > 0 || v0 === v1) continue;
    const u = u0 + ((v - v0) / (v1 - v0)) * (u1 - u0); lo = Math.min(lo, u); hi = Math.max(hi, u);
  }
  return lo === Infinity ? null : [lo, hi];
}
/** Wall along an outline, in ~4 m pieces, leaving gaps at gates (local u, v, radius). */
function polyWall(k: Kit, loc: Array<[number, number]>, h: number, surf: number, gaps: Array<[number, number, number]>): void {
  for (let i = 0; i < loc.length; i++) {
    const [au, av] = loc[i], [bu, bv] = loc[(i + 1) % loc.length];
    const len = Math.hypot(bu - au, bv - av); if (len < 0.5) continue;
    const n = Math.max(1, Math.ceil(len / 4)), nu = -(bv - av) / len * 0.7, nv = (bu - au) / len * 0.7;
    for (let j = 0; j < n; j++) {
      const t0 = j / n, t1 = (j + 1) / n;
      const pu = au + (bu - au) * (t0 + t1) / 2, pv = av + (bv - av) * (t0 + t1) / 2;
      if (gaps.some(([gu, gv, r]) => Math.hypot(pu - gu, pv - gv) < r)) continue;
      const P = (t: number, sg: number): number[] => { const q = k.w([au + (bu - au) * t + nu * sg, 0, av + (bv - av) * t + nv * sg]); return [q[0], q[2]]; };
      k.extrudeWorldRing([P(t0, 1), P(t1, 1), P(t1, -1), P(t0, -1)], 0, h, surf, surf);
    }
  }
}
/** Small road gateway: one tall arch, two side niches, parapet and corner kiosks. */
function smallGate(k: Kit, hw: number, h: number, surf: number): void {
  k.domeDefault = surf;
  k.box(-hw, hw, 0, h, -4, 4, surf);
  k.arcade('v0', -4, -2.6, 2.6, 0, 4.4, h - 2, 1, S.GLASS, true); k.arcade('v1', 4, -2.6, 2.6, 0, 4.4, h - 2, 1, S.GLASS, true);
  for (const sg of [-1, 1]) { k.arcade('v0', -4, sg * hw * 0.68 - 1.3, sg * hw * 0.68 + 1.3, 1, 1.6, 4, 1); k.arcade('v1', 4, sg * hw * 0.68 - 1.3, sg * hw * 0.68 + 1.3, 1, 1.6, 4, 1); }
  k.merlons(-hw, hw, -4, 4, h, surf);
  for (const sg of [-1, 1]) { k.cylinder(sg * (hw - 1.4), 0, 1.2, 1.0, 0, h + 2.5, 8, surf); k.chhatri(sg * (hw - 1.4), 0, 2.2, h + 2.5, surf); }
  k.chhatri(0, 0, 2.6, h, surf);
}
/** A formal city park inside a user-pinned outline: lawn, gravel walks, central circular plaza with a
 *  fountain, flower beds and trees around the edge (no tree carpet). */
function cityPark(k: Kit, g: Grounds, s: LandmarkSite): void {
  k.begin(s, 6, 171); g.frame(s, 0);
  const loc = boundLocal(k, s); if (!loc) return;
  const IN = insideOf(loc);
  g.color(0x6f8d48); g.polyWorld(s.bound!, 0.09);
  const xs = loc.map((q) => q[0]), vs = loc.map((q) => q[1]);
  const u0 = Math.min(...xs), u1 = Math.max(...xs), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const [pu, pv] = k.local(-4111.2, -2494.9);  // user pin 1: central plaza
  for (let u = u0 + 6; u < u1; u += 2) { if (IN(u, pv)) g.color(0xc9b996).rect(u - 1, u + 1, pv - 2, pv + 2, 0.12); }
  for (let v = v0 + 6; v < v1; v += 2) { if (IN(pu, v)) g.color(0xc9b996).rect(pu - 2, pu + 2, v - 1, v + 1, 0.12); }
  g.color(0xc9b996).disc(pu, pv, 16, 0.13, 40); g.color(0x6f8d48).disc(pu, pv, 12, 0.14, 40);
  g.color(0xd8cdb4).disc(pu, pv, 5, 0.15, 24); g.color(0x5f8a9a).disc(pu, pv, 3.4, 0.16, 20);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (IN(pu + Math.cos(a) * 26, pv + Math.sin(a) * 26)) g.color(i % 2 ? 0xb5574a : 0xd6a23c).disc(pu + Math.cos(a) * 26, pv + Math.sin(a) * 26, 3, 0.15, 14); }
  let seed = 7;
  for (let i = 0; i < loc.length; i++) {
    const [au, av] = loc[i], [bu, bv] = loc[(i + 1) % loc.length], len = Math.hypot(bu - au, bv - av);
    for (let d = 4; d < len; d += 9) {
      const t = d / len, cu = (au + bu) / 2, cv = (av + bv) / 2; void cu; void cv;
      const u = au + (bu - au) * t, v = av + (bv - av) * t, mu = (pu - u), mv = (pv - v), ml = Math.hypot(mu, mv) || 1;
      const iu = u + (mu / ml) * 5, iv = v + (mv / ml) * 5;
      if (IN(iu, iv)) g.tree(iu, iv, 8 + (seed % 4), false, seed++);
    }
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, r = 40 + (i % 3) * 8, u = pu + Math.cos(a) * r, v = pv + Math.sin(a) * r; if (IN(u, v)) g.tree(u, v, 9, false, seed++); }
}

function baraImambara(k: Kit, g: Grounds, s: LandmarkSite): void {
  // Site frame: u along the hall's long axis (~east), v toward the south. The hall stands at
  // the south end; the courts, the Asafi Masjid (west, facing east), the Shahi Baoli (east)
  // and the two gateways lie to the north (-v), toward Rumi Darwaza.
  k.begin(s, 20, 23); k.domeDefault = S.LIME; g.frame(s);
  const BL = boundLocal(k, s), IN = insideOf(BL);
  // Grounds: paving over the user-pinned compound outline, three courts, forecourt, gardens.
  if (s.bound) { g.color(C.paveSand); g.polyWorld(s.bound, 0.08); } else g.color(C.paveSand).rect(-116, 116, -260, 46, 0.08);
  g.color(C.paveGrey).rect(-60, 60, -258, -218, 0.1);                        // outer forecourt
  // Circular lawn court with a paved ring path and a central fountain, as in the reference
  // satellite view of the outer forecourt (ring path r 24-30, lawn r 24, fountain r 4).
  g.color(C.path).disc(0, -236, 31, 0.12, 48); g.color(C.lawn).disc(0, -236, 25, 0.14, 48);
  g.color(C.paveSand).disc(0, -236, 5.5, 0.15, 24); g.color(C.water).disc(0, -236, 3.5, 0.17, 20);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.tree(Math.cos(a) * 27.5, -236 + Math.sin(a) * 27.5, 4.2, true, 300 + i); }
  g.color(C.lawn).rect(-50, -10, -208, -172, 0.12); g.color(C.lawn).rect(10, 50, -208, -172, 0.12); // second court
  // Main garden (charbagh-style parterres with hedged borders and cross paths).
  for (const [u0, u1] of [[-46, -4], [4, 46]]) for (const [v0, v1] of [[-150, -95], [-88, -32]]) {
    g.color(C.hedge).rect(u0, u1, v0, v1, 0.12); g.color(C.lawn).rect(u0 + 1.2, u1 - 1.2, v0 + 1.2, v1 - 1.2, 0.14);
    g.color(C.bed).rect((u0 + u1) / 2 - 3, (u0 + u1) / 2 + 3, (v0 + v1) / 2 - 3, (v0 + v1) / 2 + 3, 0.16);
  }
  g.color(C.path).rect(-4, 4, -158, -24, 0.15); g.color(C.path).rect(-48, 48, -93, -89, 0.15);
  // Diagonal paths across the garden from the second gateway toward the corners.
  for (const sg of [-1, 1]) for (let t = 0; t < 60; t += 2) {
    g.color(C.path).disc(sg * (4 + t * 0.62), -165 + t * 1.0, 1.7, 0.16, 8);
  }
  // Open dusty courtyard north of the Asafi Masjid (the large bare forecourt in the photograph).
  g.color(0xb9a583).rect(-112, -52, -200, -128, 0.1);
  g.color(0xa89572).rect(-112, -52, -200, -196, 0.11);
  let seed = 1;
  for (let v = -150; v <= -32; v += 9) { g.tree(-49, v, 9, true, seed++); g.tree(49, v, 9, true, seed++); }
  // East side of the compound is wooded in the photograph: a dense grove along the east wall.
  for (let v = -150; v <= 20; v += 8) for (let u = 80; u <= 108; u += 9) if (IN(u, v)) g.tree(u + ((v * 7) % 5), v + ((u * 3) % 4), 8 + ((u + v) % 4), false, seed++);
  // Long arcaded galleries with small domed kiosks flank the circular court along the north wall.
  for (const sg of [-1, 1]) {
    const u0 = sg > 0 ? 36 : -106, u1 = sg > 0 ? 106 : -72;
    if (!IN(u0, -256) || !IN(u1, -256)) continue;
    k.box(u0, u1, 0, 5.5, -262, -250, S.LIME);
    k.arcade('v1', -250, u0 + 1, u1 - 1, 0.5, 2.2, 3.8, Math.round((u1 - u0) / 5));
    k.merlons(u0, u1, -262, -250, 5.5);
    for (let u = u0 + 6; u < u1; u += 14) k.chhatri(u, -256, 2.4, 5.5);
  }
  // Perimeter wall along the pinned outline, open at the outer gate; the cross wall carrying the
  // second gateway runs between the outline's edges at that line.
  const wallH = 6;
  if (BL) {
    polyWall(k, BL, wallH, S.LIME, [[-5, -262, 26], [-1.5, -161, 0]]);
    const sp = spanAt(BL, -161);
    if (sp) { k.box(sp[0], -24, 0, wallH, -162, -160, S.LIME); k.box(21, sp[1], 0, wallH, -162, -160, S.LIME); }
  }
  // Gateways, per the NMA plan labels: FIRST triple gateway (carries the Naqqar/Naubat Khana
  // gallery) and SECOND triple gateway, giving three forecourts. Rumi Darwaza is the separate
  // external gate on the public road (rumiDarwaza()), not one of these.
  // Outer gate (with the Naubat Khana gallery) stands where the user pinned it: 44 m west of the
  // compound axis. The second gateway keeps the axis.
  gateBlock(k, -5, -262, 15, true);      // user pin 4
  gateBlock(k, -1.5, -161, 13, false);   // user pin 2
  // Raised platform, steps and the main hall.
  k.box(-66, 66, 0, 2.4, -26, 34, S.LIME);
  for (let i = 0; i < 4; i++) k.box(-22, 22, 0, 2.4 - i * 0.6, -26 - (i + 1) * 0.9, -26 - i * 0.9, S.LIME);
  k.box(-60, 60, 2.4, 15, -20, 28, S.LIME);
  k.box(-24, 24, 15, 19.5, -18, 26, S.LIME);                    // central raised hall (vaulted roof)
  k.arcade('v0', -20, -58, 58, 2.6, 4.6, 8.6, 13, S.GLASS, true);
  k.arcade('v0', -20, -58, 58, 10.4, 2.6, 4.2, 23);
  k.arcade('v1', 28, -58, 58, 2.6, 3.6, 7.6, 15);
  k.arcade('u0', -60, -18, 26, 2.6, 3.6, 7.6, 5); k.arcade('u1', 60, -18, 26, 2.6, 3.6, 7.6, 5);
  k.arcade('v0', -18, -22, 22, 15.4, 2.2, 3.4, 9);
  k.merlons(-60, 60, -20, 28, 15); k.merlons(-24, 24, -18, 26, 19.5);
  for (let i = 0; i <= 10; i++) { const u = -56 + i * 11.2; k.chhatri(u, -18.5, 1.7, 15); }
  for (const u of [-58, 58]) for (const v of [-18, 26]) { k.cylinder(u, v, 2.4, 2.0, 2.4, 21, 8, S.LIME); k.chhatri(u, v, 3.2, 21); }
  for (const u of [-22, 22]) { k.chhatri(u, -16.5, 2.4, 19.5); }
  // Asafi Masjid (NMA: 11 arches on the east facade, taller central arch, tapering
  // multi-storey minarets, THREE pear-shaped domes, parapet domelets; ~25.13 m).
  const mu = -76, mv = -88;
  k.box(mu - 14, mu + 26, 0, 3.2, mv - 34, mv + 34, S.LIME);                      // plinth + forecourt
  for (let i = 0; i < 4; i++) k.box(mu + 26 + i * 0.9, mu + 27 + i * 0.9, 0, 3.2 - (i + 1) * 0.75, mv - 12, mv + 12, S.LIME);
  g.color(C.paveSand).rect(mu - 14, mu + 26, mv - 34, mv + 34, 3.25);
  k.box(mu - 12, mu + 6, 3.2, 15.5, mv - 27, mv + 27, S.LIME);                    // prayer hall
  k.arcade('u1', mu + 6, mv - 26, mv + 26, 3.3, 3.1, 8.0, 11, S.GLASS, true);
  k.box(mu + 4, mu + 7.5, 3.2, 18.5, mv - 4.8, mv + 4.8, S.LIME);                 // central pishtaq
  k.arcade('u1', mu + 7.5, mv - 3.6, mv + 3.6, 3.3, 5.6, 12.5, 1, S.GLASS, true);
  k.merlons(mu - 12, mu + 6, mv - 27, mv + 27, 15.5, S.LIME);
  for (let i = 0; i < 12; i++) k.onion(mu + 5.6, mv - 25 + i * (50 / 11), 0.55, 15.5, 1.2, S.LIME, 0.2, false);
  for (const [dv, r, h] of [[0, 5.8, 8.6], [-15, 4.2, 6.4], [15, 4.2, 6.4]] as Array<[number, number, number]>) {
    k.cylinder(mu - 3, mv + dv, r * 0.95, r * 0.95, 15.5, 17.2, 16, S.LIME);
    k.onion(mu - 3, mv + dv, r, 17.2, h, S.LIME, 0.32);                           // pear-shaped
  }
  for (const dv of [-29, 29]) k.minaret(mu + 6, mv + dv, 1.6, 26, 4, S.LIME, 3.2);
  // Shahi Baoli (stepped well) on the east side.
  const bu = 80, bv = -92;
  k.box(bu - 17, bu + 17, 0, 7.5, bv - 17, bv + 17, S.LIME, S.ROOF);
  k.arcadeAll(bu - 17, bu + 17, bv - 17, bv + 17, 0.4, 2.6, 5.5, 4.2);
  for (let i = 0; i < 5; i++) { const r = 11 - i * 2; g.color(i % 2 ? C.paveSand : C.paveGrey).rect(bu - r, bu + r, bv - r, bv + r, 7.55 - i * 1.4); }
  g.color(C.waterDeep).rect(bu - 2.5, bu + 2.5, bv - 2.5, bv + 2.5, 1.2);
}

/**
 * Teele Wali Masjid, from the user's pins and photographs: three WHITE domes in a row (the middle one
 * larger), two tall white minarets at the ends, an arched west facade, and a large red-paved
 * platform with red-edged walls and steps running west of the hall. Site frame: u east, v south,
 * hall facing west. Dimensions are estimates from the oblique photo, not a survey.
 */
function teeleWaliMasjid(k: Kit, g: Grounds, s: LandmarkSite): void {
  k.begin(s, 30, 131); g.frame(s);
  const RED = 0xb0553f, PAVE = 0xb87764, LIGHT = 0xc9bba4;
  // Platform and approach.
  g.color(LIGHT).rect(-76, 14, -30, 30, 0.08);
  k.box(-66, -8, 0, 2.2, -25, 25, S.REDSTONE, S.REDSTONE);
  g.color(PAVE).rect(-66, -8, -25, 25, 2.25);
  g.color(RED).rect(-66, -62, -25, 25, 2.3); g.color(RED).rect(-66, -8, -25, -23.5, 2.3); g.color(RED).rect(-66, -8, 23.5, 25, 2.3);
  for (let i = 0; i < 6; i++) k.box(-66 - (i + 1) * 0.9, -66 - i * 0.9, 0, 2.2 - (i + 1) * 0.36, -9, 9, S.REDSTONE);   // west steps
  // Ablution tank and two small kiosks on the platform, as in the photograph.
  g.color(0x6c8890).rect(-36, -24, -6, 6, 2.32);
  for (const v of [-18, 18]) { k.box(-60, -55, 2.2, 5.5, v - 2.5, v + 2.5, S.LIME); k.hemi(-57.5, v, 2.6, 5.5, S.DOME, 0.9); }
  // Prayer hall.
  k.box(-8, 8, 2.2, 12, -21, 21, S.DOME);
  k.arcade('u0', -8, -19, 19, 2.6, 2.9, 6.8, 7, S.GLASS, true);
  k.merlons(-8, 8, -21, 21, 12, S.DOME);
  // Three domes, evenly spaced (12.6 m) about the middle dome (user pin 1); the side domes are not
  // taken from pins 2 and 3, which were only approximate.
  for (const [v, r, hgt] of [[0, 5.6, 8.4], [12.6, 3.9, 6.2], [-12.6, 3.9, 6.2]] as Array<[number, number, number]>) {
    k.cylinder(0, v, r * 0.92, r * 0.92, 12, 13.6, 18, S.DOME);
    k.onion(0, v, r, 13.6, hgt, S.DOME, 0.28);
  }
  // Two tall minarets at the ends of the facade with chhatri crowns.
  for (const v of [-22.5, 22.5]) { k.minaret(-6, v, 1.5, 30, 4, S.DOME, 2.2); k.chhatri(-6, v, 3.4, 30, S.DOME); }
  for (const v of [-21, 21]) k.chhatri(6, v, 2.6, 12, S.DOME);
}

/**
 * Dariya Wali Masjid, after the user's satellite and aerial photos: a sandy flat-roofed hall with a
 * parapet, a stepped inner court with a small cistern and two slender minarets on its far corners, and a
 * separate domed structure (gold-brown dome on an octagonal drum with corner turrets) at the back.
 * Everything is kept INSIDE the Overture footprint plus a small back yard, never toward the road.
 */
function dariyaWaliMasjid(k: Kit, g: Grounds, s: LandmarkSite): void {
  k.begin(s, 20, 151); g.frame(s);
  const hu = s.ext[0] / 2, hv = s.ext[1] / 2;
  const SAND = 0xc2ab82;
  g.color(SAND).rect(-hu - 3, hu + 3, -hv - 3, hv + 3, 0.08);
  if (s.ring.length > 3) k.extrudeWorldRing(s.ring, 0, 6.5, S.STONE, S.STONE);
  // Parapet, a stepped inner court and a cistern.
  k.merlons(-hu, hu, -hv, hv, 6.5, S.STONE);
  k.box(-hu * 0.55, hu * 0.55, 6.5, 8.0, -hv * 0.5, hv * 0.5, S.STONE);
  g.color(0x6f7f80).rect(-hu * 0.18, hu * 0.18, -hv * 0.12, hv * 0.12, 8.05);
  k.arcade('v1', hv, -hu + 2, hu - 2, 0.4, 2.0, 4.6, Math.max(2, Math.round(hu / 3)), S.GLASS, true);
  // Two slender minarets on the front corners.
  for (const u of [-hu + 1.2, hu - 1.2]) { k.minaret(u, hv - 1.2, 1.2, 17, 3, S.STONE, 6.5); k.chhatri(u, hv - 1.2, 2.6, 17, S.DOME); }
  // The domed structure at the back (north-west corner of the site): octagonal drum, gold-brown dome, turrets.
  const du = hu + 9, dv = -hv + 4;
  g.color(SAND).rect(du - 6, du + 6, dv - 6, dv + 6, 0.1);
  k.box(du - 4.2, du + 4.2, 0, 5, dv - 4.2, dv + 4.2, S.STONE);
  k.arcadeAll(du - 4.2, du + 4.2, dv - 4.2, dv + 4.2, 0.5, 1.6, 3.2, 3, S.GLASS);
  k.cylinder(du, dv, 3.3, 3.3, 5, 7, 8, S.STONE);
  k.onion(du, dv, 3.4, 7, 4.4, S.GILT, 0.25);
  for (const a of [-1, 1]) for (const b of [-1, 1]) k.chhatri(du + a * 4.2, dv + b * 4.2, 1.5, 5, S.STONE);
}

function chhotaImambara(k: Kit, g: Grounds, s: LandmarkSite): void {
  // Footprint frame: main Imambara at the origin on a raised terrace, the long courtyard
  // with its raised central water tank and iron bridge running toward the gate (-v).
  k.begin(s, 30, 53); g.frame(s);
  const CL = boundLocal(k, s), CIN = insideOf(CL); void CIN;
  if (s.bound) { g.color(C.paveSand); g.polyWorld(s.bound, 0.08); } else g.color(C.paveSand).rect(-72, 64, -152, 34, 0.08);
  for (const su of [-1, 1]) {
    g.color(C.hedge).rect(su * 10, su * 46, -138, -28, 0.12); g.color(C.lawn).rect(su * 11.2, su * 44.8, -136.8, -29.2, 0.14);
    for (let v = -128; v <= -38; v += 17) g.color(C.bed).disc(su * 28, v, 2.2, 0.17, 12);
  }
  g.color(C.path).rect(-10, 10, -152, -28, 0.12);
  // Raised central tank with its channel and the ornamental bridge.
  k.box(-7.5, 7.5, 0, 1.0, -138, -30, S.STONE, S.STONE);
  g.color(C.water).rect(-6.3, 6.3, -137, -31, 1.02);
  k.box(-8.5, 8.5, 1.0, 1.6, -91.5, -88.5, S.METAL, S.METAL);                       // iron bridge deck
  for (const su of [-8.2, 8.2]) k.box(su - 0.1, su + 0.1, 1.6, 2.6, -91.5, -88.5, S.METAL);
  let seed = 3;
  for (let v = -133; v <= -35; v += 10) { g.tree(-47, v, 10, true, seed++); g.tree(47, v, 10, true, seed++); }
  // Terrace + main Imambara (white, gilded central dome, corner minarets, kiosks).
  const lu = Math.min(24, s.ext[0] / 2 + 2), lv = Math.min(16, s.ext[1] / 2);
  k.box(-lu - 6, lu + 6, 0, 2.5, -lv - 10, lv + 4, S.STONE);
  k.box(-lu, lu, 2.5, 14, -lv, lv, S.DOME);
  k.arcade('v0', -lv, -lu + 2, lu - 2, 3, 2.8, 7.5, 7, S.GLASS, true); k.arcade('v1', lv, -lu + 2, lu - 2, 3, 2.6, 7, 7);
  k.arcade('u0', -lu, -lv + 2, lv - 2, 3, 2.6, 7, 4); k.arcade('u1', lu, -lv + 2, lv - 2, 3, 2.6, 7, 4);
  k.merlons(-lu, lu, -lv, lv, 14, S.DOME);
  k.cylinder(0, 0, 6.2, 6.2, 14, 18, 18, S.DOME);
  k.onion(0, 0, 6.0, 18, 10.5, S.GILT, 0.22);
  for (const u of [-lu + 1.2, lu - 1.2]) for (const v of [-lv + 1.2, lv - 1.2]) k.minaret(u, v, 1.1, 22, 3, S.DOME, 2.5);
  for (let i = 1; i <= 4; i++) { const u = -lu + (2 * lu * i) / 5; k.chhatri(u, -lv + 1.2, 1.3, 14); }
  // Twin white-domed mausoleums either side of the tank.
  for (const su of [-1, 1]) {
    const u = su * 30, v = -96;
    k.box(u - 9, u + 9, 0, 1.2, v - 9, v + 9, S.STONE);
    k.box(u - 6, u + 6, 1.2, 8.5, v - 6, v + 6, S.DOME);
    k.arcadeAll(u - 6, u + 6, v - 6, v + 6, 1.4, 2.4, 5, 4);
    k.cylinder(u, v, 3.6, 3.6, 8.5, 10.2, 14, S.DOME); k.onion(u, v, 3.5, 10.2, 5.6, S.DOME, 0.22);
    for (const du of [-5.2, 5.2]) for (const dv of [-5.2, 5.2]) k.cylinder(u + du, v + dv, 0.5, 0.35, 1.2, 12, 8, S.DOME);
  }
  // Mosque, moved to user pin 3 and made smaller (about 80 percent).
  {
    const mu = -62.5, mv = -122.8, f = 0.8, hu2 = 11 * f, hv2 = lv * f;
    k.box(mu - hu2, mu + hu2, 0, 9 * f, mv - hv2, mv + hv2, S.DOME); k.arcade('u0', mu - hu2, mv - hv2 + 1.5, mv + hv2 - 1.5, 0.5, 2.4, 5.6, 4, S.GLASS, true);
    for (const dv of [-6.4, 0, 6.4]) k.onion(mu, mv + dv, dv ? 2.2 : 2.9, 9 * f, dv ? 3.4 : 4.4, S.DOME, 0.2);
    for (const dv of [-hv2, hv2]) k.minaret(mu - hu2 + 1, mv + dv, 0.8, 15, 3, S.DOME);
  }
  // Gates: white main gateway and a side gate; boundary walls.
  k.box(-20, 20, 0, 14, -152, -142, S.DOME); k.arcade('v0', -152, -6, 6, 0, 8, 12, 1, S.GLASS, true); k.arcade('v1', -142, -6, 6, 0, 8, 12, 1, S.GLASS, true);
  k.merlons(-20, 20, -152, -142, 14, S.DOME); for (const su of [-17, 17]) k.chhatri(su, -147, 2.6, 14);
  if (CL) polyWall(k, CL, 4.5, S.DOME, [[0, -147, 22]]);
}

function ambedkarMemorial(k: Kit, g: Grounds, s: LandmarkSite): void {
  // Round 3, second rebuild, composed from the user's oblique and top-down reference views
  // (qualitative only: nothing is traced; the outline is the Overture precinct polygon and
  // every feature is placed by eye as a FRACTION of that polygon's bounding box, north up).
  //   NW   cloverleaf (four-lobed) platform with a small stupa
  //   N    circular inlaid plazas, a large one at the NE
  //   centre  square-framed court
  //   SE   two white domed halls
  //   SW   semicircular tiered amphitheatre
  //   diagonal band   two rows of 31 elephants (62), pale avenue between
  //   SE corner   small triangular pool;  S   a grove
  // The whole precinct is paved (pale sand/pink); trees are narrow edge strips only.
  const ring = PRECINCTS.ambedkar ?? s.ring;
  k.begin(s, 40, 97); g.frame(s);
  const PALE = 0xcdbfa6, INLAY = 0xbba98d, PINK = 0xc9a791, WHITE = 0xe3dac9, POOL = 0x46585a;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const W = maxX - minX, H = maxZ - minZ;
  /** Fractions of the bounding box (north up, x east) to local (u, v). */
  const P = (fx: number, fy: number): [number, number] => k.local(minX + fx * W, minZ + fy * H);
  const loc: Array<[number, number]> = ring.map(([x, z]) => k.local(x, z));
  const inside = (u: number, v: number): boolean => {
    let c = false;
    for (let i = 0, j = loc.length - 1; i < loc.length; j = i++) {
      const [ui, vi] = loc[i], [uj, vj] = loc[j];
      if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
    }
    return c;
  };
  /** Oriented rectangle in world-aligned axes, drawn as a flat quad via a local polygon. */
  const quad = (col: number, cx: number, cy: number, hx: number, hy: number, y: number): void => {
    const pts: Array<[number, number]> = [P(cx - hx, cy - hy), P(cx + hx, cy - hy), P(cx + hx, cy + hy), P(cx - hx, cy + hy)];
    const w = pts.map(([u, v]) => { const q = k.w([u, 0, v]); return [q[0], q[2]]; });
    g.color(col).polyWorld(w, y);
  };
  const disc = (col: number, fx: number, fy: number, r: number, y: number): void => {
    const [u, v] = P(fx, fy); g.color(col).disc(u, v, r * W, y, 40);
  };
  const rings = (fx: number, fy: number, r: number, y: number): void => {
    const cols = [PALE, PINK, WHITE, INLAY, PINK, WHITE];
    for (let i = 0; i < cols.length; i++) disc(cols[i], fx, fy, r * (1 - i * 0.16), y + i * 0.015);
  };

  // 1. Paving over the whole precinct, with a faint grid.
  g.color(PALE); g.polyWorld(ring, 0.07);
  for (let f = 0.06; f < 1; f += 0.06) {
    quad(INLAY, f, 0.5, 0.0006, 0.5, 0.08);
    quad(INLAY, 0.5, f, 0.5, 0.0006, 0.08);
  }

  // 2. Circular inlaid plazas.
  rings(0.785, 0.25, 0.115, 0.1);   // large NE plaza
  rings(0.59, 0.215, 0.06, 0.1);
  rings(0.34, 0.07, 0.045, 0.1);

  // 3. Square-framed court at the centre.
  quad(INLAY, 0.49, 0.40, 0.06, 0.06, 0.11);
  quad(PALE, 0.49, 0.40, 0.05, 0.05, 0.12);
  quad(WHITE, 0.49, 0.40, 0.022, 0.022, 0.13);

  // 4. Cloverleaf platform with a small stupa: four RAISED petals (stepped white mounds with a
  //    pink inlaid crown and an upstand rim), joined by a raised central block under the stupa.
  {
    const [cu, cv] = P(0.31, 0.24);
    const R = 0.09 * W;
    const circ = (u: number, v: number, r: number): number[][] => {
      const o: number[][] = [];
      for (let t = 0; t < 32; t++) { const q = (t / 32) * Math.PI * 2; const w = k.w([u + Math.cos(q) * r, 0, v + Math.sin(q) * r]); o.push([w[0], w[2]]); }
      return o;
    };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lu = cu + Math.cos(a) * R * 0.62, lv = cv + Math.sin(a) * R * 0.62;
      k.extrudeWorldRing(circ(lu, lv, R * 0.52), 0, 5.0, S.LIME, S.LIME);       // base mass
      k.extrudeWorldRing(circ(lu, lv, R * 0.44), 5.0, 7.2, S.LIME, S.LIME);     // second step
      k.extrudeWorldRing(circ(lu, lv, R * 0.34), 7.2, 9.0, S.LIME, S.LIME);     // crown
      g.color(PINK).polyWorld(circ(lu, lv, R * 0.27), 9.05);
      for (const sg of [-1, 1]) k.box(lu - R * 0.2, lu + R * 0.2, 9.0, 9.9, lv + sg * R * 0.08 - 0.5, lv + sg * R * 0.08 + 0.5, S.LIME);
    }
    k.extrudeWorldRing(circ(cu, cv, R * 0.34), 0, 7, S.LIME, S.LIME);           // raised joining block
    k.cylinder(cu, cv, 5.5, 5.5, 7, 11, 20, S.LIME);
    k.hemi(cu, cv, 5.2, 11, S.LIME, 0.75);
    k.cylinder(cu, cv, 0.5, 0.15, 15, 19, 8, S.GILT);
  }

  // 5. Two white domed halls (SE).
  for (const [fx, fy, R2] of [[0.835, 0.57, 0.034], [0.785, 0.635, 0.03]] as Array<[number, number, number]>) {
    const [u, v] = P(fx, fy);
    const r = R2 * W;
    k.box(u - r * 1.9, u + r * 1.9, 0, 5, v - r * 1.9, v + r * 1.9, S.LIME);
    k.arcadeAll(u - r * 1.9, u + r * 1.9, v - r * 1.9, v + r * 1.9, 0.5, 3.2, 4, 7, S.GLASS);
    k.merlons(u - r * 1.9, u + r * 1.9, v - r * 1.9, v + r * 1.9, 5, S.LIME);
    for (const du of [-1, 1]) for (const dv of [-1, 1]) k.chhatri(u + du * r * 1.9, v + dv * r * 1.9, 3.2, 5, S.LIME);
    k.cylinder(u, v, r, r, 5, 9, 28, S.LIME);
    k.hemi(u, v, r * 0.98, 9, S.LIME, 0.8);
    k.cylinder(u, v, 1.1, 0.3, 9 + r * 0.78, 9 + r * 0.78 + 3.5, 8, S.GILT);
  }

  // 6. Semicircular tiered amphitheatre (SW). Built in world axes: arc to the west, flat edge
  //    facing east. Eight stepped annular tiers rising outward, a low stage, a colonnade on the
  //    outer arc and radial aisles. Proportions are read from the reference views, not surveyed.
  {
    const cxw = minX + 0.225 * W, czw = minZ + 0.665 * H;
    const R = 0.17 * W;
    const arcPt = (r: number, a: number): number[] => [cxw + Math.cos(a) * r, czw + Math.sin(a) * r];
    const sector = (rOut: number, rIn: number): number[][] => {
      const o: number[][] = [], i: number[][] = [];
      for (let t = 0; t <= 28; t++) { const a = Math.PI * 0.5 + (t / 28) * Math.PI; o.push(arcPt(rOut, a)); i.push(arcPt(rIn, a)); }
      return o.concat(i.reverse());
    };
    const TIERS = 8, rStage = R * 0.30;
    for (let i = 0; i < TIERS; i++) {
      const rOut = R - (i * (R - rStage * 1.35)) / TIERS, rIn = R - ((i + 1) * (R - rStage * 1.35)) / TIERS;
      const h = 0.7 + (TIERS - i) * 0.55;                       // outer tiers are higher
      k.extrudeWorldRing(sector(rOut, rIn), 0, h, i % 2 ? S.STONE : S.LIME, i % 2 ? S.STONE : S.LIME);
    }
    // Stage and the wall around it.
    const [su, sv] = k.local(cxw, czw);
    g.color(0xd9cdb8).disc(su, sv, rStage * 1.3, 0.3, 36);
    g.color(0xcdae94).disc(su, sv, rStage * 0.95, 0.35, 36);
    // Radial aisles between seating blocks.
    for (let n = 1; n < 9; n++) {
      const a = Math.PI * 0.5 + (n / 9) * Math.PI;
      const p0 = arcPt(rStage * 1.35, a), p1 = arcPt(R, a), nx = -Math.sin(a) * 1.2, nz = Math.cos(a) * 1.2;
      g.color(0xefe6d6).polyWorld([[p0[0] + nx, p0[1] + nz], [p1[0] + nx, p1[1] + nz], [p1[0] - nx, p1[1] - nz], [p0[0] - nx, p0[1] - nz]], 5.05);
    }
    // Colonnade along the outer arc with a continuous entablature.
    const cols = 46;
    for (let t = 0; t <= cols; t++) {
      const a = Math.PI * 0.5 + (t / cols) * Math.PI, p = arcPt(R + 2, a);
      const [u, v] = k.local(p[0], p[1]);
      if (inside(u, v)) k.cylinder(u, v, 0.9, 0.8, 0, 9.5, 8, S.LIME);
    }
    k.extrudeWorldRing(sector(R + 3, R + 1), 9.5, 10.6, S.LIME, S.LIME);
    // Heavy outer wall ring (pink sandstone) with four kiosks on its crown, and an inner
    // raised semicircular seating bowl around the stage, after the dusk drone reference.
    k.extrudeWorldRing(sector(R + 11, R + 3), 0, 5.5, S.STONE, S.STONE);
    for (const t of [0.08, 0.36, 0.64, 0.92]) {
      const a = Math.PI * 0.5 + t * Math.PI, p = arcPt(R + 7, a), [u, v] = k.local(p[0], p[1]);
      k.chhatri(u, v, 4.6, 5.5, S.REDSTONE);
    }
    k.extrudeWorldRing(sector(rStage * 1.9, rStage * 1.45), 0, 4.2, S.LIME, S.LIME);
  }

  // 7. Elephant avenue: 62 elephants (2 x 31, documented) on pedestals along a long diagonal
  //    band with low parapets, lamp columns and shallow steps; the band runs the length of the
  //    plaza as in the references. Lamp columns are extra to the 62.
  {
    const [u0, v0] = P(0.15, 0.37), [u1, v1] = P(0.72, 0.82);
    const dx = u1 - u0, dv = v1 - v0, len = Math.hypot(dx, dv), ux = dx / len, uv = dv / len, nx = -uv, nv = ux;
    const hw = 24;
    const wp = (u: number, v: number): number[] => { const q = k.w([u, 0, v]); return [q[0], q[2]]; };
    const strip = (o0: number, o1: number, a: number, b: number): number[][] =>
      [wp(u0 + dx * a + nx * o0, v0 + dv * a + nv * o0), wp(u0 + dx * b + nx * o0, v0 + dv * b + nv * o0),
       wp(u0 + dx * b + nx * o1, v0 + dv * b + nv * o1), wp(u0 + dx * a + nx * o1, v0 + dv * a + nv * o1)];
    g.color(WHITE).polyWorld(strip(-hw, hw, 0, 1), 0.09);
    g.color(INLAY).polyWorld(strip(-3, 3, 0, 1), 0.11);                             // centre water-lane
    for (const sg of [-1, 1]) {
      k.extrudeWorldRing(strip(sg * hw, sg * (hw + 1.4), 0, 1), 0, 1.0, S.LIME, S.LIME);  // parapet
      for (let st = 0; st < 3; st++) g.color(st % 2 ? WHITE : PINK).polyWorld(strip(sg * (hw + 1.4 + st * 1.5), sg * (hw + 2.9 + st * 1.5), 0, 1), 0.1);
    }
    for (let i = 0; i < 31; i++) {
      const t = (i + 0.5) / 31;
      for (const sg of [-1, 1]) {
        const u = u0 + dx * t + nx * 14 * sg, v = v0 + dv * t + nv * 14 * sg;
        if (!inside(u, v)) continue;
        k.box(u - 4.2, u + 4.2, 0, 2.2, v - 3.4, v + 3.4, S.LIME);
        g.elephant(u, v, 2.2, 1.7, ux >= 0 ? 1 : -1);
      }
    }
    // Lamp columns between the elephants and on the outer edges.
    const nL = Math.floor(len / 6.5);
    for (let i = 0; i < nL; i++) {
      const t = (i + 0.5) / nL;
      for (const off of [-20, -8, 8, 20]) {
        const u = u0 + dx * t + nx * off, v = v0 + dv * t + nv * off;
        if (!inside(u, v)) continue;
        k.cylinder(u, v, 0.4, 0.28, 0, 6.5, 6, S.LIME);
      }
    }
  }

  // 7b. Rows of memorial pillars (obelisks) on both sides of the central court and a long
  //     colonnaded gallery on the north edge, as in the references.
  for (const [fx0, fx1, fy] of [[0.40, 0.66, 0.325], [0.40, 0.66, 0.475], [0.17, 0.30, 0.43]] as Array<[number, number, number]>) {
    for (let i = 0; i <= 14; i++) {
      const [u, v] = P(fx0 + (fx1 - fx0) * (i / 14), fy);
      if (!inside(u, v)) continue;
      k.box(u - 1.3, u + 1.3, 0, 1.2, v - 1.3, v + 1.3, S.LIME);
      k.lathe(u, v, [[0.85, 1.2], [0.5, 11], [0, 12.2]], 6, S.LIME, 0);
    }
  }
  {
    const [gu0, gv0] = P(0.46, 0.035), [gu1, gv1] = P(0.80, 0.035);
    const gw = (u: number, v: number): number[] => { const q = k.w([u, 0, v]); return [q[0], q[2]]; };
    const pts = [gw(gu0, gv0), gw(gu1, gv1), gw(gu1, gv1 + 14), gw(gu0, gv0 + 14)];
    if (inside(gu0, gv0 + 7) && inside(gu1, gv1 + 7)) {
      k.extrudeWorldRing(pts, 0, 7.5, S.LIME, S.LIME);
      for (let i = 0; i <= 40; i++) { const u = gu0 + (gu1 - gu0) * (i / 40), v = gv0 + (gv1 - gv0) * (i / 40); k.cylinder(u, v + 14.6, 0.6, 0.55, 0, 7.5, 6, S.LIME); }
    }
  }

  // 7c. Fill the plazas (round 3): patterned paving panels with radial inlay, a grid of
  //     pedestal pillars beside the amphitheatre (as in the dusk drone view), planter beds,
  //     lamp bollards on a regular grid and long colonnaded halls along the edges.
  const IN2 = 0xb4a084, DARKP = 0xa8957c;
  for (const [fx, fy, hx, hy] of [[0.60, 0.48, 0.10, 0.06], [0.42, 0.22, 0.05, 0.06], [0.55, 0.88, 0.14, 0.04], [0.20, 0.92, 0.10, 0.03], [0.92, 0.36, 0.05, 0.14]] as Array<[number, number, number, number]>) {
    quad(INLAY, fx, fy, hx, hy, 0.12);
    quad(0xd8cab3, fx, fy, hx - 0.006, hy - 0.006, 0.13);
    for (let i = -4; i <= 4; i++) { quad(IN2, fx + (hx * i) / 4.5, fy, 0.0012, hy - 0.008, 0.14); quad(IN2, fx, fy + (hy * i) / 4.5, hx - 0.008, 0.0012, 0.14); }
    const [cu, cv] = P(fx, fy);
    g.color(DARKP).disc(cu, cv, Math.min(hx, hy) * W * 0.5, 0.15, 24);
    g.color(0xd8cab3).disc(cu, cv, Math.min(hx, hy) * W * 0.3, 0.16, 24);
  }
  // Pedestal-pillar grid beside the amphitheatre: 3 x 16 blocks, each with a short column.
  for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) {
    const [u, v] = P(0.58 + i * 0.0165, 0.56 + j * 0.036);
    if (!inside(u, v)) continue;
    k.box(u - 3, u + 3, 0, 1.4, v - 3, v + 3, S.LIME);
    k.lathe(u, v, [[1.0, 1.4], [0.6, 8], [0, 9]], 6, S.LIME, 0);
  }
  // Planter beds and lamp bollards on a regular grid across the open plaza.
  for (let fx = 0.12; fx < 0.95; fx += 0.055) for (let fy = 0.10; fy < 0.95; fy += 0.055) {
    const [u, v] = P(fx, fy);
    if (!inside(u, v)) continue;
    if (((Math.round(fx * 100) + Math.round(fy * 100)) & 1) === 0) { g.color(0x7e8c55).disc(u, v, 4.2, 0.17, 12); g.color(0x5c6c3a).disc(u, v, 2.4, 0.19, 10); }
    else k.cylinder(u, v, 0.35, 0.25, 0, 4.8, 6, S.LIME);
  }
  // Long colonnaded halls along the north-east and south edges.
  for (const [fx0, fy0, fx1, fy1] of [[0.50, 0.965, 0.90, 0.93], [0.90, 0.60, 0.95, 0.80]] as Array<[number, number, number, number]>) {
    const [a0, b0] = P(fx0, fy0), [a1, b1] = P(fx1, fy1);
    const hl = Math.hypot(a1 - a0, b1 - b0), hx2 = (a1 - a0) / hl, hy2 = (b1 - b0) / hl, qx = -hy2 * 7, qy = hx2 * 7;
    const wq = (x: number, y: number): number[] => { const q = k.w([x, 0, y]); return [q[0], q[2]]; };
    if (inside(a0, b0) && inside(a1, b1) && inside(a0 + qx, b0 + qy) && inside(a1 + qx, b1 + qy)) {
      k.extrudeWorldRing([wq(a0, b0), wq(a1, b1), wq(a1 + qx, b1 + qy), wq(a0 + qx, b0 + qy)], 0, 6.5, S.LIME, S.LIME);
      for (let d = 0; d <= hl; d += 6) k.cylinder(a0 + hx2 * d - qx * 0.05, b0 + hy2 * d - qy * 0.05, 0.55, 0.5, 0, 6.5, 6, S.STONE);
    }
  }

  // 8. Small triangular pool (SE corner).
  {
    const tri: number[][] = [P(0.93, 0.86), P(0.88, 0.95), P(0.97, 0.95)].map(([u, v]) => { const q = k.w([u, 0, v]); return [q[0], q[2]]; });
    g.color(POOL).polyWorld(tri, 0.12);
  }

  // 8b. Boundary wall around the whole precinct, pale sandstone like the paving, with pier caps
  //     every ~30 m. Each edge is a thin slab on the inside of the precinct outline.
  {
    const cx = loc.reduce((a2, q) => a2 + q[0], 0) / loc.length, cz = loc.reduce((a2, q) => a2 + q[1], 0) / loc.length;
    for (let i = 0; i < loc.length; i++) {
      const [ax, az] = loc[i], [bx, bz] = loc[(i + 1) % loc.length];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      let nx = -dz / len, nz = dx / len;
      if ((cx - ax) * nx + (cz - az) * nz < 0) { nx = -nx; nz = -nz; }   // point inward
      const T = 1.6;
      const wq = (x: number, y: number): number[] => { const q = k.w([x, 0, y]); return [q[0], q[2]]; };
      k.extrudeWorldRing([wq(ax, az), wq(bx, bz), wq(bx + nx * T, bz + nz * T), wq(ax + nx * T, az + nz * T)], 0, 3.2, S.LIME, S.LIME);
      for (let d = 0; d <= len; d += 30) {
        const px = ax + (dx / len) * d + nx * T * 0.5, pz = az + (dz / len) * d + nz * T * 0.5;
        k.box(px - 1.2, px + 1.2, 0, 4.4, pz - 1.2, pz + 1.2, S.LIME);
      }
    }
  }

  // 9. Trees: narrow edge strips and one grove, never over the plazas.
  let seed = 7;
  const hash = (a: number, b: number): number => { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); };
  for (let u = -500; u <= 500; u += 13) {
    for (let v = -500; v <= 500; v += 13) {
      if (!inside(u, v)) continue;
      const edge = !(inside(u + 20, v) && inside(u - 20, v) && inside(u, v + 20) && inside(u, v - 20));
      const [gu, gv] = P(0.5, 0.9);
      const grove = Math.hypot(u - gu, v - gv) < 0.06 * W;
      if (!edge && !grove) continue;
      if (hash(u, v) > (grove ? 0.55 : 0.7)) continue;
      g.tree(u + (hash(v, u) - 0.5) * 5, v + (hash(u * 1.3, v) - 0.5) * 5, 8 + hash(u, v * 2) * 5, hash(u, v + 3) < 0.2, seed++);
    }
  }
}

function dubaggaTvTower(g: Grounds, s: LandmarkSite): void {
  // Broadcast lattice mast: four tapering legs, X-bracing every bay, platforms, red/white
  // aviation bands, antenna mast. Height ~150 m is an APPROXIMATION (no reliable published
  // measurement found); position from the Overture place record "Dubagga TV Tower".
  g.frame(s, 0);
  const H = 150, base = 9, topW = 1.6, bays = 15;
  const half = (y: number) => base + (topW - base) * Math.pow(y / H, 0.8);
  const leg = (y0: number, y1: number, su: number, sv: number, hx: number) => {
    const h0 = half(y0), h1 = half(y1);
    const a = [su * h0, y0, sv * h0], b = [su * h1, y1, sv * h1];
    g.box(Math.min(a[0], b[0]) - hx, Math.max(a[0], b[0]) + hx, y0, y1, Math.min(a[2], b[2]) - hx, Math.max(a[2], b[2]) + hx);
  };
  for (let i = 0; i < bays; i++) {
    const y0 = (i / bays) * H, y1 = ((i + 1) / bays) * H;
    g.color(i % 2 ? C.steelRed : C.steelWhite);
    for (const su of [-1, 1]) for (const sv of [-1, 1]) leg(y0, y1, su, sv, 0.35);
    // horizontal girths + diagonals (thin boxes along faces)
    const h0 = half(y0), h1 = half(y1);
    for (const side of [-1, 1]) {
      g.box(-h1, h1, y1 - 0.3, y1, side * h1 - 0.15, side * h1 + 0.15);
      g.box(side * h1 - 0.15, side * h1 + 0.15, y1 - 0.3, y1, -h1, h1);
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const y = y0 + (y1 - y0) * (t0 + t1) / 2, hh = h0 + (h1 - h0) * (t0 + t1) / 2;
        const d = hh * (1 - 2 * ((k + 0.5) / n));
        g.box(d - 0.25, d + 0.25, y - (y1 - y0) / n / 2, y + (y1 - y0) / n / 2, side * hh - 0.12, side * hh + 0.12);
        g.box(side * hh - 0.12, side * hh + 0.12, y - (y1 - y0) / n / 2, y + (y1 - y0) / n / 2, -d - 0.25, -d + 0.25);
      }
    }
  }
  g.color(C.steelWhite);
  for (const y of [60, 100, 128]) { const h = half(y) + 1.6; g.box(-h, h, y, y + 0.6, -h, h); }
  g.color(C.steelRed).box(-0.5, 0.5, H, H + 22, -0.5, 0.5);
  g.color(C.paveGrey).rect(-24, 24, -24, 24, 0.09);
  g.color(C.paveSand).box(-12, -4, 0, 4, -14, -8);
}

function nationalFlagPole(g: Grounds, s: LandmarkSite, poleH: number): void {
  g.frame(s, 0);
  g.color(C.paveGrey).disc(0, 0, 9, 0.1, 32);
  g.color(C.paveSand).box(-3, 3, 0, 1.2, -3, 3);
  g.color(C.steelWhite);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const y0 = 1.2 + (i / n) * poleH, y1 = 1.2 + ((i + 1) / n) * poleH;
    const r = 0.7 - 0.45 * (i / n);
    g.box(-r, r, y0, y1, -r, r);
  }
  g.color(0xd2b048).box(-0.45, 0.45, poleH + 1.2, poleH + 2.2, -0.45, 0.45);
}

/** The Indian national flag: 3:2, saffron / white / green, navy Ashoka Chakra with 24 spokes. */
function flagTexture(): THREE.CanvasTexture {
  const W = 768, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#FF9933'; x.fillRect(0, 0, W, H / 3);
  x.fillStyle = '#FFFFFF'; x.fillRect(0, H / 3, W, H / 3);
  x.fillStyle = '#138808'; x.fillRect(0, (2 * H) / 3, W, H / 3);
  const cx = W / 2, cy = H / 2, R = (H / 3) * 0.45;
  x.strokeStyle = '#000080'; x.fillStyle = '#000080';
  x.lineWidth = R * 0.07; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(cx, cy, R * 0.17, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, a1 = a + Math.PI / 24;
    x.lineWidth = R * 0.035;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 0.17, cy + Math.sin(a) * R * 0.17); x.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); x.stroke();
    x.beginPath(); x.arc(cx + Math.cos(a1) * R * 0.93, cy + Math.sin(a1) * R * 0.93, R * 0.035, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

class WavingFlag {
  mesh: THREE.Mesh;
  private uniforms = { uTime: { value: 0 } };
  constructor(x: number, z: number, poleTop: number, width: number) {
    const h = width / 1.5;
    const geo = new THREE.PlaneGeometry(width, h, 32, 16);
    geo.translate(width / 2 + 0.5, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float d = max(0.0, transformed.x - 0.5);
          float amp = d / ${width.toFixed(1)};
          transformed.z += sin(d * 0.55 - uTime * 3.1) * 0.9 * amp + sin(d * 1.3 - uTime * 4.7 + transformed.y * 0.3) * 0.25 * amp;
          transformed.y -= amp * amp * 0.9;`);
    };
    mat.customProgramCacheKey = () => 'lens-flag';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, poleTop - h / 2, z);
    this.mesh.rotation.y = -0.6;
    this.mesh.name = 'nationalFlag';
    this.mesh.castShadow = true;
  }
  update(t: number) { this.uniforms.uTime.value = t; }
}

function airport(g: Grounds): void {
  // CCS International (VILK): Overture runway, taxiways, aprons and boundary; runway
  // 45 m wide per the AAI AIP. Markings: thresholds, centreline dashes, designators area.
  g.cx = 0; g.cz = 0; g.ca = 1; g.sa = 0;
  if (AIRPORT.boundary.length > 3) { g.color(C.grassAir); g.polyWorld(AIRPORT.boundary, 0.05); }
  for (const a of AIRPORT.aprons) { g.color(C.apron); g.polyWorld(a, 0.12); }
  for (const t of AIRPORT.taxiways) { g.color(C.asphalt); g.stripWorld(t, 11.5, 0.14); g.color(C.markYellow); g.stripWorld(t, 0.25, 0.16); }
  for (const r of AIRPORT.runways) {
    g.color(C.runway); g.stripWorld(r, 22.5, 0.16);
    g.color(C.grassAir, -0.08); g.stripWorld(r, 30, 0.1);
    // centreline dashes 30 m / gap 20 m, threshold piano keys at both ends
    const a = r[0], b = r[r.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    g.color(C.mark);
    for (let d = 80; d < L - 80; d += 50) g.stripWorld([[a[0] + ux * d, a[1] + uz * d], [a[0] + ux * (d + 30), a[1] + uz * (d + 30)]], 0.45, 0.19);
    for (const [s0, dir] of [[0, 1], [L, -1]] as Array<[number, number]>) {
      for (let k = -7; k <= 7; k++) {
        if (k === 0) continue;
        const ox = -uz * k * 2.8, oz = ux * k * 2.8;
        const p0 = [a[0] + ux * (s0 + dir * 8) + ox, a[1] + uz * (s0 + dir * 8) + oz], p1 = [a[0] + ux * (s0 + dir * 38) + ox, a[1] + uz * (s0 + dir * 38) + oz];
        g.stripWorld([p0, p1], 0.9, 0.19);
      }
      for (const off of [-20.5, 20.5]) {
        const p0 = [a[0] + ux * (s0 + dir * 150) - uz * off, a[1] + uz * (s0 + dir * 150) + ux * off];
        g.stripWorld([p0, [p0[0] + ux * dir * 45, p0[1] + uz * dir * 45]], 3, 0.19);       // aiming points
      }
    }
    g.stripWorld(r.map((p) => [p[0] - uz * 21.6, p[1] + ux * 21.6]), 0.35, 0.18);        // edge lines
    g.stripWorld(r.map((p) => [p[0] + uz * 21.6, p[1] - ux * 21.6]), 0.35, 0.18);
  }
}

function airportTower(k: Kit, x: number, z: number): void {
  const fake: LandmarkSite = { key: 'atc', name: 'ATC', c: [x, z], a: 0, ext: [10, 10], ring: [], excl: [] };
  k.begin(fake, 38, 131);
  k.cylinder(0, 0, 3.2, 2.6, 0, 30, 10, S.STONE);
  k.cylinder(0, 0, 5.5, 6.2, 30, 31, 10, S.STONE);
  k.cylinder(0, 0, 6.2, 5.6, 31, 35.5, 10, S.GLASS);
  k.cylinder(0, 0, 6.6, 6.6, 35.5, 36.6, 10, S.STONE);
  k.cylinder(0, 0, 0.2, 0.1, 36.6, 42, 6, S.METAL);
}

function rumiDarwaza(k: Kit, s: LandmarkSite): void {
  k.begin(s, 18, 11); k.domeDefault = S.LIME;
  const L = Math.max(s.ext[0], s.ext[1]);
  const half = Math.min(36, L / 2);
  k.box(-10, 10, 0, 17, -6, 6, S.LIME);
  k.arcade('v0', -6, -7, 7, 0, 10, 15, 1, S.GLASS, true);
  k.arcade('v1', 6, -7, 7, 0, 10, 15, 1, S.GLASS, true);
  k.box(-7, 7, 17, 19, -4, 4, S.LIME);
  k.lathe(0, 0, [[3.2, 19], [3.2, 23.5], [0.01, 23.5]], 8, S.LIME, Math.PI / 8);
  k.onion(0, 0, 2.6, 23.5, 3.2, S.LIME, 0.1);
  for (const sgn of [-1, 1]) {
    const u0 = sgn > 0 ? 10 : -half, u1 = sgn > 0 ? half : -10;
    k.box(u0, u1, 0, 10, -3.5, 3.5, S.LIME);
    k.arcade('v0', -3.5, u0 + 1, u1 - 1, 0.6, 2.2, 4.6, 5); k.arcade('v1', 3.5, u0 + 1, u1 - 1, 0.6, 2.2, 4.6, 5);
    k.arcade('v0', -3.5, u0 + 1, u1 - 1, 5.6, 1.6, 3.4, 7); k.arcade('v1', 3.5, u0 + 1, u1 - 1, 5.6, 1.6, 3.4, 7);
    const tu = sgn * (half - 1.5);
    k.cylinder(tu, 0, 2.0, 1.6, 0, 14, 8, S.LIME); k.chhatri(tu, 0, 2.4, 14);
    for (let i = 1; i <= 3; i++) k.chhatri(sgn * (10 + (half - 12) * i / 4), 0, 1.4, 10);
  }
}

function clockTower(k: Kit, s: LandmarkSite): void {
  k.begin(s, 67, 37);
  k.box(-5, 5, 0, 4, -5, 5, S.REDSTONE);
  k.box(-4.2, 4.2, 4, 40, -4.2, 4.2, S.REDSTONE);
  for (const [f, at] of [['v0', -4.2], ['v1', 4.2], ['u0', -4.2], ['u1', 4.2]] as const) {
    k.arcade(f, at, -2.5, 2.5, 8, 1.2, 4, 2); k.arcade(f, at, -2.5, 2.5, 20, 1.2, 4, 2); k.arcade(f, at, -2.5, 2.5, 31, 1.2, 4, 2);
  }
  k.box(-4.8, 4.8, 40, 49, -4.8, 4.8, S.REDSTONE);
  for (const [ou, ov, nu, nv] of [[0, -4.9, 0, -1], [0, 4.9, 0, 1], [-4.9, 0, -1, 0], [4.9, 0, 1, 0]]) {
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      const P = (r: number, a: number): V3 => (nu === 0 ? [ou + Math.cos(a) * r, 44.5 + Math.sin(a) * r, ov] : [ou, 44.5 + Math.sin(a) * r, ov + Math.cos(a) * r]);
      k.tri([ou, 44.5, ov], P(3.2, a0), P(3.2, a1), S.TRIM, [nu, 0, nv]);
      k.quad(P(3.2, a0), P(3.6, a0), P(3.6, a1), P(3.2, a1), S.GILT, [nu, 0, nv]);
    }
  }
  k.box(-4.2, 4.2, 49, 56, -4.2, 4.2, S.REDSTONE);
  for (const [f, at] of [['v0', -4.2], ['v1', 4.2], ['u0', -4.2], ['u1', 4.2]] as const) k.arcade(f, at, -3, 3, 49.5, 1.6, 5.5, 2);
  k.lathe(0, 0, [[4.4, 56], [0.5, 65], [0.01, 65.2]], 4, S.REDSTONE, Math.PI / 4);
  k.cylinder(0, 0, 0.25, 0.1, 65, 67, 6, S.GILT);
  for (const [u, v] of [[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]]) k.cylinder(u, v, 0.55, 0.1, 56, 60, 6, S.REDSTONE);
}

/**
 * The Residency (round 3), after the user's satellite and ground photographs. Site frame: u east,
 * v south (north up as in the satellite view), origin at the Overture building. A walled compound of
 * ROOFLESS brick ruins (broken parapets, arched openings, partition walls), the round Residency tower
 * with its turret, the Banqueting Hall facade, Begum Kothi, the 1857 Memorial Museum, brick paths,
 * open lawn and a sparse planting of mature trees, so the ruins stay visible. Block positions are read
 * by eye from the satellite view (about 3 px per metre) and are approximate.
 */
function residency(k: Kit, s: LandmarkSite): void {
  k.begin(s, 26, 71);
  const BR = S.REDSTONE;
  const ruin = (u0: number, u1: number, v0: number, v1: number, h: number, seed: number, rooms: number): void => {
    const rnd = (i: number): number => { const x = Math.sin((seed + i) * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const T = 1.1;
    // Four outer walls, built in segments with broken, uneven tops and arched openings.
    const wall = (a0: number, a1: number, b0: number, b1: number, along: 'u' | 'v'): void => {
      const len = along === 'u' ? a1 - a0 : b1 - b0, n = Math.max(2, Math.round(len / 4.2));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const hh = h * (0.55 + 0.45 * rnd(i * 3 + (along === 'u' ? 1 : 7)));
        if (along === 'u') k.box(a0 + len * t0, a0 + len * t1 - 0.6, 0, hh, b0, b0 + T, BR);
        else k.box(a0, a0 + T, 0, hh, b0 + len * t0, b0 + len * t1 - 0.6, BR);
      }
    };
    wall(u0, u1, v0, v0 + T, 'u'); wall(u0, u1, v1 - T, v1, 'u');
    wall(u0, u0 + T, v0, v1, 'v'); wall(u1 - T, u1, v0, v1, 'v');
    k.arcade('v0', v0, u0 + 2, u1 - 2, 0.4, 2.0, h * 0.6, Math.max(2, Math.round((u1 - u0) / 5.5)), S.GLASS);
    k.arcade('v1', v1, u0 + 2, u1 - 2, 0.4, 2.0, h * 0.6, Math.max(2, Math.round((u1 - u0) / 5.5)), S.GLASS);
    // Partition walls make the room grid visible from above.
    for (let r = 1; r < rooms; r++) { const u = u0 + ((u1 - u0) * r) / rooms; k.box(u - 0.4, u + 0.4, 0, h * (0.35 + 0.3 * rnd(r * 11)), v0 + T, v1 - T, BR); }
    const mid = (v0 + v1) / 2; k.box(u0 + T, u1 - T, 0, h * 0.4, mid - 0.4, mid + 0.4, BR);
  };
  // Main Residency (centre-north), long ruin with a second court, and the round tower at its NW corner.
  // Positions shifted off the roads (checked against every road segment, 4 m clearance).
  ruin(6, 62, -52, -12, 15, 1, 7);
  ruin(62, 84, -48, -20, 9, 21, 3);
  k.cylinder(6, -52, 4.2, 3.6, 0, 20, 14, BR); k.cylinder(6, -52, 4.7, 4.7, 17, 18.2, 14, BR);
  k.merlons(1.4, 10.6, -56.6, -47.4, 20, BR);
  k.cylinder(3.6, -54.2, 1.9, 1.7, 20, 25.5, 10, BR); k.chhatri(3.6, -54.2, 3.2, 25.5, S.STONE);
  // Banqueting Hall: a long arched facade with tall openings (south-west of the main block).
  ruin(-8, 26, 22, 44, 11, 33, 5);
  k.arcade('v1', 44, -6, 24, 0.4, 3.0, 8.0, 6, S.GLASS, true);
  // Eastern rooms (satellite: two adjacent walled enclosures), Treasury and Dr Fayrer's House.
  ruin(70, 112, -8, 28, 8, 41, 4);
  ruin(-11, 15, 84, 126, 8, 55, 3);
  ruin(30, 66, 88, 124, 8, 61, 4);
  // Begum Kothi (west) and the Memorial Museum (north-west): a roofed hall with a veranda.
  ruin(-147, -119, 63, 95, 9, 71, 3);
  // (Memorial Museum omitted: no road-clear position found for it.)
  // North-west ruin cluster.
  ruin(-78, -36, -150, -118, 9, 81, 4);
}

function residencyGrounds(g: Grounds, k: Kit): void {
  const PAVE = 0xb9a989, DUST = 0x8e9158, LAWN = 0x6f8a45, ORCH = 0x56703a, BRICK = 0xa2604a;
  g.color(DUST).rect(-190, 190, -170, 170, 0.07);
  // Open lawns around the ruins, as in the photographs.
  for (const [u0, u1, v0, v1] of [[-100, -30, -30, 50], [-60, 20, 50, 90], [60, 130, -80, -20], [-190, -130, -60, 30]] as Array<[number, number, number, number]>) g.color(LAWN).rect(u0, u1, v0, v1, 0.1);
  g.color(0x6a7a48).rect(-150, -110, -20, 4, 0.11);                         // damp lawn patch
  // Brick-red perimeter path and the winding approach road from the south-west.
  for (const [u0, u1, v0, v1] of [[-190, 190, 160, 164], [-190, 190, -170, -166], [-190, -186, -170, 170], [186, 190, -170, 170]] as Array<[number, number, number, number]>) g.color(BRICK).rect(u0, u1, v0, v1, 0.12);
  g.color(PAVE).rect(-190, 190, 6, 14, 0.12); g.color(PAVE).rect(18, 26, -170, 160, 0.12);
  // Terraced orchard in the south-east corner (rows of small trees).
  g.color(ORCH).rect(110, 170, 70, 130, 0.12);
  for (let u = 114; u < 168; u += 8) for (let v = 74; v < 128; v += 8) g.tree(u, v, 3.2, false, 900 + u * 3 + v);
  // Sparse mature trees: groups on the lawns and along the paths, never over the ruins.
  let seed = 31;
  const clump = (cu: number, cv: number, n: number, rad: number): void => { for (let i = 0; i < n; i++) { const a = i * 2.399, r = rad * Math.sqrt((i + 0.5) / n); g.tree(cu + Math.cos(a) * r, cv + Math.sin(a) * r, 9 + (i % 4) * 2, false, seed++); } };
  clump(-60, 8, 7, 18); clump(80, -50, 6, 16); clump(-165, -20, 6, 14); clump(-40, 120, 7, 20); clump(150, -120, 8, 24); clump(-130, 130, 6, 20); clump(40, 150, 5, 14);
  for (let u = -180; u < 180; u += 14) { g.tree(u, 156, 8, false, seed++); g.tree(u, -162, 8, false, seed++); }
  void k;
}



function vidhanSabha(k: Kit, s: LandmarkSite): void {
  k.begin(s, 42, 89);
  k.extrudeWorldRing(s.ring, 0, 19, S.STONE, S.ROOF);
  k.cylinder(0, 0, 13, 13, 19, 28, 24, S.STONE);
  k.arcade('v0', -13.05, -9, 9, 20, 1.6, 6, 6);
  k.hemi(0, 0, 13, 28, S.DOME, 0.8);
  k.cylinder(0, 0, 1.2, 0.5, 38.4, 42, 8, S.GILT);
  for (const u of [-28, 28]) { k.chhatri(u, -8, 4, 19); k.chhatri(u, 8, 4, 19); }
}

/** Generic ring-based monument with a style. */
function ringMonument(k: Kit, s: LandmarkSite, h: number, wall: number, seed: number, decorate: (k: Kit, hu: number, hv: number) => void): void {
  k.begin(s, h, seed);
  if (s.ring.length > 3) k.extrudeWorldRing(s.ring, 0, h, wall, S.ROOF);
  const hu = s.ext[0] / 2, hv = s.ext[1] / 2;
  decorate(k, Math.max(4, Math.min(hu, hv) * 0.9), Math.max(4, Math.min(hu, hv) * 0.9));
}


/**
 * Charbagh station (round 3). The red-brick body follows the real Overture footprint.
 * On top of it: a white cornice, arched verandah openings along the city-side (north)
 * front, and the repeated turret-and-dome rhythm that gives the station its chessboard
 * look from above (corner turrets with white domes alternating with open chhatris).
 * Rhythm and counts are stylised; the heritage listing gives no countable plan.
 */
function charbaghStation(k: Kit, s: LandmarkSite): void {
  k.begin(s, 26, 89);
  const H = 13;
  k.extrudeWorldRing(s.ring, 0, H, S.REDSTONE, S.ROOF);
  const loc = s.ring.map(([x, z]) => k.local(x, z));
  // Scanline: north-most (min v) and south-most (max v) edge of the footprint at u.
  const span = (u: number): [number, number] | null => {
    let lo = Infinity, hi = -Infinity;
    for (let n = 0; n < loc.length - 1; n++) {
      const [u0, v0] = loc[n], [u1, v1] = loc[n + 1];
      if ((u0 - u) * (u1 - u) > 0 || u0 === u1) continue;
      const t = (u - u0) / (u1 - u0), v = v0 + t * (v1 - v0);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    return lo === Infinity ? null : [lo, hi];
  };
  const hu = s.ext[0] / 2;
  // Cornice and verandah arches on the city-side front.
  for (let u = -hu + 6; u <= hu - 6; u += 7) {
    const sp = span(u); if (!sp || sp[1] - sp[0] < 6) continue;
    k.box(u - 3.5, u + 3.5, H, H + 0.8, sp[0] - 0.2, sp[0] + 0.6, S.DOME);
    k.arcade('v0', sp[0] - 0.05, u - 2.8, u + 2.8, 1.0, 2.0, 4.6, 2, S.GLASS);
    k.arcade('v0', sp[0] - 0.05, u - 2.8, u + 2.8, 7.2, 1.5, 3.4, 2, S.GLASS);
  }
  // Turret and dome rhythm along the roof, front row and back row offset (chessboard).
  let n = 0;
  for (let u = -hu + 10; u <= hu - 10; u += 14, n++) {
    const sp = span(u); if (!sp || sp[1] - sp[0] < 8) continue;
    const front = sp[0] + 2.2, back = sp[1] - 2.2;
    if (n % 2 === 0) { k.cylinder(u, front, 1.6, 1.5, H, H + 5.5, 8, S.DOME); k.onion(u, front, 1.9, H + 5.5, 2.6, S.DOME, 0.2); }
    else k.chhatri(u, front, 3.2, H);
    if (n % 2 === 1) { k.cylinder(u, back, 1.6, 1.5, H, H + 5.5, 8, S.DOME); k.onion(u, back, 1.9, H + 5.5, 2.6, S.DOME, 0.2); }
    else k.chhatri(u, back, 3.2, H);
  }
  // Central block with the principal dome and flanking towers.
  const c = span(0);
  if (c) {
    const fv = c[0] + 6;
    k.box(-12, 12, H, H + 7, c[0] + 1, c[0] + 12, S.REDSTONE);
    k.arcade('v0', c[0] + 0.95, -9, 9, H + 1.2, 2.4, 4.4, 3, S.GLASS);
    k.hemi(0, fv, 9, H + 7, S.DOME, 0.7);
    for (const du of [-16, 16]) { k.cylinder(du, fv, 3.2, 3.0, H, H + 11, 8, S.REDSTONE); k.onion(du, fv, 3.6, H + 11, 4.8, S.DOME, 0.2); }
  }
}


/**
 * Taj Mahal Lucknow (round 3, from the user's photographs and satellite view): a white palace hotel.
 * Central block with a colonnaded portico, balustraded parapets and a red-brown dome on a drum with a
 * lantern; long two/three-storey wings stepping back on both sides; a pool garden behind (east) and a
 * formal entrance lawn in front (west). Massing is read from the photographs, sizes approximate.
 */
function tajHotel(k: Kit, g: Grounds, s: LandmarkSite): void {
  k.begin(s, 26, 109, 0); g.frame(s, 0);
  k.domeDefault = S.DOME;
  const W = S.DOME;   // lime-washed white
  // Entrance forecourt and lawn (west), pool garden (east).
  g.color(0xcfc6b4).rect(-78, -40, -26, 26, 0.08);
  g.color(0x6f8f48).rect(-74, -48, -18, 18, 0.1); g.color(0xb85c4a).rect(-70, -52, -2, 2, 0.12);
  g.color(0xd8d0bf).rect(30, 74, -34, 30, 0.08);
  g.color(0x4fb3c4).rect(40, 62, -14, 12, 0.12); g.color(0x6f8f48).rect(64, 74, -30, 26, 0.1);
  // Central block and portico.
  k.box(-22, 22, 0, 18, -20, 20, W); k.arcadeAll(-22, 22, -20, 20, 1, 2.4, 4.5, 4.5);
  k.arcadeAll(-22, 22, -20, 20, 7, 2.2, 4, 4.5); k.arcadeAll(-22, 22, -20, 20, 12.5, 2.2, 4, 4.5);
  k.merlons(-22, 22, -20, 20, 18, W);
  k.box(-34, -22, 0, 11, -10, 10, W);                               // portico
  for (let v = -8; v <= 8; v += 4) k.cylinder(-33, v, 0.7, 0.7, 0, 11, 10, W);
  k.box(-35, -21, 11, 12, -11, 11, W); k.merlons(-35, -21, -11, 11, 12, W);
  // Drum and red-brown dome with a lantern.
  k.cylinder(0, 0, 10, 10, 18, 23, 24, W);
  for (let i = 0; i < 16; i++) { const a2 = (i / 16) * Math.PI * 2; k.cylinder(Math.cos(a2) * 10.2, Math.sin(a2) * 10.2, 0.45, 0.45, 18, 23, 6, W); }
  k.hemi(0, 0, 10.2, 23, S.REDSTONE, 0.62);
  k.cylinder(0, 0, 1.6, 1.6, 29, 31.5, 8, W); k.hemi(0, 0, 1.8, 31.5, S.REDSTONE, 1);
  // Wings: north and south, stepping down, with balustrades and corner chhatris.
  for (const sv of [-1, 1]) {
    const v0 = sv > 0 ? 20 : -62, v1 = sv > 0 ? 62 : -20;
    k.box(-24, 18, 0, 14, v0, v1, W); k.arcadeAll(-24, 18, v0, v1, 1, 2.1, 4, 4.2); k.arcadeAll(-24, 18, v0, v1, 5.5, 2, 3.6, 4.2); k.arcadeAll(-24, 18, v0, v1, 10, 2, 3.4, 4.2);
    k.merlons(-24, 18, v0, v1, 14, W);
    const e0 = sv > 0 ? 62 : -78, e1 = sv > 0 ? 78 : -62;
    k.box(-18, 30, 0, 10, e0, e1, W); k.arcadeAll(-18, 30, e0, e1, 1, 2, 3.8, 4.2); k.merlons(-18, 30, e0, e1, 10, W);
    for (const u of [-24, 18]) k.chhatri(u, sv * 62, 3, 14, W);
  }
  // Rear wings around the pool garden.
  k.box(18, 30, 0, 12, -62, -20, W); k.box(18, 30, 0, 12, 20, 62, W);
  // Garden trees.
  let seed = 3;
  for (let v = -70; v <= 70; v += 10) { g.tree(-82, v, 9, false, seed++); g.tree(80, v, 8, true, seed++); }
}

/**
 * Renaissance Lucknow (round 3, from the user's photographs): a ~15-storey white tower with a grid of
 * lit windows, a full-height red-brown fin on one corner and a tall mural strip down the front, on a
 * podium with a rooftop crown.
 */
function renaissanceHotel(k: Kit, g: Grounds, s: LandmarkSite): void {
  k.begin(s, 58, 113, 0); g.frame(s, 0);
  const H = 56, hu = 15, hv = 11;
  g.color(0xbdb4a2).rect(-34, 34, -22, 22, 0.08);
  k.box(-30, 30, 0, 7, -18, 18, S.STONE); k.arcade('u0', -30, -16, 16, 0.5, 3, 5.5, 6, S.GLASS);
  k.box(-hu, hu, 7, H, -hv, hv, S.DOME);
  // Window grid: glass bands on every floor of the west and south faces.
  // Rectangular glazing: a glass band per floor, interrupted by slim white mullions.
  for (let y = 9; y < H - 2; y += 3.4) {
    for (let u = -hu + 1; u < hu - 4.5; u += 3) { k.box(u, u + 2.4, y, y + 2.3, hv - 0.05, hv + 0.15, S.GLASS); k.box(u, u + 2.4, y, y + 2.3, -hv - 0.15, -hv + 0.05, S.GLASS); }
    for (let v = -hv + 1; v < hv - 1; v += 3) { k.box(-hu - 0.15, -hu + 0.05, y, y + 2.3, v, v + 2.4, S.GLASS); k.box(hu - 0.05, hu + 0.15, y, y + 2.3, v, v + 2.4, S.GLASS); }
  }
  k.box(hu - 4, hu + 0.6, 7, H + 2, hv - 4, hv + 0.6, S.REDSTONE);          // red corner fin
  k.box(-hu - 0.4, -hu + 0.3, 7, H - 1, -2.5, 2.5, S.REDSTONE);            // mural strip on the west face
  k.box(-hu - 0.5, -hu + 0.2, 20, 32, -1.5, 1.5, S.GILT);
  k.box(-hu - 1.5, hu + 1.5, H, H + 0.6, -hv - 1.5, hv + 1.5, S.STONE);    // projecting roof slab
  k.box(-hu * 0.5, hu * 0.5, H + 0.6, H + 5, -hv * 0.5, hv * 0.5, S.STONE);
}

function buildAll(k: Kit, g: Grounds): { flag?: WavingFlag } {
  const res: { flag?: WavingFlag } = {};
  const b = site('bara_imambara'); if (b) baraImambara(k, g, b);
  const r = site('rumi_darwaza'); if (r) rumiDarwaza(k, r);
  const ch = site('chhota_imambara'); if (ch) chhotaImambara(k, g, ch);
  for (const key of ['chhota_gate_1', 'chhota_gate_2']) { const cg = site(key); if (cg) { k.begin(cg, 12, 191); smallGate(k, key.endsWith('1') ? 7 : 5.5, 8.5, S.BLUE); } }
  const pgg = site('pudiya_ghat_gate'); if (pgg) { k.begin(pgg, 12, 193); smallGate(k, 7, 9, S.LIME); }
  const hp = site('husainabad_park'); if (hp) cityPark(k, g, hp);
  const dw = site('dariya_wali_masjid'); if (dw) dariyaWaliMasjid(k, g, dw);
  const tw = site('teele_wali_masjid'); if (tw) teeleWaliMasjid(k, g, tw);
  const tge = site('teele_gate_east'); if (tge) { k.begin(tge, 18, 133); gateBlock(k, 0, 0, 12, false, 17); }
  const tgn = site('gate_north_of_bara'); if (tgn) { k.begin(tgn, 20, 137); gateBlock(k, 0, 0, 14, true, 20); }
  const ct = site('clock_tower'); if (ct) clockTower(k, ct);
  const re = site('residency'); if (re) residency(k, re);
  const vs = site('vidhan_sabha'); if (vs) vidhanSabha(k, vs);
  const am = site('ambedkar_memorial'); if (am) ambedkarMemorial(k, g, am);
  const sk = site('satkhanda');
  if (sk) {
    k.begin(sk, 26, 61);
    for (let i = 0; i < 4; i++) {
      const r0 = 7.5 - i * 1.1, y0 = i * 6;
      k.cylinder(0, 0, r0, r0 - 0.3, y0, y0 + 5.6, 8, S.REDSTONE);
      k.cylinder(0, 0, r0 + 0.6, r0 + 0.6, y0 + 5.6, y0 + 6, 8, S.REDSTONE);
    }
    k.merlons(-3.8, 3.8, -3.8, 3.8, 24, S.REDSTONE);
  }
  // [disabled: the user confirmed this is a pond] Husainabad Talab lawn, not water, with a stone
  // surround, three steps and a pale pitch strip, after the satellite reference. (Overture maps it as
  // a reservoir; that polygon is removed in data/overrides/water_overrides.geojson.)
  if (false as boolean) {
    const oct = (cx: number, cz: number, r: number, rot: number): number[][] => Array.from({ length: 8 }, (_, i) => {
      const a = rot + (i / 8) * Math.PI * 2 + Math.PI / 8; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    });
    const ox = -4253, oz = -2710, rot = 0.25;
    g.color(0xd2c6b0).polyWorld(oct(ox, oz, 54, rot), 0.12);
    g.color(0xbfb298).polyWorld(oct(ox, oz, 49, rot), 0.14);
    g.color(0xd2c6b0).polyWorld(oct(ox, oz, 46, rot), 0.16);
    g.color(0x5d7a3e).polyWorld(oct(ox, oz, 43, rot), 0.18);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const pr = (u: number, v: number): number[] => [ox + u * ca - v * sa, oz + u * sa + v * ca];
    g.color(0xc9bc7a).polyWorld([pr(-3, -14), pr(3, -14), pr(3, 14), pr(-3, 14)], 0.2);
  }
  const pg = site('picture_gallery');
  if (pg) ringMonument(k, pg, 11, S.REDSTONE, 67, (kk, hu, hv) => { kk.arcadeAll(-hu, hu, -hv, hv, 0.5, 2.2, 5, 4); kk.merlons(-hu, hu, -hv, hv, 11, S.DOME); });
  const jm = site('jama_masjid');
  if (jm) {
    k.begin(jm, 40, 73);
    const hu = jm.ext[0] / 2 - 4, hv = Math.min(28, jm.ext[1] / 2 - 4);
    k.box(-hu, hu, 0, 3, -hv - 8, hv, S.STONE);
    k.box(-hu, hu, 3, 16, -hv, hv * 0.2, S.DOME); k.arcade('v0', -hv, -hu + 2, hu - 2, 3.2, 3, 8, 9, S.GLASS, true);
    for (const du of [-hu * 0.55, 0, hu * 0.55]) k.onion(du, -hv * 0.35, du ? 4.6 : 6.4, 16, du ? 7 : 9.5, S.DOME, 0.25);
    for (const du of [-hu, hu]) k.minaret(du, -hv, 1.8, 40, 5, S.DOME, 3);
  }
  const cm = site('chhatar_manzil');
  if (cm) ringMonument(k, cm, 18, S.STONE, 79, (kk, hu) => {
    kk.arcadeAll(-hu, hu, -hu, hu, 0.5, 2.4, 6, 4);
    kk.cylinder(0, 0, 5, 5, 18, 23, 8, S.STONE);
    kk.lathe(0, 0, [[6.8, 23], [5.4, 25], [3.2, 27.5], [0.8, 29.5], [0, 31]], 16, S.GILT);  // gilded umbrella dome
  });
  const sb = site('safed_baradari');
  if (sb) ringMonument(k, sb, 10, S.DOME, 83, (kk, hu, hv) => { kk.arcadeAll(-hu, hu, -hv, hv, 0.6, 2.8, 7, 4.2, S.GLASS); kk.merlons(-hu, hu, -hv, hv, 10, S.DOME); for (const u of [-hu, hu]) for (const v of [-hv, hv]) kk.chhatri(u, v, 2.2, 10); });
  const cb = site('charbagh');
  if (cb) charbaghStation(k, cb);
  const lm = site('la_martiniere');
  if (lm) ringMonument(k, lm, 18, S.DOME, 97, (kk) => {
    kk.box(-8, 8, 18, 34, -8, 8, S.DOME); kk.arcadeAll(-8, 8, -8, 8, 19, 2.4, 6, 4);
    for (const u of [-8, 8]) for (const v of [-8, 8]) { kk.cylinder(u, v, 1.4, 1.2, 18, 40, 8, S.DOME); kk.cylinder(u, v, 1.6, 0.1, 40, 44, 8, S.DOME); }
    kk.merlons(-8, 8, -8, 8, 34, S.DOME);
  });
  const dk = site('dilkusha');
  if (dk) {
    k.begin(dk, 16, 101);
    const hu = Math.max(8, dk.ext[0] / 2), hv = Math.max(7, dk.ext[1] / 2);
    for (const [u0, u1, v0, v1] of [[-hu, hu, -hv, -hv + 1], [-hu, hu, hv - 1, hv], [-hu, -hu + 1, -hv, hv], [hu - 1, hu, -hv, hv]]) k.box(u0, u1, 0, 13, v0, v1, S.STONE);
    k.arcade('v0', -hv, -hu + 1, hu - 1, 1, 1.8, 4.5, 5); k.arcade('v0', -hv, -hu + 1, hu - 1, 7, 1.6, 4, 5);
    for (const u of [-hu, hu]) for (const v of [-hv, hv]) k.cylinder(u, v, 2.2, 2.0, 0, 16, 8, S.STONE);
  }
  const tj = site('taj_hotel');
  if (tj) tajHotel(k, g, tj);
  const rn = site('renaissance');
  if (rn) renaissanceHotel(k, g, rn);

  const ek = site('ekana');
  if (ek) {
    // Bowl: raked stands rising outward, a ring roof, the field.
    g.frame(ek, 0);
    g.color(C.lawn).disc(0, 0, 78, 0.2, 48); g.color(C.lawnDry).disc(0, 0, 12, 0.22, 16);
    k.begin(ek, 36, 127, 0);
    k.lathe(0, 0, [[86, 0], [86, 3], [128, 30], [130, 30], [130, 0]], 48, S.STONE);
    k.lathe(0, 0, [[96, 34], [134, 37], [134, 38.5], [96, 35.5]], 48, S.METAL);
  }
  const tv = site('dubagga_tv'); if (tv) dubaggaTvTower(g, tv);
  const fl = site('janeshwar_flag');
  if (fl) { nationalFlagPole(g, fl, 62); res.flag = new WavingFlag(fl.c[0], fl.c[1], 62 + 1.2, 13.5); }
  airport(g);
  // ATC tower beside the terminal apron.
  airportTower(k, -6280, 9450);
  return res;
}

export interface LandmarkLayer { group: THREE.Group; update: (t: number) => void; setNight: (n: boolean) => void }

/** Build every landmark: architecture (shared building material), grounds, flag. */
export function buildLandmarkLayer(material: THREE.Material): LandmarkLayer {
  const k = new Kit(); const g = new Grounds();
  const { flag } = buildAll(k, g);
  const group = new THREE.Group(); group.name = 'landmarks';
  const arch = k.sink.finish();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arch.pos, 3));
  geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(arch.pack, 4, true));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'landmarkArchitecture'; mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
  ggeo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
  ggeo.computeVertexNormals(); ggeo.computeBoundingSphere();
  const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const gmesh = new THREE.Mesh(ggeo, gmat);
  gmesh.name = 'landmarkGrounds'; gmesh.receiveShadow = true; gmesh.castShadow = true;
  group.add(gmesh);
  if (flag) group.add(flag.mesh);
  return {
    group,
    update: (t) => flag?.update(t),
    setNight: (n) => { gmat.color.setHex(n ? 0x5a5650 : 0xffffff); gmat.emissive.setHex(n ? 0x1c130b : 0x000000); },
  };
}

/** Kept for the old API (single architecture mesh). */
export function buildLandmarkMesh(material: THREE.Material): THREE.Mesh {
  const k = new Kit(); const g = new Grounds(); buildAll(k, g);
  const arch = k.sink.finish();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arch.pos, 3));
  geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(arch.pack, 4, true));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, material);
}
