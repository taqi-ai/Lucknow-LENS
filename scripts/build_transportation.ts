/**
 * build_transportation.ts — the real transportation pipeline.
 *
 * PROVENANCE. This is the script that was missing. `overview.json` previously
 * carried level/isElevated/rail data that no committed script could reproduce:
 * it had been produced out-of-band, and `data/overture_transportation.geojsonseq`
 * is a 133-byte unfetched Git LFS pointer. That made the transportation layer
 * unreproducible — re-running `generate_overture_tiles.ts` would have silently
 * thrown the real data away.
 *
 * The authoritative source is now `data/lucknow_transportation_extracted.json`
 * (34 MB, 133,757 features, 553,384 coordinates), a flat array of:
 *
 *   { id, subtype: 'road'|'rail', class, name, level, isElevated, coords: [[lon,lat],…] }
 *
 * This script is deliberately transportation-only. Buildings cannot be
 * regenerated — `overture_buildings.geojsonseq` is also an unfetched LFS pointer
 * — so the 6,940 existing tiles are *patched in place*: their roads are replaced
 * from real data and every other stream (buildings, places, water, land use) is
 * preserved byte-for-byte.
 *
 * What it fixes beyond reproducibility:
 *
 *  1. Extent. The raw extract spans 79.96–82.07 E / 26.26–27.85 N — roughly
 *     200 km, because Overture returns whole road features that merely touch the
 *     query box. The Kanpur–Lucknow Expressway alone reached x = -98 km against a
 *     city extent of ±20 km. Features are now clipped to the tile bounds, so the
 *     overlay stops sizing shadow frusta and bounding spheres against Kanpur.
 *
 *  2. Tile assignment. The old generator filed a whole road under the tile
 *     containing its *first point* (`getTile(points[0]…)`), so a 6 km road existed
 *     only in one 500 m tile and vanished everywhere else at street LOD. Features
 *     are now split across tiles by exact grid traversal.
 *
 *  3. Identity. Road ids were `road-${Math.random()}`, which changes on every run
 *     and cannot be joined against anything. Real Overture UUIDs are kept.
 *
 * Usage: npm run transport   (then `npm run bake` to rebuild the binaries)
 */

import fs from 'fs';
import path from 'path';
import { classifyRoad, ROAD_HALF_WIDTH, type RoadClass } from '../src/city/ribbon';

const DATA_FILE = path.join(process.cwd(), 'data/lucknow_transportation_extracted.json');
const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');

const TILE_SIZE = 500;

/**
 * Must stay identical to generate_overture_tiles.ts, or the roads land offset
 * from the buildings they run between.
 */
const CENTER_LAT = 26.84997035;
const CENTER_LON = 80.95005255000001;
const M_PER_LAT = 111320;
const M_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

interface RawFeature {
  id: string;
  subtype: string;
  class: string;
  name?: string;
  level?: number;
  isElevated?: boolean;
  coords: [number, number][];
}

interface Pt { x: number; z: number }

interface RoadOut {
  id: string;
  name?: string;
  points: Pt[];
  width: number;
  type: string;
  subtype: string;
  level: number;
  isElevated: boolean;
  isMajor: boolean;
}

/**
 * Windows hands back a transient EBUSY/UNKNOWN when an indexer or scanner has a
 * file open, which is easy to hit while rewriting 6,940 of them back to back.
 * The write itself is idempotent, so a short retry is the whole fix.
 */
function writeFileRetry(file: string, data: string, attempts = 5): void {
  for (let i = 0; ; i++) {
    try {
      fs.writeFileSync(file, data);
      return;
    } catch (err) {
      if (i >= attempts - 1) throw err;
      const until = Date.now() + 60 * (i + 1);
      while (Date.now() < until) { /* brief synchronous backoff */ }
    }
  }
}

function project(lon: number, lat: number): Pt {
  return {
    x: (lon - CENTER_LON) * M_PER_LON,
    z: -(lat - CENTER_LAT) * M_PER_LAT,
  };
}

/**
 * Carriageway width in metres. The class floor in ROAD_HALF_WIDTH is what
 * actually drives ribbon width downstream; this stays consistent with it so a
 * road never renders narrower than its class implies.
 */
