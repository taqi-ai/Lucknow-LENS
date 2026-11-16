/**
 * build_buildings.ts — rebuilds the BUILDING stream of every tile from real data.
 *
 * Replaces the old generator's building pass, which kept only the outer ring of the
 * first polygon, gave every building a `Math.random()` id, and set 99.99% of heights
 * to `12 + hash % 15`. Like build_transportation.ts this patches the existing tiles in
 * place: roads, places, water, green areas and trees are preserved byte-for-byte; only
 * `lod2.buildings` (and the unused `lod1.buildings`) are rewritten.
 *
 * Inputs (see docs/3d-revamp/LOCAL_IMPLEMENTATION_REPORT.md for how to fetch them):
 *   data/raw/overture_building.geojsonseq        Overture 2026-10-21.0 `building`
 *   data/raw/overture_building_part.geojsonseq   Overture 2026-10-21.0 `building_part`
 *   data/derived/gob_heights.csv                 per-building Google Open Buildings 2.5D
 *                                                Temporal (2023) stats — sample_gob25d.py
 *   data/derived/ground_class.u8                 surface classes — build_ground.py
 *
 * HEIGHT HIERARCHY (first that applies wins; every building records which):
 *   1 `overture_height`  source `height` attribute                          observed
 *   2 `part`             building_part height / floors                      observed|derived
 *   3 `floors`           source num_floors x typology floor height          derived
 *   4 `gob25d`           2.5D raster, interior pixels, presence-gated        observed (model)
 *   5 `model`            neighbourhood model: robust median of gob25d heights in the
 *                        surrounding 3x3 cells, scaled by footprint size, with a
 *                        typology prior when the neighbourhood has no observations  inferred
 *
 * Every building also gets a deterministic typology (0-7, see TYPOLOGY) used by the
 * geometry generator and the building shader, and a district map is written for
 * spatially coherent materials and night lighting.
 *
 * Outputs:
 *   public/overture_tiles_full/tile_*.json   (buildings patched)  + manifest counts
 *   public/ground/district.bin + district_meta.json
 *   data/derived/building_provenance.csv      id, height, source, quality, kind, typology
 *   docs/3d-revamp/HEIGHT_QUALITY_REPORT.md
 *
 * Usage: npm run buildings   (then: npm run suppress && npm run vegetation && npm run bake)
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { hashString } from '../src/city/buildingGeometry';
import { TYPOLOGY, FLOOR_HEIGHT, type Typology } from '../src/city/buildingTypes';

const ROOT = process.cwd();
const RAW = path.join(ROOT, 'data/raw');
const DER = path.join(ROOT, 'data/derived');
const TILES_DIR = path.join(ROOT, 'public/overture_tiles_full');
const GROUND_DIR = path.join(ROOT, 'public/ground');
const TILE_SIZE = 500;

const CENTER_LAT = 26.84997035;
const CENTER_LON = 80.95005255000001;
const M_PER_LAT = 111320;
const M_PER_LON = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);
const project = (lon: number, lat: number) => ({
  x: Math.round((lon - CENTER_LON) * M_PER_LON * 100) / 100,
  z: Math.round(-(lat - CENTER_LAT) * M_PER_LAT * 100) / 100,
});

interface Pt { x: number; z: number }
type HeightSource = 'overture_height' | 'part' | 'floors' | 'gob25d' | 'model';
type Quality = 'A' | 'B' | 'C';

interface Rec {
  id: string;
  parent?: string;
  rings: Pt[][][];      // polygons -> rings (0 = outer)
  cx: number; cz: number;
  area: number;
  orient: number;       // radians, longest edge
  props: Record<string, any>;
  height: number;
  minH: number;
  src: HeightSource;
  q: Quality;
  typ: Typology;
  floors: number;
  hasParts: boolean;
}

// ── Manually calibrated zones (lon/lat rings). Coarse on purpose: they only bias
//    typology where the data cannot, and every boundary is documented. ─────────────
const ZONES: Record<string, Array<[number, number]>> = {
  // Old Lucknow south of the Gomti: Thakurganj, Daulatganj, Hussainabad, Chowk, Nakhas,
  // Victoria Ganj, Yahiyaganj, Saadatganj, Rakabganj, Aminabad, Maulviganj, Nazirabad.
  oldcity: [[80.878, 26.866], [80.893, 26.882], [80.912, 26.884], [80.925, 26.874], [80.932, 26.862],
    [80.937, 26.853], [80.936, 26.842], [80.928, 26.835], [80.912, 26.838], [80.896, 26.846], [80.884, 26.854]],
  // Bazaar cores inside it, plus Hazratganj and Naka.
  market: [[80.906, 26.872], [80.916, 26.873], [80.921, 26.866], [80.918, 26.860], [80.908, 26.862]],
  aminabad: [[80.921, 26.851], [80.930, 26.852], [80.933, 26.844], [80.924, 26.842]],
  hazratganj: [[80.938, 26.853], [80.951, 26.853], [80.951, 26.847], [80.938, 26.847]],
  // Heritage precincts: Hussainabad complex, Residency, Kaiserbagh, Hazratganj colonial core.
  heritage: [[80.900, 26.878], [80.918, 26.878], [80.918, 26.866], [80.900, 26.866]],
  residency: [[80.921, 26.865], [80.930, 26.865], [80.930, 26.857], [80.921, 26.857]],
  kaiserbagh: [[80.928, 26.858], [80.939, 26.858], [80.939, 26.850], [80.928, 26.850]],
};
const zonePolys: Record<string, Pt[]> = Object.fromEntries(
  Object.entries(ZONES).map(([k, ring]) => [k, ring.map(([lo, la]) => project(lo, la))]),
);

function pointInRing(x: number, z: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const inZone = (k: string, x: number, z: number) => pointInRing(x, z, zonePolys[k]);

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].z - r[i].x * r[j].z;
  return a / 2;
}

// ── Ground class raster (11 m) for land-use context ───────────────────────────────
const groundMeta = JSON.parse(fs.readFileSync(path.join(GROUND_DIR, 'ground_meta.json'), 'utf8'));
const groundCls = fs.readFileSync(path.join(DER, 'ground_class.u8'));
function groundClass(x: number, z: number): number {
  const i = Math.floor((x - groundMeta.originX) / groundMeta.cell);
  const j = Math.floor((z - groundMeta.originZ) / groundMeta.cell);
  if (i < 0 || j < 0 || i >= groundMeta.size || j >= groundMeta.size) return 255;
  return groundCls[j * groundMeta.size + i];
}

// ── Google Open Buildings 2.5D stats ──────────────────────────────────────────────
interface Gob { med: number; p75: number; p90: number; npx: number; nv: number; pres: number }
function loadGob(): Map<string, Gob> {
  const m = new Map<string, Gob>();
  const f = path.join(DER, 'gob_heights.csv');
  if (!fs.existsSync(f)) { console.warn('gob_heights.csv missing — raster heights unavailable'); return m; }
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 7) continue;
    m.set(p[0], { med: +p[1], p75: +p[2], p90: +p[3], npx: +p[4], nv: +p[5], pres: +p[6] });
  }
  return m;
}

async function readSeq(file: string, fn: (f: any) => void): Promise<number> {
  if (!fs.existsSync(file)) return 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    fn(JSON.parse(line)); n++;
  }
  return n;
}

function toRec(f: any, isPart: boolean): Rec | null {
  const g = f.geometry;
  const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  const rings: Pt[][][] = [];
  let area = 0, cx = 0, cz = 0, bestLen = -1, orient = 0;
  for (const poly of polys) {
    const pr: Pt[][] = [];
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r].map((c) => project(c[0], c[1]));
      if (ring.length > 1) {
        const a = ring[0], b = ring[ring.length - 1];
        if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01) ring.pop();
      }
      if (ring.length < 3) continue;
      const ar = Math.abs(ringArea(ring));
      if (r === 0) {
        area += ar;
        let sx = 0, sz = 0;
        for (const p of ring) { sx += p.x; sz += p.z; }
        cx += (sx / ring.length) * ar; cz += (sz / ring.length) * ar;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const dx = ring[i].x - ring[j].x, dz = ring[i].z - ring[j].z, l = dx * dx + dz * dz;
          if (l > bestLen) { bestLen = l; orient = Math.atan2(dz, dx); }
        }
      } else area -= ar;
      if (r > 0 && pr.length === 0) continue; // hole without an outer ring
      pr.push(ring);
    }
    if (pr.length) rings.push(pr);
  }
  if (!rings.length || area < 4) return null;
  const outerArea = rings.reduce((s, p) => s + Math.abs(ringArea(p[0])), 0) || 1;
  const p = f.properties || {};
  return {
    id: f.id, parent: isPart ? p.building_id : undefined, rings,
    cx: cx / outerArea, cz: cz / outerArea, area, orient, props: p,
    height: 0, minH: 0, src: 'model', q: 'C', typ: TYPOLOGY.GENERIC, floors: 1,
    hasParts: !!p.has_parts,
  };
}

// ── Zone statistics on a 125 m grid ───────────────────────────────────────────────
const CELL = 125;
const GRID_N = 400; // 50 km
const GRID_O = -25000;
const cellIndex = (x: number, z: number) => {
  const i = Math.floor((x - GRID_O) / CELL), j = Math.floor((z - GRID_O) / CELL);
  return i < 0 || j < 0 || i >= GRID_N || j >= GRID_N ? -1 : j * GRID_N + i;
};

/** Windows can briefly lock a tile while a dev server reads it; retry with backoff. */
function writeFileRetry(file: string, data: string, attempts = 40): void {
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(file, data); return; } catch (err) {
      if (i >= attempts - 1) throw err;
      const until = Date.now() + Math.min(2000, 100 * (i + 1));
      while (Date.now() < until) { /* backoff */ }
    }
  }
}

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const hash01 = (s: string, salt: number) => ((hashString(s + ':' + salt) % 10007) / 10007);

