/**
 * overlayGeometry — builds the city-wide road / water / park / bridge geometry.
 *
 * Dependency-free (no three.js) so the offline baker can run it in Node. The client
 * no longer runs any of this: it reads the baked buffers straight into
 * BufferAttributes.
 *
 * Why this moved offline: doing it at startup meant parsing 7.3 MB of overview.json
 * plus 6.9 MB of labels, running 14,471 polylines through the ribbon builder, and
 * intersecting every road segment against every waterway segment — an unindexed
 * O(roads x rivers) scan. That saturated the main thread for ~43 s, during which the
 * page could not even be queried, which is what made localhost look dead.
 */

import {
  appendRailway, appendRibbon, buildElevationProfiles, classifyRoad, railGaugeFor,
  ROAD_HALF_WIDTH, ROAD_LAYER_Y, roadHalfWidth, type Pt, type RailSinks, type RoadClass,
} from './ribbon';
import { triangulate } from './buildingGeometry';
import { METRO_STATIONS } from './metroStations';
import { buildNamedStructure, matchStructure, type StructureSinks } from './namedStructures';

/** Total length above which a named structure is a corridor, not a structure. */
const FINE_DETAIL_MAX_TOTAL = 2500;

export interface OverlayRoad {
  id?: string;
  /** Real Overture name — drives named-structure detailing. */
  name?: string;
  points: Pt[];
  width?: number;
  type?: string;
  subtype?: string;
  level?: number;
  isElevated?: boolean;
}
export interface OverlayWater { id?: string; points: Pt[]; width?: number; isPolygon?: boolean; cls?: string; bridgeable?: boolean }
export interface OverlayArea { id?: string; points: Pt[] }

export interface OverlaySource {
  majorRoads?: OverlayRoad[];
  waterways?: OverlayWater[];
  greenAreas?: OverlayArea[];
}

export interface OverlayBuild {
  /** Road ribbon positions keyed by class. */
  roads: Record<string, Float32Array>;
  /** Per-vertex (u across -1..1, v metres along) for each road class buffer. */
  roadsUv: Record<string, Float32Array>;
  water: Float32Array;
  /** Stone embankment ribbon along river polygon outlines. */
  riverBank: Float32Array;
  parks: Float32Array;
  bridgeDeck: Float32Array;
  bridgePier: Float32Array;
  bridgeRail: Float32Array;
  flyoverPiers: Float32Array;
  flyoverBarriers: Float32Array;
  /** Raised median kerbs between paired one-way carriageways. */
  medianKerb: Float32Array;
  /** Planted median infill. */
  medianGrass: Float32Array;
  /** Zebra crossings and stop lines at junctions. */
  markings: Float32Array;
  /** Ballast prism at grade / box girder on viaduct. */
  railBed: Float32Array;
  /** Concrete sleepers — street-level detail. */
  railSleepers: Float32Array;
  /** Running rails. */
  railRails: Float32Array;
  crossings: number;
  /** Features that received a real elevation profile. */
  elevated: number;
  /** Metro station platform decks. */
  metroDeck: Float32Array;
  /** Station canopy roofs. */
  metroCanopy: Float32Array;
  /** Station support columns. */
  metroColumn: Float32Array;
  /** Stations actually placed on the alignment. */
  stations: number;
  /** Parapet rails and posts on named structures. */
  structRail: Float32Array;
  /** Lighting masts on named structures. */
  structLamp: Float32Array;
  /** Steel superstructure: trusses and plate girders. */
  structTruss: Float32Array;
  /** Heavy concrete: barrage piers and gate housings. */
  structMass: Float32Array;
  /** Named structures that matched a real feature and were detailed. */
  namedStructures: number;
}

export const ROAD_CLASS_ORDER: RoadClass[] = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'railway', 'flyover'
];

const BRIDGEABLE = new Set<RoadClass>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'railway', 'flyover']);
const DECK_Y = 7.5;
const RAMP_LEN = 90;
/** Spatial hash cell for the crossing search, metres. */
const GRID = 500;

function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  return len;
}

/**
 * Greedily joins polylines that share an endpoint (within `tol` metres) into
 * the longest continuous chains it can, reversing pieces as needed. Pieces
 * that don't touch anything become single-piece chains, so nothing is lost.
 */
function chainPolylines(pieces: Pt[][], tol: number): Pt[][] {
  const remaining = pieces.filter(p => p.length >= 2).map(p => p.slice());
  const chains: Pt[][] = [];
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

  while (remaining.length > 0) {
    let chain = remaining.shift()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        const chainStart = chain[0], chainEnd = chain[chain.length - 1];
        const pStart = p[0], pEnd = p[p.length - 1];
        if (dist(chainEnd, pStart) <= tol) {
          chain = chain.concat(p.slice(1));
        } else if (dist(chainEnd, pEnd) <= tol) {
          chain = chain.concat(p.slice(0, -1).reverse());
        } else if (dist(chainStart, pEnd) <= tol) {
          chain = p.slice(0, -1).concat(chain);
        } else if (dist(chainStart, pStart) <= tol) {
          chain = p.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

function triangulateArea(out: number[], ring: Pt[], y: number): void {
  if (ring.length < 3) return;
  const tris = triangulate(ring);
  for (let t = 0; t < tris.length; t += 3) {
    const pa = ring[tris[t]], pb = ring[tris[t + 1]], pc = ring[tris[t + 2]];
    if (!pa || !pb || !pc) continue;
    const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
    const tri = cross > 0 ? [pa, pc, pb] : [pa, pb, pc];
    for (const p of tri) out.push(p.x, y, p.z);
  }
}

function segIntersect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): { x: number; z: number } | null {
  const r1 = bx - ax, r2 = bz - az;
  const s1 = dx - cx, s2 = dz - cz;
  const denom = r1 * s2 - r2 * s1;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cz - az) * s1) / denom;
  const u = ((cx - ax) * r2 - (cz - az) * r1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * r1, z: az + t * r2 };
}

