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
import * as THREE from 'three';
import { isInsideLandmark } from '../src/city/landmarkRegistry';
import { buildOverlay, ROAD_CLASS_ORDER } from '../src/city/overlayGeometry';

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
const RELIEF_MIN_HEIGHT = 21;
const RELIEF_MIN_AREA = 1600;

const MAGIC = 0x304c484c; // 'LHL0'
const VERSION = 1;
const HEADER_BYTES = 32;

interface Pt { x: number; z: number }
interface Bldg { id: string; points: Pt[]; height: number }

/**
 * Must stay byte-identical to SeededRNG.hashString in src/city/rng.ts. A building
 * baked into the HLOD and the same building streamed at LOD 2/3 have to resolve to
 * the same palette entry, or its colour changes as you zoom in.
 */
function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Shoelace area over (x, z). Negative means clockwise viewed from +Y. */
function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return a / 2;
}

/** Drop repeated points and any duplicated closing vertex. */
function cleanRing(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(p.x - last.x) < 0.05 && Math.abs(p.z - last.z) < 0.05) continue;
    out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && Math.abs(first.x - last.x) < 0.05 && Math.abs(first.z - last.z) < 0.05) {
    out.pop();
  }
  return out;
}

/**
 * Growable interleaved vertex sink. Positions and packs are kept in parallel
 * typed arrays and doubled on demand — far cheaper than pushing onto JS arrays
 * when we are emitting hundreds of millions of components.
 */
class VertexSink {
  pos: Int16Array;
  pack: Uint8Array;
  count = 0;

  constructor(initial = 1 << 16) {
    this.pos = new Int16Array(initial * 3);
    this.pack = new Uint8Array(initial * 4);
  }

  private grow(): void {
    const cap = this.pos.length / 3;
    const next = cap * 2;
    const p = new Int16Array(next * 3);
    p.set(this.pos);
    this.pos = p;
    const k = new Uint8Array(next * 4);
    k.set(this.pack);
    this.pack = k;
  }

  push(qx: number, qy: number, qz: number, b0: number, b1: number, b2: number, b3: number): void {
    if (this.count >= this.pos.length / 3) this.grow();
    const i3 = this.count * 3;
    this.pos[i3] = qx;
    this.pos[i3 + 1] = qy;
    this.pos[i3 + 2] = qz;
    const i4 = this.count * 4;
    this.pack[i4] = b0;
    this.pack[i4 + 1] = b1;
    this.pack[i4 + 2] = b2;
    this.pack[i4 + 3] = b3;
    this.count++;
  }
}

interface SuperTile {
  key: string;
  sx: number;
  sz: number;
  originX: number;
  originZ: number;
  fabric: VertexSink;
  relief: VertexSink;
  buildings: number;
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
      fabric: new VertexSink(),
      relief: new VertexSink(),
      buildings: 0,
    };
    superTiles.set(key, st);
  }
  return st;
}

const qXZ = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v / SCALE_XZ)));
const qY = (v: number) => Math.max(0, Math.min(32767, Math.round(v / SCALE_Y)));