async function main(): Promise<void> {
  const t0 = Date.now();
  const gob = loadGob();
  console.log(`gob25d stats for ${gob.size} footprints`);

  const recs: Rec[] = [];
  const parts: Rec[] = [];
  await readSeq(path.join(RAW, 'overture_building.geojsonseq'), (f) => { const r = toRec(f, false); if (r) recs.push(r); });
  await readSeq(path.join(RAW, 'overture_building_part.geojsonseq'), (f) => {
    if (f.properties?.is_underground) return;
    const r = toRec(f, true); if (r) parts.push(r);
  });
  console.log(`${recs.length} buildings, ${parts.length} above-ground parts read (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // ── Zone stats: density, footprint size, orientation coherence ──────────────
  const cnt = new Float32Array(GRID_N * GRID_N);
  const areaSum = new Float32Array(GRID_N * GRID_N);
  const oc = new Float32Array(GRID_N * GRID_N), os_ = new Float32Array(GRID_N * GRID_N);
  for (const r of recs) {
    const c = cellIndex(r.cx, r.cz); if (c < 0) continue;
    cnt[c]++; areaSum[c] += r.area;
    oc[c] += Math.cos(r.orient * 4); os_[c] += Math.sin(r.orient * 4); // 90-degree symmetric
  }
  const coherence = (c: number) => (cnt[c] > 4 ? Math.hypot(oc[c], os_[c]) / cnt[c] : 0);
  const density = (c: number) => cnt[c] / (CELL * CELL / 10000); // buildings per hectare
  const cover = (c: number) => areaSum[c] / (CELL * CELL);

  // ── Typology ────────────────────────────────────────────────────────────────
  const commercialCls = new Set(['commercial', 'retail', 'office', 'hotel', 'supermarket', 'kiosk']);
  const instCls = new Set(['school', 'college', 'university', 'hospital', 'government', 'civic', 'public',
    'library', 'post_office', 'train_station', 'transportation', 'stadium', 'museum', 'courthouse', 'fire_station', 'police']);
  const instSub = new Set(['education', 'medical', 'civic', 'transportation', 'entertainment', 'religious']);
  const industrialCls = new Set(['industrial', 'warehouse', 'factory', 'manufacture', 'hangar', 'storage_tank', 'shed']);

  for (const r of recs.concat(parts)) {
    const p = r.props;
    const cls = p.class as string | undefined, sub = p.subtype as string | undefined;
    const c = cellIndex(r.cx, r.cz);
    const gc = groundClass(r.cx, r.cz);
    const old = inZone('oldcity', r.cx, r.cz);
    const heritage = inZone('heritage', r.cx, r.cz) || inZone('residency', r.cx, r.cz) || inZone('kaiserbagh', r.cx, r.cz);
    const market = inZone('market', r.cx, r.cz) || inZone('aminabad', r.cx, r.cz) || inZone('hazratganj', r.cx, r.cz);
    let typ: Typology = TYPOLOGY.GENERIC;
    // Industrial needs evidence: a source class, Overture industrial land use, or a very
    // large footprint on non-urban ground (sheds and kilns on the periphery). Large
    // footprints inside built-up land are usually institutions or apartment blocks.
    if ((cls && industrialCls.has(cls)) || gc === 10
      || (r.area > 2500 && c >= 0 && density(c) < 8 && !old && gc !== 1 && gc !== 12 && gc !== 9 && gc !== 11)) typ = TYPOLOGY.INDUSTRIAL;
    else if (heritage && (r.area > 300 || sub === 'religious' || sub === 'civic' || p.names)) typ = TYPOLOGY.HERITAGE;
    else if ((cls && instCls.has(cls)) || (sub && instSub.has(sub)) || (gc === 11 && r.area > 250)) typ = TYPOLOGY.INSTITUTIONAL;
    else if ((cls && commercialCls.has(cls)) || sub === 'commercial' || gc === 9) typ = TYPOLOGY.MARKET;
    else if (market && r.area < 900 && hash01(r.id, 3) < 0.7) typ = TYPOLOGY.MARKET;
    else if (old) typ = TYPOLOGY.OLD_CITY;
    else if (cls === 'apartments') typ = TYPOLOGY.APARTMENT;
    // Planned colonies: coherent orientation in a dense URBAN cell. Rural ML footprints
    // are also axis-aligned, so land cover (built-up / residential) and density gate it.
    else if (c >= 0 && coherence(c) > 0.6 && density(c) > 15 && cover(c) > 0.18 && (gc === 1 || gc === 12 || gc === 9)
      && r.area > 50 && r.area < 700) typ = TYPOLOGY.PLANNED;
    r.typ = typ;
  }

  // ── Heights ─────────────────────────────────────────────────────────────────
  const gobOK = (g: Gob | undefined): g is Gob =>
    !!g && g.nv >= 3 && g.nv >= g.npx * 0.2 && g.pres >= 0.3 && g.med > 1.5;
  const gobHeight = (g: Gob) => {
    // Small footprints are most diluted by edge blending -> lean on the upper percentile.
    const h = g.npx < 30 ? g.p75 : g.npx < 120 ? (g.med + g.p75) / 2 : g.med;
    // 3.0 m floor: a single-storey house with its parapet is ~3.3-4 m; lower raster
    // values on small roofs are edge blending, not a shorter building.
    return Math.min(140, Math.max(3.0, h));
  };
  // Plausibility: small fragments inside a tower's raster footprint inherit the tower's
  // height (raster bleed). Nothing in Lucknow is a 40 m pencil on a 50 m2 plot.
  const plausible = (h: number, area: number) => h <= Math.max(11, 3.2 * Math.sqrt(area));
  let rejectedSlender = 0;

  // pass 1: observed / derived
  const obsByCell = new Map<number, number[]>();
  const partByParent = new Map<string, Rec[]>();
  for (const p of parts) {
    if (!p.parent) continue;
    const a = partByParent.get(p.parent) ?? []; a.push(p); partByParent.set(p.parent, a);
  }
  const all = recs.concat(parts);
  for (const r of all) {
    const p = r.props;
    const fh = FLOOR_HEIGHT[r.typ];
    if (typeof p.height === 'number' && p.height > 1) {
      r.height = p.height; r.src = r.parent ? 'part' : 'overture_height'; r.q = 'A';
    } else if (typeof p.num_floors === 'number' && p.num_floors > 0) {
      r.height = p.num_floors * fh + 0.9; r.src = r.parent ? 'part' : 'floors'; r.q = 'B';
    } else {
      const g = gob.get(r.id);
      if (gobOK(g) && !plausible(gobHeight(g), r.area)) rejectedSlender++;
      else if (gobOK(g)) {
        r.height = gobHeight(g);
        r.src = 'gob25d';
        r.q = g.nv >= 12 && g.nv >= g.npx * 0.4 && g.pres >= 0.5 ? 'A' : 'B';
      }
    }
    if (r.parent) {
      r.minH = typeof p.min_height === 'number' ? p.min_height
        : typeof p.min_floor === 'number' ? p.min_floor * fh : 0;
    }
    if (r.src === 'gob25d' || r.src === 'overture_height' || r.src === 'floors') {
      const c = cellIndex(r.cx, r.cz);
      if (c >= 0) { const a = obsByCell.get(c) ?? []; a.push(r.height); obsByCell.set(c, a); }
    }
  }

  // pass 2: neighbourhood model for the rest
  const PRIOR: Record<number, [number, number]> = { // [median floors, spread floors]
    [TYPOLOGY.GENERIC]: [1.6, 0.8], [TYPOLOGY.OLD_CITY]: [2.6, 0.9], [TYPOLOGY.MARKET]: [2.8, 1.0],
    [TYPOLOGY.HERITAGE]: [2.2, 0.6], [TYPOLOGY.APARTMENT]: [6, 2], [TYPOLOGY.INSTITUTIONAL]: [2.6, 0.9],
    [TYPOLOGY.INDUSTRIAL]: [1, 0.2], [TYPOLOGY.PLANNED]: [2.2, 0.7],
  };
  const neighbourMedian = new Map<number, number>();
  const nbMedian = (c: number): { med: number; n: number } => {
    const gi = c % GRID_N, gj = Math.floor(c / GRID_N);
    const vals: number[] = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = obsByCell.get((gj + dj) * GRID_N + gi + di); if (a) vals.push(...a);
    }
    return { med: median(vals), n: vals.length };
  };
  let modelled = 0;
  for (const r of all) {
    if (r.height > 0) continue;
    modelled++;
    const fh = FLOOR_HEIGHT[r.typ];
    const c = cellIndex(r.cx, r.cz);
    let base: number;
    const nb = c >= 0 ? (neighbourMedian.has(c) ? { med: neighbourMedian.get(c)!, n: 9 } : nbMedian(c)) : { med: 0, n: 0 };
    if (c >= 0 && !neighbourMedian.has(c) && nb.n >= 5) neighbourMedian.set(c, nb.med);
    if (nb.n >= 5) {
      // Neighbourhood median, nudged by footprint size relative to typical (bigger -> taller,
      // tiny sheds -> single storey). Deterministic per-building jitter of +/- half a floor.
      const sizeF = Math.max(0.7, Math.min(1.35, Math.pow(r.area / 110, 0.12)));
      base = nb.med * sizeF + (hash01(r.id, 7) - 0.5) * fh;
    } else {
      const [mf, sf] = PRIOR[r.typ];
      const u = hash01(r.id, 11) * 2 - 1;
      base = Math.max(1, Math.round(mf + u * sf)) * fh + 0.9;
    }
    if (r.area < 25) base = Math.min(base, fh + 0.6);
    base = Math.min(base, Math.max(11, 3.2 * Math.sqrt(r.area)));
    r.height = Math.min(90, Math.max(3.0, base));
    r.src = 'model'; r.q = 'C';
  }
  for (const r of all) {
    r.floors = Math.max(1, Math.round((r.height - r.minH - 0.6) / FLOOR_HEIGHT[r.typ]));
    // Promote tall residential to apartment typology now that heights are known.
    if ((r.typ === TYPOLOGY.GENERIC || r.typ === TYPOLOGY.PLANNED) && r.floors >= 5 && r.area >= 200) r.typ = TYPOLOGY.APARTMENT;
  }

  // ── Building parts replace their parent's massing ───────────────────────────
  const withParts = new Set<string>();
  for (const [parent, ps] of partByParent) if (ps.length) withParts.add(parent);

  // ── Emit into tiles ─────────────────────────────────────────────────────────
  const manifestPath = path.join(TILES_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tileOut = new Map<string, any[]>();
  const emit = (r: Rec, kind: 'b' | 'p') => {
    // Emit each polygon of a MultiPolygon as its own record sharing the id prefix,
    // so nothing downstream needs to understand multipolygons.
    r.rings.forEach((poly, k) => {
      let sx = 0, sz = 0; for (const q of poly[0]) { sx += q.x; sz += q.z; }
      const cx = sx / poly[0].length, cz = sz / poly[0].length;
      const tid = `tile_${Math.floor(cx / TILE_SIZE)}_${Math.floor(cz / TILE_SIZE)}`;
      const o: any = {
        id: r.rings.length > 1 ? `${r.id}#${k}` : r.id,
        points: poly[0],
        height: Math.round(r.height * 10) / 10,
        floors: r.floors,
        typ: r.typ,
        hs: r.src,
        hq: r.q,
      };
      if (poly.length > 1) o.holes = poly.slice(1);
      if (r.minH > 0) o.minH = Math.round(r.minH * 10) / 10;
      if (kind === 'p') o.part = 1;
      const rs = r.props.roof_shape; if (rs && rs !== 'flat') o.roof = rs;
      if (r.props.names?.primary) o.name = r.props.names.primary;
      const a = tileOut.get(tid) ?? []; a.push(o); tileOut.set(tid, a);
    });
  };
  for (const r of recs) if (!withParts.has(r.id)) emit(r, 'b');
  for (const p of parts) emit(p, 'p');

  const known = new Set<string>(manifest.tiles.map((t: any) => t.id));
  let written = 0, created = 0, total = 0;
  const files = fs.readdirSync(TILES_DIR).filter((f) => f.startsWith('tile_') && f.endsWith('.json'));
  const seen = new Set<string>();
  for (const f of files) {
    const id = f.slice(0, -5); seen.add(id);
    const data = JSON.parse(fs.readFileSync(path.join(TILES_DIR, f), 'utf8'));
    const list = tileOut.get(id) ?? [];
    data.lod2 = data.lod2 || {}; data.lod1 = data.lod1 || {};
    data.lod2.buildings = list; data.lod1.buildings = [];
    data.buildingsVersion = 2;
    writeFileRetry(path.join(TILES_DIR, f), JSON.stringify(data));
    total += list.length; written++;
  }
  for (const [id, list] of tileOut) {
    if (seen.has(id)) continue;
    const [, tx, tz] = id.split('_').map(Number);
    const data = { id, buildingsVersion: 2, lod1: { buildings: [], roads: [], waterways: [], greenAreas: [] },
      lod2: { buildings: list, roads: [], places: [], waterways: [], greenAreas: [], trees: [] } };
    writeFileRetry(path.join(TILES_DIR, `${id}.json`), JSON.stringify(data));
    total += list.length; created++;
    if (!known.has(id)) manifest.tiles.push({
      id, tileX: tx, tileZ: tz,
      bounds: { minX: tx * TILE_SIZE, maxX: (tx + 1) * TILE_SIZE, minZ: tz * TILE_SIZE, maxZ: (tz + 1) * TILE_SIZE },
      center: { x: tx * TILE_SIZE + TILE_SIZE / 2, z: tz * TILE_SIZE + TILE_SIZE / 2 },
      bldgsLOD1: 0, bldgsLOD2: 0, roadsCount: 0, treesCount: 0,
    });
  }
  for (const t of manifest.tiles) { t.bldgsLOD2 = (tileOut.get(t.id) ?? []).length; t.bldgsLOD1 = 0; }
  manifest.totalTiles = manifest.tiles.length;
  manifest.buildingsVersion = 2;
  manifest.buildingsGeneratedAt = new Date().toISOString();
  manifest.buildingsSource = 'Overture Maps 2026-10-21.0 building + building_part; heights see docs/3d-revamp/HEIGHT_QUALITY_REPORT.md';
  writeFileRetry(manifestPath, JSON.stringify(manifest));
  console.log(`tiles: ${written} patched, ${created} created; ${total} building records`);

  writeDistrictMap(recs, cnt, areaSum, coherence);
  writeReport(all, withParts, gob, modelled, partByParent.size, rejectedSlender);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