interface RiverSeg {
  ax: number; az: number; bx: number; bz: number; half: number;
}

interface Crossing {
  x: number; z: number; dirX: number; dirZ: number; half: number; span: number;
}

function buildRiverIndex(waterways: OverlayWater[]): Map<string, RiverSeg[]> {
  const index = new Map<string, RiverSeg[]>();
  for (const w of waterways) {
    if (w.isPolygon || !w.points || w.points.length < 2) continue;
    // Only real rivers and major canals get bridges (scripts/py/build_hydrology.py).
    if (!w.bridgeable) continue;
    const half = Math.max(6, (w.width ?? 20) / 2);
    for (let i = 0; i < w.points.length - 1; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const seg: RiverSeg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, half };
      const x0 = Math.floor(Math.min(a.x, b.x) / GRID);
      const x1 = Math.floor(Math.max(a.x, b.x) / GRID);
      const z0 = Math.floor(Math.min(a.z, b.z) / GRID);
      const z1 = Math.floor(Math.max(a.z, b.z) / GRID);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const key = `${gx},${gz}`;
          let bucket = index.get(key);
          if (!bucket) { bucket = []; index.set(key, bucket); }
          bucket.push(seg);
        }
      }
    }
  }
  return index;
}

function findCrossings(roads: OverlayRoad[], waterways: OverlayWater[]): Crossing[] {
  const index = buildRiverIndex(waterways);
  if (index.size === 0) return [];

  const found: Crossing[] = [];
  const seen = new Set<RiverSeg>();

  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    if (!BRIDGEABLE.has(cls)) continue;
    // An elevated feature already carries a deck from its elevation profile;
    // synthesising a river bridge under it too would double the geometry.
    if (road.isElevated || (road.level ?? 0) > 0) continue;
    const half = roadHalfWidth(cls, road.type, (road as { id?: string }).id);

    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];

      const x0 = Math.floor(Math.min(a.x, b.x) / GRID);
      const x1 = Math.floor(Math.max(a.x, b.x) / GRID);
      const z0 = Math.floor(Math.min(a.z, b.z) / GRID);
      const z1 = Math.floor(Math.max(a.z, b.z) / GRID);

      seen.clear();
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const bucket = index.get(`${gx},${gz}`);
          if (!bucket) continue;
          for (const seg of bucket) {
            if (seen.has(seg)) continue;
            seen.add(seg);

            const hit = segIntersect(a.x, a.z, b.x, b.z, seg.ax, seg.az, seg.bx, seg.bz);
            if (!hit) continue;

            const rdx = b.x - a.x, rdz = b.z - a.z;
            const rlen = Math.hypot(rdx, rdz) || 1;
            const wdx = seg.bx - seg.ax, wdz = seg.bz - seg.az;
            const wlen = Math.hypot(wdx, wdz) || 1;
            const cosA = Math.abs((rdx / rlen) * (wdx / wlen) + (rdz / rlen) * (wdz / wlen));
            const sinA = Math.max(0.25, Math.sqrt(1 - cosA * cosA));

            found.push({
              x: hit.x, z: hit.z,
              dirX: rdx / rlen, dirZ: rdz / rlen,
              half,
              span: seg.half / sinA + 22,
            });
          }
        }
      }
    }
  }

  const merged: Crossing[] = [];
  const mGrid = new Map<string, Crossing[]>();
  for (const c of found) {
    const key = `${Math.round(c.x / 60)},${Math.round(c.z / 60)}`;
    let near: Crossing | undefined;
    for (let dx = -1; dx <= 1 && !near; dx++) {
      for (let dz = -1; dz <= 1 && !near; dz++) {
        const bucket = mGrid.get(`${Math.round(c.x / 60) + dx},${Math.round(c.z / 60) + dz}`);
        if (bucket) near = bucket.find((m) => Math.hypot(m.x - c.x, m.z - c.z) < 45);
      }
    }
    if (near) {
      near.span = Math.max(near.span, c.span);
      near.half = Math.max(near.half, c.half);
      continue;
    }
    merged.push(c);
    let bucket = mGrid.get(key);
    if (!bucket) { bucket = []; mGrid.set(key, bucket); }
    bucket.push(c);
  }
  return merged;
}

