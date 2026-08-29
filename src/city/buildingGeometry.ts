/**
 * buildingGeometry — dependency-free footprint triangulation and extrusion.
 *
 * Shared by the tile worker (src/city/tileWorker.ts) and mirrored by the offline
 * baker (scripts/bake_hlod.ts) so a building looks identical whether it arrives via
 * HLOD or via full-detail streaming.
 *
 * Emits the same interleaved pair the HLOD uses:
 *   pos  Float32 x3   tile-local metres
 *   pack Uint8   x4   hash | heightNorm | bakedAO | flags
 *
 * No normals: buildings are hard-edged and BuildingMaterialSystem reconstructs flat
 * normals per-fragment from derivatives.
 */

export interface Pt { x: number; z: number }

export interface BuildingInput {
  id: string;
  points: Pt[];
  height: number;
}

export interface BuiltGeometry {
  pos: Float32Array;
  pack: Uint8Array;
  count: number;
}

/** Byte-identical to SeededRNG.hashString so HLOD and streamed tiles agree. */
export function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return a / 2;
}

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
  if (out.length > 1 && first && last &&
      Math.abs(first.x - last.x) < 0.05 && Math.abs(first.z - last.z) < 0.05) {
    out.pop();
  }
  return out;
}

/**
 * Ear-clipping triangulation for simple polygons. Building footprints are small and
 * near-convex, so O(n^2) is comfortably fast and avoids pulling three.js (~600 KB)
 * into the worker bundle just for ShapeUtils.
 */
export function triangulate(ring: Pt[]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Work on a CCW copy (positive shoelace) so the ear test has a consistent sign.
  const ccw = signedArea(ring) < 0;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? n - 1 - i : i);

  const area2 = (a: Pt, b: Pt, c: Pt) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

  const inTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => {
    const d1 = area2(p, a, b);
    const d2 = area2(p, b, c);
    const d3 = area2(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  const out: number[] = [];
  let guard = idx.length * 3;

  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      const a = ring[i0], b = ring[i1], c = ring[i2];

      if (area2(a, b, c) <= 0) continue; // reflex vertex

      let contains = false;
      for (let j = 0; j < idx.length; j++) {
        const k = idx[j];
        if (k === i0 || k === i1 || k === i2) continue;
        if (inTriangle(ring[k], a, b, c)) { contains = true; break; }
      }
      if (contains) continue;

      out.push(i0, i1, i2);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    // Degenerate/self-intersecting footprint — fan it rather than dropping it.
    if (!clipped) break;
  }

  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/** Growable Float32/Uint8 vertex sink. */
class Sink {
  pos: Float32Array;
  pack: Uint8Array;
  count = 0;

  constructor(initial = 4096) {
    this.pos = new Float32Array(initial * 3);
    this.pack = new Uint8Array(initial * 4);
  }

  private grow(): void {
    const next = (this.pos.length / 3) * 2;
    const p = new Float32Array(next * 3); p.set(this.pos); this.pos = p;
    const k = new Uint8Array(next * 4); k.set(this.pack); this.pack = k;
  }

  push(x: number, y: number, z: number, b0: number, b1: number, b2: number, b3: number): void {
    if (this.count >= this.pos.length / 3) this.grow();
    const i3 = this.count * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    const i4 = this.count * 4;
    this.pack[i4] = b0; this.pack[i4 + 1] = b1; this.pack[i4 + 2] = b2; this.pack[i4 + 3] = b3;
    this.count++;
  }

  finish(): BuiltGeometry {
    return {
      pos: this.pos.slice(0, this.count * 3),
      pack: this.pack.slice(0, this.count * 4),
      count: this.count,
    };
  }
}

/**
 * Build merged wall + roof geometry for a set of footprints.
 * @param originX/originZ subtracted from every coordinate so the buffer stays in
 *        tile-local space and keeps float precision 20 km from the origin.
 */
export function buildBuildings(
  buildings: BuildingInput[],
  originX: number,
  originZ: number,
  /** Return true to drop a footprint — used to clear space for landmark geometry. */
  exclude?: (x: number, z: number) => boolean,
): BuiltGeometry {
  const sink = new Sink(Math.max(4096, buildings.length * 40));

  for (const b of buildings) {
    if (!b?.points || b.points.length < 3) continue;
    const ring = cleanRing(b.points);
    if (ring.length < 3) continue;

    const height = Math.max(2, Math.min(499, b.height || 8));
    const area = Math.abs(signedArea(ring));
    if (area < 8) continue;

    if (exclude) {
      let cx = 0, cz = 0;
      for (const p of ring) { cx += p.x; cz += p.z; }
      if (exclude(cx / ring.length, cz / ring.length)) continue;
    }

    const hash = hashString(b.id) & 0xff;
    const hNorm = Math.round(Math.min(1, height / 80) * 255);

    let cls = 0;
    if (height >= 25) cls = 2;
    else if (area >= 1200) cls = 1;

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

    const aoBase = 96;
    const aoTop = 255;

    // ── Walls ────────────────────────────────────────────────────────────────
    const ringCW = signedArea(ring) > 0 ? [...ring].reverse() : ring;
    for (let i = 0; i < ringCW.length; i++) {
      const p1 = ringCW[i];
      const p2 = ringCW[(i + 1) % ringCW.length];
      const x1 = p1.x - originX, z1 = p1.z - originZ;
      const x2 = p2.x - originX, z2 = p2.z - originZ;

      sink.push(x1, 0, z1, hash, hNorm, aoBase, flagsWall);
      sink.push(x2, 0, z2, hash, hNorm, aoBase, flagsWall);
      sink.push(x2, height, z2, hash, hNorm, aoTop, flagsWall);

      sink.push(x1, 0, z1, hash, hNorm, aoBase, flagsWall);
      sink.push(x2, height, z2, hash, hNorm, aoTop, flagsWall);
      sink.push(x1, height, z1, hash, hNorm, aoTop, flagsWall);
    }

    // ── Roof ─────────────────────────────────────────────────────────────────
    const tris = triangulate(ring);
    for (let t = 0; t < tris.length; t += 3) {
      const pa = ring[tris[t]], pb = ring[tris[t + 1]], pc = ring[tris[t + 2]];
      if (!pa || !pb || !pc) continue;
      // Flip so the cap faces +Y regardless of source winding.
      const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
      const order = cross > 0 ? [pa, pc, pb] : [pa, pb, pc];
      for (const p of order) {
        sink.push(p.x - originX, height, p.z - originZ, hash, hNorm, 255, flagsRoof);
      }
    }
  }

  return sink.finish();
}