/**
 * District map: 256 x 256 RGBA over the 45 km ground grid (176 m cells), sampled by
 * world position in the building and ground shaders so HLOD fabric, relief and streamed
 * tiles all agree by construction.
 *   R  palette family 0..7 (zone-coherent material stock)
 *   G  night-light density 0..255
 *   B  commercial share 0..255
 *   A  old-city / dense-fabric factor 0..255
 */
function writeDistrictMap(recs: Rec[], cnt: Float32Array, areaSum: Float32Array, coherence: (c: number) => number): void {
  const N = 256;
  const size = groundMeta.size * groundMeta.cell;
  const cell = size / N;
  const bCnt = new Float32Array(N * N), bArea = new Float32Array(N * N), bCom = new Float32Array(N * N),
    bOld = new Float32Array(N * N), bTall = new Float32Array(N * N), bPlan = new Float32Array(N * N), bInst = new Float32Array(N * N);
  for (const r of recs) {
    const i = Math.floor((r.cx - groundMeta.originX) / cell), j = Math.floor((r.cz - groundMeta.originZ) / cell);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = j * N + i;
    bCnt[k]++; bArea[k] += r.area;
    if (r.typ === TYPOLOGY.MARKET) bCom[k]++;
    if (r.typ === TYPOLOGY.OLD_CITY || r.typ === TYPOLOGY.MARKET && inZone('oldcity', r.cx, r.cz)) bOld[k]++;
    if (r.floors >= 4) bTall[k]++;
    if (r.typ === TYPOLOGY.PLANNED || r.typ === TYPOLOGY.APARTMENT) bPlan[k]++;
    if (r.typ === TYPOLOGY.INSTITUTIONAL || r.typ === TYPOLOGY.HERITAGE) bInst[k]++;
  }
  // light 3x3 smoothing so families do not change on a hard grid
  const smooth = (a: Float32Array) => {
    const o = new Float32Array(a.length);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const ww = di === 0 && dj === 0 ? 2 : 1; s += a[jj * N + ii] * ww; w += ww;
      }
      o[j * N + i] = s / w;
    }
    return o;
  };
  const C = smooth(bCnt), A = smooth(bArea), CO = smooth(bCom), OL = smooth(bOld), T = smooth(bTall), P = smooth(bPlan), I = smooth(bInst);
  const out = Buffer.alloc(N * N * 4);
  const ha = cell * cell / 10000;
  for (let k = 0; k < N * N; k++) {
    const n = Math.max(C[k], 1e-3);
    const dens = C[k] / ha;                       // bldg / ha
    const cov = A[k] / (cell * cell);             // built cover
    const oldF = OL[k] / n, comF = CO[k] / n, planF = P[k] / n, instF = I[k] / n, tallF = T[k] / n;
    // Palette family: 0 old-city lime/ochre, 1 bazaar mixed, 2 planned cream/white,
    // 3 modern grey/neutral, 4 peripheral exposed brick, 5 village earth/whitewash,
    // 6 institutional buff/red, 7 generic urban pastel
    let fam = 7;
    if (C[k] < 0.5) fam = 5;
    else if (oldF > 0.45) fam = comF > 0.35 ? 1 : 0;
    else if (instF > 0.3) fam = 6;
    else if (tallF > 0.25 || planF > 0.5 && cov > 0.25) fam = 3;
    else if (planF > 0.35) fam = 2;
    else if (dens < 6) fam = cov < 0.05 ? 5 : 4;
    const light = Math.min(1, (cov * 2.2 + comF * 0.6 + Math.min(dens, 40) / 80) * (C[k] < 0.5 ? 0.2 : 1));
    out[k * 4] = fam;
    out[k * 4 + 1] = Math.round(light * 255);
    out[k * 4 + 2] = Math.round(Math.min(1, comF * 1.5) * 255);
    out[k * 4 + 3] = Math.round(Math.min(1, oldF * 1.2 + Math.min(1, dens / 60) * 0.3) * 255);
  }
  fs.writeFileSync(path.join(GROUND_DIR, 'district.bin'), out);
  fs.writeFileSync(path.join(GROUND_DIR, 'district_meta.json'), JSON.stringify({
    version: 1, size: N, cell, originX: groundMeta.originX, originZ: groundMeta.originZ,
    channels: { r: 'palette family 0..7', g: 'night light density', b: 'commercial share', a: 'old/dense fabric' },
    generatedAt: new Date().toISOString(),
  }, null, 1));
  void cnt; void areaSum; void coherence;
}

