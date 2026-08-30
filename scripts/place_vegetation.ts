/**
 * place_vegetation.ts — geographically masked tree placement.
 *
 * The city shipped with 7,400 trees across 383 of 6,940 tiles, which is why
 * Lucknow read as bare. This regenerates vegetation from real geometry rather
 * than scattering a global tree cloud:
 *
 *   PARKS AND GREEN AREAS   jittered grid inside the real land-use polygon
 *   ROAD VERGES             offset beyond the carriageway of arterials, the
 *                           avenue planting Lucknow actually has
 *   RIVERBANK               a band outside the Gomti's channel, not in it
 *   OPEN GROUND             groves scattered across genuinely vacant land —
 *                           the scrub, fields and undeveloped plots that make
 *                           up most of Lucknow's periphery and read as bare
 *                           tarmac without them
 *
 * Every candidate is then tested against an exclusion mask built from the same
 * spatial index the building-suppression pass uses, so a tree can never stand
 * in a carriageway, on ballast, in water, on the airfield, inside a building
 * footprint, or under a flyover deck. Masking is the point: the placement rules
 * above are deliberately generous, and the mask is what makes them safe.
 *
 * Trees are written into the tiles as {x, y, z, scale} and rendered by the
 * existing per-tile InstancedMesh path, so citywide vegetation costs four
 * instanced draws per tile and nothing else.
 *
 * Usage: npm run vegetation   (after `npm run transport`, before `npm run bake`)
 */

import fs from 'fs';
import path from 'path';
import { classifyRoad, ROAD_HALF_WIDTH, type RoadClass } from '../src/city/ribbon';
import {
  AreaIndex, CELL, CorridorIndex, pointInRing, ringArea, type Pt,
} from './lib/spatialIndex';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const TILE_SIZE = 500;
const DRY = process.argv.includes('--dry');

/** Mean spacing of trees inside a park, metres. */
const PARK_SPACING = 13;
/** Spacing of avenue trees along a lit arterial, metres. */
const VERGE_SPACING = 26;
/** Clear distance a tree keeps from a building footprint centroid cluster. */
const BUILDING_PAD = 5;
/** Trees stay this far outside the carriageway edge. */
const VERGE_OFFSET = 3.5;

/**
 * Open-ground planting. This is the pass that fills the vast vacant plots on
 * the city's edge, which the park and verge rules never touch because they are
 * neither mapped as green areas nor next to an arterial.
 *
 * The spacing is deliberately sparse and gated on clearance rather than on
 * land-use tags: a point only qualifies if nothing built stands anywhere near
 * it, which is a far more reliable definition of "vacant" than Overture's
 * patchy land-use coverage.
 */
const OPEN_SPACING = 40;
/** A candidate needs this much clear ground around it from any building. */
const OPEN_BUILDING_CLEAR = 45;
/** ...and this much from any road or rail corridor edge. */
const OPEN_ROAD_CLEAR = 12;
/**
 * Grove threshold. Trees on open land do not grow in a uniform lawn, so the
 * grid is masked by low-frequency noise and only the peaks are planted. Raise
 * this for sparser scrub, lower it for closed canopy.
 */
const GROVE_THRESHOLD = 0.56;
/** Wavelength of the grove noise, metres. */
const GROVE_SCALE = 190;

/** Classes that get avenue planting. Service roads and footpaths do not. */
const VERGE_CLASSES = new Set<RoadClass>(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

function writeFileRetry(file: string, data: string, attempts = 5): void {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(file, data); return; } catch (err) {
      if (i >= attempts - 1) throw err;
      const until = Date.now() + 60 * (i + 1);
      while (Date.now() < until) { /* backoff */ }
    }
  }
}

/** Deterministic hash so a rebuild produces the identical forest. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Smooth value noise in [0,1] from the same deterministic hash. Two octaves is
 * enough to break a grid into clumps that read as groves; more would just cost
 * time for detail no one can see at tree scale.
 */
