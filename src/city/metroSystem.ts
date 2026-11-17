import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';

/**
 * MetroSystem — Lucknow Metro (Red Line) as its own transport system, separate from
 * the road, rail and flyover generators.
 *
 * Data: public/landmarks/metro.json (scripts/py/build_metro.py) — Overture subway
 * alignment split at its mapped tunnel ranges, rail level 12.5 m with portal ramps, and
 * the 21 Overture station points (17 elevated, 4 underground).
 *
 * Built once into three merged meshes (concrete, track/steel, glass-roof) plus an
 * InstancedMesh of train cars animated along the main elevated alignment:
 *   viaduct  U-girder (9.4 m wide, 2.1 m deep) with parapet walls, on single-column
 *            T-piers every 30 m with a pier cap; columns stop at the ground
 *   track    two tracks, four rails, on the deck
 *   stations elevated: platform + concourse slab, roof, end stairs; underground:
 *            surface entrance kiosks only
 *   tunnel   a faint dashed red line on the ground marking the bored alignment
 *   depot    at-grade yard tracks
 * Phase 1B (Charbagh–Vasant Kunj) is under construction and deliberately not drawn.
 */

interface MetroLine { kind: 'viaduct' | 'tunnel' | 'grade'; name?: string; pts: number[][] }
interface MetroStation { name: string; x: number; z: number; y: number; underground: boolean; heading: number }
interface MetroData { railLevel: number; lines: MetroLine[]; stations: MetroStation[] }

const DECK_HALF = 4.7;
const DECK_DEPTH = 2.1;
const PIER_SPACING = 30;
const CAR_LEN = 20.5;
const CARS = 4;

class Sink {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  setColor(hex: number) { this.c.setHex(hex); return this; } // setHex already yields linear (ColorManagement)
  tri(a: number[], b: number[], c: number[]) {
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  quad(a: number[], b: number[], c: number[], d: number[]) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Box between two points along a direction, both faces of every side (robust winding). */
  box(cx: number, cz: number, ang: number, hl: number, hw: number, y0: number, y1: number) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u: number, v: number, y: number) => [cx + u * ca - v * sa, y, cz + u * sa + v * ca];
    const c = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = c[i], [u1, v1] = c[(i + 1) % 4];
      this.quad(P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1));
    }
    this.quad(P(-hl, -hw, y1), P(hl, -hw, y1), P(hl, hw, y1), P(-hl, hw, y1));
    this.quad(P(-hl, -hw, y0), P(-hl, hw, y0), P(hl, hw, y0), P(hl, -hw, y0));
  }
  mesh(mat: THREE.Material, name: string) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
}

/** Extrude a cross-section (u across, y) along a 3D polyline, as a closed strip set. */
function sweep(s: Sink, pts: number[][], section: Array<[number, number]>, yOff = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const L = Math.hypot(dx, dz);
    if (L < 0.05) continue;
    const nx = -dz / L, nz = dx / L;
    for (let k = 0; k < section.length - 1; k++) {
      const [u0, y0] = section[k], [u1, y1] = section[k + 1];
      const A = [a[0] + nx * u0, a[1] + y0 + yOff, a[2] + nz * u0];
      const B = [b[0] + nx * u0, b[1] + y0 + yOff, b[2] + nz * u0];
      const C = [b[0] + nx * u1, b[1] + y1 + yOff, b[2] + nz * u1];
      const D = [a[0] + nx * u1, a[1] + y1 + yOff, a[2] + nz * u1];
      s.quad(A, B, C, D); // single-sided; the material is DoubleSide (three flips back-face normals)
    }
  }
}