/** Emit one building's geometry into its super-tile. */
function emitBuilding(b: Bldg): void {
  const ring = cleanRing(b.points);
  if (ring.length < 3) return;

  const height = Math.max(2, Math.min(Y_RANGE - 1, b.height || 8));

  // Centroid + bbox drive super-tile assignment, area and orientation.
  let cx = 0, cz = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of ring) {
    cx += p.x; cz += p.z;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  cx /= ring.length;
  cz /= ring.length;

  const area = Math.abs(signedArea(ring));
  if (area < 8) return; // sub-shed noise, invisible at every scale we render

  // Landmarks get dedicated geometry (src/city/landmarks.ts); drop the generic
  // extrusions that would otherwise poke through them.
  if (isInsideLandmark(cx, cz)) return;

  const st = getSuperTile(cx, cz);
  st.buildings++;

  const hash = hashString(b.id) & 0xff;
  const hNorm = Math.round(Math.min(1, height / 80) * 255);

  // Class is derived from real footprint size + height, not invented:
  // 0 = small/residential, 1 = large-footprint commercial, 2 = tall commercial.
  let cls = 0;
  if (height >= 25) cls = 2;
  else if (area >= 1200) cls = 1;

  // Longest-edge orientation, quantised to 32 steps. Lets the shader align
  // facade banding and window grids with the building instead of world axes.
  let bestLen = -1, bestAng = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const dx = ring[i].x - ring[j].x;
    const dz = ring[i].z - ring[j].z;
    const l = dx * dx + dz * dz;
    if (l > bestLen) { bestLen = l; bestAng = Math.atan2(dz, dx); }
  }
  const orient = Math.round(((bestAng + Math.PI) / (Math.PI * 2)) * 31) & 0x1f;

  const flagsRoof = 1 | (cls << 1) | (orient << 3);
  const flagsWall = 0 | (cls << 1) | (orient << 3);

  const ox = st.originX;
  const oz = st.originZ;

  // ── Roof cap (triangulated real footprint) ────────────────────────────────
  // Wound so the surface faces +Y. THREE's triangulator is winding-agnostic, so
  // each output triangle is checked and flipped individually.
  const contour = ring.map((p) => new THREE.Vector2(p.x, p.z));
  let tris: number[][] = [];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    return; // self-intersecting footprint — skip rather than emit garbage
  }

  const roofY = qY(height);
  for (const t of tris) {
    let [a, bIdx, c] = t;
    const pa = ring[a], pb = ring[bIdx], pc = ring[c];
    if (!pa || !pb || !pc) continue;
    // Cross product z-component in (x,z); negative => faces +Y.
    const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
    const order = cross > 0 ? [a, c, bIdx] : [a, bIdx, c];
    for (const idx of order) {
      const p = ring[idx];
      st.fabric.push(qXZ(p.x - ox), roofY, qXZ(p.z - oz), hash, hNorm, 255, flagsRoof);
    }
  }

  // ── Relief walls (prominent buildings only) ───────────────────────────────
  if (height < RELIEF_MIN_HEIGHT && area < RELIEF_MIN_AREA) return;

  // Baked contact AO: dark where the wall meets the ground, clean at the top.
  // This is the cheap substitute for a screen-space AO pass and is what gives
  // buildings their ground contact and street-canyon depth.
  const aoBase = 96;
  const aoTop = 255;

  // Walls need the ring wound consistently so outward faces are front-facing.
  const ringCW = signedArea(ring) > 0 ? [...ring].reverse() : ring;

  for (let i = 0; i < ringCW.length; i++) {
    const p1 = ringCW[i];
    const p2 = ringCW[(i + 1) % ringCW.length];

    const x1 = qXZ(p1.x - ox), z1 = qXZ(p1.z - oz);
    const x2 = qXZ(p2.x - ox), z2 = qXZ(p2.z - oz);
    const y0 = 0, y1 = roofY;

    const push = (qx: number, qy: number, qz: number, ao: number) =>
      st.relief.push(qx, qy, qz, hash, hNorm, ao, flagsWall);

    // Two triangles per wall quad.
    push(x1, y0, z1, aoBase);
    push(x2, y0, z2, aoBase);
    push(x2, y1, z2, aoTop);

    push(x1, y0, z1, aoBase);
    push(x2, y1, z2, aoTop);
    push(x1, y1, z1, aoTop);
  }

  // Relief buildings also get their roof in the relief stream so that at close
  // range the fabric layer can be hidden entirely without losing roof surfaces.
  for (const t of tris) {
    let [a, bIdx, c] = t;
    const pa = ring[a], pb = ring[bIdx], pc = ring[c];
    if (!pa || !pb || !pc) continue;
    const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
    const order = cross > 0 ? [a, c, bIdx] : [a, bIdx, c];
    for (const idx of order) {
      const p = ring[idx];
      st.relief.push(qXZ(p.x - ox), roofY, qXZ(p.z - oz), hash, hNorm, 255, flagsRoof);
    }
  }
}

/**
 * Fabric and relief are written to separate files. Full City only ever needs the
 * fabric stream, so bundling both would force it to download ~4x the bytes it uses.
 */
function writeStream(st: SuperTile, sink: VertexSink, suffix: 'f' | 'r'): number {
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
    const list: Bldg[] = data?.lod2?.buildings || [];
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
      fabricBytes,
      reliefBytes,
    });
  }

  // Sort by building count so the client can prioritise dense super-tiles first.
  entries.sort((a, b) => b.buildings - a.buildings);

  const manifest = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    superTileSize: SUPER,
    quantisation: { scaleXZ: SCALE_XZ, scaleY: SCALE_Y },
    reliefThreshold: { minHeight: RELIEF_MIN_HEIGHT, minArea: RELIEF_MIN_AREA },
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
    if (arr && arr.length) sections.push({ name: `road:${cls}`, data: arr });
  }
  if (built.water.length) sections.push({ name: 'water', data: built.water });
  if (built.parks.length) sections.push({ name: 'parks', data: built.parks });
  if (built.bridgeDeck.length) sections.push({ name: 'bridgeDeck', data: built.bridgeDeck });
  if (built.bridgePier.length) sections.push({ name: 'bridgePier', data: built.bridgePier });
  if (built.bridgeRail.length) sections.push({ name: 'bridgeRail', data: built.bridgeRail });
  if (built.flyoverPiers.length) sections.push({ name: 'flyoverPiers', data: built.flyoverPiers });
  if (built.flyoverBarriers.length) sections.push({ name: 'flyoverBarriers', data: built.flyoverBarriers });
  if (built.railBed.length) sections.push({ name: 'railBed', data: built.railBed });
  if (built.railRails.length) sections.push({ name: 'railRails', data: built.railRails });
  if (built.metroDeck.length) sections.push({ name: 'metroDeck', data: built.metroDeck });
  if (built.metroCanopy.length) sections.push({ name: 'metroCanopy', data: built.metroCanopy });
  if (built.metroColumn.length) sections.push({ name: 'metroColumn', data: built.metroColumn });

  // Sleepers are 531 km of ballasted track at 2.6 m spacing — 14 MB, and never
  // shown above 900 m altitude. Keeping them out of the always-fetched buffer is
  // the difference between a 10 MB and a 24 MB blocking load, so they go into a
  // companion file the client pulls only once the camera is low enough.
  const detail: OverlaySection[] = [];
  if (built.railSleepers.length) detail.push({ name: 'railSleepers', data: built.railSleepers });

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

  console.log(`\nDone.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
