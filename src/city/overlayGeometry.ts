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
  ROAD_HALF_WIDTH, ROAD_LAYER_Y, type Pt, type RailSinks, type RoadClass,
} from './ribbon';
import { triangulate } from './buildingGeometry';

export interface OverlayRoad {
  id?: string;
  points: Pt[];
  width?: number;
  type?: string;
  subtype?: string;
  level?: number;
  isElevated?: boolean;
}
export interface OverlayWater { id?: string; points: Pt[]; width?: number; isPolygon?: boolean }
export interface OverlayArea { id?: string; points: Pt[] }

export interface OverlaySource {
  majorRoads?: OverlayRoad[];
  waterways?: OverlayWater[];
  greenAreas?: OverlayArea[];
}

export interface OverlayBuild {
  /** Road ribbon positions keyed by class. */
  roads: Record<string, Float32Array>;
  water: Float32Array;
  parks: Float32Array;
  bridgeDeck: Float32Array;
  bridgePier: Float32Array;
  bridgeRail: Float32Array;
  flyoverPiers: Float32Array;
  flyoverBarriers: Float32Array;
  /** Ballast prism at grade / box girder on viaduct. */
  railBed: Float32Array;
  /** Concrete sleepers — street-level detail. */
  railSleepers: Float32Array;
  /** Running rails. */
  railRails: Float32Array;
  crossings: number;
  /** Features that received a real elevation profile. */
  elevated: number;
}

export const ROAD_CLASS_ORDER: RoadClass[] = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'railway', 'flyover'
];

const BRIDGEABLE = new Set<RoadClass>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'railway', 'flyover']);
const DECK_Y = 7.5;
const RAMP_LEN = 90;
/** Spatial hash cell for the crossing search, metres. */
const GRID = 500;

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
    const half = Math.max(18, (w.width ?? 45) / 2);
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
    const half = Math.max(ROAD_HALF_WIDTH[cls], (road.width ?? 0) / 2);

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

  const pierCount = span > 90 ? 4 : 2;
  for (let i = 0; i < pierCount; i++) {
    const tt = (i + 0.5) / pierCount;
    const pu = -span + tt * span * 2;
    for (const sv of [-1, 1]) {
      const pv = sv * half * 0.62;
      box(pier, pu - 1.6, pu + 1.6, -0.6, DECK_Y - 0.5, pv - 2.2, pv + 2.2);
    }
  }

  for (const sv of [-1, 1]) {
    const pv = sv * half;
    box(rail, -span, span, DECK_Y + 0.55, DECK_Y + 1.85, pv - 0.25, pv + 0.25);
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
  for (const road of roads) {
    const prof = profiles.get(road);
    if (!prof || prof.length < 2) continue;

    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    const isRail = cls === 'railway';
    const half = isRail ? 2.6 : Math.max(ROAD_HALF_WIDTH[cls], (road.width ?? 0) / 2);

    let carry = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      const p1 = prof[i];
      const p2 = prof[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;

      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;
      const nz = ux;
      const y1 = p1.y ?? 0;
      const y2 = p2.y ?? 0;

      for (let d = carry; d < len; d += PIER_SPACING) {
        const t = d / len;
        const deckY = y1 + (y2 - y1) * t;
        const soffit = deckY - (isRail ? RAIL_SOFFIT_DROP : 0.9);
        if (soffit < MIN_PIER_HEIGHT) continue;

        const cx = p1.x + ux * d;
        const cz = p1.z + uz * d;

        const sides = 8;
        for (let s = 0; s < sides; s++) {
          const a1 = (s / sides) * Math.PI * 2;
          const a2 = ((s + 1) / sides) * Math.PI * 2;
          const x1 = cx + Math.cos(a1) * PIER_RADIUS;
          const z1 = cz + Math.sin(a1) * PIER_RADIUS;
          const x2 = cx + Math.cos(a2) * PIER_RADIUS;
          const z2 = cz + Math.sin(a2) * PIER_RADIUS;
          piersOut.push(
            x1, 0, z1, x2, 0, z2, x2, soffit, z2,
            x1, 0, z1, x2, soffit, z2, x1, soffit, z1,
          );
        }

        // Crosshead spreading the deck load across the column.
        const beamW = half * 1.4;
        const bx1 = cx - nx * (beamW / 2);
        const bz1 = cz - nz * (beamW / 2);
        const bx2 = cx + nx * (beamW / 2);
        const bz2 = cz + nz * (beamW / 2);
        piersOut.push(
          bx1, soffit - 0.6, bz1, bx2, soffit - 0.6, bz2, bx2, soffit, bz2,
          bx1, soffit - 0.6, bz1, bx2, soffit, bz2, bx1, soffit, bz1,
        );
      }
      carry = (carry - len) % PIER_SPACING;
      if (carry < 0) carry += PIER_SPACING;

      // Crash barriers. Rail viaducts already carry parapets from appendRailway.
      if (isRail) continue;
      if (y1 < MIN_PIER_HEIGHT && y2 < MIN_PIER_HEIGHT) continue;
      for (const side of [-1, 1]) {
        const o1x = p1.x + nx * half * side;
        const o1z = p1.z + nz * half * side;
        const o2x = p2.x + nx * half * side;
        const o2z = p2.z + nz * half * side;
        barriersOut.push(
          o1x, y1, o1z, o2x, y2, o2z, o2x, y2 + 1.1, o2z,
          o1x, y1, o1z, o2x, y2 + 1.1, o2z, o1x, y1 + 1.1, o1z,
        );
      }
    }
  }
}

