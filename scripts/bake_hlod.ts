/**
 * bake_hlod.ts — offline HLOD baker for Lucknow LENS.
 *
 * Reads the generated Overture tiles (public/overture_tiles_full/tile_*.json) and
 * emits binary super-tiles under public/hlod/. Every vertex written here comes from
 * a real Overture building footprint — nothing is synthesised.
 *
 * Why binary: the client currently triangulates ~1M polygons on the main thread with
 * THREE.ExtrudeGeometry, which is why the city never populates. Baking the
 * triangulation offline turns tile activation into a plain buffer upload.
 *
 * Output per super-tile (.bin), little-endian:
 *
 *   magic       u32   'LHL0'
 *   version     u32
 *   originX     f32   super-tile origin in world metres
 *   originZ     f32
 *   scaleXZ     f32   metres per quantised XZ unit
 *   scaleY      f32   metres per quantised Y unit
 *   fabricVerts u32
 *   reliefVerts u32
 *   -- padded to 32 bytes --
 *   fabric positions  i16 x3 x fabricVerts   (roof polygons, all buildings)
 *   fabric packs      u8  x4 x fabricVerts
 *   relief positions  i16 x3 x reliefVerts   (full extrusions, prominent buildings)
 *   relief packs      u8  x4 x reliefVerts
 *
 * The pack stream is what lets a *single* shared material drive per-building
 * variation on the GPU:
 *   byte0  deterministic hash seed   (palette / window pattern / jitter)
 *   byte1  normalised height         (height / 80m, clamped)
 *   byte2  baked ambient occlusion   (255 top -> darker at ground contact)
 *   byte3  flags: bit0 isRoof, bits1-2 class, bits3-7 quantised orientation
 *
 * Normals are deliberately NOT baked. Buildings are hard-edged, so the material
 * derives flat normals in the fragment shader with dFdx/dFdy — that is both cheaper
 * to store and avoids the smoothed-normal bug in the current merge path.
 *
 * Usage: npm run bake
 */

import fs from 'fs';
import path from 'path';
import { buildOverlay, ROAD_CLASS_ORDER } from '../src/city/overlayGeometry';
import { prepareBuilding, emitBase, type BuildingInput, type Prepared, type VertexSink } from '../src/city/buildingGeometry';
import { BUILDING_FORMAT_VERSION, TYPOLOGY } from '../src/city/buildingTypes';
import { isLandmarkSite } from '../src/city/landmarkSites';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const OUT_DIR = path.join(process.cwd(), 'public/hlod');

/** Super-tile edge length in metres. */
const SUPER = 4000;
/** Quantisation ranges. XZ is relative to the super-tile origin. */
const XZ_RANGE = 8192; // +/- 4096 m of slack around the origin
const Y_RANGE = 500;   // metres; taller than anything in Lucknow
const SCALE_XZ = XZ_RANGE / 32767;
const SCALE_Y = Y_RANGE / 32767;

/**
 * A building qualifies for the extruded `relief` stream if it actually reads at
 * altitude. Kept deliberately tight: at 14 m / 600 m2 roughly 76% of Lucknow
 * qualified and the relief stream ballooned to 270 MB, most of it walls that are
 * sub-pixel whenever the relief layer is the active representation.
 */
const RELIEF_MIN_HEIGHT = 9;
const RELIEF_MIN_AREA = 300;

const MAGIC = 0x304c484c; // 'LHL0' container magic; the payload format is VERSION
/** v2 = BUILDING_FORMAT_VERSION 2 packs (surface/typology) from the shared generator. */
const VERSION = BUILDING_FORMAT_VERSION;
const HEADER_BYTES = 32;

/**
 * Growable Int16/Uint8 sink implementing the shared VertexSink: positions arrive in
 * super-tile-local metres from buildingGeometry and are quantised here.
 */
class QuantSink implements VertexSink {
  pos: Int16Array;
  pack: Uint8Array;
  count = 0;
  constructor(initial = 1 << 16) {
    this.pos = new Int16Array(initial * 3);
    this.pack = new Uint8Array(initial * 4);
  }
  private grow(): void {
    const next = (this.pos.length / 3) * 2;
    const p = new Int16Array(next * 3); p.set(this.pos); this.pos = p;
    const k = new Uint8Array(next * 4); k.set(this.pack); this.pack = k;
  }
  push(x: number, y: number, z: number, b0: number, b1: number, b2: number, b3: number): void {
    if (this.count >= this.pos.length / 3) this.grow();
    const i3 = this.count * 3;
    this.pos[i3] = qXZ(x); this.pos[i3 + 1] = qY(y); this.pos[i3 + 2] = qXZ(z);
    const i4 = this.count * 4;
    this.pack[i4] = b0; this.pack[i4 + 1] = b1; this.pack[i4 + 2] = b2; this.pack[i4 + 3] = b3;
    this.count++;
  }
}