function appendBridge(c: Crossing, deck: number[], pier: number[], rail: number[]): void {
  const ang = Math.atan2(c.dirZ, c.dirX);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const W = (u: number, y: number, v: number, out: number[]) => {
    out.push(c.x + u * ca - v * sa, y, c.z + u * sa + v * ca);
  };
  const box = (out: number[], u0: number, u1: number, y0: number, y1: number, v0: number, v1: number) => {
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
  };

  const half = c.half;
  const span = c.span;

  box(deck, -span, span, DECK_Y - 0.55, DECK_Y + 0.55, -half, half);

  for (const sx of [-1, 1]) {
    const u0 = sx * span;
    const u1 = sx * (span + RAMP_LEN);
    const t = (au: number, ay: number, av: number, bu: number, by: number, bv: number,
               cu: number, cy: number, cv: number) => {
      W(au, ay, av, deck); W(bu, by, bv, deck); W(cu, cy, cv, deck);
    };
    if (sx > 0) {
      t(u0, DECK_Y + 0.55, -half, u1, 0.3, -half, u1, 0.3, half);
      t(u0, DECK_Y + 0.55, -half, u1, 0.3, half, u0, DECK_Y + 0.55, half);
    } else {
      t(u0, DECK_Y + 0.55, half, u1, 0.3, half, u1, 0.3, -half);
      t(u0, DECK_Y + 0.55, half, u1, 0.3, -half, u0, DECK_Y + 0.55, -half);
    }
  }

  // River bridge (round 3): a deep girder, a pier every ~30 m standing in the water on a
  // pointed cutwater footing, pier caps across the deck, parapets with posts and deck lamps.
  box(pier, -span, span, DECK_Y - 2.2, DECK_Y - 0.55, -half + 0.4, half - 0.4);
  const pierCount = Math.max(2, Math.round((span * 2) / 30));
  for (let i = 0; i < pierCount; i++) {
    const pu = -span + ((i + 0.5) / pierCount) * span * 2;
    box(pier, pu - 1.3, pu + 1.3, -1.5, DECK_Y - 2.2, -half * 0.75, half * 0.75);   // wall pier
    box(pier, pu - 1.8, pu + 1.8, -1.5, 1.2, -half * 0.8 - 1, half * 0.8 + 1);     // footing
    for (const sv of [-1, 1]) {                                                   // pointed cutwaters
      const v0 = sv * (half * 0.8 + 1), v1 = sv * (half * 0.8 + 3.2);
      const q = (a: number[], b: number[], c2: number[]) => { W(a[0], a[1], a[2], pier); W(b[0], b[1], b[2], pier); W(c2[0], c2[1], c2[2], pier); };
      for (const y of [-1.5, 1.2]) q([pu - 1.8, y, v0], [pu + 1.8, y, v0], [pu, y, v1]);
      q([pu - 1.8, -1.5, v0], [pu, -1.5, v1], [pu, 1.2, v1]); q([pu - 1.8, -1.5, v0], [pu, 1.2, v1], [pu - 1.8, 1.2, v0]);
      q([pu + 1.8, -1.5, v0], [pu, 1.2, v1], [pu, -1.5, v1]); q([pu + 1.8, -1.5, v0], [pu + 1.8, 1.2, v0], [pu, 1.2, v1]);
    }
    box(pier, pu - 1.6, pu + 1.6, DECK_Y - 2.9, DECK_Y - 2.2, -half - 0.3, half + 0.3);  // cap
  }

  for (const sv of [-1, 1]) {
    const pv = sv * half;
    box(rail, -span, span, DECK_Y + 0.55, DECK_Y + 0.85, pv - 0.3, pv + 0.3);
    box(rail, -span, span, DECK_Y + 1.6, DECK_Y + 1.8, pv - 0.18, pv + 0.18);
    for (let u = -span; u <= span; u += 3) box(rail, u - 0.12, u + 0.12, DECK_Y + 0.85, DECK_Y + 1.6, pv - 0.12, pv + 0.12);
    for (let u = -span + 10; u < span; u += 30) box(rail, u - 0.12, u + 0.12, DECK_Y + 0.55, DECK_Y + 9, pv - 0.12, pv + 0.12);
  }
}

/**
 * Piers and crash barriers that follow the real deck profile.
 *
 * The previous version assumed a flat 6.8 m deck for every elevated feature, so
 * columns marched at a constant height straight through the approach ramps and
 * poked out of the road surface where the deck was still near grade. Heights are
 * now sampled from the profile, and nothing is emitted where the deck has come
 * down far enough to be at grade.
 */
const PIER_SPACING = 32;
const PIER_RADIUS = 1.4;
/** Below this the deck is effectively on the ground; a column there is wrong. */
const MIN_PIER_HEIGHT = 2.2;
/** Must match VIADUCT_DEPTH in ribbon.ts so rail piers stop at the soffit. */
const RAIL_SOFFIT_DROP = 1.7;

