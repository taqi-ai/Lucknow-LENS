import * as THREE from 'three';
import { FloatSink } from './buildingGeometry';
import { SURFACE, TYPOLOGY } from './buildingTypes';
import { LANDMARK_SITES, type LandmarkSite } from './landmarkSites';

/**
 * Landmarks — procedural models of Lucknow's priority monuments.
 *
 * These are PROCEDURAL RECONSTRUCTIONS built from simple architectural primitives
 * (blocks, arcades of arched openings, onion and hemispherical domes, chhatris,
 * minarets, a clock stage). They are NOT photogrammetry or surveyed models. Each is
 * anchored to its real Overture footprint (centroid and long-axis orientation, see
 * landmarkSites.ts) and sized from that footprint and published dimensions; the
 * footprint itself is removed from the tile and HLOD geometry so the two never overlap.
 *
 * Geometry uses the shared building vertex format and material, so landmarks receive
 * the same lighting, haze, shadows and heritage floodlighting at night.
 */

type V3 = [number, number, number];

class Kit {
  readonly sink = new FloatSink(1 << 14);
  private hash = 0;
  private hByte = 0;
  private orient = 0;
  private cx = 0; private cz = 0; private ca = 1; private sa = 0;

  begin(site: LandmarkSite, heightM: number, seed: number): void {
    this.cx = site.c[0]; this.cz = site.c[1];
    this.ca = Math.cos(site.a); this.sa = Math.sin(site.a);
    this.hash = seed & 0xff;
    this.hByte = Math.min(255, Math.round(heightM / 0.5));
    this.orient = Math.round(((site.a + Math.PI) / (Math.PI * 2)) * 31) & 31;
  }

  /** Local (u along the long axis, y up, v across) -> world. */
  w(p: V3): V3 {
    return [this.cx + p[0] * this.ca - p[2] * this.sa, p[1], this.cz + p[0] * this.sa + p[2] * this.ca];
  }

  private vert(p: V3, surf: number, ao: number): void {
    this.sink.push(p[0], p[1], p[2], this.hash, this.hByte, ((ao & 15) << 4) | (surf & 15), ((TYPOLOGY.HERITAGE & 7) << 5) | this.orient);
  }

  /** Triangle in LOCAL coords, flipped if needed so its normal agrees with `out` (local). */
  tri(a: V3, b: V3, c: V3, surf: number, out: V3, ao = 14): void {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    // Local->world is a rotation about Y plus translation: handedness is preserved.
    const A = this.w(a), B = this.w(flip ? c : b), C = this.w(flip ? b : c);
    this.vert(A, surf, ao); this.vert(B, surf, ao); this.vert(C, surf, ao);
  }

  quad(a: V3, b: V3, c: V3, d: V3, surf: number, out: V3, ao = 14): void {
    this.tri(a, b, c, surf, out, ao); this.tri(a, c, d, surf, out, ao);
  }

