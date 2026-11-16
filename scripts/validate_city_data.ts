/**
 * validate_city_data.ts — integrity check for the generated 3D city data.
 *
 * Fails (exit 1) if any tile, HLOD super-tile or ground asset is missing, outdated or
 * corrupt, so a half-regenerated dataset cannot silently ship a mixed old/new city.
 *
 *   tiles   buildingsVersion 2, finite geometry, height 2..300 m, provenance fields
 *           (hs source, hq quality, typ typology) on every building, tree records sane
 *   HLOD    manifest buildingFormat == BUILDING_FORMAT_VERSION, every .bin has the
 *           right magic/version and a byte length matching its header vertex count
 *   ground  albedo/class/meta + district map present and sized as declared
 *
 * Usage: npm run validate:city
 */
import fs from 'fs';
import path from 'path';
import { BUILDING_FORMAT_VERSION } from '../src/city/buildingTypes';

const ROOT = process.cwd();
const TILES = path.join(ROOT, 'public/overture_tiles_full');
const HLOD = path.join(ROOT, 'public/hlod');
const GROUND = path.join(ROOT, 'public/ground');
const errors: string[] = [];
const err = (m: string) => { if (errors.length < 50) errors.push(m); };

const SOURCES = new Set(['overture_height', 'part', 'floors', 'gob25d', 'model']);
let buildings = 0, trees = 0, tiles = 0;
const bySrc: Record<string, number> = {};

for (const f of fs.readdirSync(TILES)) {
  if (!f.startsWith('tile_') || !f.endsWith('.json')) continue;
  tiles++;
  let t: any;
  try { t = JSON.parse(fs.readFileSync(path.join(TILES, f), 'utf8')); } catch { err(`${f}: unparseable JSON`); continue; }
  if (t.buildingsVersion !== 2) err(`${f}: buildingsVersion ${t.buildingsVersion}`);
  for (const b of t.lod2?.buildings ?? []) {
    buildings++;
    if (!b.id || typeof b.id !== 'string' || b.id.startsWith('bld-0.')) err(`${f}: random/missing id ${b.id}`);
    if (!Array.isArray(b.points) || b.points.length < 3) err(`${f}: ${b.id} bad ring`);
    else if (b.points.some((p: any) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) err(`${f}: ${b.id} non-finite point`);
    if (!(b.height >= 2 && b.height <= 300)) err(`${f}: ${b.id} height ${b.height}`);
    if (!SOURCES.has(b.hs)) err(`${f}: ${b.id} missing height source`);
    if (!['A', 'B', 'C'].includes(b.hq)) err(`${f}: ${b.id} missing quality`);
    if (!(b.typ >= 0 && b.typ <= 7)) err(`${f}: ${b.id} missing typology`);
    bySrc[b.hs] = (bySrc[b.hs] ?? 0) + 1;
  }
  for (const tr of t.lod2?.trees ?? []) {
    trees++;
    if (!Number.isFinite(tr.x) || !Number.isFinite(tr.z) || !(tr.scale > 0)) err(`${f}: bad tree`);
  }
}

const man = JSON.parse(fs.readFileSync(path.join(HLOD, 'hlod_manifest.json'), 'utf8'));
if (man.buildingFormat !== BUILDING_FORMAT_VERSION) err(`hlod manifest buildingFormat ${man.buildingFormat}`);
let hlodFiles = 0;
for (const st of man.superTiles) {
  for (const kind of ['f', 'r'] as const) {
    const verts = kind === 'f' ? st.fabricVerts : st.reliefVerts;
    if (!verts) continue;
    const file = path.join(HLOD, `s_${st.key}.${kind}.bin`);
    if (!fs.existsSync(file)) { err(`missing ${path.basename(file)}`); continue; }
    const buf = fs.readFileSync(file);
    hlodFiles++;
    if (buf.readUInt32LE(0) !== 0x304c484c) err(`${path.basename(file)}: bad magic`);
    if (buf.readUInt32LE(4) !== BUILDING_FORMAT_VERSION) err(`${path.basename(file)}: version ${buf.readUInt32LE(4)}`);
    const n = buf.readUInt32LE(24);
    const need = ((32 + n * 6 + 3) & ~3) + n * 4;
    if (n !== verts || buf.length < need) err(`${path.basename(file)}: ${n} verts / ${buf.length} bytes, manifest ${verts}`);
  }
}

for (const f of ['ground_albedo.jpg', 'ground_class.png', 'ground_meta.json', 'district.bin', 'district_meta.json']) {
  if (!fs.existsSync(path.join(GROUND, f))) err(`missing public/ground/${f}`);
}
if (fs.existsSync(path.join(GROUND, 'district_meta.json'))) {
  const dm = JSON.parse(fs.readFileSync(path.join(GROUND, 'district_meta.json'), 'utf8'));
  const len = fs.statSync(path.join(GROUND, 'district.bin')).size;
  if (len !== dm.size * dm.size * 4) err(`district.bin ${len} bytes, expected ${dm.size * dm.size * 4}`);
}
if (!fs.existsSync(path.join(ROOT, 'public/landmarks/footprints.json'))) err('missing public/landmarks/footprints.json');

console.log(`tiles ${tiles}, buildings ${buildings}, trees ${trees}, HLOD files ${hlodFiles}`);
console.log('height sources', bySrc);
if (errors.length) {
  console.error(`\n${errors.length}${errors.length >= 50 ? '+' : ''} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log('OK — city data is consistent (format v' + BUILDING_FORMAT_VERSION + ').');
