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
const S = { ...SURFACE, /** pale lime plaster: SURFACE.TANK_WHITE slot re-read as plaster on heritage typology */ LIME: SURFACE.TANK_WHITE };
const site = (k: string) => LANDMARK_SITES.find((s) => s.key === k);

// ─────────────────────────────────────────────────────────────────────────────
// Architecture kit (building vertex format)
// ─────────────────────────────────────────────────────────────────────────────

class Kit {
  readonly sink = new FloatSink(1 << 16);
  private hash = 0; private hByte = 0; private orient = 0;
  cx = 0; cz = 0; ca = 1; sa = 0;

  begin(s: LandmarkSite, heightM: number, seed: number, angle = s.a): void {
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
  chhatri(u: number, v: number, s: number, y: number, surf: number = S.DOME): void {
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
  trunk: 0x4a3a2c, bronze: 0x6b5a45, stoneEle: 0xb79a7c, steelRed: 0xb5402e, steelWhite: 0xd9d6cf, asphalt: 0x4c4c4c,
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
  /** Simple elephant statue (body, legs, head, trunk) facing +u. */
  elephant(u: number, v: number, y: number, s: number, faceU: number) {
    this.color(C.stoneEle);
    const f = faceU;
    this.box(u - 1.5 * s, u + 1.5 * s, y + 1.3 * s, y + 3.0 * s, v - 0.9 * s, v + 0.9 * s);
    for (const du of [-1.1, 1.0]) for (const dv of [-0.55, 0.55]) this.box(u + du * s - 0.3 * s, u + du * s + 0.3 * s, y, y + 1.4 * s, v + dv * s - 0.3 * s, v + dv * s + 0.3 * s);
    this.box(u + f * 1.5 * s - 0.1 * s, u + f * 2.4 * s, y + 2.0 * s, y + 3.2 * s, v - 0.65 * s, v + 0.65 * s);
    this.box(u + f * 2.3 * s, u + f * 2.65 * s, y + 0.4 * s, y + 2.3 * s, v - 0.18 * s, v + 0.18 * s);
    this.color(C.stoneEle, -0.1).box(u - 1.8 * s, u + 1.8 * s, y - 0.01, y + 0.08 * s, v - 1.1 * s, v + 1.1 * s);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

function baraImambara(k: Kit, g: Grounds, s: LandmarkSite): void {
  // Site frame: u along the hall's long axis (~east), v toward the south. The hall stands at
  // the south end; the courts, the Asafi Masjid (west, facing east), the Shahi Baoli (east)
  // and the two gateways lie to the north (-v), toward Rumi Darwaza.
  k.begin(s, 20, 23); g.frame(s);
  // Grounds: base paving, three courts, the circular forecourt, gardens.
  g.color(C.paveSand).rect(-116, 116, -260, 46, 0.08);
  g.color(C.paveGrey).rect(-60, 60, -258, -218, 0.1);                        // outer forecourt
  g.color(C.lawn).disc(0, -238, 15, 0.13, 32); g.color(C.paveSand).disc(0, -238, 6, 0.15, 24);
  g.color(C.water).disc(0, -238, 3.5, 0.17, 20);
  for (const su of [-1, 1]) { g.color(C.lawn).rect(su * 22, su * 52, -256, -224, 0.12); }
  g.color(C.lawn).rect(-50, -10, -208, -172, 0.12); g.color(C.lawn).rect(10, 50, -208, -172, 0.12); // second court
  // Main garden (charbagh-style parterres with hedged borders and cross paths).
  for (const [u0, u1] of [[-46, -4], [4, 46]]) for (const [v0, v1] of [[-150, -95], [-88, -32]]) {
    g.color(C.hedge).rect(u0, u1, v0, v1, 0.12); g.color(C.lawn).rect(u0 + 1.2, u1 - 1.2, v0 + 1.2, v1 - 1.2, 0.14);
    g.color(C.bed).rect((u0 + u1) / 2 - 3, (u0 + u1) / 2 + 3, (v0 + v1) / 2 - 3, (v0 + v1) / 2 + 3, 0.16);
  }
  g.color(C.path).rect(-4, 4, -158, -24, 0.15); g.color(C.path).rect(-48, 48, -93, -89, 0.15);
  let seed = 1;
  for (let v = -150; v <= -32; v += 9) { g.tree(-49, v, 9, true, seed++); g.tree(49, v, 9, true, seed++); }
  for (let u = -40; u <= 40; u += 10) { g.tree(u, -255, 7, false, seed++); }
  // Perimeter walls with openings at the gates.
  const wallH = 6;
  k.box(-116, -114, 0, wallH, -260, 46, S.LIME); k.box(114, 116, 0, wallH, -260, 46, S.LIME);
  k.box(-116, 116, 0, wallH, 44, 46, S.LIME);
  for (const [u0, u1] of [[-116, -24], [24, 116]]) { k.box(u0, u1, 0, wallH, -260, -258, S.LIME); k.box(u0, u1, 0, wallH, -214, -212, S.LIME); k.box(u0, u1, 0, wallH, -166, -164, S.LIME); }
  k.merlons(-116, 116, -260, 46, wallH);
  // Gateways: outer (with Naubat Khana gallery above) and inner.
  const gate = (v: number, h: number, gallery: boolean) => {
    k.box(-24, 24, 0, h, v - 6, v + 6, S.LIME);
    k.arcade('v0', v - 6, -6, 6, 0, 9, h - 3, 1, S.GLASS, true); k.arcade('v1', v + 6, -6, 6, 0, 9, h - 3, 1, S.GLASS, true);
    for (const sgn of [-1, 1]) { k.arcade('v0', v - 6, sgn * 15 - 6, sgn * 15 + 6, 1, 2.8, 6, 2); k.arcade('v1', v + 6, sgn * 15 - 6, sgn * 15 + 6, 1, 2.8, 6, 2); }
    if (gallery) { k.box(-20, 20, h, h + 5, v - 5, v + 5, S.LIME); k.arcade('v0', v - 5, -18, 18, h + 0.6, 1.8, 3.6, 9); k.arcade('v1', v + 5, -18, 18, h + 0.6, 1.8, 3.6, 9); }
    const top = gallery ? h + 5 : h;
    k.merlons(-24, 24, v - 6, v + 6, top);
    for (const su of [-21, 21]) { k.cylinder(su, v, 2.2, 1.8, 0, top + 4, 8, S.LIME); k.chhatri(su, v, 3, top + 4); }
    k.chhatri(0, v, 3.2, top);
  };
  gate(-259, 15, true);
  gate(-213, 13, false);
  gate(-165, 12, false);
  // Raised platform, steps and the main hall.
  k.box(-66, 66, 0, 2.4, -26, 34, S.LIME);
  for (let i = 0; i < 4; i++) k.box(-22, 22, 0, 2.4 - i * 0.6, -26 - (i + 1) * 0.9, -26 - i * 0.9, S.LIME);
  k.box(-60, 60, 2.4, 15, -20, 28, S.DOME);
  k.box(-24, 24, 15, 19.5, -18, 26, S.DOME);                    // central raised hall (vaulted roof)
  k.arcade('v0', -20, -58, 58, 2.6, 4.6, 8.6, 13, S.GLASS, true);
  k.arcade('v0', -20, -58, 58, 10.4, 2.6, 4.2, 23);
  k.arcade('v1', 28, -58, 58, 2.6, 3.6, 7.6, 15);
  k.arcade('u0', -60, -18, 26, 2.6, 3.6, 7.6, 5); k.arcade('u1', 60, -18, 26, 2.6, 3.6, 7.6, 5);
  k.arcade('v0', -18, -22, 22, 15.4, 2.2, 3.4, 9);
  k.merlons(-60, 60, -20, 28, 15); k.merlons(-24, 24, -18, 26, 19.5);
  for (let i = 0; i <= 10; i++) { const u = -56 + i * 11.2; k.chhatri(u, -18.5, 1.7, 15); }
  for (const u of [-58, 58]) for (const v of [-18, 26]) { k.cylinder(u, v, 2.4, 2.0, 2.4, 21, 8, S.DOME); k.chhatri(u, v, 3.2, 21); }
  for (const u of [-22, 22]) { k.chhatri(u, -16.5, 2.4, 19.5); }
  // Asafi Masjid (NMA: 11 arches on the east facade, taller central arch, tapering
  // multi-storey minarets, THREE pear-shaped domes, parapet domelets; ~25.13 m).
  const mu = -76, mv = -88;
  k.box(mu - 14, mu + 26, 0, 3.2, mv - 34, mv + 34, S.LIME);                      // plinth + forecourt
  for (let i = 0; i < 4; i++) k.box(mu + 26 + i * 0.9, mu + 27 + i * 0.9, 0, 3.2 - (i + 1) * 0.75, mv - 12, mv + 12, S.LIME);
  g.color(C.paveSand).rect(mu - 14, mu + 26, mv - 34, mv + 34, 3.25);
  k.box(mu - 12, mu + 6, 3.2, 15.5, mv - 27, mv + 27, S.DOME);                    // prayer hall
  k.arcade('u1', mu + 6, mv - 26, mv + 26, 3.3, 3.1, 8.0, 11, S.GLASS, true);
  k.box(mu + 4, mu + 7.5, 3.2, 18.5, mv - 4.8, mv + 4.8, S.DOME);                 // central pishtaq
  k.arcade('u1', mu + 7.5, mv - 3.6, mv + 3.6, 3.3, 5.6, 12.5, 1, S.GLASS, true);
  k.merlons(mu - 12, mu + 6, mv - 27, mv + 27, 15.5, S.DOME);
  for (let i = 0; i < 12; i++) k.onion(mu + 5.6, mv - 25 + i * (50 / 11), 0.55, 15.5, 1.2, S.DOME, 0.2, false);
  for (const [dv, r, h] of [[0, 5.8, 8.6], [-15, 4.2, 6.4], [15, 4.2, 6.4]] as Array<[number, number, number]>) {
    k.cylinder(mu - 3, mv + dv, r * 0.95, r * 0.95, 15.5, 17.2, 16, S.DOME);
    k.onion(mu - 3, mv + dv, r, 17.2, h, S.DOME, 0.32);                           // pear-shaped
  }
  for (const dv of [-29, 29]) k.minaret(mu + 6, mv + dv, 1.6, 26, 4, S.DOME, 3.2);
  // Shahi Baoli (stepped well) on the east side.
  const bu = 80, bv = -92;
  k.box(bu - 17, bu + 17, 0, 7.5, bv - 17, bv + 17, S.LIME, S.ROOF);
  k.arcadeAll(bu - 17, bu + 17, bv - 17, bv + 17, 0.4, 2.6, 5.5, 4.2);
  for (let i = 0; i < 5; i++) { const r = 11 - i * 2; g.color(i % 2 ? C.paveSand : C.paveGrey).rect(bu - r, bu + r, bv - r, bv + r, 7.55 - i * 1.4); }
  g.color(C.waterDeep).rect(bu - 2.5, bu + 2.5, bv - 2.5, bv + 2.5, 1.2);
}

function chhotaImambara(k: Kit, g: Grounds, s: LandmarkSite): void {
  // Footprint frame: main Imambara at the origin on a raised terrace, the long courtyard
  // with its raised central water tank and iron bridge running toward the gate (-v).
  k.begin(s, 30, 53); g.frame(s);
  g.color(C.paveSand).rect(-72, 72, -178, 34, 0.08);
  for (const su of [-1, 1]) {
    g.color(C.hedge).rect(su * 10, su * 46, -150, -28, 0.12); g.color(C.lawn).rect(su * 11.2, su * 44.8, -148.8, -29.2, 0.14);
    for (let v = -140; v <= -38; v += 17) g.color(C.bed).disc(su * 28, v, 2.2, 0.17, 12);
  }
  g.color(C.path).rect(-10, 10, -172, -28, 0.12);
  // Raised central tank with its channel and the ornamental bridge.
  k.box(-7.5, 7.5, 0, 1.0, -150, -30, S.STONE, S.STONE);
  g.color(C.water).rect(-6.3, 6.3, -149, -31, 1.02);
  k.box(-8.5, 8.5, 1.0, 1.6, -91.5, -88.5, S.METAL, S.METAL);                       // iron bridge deck
  for (const su of [-8.2, 8.2]) k.box(su - 0.1, su + 0.1, 1.6, 2.6, -91.5, -88.5, S.METAL);
  let seed = 3;
  for (let v = -145; v <= -35; v += 10) { g.tree(-47, v, 10, true, seed++); g.tree(47, v, 10, true, seed++); }
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
  // Mosque beside the terrace.
  k.box(lu + 12, lu + 34, 0, 9, -lv, lv, S.DOME); k.arcade('u0', lu + 12, -lv + 1.5, lv - 1.5, 0.5, 2.6, 6.5, 5, S.GLASS, true);
  for (const dv of [-8, 0, 8]) k.onion(lu + 24, dv, dv ? 2.6 : 3.4, 9, dv ? 4 : 5.2, S.DOME, 0.2);
  for (const dv of [-lv, lv]) k.minaret(lu + 13, dv, 0.9, 18, 3, S.DOME);
  // Gates: white main gateway and a side gate; boundary walls.
  k.box(-20, 20, 0, 14, -178, -168, S.DOME); k.arcade('v0', -178, -6, 6, 0, 8, 12, 1, S.GLASS, true); k.arcade('v1', -168, -6, 6, 0, 8, 12, 1, S.GLASS, true);
  k.merlons(-20, 20, -178, -168, 14, S.DOME); for (const su of [-17, 17]) k.chhatri(su, -173, 2.6, 14);
  k.box(68, 76, 0, 10, -128, -112, S.DOME); k.arcade('u1', 76, -124, -116, 0, 5, 8.5, 1, S.GLASS, true);
  for (const [u0, u1, v0, v1] of [[-72, -70, -178, 34], [70, 72, -178, -128], [70, 72, -112, 34], [-72, 72, 32, 34], [-72, -20, -178, -176], [20, 72, -178, -176]]) k.box(u0, u1, 0, 4.5, v0, v1, S.DOME);
}

function ambedkarMemorial(k: Kit, g: Grounds, s: LandmarkSite): void {
  // The 438,412 m2 Overture outline of the park (~108 acres; the published area is 107).
  // Layout follows its long axis: a central sandstone axis, the domed Ambedkar stupa,
  // museum halls, rows of red-sandstone columns/obelisks, the Pratibimb Sthal with 62
  // elephants in two rows, formal lawns and tree rows. Paving dominates, as in reality.
  const ring = PRECINCTS.ambedkar ?? s.ring;
  k.begin(s, 34, 97); g.frame(s);
  g.color(C.paveSand); g.polyWorld(ring, 0.07);
  // Long axis extent inside the outline.
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const [x, z] of ring) { const [u, v] = k.local(x, z); umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  const U0 = umin + 40, U1 = umax - 40, V0 = vmin + 40, V1 = vmax - 40;
  // Central axis and cross axis in red sandstone.
  g.color(C.paveRed).rect(U0, U1, -14, 14, 0.1); g.color(C.paveRed).rect(-14, 14, V0, V1, 0.1);
  // Formal lawns in the four quadrants, framed by tree rows.
  let seed = 7;
  // Quadrants are mostly stone plazas: a perimeter lawn band, diagonal-free formal lawn
  // strips and tree avenues, with pale paving in between (as in the aerial imagery).
  for (const [a0, a1] of [[U0 + 20, -40], [40, U1 - 20]]) for (const [b0, b1] of [[V0 + 20, -40], [40, V1 - 20]]) {
    if (a1 - a0 < 30 || b1 - b0 < 30) continue;
    g.color(C.paveGrey).rect(a0, a1, b0, b1, 0.1);
    const strips = Math.max(2, Math.floor((b1 - b0) / 46));
    for (let i = 0; i < strips; i++) {
      const vb = b0 + 8 + i * ((b1 - b0 - 16) / strips), ve = vb + Math.min(16, (b1 - b0) / strips - 12);
      g.color(C.hedge).rect(a0 + 8, a1 - 8, vb, ve, 0.12); g.color(C.lawn).rect(a0 + 9.2, a1 - 9.2, vb + 1.2, ve - 1.2, 0.14);
      for (let u = a0 + 12; u < a1 - 10; u += 11) g.tree(u, vb - 4, 8, true, seed++);
    }
    g.color(C.paveSand).rect(a0, a1, b0, b0 + 4, 0.13); g.color(C.paveSand).rect(a0, a1, b1 - 4, b1, 0.13);
  }
  // Perimeter landscape band inside the boundary.
  g.color(C.lawn).rect(U0 - 30, U1 + 30, V0 - 30, V0 - 8, 0.12); g.color(C.lawn).rect(U0 - 30, U1 + 30, V1 + 8, V1 + 30, 0.12);
  for (let u = U0 - 20; u < U1 + 20; u += 12) { g.tree(u, V0 - 19, 10, false, seed++); g.tree(u, V1 + 19, 10, false, seed++); }
  // Raised platform and the main domed stupa (~34 m / 112 ft).
  k.box(-48, 48, 0, 4, -48, 48, S.REDSTONE, S.REDSTONE);
  for (let i = 0; i < 5; i++) k.box(-14, 14, 0, 4 - i * 0.8, -48 - (i + 1) * 1.1, -48 - i * 1.1, S.REDSTONE);
  k.box(-30, 30, 4, 18, -30, 30, S.REDSTONE);
  k.arcadeAll(-30, 30, -30, 30, 4.6, 4.2, 11.5, 8.5, S.GLASS);
  k.merlons(-30, 30, -30, 30, 18, S.REDSTONE);
  k.cylinder(0, 0, 21, 21, 18, 21, 28, S.REDSTONE);
  k.hemi(0, 0, 20, 21, S.REDSTONE, 0.62);
  k.cylinder(0, 0, 2.2, 1.4, 33, 34.5, 10, S.STONE); k.cylinder(0, 0, 0.5, 0.15, 34.5, 37, 8, S.GILT);
  for (const u of [-30, 30]) for (const v of [-30, 30]) { k.box(u - 5, u + 5, 4, 20, v - 5, v + 5, S.REDSTONE); k.hemi(u, v, 5, 20, S.REDSTONE, 1); }
  // Museum halls along the cross axis, each with a dome.
  for (const sv of [-1, 1]) {
    const v = sv * Math.min(150, (V1 - 30));
    k.box(-36, 36, 0, 15, v - 18, v + 18, S.REDSTONE); k.arcadeAll(-36, 36, v - 18, v + 18, 0.6, 3.2, 9, 6);
    k.merlons(-36, 36, v - 18, v + 18, 15, S.REDSTONE); k.hemi(0, v, 12, 15, S.REDSTONE, 0.9);
  }
  // Pratibimb Sthal: a long elephant avenue along the main axis (62 elephants, 2 x 31).
  const e0 = 62, e1 = Math.min(U1 - 10, e0 + 31 * 7.5);
  for (let i = 0; i < 31; i++) {
    const u = e0 + 6 + i * ((e1 - e0 - 6) / 31);
    for (const sv of [-1, 1]) {
      k.box(u - 2, u + 2, 0, 1.4, sv * 22 - 2.5, sv * 22 + 2.5, S.REDSTONE);
      g.elephant(u, sv * 22, 1.4, 0.95, -sv * 0 + 1);
    }
  }
  // Rows of monumental columns / obelisks on the opposite arm of the axis.
  for (let u = -62; u > U0 + 8; u -= 13) for (const sv of [-1, 1]) {
    k.box(u - 1.6, u + 1.6, 0, 1.5, sv * 20 - 1.6, sv * 20 + 1.6, S.REDSTONE);
    k.lathe(u, sv * 20, [[1.0, 1.5], [0.55, 14], [0.0, 15.5]], 4, S.REDSTONE, Math.PI / 4);
  }
  // Gateway pavilions at the ends of the main axis.
  for (const u of [U0 + 6, U1 - 6]) {
    k.box(u - 8, u + 8, 0, 12, -16, 16, S.REDSTONE); k.arcade('u0', u - 8, -10, 10, 0, 7, 10, 1); k.arcade('u1', u + 8, -10, 10, 0, 7, 10, 1);
    k.hemi(u, 0, 6, 12, S.REDSTONE, 0.9);
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
  k.begin(s, 18, 11);
  const L = Math.max(s.ext[0], s.ext[1]);
  const half = Math.min(36, L / 2);
  k.box(-10, 10, 0, 17, -6, 6, S.LIME);
  k.arcade('v0', -6, -7, 7, 0, 10, 15, 1, S.GLASS, true);
  k.arcade('v1', 6, -7, 7, 0, 10, 15, 1, S.GLASS, true);
  k.box(-7, 7, 17, 19, -4, 4, S.LIME);
  k.lathe(0, 0, [[3.2, 19], [3.2, 23.5], [0.01, 23.5]], 8, S.LIME, Math.PI / 8);
  k.onion(0, 0, 2.6, 23.5, 3.2, S.DOME, 0.1);
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

function residency(k: Kit, s: LandmarkSite): void {
  k.begin(s, 20, 71);
  k.box(-10, 10, 0, 5, -9, 9, S.REDSTONE);
  const tops = [13.5, 11.8, 14.2, 9.6, 12.9, 10.8];
  for (let i = 0; i < 6; i++) {
    const u0 = -10 + (20 * i) / 6, u1 = u0 + 20 / 6;
    k.box(u0, u1, 5, tops[i], -9, -7.6, S.REDSTONE); k.box(u0, u1, 5, tops[(i + 2) % 6] - 1, 7.6, 9, S.REDSTONE);
  }
  k.box(-10, -8.6, 5, 12.5, -9, 9, S.REDSTONE); k.box(8.6, 10, 5, 11.2, -9, 9, S.REDSTONE);
  for (const f of ['v0', 'v1'] as const) { const at = f === 'v0' ? -9 : 9; k.arcade(f, at, -9, 9, 0.6, 1.8, 3.6, 6); k.arcade(f, at, -9, 9, 5.6, 1.4, 3.0, 6); }
  k.box(6, 10, 0, 19.5, 5, 9, S.REDSTONE); k.box(6.6, 9.4, 19.5, 20.6, 5.6, 8.4, S.REDSTONE);
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

function buildAll(k: Kit, g: Grounds): { flag?: WavingFlag } {
  const res: { flag?: WavingFlag } = {};
  const b = site('bara_imambara'); if (b) baraImambara(k, g, b);
  const r = site('rumi_darwaza'); if (r) rumiDarwaza(k, r);
  const ch = site('chhota_imambara'); if (ch) chhotaImambara(k, g, ch);
  const ct = site('clock_tower'); if (ct) clockTower(k, ct);
  const re = site('residency'); if (re) residency(k, re);
  const vs = site('vidhan_sabha'); if (vs) vidhanSabha(k, vs);
  const am = site('ambedkar_memorial'); if (am) ambedkarMemorial(k, g, am);
  const sk = site('satkhanda');
  if (sk) {
    k.begin(sk, 26, 61);
    for (let i = 0; i < 4; i++) {
      const r0 = 7.5 - i * 1.1, y0 = i * 6;
      k.cylinder(0, 0, r0, r0 - 0.3, y0, y0 + 5.6, 8, S.STONE);
      k.cylinder(0, 0, r0 + 0.6, r0 + 0.6, y0 + 5.6, y0 + 6, 8, S.STONE);
    }
    k.merlons(-3.8, 3.8, -3.8, 3.8, 24, S.STONE);
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
  if (cb) {
    k.begin(cb, 26, 89);
    k.extrudeWorldRing(cb.ring, 0, 13, S.REDSTONE, S.ROOF);
    const hu = cb.ext[0] / 2 - 20;
    for (let i = -4; i <= 4; i++) { const u = (i / 4) * hu; k.chhatri(u, 0, i === 0 ? 7 : 3.4, 13, S.DOME); }
    k.box(-18, 18, 13, 20, -10, 10, S.DOME); k.onion(0, 0, 7, 20, 7, S.DOME, 0.12);
    for (const u of [-hu * 0.5, hu * 0.5]) { k.cylinder(u, 0, 3, 3, 13, 22, 8, S.DOME); k.chhatri(u, 0, 4, 22); }
  }
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
  if (tj) ringMonument(k, tj, 22, S.DOME, 109, (kk) => { kk.cylinder(0, 0, 9, 9, 22, 26, 16, S.DOME); kk.onion(0, 0, 9, 26, 9, S.DOME, 0.12); });
  const rn = site('renaissance');
  if (rn) {
    // Renaissance Lucknow: a slab tower of blue-green glass with a pale stone frame and crown.
    k.begin(rn, 58, 113);
    const hu = rn.ext[0] / 2, hv = rn.ext[1] / 2;
    k.box(-hu, hu, 0, 8, -hv, hv, S.STONE);
    k.box(-hu + 1, hu - 1, 8, 58, -hv + 1, hv - 1, S.GLASS);
    for (let u = -hu + 1; u <= hu - 1; u += 6.5) { k.box(u - 0.35, u + 0.35, 8, 58, -hv + 0.6, -hv + 1.1, S.STONE); k.box(u - 0.35, u + 0.35, 8, 58, hv - 1.1, hv - 0.6, S.STONE); }
    for (let y = 8; y <= 58; y += 3.3) { k.box(-hu + 0.6, hu - 0.6, y, y + 0.3, -hv + 0.6, -hv + 1.0, S.STONE); k.box(-hu + 0.6, hu - 0.6, y, y + 0.3, hv - 1.0, hv - 0.6, S.STONE); }
    k.box(-hu, hu, 58, 61, -hv, hv, S.STONE);
    k.box(-hu * 0.35, hu * 0.35, 61, 66, -hv * 0.5, hv * 0.5, S.STONE);
  }
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
    setNight: (n) => { gmat.color.setHex(n ? 0x5a5650 : 0xffffff); },
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