  /** Axis-aligned (in local frame) box. */
  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, surf: number, top = surf): void {
    const P = (u: number, y: number, v: number): V3 => [u, y, v];
    this.quad(P(u0, y0, v0), P(u1, y0, v0), P(u1, y1, v0), P(u0, y1, v0), surf, [0, 0, -1], 13);
    this.quad(P(u0, y0, v1), P(u1, y0, v1), P(u1, y1, v1), P(u0, y1, v1), surf, [0, 0, 1], 13);
    this.quad(P(u0, y0, v0), P(u0, y0, v1), P(u0, y1, v1), P(u0, y1, v0), surf, [-1, 0, 0], 13);
    this.quad(P(u1, y0, v0), P(u1, y0, v1), P(u1, y1, v1), P(u1, y1, v0), surf, [1, 0, 0], 13);
    this.quad(P(u0, y1, v0), P(u1, y1, v0), P(u1, y1, v1), P(u0, y1, v1), top, [0, 1, 0], 15);
  }

  /** Surface of revolution about (u,v) from a profile of [radius, y]; closed at the top. */
  lathe(u: number, v: number, profile: Array<[number, number]>, n: number, surf: number, sides = 0): void {
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2 + (sides ? Math.PI / n : 0), a1 = ((k + 1) / n) * Math.PI * 2 + (sides ? Math.PI / n : 0);
        const p00: V3 = [u + Math.cos(a0) * r0, y0, v + Math.sin(a0) * r0];
        const p01: V3 = [u + Math.cos(a1) * r0, y0, v + Math.sin(a1) * r0];
        const p10: V3 = [u + Math.cos(a0) * r1, y1, v + Math.sin(a0) * r1];
        const p11: V3 = [u + Math.cos(a1) * r1, y1, v + Math.sin(a1) * r1];
        const am = (a0 + a1) / 2;
        const out: V3 = [Math.cos(am), (r0 - r1) / Math.max(0.01, Math.abs(y1 - y0) + Math.abs(r0 - r1)), Math.sin(am)];
        if (r1 < 0.01) this.tri(p00, p01, p10, surf, out, 15);
        else this.quad(p00, p01, p11, p10, surf, out, i === 0 ? 12 : 15);
      }
    }
  }

  cylinder(u: number, v: number, r0: number, r1: number, y0: number, y1: number, n: number, surf: number): void {
    this.lathe(u, v, [[r0, y0], [r1, y1]], n, surf, 1);
    // cap
    const top: Array<[number, number]> = [[r1, y1], [0, y1]];
    this.lathe(u, v, top, n, surf, 1);
  }

  /** Onion / bulbous dome of base radius r sitting at y. */
  onion(u: number, v: number, r: number, y: number, h: number, surf: number, bulge = 0.18): void {
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const rr = r * (1 + bulge * Math.sin(Math.min(1, t * 1.6) * Math.PI)) * Math.cos(t * Math.PI / 2) ** 0.8;
      prof.push([Math.max(0, i === 10 ? 0 : rr), y + t * h]);
    }
    this.lathe(u, v, prof, 16, surf);
    // finial
    this.cylinder(u, v, r * 0.06, r * 0.02, y + h, y + h + r * 0.45, 6, SURFACE.GILT);
  }

  /** Hemispherical / stupa dome. */
  hemi(u: number, v: number, r: number, y: number, surf: number, squash = 1): void {
    const prof: Array<[number, number]> = [];
    for (let i = 0; i <= 9; i++) {
      const t = (i / 9) * Math.PI / 2;
      prof.push([i === 9 ? 0 : r * Math.cos(t), y + r * squash * Math.sin(t)]);
    }
    this.lathe(u, v, prof, 20, surf);
  }

  /** Chhatri: four slim piers, a slab and a small dome. */
  chhatri(u: number, v: number, s: number, y: number, surf = SURFACE.DOME): void {
    const p = s * 0.12, h = s * 1.1;
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.box(u + du * s / 2 - p / 2, u + du * s / 2 + p / 2, y, y + h, v + dv * s / 2 - p / 2, v + dv * s / 2 + p / 2, SURFACE.STONE);
    }
    this.box(u - s * 0.62, u + s * 0.62, y + h, y + h + s * 0.12, v - s * 0.62, v + s * 0.62, SURFACE.STONE);
    this.onion(u, v, s * 0.48, y + h + s * 0.12, s * 0.7, surf, 0.12);
  }

  /**
   * Arched openings on the face of a block (dark recesses just proud of the wall).
   * face: 'v0' | 'v1' | 'u0' | 'u1' at coordinate `at`, spanning [s0, s1] along it.
   */
  arcade(face: 'v0' | 'v1' | 'u0' | 'u1', at: number, s0: number, s1: number, y0: number, w: number, h: number, count: number, surf = SURFACE.GLASS): void {
    const off = face.endsWith('0') ? -0.09 : 0.09;
    const out: V3 = face[0] === 'v' ? [0, 0, Math.sign(off)] : [Math.sign(off), 0, 0];
    const step = (s1 - s0) / count;
    for (let i = 0; i < count; i++) {
      const c = s0 + step * (i + 0.5);
      const pts: Array<[number, number]> = [[c - w / 2, y0], [c + w / 2, y0], [c + w / 2, y0 + h - w / 2]];
      for (let k = 1; k < 8; k++) {
        const t = (k / 8) * Math.PI;
        pts.push([c + Math.cos(t) * w / 2, y0 + h - w / 2 + Math.sin(t) * w / 2 * 1.1]);
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

  /** Extrude a WORLD-space ring (real footprint) between y0 and y1. */
  extrudeWorldRing(ring: Array<[number, number]>, y0: number, y1: number, surf: number, roofSurf: number): void {
    // convert to local
    const loc = ring.map(([x, z]): [number, number] => {
      const dx = x - this.cx, dz = z - this.cz;
      return [dx * this.ca + dz * this.sa, -dx * this.sa + dz * this.ca];
    });
    let cu = 0, cv = 0; for (const [u, v] of loc) { cu += u; cv += v; } cu /= loc.length; cv /= loc.length;
    for (let i = 0; i < loc.length; i++) {
      const a = loc[i], b = loc[(i + 1) % loc.length];
      const mu = (a[0] + b[0]) / 2 - cu, mv = (a[1] + b[1]) / 2 - cv;
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], surf, [mu, 0, mv], 12);
    }
    const contour = loc.map(([u, v]) => new THREE.Vector2(u, v));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const f of faces) {
      const [a, b, c] = f.map((i) => loc[i]);
      this.tri([a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], roofSurf, [0, 1, 0], 15);
    }
  }
}