function writeReport(all: Rec[], withParts: Set<string>, gob: Map<string, Gob>, modelled: number, partParents: number, rejectedSlender: number): void {
  const bySrc: Record<string, number> = {}, byQ: Record<string, number> = {}, byTyp: Record<string, number> = {};
  const typName = Object.fromEntries(Object.entries(TYPOLOGY).map(([k, v]) => [v, k]));
  const hist = [0, 0, 0, 0, 0, 0, 0, 0];
  const edges = [4, 7, 10, 13, 18, 26, 40, Infinity];
  const rows: string[] = ['id,height_m,min_height_m,floors,source,quality,kind,typology'];
  for (const r of all) {
    if (!r.parent && withParts.has(r.id)) continue;
    bySrc[r.src] = (bySrc[r.src] ?? 0) + 1;
    byQ[r.q] = (byQ[r.q] ?? 0) + 1;
    byTyp[typName[r.typ]] = (byTyp[typName[r.typ]] ?? 0) + 1;
    hist[edges.findIndex((e) => r.height < e)]++;
    const kind = r.src === 'gob25d' || r.src === 'overture_height' ? 'observed' : r.src === 'model' ? 'inferred' : 'derived';
    rows.push(`${r.id},${r.height.toFixed(1)},${r.minH.toFixed(1)},${r.floors},${r.src},${r.q},${kind},${typName[r.typ]}`);
  }
  fs.writeFileSync(path.join(DER, 'building_provenance.csv'), rows.join('\n'));

  // Validation: raster vs the few buildings with source floors/height.
  const val: string[] = [];
  for (const r of all) {
    const g = gob.get(r.id); const p = r.props;
    if (!g || !(p.num_floors > 0 || p.height > 0)) continue;
    const ref = p.height > 0 ? p.height : p.num_floors * FLOOR_HEIGHT[r.typ] + 0.9;
    val.push(`| ${p.names?.primary ?? r.id.slice(0, 8)} | ${p.height ?? ''} | ${p.num_floors ?? ''} | ${ref.toFixed(1)} | ${g.nv > 0 ? g.med.toFixed(1) : 'n/a'} | ${g.nv}/${g.npx} | ${g.pres.toFixed(2)} |`);
  }
  const diffs = all.map((r) => { const g = gob.get(r.id); const p = r.props;
    if (!g || g.nv < 3 || !(p.num_floors > 0)) return null;
    return g.med - (p.num_floors * FLOOR_HEIGHT[r.typ] + 0.9); }).filter((v): v is number => v !== null);
  const n = all.length - withParts.size;
  const pct = (v: number) => `${((100 * v) / n).toFixed(2)}%`;
  const md = `# Building height quality report

Generated ${new Date().toISOString()} by \`scripts/build_buildings.ts\`.

Footprints: Overture Maps release 2026-10-21.0 (\`building\` + \`building_part\`), ${n.toLocaleString('en-US')} building records
after building parts replace their parents (${withParts.size} parents replaced by parts).

## Height sources

| Source | Kind | Buildings | Share |
|---|---|---:|---:|
${Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${k === 'gob25d' || k === 'overture_height' ? 'observed' : k === 'model' ? 'inferred' : 'derived'} | ${v.toLocaleString('en-US')} | ${pct(v)} |`).join('\n')}