function buildElevatedSupports(
  roads: OverlayRoad[],
  profiles: Map<OverlayRoad, Pt[]>,
  piersOut: number[],
  barriersOut: number[],
): void {
  // Round 3: a real flyover cross-section instead of a floating ribbon.
  //   deck      box girder: fascia faces down both edges (1.6 m) and a soffit underneath
  //   barriers  New Jersey parapets with thickness (inner face, top, outer face)
  //   piers     12-sided columns, twin columns under wide decks, tapered pier caps
  //   lamps     a mast with an arm over the carriageway every ~36 m on alternating sides
  const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (const road of roads) {
    if (road.type === 'subway') continue;
    const prof = profiles.get(road);
    if (!prof || prof.length < 2) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    const isRail = cls === 'railway';
    const half = isRail ? 2.6 : roadHalfWidth(cls, road.type, (road as { id?: string }).id);
    const GIRDER = isRail ? RAIL_SOFFIT_DROP : 1.6;

    let carry = 0, lampCarry = 18, lampSide = 1;
    for (let i = 0; i < prof.length - 1; i++) {
      const p1 = prof[i], p2 = prof[i + 1];
      const dx = p2.x - p1.x, dz = p2.z - p1.z, len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const y1 = p1.y ?? 0, y2 = p2.y ?? 0;
      const raised = y1 >= MIN_PIER_HEIGHT || y2 >= MIN_PIER_HEIGHT;

      // Girder fascia and soffit (only where the deck is genuinely above ground).
      if (raised && !isRail) {
        const g1 = Math.max(0.05, y1 - GIRDER), g2 = Math.max(0.05, y2 - GIRDER);
        for (const side of [-1, 1]) {
          const ax = p1.x + nx * (half + 0.15) * side, az = p1.z + nz * (half + 0.15) * side;
          const bx = p2.x + nx * (half + 0.15) * side, bz = p2.z + nz * (half + 0.15) * side;
          quad(piersOut, [ax, g1, az], [bx, g2, bz], [bx, y2 + 0.05, bz], [ax, y1 + 0.05, az]);
        }
        const sw = half * 0.82;
        quad(piersOut, [p1.x - nx * sw, g1, p1.z - nz * sw], [p2.x - nx * sw, g2, p2.z - nz * sw], [p2.x + nx * sw, g2, p2.z + nz * sw], [p1.x + nx * sw, g1, p1.z + nz * sw]);
      }

      for (let d = carry; d < len; d += PIER_SPACING) {
        const t = d / len;
        const deckY = y1 + (y2 - y1) * t;
        const soffit = deckY - (isRail ? RAIL_SOFFIT_DROP : GIRDER);
        if (soffit < MIN_PIER_HEIGHT) continue;
        const cx = p1.x + ux * d, cz = p1.z + uz * d;
        const twin = !isRail && half > 5.5;
        const r = twin ? 0.95 : PIER_RADIUS;
        const offs = twin ? [-half * 0.45, half * 0.45] : [0];
        for (const o of offs) {
          const px = cx + nx * o, pz = cz + nz * o, sides = 12;
          for (let s2 = 0; s2 < sides; s2++) {
            const a1 = (s2 / sides) * Math.PI * 2, a2 = ((s2 + 1) / sides) * Math.PI * 2;
            const x1 = px + Math.cos(a1) * r, z1 = pz + Math.sin(a1) * r, x2 = px + Math.cos(a2) * r, z2 = pz + Math.sin(a2) * r;
            quad(piersOut, [x1, 0, z1], [x2, 0, z2], [x2, soffit - 1.0, z2], [x1, soffit - 1.0, z1]);
          }
        }
        // Tapered pier cap: narrow at the column, full deck width at the soffit.
        const capW = twin ? half * 0.95 : half * 0.75, capB = twin ? half * 0.6 : 1.6, capD = 1.1;
        const C = (w: number, y: number, along: number, side: number): number[] => [cx + nx * w * side + ux * along, y, cz + nz * w * side + uz * along];
        for (const along of [-capD, capD]) quad(piersOut, C(capB, soffit - 1.0, along, -1), C(capB, soffit - 1.0, along, 1), C(capW, soffit, along, 1), C(capW, soffit, along, -1));
        for (const side of [-1, 1]) quad(piersOut, C(capB, soffit - 1.0, -capD, side), C(capB, soffit - 1.0, capD, side), C(capW, soffit, capD, side), C(capW, soffit, -capD, side));
      }
      carry = (carry - len) % PIER_SPACING;
      if (carry < 0) carry += PIER_SPACING;

      if (isRail || !raised) continue;
      // New Jersey parapets with real thickness.
      for (const side of [-1, 1]) {
        const io = half - 0.35, oo = half + 0.15, H = 1.05;
        const I1 = [p1.x + nx * io * side, y1, p1.z + nz * io * side], I2 = [p2.x + nx * io * side, y2, p2.z + nz * io * side];
        const T1 = [p1.x + nx * (io + 0.25) * side, y1 + H, p1.z + nz * (io + 0.25) * side], T2 = [p2.x + nx * (io + 0.25) * side, y2 + H, p2.z + nz * (io + 0.25) * side];
        const U1 = [p1.x + nx * oo * side, y1 + H, p1.z + nz * oo * side], U2 = [p2.x + nx * oo * side, y2 + H, p2.z + nz * oo * side];
        const O1 = [p1.x + nx * oo * side, y1 - 0.2, p1.z + nz * oo * side], O2 = [p2.x + nx * oo * side, y2 - 0.2, p2.z + nz * oo * side];
        quad(barriersOut, I1, I2, T2, T1); quad(barriersOut, T1, T2, U2, U1); quad(barriersOut, U1, U2, O2, O1);
      }
      // Lamp masts on the parapet, alternating sides, arm reaching over the carriageway.
      for (let d = lampCarry; d < len; d += 36) {
        const t = d / len, yy = y1 + (y2 - y1) * t, side = lampSide; lampSide = -lampSide;
        const bx = p1.x + ux * d + nx * (half - 0.1) * side, bz = p1.z + uz * d + nz * (half - 0.1) * side;
        const w = 0.09;
        quad(barriersOut, [bx - ux * w, yy + 1, bz - uz * w], [bx + ux * w, yy + 1, bz + uz * w], [bx + ux * w, yy + 10, bz + uz * w], [bx - ux * w, yy + 10, bz - uz * w]);
        quad(barriersOut, [bx - nx * w, yy + 1, bz - nz * w], [bx + nx * w, yy + 1, bz + nz * w], [bx + nx * w, yy + 10, bz + nz * w], [bx - nx * w, yy + 10, bz - nz * w]);
        const ax = bx - nx * 2.6 * side, az = bz - nz * 2.6 * side;
        quad(barriersOut, [bx, yy + 10, bz], [ax, yy + 10.3, az], [ax, yy + 10.1, az], [bx, yy + 9.8, bz]);
      }
      lampCarry = ((lampCarry - len) % 36 + 36) % 36;
    }
  }
}