const S = SURFACE;

function rumiDarwaza(k: Kit, s: LandmarkSite): void {
  // ~18 m gateway; the footprint's long axis carries the curved flanking wings and the
  // road passes through across it (along v).
  k.begin(s, 18, 11);
  const L = s.ext[0] > s.ext[1] ? s.ext[0] : s.ext[1];
  const half = Math.min(36, L / 2);
  // central gate block with the great arch (on both faces)
  k.box(-10, 10, 0, 17, -6, 6, S.STONE);
  k.arcade('v0', -6, -7, 7, 0, 10, 15, 1);
  k.arcade('v1', 6, -7, 7, 0, 10, 15, 1);
  // stepped crown and the octagonal lantern (chhatri) on top
  k.box(-7, 7, 17, 19, -4, 4, S.STONE);
  k.lathe(0, 0, [[3.2, 19], [3.2, 23.5], [0.01, 23.5]], 8, S.STONE, 1);
  k.onion(0, 0, 2.6, 23.5, 3.2, S.DOME, 0.1);
  // flanking wings, stepping down, arcaded in two tiers
  for (const sgn of [-1, 1]) {
    const u0 = sgn > 0 ? 10 : -half, u1 = sgn > 0 ? half : -10;
    k.box(u0, u1, 0, 10, -3.5, 3.5, S.STONE);
    k.arcade('v0', -3.5, u0 + 1, u1 - 1, 0.6, 2.2, 4.6, 5);
    k.arcade('v1', 3.5, u0 + 1, u1 - 1, 0.6, 2.2, 4.6, 5);
    k.arcade('v0', -3.5, u0 + 1, u1 - 1, 5.6, 1.6, 3.4, 7);
    k.arcade('v1', 3.5, u0 + 1, u1 - 1, 5.6, 1.6, 3.4, 7);
    // end turrets
    const tu = sgn * (half - 1.5);
    k.cylinder(tu, 0, 2.0, 1.6, 0, 14, 8, S.STONE);
    k.chhatri(tu, 0, 2.4, 14);
    // small kiosks along the wing parapet
    for (let i = 1; i <= 3; i++) k.chhatri(sgn * (10 + (half - 12) * i / 4), 0, 1.4, 10);
  }
}

function baraImambara(k: Kit, s: LandmarkSite): void {
  // Main hall complex: a long two-storey arcaded block (~16 m) with a raised central
  // section, kiosks on the roofline and a forecourt gate on the entrance side.
  k.begin(s, 20, 23);
  const lu = Math.min(48, s.ext[0] * 0.42), lv = 15;
  k.box(-lu, lu, 0, 16, -lv, lv, S.STONE);
  k.box(-14, 14, 16, 21, -lv + 2, lv - 2, S.STONE); // central raised hall
  for (const face of ['v0', 'v1'] as const) {
    const at = face === 'v0' ? -lv : lv;
    k.arcade(face, at, -lu + 2, lu - 2, 0.4, 3.2, 6.6, 15);
    k.arcade(face, at, -lu + 2, lu - 2, 8.2, 2.4, 5.0, 19);
    k.arcade(face, at, -12, 12, 16.4, 2.6, 3.8, 5);
  }
  k.arcade('u0', -lu, -lv + 2, lv - 2, 0.4, 3.0, 6.4, 4);
  k.arcade('u1', lu, -lv + 2, lv - 2, 0.4, 3.0, 6.4, 4);
  // roofline kiosks
  for (let i = 0; i <= 8; i++) {
    const u = -lu + 3 + ((2 * lu - 6) * i) / 8;
    k.chhatri(u, -lv + 1.6, 1.6, 16);
    k.chhatri(u, lv - 1.6, 1.6, 16);
  }
  for (const u of [-lu + 2.5, lu - 2.5]) for (const v of [-lv + 2.5, lv - 2.5]) {
    k.cylinder(u, v, 1.6, 1.3, 16, 22, 8, S.STONE);
    k.chhatri(u, v, 2.2, 22);
  }
  // forecourt gateway (Naubat Khana side) on -v
  k.box(-9, 9, 0, 13, -lv - 34, -lv - 26, S.STONE);
  k.arcade('v0', -lv - 34, -4, 4, 0, 6, 10, 1);
  k.arcade('v1', -lv - 26, -4, 4, 0, 6, 10, 1);
  k.chhatri(-7, -lv - 30, 1.8, 13); k.chhatri(7, -lv - 30, 1.8, 13);
}