- \`overture_height\`: the source \`height\` attribute (surveyed or mapper-entered).
- \`part\`: Overture \`building_part\` height or floor count.
- \`floors\`: source \`num_floors\` x typology floor height (+0.9 m parapet/plinth). An estimate, not a measurement.
- \`gob25d\`: Google Open Buildings 2.5D Temporal, 2023 layer, 2 m sampling of the 0.5 m raster (about 4 m effective
  resolution). Interior pixels only, presence score >= 0.35 (an uncalibrated model score, used as a filter, not a probability),
  at least 3 valid pixels and 20% of owned pixels. Median for large footprints, upper quartile for small ones (edge blending
  biases small roofs low). The model's height accuracy was evaluated outside the Global South; treat as a model estimate.
- \`model\`: no usable observation. Median of observed heights in the surrounding 375 m x 375 m, scaled by footprint
  size, with deterministic per-building jitter; typology priors where the neighbourhood has fewer than 5 observations.

## Quality

| Quality | Meaning | Buildings |
|---|---|---:|
| A | source height, or raster with >= 12 valid interior pixels covering >= 40% and presence >= 0.5 | ${(byQ.A ?? 0).toLocaleString('en-US')} |
| B | floors-derived, or raster with fewer/partial samples | ${(byQ.B ?? 0).toLocaleString('en-US')} |
| C | inferred by the neighbourhood model | ${(byQ.C ?? 0).toLocaleString('en-US')} |

## Height distribution (all records)

| < 4 m | 4-7 | 7-10 | 10-13 | 13-18 | 18-26 | 26-40 | >= 40 m |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ${hist.map((v) => v.toLocaleString('en-US')).join(' | ')} |

The old pipeline put 99.99% of buildings in a uniform 12-26 m band (\`12 + hash % 15\`).

## Typology

| Typology | Buildings |
|---|---:|
${Object.entries(byTyp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v.toLocaleString('en-US')} |`).join('\n')}