export class MetroSystem {
  public readonly group = new THREE.Group();
  private concreteMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  private steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  private tunnelMat = new THREE.MeshBasicMaterial({ color: 0xc23a2c, transparent: true, opacity: 0.35, depthWrite: false });
  private trainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35, emissive: 0x000000 });
  private trains: THREE.InstancedMesh | null = null;
  private routes: Array<{ pts: number[][]; s: number[]; total: number; speed: number; offset: number }> = [];
  private dummy = new THREE.Object3D();
  private night = false;

  public async init(scene: THREE.Scene): Promise<void> {
    let data: MetroData;
    try { data = await loadJSON<MetroData>('/landmarks/metro.json'); } catch (e) { console.warn('[Metro] metro.json missing', e); return; }
    this.group.name = 'MetroSystem';
    const conc = new Sink(), steel = new Sink(), tunnel = new Sink();

    for (const l of data.lines) {
      if (l.kind === 'viaduct') {
        // U-girder: soffit, webs, parapets (section measured from rail level).
        conc.setColor(0xbdb8ae);
        sweep(conc, l.pts, [[-DECK_HALF, -DECK_DEPTH], [DECK_HALF, -DECK_DEPTH]]);
        sweep(conc, l.pts, [[-DECK_HALF, -DECK_DEPTH], [-DECK_HALF, 1.1]]);
        sweep(conc, l.pts, [[DECK_HALF, -DECK_DEPTH], [DECK_HALF, 1.1]]);
        conc.setColor(0x9a968e);
        sweep(conc, l.pts, [[-DECK_HALF, -0.25], [DECK_HALF, -0.25]]);
        // Rails: two tracks at +-2.05 m, standard gauge.
        steel.setColor(0x6d6a66);
        for (const tc of [-2.05, 2.05]) for (const r of [-0.72, 0.72]) {
          sweep(steel, l.pts, [[tc + r - 0.05, -0.05], [tc + r + 0.05, -0.05]]);
        }
        // T-piers every 30 m where the deck is high enough to stand on one.
        let carry = PIER_SPACING / 2;
        conc.setColor(0xc8c3b8);
        for (let i = 0; i < l.pts.length - 1; i++) {
          const a = l.pts[i], b = l.pts[i + 1];
          const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
          const ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
          for (let d = carry; d < L; d += PIER_SPACING) {
            const t = d / L;
            const y = a[1] + (b[1] - a[1]) * t;
            if (y < 4) continue;
            const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
            conc.box(x, z, ang, 0.9, 0.9, 0, y - DECK_DEPTH - 1.2);
            conc.box(x, z, ang, 1.0, 3.4, y - DECK_DEPTH - 1.2, y - DECK_DEPTH);
          }
          carry = ((carry - L) % PIER_SPACING + PIER_SPACING) % PIER_SPACING;
        }
        // Tunnel portal: where the ramp dives through the ground surface, put a concrete
        // headwall with a dark opening. Beneath it the line is simply below the terrain.
        for (let i = 0; i < l.pts.length - 1; i++) {
          const a = l.pts[i], b = l.pts[i + 1];
          if ((a[1] < 0.2) === (b[1] < 0.2)) continue;
          const t = (0.2 - a[1]) / (b[1] - a[1]);
          const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
          const ang = Math.atan2(b[2] - a[2], b[0] - a[0]);
          conc.setColor(0xb4afa5); conc.box(x, z, ang, 0.8, 6.2, -1.5, 5.4);
          steel.setColor(0x181716); steel.box(x, z, ang, 1.0, 3.0, -0.6, 4.2);
        }
      } else if (l.kind === 'tunnel') {
        // Subtle dashed line marking the bored alignment underneath.
        let acc = 0;
        for (let i = 0; i < l.pts.length - 1; i++) {
          const a = l.pts[i], b = l.pts[i + 1];
          const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
          const ux = (b[0] - a[0]) / (L || 1), uz = (b[2] - a[2]) / (L || 1);
          for (let d = 0; d < L; d += 1) {
            if (Math.floor((acc + d) / 12) % 2) continue;
            const x0 = a[0] + ux * d, z0 = a[2] + uz * d, x1 = x0 + ux, z1 = z0 + uz;
            tunnel.quad([x0 - uz * 1.2, 0.5, z0 + ux * 1.2], [x1 - uz * 1.2, 0.5, z1 + ux * 1.2],
              [x1 + uz * 1.2, 0.5, z1 - ux * 1.2], [x0 + uz * 1.2, 0.5, z0 - ux * 1.2]);
          }
          acc += L;
        }
      } else {
        steel.setColor(0x5b5650);
        sweep(steel, l.pts.map((p) => [p[0], 0.3, p[2]]), [[-1.6, 0], [1.6, 0]]);
        steel.setColor(0x77736d);
        for (const r of [-0.72, 0.72]) sweep(steel, l.pts.map((p) => [p[0], 0.45, p[2]]), [[r - 0.05, 0], [r + 0.05, 0]]);
      }
    }

    for (const st of data.stations) {
      if (st.underground) {
        // Surface entrances: two glazed kiosks either side of the alignment.
        conc.setColor(0xd8d4cc);
        for (const side of [-1, 1]) {
          const x = st.x - Math.sin(st.heading) * 14 * side, z = st.z + Math.cos(st.heading) * 14 * side;
          conc.box(x, z, st.heading, 6, 3, 0, 3.4);
          steel.setColor(0xc23a2c);
          steel.box(x, z, st.heading, 6.4, 3.4, 3.4, 3.8);
        }
        continue;
      }
      const y = st.y;
      conc.setColor(0xd9d5cc);
      // Concourse slab mid-height, platform level box, and roof.
      conc.box(st.x, st.z, st.heading, 70, 11, y - DECK_DEPTH - 5.5, y - DECK_DEPTH - 4.6);
      conc.box(st.x, st.z, st.heading, 68, 10.5, y - 0.4, y + 0.9);
      for (let i = -3; i <= 3; i++) {
        for (const side of [-1, 1]) {
          const u = i * 20;
          conc.box(st.x + Math.cos(st.heading) * u - Math.sin(st.heading) * side * 9.5,
            st.z + Math.sin(st.heading) * u + Math.cos(st.heading) * side * 9.5, st.heading, 0.6, 0.6, 0, y + 7.2);
        }
      }
      steel.setColor(0xc23a2c);
      steel.box(st.x, st.z, st.heading, 74.2, 12.7, y + 7.1, y + 7.45);   // red fascia band
      steel.setColor(0xe6e2da);
      steel.box(st.x, st.z, st.heading, 74, 12.5, y + 7.45, y + 8.2);     // light roof
      // Stair/lift blocks at both ends of the concourse.
      conc.setColor(0xcfcac0);
      for (const side of [-1, 1]) {
        const x = st.x - Math.sin(st.heading) * side * 15, z = st.z + Math.cos(st.heading) * side * 15;
        conc.box(x, z, st.heading, 5, 2.5, 0, y - DECK_DEPTH - 4.6);
      }
    }

    const concMesh = conc.mesh(this.concreteMat, 'metroConcrete');
    const steelMesh = steel.mesh(this.steelMat, 'metroSteel');
    concMesh.updateMatrix(); steelMesh.updateMatrix();
    this.group.add(concMesh, steelMesh);
    if (tunnel.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tunnel.pos, 3));
      const tm = new THREE.Mesh(g, this.tunnelMat);
      tm.name = 'metroTunnel';
      tm.renderOrder = 2;
      this.group.add(tm);
    }

    // Trains: one 4-car set each way on the two long elevated stretches.
    const main = data.lines.filter((l) => l.kind === 'viaduct' && l.pts.length > 50);
    for (const l of main) {
      const s = [0];
      for (let i = 1; i < l.pts.length; i++) s.push(s[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][2] - l.pts[i - 1][2]));
      const total = s[s.length - 1];
      this.routes.push({ pts: l.pts, s, total, speed: 16, offset: (this.routes.length * 0.37) % 1 });
    }
    if (this.routes.length) this.trains = this.buildTrainMesh(this.routes.length * CARS);
    if (this.trains) this.group.add(this.trains);
    scene.add(this.group);
  }

  private buildTrainMesh(count: number): THREE.InstancedMesh {
    // One car: rounded-ish body, roof, window band, red livery stripe, bogies.
    const s = new Sink();
    const L = CAR_LEN / 2 - 0.4, W = 1.45;
    s.setColor(0xe9ecef); s.box(0, 0, 0, L, W, 0.9, 3.7);
    s.setColor(0xd6dadf); s.box(0, 0, 0, L - 0.3, W - 0.15, 3.7, 4.0);
    s.setColor(0x2a3440); s.box(0, 0, 0, L - 0.6, W + 0.02, 2.3, 3.1);
    s.setColor(0xc4262e); s.box(0, 0, 0, L - 0.2, W + 0.03, 1.5, 1.85);
    s.setColor(0x2b2b2b); s.box(-L + 3, 0, 0, 1.4, 1.1, 0.2, 0.9); s.box(L - 3, 0, 0, 1.4, 1.1, 0.2, 0.9);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
    g.computeVertexNormals();
    const m = new THREE.InstancedMesh(g, this.trainMat, count);
    m.name = 'metroTrains';
    m.frustumCulled = false;
    m.castShadow = true;
    return m;
  }

  private sample(r: { pts: number[][]; s: number[] }, d: number, out: THREE.Vector3): number {
    let lo = 0, hi = r.s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (r.s[mid] < d) lo = mid; else hi = mid; }
    const a = r.pts[lo], b = r.pts[hi];
    const t = (d - r.s[lo]) / Math.max(1e-6, r.s[hi] - r.s[lo]);
    out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    return Math.atan2(b[2] - a[2], b[0] - a[0]);
  }

  /**
   * Where a train head is right now (same ping-pong timetable as update()), so the guided tour can
   * follow a real train. Returns null before the line has loaded or if no route is above ground.
   */
  public trainHead(seconds: number): { x: number; y: number; z: number; ang: number } | null {
    const p = new THREE.Vector3();
    for (let k = 0; k < this.routes.length; k++) {
      const r = this.routes[k];
      const period = (r.total / r.speed) * 2 + 40;
      const ph = ((seconds / period + r.offset) % 1) * period;
      const run = r.total / r.speed;
      let d: number;
      if (ph < run) d = ph * r.speed; else if (ph < run + 20) d = r.total;
      else if (ph < run * 2 + 20) d = r.total - (ph - run - 20) * r.speed; else d = 0;
      d = Math.min(r.total - 1, Math.max(1, d));
      const ang = this.sample(r, d, p);
      if (p.y > 6) return { x: p.x, y: p.y, z: p.z, ang };
    }
    return null;
  }

  /** Advance the trains. `seconds` is wall time; altitude gates the work. */
  public update(seconds: number, altitude: number): void {
    if (!this.trains) return;
    this.trains.visible = altitude < 6000;
    if (!this.trains.visible) return;
    const p = new THREE.Vector3();
    let k = 0;
    this.routes.forEach((r, ri) => {
      // Ping-pong along the line, dwelling briefly at the ends.
      const period = (r.total / r.speed) * 2 + 40;
      const ph = ((seconds / period + r.offset) % 1) * period;
      const run = r.total / r.speed;
      let d: number; let dir = 1;
      if (ph < run) d = ph * r.speed;
      else if (ph < run + 20) d = r.total;
      else if (ph < run * 2 + 20) { d = r.total - (ph - run - 20) * r.speed; dir = -1; }
      else d = 0;
      for (let c = 0; c < CARS; c++) {
        const dd = Math.min(r.total - 1, Math.max(1, d - dir * c * (CAR_LEN + 0.6)));
        const ang = this.sample(r, dd, p);
        // Each direction uses its own track (2.05 m either side of the centreline).
        const off = (dir > 0 ? 2.05 : -2.05) * (ri % 2 ? -1 : 1);
        this.dummy.position.set(p.x - Math.sin(ang) * off, p.y, p.z + Math.cos(ang) * off);
        this.dummy.rotation.set(0, -ang, 0);
        this.dummy.updateMatrix();
        this.trains!.setMatrixAt(k++, this.dummy.matrix);
      }
    });
    this.trains.instanceMatrix.needsUpdate = true;
  }

  public setNightMode(night: boolean): void {
    this.night = night;
    // Lit windows at night.
    this.trainMat.emissive.setHex(night ? 0x2a2418 : 0x000000);
    this.concreteMat.color.setHex(night ? 0x6f6c66 : 0xffffff);
  }

  public setVisible(v: boolean): void { this.group.visible = v; }

  public dispose(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.group.removeFromParent();
  }
}