function widthFor(cls: RoadClass, subtype: string): number {
  if (subtype === 'rail') return ROAD_HALF_WIDTH.railway * 2;
  return ROAD_HALF_WIDTH[cls] * 2;
}

/**
 * Resolve whether a feature is *really* an elevated structure.
 *
 * This guard exists because the extract's elevation flags cannot be trusted at
 * feature granularity, and taking them literally puts 986 km of Lucknow — the
 * entire mainline rail network included — up in the air on 29,000 columns.
 *
 * Two distinct populations are mixed together in the source:
 *
 *  A. `isElevated` with `level === 0` — 567 features, mean 79 m, longest 1,341 m.
 *     This is OSM `bridge=yes` surviving into the extract: one tag, one discrete
 *     structure. The length *is* the structure's length, so it is trustworthy.
 *
 *  B. `level > 0` — 811 features, mean 1,160 m, longest 27,659 m. Overture carries
 *     `level` as a *linearly referenced* attribute: the value applies to a
 *     `between: [start, end]` fraction of the geometry, not the whole feature.
 *     The extractor flattened it and dropped the range, so a 27 km rail line on
 *     which 200 m crosses a bridge is now wholly "level 1". The three longest
 *     such features are the Varanasi–Sultanpur–Lucknow, Lucknow–Gorakhpur and
 *     Lucknow–Moradabad lines, which are at grade on embankment in reality.
 *
 * Recovering the true ranges would need the Overture parquet, which is not in
 * the repository. So group B is accepted only where the whole feature is short
 * enough that the lost range cannot hide much — a 400 m line flagged level 1 is
 * a flyover span either way.
 *
 * Metro is the deliberate exception: Lucknow Metro really is a continuous
 * multi-kilometre viaduct, and the 11 `subway` features total 46.7 km, which is
 * the Red Line's ~23 km counted once per track. Length-capping it would be wrong.
 *
 * Result: 925 structures, 135.9 km (89.2 km road, 46.7 km metro) — the shape of
 * a real city's grade separation rather than a flag-propagation artefact.
 */
const BRIDGE_TAG_MAX_LEN = 1500;
const LEVEL_RANGE_MAX_LEN = 400;

function resolveElevation(f: RawFeature, lengthM: number): { elevated: boolean; level: number } {
  const rawLevel = f.level ?? 0;
  const rawElevated = Boolean(f.isElevated) || rawLevel > 0;
  if (!rawElevated) return { elevated: false, level: 0 };

  // Metro viaducts are genuinely continuous; no length cap applies.
  if (f.class === 'subway') return { elevated: true, level: Math.max(1, rawLevel) };

  if (rawLevel === 0) {
    // Group A — a real per-structure bridge tag.
    return lengthM <= BRIDGE_TAG_MAX_LEN
      ? { elevated: true, level: 1 }
      : { elevated: false, level: 0 };
  }

  // Group B — linear reference lost; only trust short features.
  return lengthM <= LEVEL_RANGE_MAX_LEN
    ? { elevated: true, level: rawLevel }
    : { elevated: false, level: 0 };
}

function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return total;
}

/** A feature belongs in overview.json / LOD 1 if it reads at district altitude. */
function isMajorFeature(f: RawFeature, elevated: boolean): boolean {
  if (f.subtype === 'rail') return true;
  if (elevated) return true;
  return ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(f.class);
}

// ── Clipping ────────────────────────────────────────────────────────────────

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