function clockTower(k: Kit, s: LandmarkSite): void {
  // Husainabad Clock Tower: 67 m (source footprint height). Red-brick Victorian Gothic:
  // square shaft, clock stage with four dials, open belfry and a spire.
  k.begin(s, 67, 37);
  k.box(-5, 5, 0, 4, -5, 5, S.REDSTONE);
  k.box(-4.2, 4.2, 4, 40, -4.2, 4.2, S.REDSTONE);
  for (const [f, at] of [['v0', -4.2], ['v1', 4.2], ['u0', -4.2], ['u1', 4.2]] as const) {
    k.arcade(f, at, -2.5, 2.5, 8, 1.2, 4, 2);
    k.arcade(f, at, -2.5, 2.5, 20, 1.2, 4, 2);
    k.arcade(f, at, -2.5, 2.5, 31, 1.2, 4, 2);
  }
  k.box(-4.8, 4.8, 40, 49, -4.8, 4.8, S.REDSTONE); // clock stage
  // dials: white discs with a gilt rim
  for (const [ou, ov, nu, nv] of [[0, -4.9, 0, -1], [0, 4.9, 0, 1], [-4.9, 0, -1, 0], [4.9, 0, 1, 0]]) {
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      const P = (r: number, a: number): V3 => (nu === 0
        ? [ou + Math.cos(a) * r, 44.5 + Math.sin(a) * r, ov]
        : [ou, 44.5 + Math.sin(a) * r, ov + Math.cos(a) * r]);
      k.tri([nu === 0 ? ou : ou, 44.5, ov], P(3.2, a0), P(3.2, a1), S.TRIM, [nu, 0, nv]);
      k.quad(P(3.2, a0), P(3.6, a0), P(3.6, a1), P(3.2, a1), S.GILT, [nu, 0, nv]);
    }
  }
  k.box(-4.2, 4.2, 49, 56, -4.2, 4.2, S.REDSTONE); // belfry
  for (const [f, at] of [['v0', -4.2], ['v1', 4.2], ['u0', -4.2], ['u1', 4.2]] as const) k.arcade(f, at, -3, 3, 49.5, 1.6, 5.5, 2);
  k.lathe(0, 0, [[4.4, 56], [0.5, 65], [0.01, 65.2]], 4, S.REDSTONE, 1);
  k.cylinder(0, 0, 0.25, 0.1, 65, 67, 6, S.GILT);
  for (const [u, v] of [[-4.2, -4.2], [4.2, -4.2], [4.2, 4.2], [-4.2, 4.2]]) k.cylinder(u, v, 0.55, 0.1, 56, 60, 6, S.REDSTONE);
}

function chhotaImambara(k: Kit, s: LandmarkSite): void {
  // White lime-washed hall with a gilded central dome, flanking minarets and kiosks.
  k.begin(s, 30, 53);
  const lu = Math.min(22, s.ext[0] / 2), lv = Math.min(14, s.ext[1] / 2);
  k.box(-lu, lu, 0, 11, -lv, lv, S.DOME);
  k.arcade('v0', -lv, -lu + 2, lu - 2, 0.5, 2.6, 6.5, 7);
  k.arcade('v1', lv, -lu + 2, lu - 2, 0.5, 2.6, 6.5, 7);
  k.arcade('u0', -lu, -lv + 2, lv - 2, 0.5, 2.6, 6.5, 4);
  k.arcade('u1', lu, -lv + 2, lv - 2, 0.5, 2.6, 6.5, 4);
  k.cylinder(0, 0, 6.2, 6.2, 11, 15, 16, S.DOME); // drum
  k.onion(0, 0, 6.0, 15, 10, S.GILT, 0.22);
  for (const u of [-lu + 1, lu - 1]) for (const v of [-lv + 1, lv - 1]) {
    k.cylinder(u, v, 1.3, 0.9, 0, 26, 8, S.DOME);
    k.box(u - 1.6, u + 1.6, 18, 18.4, v - 1.6, v + 1.6, S.DOME);
    k.onion(u, v, 1.0, 26, 1.8, S.GILT, 0.15);
  }
  for (let i = 1; i <= 3; i++) {
    const u = -lu + (2 * lu * i) / 4;
    k.chhatri(u, -lv + 1.2, 1.3, 11);
    k.chhatri(u, lv - 1.2, 1.3, 11);
  }
}