interface SuperTile {
  key: string;
  sx: number;
  sz: number;
  originX: number;
  originZ: number;
  fabric: QuantSink;
  relief: QuantSink;
  buildings: number;
  reliefBuildings: number;
}

const superTiles = new Map<string, SuperTile>();

function getSuperTile(x: number, z: number): SuperTile {
  const sx = Math.floor(x / SUPER);
  const sz = Math.floor(z / SUPER);
  const key = `${sx}_${sz}`;
  let st = superTiles.get(key);
  if (!st) {
    st = {
      key, sx, sz,
      originX: sx * SUPER + SUPER / 2,
      originZ: sz * SUPER + SUPER / 2,
      fabric: new QuantSink(),
      relief: new QuantSink(),
      buildings: 0,
      reliefBuildings: 0,
    };
    superTiles.set(key, st);
  }
  return st;
}

const qXZ = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v / SCALE_XZ)));
const qY = (v: number) => Math.max(0, Math.min(32767, Math.round(v / SCALE_Y)));

/**
 * Relief = buildings that read as massing from district altitude. With real heights
 * (citywide median ~5 m) the old `height >= 21 || area >= 1600` rule kept almost
 * nothing, so selection is by prominence: tall, large, or mid-rise with real bulk.
 */
function isProminent(p: Prepared): boolean {
  return p.height >= RELIEF_MIN_HEIGHT
    || p.area >= RELIEF_MIN_AREA
    || (p.height >= 5.5 && p.area >= 100)
    || (p.typ === TYPOLOGY.HERITAGE && p.area >= 200);
}

/** Emit one building into its super-tile through the shared generator. */
function emitBuilding(b: BuildingInput): void {
  const p = prepareBuilding(b);
  if (!p) return;
  if (isLandmarkSite(p.cx, p.cz)) return;
  const st = getSuperTile(p.cx, p.cz);
  st.buildings++;
  // Fabric: roof caps of every building at its real height (city scale).
  emitBase(st.fabric, p, st.originX, st.originZ, { walls: false, roofs: true });
  if (!isProminent(p)) return;
  st.reliefBuildings++;
  emitBase(st.relief, p, st.originX, st.originZ, { walls: true, roofs: true });
}

/**
 * Fabric and relief are written to separate files. Full City only ever needs the
 * fabric stream, so bundling both would force it to download ~4x the bytes it uses.
 */
function writeStream(st: SuperTile, sink: QuantSink, suffix: 'f' | 'r'): number {
  const n = sink.count;
  if (n === 0) return 0;

  const posBytes = n * 3 * 2;
  const packBytes = n * 4;
  const align = (v: number) => (v + 3) & ~3;
  const oPos = HEADER_BYTES;
  const oPack = align(oPos + posBytes);
  const total = align(oPack + packBytes);

  const buf = Buffer.alloc(total);
  buf.writeUInt32LE(MAGIC, 0);
  buf.writeUInt32LE(VERSION, 4);
  buf.writeFloatLE(st.originX, 8);
  buf.writeFloatLE(st.originZ, 12);
  buf.writeFloatLE(SCALE_XZ, 16);
  buf.writeFloatLE(SCALE_Y, 20);
  buf.writeUInt32LE(n, 24);
  buf.writeUInt32LE(0, 28);

  Buffer.from(sink.pos.buffer, 0, posBytes).copy(buf, oPos);
  Buffer.from(sink.pack.buffer, 0, packBytes).copy(buf, oPack);

  fs.writeFileSync(path.join(OUT_DIR, `s_${st.key}.${suffix}.bin`), buf);
  return total;
}

function writeSuperTile(st: SuperTile): { bytes: number; fabricBytes: number; reliefBytes: number } {
  const fabricBytes = writeStream(st, st.fabric, 'f');
  const reliefBytes = writeStream(st, st.relief, 'r');
  return { bytes: fabricBytes + reliefBytes, fabricBytes, reliefBytes };
}

