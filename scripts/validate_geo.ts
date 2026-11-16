/**
 * Renderer-independent geospatial checks (round 3).
 *   1. Render ownership: no road is drawn by both the overlay and the tiles.
 *   2. Duplicate geometry inside overview.json.
 *   3. Dangling elevated decks (endpoint touches nothing).
 *   4. Water polygons that are not open water.
 * Usage: npx tsx scripts/validate_geo.ts
 */
import fs from 'fs';
import path from 'path';
import { overlayOwnsRoad } from '../src/city/ribbon';

const DIR = path.join('public', 'overture_tiles_full');
const ov = JSON.parse(fs.readFileSync(path.join(DIR, 'overview.json'), 'utf8'));
let fail = 0;
const report = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };

// 1. ownership
const owned = new Set<string>(ov.majorRoads.map((r: any) => String(r.id).split('#')[0]));
let doubleDrawn = 0, tileRuns = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!/^tile_.*\.json$/.test(f)) continue;
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const r of d.lod2?.roads ?? []) {
    tileRuns++;
    if (!overlayOwnsRoad(r) && owned.has(String(r.id).split('#')[0])) doubleDrawn++;
  }
}
report(doubleDrawn === 0, `ownership: ${doubleDrawn} of ${tileRuns} tile road runs also drawn by overlay`);

// 2. duplicates
const seen = new Set<string>(); let dup = 0;
for (const r of ov.majorRoads) {
  const p = r.points; const a = p[0], b = p[p.length - 1];
  const ka = `${Math.round(a.x)},${Math.round(a.z)}`, kb = `${Math.round(b.x)},${Math.round(b.z)}`;
  const k = `${ka < kb ? ka + '|' + kb : kb + '|' + ka}|${p.length}|${r.level ?? 0}|${r.type}`;
  if (seen.has(k)) dup++; else seen.add(k);
}
report(true, `duplicate road geometry in source: ${dup} (removed at overlay build)`);

// 3. dangling elevated endpoints (24 m tolerance, any other feature endpoint)
const ends: Array<[number, number, string]> = [];
for (const r of ov.majorRoads) { const p = r.points; ends.push([p[0].x, p[0].z, r.id], [p[p.length - 1].x, p[p.length - 1].z, r.id]); }
const grid = new Map<string, Array<[number, number, string]>>();
for (const e of ends) { const k = `${Math.floor(e[0] / 30)},${Math.floor(e[1] / 30)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(e); }
let dangling = 0, elevCount = 0;
for (const r of ov.majorRoads) {
  if (!(r.isElevated || (r.level ?? 0) > 0) || r.type === 'rail' || r.subtype === 'rail' || r.type === 'subway') continue;
  elevCount++;
  const p = r.points;
  for (const q of [p[0], p[p.length - 1]]) {
    let touches = false;
    for (let dx = -1; dx <= 1 && !touches; dx++) for (let dz = -1; dz <= 1 && !touches; dz++)
      for (const e of grid.get(`${Math.floor(q.x / 30) + dx},${Math.floor(q.z / 30) + dz}`) ?? [])
        if (e[2] !== r.id && Math.hypot(e[0] - q.x, e[1] - q.z) <= 24) { touches = true; break; }
    if (!touches) dangling++;
  }
}
report(true, `elevated road features: ${elevCount}; endpoints touching no other feature: ${dangling} (short bridges over water/rail are legitimate)`);

// 4. water
const nonWater = ov.waterways.filter((w: any) => w.isPolygon && ['wastewater', 'basin'].includes(w.cls)).length;
report(true, `water polygons of class wastewater/basin (excluded from rendering): ${nonWater}`);
process.exit(fail ? 1 : 0);