function residency(k: Kit, s: LandmarkSite): void {
  // The Residency: ruined three-storey red-brick building with a broken corner tower.
  k.begin(s, 20, 71);
  k.box(-10, 10, 0, 5, -9, 9, S.REDSTONE);
  const tops = [13.5, 11.8, 14.2, 9.6, 12.9, 10.8];
  for (let i = 0; i < 6; i++) {
    const u0 = -10 + (20 * i) / 6, u1 = u0 + 20 / 6;
    k.box(u0, u1, 5, tops[i], -9, -7.6, S.REDSTONE);
    k.box(u0, u1, 5, tops[(i + 2) % 6] - 1, 7.6, 9, S.REDSTONE);
  }
  k.box(-10, -8.6, 5, 12.5, -9, 9, S.REDSTONE);
  k.box(8.6, 10, 5, 11.2, -9, 9, S.REDSTONE);
  for (const f of ['v0', 'v1'] as const) {
    const at = f === 'v0' ? -9 : 9;
    k.arcade(f, at, -9, 9, 0.6, 1.8, 3.6, 6);
    k.arcade(f, at, -9, 9, 5.6, 1.4, 3.0, 6);
  }
  k.box(6, 10, 0, 19.5, 5, 9, S.REDSTONE); // corner tower
  k.box(6.6, 9.4, 19.5, 20.6, 5.6, 8.4, S.REDSTONE);
}

function vidhanSabha(k: Kit, s: LandmarkSite, site: LandmarkSite): void {
  // Vidhan Bhawan: the real footprint outline extruded as the cream sandstone block,
  // a central dome on a tall drum, and a colonnaded portico.
  k.begin(s, 42, 89);
  k.extrudeWorldRing(site.ring, 0, 19, S.STONE, S.ROOF);
  k.cylinder(0, 0, 13, 13, 19, 28, 20, S.STONE);
  k.arcade('v0', -13.05, -9, 9, 20, 1.6, 6, 6);
  k.hemi(0, 0, 13, 28, S.DOME, 0.8);
  k.cylinder(0, 0, 1.2, 0.5, 38.4, 42, 8, S.GILT);
  for (const u of [-28, 28]) { k.chhatri(u, -8, 4, 19); k.chhatri(u, 8, 4, 19); }
}

function ambedkarMemorial(k: Kit, s: LandmarkSite, site: LandmarkSite): void {
  // Ambedkar Memorial: a raised red-sandstone platform on the real compound outline,
  // a central domed hall and four corner domed pavilions, with obelisk rows.
  k.begin(s, 46, 97);
  k.extrudeWorldRing(site.ring, 0, 3, S.REDSTONE, S.REDSTONE);
  k.box(-30, 30, 3, 21, -30, 30, S.REDSTONE);
  for (const [f, at] of [['v0', -30], ['v1', 30], ['u0', -30], ['u1', 30]] as const) k.arcade(f, at, -24, 24, 3.5, 4, 12, 5);
  k.cylinder(0, 0, 20, 20, 21, 25, 24, S.REDSTONE);
  k.hemi(0, 0, 20, 25, S.REDSTONE, 0.95);
  k.cylinder(0, 0, 1.6, 0.6, 44, 46, 8, S.GILT);
  for (const u of [-44, 44]) for (const v of [-44, 44]) {
    k.box(u - 9, u + 9, 3, 13, v - 9, v + 9, S.REDSTONE);
    k.hemi(u, v, 8, 13, S.REDSTONE, 1);
  }
  for (let i = -4; i <= 4; i++) {
    if (Math.abs(i) < 2) continue;
    for (const v of [-62, 62]) k.lathe(i * 11, v, [[1.3, 3], [0.6, 17], [0.01, 18.5]], 4, S.REDSTONE, 1);
  }
}

const BUILDERS: Record<string, (k: Kit, s: LandmarkSite, site: LandmarkSite) => void> = {
  rumi_darwaza: rumiDarwaza,
  bara_imambara: baraImambara,
  clock_tower: clockTower,
  chhota_imambara: chhotaImambara,
  residency,
  vidhan_sabha: vidhanSabha,
  ambedkar_memorial: ambedkarMemorial,
};

/** Build every landmark into one mesh (one draw call) using the shared building material. */
export function buildLandmarkMesh(material: THREE.Material): THREE.Mesh {
  const k = new Kit();
  for (const site of LANDMARK_SITES) {
    const fn = BUILDERS[site.key];
    if (fn) fn(k, site, site);
  }
  const g = k.sink.finish();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(g.pack, 4, true));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'landmarks';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