async function main(): Promise<void> {
  if (!fs.existsSync(TILES_DIR)) {
    console.error(`Source tiles not found: ${TILES_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.bin') || f === 'hlod_manifest.json') fs.unlinkSync(path.join(OUT_DIR, f));
  }

  const files = fs.readdirSync(TILES_DIR).filter((f) => f.startsWith('tile_') && f.endsWith('.json'));
  console.log(`Baking HLOD from ${files.length} source tiles...`);

  let processed = 0;
  let buildings = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  for (const file of files) {
    let data: any;
    try {
      data = JSON.parse(fs.readFileSync(path.join(TILES_DIR, file), 'utf8'));
    } catch {
      continue;
    }

    // lod2 carries the complete footprint set; lod1 is a 10% subset of the same data.
    if (data?.buildingsVersion !== 2) {
      throw new Error(`${file} has buildingsVersion ${data?.buildingsVersion}; run \`npm run buildings\` first`);
    }
    const list: BuildingInput[] = data?.lod2?.buildings || [];
    for (const b of list) {
      if (!b?.points || b.points.length < 3) continue;
      emitBuilding(b);
      buildings++;
    }

    const bounds = data?.bounds;
    if (bounds) {
      if (bounds.minX < minX) minX = bounds.minX;
      if (bounds.maxX > maxX) maxX = bounds.maxX;
      if (bounds.minZ < minZ) minZ = bounds.minZ;
      if (bounds.maxZ > maxZ) maxZ = bounds.maxZ;
    }

    processed++;
    if (processed % 500 === 0) {
      const mb = (process.memoryUsage().heapUsed / 1048576).toFixed(0);
      console.log(`  ${processed}/${files.length} tiles, ${buildings} buildings, ${superTiles.size} super-tiles, heap ${mb}MB`);
    }
  }

  console.log(`Writing ${superTiles.size} super-tiles...`);
  const entries: any[] = [];
  let totalBytes = 0;

  for (const st of superTiles.values()) {
    if (st.fabric.count === 0 && st.relief.count === 0) continue;
    const { bytes, fabricBytes, reliefBytes } = writeSuperTile(st);
    totalBytes += bytes;
    entries.push({
      key: st.key,
      bounds: {
        minX: st.sx * SUPER, maxX: (st.sx + 1) * SUPER,
        minZ: st.sz * SUPER, maxZ: (st.sz + 1) * SUPER,
      },
      center: { x: st.originX, z: st.originZ },
      buildings: st.buildings,
      fabricVerts: st.fabric.count,
      reliefVerts: st.relief.count,
      reliefBuildings: st.reliefBuildings,
      fabricBytes,
      reliefBytes,
    });
  }

  // Sort by building count so the client can prioritise dense super-tiles first.
  entries.sort((a, b) => b.buildings - a.buildings);

  const manifest = {
    version: VERSION,
    buildingFormat: BUILDING_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    superTileSize: SUPER,
    quantisation: { scaleXZ: SCALE_XZ, scaleY: SCALE_Y },
    reliefThreshold: { minHeight: RELIEF_MIN_HEIGHT, minArea: RELIEF_MIN_AREA, rule: 'h>=9 | area>=300 | (h>=5.5 & area>=100) | heritage & area>=200' },
    spatialExtent: {
      minX: Number.isFinite(minX) ? minX : -20000,
      maxX: Number.isFinite(maxX) ? maxX : 20000,
      minZ: Number.isFinite(minZ) ? minZ : -20000,
      maxZ: Number.isFinite(maxZ) ? maxZ : 20000,
    },
    totalBuildings: buildings,
    totalSuperTiles: entries.length,
    totalBytes,
    superTiles: entries,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'hlod_manifest.json'), JSON.stringify(manifest));

  // ── City overlay ──────────────────────────────────────────────────────────
  // Roads, the Gomti, parks and the derived river bridges. Baked for the same
  // reason as the buildings: doing it in the browser meant parsing 7.3 MB of JSON
  // and running an unindexed road-vs-river intersection at every page load.
  bakeOverlay();

  console.log(`
Done.`);
  console.log(`  buildings   ${buildings}`);
  console.log(`  super-tiles ${entries.length}`);
  console.log(`  size        ${(totalBytes / 1048576).toFixed(1)} MB`);
}

interface OverlaySection { name: string; data: Float32Array }

/**
 * Layout: JSON header length (u32) + UTF-8 header + 4-byte-aligned Float32 blocks.
 * Returns the byte length written.
 */
function writeSectionFile(
  filename: string,
  sections: OverlaySection[],
  meta: Record<string, unknown>,
): number {
  const index: Array<{ name: string; offset: number; floats: number }> = [];
  let cursor = 0;
  for (const s of sections) {
    index.push({ name: s.name, offset: cursor, floats: s.data.length });
    cursor += s.data.byteLength;
  }
  const header = Buffer.from(JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    ...meta,
    sections: index,
  }), 'utf8');

  const headerPad = (4 - ((4 + header.length) % 4)) % 4;
  const dataStart = 4 + header.length + headerPad;
  const buf = Buffer.alloc(dataStart + cursor);
  buf.writeUInt32LE(header.length + headerPad, 0);
  header.copy(buf, 4);
  for (let i = 0; i < sections.length; i++) {
    Buffer.from(sections[i].data.buffer, sections[i].data.byteOffset, sections[i].data.byteLength)
      .copy(buf, dataStart + index[i].offset);
  }

  fs.writeFileSync(path.join(OUT_DIR, filename), buf);
  return buf.length;
}

