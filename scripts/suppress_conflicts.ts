/**
 * suppress_conflicts.ts — removes buildings that stand inside infrastructure.
 *
 * Overture building footprints and Overture transportation are independently
 * digitised, so they overlap: footprints sit in carriageways, across railway
 * yards, and inside the Gomti. Rendered literally this puts blocks of flats in
 * the middle of Shaheed Path and in the river.
 *
 * This runs offline over the tiles, so there is no runtime cost and no mask
 * resolution to trade off — the test is the real footprint against the real
 * corridor. The HLOD bake reads the same tiles, so both representations agree
 * automatically.
 *
 * CONSERVATIVE BY DESIGN. A building is only dropped when the conflict is
 * genuinely supported by geometry:
 *
 *   - its centroid lies inside the corridor, AND
 *   - the corridor is one the building physically cannot occupy.
 *
 * Testing the centroid rather than any-overlap is the whole point: buildings
 * legitimately abut roads, and their footprints often clip a few metres into a
 * generous corridor estimate. Only a building whose middle is in the roadway is
 * actually in the roadway. Road corridors are additionally NOT buffered beyond
 * the carriageway half-width for the same reason.
 *
 * Water and runways are polygons and are tested exactly, with no buffer at all:
 * the riverbank keeps its buildings.
 *
 * Usage: npm run suppress   (after `npm run transport`, before `npm run bake`)
 */

import fs from 'fs';
import path from 'path';
import { classifyRoad, ROAD_HALF_WIDTH, type RoadClass } from '../src/city/ribbon';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const TILE_SIZE = 500;
/** Spatial hash cell, metres. */
const CELL = 250;

interface Pt { x: number; z: number }

interface Corridor {
  ax: number; az: number; bx: number; bz: number;
  /** Half-width of the exclusion, metres. */
  half: number;
}

function writeFileRetry(file: string, data: string, attempts = 5): void {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(file, data); return; } catch (err) {
      if (i >= attempts - 1) throw err;
      const until = Date.now() + 60 * (i + 1);
      while (Date.now() < until) { /* backoff */ }
    }
  }
}

function centroid(ring: Pt[]): Pt {
  // Area-weighted centroid; falls back to vertex mean for degenerate rings.
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    a += f;
    cx += (ring[j].x + ring[i].x) * f;
    cz += (ring[j].z + ring[i].z) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of ring) { sx += p.x; sz += p.z; }
    return { x: sx / ring.length, z: sz / ring.length };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

function pointInRing(px: number, pz: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > pz) !== (b.z > pz) &&
        px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function segDist2(px: number, pz: number, c: Corridor): number {
  const dx = c.bx - c.ax, dz = c.bz - c.az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - c.ax) * dx + (pz - c.az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = c.ax + t * dx, qz = c.az + t * dz;
  return (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
}

/** Uniform grid over corridor segments. */
class CorridorIndex {
  private cells = new Map<string, Corridor[]>();
  public count = 0;

  add(c: Corridor): void {
    this.count++;
    const x0 = Math.floor(Math.min(c.ax, c.bx) / CELL);
    const x1 = Math.floor(Math.max(c.ax, c.bx) / CELL);
    const z0 = Math.floor(Math.min(c.az, c.bz) / CELL);
    const z1 = Math.floor(Math.max(c.az, c.bz) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        let b = this.cells.get(k);
        if (!b) { b = []; this.cells.set(k, b); }
        b.push(c);
      }
    }
  }

  hits(px: number, pz: number): boolean {
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const b = this.cells.get(`${gx + dx},${gz + dz}`);
        if (!b) continue;
        for (const c of b) if (segDist2(px, pz, c) < c.half * c.half) return true;
      }
    }
    return false;
  }
}

/** Polygon areas (water, runways) indexed by bounding box. */
class AreaIndex {
  private cells = new Map<string, Array<{ ring: Pt[] }>>();
  public count = 0;

  add(ring: Pt[]): void {
    if (ring.length < 3) return;
    this.count++;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const p of ring) {
      if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
      if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z;
    }
    const entry = { ring };
    for (let gx = Math.floor(mnx / CELL); gx <= Math.floor(mxx / CELL); gx++) {
      for (let gz = Math.floor(mnz / CELL); gz <= Math.floor(mxz / CELL); gz++) {
        const k = `${gx},${gz}`;
        let b = this.cells.get(k);
        if (!b) { b = []; this.cells.set(k, b); }
        b.push(entry);
      }
    }
  }

  hits(px: number, pz: number): boolean {
    const b = this.cells.get(`${Math.floor(px / CELL)},${Math.floor(pz / CELL)}`);
    if (!b) return false;
    for (const e of b) if (pointInRing(px, pz, e.ring)) return true;
    return false;
  }
}

const DRY = process.argv.includes('--dry');