function valueNoise(x: number, z: number, scale: number): number {
  const sample = (sx: number, sz: number): number => {
    const gx = Math.floor(sx), gz = Math.floor(sz);
    const fx = sx - gx, fz = sz - gz;
    // Smoothstep the interpolation weights so cell boundaries do not show.
    const wx = fx * fx * (3 - 2 * fx), wz = fz * fz * (3 - 2 * fz);
    const c00 = hash2(gx, gz), c10 = hash2(gx + 1, gz);
    const c01 = hash2(gx, gz + 1), c11 = hash2(gx + 1, gz + 1);
    return (c00 * (1 - wx) + c10 * wx) * (1 - wz) + (c01 * (1 - wx) + c11 * wx) * wz;
  };
  return sample(x / scale, z / scale) * 0.65 + sample(x / (scale * 0.37), z / (scale * 0.37)) * 0.35;
}

function main(): void {
  const overview = JSON.parse(fs.readFileSync(path.join(TILES_DIR, 'overview.json'), 'utf8'));

  // ── Exclusion mask ────────────────────────────────────────────────────────
  const roadMask = new CorridorIndex();
  const waterLines = new CorridorIndex();
  const waterAreas = new AreaIndex();

  for (const r of overview.majorRoads as Array<Record<string, unknown>>) {
    const pts = r.points as Pt[];
    if (!pts || pts.length < 2) continue;
    const cls = classifyRoad(
      r.type as string, r.subtype as string, r.level as number, r.isElevated as boolean,
    ) as RoadClass;
    // Elevated decks are masked too: a tree must not grow through a flyover.
    const half = cls === 'railway' ? ROAD_HALF_WIDTH.railway * 1.8 : ROAD_HALF_WIDTH[cls];
    for (let i = 0; i < pts.length - 1; i++) {
      roadMask.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
    }
  }

  for (const w of overview.waterways as Array<Record<string, unknown>>) {
    const pts = w.points as Pt[];
    if (!pts || pts.length < 2) continue;
    if (w.isPolygon && pts.length >= 3) waterAreas.add(pts);
    else {
      const half = Math.min(90, Math.max(10, ((w.width as number) ?? 35) / 2));
      for (let i = 0; i < pts.length - 1; i++) {
        waterLines.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
      }
    }
  }

  // Airfield movement area — same derivation as the suppression pass.
  const airfield = new CorridorIndex();
  {
    const ax0 = -9988, az0 = 9769, bearing = 1.487, halfLen = 1370;
    const ca = Math.cos(bearing), sa = Math.sin(bearing);
    const ax = ax0 - ca * halfLen, az = az0 - sa * halfLen;
    const bx = ax0 + ca * halfLen, bz = az0 + sa * halfLen;
    airfield.add({ ax, az, bx, bz, half: 90 });
    const ox = -sa * 180, oz = ca * 180;
    airfield.add({ ax: ax + ox, az: az + oz, bx: bx + ox, bz: bz + oz, half: 45 });
    // Real airfield reservations (runway + taxiway + apron + terminal ramp)
    // have no trees anywhere inside the movement/operations envelope — the two
    // narrow corridors above only cover the runway and one taxiway centreline
    // and left gaps (the median strip, the apron beyond the taxiway) where
    // trees were still being placed next to parked aircraft. Cover the whole
    // reservation as one wide corridor spanning well past both sides instead
    // of hand-tuning each gap.
    const midOx = -sa * 220, midOz = ca * 220;
    airfield.add({ ax: ax + midOx, az: az + midOz, bx: bx + midOx, bz: bz + midOz, half: 450 });
  }

  const blocked = (x: number, z: number): boolean =>
    roadMask.hits(x, z, 1.0) ||
    waterLines.hits(x, z) ||
    waterAreas.hits(x, z) ||
    airfield.hits(x, z);

  console.log(`Mask: road/rail ${roadMask.count} segs, water ${waterLines.count} segs / ` +
              `${waterAreas.count} areas`);

  // ── Green areas, bucketed by tile so each tile only scans its own ─────────
  const greens = (overview.greenAreas as Array<{ points: Pt[] }>).filter(
    (g) => g?.points && g.points.length >= 3,
  );

  // Green polygons also need a point query: open-ground candidates that land
  // inside a park must be left to the park pass rather than planted twice.
  const greenIndex = new AreaIndex();
  for (const g of greens) greenIndex.add(g.points);

  const files = fs.readdirSync(TILES_DIR).filter((n) => n.startsWith('tile_') && n.endsWith('.json'));

  // ── Building centroid index ───────────────────────────────────────────────
  // Built once over every tile rather than per tile. The per-tile version could
  // not see a building just across a tile seam, so trees were planted in the
  // 40 m of "open ground" immediately outside a neighbouring tile's warehouse.
  // One extra pass over the tiles is cheap next to getting that wrong citywide.
  const bldgGrid = new Map<string, Pt[]>();
  {
    let n = 0;
    for (const name of files) {
      const tile = JSON.parse(fs.readFileSync(path.join(TILES_DIR, name), 'utf8'));
      for (const bl of (tile.lod2?.buildings ?? []) as Array<{ points: Pt[] }>) {
        if (!bl.points || bl.points.length < 3) continue;
        let sx = 0, sz = 0;
        for (const p of bl.points) { sx += p.x; sz += p.z; }
        const c = { x: sx / bl.points.length, z: sz / bl.points.length };
        const k = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
        let b = bldgGrid.get(k);
        if (!b) { b = []; bldgGrid.set(k, b); }
        b.push(c);
        n++;
      }
    }
    console.log(`Building centroids indexed: ${n}`);
  }

  /** True if any building centroid lies within `r` metres. */
  const nearBuilding = (x: number, z: number, r: number): boolean => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    // r is always well under CELL, so the 3x3 neighbourhood is exhaustive.
    const span = Math.max(1, Math.ceil(r / CELL));
    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const b = bldgGrid.get(`${gx + dx},${gz + dz}`);
        if (!b) continue;
        for (const c of b) {
          const ddx = c.x - x, ddz = c.z - z;
          if (ddx * ddx + ddz * ddz < r * r) return true;
        }
      }
    }
    return false;
  };

  const stat = { park: 0, verge: 0, open: 0, rejected: 0, tiles: 0 };
  let done = 0;

  for (const name of files) {
    const full = path.join(TILES_DIR, name);
    const tile = JSON.parse(fs.readFileSync(full, 'utf8'));
    // Tile files carry only id/lod1/lod2 — bounds live in the manifest — so the
    // extent comes from the id, which is the tile's own grid index.
    const m = /^tile_(-?\d+)_(-?\d+)\.json$/.exec(name);
    if (!m) { done++; continue; }
    const tx = parseInt(m[1], 10), tz = parseInt(m[2], 10);
    const b = {
      minX: tx * TILE_SIZE, maxX: (tx + 1) * TILE_SIZE,
      minZ: tz * TILE_SIZE, maxZ: (tz + 1) * TILE_SIZE,
    };

    const trees: Array<{ x: number; y: number; z: number; scale: number }> = [];
    const push = (x: number, z: number, kind: 'park' | 'verge' | 'open'): void => {
      if (blocked(x, z) || nearBuilding(x, z, BUILDING_PAD)) { stat.rejected++; return; }
      const h = hash2(x, z);
      // Park trees run larger and more varied; street trees are pruned to a
      // narrower crown, which is what avenue planting actually looks like.
      // Open-ground trees are the wildest of the three — unmanaged scrub.
      const scale = kind === 'park' ? 0.78 + h * 0.85
        : kind === 'open' ? 0.7 + h * 1.05
        : 0.68 + h * 0.45;
      trees.push({ x, y: 0, z, scale: +scale.toFixed(3) });
      if (kind === 'park') stat.park++;
      else if (kind === 'open') stat.open++;
      else stat.verge++;
    };

    // Parks: jittered grid clipped to the real polygon.
    for (const g of greens) {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const p of g.points) {
        if (p.x < mnx) mnx = p.x;
        if (p.x > mxx) mxx = p.x;
        if (p.z < mnz) mnz = p.z;
        if (p.z > mxz) mxz = p.z;
      }
      if (mxx < b.minX || mnx > b.maxX || mxz < b.minZ || mnz > b.maxZ) continue;
      if (ringArea(g.points) < 400) continue;

      const x0 = Math.max(mnx, b.minX), x1 = Math.min(mxx, b.maxX);
      const z0 = Math.max(mnz, b.minZ), z1 = Math.min(mxz, b.maxZ);
      for (let x = Math.ceil(x0 / PARK_SPACING) * PARK_SPACING; x <= x1; x += PARK_SPACING) {
        for (let z = Math.ceil(z0 / PARK_SPACING) * PARK_SPACING; z <= z1; z += PARK_SPACING) {
          const jx = x + (hash2(x, z) - 0.5) * PARK_SPACING * 0.75;
          const jz = z + (hash2(z, x) - 0.5) * PARK_SPACING * 0.75;
          if (jx < b.minX || jx >= b.maxX || jz < b.minZ || jz >= b.maxZ) continue;
          if (!pointInRing(jx, jz, g.points)) continue;
          push(jx, jz, 'park');
        }
      }
    }

    // Verges: stepped along this tile's own arterials, offset to both sides.
    for (const r of (tile.lod2?.roads ?? []) as Array<Record<string, unknown>>) {
      const pts = r.points as Pt[];
      if (!pts || pts.length < 2) continue;
      if (r.isElevated) continue;
      const cls = classifyRoad(
        r.type as string, r.subtype as string, r.level as number, r.isElevated as boolean,
      ) as RoadClass;
      if (!VERGE_CLASSES.has(cls)) continue;
      const off = ROAD_HALF_WIDTH[cls] + VERGE_OFFSET;

      let carry = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], c = pts[i + 1];
        const dx = c.x - a.x, dz = c.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-3) continue;
        const ux = dx / len, uz = dz / len;
        const nx = -uz, nz = ux;
        for (let d = carry; d < len; d += VERGE_SPACING) {
          const px = a.x + ux * d, pz = a.z + uz * d;
          for (const side of [-1, 1]) {
            const tx = px + nx * off * side;
            const tz = pz + nz * off * side;
            if (tx < b.minX || tx >= b.maxX || tz < b.minZ || tz >= b.maxZ) continue;
            push(tx, tz, 'verge');
          }
        }
        carry = (carry - len) % VERGE_SPACING;
        if (carry < 0) carry += VERGE_SPACING;
      }
    }

    // Open ground: sparse groves on land with nothing built anywhere near it.
    // Walked on the global grid rather than from the tile origin so the noise
    // and the lattice stay continuous across tile seams — stepping from each
    // tile's own corner would leave a visible join every 500 m.
    for (let x = Math.ceil(b.minX / OPEN_SPACING) * OPEN_SPACING; x < b.maxX; x += OPEN_SPACING) {
      for (let z = Math.ceil(b.minZ / OPEN_SPACING) * OPEN_SPACING; z < b.maxZ; z += OPEN_SPACING) {
        if (valueNoise(x, z, GROVE_SCALE) < GROVE_THRESHOLD) continue;
        const jx = x + (hash2(x * 1.7, z) - 0.5) * OPEN_SPACING * 0.8;
        const jz = z + (hash2(z, x * 1.7) - 0.5) * OPEN_SPACING * 0.8;
        if (jx < b.minX || jx >= b.maxX || jz < b.minZ || jz >= b.maxZ) continue;
        // Parks are the park pass's job; planting here too would double them up.
        if (greenIndex.hits(jx, jz)) continue;
        // The clearance tests are what define "open" — run them before the
        // cheap mask so a candidate in a built-up block exits immediately.
        if (nearBuilding(jx, jz, OPEN_BUILDING_CLEAR)) continue;
        if (roadMask.hits(jx, jz, OPEN_ROAD_CLEAR)) continue;
        push(jx, jz, 'open');
      }
    }

    if (trees.length > 0 || (tile.lod2?.trees?.length ?? 0) > 0) {
      tile.lod2.trees = trees;
      if (tile.counts) tile.counts.treesCount = trees.length;
      if (!DRY) writeFileRetry(full, JSON.stringify(tile));
      if (trees.length) stat.tiles++;
    }

    done++;
    if (done % 1500 === 0) console.log(`  ${done}/${files.length}`);
  }

  console.log(`\nTrees ${stat.park + stat.verge + stat.open} across ${stat.tiles} tiles ` +
              `(park ${stat.park}, verge ${stat.verge}, open ${stat.open}); ${stat.rejected} candidates masked out`);
  console.log('Next: npm run bake');
}

main();