function bakeOverlay(): void {
  const overviewPath = path.join(TILES_DIR, 'overview.json');
  if (!fs.existsSync(overviewPath)) {
    console.warn('overview.json missing — skipping overlay bake');
    return;
  }

  console.log('Baking city overlay...');
  const t0 = Date.now();
  const src = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));
  const built = buildOverlay(src);

  const sections: OverlaySection[] = [];
  for (const cls of ROAD_CLASS_ORDER) {
    const arr = built.roads[cls];
    if (arr && arr.length) {
      sections.push({ name: `road:${cls}`, data: arr });
      const uv = built.roadsUv[cls];
      if (uv && uv.length) sections.push({ name: `roaduv:${cls}`, data: uv });
    }
  }
  if (built.water.length) sections.push({ name: 'water', data: built.water });
  if (built.riverBank.length) sections.push({ name: 'riverBank', data: built.riverBank });
  if (built.parks.length) sections.push({ name: 'parks', data: built.parks });
  if (built.bridgeDeck.length) sections.push({ name: 'bridgeDeck', data: built.bridgeDeck });
  if (built.bridgePier.length) sections.push({ name: 'bridgePier', data: built.bridgePier });
  if (built.bridgeRail.length) sections.push({ name: 'bridgeRail', data: built.bridgeRail });
  if (built.flyoverPiers.length) sections.push({ name: 'flyoverPiers', data: built.flyoverPiers });
  if (built.flyoverBarriers.length) sections.push({ name: 'flyoverBarriers', data: built.flyoverBarriers });
  if (built.medianKerb.length) sections.push({ name: 'medianKerb', data: built.medianKerb });
  if (built.medianGrass.length) sections.push({ name: 'medianGrass', data: built.medianGrass });
  if (built.markings.length) sections.push({ name: 'markings', data: built.markings });
  if (built.railBed.length) sections.push({ name: 'railBed', data: built.railBed });
  if (built.railRails.length) sections.push({ name: 'railRails', data: built.railRails });
  if (built.metroDeck.length) sections.push({ name: 'metroDeck', data: built.metroDeck });
  if (built.metroCanopy.length) sections.push({ name: 'metroCanopy', data: built.metroCanopy });
  if (built.metroColumn.length) sections.push({ name: 'metroColumn', data: built.metroColumn });
  // Truss and mass are the silhouette — what makes a truss bridge read as one
  // from a distance — so they stay in the blocking buffer. Rails and lamp masts
  // are filigree only visible up close, so they ride with the sleepers.
  if (built.structTruss.length) sections.push({ name: 'structTruss', data: built.structTruss });
  if (built.structMass.length) sections.push({ name: 'structMass', data: built.structMass });

  // Sleepers are 531 km of ballasted track at 2.6 m spacing — 14 MB, and never
  // shown above 900 m altitude. Keeping them out of the always-fetched buffer is
  // the difference between a 10 MB and a 24 MB blocking load, so they go into a
  // companion file the client pulls only once the camera is low enough.
  const detail: OverlaySection[] = [];
  if (built.railSleepers.length) detail.push({ name: 'railSleepers', data: built.railSleepers });
  if (built.structRail.length) detail.push({ name: 'structRail', data: built.structRail });
  if (built.structLamp.length) detail.push({ name: 'structLamp', data: built.structLamp });

  const meta = {
    crossings: built.crossings,
    elevated: built.elevated,
  };
  const mainBytes = writeSectionFile('overlay.bin', sections, meta);
  const detailBytes = detail.length ? writeSectionFile('overlay_detail.bin', detail, meta) : 0;

  console.log(`  overlay ${(mainBytes / 1048576).toFixed(1)} MB, ` +
              `${built.crossings} river crossings, ${built.elevated} elevated profiles, ` +
              `${sections.length} sections, ${Date.now() - t0}ms`);
  console.log(`  detail  ${(detailBytes / 1048576).toFixed(1)} MB (lazy, street altitude only)`);
  console.log(`  rail: bed ${built.railBed.length / 3} verts, ` +
              `sleepers ${built.railSleepers.length / 3}, rails ${built.railRails.length / 3}`);
  console.log(`  metro: ${built.stations} elevated stations placed on the alignment`);
  console.log(`  named structures detailed: ${built.namedStructures} ` +
              `(rail ${built.structRail.length / 3}, lamp ${built.structLamp.length / 3}, ` +
              `steel ${built.structTruss.length / 3}, mass ${built.structMass.length / 3} verts)`);

  console.log(`\nDone.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
