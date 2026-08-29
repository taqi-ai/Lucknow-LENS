/**
 * spatialIndex — uniform-grid indices over infrastructure geometry.
 *
 * Shared by the two preprocessing passes that both need "is this point inside
 * something it should not be inside": building suppression and vegetation
 * placement. Keeping one implementation means the two passes cannot drift into
 * disagreeing about where a road is.
 */

export interface Pt { x: number; z: number }

export interface Corridor {
  ax: number; az: number; bx: number; bz: number;
  /** Half-width of the exclusion, metres. */
  half: number;
}

/** Spatial hash cell, metres. */
export const CELL = 250;

export function centroid(ring: Pt[]): Pt {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    a += f;
    cx += (ring[j].x + ring[i].x) * f;
    cz += (ring[j].z + ring[i].z) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of ring) { sx += p.x; sz += p.z; }
    return { x: sx / ring.length, z: sz / ring.length };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export function pointInRing(px: number, pz: number, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > pz) !== (b.z > pz) &&
        px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return Math.abs(a / 2);
}

export function segDist2(px: number, pz: number, c: Corridor): number {
  const dx = c.bx - c.ax, dz = c.bz - c.az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - c.ax) * dx + (pz - c.az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = c.ax + t * dx, qz = c.az + t * dz;
  return (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
}

/** Uniform grid over line corridors (roads, rail, watercourses). */
export class CorridorIndex {
  private cells = new Map<string, Corridor[]>();
  public count = 0;

  add(c: Corridor): void {
    this.count++;
    const x0 = Math.floor(Math.min(c.ax, c.bx) / CELL);
    const x1 = Math.floor(Math.max(c.ax, c.bx) / CELL);
    const z0 = Math.floor(Math.min(c.az, c.bz) / CELL);
    const z1 = Math.floor(Math.max(c.az, c.bz) / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        let b = this.cells.get(k);
        if (!b) { b = []; this.cells.set(k, b); }
        b.push(c);
      }
    }
  }

  /** True if the point is inside any corridor, optionally widened by `pad`. */
  hits(px: number, pz: number, pad = 0): boolean {
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const b = this.cells.get(`${gx + dx},${gz + dz}`);
        if (!b) continue;
        for (const c of b) {
          const r = c.half + pad;
          if (segDist2(px, pz, c) < r * r) return true;
        }
      }
    }
    return false;
  }
}

/** Uniform grid over polygon rings (water bodies, parks, aprons). */
export class AreaIndex {
  private cells = new Map<string, Pt[][]>();
  public count = 0;

  add(ring: Pt[]): void {
    if (ring.length < 3) return;
    this.count++;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const p of ring) {
      if (p.x < mnx) mnx = p.x;
      if (p.x > mxx) mxx = p.x;
      if (p.z < mnz) mnz = p.z;
      if (p.z > mxz) mxz = p.z;
    }
    for (let gx = Math.floor(mnx / CELL); gx <= Math.floor(mxx / CELL); gx++) {
      for (let gz = Math.floor(mnz / CELL); gz <= Math.floor(mxz / CELL); gz++) {
        const k = `${gx},${gz}`;
        let b = this.cells.get(k);
        if (!b) { b = []; this.cells.set(k, b); }
        b.push(ring);
      }
    }
  }

  hits(px: number, pz: number): boolean {
    const b = this.cells.get(`${Math.floor(px / CELL)},${Math.floor(pz / CELL)}`);
    if (!b) return false;
    for (const ring of b) if (pointInRing(px, pz, ring)) return true;
    return false;
  }
}