function main(): void {
  const overview = JSON.parse(
    fs.readFileSync(path.join(TILES_DIR, 'overview.json'), 'utf8'),
  );

  // ── Road and rail corridors ───────────────────────────────────────────────
  // Elevated features are skipped: a flyover passes OVER the city, so the
  // buildings beneath it are real and must stay.
  const roadIdx = new CorridorIndex();
  const railIdx = new CorridorIndex();
  for (const r of overview.majorRoads as Array<Record<string, unknown>>) {
    const pts = r.points as Pt[];
    if (!pts || pts.length < 2) continue;
    if (r.isElevated) continue;
    const cls = classifyRoad(
      r.type as string, r.subtype as string, r.level as number, r.isElevated as boolean,
    ) as RoadClass;
    const isRail = cls === 'railway';
    // No buffer beyond the carriageway. A generous buffer is what deletes the
    // shopfronts that legitimately line an arterial.
    const half = isRail ? ROAD_HALF_WIDTH.railway * 1.6 : ROAD_HALF_WIDTH[cls];
    const idx = isRail ? railIdx : roadIdx;
    for (let i = 0; i < pts.length - 1; i++) {
      idx.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
    }
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  // Polygons exactly; linear watercourses get their own channel half-width,
  // which is the drain/nala case.
  const waterAreas = new AreaIndex();
  const waterLines = new CorridorIndex();
  for (const w of overview.waterways as Array<Record<string, unknown>>) {
    const pts = w.points as Pt[];
    if (!pts || pts.length < 2) continue;
    if (w.isPolygon && pts.length >= 3) {
      waterAreas.add(pts);
    } else {
      const half = Math.min(90, Math.max(10, ((w.width as number) ?? 35) / 2));
      for (let i = 0; i < pts.length - 1; i++) {
        waterLines.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
      }
    }
  }

  console.log(`Corridors: road ${roadIdx.count}, rail ${railIdx.count}, ` +
              `water lines ${waterLines.count}, water areas ${waterAreas.count}`);

  // ── Airport ───────────────────────────────────────────────────────────────
  // CCS Amausi's movement area. Runway 09/27 and its parallel taxiway are the
  // only surfaces here a building categorically cannot stand on. Derived from
  // the airport landmark position rather than invented: the registry already
  // suppresses bulk geometry over the airfield, and this keeps the two aligned.
  const airport = { x: -9988, z: 9769 };
  const runwayHalfLen = 1370;   // 2,744 m runway
  const runwayHalfWid = 30;
  const runwayBearing = 1.487;  // 09/27, near due east-west in world XZ
  const rIdx = new CorridorIndex();
  {
    const ca = Math.cos(runwayBearing), sa = Math.sin(runwayBearing);
    const ax = airport.x - ca * runwayHalfLen, az = airport.z - sa * runwayHalfLen;
    const bx = airport.x + ca * runwayHalfLen, bz = airport.z + sa * runwayHalfLen;
    rIdx.add({ ax, az, bx, bz, half: runwayHalfWid });
    // Parallel taxiway, offset to the north side.
    const ox = -sa * 180, oz = ca * 180;
    rIdx.add({ ax: ax + ox, az: az + oz, bx: bx + ox, bz: bz + oz, half: 20 });
  }

  // ── Pass over the tiles ───────────────────────────────────────────────────
  const files = fs.readdirSync(TILES_DIR).filter((n) => n.startsWith('tile_') && n.endsWith('.json'));
  const stat = { total: 0, road: 0, rail: 0, water: 0, runway: 0, kept: 0 };
  let done = 0;

  for (const name of files) {
    const full = path.join(TILES_DIR, name);
    const tile = JSON.parse(fs.readFileSync(full, 'utf8'));
    const lod2: Array<{ points: Pt[]; id: string }> = tile.lod2?.buildings ?? [];
    if (lod2.length === 0) { done++; continue; }

    const dropped = new Set<string>();
    const keep2 = [];
    for (const b of lod2) {
      stat.total++;
      if (!b.points || b.points.length < 3) { keep2.push(b); stat.kept++; continue; }
      const c = centroid(b.points);
      let why = '';
      if (waterAreas.hits(c.x, c.z) || waterLines.hits(c.x, c.z)) why = 'water';
      else if (rIdx.hits(c.x, c.z)) why = 'runway';
      else if (railIdx.hits(c.x, c.z)) why = 'rail';
      else if (roadIdx.hits(c.x, c.z)) why = 'road';

      if (why) {
        dropped.add(b.id);
        (stat as unknown as Record<string, number>)[why]++;
      } else {
        keep2.push(b);
        stat.kept++;
      }
    }

    if (dropped.size > 0 && !DRY) {
      tile.lod2.buildings = keep2;
      if (tile.lod1?.buildings) {
        tile.lod1.buildings = tile.lod1.buildings.filter(
          (b: { id: string }) => !dropped.has(b.id),
        );
        if (tile.counts) tile.counts.bldgsLOD1 = tile.lod1.buildings.length;
      }
      if (tile.counts) tile.counts.bldgsLOD2 = keep2.length;
      writeFileRetry(full, JSON.stringify(tile));
    }

    done++;
    if (done % 1500 === 0) console.log(`  ${done}/${files.length}`);
  }

  const removed = stat.total - stat.kept;
  console.log(`\nBuildings ${stat.total} -> ${stat.kept} (${removed} removed, ` +
              `${((removed / stat.total) * 100).toFixed(2)}%)`);
  console.log(`  in water   ${stat.water}`);
  console.log(`  on rail    ${stat.rail}`);
  console.log(`  in roadway ${stat.road}`);
  console.log(`  on airfield ${stat.runway}`);
  console.log('\nNext: npm run bake');
}

main();
