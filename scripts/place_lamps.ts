/**
 * place_lamps.ts: promenade and park-path lamps (round 3).
 *
 * Writes `tile.lod2.parkLamps = [[x, z, angle], ...]` (world metres) into each tile. The tile
 * worker appends them to the ordinary streetlight buffer, so they use the same instanced
 * mast, head and glow draws and the same day/night and layer gating.
 *
 *   LAKESIDE   still-water polygons over 1 ha (pond, lake, reservoir): one lamp every 34 m
 *              on the land side of the shore, so Janeshwar Mishra Park's lake edges read
 *              at night.
 *   RIVERFRONT the Gomti channel polygons: one lamp every 42 m, 9 m outside the bank.
 *   PARK PATHS footways, paths and pedestrian ways inside parks over 1.5 ha: one lamp
 *              every 38 m.
 *
 * Lamps are rejected inside water, on or beside a carriageway (road lamps cover those), in
 * landmark precincts (they have their own lighting) and on the airfield.
 *
 * Usage: npx tsx scripts/place_lamps.ts   (after `npm run vegetation`, before `npm run bake`)
 */
import fs from 'fs';
import path from 'path';
import { isLandmarkSite } from '../src/city/landmarkSites';
import { classifyRoad, ROAD_HALF_WIDTH, type RoadClass } from '../src/city/ribbon';
import { AreaIndex, CorridorIndex, pointInRing, ringArea, type Pt } from './lib/spatialIndex';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const TILE = 500;
const STILL = new Set(['pond', 'lake', 'reservoir', 'water']);
const PATH_TYPES = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);

function main(): void {
  const overview = JSON.parse(fs.readFileSync(path.join(TILES_DIR, 'overview.json'), 'utf8'));

  const roadMask = new CorridorIndex();
  for (const r of overview.majorRoads as Array<Record<string, unknown>>) {
    const pts = r.points as Pt[];
    if (!pts || pts.length < 2) continue;
    const cls = classifyRoad(r.type as string, r.subtype as string, r.level as number, r.isElevated as boolean) as RoadClass;
    const half = (ROAD_HALF_WIDTH[cls] ?? 4) + 4;
    for (let i = 0; i < pts.length - 1; i++) roadMask.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
  }
  const water = new AreaIndex();
  for (const w of overview.waterways as Array<{ points: Pt[]; isPolygon?: boolean }>) {
    if (w.isPolygon && w.points?.length >= 3) water.add(w.points);
  }
  const parks = (overview.greenAreas as Array<{ points: Pt[] }>).filter((g) => g.points?.length >= 3 && ringArea(g.points) > 15000);
  const parkIndex = new AreaIndex();
  for (const g of parks) parkIndex.add(g.points);

  const lamps = new Map<string, number[][]>();
  let nLake = 0, nRiver = 0, nPath = 0;
  const put = (x: number, z: number, ang: number, kind: 'lake' | 'river' | 'path'): void => {
    if (isLandmarkSite(x, z) || water.hits(x, z) || roadMask.hits(x, z, 0)) return;
    const key = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
    let a = lamps.get(key);
    if (!a) lamps.set(key, (a = []));
    a.push([+x.toFixed(1), +z.toFixed(1), +ang.toFixed(3)]);
    if (kind === 'lake') nLake++; else if (kind === 'river') nRiver++; else nPath++;
  };

  // Shorelines: walk each ring, offset to whichever side is land.
  for (const w of overview.waterways as Array<{ points: Pt[]; isPolygon?: boolean; cls?: string }>) {
    if (!w.isPolygon || !w.points || w.points.length < 3) continue;
    const still = STILL.has(w.cls ?? '') && ringArea(w.points) > 1e4;
    const river = w.cls === 'river_poly';
    if (!still && !river) continue;
    const gap = still ? 34 : 60, off = still ? 5 : 9;
    const ring = w.points;
    let carry = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const nx = -dz / len, nz = dx / len, ang = Math.atan2(dz, dx);
      for (let d = carry; d < len; d += gap) {
        const bx = a.x + (dx / len) * d, bz = a.z + (dz / len) * d;
        for (const sgn of [1, -1]) {
          const px = bx + nx * off * sgn, pz = bz + nz * off * sgn;
          if (!pointInRing(px, pz, ring)) { put(px, pz, ang, still ? 'lake' : 'river'); break; }
        }
      }
      carry = ((carry - len) % gap + gap) % gap;
    }
  }

  // Park paths, from each tile's own footways.
  for (const name of fs.readdirSync(TILES_DIR)) {
    const m = /^tile_(-?\d+)_(-?\d+)\.json$/.exec(name);
    if (!m) continue;
    const tile = JSON.parse(fs.readFileSync(path.join(TILES_DIR, name), 'utf8'));
    for (const r of (tile.lod2?.roads ?? []) as Array<{ type?: string; points?: Pt[]; isElevated?: boolean }>) {
      if (!r.points || r.points.length < 2 || r.isElevated || !PATH_TYPES.has(r.type ?? '')) continue;
      let carry = 0;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len < 1e-3) continue;
        const nx = -dz / len, nz = dx / len, ang = Math.atan2(dz, dx);
        for (let d = carry; d < len; d += 38) {
          const px = a.x + (dx / len) * d + nx * 1.6, pz = a.z + (dz / len) * d + nz * 1.6;
          if (parkIndex.hits(px, pz)) put(px, pz, ang, 'path');
        }
        carry = ((carry - len) % 38 + 38) % 38;
      }
    }
  }

  // Write per tile (clear the field everywhere first so reruns are idempotent).
  let written = 0;
  for (const name of fs.readdirSync(TILES_DIR)) {
    const m = /^tile_(-?\d+)_(-?\d+)\.json$/.exec(name);
    if (!m) continue;
    const full = path.join(TILES_DIR, name);
    const list = lamps.get(`${m[1]}_${m[2]}`);
    const tile = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!list && !tile.lod2?.parkLamps) continue;
    if (!tile.lod2) continue;
    if (list) tile.lod2.parkLamps = list; else delete tile.lod2.parkLamps;
    fs.writeFileSync(full, JSON.stringify(tile));
    if (list) written++;
  }
  console.log(`Park lamps: lakeside ${nLake}, riverfront ${nRiver}, park paths ${nPath}; ${written} tiles written`);
}

main();