Typology comes from source class/subtype, the land-use class under the footprint (Overture land use + ESA WorldCover),
neighbourhood statistics on a 125 m grid (density, orientation coherence for planned layouts), height, and a few manually
drawn zones (old city, bazaar cores, heritage precincts) listed in \`scripts/build_buildings.ts\` (\`ZONES\`).

## Validation against source floor counts / heights

Raster median minus floors-derived height over ${diffs.length} buildings with both: median difference
${diffs.length ? median(diffs).toFixed(1) : 'n/a'} m, mean absolute difference
${diffs.length ? (diffs.reduce((s, v) => s + Math.abs(v), 0) / diffs.length).toFixed(1) : 'n/a'} m.

| Name / id | src height | src floors | reference m | raster median m | valid/owned px | presence |
|---|---:|---:|---:|---:|---:|---:|
${val.slice(0, 60).join('\n')}

Raster coverage: ${gob.size.toLocaleString('en-US')} footprints sampled; buildings modelled because no usable observation: ${modelled.toLocaleString('en-US')}.
Building-part parents: ${partParents}. Raster values rejected as implausibly slender (height > max(11 m, 3.2 x sqrt(area)), raster bleed from adjacent towers): ${rejectedSlender.toLocaleString('en-US')}.
`;
  fs.mkdirSync(path.join(ROOT, 'docs/3d-revamp'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs/3d-revamp/HEIGHT_QUALITY_REPORT.md'), md);
  console.log('sources', bySrc, 'quality', byQ, 'typology', byTyp, 'hist', hist);
}

main().catch((e) => { console.error(e); process.exit(1); });