/**
 * Medians: Lucknow's dual carriageways are mapped as two one-way roads. Where a major road runs
 * anti-parallel to another of the same class with a gap between their edges of 0.6-14 m, the gap
 * is filled with a raised kerbed median with planting. Matching is per 6 m sample, so medians
 * follow the real geometry and stop where the carriageways merge.
 *
 * Junction markings: where three or more ground-level major roads meet, each approach gets a
 * zebra crossing about 9 m back from the node and a stop line just behind it.
 */
const MEDIAN_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary']);
function buildMediansAndMarkings(roads: OverlayRoad[], kerb: number[], grass: number[], marks: number[]): void {
  type Seg = { r: number; ax: number; az: number; bx: number; bz: number; ux: number; uz: number; len: number; half: number; cls: RoadClass };
  const ground = roads.filter((r) => r?.points?.length >= 2 && !r.isElevated && !((r.level ?? 0) > 0));
  const segs: Seg[] = [];
  const grid = new Map<string, number[]>();
  const G = 40;
  ground.forEach((r, ri) => {
    const cls = classifyRoad(r.type, r.subtype, r.level, r.isElevated);
    if (!MEDIAN_CLASSES.has(cls)) return;
    const half = roadHalfWidth(cls, r.type, (r as { id?: string }).id);
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i], b = r.points[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const k = segs.length;
      segs.push({ r: ri, ax: a.x, az: a.z, bx: b.x, bz: b.z, ux: dx / len, uz: dz / len, len, half, cls });
      const x0 = Math.floor(Math.min(a.x, b.x) / G) - 1, x1 = Math.floor(Math.max(a.x, b.x) / G) + 1;
      const z0 = Math.floor(Math.min(a.z, b.z) / G) - 1, z1 = Math.floor(Math.max(a.z, b.z) / G) + 1;
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx + ',' + gz; let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push(k); }
    }
  });
  const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => { out.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (const sA of segs) {
    let prev: { l: number[]; r: number[] } | null = null;
    for (let d = 0; d <= sA.len; d += 6) {
      const mx = sA.ax + sA.ux * d, mz = sA.az + sA.uz * d;
      let best: { dist: number; px: number; pz: number; half: number } | null = null;
      for (const k of grid.get(Math.floor(mx / G) + ',' + Math.floor(mz / G)) ?? []) {
        const sB = segs[k];
        if (sB.r === sA.r || sB.cls !== sA.cls || sB.r < sA.r) continue;      // each pair once
        if (sA.ux * sB.ux + sA.uz * sB.uz > -0.92) continue;                    // opposite directions
        const t = Math.max(0, Math.min(sB.len, (mx - sB.ax) * sB.ux + (mz - sB.az) * sB.uz));
        if (t <= 0 || t >= sB.len) continue;
        const px = sB.ax + sB.ux * t, pz = sB.az + sB.uz * t, dist = Math.hypot(px - mx, pz - mz);
        const gap = dist - sA.half - sB.half;
        if (gap < 0.6 || gap > 14) continue;
        if (!best || dist < best.dist) best = { dist, px, pz, half: sB.half };
      }
      if (!best) { prev = null; continue; }
      const nx = (best.px - mx) / best.dist, nz = (best.pz - mz) / best.dist;
      const l = [mx + nx * sA.half, 0.3, mz + nz * sA.half];
      const r = [best.px - nx * best.half, 0.3, best.pz - nz * best.half];
      if (prev) {
        const H = 0.32;
        quad(kerb, [prev.l[0], H, prev.l[2]], [l[0], H, l[2]], [r[0], H, r[2]], [prev.r[0], H, prev.r[2]]);
        const inset = (p: number[], q: number[], f: number) => [p[0] + (q[0] - p[0]) * f, H + 0.03, p[2] + (q[2] - p[2]) * f];
        const w = Math.hypot(r[0] - l[0], r[2] - l[2]);
        if (w > 1.6) { const f = 0.45 / w; quad(grass, inset(prev.l, prev.r, f), inset(l, r, f), inset(r, l, f), inset(prev.r, prev.l, f)); }
        // kerb faces
        quad(kerb, [prev.l[0], 0.12, prev.l[2]], [l[0], 0.12, l[2]], [l[0], H, l[2]], [prev.l[0], H, prev.l[2]]);
        quad(kerb, [prev.r[0], 0.12, prev.r[2]], [r[0], 0.12, r[2]], [r[0], H, r[2]], [prev.r[0], H, prev.r[2]]);
      }
      prev = { l, r };
    }
  }

  // Junction nodes: endpoints of ground major roads, quantised to 3 m.
  const node = new Map<string, number>();
  const key = (x: number, z: number) => Math.round(x / 3) + ',' + Math.round(z / 3);
  for (const r of ground) {
    const cls = classifyRoad(r.type, r.subtype, r.level, r.isElevated);
    if (cls === 'railway' || cls === 'footway' || cls === 'service') continue;
    for (const p of [r.points[0], r.points[r.points.length - 1]]) node.set(key(p.x, p.z), (node.get(key(p.x, p.z)) ?? 0) + 1);
  }
  for (const r of ground) {
    const cls = classifyRoad(r.type, r.subtype, r.level, r.isElevated);
    if (!['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(cls)) continue;
    const half = roadHalfWidth(cls, r.type, (r as { id?: string }).id);
    const ends: Array<[number, number]> = [[0, 1], [r.points.length - 1, r.points.length - 2]];
    for (const [i0, i1] of ends) {
      const a = r.points[i0], b = r.points[i1];
      if ((node.get(key(a.x, a.z)) ?? 0) < 3) continue;
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 16) continue;
      const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
      const y = ROAD_LAYER_Y[cls] + 0.12, c0 = 7, c1 = 10.5;
      for (let o = -half + 0.6; o < half - 0.4; o += 1.1) {                        // zebra bars
        const P = (along: number, off: number) => [a.x + ux * along + nx * off, y, a.z + uz * along + nz * off];
        quad(marks, P(c0, o), P(c1, o), P(c1, o + 0.55), P(c0, o + 0.55));
      }
      const S = (along: number, off: number) => [a.x + ux * along + nx * off, y, a.z + uz * along + nz * off];
      quad(marks, S(c1 + 1.2, -half + 0.3), S(c1 + 1.6, -half + 0.3), S(c1 + 1.6, half - 0.3), S(c1 + 1.2, half - 0.3));  // stop line
    }
  }
}

/**
 * Elevated metro stations, snapped onto the real viaduct.
 *
 * Each station is a 130 m island platform deck sitting on the viaduct, a canopy
 * roof 5.6 m above it carried on paired columns, and end walls — the profile a
 * Lucknow Metro elevated station actually has. The deck height is sampled from
 * the viaduct's own elevation profile, so a station is never left floating above
 * or buried inside the structure it serves.
 *
 * An anchor further than ANCHOR_MAX_DIST from the alignment is dropped. Those
 * anchors come from place records that merely mention a station (a shop "near
 * Munshi Pulia Metro Station"), and dragging one several hundred metres onto the
 * line would put a station where there is none.
 */
const STATION_HALF_LEN = 65;
const STATION_HALF_WID = 6.5;
const CANOPY_HALF_WID = 8.5;
const CANOPY_RISE = 5.6;
const ANCHOR_MAX_DIST = 600;

function buildMetroStationsGeom(
  roads: OverlayRoad[],
  profiles: Map<OverlayRoad, Pt[]>,
  deckOut: number[],
  canopyOut: number[],
  columnOut: number[],
): number {
  // Every profiled metro centreline vertex, so a station can find its viaduct.
  const line: Array<{ x: number; z: number; y: number; dx: number; dz: number }> = [];
  for (const road of roads) {
    if (road.type !== 'subway') continue;
    const prof = profiles.get(road);
    if (!prof || prof.length < 2) continue;
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i];
      const b = prof[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      line.push({ x: a.x, z: a.z, y: a.y ?? 0, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len });
    }
  }
  if (line.length === 0) return 0;

  let placed = 0;
  for (const st of METRO_STATIONS) {
    if (st.underground) continue;

    let best = line[0];
    let bestD = Infinity;
    for (const seg of line) {
      const d = Math.hypot(seg.x - st.x, seg.z - st.z);
      if (d < bestD) { bestD = d; best = seg; }
    }
    if (bestD > ANCHOR_MAX_DIST) continue;
    // A station on a ramp would be built level in reality; use the deck height
    // at the snap point and keep the platform flat.
    const y = best.y;
    if (y < 3.0) continue;
    placed++;

    const ca = best.dx;
    const sa = best.dz;
    const W = (out: number[], u: number, yy: number, v: number) => {
      out.push(best.x + u * ca - v * sa, yy, best.z + u * sa + v * ca);
    };
    const slab = (out: number[], hl: number, hw: number, y0: number, y1: number) => {
      const q = (au: number, av: number, bu: number, bv: number,
                 cu: number, cv: number, du: number, dv: number, yy: number) => {
        W(out, au, yy, av); W(out, bu, yy, bv); W(out, cu, yy, cv);
        W(out, au, yy, av); W(out, cu, yy, cv); W(out, du, yy, dv);
      };
      q(-hl, -hw, hl, -hw, hl, hw, -hl, hw, y1);          // top
      q(-hl, hw, hl, hw, hl, -hw, -hl, -hw, y0);          // underside
      for (const s of [-1, 1]) {                           // long sides
        const v = s * hw;
        W(out, -hl, y0, v); W(out, hl, y0, v); W(out, hl, y1, v);
        W(out, -hl, y0, v); W(out, hl, y1, v); W(out, -hl, y1, v);
      }
      for (const s of [-1, 1]) {                           // ends
        const u = s * hl;
        W(out, u, y0, -hw); W(out, u, y0, hw); W(out, u, y1, hw);
        W(out, u, y0, -hw); W(out, u, y1, hw); W(out, u, y1, -hw);
      }
    };

    slab(deckOut, STATION_HALF_LEN, STATION_HALF_WID, y - 0.4, y + 1.1);
    slab(canopyOut, STATION_HALF_LEN + 4, CANOPY_HALF_WID, y + CANOPY_RISE, y + CANOPY_RISE + 0.7);

    // Paired columns down the platform carrying the canopy.
    const bays = 6;
    for (let i = 0; i <= bays; i++) {
      const u = -STATION_HALF_LEN + (i / bays) * STATION_HALF_LEN * 2;
      for (const s of [-1, 1]) {
        const v = s * (STATION_HALF_WID - 1.0);
        const r = 0.32;
        for (const [du, dv] of [[-r, -r], [r, -r], [r, r], [-r, r]] as Array<[number, number]>) {
          const [nu, nv] = [du, dv];
          W(columnOut, u + nu, y + 1.1, v + nv);
          W(columnOut, u - nv, y + 1.1, v + nu);
          W(columnOut, u - nv, y + CANOPY_RISE, v + nu);
          W(columnOut, u + nu, y + 1.1, v + nv);
          W(columnOut, u - nv, y + CANOPY_RISE, v + nu);
          W(columnOut, u + nu, y + CANOPY_RISE, v + nv);
        }
      }
    }
  }
  return placed;
}

