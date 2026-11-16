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
import { isLandmarkSite, PRECINCTS, AIRPORT } from '../src/city/landmarkSites';
import { pointInRing as pir } from './lib/spatialIndex';
const AMB = (PRECINCTS.ambedkar ?? []).map(([x, z]) => ({ x, z }));
const AIR = (AIRPORT.boundary ?? []).map(([x, z]) => ({ x, z }));
/** Inside the airfield or the Ambedkar memorial (both get bespoke landscaping). */
function inAirport(x: number, z: number): boolean {
  return (AIR.length > 3 && pir(x, z, AIR)) || (AMB.length > 3 && pir(x, z, AMB));
}
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

function writeFileRetry(file: string, data: string, attempts = 40): void {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(file, data); return; } catch (err) {
      if (i >= attempts - 1) throw err;
      const until = Date.now() + Math.min(2000, 100 * (i + 1));
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

// Surface classes from scripts/py/build_ground.py (ESA WorldCover + Overture land use).
const GROUND_META = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/ground/ground_meta.json'), 'utf8'));
const GROUND_CLS = fs.readFileSync(path.join(process.cwd(), 'data/derived/ground_class.u8'));
function groundClass(x: number, z: number): number {
  const i = Math.floor((x - GROUND_META.originX) / GROUND_META.cell);
  const j = Math.floor((z - GROUND_META.originZ) / GROUND_META.cell);
  if (i < 0 || j < 0 || i >= GROUND_META.size || j >= GROUND_META.size) return 255;
  return GROUND_CLS[j * GROUND_META.size + i];
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
      const half = Math.max(1, ((w.width as number) ?? 4) / 2);
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

  // Local streets: majorRoads omits residential/service/footway classes, and the
  // yard/orchard passes plant inside built-up land, so every tile's own road ribbons go
  // into the mask too (carriageway + 1 m).
  {
    let n = 0;
    for (const name of fs.readdirSync(TILES_DIR)) {
      if (!name.startsWith('tile_') || !name.endsWith('.json')) continue;
      const tile = JSON.parse(fs.readFileSync(path.join(TILES_DIR, name), 'utf8'));
      for (const r of (tile.lod2?.roads ?? []) as Array<Record<string, unknown>>) {
        const pts = r.points as Pt[];
        if (!pts || pts.length < 2) continue;
        const cls = classifyRoad(r.type as string, r.subtype as string, r.level as number, r.isElevated as boolean) as RoadClass;
        const half = (cls === 'railway' ? ROAD_HALF_WIDTH.railway * 1.8 : ROAD_HALF_WIDTH[cls]) + 1.0;
        for (let i = 0; i < pts.length - 1; i++) {
          roadMask.add({ ax: pts[i].x, az: pts[i].z, bx: pts[i + 1].x, bz: pts[i + 1].z, half });
          n++;
        }
      }
    }
    console.log(`Local street segments masked: ${n}`);
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

  // Designed parks (data/overrides/park_styles.json): open lawns, groves, palm lines on lakes.
  interface ParkStyle { id: string; anchor: [number, number]; grove: { noiseScale: number; threshold: number; density: number; lawnDensity: number }; palmLine: { spacing: number; offset: number; keep: number } }
  const styleFile = path.join(process.cwd(), 'data/overrides/park_styles.json');
  const styles: ParkStyle[] = fs.existsSync(styleFile) ? JSON.parse(fs.readFileSync(styleFile, 'utf8')).parks ?? [] : [];
  const styledGreens = new Map<{ points: Pt[] }, ParkStyle>();
  const palmPts: Array<{ x: number; z: number }> = [];
  for (const st of styles) {
    const park = greens.find((g) => pointInRing(st.anchor[0], st.anchor[1], g.points));
    if (!park) { console.log(`park style ${st.id}: no park polygon contains the anchor, skipped`); continue; }
    styledGreens.set(park, st);
    // Lakes inside this park: a palm line just inland of the shoreline.
    let nLake = 0;
    for (const w of overview.waterways as Array<{ points: Pt[]; isPolygon?: boolean; cls?: string }>) {
      if (!w.isPolygon || !w.points || w.points.length < 3 || !['pond', 'lake', 'reservoir', 'water'].includes(w.cls ?? '')) continue;
      const c = w.points.reduce((a, q) => ({ x: a.x + q.x / w.points.length, z: a.z + q.z / w.points.length }), { x: 0, z: 0 });
      if (!pointInRing(c.x, c.z, park.points)) continue;
      nLake++;
      const ring = w.points;
      let carry = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c2 = ring[(i + 1) % ring.length];
        const dx = c2.x - a.x, dz = c2.z - a.z, len = Math.hypot(dx, dz);
        if (len < 1e-3) continue;
        const nx = -dz / len, nz = dx / len;
        for (let d = carry; d < len; d += st.palmLine.spacing) {
          const bx = a.x + (dx / len) * d, bz = a.z + (dz / len) * d;
          // Offset to whichever side is land.
          for (const sgn of [1, -1]) {
            const px = bx + nx * st.palmLine.offset * sgn, pz = bz + nz * st.palmLine.offset * sgn;
            if (!pointInRing(px, pz, ring) && hash2(px, pz) < st.palmLine.keep) { palmPts.push({ x: px, z: pz }); break; }
          }
        }
        carry = ((carry - len) % st.palmLine.spacing + st.palmLine.spacing) % st.palmLine.spacing;
      }
    }
    console.log(`park style ${st.id}: ${nLake} lakes, ${palmPts.length} palm candidates`);
  }

  const files = fs.readdirSync(TILES_DIR).filter((n) => n.startsWith('tile_') && n.endsWith('.json'));

  // ── Building centroid index ───────────────────────────────────────────────
  // Built once over every tile rather than per tile. The per-tile version could
  // not see a building just across a tile seam, so trees were planted in the
  // 40 m of "open ground" immediately outside a neighbouring tile's warehouse.
  // One extra pass over the tiles is cheap next to getting that wrong citywide.
  const bldgGrid = new Map<string, Pt[]>();
  // Footprint containment on a fine 20 m grid. The centroid test alone let trees stand
  // inside (on the roof of) any building wider than ~10 m.
  const FP = 20;
  const fpGrid = new Map<number, Array<{ ring: Pt[]; mnx: number; mxx: number; mnz: number; mxz: number }>>();
  const fpKey = (gx: number, gz: number) => (gx + 5000) * 10000 + (gz + 5000);
  const addFootprint = (ring: Pt[]) => {
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const p of ring) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z; }
    const e = { ring, mnx: mnx - 1.5, mxx: mxx + 1.5, mnz: mnz - 1.5, mxz: mxz + 1.5 };
    for (let gx = Math.floor(e.mnx / FP); gx <= Math.floor(e.mxx / FP); gx++) {
      for (let gz = Math.floor(e.mnz / FP); gz <= Math.floor(e.mxz / FP); gz++) {
        const k = fpKey(gx, gz); let b = fpGrid.get(k); if (!b) { b = []; fpGrid.set(k, b); } b.push(e);
      }
    }
  };
  /** Inside a footprint, or within 1.5 m of its bounding box edge for small ones. */
  const onBuilding = (x: number, z: number): boolean => {
    const b = fpGrid.get(fpKey(Math.floor(x / FP), Math.floor(z / FP)));
    if (!b) return false;
    for (const e of b) {
      if (x < e.mnx || x > e.mxx || z < e.mnz || z > e.mxz) continue;
      if (pointInRing(x, z, e.ring)) return true;
      if (e.mxx - e.mnx < 14 && e.mxz - e.mnz < 14) return true; // small hut: whole padded box
    }
    return false;
  };
  {
    let n = 0;
    for (const name of files) {
      const tile = JSON.parse(fs.readFileSync(path.join(TILES_DIR, name), 'utf8'));
      for (const bl of (tile.lod2?.buildings ?? []) as Array<{ points: Pt[] }>) {
        if (!bl.points || bl.points.length < 3) continue;
        addFootprint(bl.points);
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

  const stat = { park: 0, verge: 0, open: 0, yard: 0, orchard: 0, palm: 0, rejected: 0, tiles: 0 };
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

    const trees: Array<{ x: number; y: number; z: number; scale: number; k: number }> = [];
    const KIND = { park: 0, verge: 1, open: 2, yard: 3, orchard: 4, palm: 5 } as const;
    const push = (x: number, z: number, kind: 'park' | 'verge' | 'open' | 'yard' | 'orchard' | 'palm'): void => {
      // Landmark precincts get their own formal planting (src/city/landmarks.ts).
      if (isLandmarkSite(x, z) || inAirport(x, z)) { stat.rejected++; return; }
      if (blocked(x, z) || onBuilding(x, z) || (kind !== 'yard' && nearBuilding(x, z, BUILDING_PAD))) { stat.rejected++; return; }
      const h = hash2(x, z);
      // Park trees run larger and more varied; street trees are pruned to a
      // narrower crown, which is what avenue planting actually looks like.
      // Open-ground trees are the wildest of the three — unmanaged scrub.
      const scale = kind === 'palm' ? 0.95 + h * 0.5
        : kind === 'park' ? 0.78 + h * 0.85
        : kind === 'open' ? 0.7 + h * 1.05
        : kind === 'orchard' ? 0.85 + h * 0.35
        : kind === 'yard' ? 0.65 + h * 0.6
        : 0.68 + h * 0.45;
      trees.push({ x: +x.toFixed(2), y: 0, z: +z.toFixed(2), scale: +scale.toFixed(3), k: KIND[kind] });
      stat[kind]++;
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
          const style = styledGreens.get(g);
          if (style) {
            // Open lawn with groves: low-frequency noise carves clearings.
            const n = valueNoise(jx, jz, style.grove.noiseScale);
            const dens = n > style.grove.threshold ? style.grove.density : style.grove.lawnDensity;
            if (hash2(jx * 1.31, jz * 0.77) > dens) continue;
          }
          push(jx, jz, 'park');
        }
      }
    }

    for (const q of palmPts) {
      if (q.x < b.minX || q.x >= b.maxX || q.z < b.minZ || q.z >= b.maxZ) continue;
      push(q.x, q.z, 'palm');
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

    // Land-cover planting, driven by ESA WorldCover / Overture classes in the ground
    // raster (scripts/py/build_ground.py) instead of noise, so trees stand where real
    // canopy is: dense groves on WorldCover tree cover (Lucknow's mango orchards),
    // scattered trees on scrub/grass, field-edge trees on cropland, and yard/courtyard
    // trees (neem, peepal) between houses in built-up land. Walked on the global grid
    // so the lattice is continuous across tile seams.
    const RULES: Record<number, { sp: number; p: number; kind: 'open' | 'yard' | 'orchard'; clear: number }> = {
      2: { sp: 21, p: 0.72, kind: 'orchard', clear: 12 },   // tree canopy
      3: { sp: 30, p: 0.45, kind: 'open', clear: 20 },      // scrub
      4: { sp: 36, p: 0.28, kind: 'open', clear: 20 },      // grassland
      5: { sp: 46, p: 0.07, kind: 'open', clear: 25 },      // cropland: field-edge trees
      14: { sp: 46, p: 0.07, kind: 'open', clear: 25 },     // farmland
      7: { sp: 30, p: 0.30, kind: 'open', clear: 20 },      // wetland
      1: { sp: 24, p: 0.16, kind: 'yard', clear: 0 },       // built-up: yard trees
      12: { sp: 24, p: 0.20, kind: 'yard', clear: 0 },      // residential land use
      11: { sp: 20, p: 0.45, kind: 'yard', clear: 0 },      // campuses
      13: { sp: 40, p: 0.10, kind: 'open', clear: 25 },     // sand banks: sparse
    };
    for (const sp of [20, 21, 24, 30, 36, 40, 46]) {
      for (let x = Math.ceil(b.minX / sp) * sp; x < b.maxX; x += sp) {
        for (let z = Math.ceil(b.minZ / sp) * sp; z < b.maxZ; z += sp) {
          const jx = x + (hash2(x * 1.7 + sp, z) - 0.5) * sp * 0.8;
          const jz = z + (hash2(z, x * 1.7 + sp) - 0.5) * sp * 0.8;
          if (jx < b.minX || jx >= b.maxX || jz < b.minZ || jz >= b.maxZ) continue;
          const rule = RULES[groundClass(jx, jz)];
          if (!rule || rule.sp !== sp) continue;
          // Groves clump: modulate probability with low-frequency noise.
          const clump = 0.55 + 0.9 * (valueNoise(jx, jz, GROVE_SCALE) - 0.5);
          if (hash2(jx * 0.37, jz * 0.71) > rule.p * clump) continue;
          if (greenIndex.hits(jx, jz)) continue;
          if (rule.clear > 0 && nearBuilding(jx, jz, rule.clear)) continue;
          if (roadMask.hits(jx, jz, rule.kind === 'yard' ? 2.5 : OPEN_ROAD_CLEAR)) continue;
          push(jx, jz, rule.kind);
        }
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

  const total = stat.park + stat.verge + stat.open + stat.yard + stat.orchard + stat.palm;
  console.log(`\nTrees ${total} across ${stat.tiles} tiles (park ${stat.park}, verge ${stat.verge}, ` +
              `open ${stat.open}, yard ${stat.yard}, orchard ${stat.orchard}); ${stat.rejected} candidates masked out`);
  console.log('Next: npm run bake');
}

main();