export function buildOverlay(src: OverlaySource): OverlayBuild {
  const roads = src.majorRoads ?? [];
  const waterways = src.waterways ?? [];
  const greenAreas = src.greenAreas ?? [];

  // ── Elevation ────────────────────────────────────────────────────────────
  // Real Overture level / isElevated drives a ramp-hold-ramp profile per feature.
  const profiles = buildElevationProfiles(roads);

  // ── Roads ────────────────────────────────────────────────────────────────
  const byClass = new Map<RoadClass, number[]>();
  const railways: OverlayRoad[] = [];
  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    if (cls === 'railway') { railways.push(road); continue; }
    const half = Math.max(ROAD_HALF_WIDTH[cls], (road.width ?? 0) / 2);
    let arr = byClass.get(cls);
    if (!arr) { arr = []; byClass.set(cls, arr); }
    // A profiled polyline carries per-vertex y, which overrides the class offset.
    // Class Y offset is baked in so the client needs no per-class mesh offset.
    appendRibbon(arr, profiles.get(road) ?? road.points, { half, y: ROAD_LAYER_Y[cls] });
  }

  // ── Railway ──────────────────────────────────────────────────────────────
  // Ballast, sleepers and rails at the correct gauge, or a box girder on viaduct.
  const railSinks: RailSinks = { bed: [], sleepers: [], rails: [] };
  for (const road of railways) {
    appendRailway(railSinks, profiles.get(road) ?? road.points, {
      gauge: railGaugeFor(road.type),
      elevated: Boolean(road.isElevated) || (road.level ?? 0) > 0,
      baseY: ROAD_LAYER_Y.railway,
      withSleepers: true,
    });
  }

  const roadsOut: Record<string, Float32Array> = {};
  for (const [cls, verts] of byClass) {
    if (verts.length) roadsOut[cls] = new Float32Array(verts);
  }

  // ── Water ────────────────────────────────────────────────────────────────
  const water: number[] = [];
  for (const w of waterways) {
    if (!w?.points || w.points.length < 2) continue;
    if (w.isPolygon && w.points.length >= 3) {
      triangulateArea(water, w.points, -0.25);
    } else {
      appendRibbon(water, w.points, { half: Math.min(90, Math.max(14, (w.width ?? 45) / 2)), y: -0.25 });
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

  return {
    roads: roadsOut,
    water: new Float32Array(water),
    parks: new Float32Array(parks),
    bridgeDeck: new Float32Array(deck),
    bridgePier: new Float32Array(pier),
    bridgeRail: new Float32Array(rail),
    flyoverPiers: new Float32Array(flyoverPiers),
    flyoverBarriers: new Float32Array(flyoverBarriers),
    railBed: new Float32Array(railSinks.bed),
    railSleepers: new Float32Array(railSinks.sleepers),
    railRails: new Float32Array(railSinks.rails),
    crossings: crossings.length,
    elevated: profiles.size,
  };
}