function inside(p: Pt, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

/**
 * Clip a polyline to a rectangle, returning every contiguous run that survives.
 * A road leaving and re-entering the box yields several runs rather than being
 * bridged by a false straight line across the gap.
 */
function clipPolyline(points: Pt[], r: Rect): Pt[][] {
  const runs: Pt[][] = [];
  let cur: Pt[] = [];

  const intersectAt = (a: Pt, b: Pt): Pt | null => {
    // Liang–Barsky against the rect; returns the entry point closest to `a`.
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const clip = (p: number, q: number): boolean => {
      if (Math.abs(p) < 1e-12) return q >= 0;
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (!clip(-dx, a.x - r.minX)) return null;
    if (!clip(dx, r.maxX - a.x)) return null;
    if (!clip(-dz, a.z - r.minZ)) return null;
    if (!clip(dz, r.maxZ - a.z)) return null;
    return { x: a.x + t0 * dx, z: a.z + t0 * dz };
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (inside(p, r)) {
      if (cur.length === 0 && i > 0) {
        // Entering: recover the crossing point so the run starts at the border.
        const hit = intersectAt(points[i - 1], p);
        if (hit) cur.push(hit);
      }
      cur.push(p);
    } else if (cur.length > 0) {
      // Leaving: extend to the border, then close the run.
      const hit = intersectAt(p, points[i - 1]);
      if (hit) cur.push(hit);
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/**
 * Split a polyline into per-tile runs by exact grid traversal.
 *
 * Every point where the line crosses a tile boundary is computed parametrically
 * and inserted into both neighbouring runs, so ribbons meet exactly at the seam
 * instead of leaving a notch. Long straight segments spanning many tiles are
 * handled — the old code assigned the whole road to one tile.
 */
function splitByTile(points: Pt[]): Map<string, Pt[][]> {
  const out = new Map<string, Pt[][]>();
  const tileOf = (p: Pt) => `${Math.floor(p.x / TILE_SIZE)}_${Math.floor(p.z / TILE_SIZE)}`;

  let curKey = tileOf(points[0]);
  let cur: Pt[] = [points[0]];

  const flush = () => {
    if (cur.length >= 2) {
      let arr = out.get(curKey);
      if (!arr) { arr = []; out.set(curKey, arr); }
      arr.push(cur);
    }
  };

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    // Parametric t of every vertical / horizontal grid line crossed.
    const ts: number[] = [];
    const addCrossings = (a0: number, d: number) => {
      if (Math.abs(d) < 1e-12) return;
      const from = a0 / TILE_SIZE;
      const to = (a0 + d) / TILE_SIZE;
      const lo = Math.floor(Math.min(from, to)) + 1;
      const hi = Math.ceil(Math.max(from, to)) - 1;
      for (let k = lo; k <= hi; k++) {
        const t = (k * TILE_SIZE - a0) / d;
        if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
      }
    };
    addCrossings(a.x, dx);
    addCrossings(a.z, dz);
    ts.sort((m, n) => m - n);

    for (const t of ts) {
      const hit = { x: a.x + t * dx, z: a.z + t * dz };
      cur.push(hit);
      flush();
      // Nudge past the boundary to identify the tile actually being entered.
      const probe = { x: a.x + (t + 1e-6) * dx, z: a.z + (t + 1e-6) * dz };
      curKey = tileOf(probe);
      cur = [hit];
    }
    cur.push(b);
  }
  flush();
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing ${DATA_FILE}`);
    process.exit(1);
  }
  const manifestPath = path.join(TILES_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const b = manifest.bounds;

  // City extent in world metres, from the same bounds the tiles were cut against.
  const nw = project(b.minLon, b.maxLat);
  const se = project(b.maxLon, b.minLat);
  const extent: Rect = { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z };
  console.log(
    `City extent  x ${extent.minX.toFixed(0)}..${extent.maxX.toFixed(0)}  ` +
    `z ${extent.minZ.toFixed(0)}..${extent.maxZ.toFixed(0)} m`,
  );

  console.log('Reading transportation extract...');
  const t0 = Date.now();
  const raw: RawFeature[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ${raw.length} features in ${Date.now() - t0}ms`);

  const overviewRoads: RoadOut[] = [];
  /** tileKey -> roads clipped to that tile */
  const perTile = new Map<string, RoadOut[]>();

  const stats = {
    kept: 0, clippedOut: 0, elevated: 0, rail: 0, major: 0, runs: 0,
    /** Flagged elevated in the source but rejected by resolveElevation. */
    elevationRejected: 0,
    byClass: {} as Record<string, number>,
  };

  for (const f of raw) {
    if (!f.coords || f.coords.length < 2) continue;

    const projected = f.coords.map((c) => project(c[0], c[1]));

    // Decided once here, on the uncut feature. Doing it downstream would mean the
    // city overlay and the 500 m tiles measured different lengths for the same
    // structure and disagreed about whether it is in the air.
    const { elevated: isElevated, level } = resolveElevation(f, polylineLength(projected));
    if ((f.isElevated || (f.level ?? 0) > 0) && !isElevated) stats.elevationRejected++;

    const cls = classifyRoad(f.class, f.subtype, level, isElevated);
    const width = widthFor(cls, f.subtype);
    const major = isMajorFeature(f, isElevated);

    const runs = clipPolyline(projected, extent);
    if (runs.length === 0) { stats.clippedOut++; continue; }

    stats.kept++;
    if (isElevated) stats.elevated++;
    if (f.subtype === 'rail') stats.rail++;
    if (major) stats.major++;
    stats.byClass[cls] = (stats.byClass[cls] ?? 0) + 1;

    for (let ri = 0; ri < runs.length; ri++) {
      const run = runs[ri];
      stats.runs++;
      // Runs of the same source feature keep the source id but stay distinct.
      const runId = runs.length > 1 ? `${f.id}#${ri}` : f.id;

      const base: Omit<RoadOut, 'points'> = {
        id: runId,
        // Omitted rather than null: 130k `"name":null` keys is ~1.7 MB of tiles.
        ...(f.name ? { name: f.name } : {}),
        width,
        type: f.class,
        subtype: f.subtype,
        level,
        isElevated,
        isMajor: major,
      };

      if (major) overviewRoads.push({ ...base, points: run });

      for (const [tileKey, chains] of splitByTile(run)) {
        let arr = perTile.get(tileKey);
        if (!arr) { arr = []; perTile.set(tileKey, arr); }
        for (let ci = 0; ci < chains.length; ci++) {
          arr.push({
            ...base,
            id: chains.length > 1 ? `${runId}@${ci}` : runId,
            points: chains[ci],
          });
        }
      }
    }
  }

  console.log(
    `\nKept ${stats.kept} features (${stats.clippedOut} entirely outside the city), ` +
    `${stats.runs} runs after clipping`,
  );
  console.log(
    `  elevated ${stats.elevated} (${stats.elevationRejected} flagged but rejected as ` +
    `flag-propagation)   rail ${stats.rail}   major ${stats.major}`,
  );
  console.log(`  by class ${JSON.stringify(stats.byClass)}`);

  // ── overview.json ─────────────────────────────────────────────────────────
  const overviewPath = path.join(TILES_DIR, 'overview.json');
  const overview = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));
  const prevRoads = overview.majorRoads?.length ?? 0;
  overview.majorRoads = overviewRoads;
  writeFileRetry(overviewPath, JSON.stringify(overview));
  console.log(`\noverview.json  majorRoads ${prevRoads} -> ${overviewRoads.length}`);

  // ── Tiles ─────────────────────────────────────────────────────────────────
  // Roads are replaced; buildings / places / water / land use are untouched.
  const files = fs.readdirSync(TILES_DIR).filter((n) => n.startsWith('tile_') && n.endsWith('.json'));
  console.log(`Patching ${files.length} tiles...`);

  let patched = 0;
  let totalRoads = 0;
  for (const name of files) {
    const key = name.slice(5, -5); // tile_<x>_<z>.json
    const roads = perTile.get(key) ?? [];
    const full = path.join(TILES_DIR, name);
    const tile = JSON.parse(fs.readFileSync(full, 'utf8'));

    tile.lod2.roads = roads;
    tile.lod1.roads = roads.filter((r) => r.isMajor);
    if (tile.counts) tile.counts.roadsCount = roads.length;

    writeFileRetry(full, JSON.stringify(tile));
    totalRoads += roads.length;
    patched++;
    if (patched % 1500 === 0) console.log(`  ${patched}/${files.length}`);
  }

  // Tiles that gained roads but have no file on disk would be silently lost;
  // report rather than fabricate tiles with no buildings in them.
  const orphans = [...perTile.keys()].filter((k) => !files.includes(`tile_${k}.json`));
  if (orphans.length) {
    const orphanRoads = orphans.reduce((n, k) => n + (perTile.get(k)?.length ?? 0), 0);
    console.log(`  note: ${orphanRoads} road runs fall in ${orphans.length} tiles with no existing tile file`);
  }

  console.log(`\nDone. ${patched} tiles patched, ${totalRoads} road runs written.`);
  console.log('Next: npm run bake');
}

main();