function polyArea(p: Array<{ x: number; z: number }>): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].z - p[j].x * p[i].z; }
  return Math.abs(a) / 2;
}

export function buildOverlay(src: OverlaySource): OverlayBuild {
  // Deterministic feature identity: one physical carriageway, one surface. Overture
  // occasionally ships the same polyline twice under different ids; identical
  // quantised endpoints + vertex count + level + class are the same road.
  const seenRoad = new Set<string>();
  const roads = (src.majorRoads ?? []).filter((r) => {
    const p = r?.points;
    if (!p || p.length < 2) return true;
    const a = p[0], b = p[p.length - 1];
    const ka = `${Math.round(a.x)},${Math.round(a.z)}`, kb = `${Math.round(b.x)},${Math.round(b.z)}`;
    const key = `${ka < kb ? ka + '|' + kb : kb + '|' + ka}|${p.length}|${r.level ?? 0}|${r.type}`;
    if (seenRoad.has(key)) return false;
    seenRoad.add(key);
    return true;
  });
  // Sewage lagoons and treatment basins are not open water; they read as false
  // blue patches. Genuine rivers, canals, lakes, reservoirs and ponds remain.
  const NOT_OPEN_WATER = new Set(['wastewater', 'basin']);
  const waterways = (src.waterways ?? []).filter((w) => !(w as { cls?: string }).cls || !NOT_OPEN_WATER.has((w as { cls?: string }).cls!));
  // Tree clearings (data/overrides/tree_clearings.json, mirrored here): a park whose centroid lies in
  // a clearing is open dusty ground in the satellite view, not lawn, so it is not painted green.
  const CLEARINGS = [{ x: -4176, z: -2675, r: 150 }, { x: -4150, z: -2745, r: 120 }];
  const greenAreas = (src.greenAreas ?? []).filter((a) => {
    const p = a?.points; if (!p || p.length < 3) return true;
    const cx = p.reduce((m, q) => m + q.x, 0) / p.length, cz = p.reduce((m, q) => m + q.z, 0) / p.length;
    return !CLEARINGS.some((c) => Math.hypot(cx - c.x, cz - c.z) < c.r);
  });

  // ── Elevation ────────────────────────────────────────────────────────────
  // Real Overture level / isElevated drives a ramp-hold-ramp profile per feature.
  const profiles = buildElevationProfiles(roads);

  // ── Roads ────────────────────────────────────────────────────────────────
  const byClass = new Map<RoadClass, number[]>();
  const uvByClass = new Map<RoadClass, number[]>();
  const railways: OverlayRoad[] = [];
  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    if (cls === 'railway') { railways.push(road); continue; }
    const half = roadHalfWidth(cls, road.type, (road as { id?: string }).id);
    let arr = byClass.get(cls);
    if (!arr) { arr = []; byClass.set(cls, arr); uvByClass.set(cls, []); }
    // A profiled polyline carries per-vertex y, which overrides the class offset.
    // Class Y offset is baked in so the client needs no per-class mesh offset.
    appendRibbon(arr, profiles.get(road) ?? road.points, { half, y: ROAD_LAYER_Y[cls], uvOut: uvByClass.get(cls) });
  }

  // ── Railway ──────────────────────────────────────────────────────────────
  // Ballast, sleepers and rails at the correct gauge, or a box girder on viaduct.
  const railSinks: RailSinks = { bed: [], sleepers: [], rails: [] };
  for (const road of railways) {
    if (road.type === 'subway') continue; // metroSystem.ts owns the metro viaduct and track
    appendRailway(railSinks, profiles.get(road) ?? road.points, {
      gauge: railGaugeFor(road.type),
      elevated: Boolean(road.isElevated) || (road.level ?? 0) > 0,
      baseY: ROAD_LAYER_Y.railway,
      withSleepers: true,
    });
  }

  const roadsOut: Record<string, Float32Array> = {};
  const roadsUv: Record<string, Float32Array> = {};
  for (const [cls, verts] of byClass) {
    if (verts.length) { roadsOut[cls] = new Float32Array(verts); roadsUv[cls] = new Float32Array(uvByClass.get(cls)!); }
  }

  // ── Water ────────────────────────────────────────────────────────────────
  const water: number[] = [];
  const riverBank: number[] = [];
  for (const w of waterways) {
    if (!w?.points || w.points.length < 2) continue;
    if (w.isPolygon && w.points.length >= 3) {
      // Lakes, ponds and reservoirs sit ABOVE the park and ground layers (y 0.04): at -0.25 the
      // surrounding park polygon painted over them, so Janeshwar Mishra Park's two lakes were
      // invisible. Rivers keep the lower level (the ground raster is already cut out for them).
      const still = w.cls === 'pond' || w.cls === 'lake' || w.cls === 'reservoir' || w.cls === 'water';
      triangulateArea(water, w.points, still ? 0.07 : -0.25);
      // Stone-stepped bank along still water over 1 ha (as at Janeshwar Mishra Park).
      if (still && polyArea(w.points) > 1e4) appendRibbon(riverBank, [...w.points, w.points[0]], { half: 1.3, y: 0.11 });
      // Embankment along the real bank line of the river channel (round 2).
      if (w.cls === 'river_poly') appendRibbon(riverBank, [...w.points, w.points[0]], { half: 3.2, y: 0.05 });
    } else {
      // Measured / class width from the hydrology layer; never a fixed broad buffer.
      appendRibbon(water, w.points, { half: Math.max(1.0, (w.width ?? 4) / 2), y: -0.25 });
    }
  }

  // ── Parks ────────────────────────────────────────────────────────────────
  const parks: number[] = [];
  for (const a of greenAreas) {
    if (!a?.points || a.points.length < 3) continue;
    triangulateArea(parks, a.points, 0.04);
  }

  // ── Bridges ──────────────────────────────────────────────────────────────
  const crossings = findCrossings(roads, waterways);
  const deck: number[] = [];
  const pier: number[] = [];
  const rail: number[] = [];
  for (const c of crossings) appendBridge(c, deck, pier, rail);

  // ── Elevated supports ─────────────────────────────────────────────────────
  const flyoverPiers: number[] = [];
  const flyoverBarriers: number[] = [];
  buildElevatedSupports(roads, profiles, flyoverPiers, flyoverBarriers);

  // ── Medians and junction markings (round 3) ─────────────────────────────
  const medianKerb: number[] = [], medianGrass: number[] = [], markings: number[] = [];
  buildMediansAndMarkings(roads, medianKerb, medianGrass, markings);

  // ── Metro stations ────────────────────────────────────────────────────────
  const metroDeck: number[] = [];
  const metroCanopy: number[] = [];
  const metroColumn: number[] = [];
  // Stations are now built by metroSystem.ts on the metro's own viaduct (round 2).
  const stations = 0; void buildMetroStationsGeom;

  // ── Named structures ──────────────────────────────────────────────────────
  // Signature detail along the real centreline of each curated bridge/flyover.
  // Overture splits one physical structure into several LineString features
  // (e.g. Lohia Path Flyover arrives as ~10 pieces), so features sharing a
  // label are chained end-to-end into continuous polylines first — otherwise
  // railing/lamp placement restarts from station 0 at every fragment boundary,
  // producing a duplicated post/rail cluster at each internal seam.
  const structSinks: StructureSinks = { rail: [], lamp: [], truss: [], mass: [] };
  const detailed = new Set<string>();

  const byLabel = new Map<string, { name: string; half: number; prof: Pt[] }[]>();
  for (const road of roads) {
    const prof = profiles.get(road);
    if (!prof || !road.name || prof.length < 2) continue;
    const def = matchStructure(road.name);
    if (!def) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    const half = cls === 'railway' ? 2.6 : roadHalfWidth(cls, road.type, (road as { id?: string }).id);
    const list = byLabel.get(def.label) ?? [];
    list.push({ name: road.name, half, prof });
    byLabel.set(def.label, list);
  }

  const CHAIN_JOIN_TOL = 8; // metres — Overture-split endpoints coincide almost exactly
  for (const [, pieces] of byLabel) {
    const chains = chainPolylines(pieces.map(p => p.prof), CHAIN_JOIN_TOL);
    const totalLen = chains.reduce((sum, c) => sum + polylineLength(c), 0);
    const allowFine = totalLen <= FINE_DETAIL_MAX_TOTAL;
    const half = Math.max(...pieces.map(p => p.half));
    const name = pieces[0].name;
    for (const chain of chains) {
      if (chain.length < 2) continue;
      const kind = buildNamedStructure(name, chain, half, structSinks, allowFine);
      if (kind) detailed.add(matchStructure(name)!.label);
    }
  }

  return {
    roads: roadsOut,
    roadsUv,
    water: new Float32Array(water),
    riverBank: new Float32Array(riverBank),
    parks: new Float32Array(parks),
    bridgeDeck: new Float32Array(deck),
    bridgePier: new Float32Array(pier),
    bridgeRail: new Float32Array(rail),
    flyoverPiers: new Float32Array(flyoverPiers),
    flyoverBarriers: new Float32Array(flyoverBarriers),
    medianKerb: new Float32Array(medianKerb),
    medianGrass: new Float32Array(medianGrass),
    markings: new Float32Array(markings),
    railBed: new Float32Array(railSinks.bed),
    railSleepers: new Float32Array(railSinks.sleepers),
    railRails: new Float32Array(railSinks.rails),
    crossings: crossings.length,
    elevated: profiles.size,
    metroDeck: new Float32Array(metroDeck),
    metroCanopy: new Float32Array(metroCanopy),
    metroColumn: new Float32Array(metroColumn),
    stations,
    structRail: new Float32Array(structSinks.rail),
    structLamp: new Float32Array(structSinks.lamp),
    structTruss: new Float32Array(structSinks.truss),
    structMass: new Float32Array(structSinks.mass),
    namedStructures: detailed.size,
  };
}

