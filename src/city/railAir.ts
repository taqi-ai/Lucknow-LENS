/**
 * RailAirSystem (round 3): passenger trains on the Indian Railways lines around Charbagh (some
 * standing at the platforms, some moving), and aircraft at CCS Airport (parked at the aprons, one
 * landing, one taking off) with airside shuttle buses. Instanced, low cost, data-driven:
 *   - rail lines: overview.json majorRoads with subtype 'rail' (standard_gauge), ground level
 *   - airport: AIRPORT.runways / aprons from landmarkSites.ts (Overture infrastructure)
 */
import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';
import { AIRPORT } from './landmarkSites';
import { getDeviceProfile } from './deviceProfile';

interface Pt { x: number; z: number; y?: number }
interface Line { pts: Pt[]; s: number[]; total: number }
const CHARBAGH = { x: -2599, z: 2111 };
const COACH = 23, GAP = 0.8;

function line(pts: Pt[]): Line { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return { pts, s, total: s[s.length - 1] }; }
function at(l: Line, d: number, out: THREE.Vector3): number {
  d = Math.max(0, Math.min(l.total - 0.01, d));
  let lo = 0, hi = l.s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.s[m] < d) lo = m; else hi = m; }
  const a = l.pts[lo], b = l.pts[hi], t = (d - l.s[lo]) / Math.max(1e-6, l.s[hi] - l.s[lo]);
  out.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
  return Math.atan2(b.z - a.z, b.x - a.x);
}
function colored(parts: Array<[THREE.BufferGeometry, number]>): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  for (const [g0, c] of parts) { const g = g0.toNonIndexed(), p = g.getAttribute('position'), n = g.getAttribute('normal'), cc = new THREE.Color(c); for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(cc.r, cc.g, cc.b); } }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

export class RailAirSystem {
  private group = new THREE.Group();
  private coaches: THREE.InstancedMesh | null = null;
  private engines: THREE.InstancedMesh | null = null;
  private planes: THREE.InstancedMesh | null = null;
  private buses: THREE.InstancedMesh | null = null;
  private trains: Array<{ l: Line; start: number; speed: number; n: number; dir: number; dwell: number }> = [];
  private runway: { ax: number; az: number; bx: number; bz: number } | null = null;
  private stands: Array<{ x: number; z: number; ang: number }> = [];
  private apronLoop: Line | null = null;
  private d = new THREE.Object3D();
  private v = new THREE.Vector3();

  public async init(scene: THREE.Scene): Promise<void> {
    if (getDeviceProfile().quality === 'low') return;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
    try {
      const ov = await loadJSON<{ majorRoads: Array<{ points: Pt[]; subtype?: string; type?: string; isElevated?: boolean }> }>('/overture_tiles_full/overview.json');
      const rails = ov.majorRoads.filter((r) => (r.subtype === 'rail' || r.type === 'standard_gauge') && !r.isElevated && r.points.length > 1)
        .map((r) => line(r.points)).filter((l) => l.total > 180)
        .map((l) => ({ l, dist: Math.min(...l.pts.map((p) => Math.hypot(p.x - CHARBAGH.x, p.z - CHARBAGH.z))) }))
        .filter((q) => q.dist < 2500).sort((a, b) => a.dist - b.dist);
      rails.slice(0, 14).forEach((q, i) => {
        const moving = i % 3 === 0;
        this.trains.push({ l: q.l, start: (i * 0.37) % 1, speed: moving ? 11 : 0, n: Math.min(18, Math.floor(q.l.total / (COACH + GAP)) - 1), dir: i % 2 ? 1 : -1, dwell: i });
      });
    } catch { /* no rail data */ }
    const total = this.trains.reduce((m, t) => m + Math.max(0, t.n), 0);
    if (total > 0) {
      // ICF/LHB coach: blue-white livery with a window band and roof; engine: red WAP-7 style.
      this.coaches = new THREE.InstancedMesh(colored([[box(COACH, 2.6, 3.1, 0, 2.3, 0), 0x2f5d8a], [box(COACH * 0.96, 0.6, 3.14, 0, 2.6, 0), 0xe9ecef], [box(COACH, 0.35, 3.0, 0, 3.75, 0), 0x8a8f94], [box(COACH * 0.9, 0.7, 2.6, 0, 0.75, 0), 0x2a2a2a]]), mat, total);
      this.engines = new THREE.InstancedMesh(colored([[box(20, 3.0, 3.1, 0, 2.5, 0), 0xb3261e], [box(19, 0.5, 3.14, 0, 2.3, 0), 0xe7d36a], [box(1.2, 1.1, 2.6, 9.6, 3.3, 0), 0x1d2a33], [box(18, 0.7, 2.6, 0, 0.75, 0), 0x2a2a2a]]), mat, this.trains.length);
      for (const m of [this.coaches, this.engines]) { m.frustumCulled = false; m.castShadow = true; this.group.add(m); }
    }
    // Airport: runway axis from the longest runway polygon edge; stands spread over the aprons.
    const rw = AIRPORT.runways?.[0];
    if (rw && rw.length > 3) {
      let best = 0, ax = 0, az = 0, bx = 0, bz = 0;
      for (let i = 0; i < rw.length; i++) for (let j = i + 1; j < rw.length; j++) { const L = Math.hypot(rw[j][0] - rw[i][0], rw[j][1] - rw[i][1]); if (L > best) { best = L; ax = rw[i][0]; az = rw[i][1]; bx = rw[j][0]; bz = rw[j][1]; } }
      this.runway = { ax, az, bx, bz };
    }
    for (const ap of AIRPORT.aprons ?? []) {
      const xs = ap.map((p) => p[0]), zs = ap.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const long = x1 - x0 > z1 - z0;
      const n = Math.min(6, Math.floor((long ? x1 - x0 : z1 - z0) / 55));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        this.stands.push(long ? { x: x0 + (x1 - x0) * t, z: (z0 + z1) / 2, ang: Math.PI / 2 } : { x: (x0 + x1) / 2, z: z0 + (z1 - z0) * t, ang: 0 });
      }
      if (!this.apronLoop && n > 1) this.apronLoop = line([{ x: x0 + 10, z: z0 + 10 }, { x: x1 - 10, z: z0 + 10 }, { x: x1 - 10, z: z1 - 10 }, { x: x0 + 10, z: z1 - 10 }, { x: x0 + 10, z: z0 + 10 }]);
    }
    if (this.stands.length || this.runway) {
      // Narrow-body airliner: fuselage, wings, tailplane, fin, engines (white, blue tail).
      const fus = new THREE.CylinderGeometry(1.9, 1.9, 38, 12); fus.rotateZ(Math.PI / 2); fus.translate(0, 3.6, 0);
      const nose = new THREE.ConeGeometry(1.9, 4, 12); nose.rotateZ(-Math.PI / 2); nose.translate(21, 3.6, 0);
      this.planes = new THREE.InstancedMesh(colored([[fus, 0xf3f4f5], [nose, 0xf3f4f5], [box(7, 0.4, 34, 1, 3.0, 0), 0xd9dcdf], [box(4, 0.3, 12, -16.5, 4.4, 0), 0xd9dcdf], [box(5, 7, 0.4, -17, 7.6, 0), 0x1f4e9c], [box(4.2, 1.6, 1.6, 1.5, 2.1, -6.5), 0x8c9196], [box(4.2, 1.6, 1.6, 1.5, 2.1, 6.5), 0x8c9196], [box(36, 0.5, 3.9, 0, 3.0, 0), 0x1f4e9c]]), mat, this.stands.length + 2);
      this.planes.frustumCulled = false; this.planes.castShadow = true; this.group.add(this.planes);
      this.buses = new THREE.InstancedMesh(colored([[box(12, 2.6, 2.6, 0, 1.7, 0), 0xe4e6e8], [box(11.6, 0.9, 2.64, 0, 2.2, 0), 0x2a3a48]]), mat, 3);
      this.buses.frustumCulled = false; this.group.add(this.buses);
    }
    this.group.name = 'railAir';
    scene.add(this.group);
  }

  public update(seconds: number, altitude: number): void {
    this.group.visible = altitude < 9000;
    if (!this.group.visible) return;
    const p = this.v;
    if (this.coaches && this.engines) {
      let k = 0;
      this.trains.forEach((t, ti) => {
        const span = t.n * (COACH + GAP) + 22;
        let head: number;
        if (t.speed > 0) { const run = Math.max(1, t.l.total - span); const period = (run / t.speed) * 2 + 60; const ph = ((seconds / period + t.start) % 1) * period; head = ph < run / t.speed ? span + ph * t.speed : ph < run / t.speed + 30 ? span + run : ph < (run / t.speed) * 2 + 30 ? span + run - (ph - run / t.speed - 30) * t.speed : span; }
        else head = Math.min(t.l.total - 1, span + (t.l.total - span) * t.start);
        const ang = at(t.l, head - 10, p);
        this.d.position.set(p.x, 0.5, p.z); this.d.rotation.set(0, -ang, 0); this.d.updateMatrix(); this.engines!.setMatrixAt(ti, this.d.matrix);
        for (let c = 0; c < t.n; c++) {
          const a2 = at(t.l, head - 22 - (c + 0.5) * (COACH + GAP), p);
          this.d.position.set(p.x, 0.5, p.z); this.d.rotation.set(0, -a2, 0); this.d.updateMatrix(); this.coaches!.setMatrixAt(k++, this.d.matrix);
        }
      });
      this.coaches.count = k; this.coaches.instanceMatrix.needsUpdate = true; this.engines.instanceMatrix.needsUpdate = true;
    }
    if (this.planes) {
      let i = 0;
      for (const s of this.stands) { this.d.position.set(s.x, 0.2, s.z); this.d.rotation.set(0, -s.ang, 0); this.d.updateMatrix(); this.planes.setMatrixAt(i++, this.d.matrix); }
      if (this.runway) {
        const { ax, az, bx, bz } = this.runway, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ang = Math.atan2(uz, ux);
        // Landing: 3-degree glide from 4 km out, touchdown, roll-out. Take-off the other way.
        const cyc = 140, t1 = (seconds % cyc) / cyc;
        const along = -4000 + t1 * (4000 + L * 0.6), y = Math.max(0.2, -along * 0.0524 + 0.2);
        this.d.position.set(ax + ux * along, along < 0 ? y : 0.2, az + uz * along); this.d.rotation.set(0, -ang, along < 0 ? -0.05 : 0); this.d.updateMatrix(); this.planes.setMatrixAt(i++, this.d.matrix);
        const t2 = ((seconds + 70) % cyc) / cyc, a2 = L * 0.1 + t2 * (L + 3500), y2 = a2 < L * 0.7 ? 0.2 : (a2 - L * 0.7) * 0.12;
        this.d.position.set(bx - ux * a2, y2, bz - uz * a2); this.d.rotation.set(0, -ang + Math.PI, y2 > 0.3 ? 0.14 : 0); this.d.updateMatrix(); this.planes.setMatrixAt(i++, this.d.matrix);
      }
      this.planes.count = i; this.planes.instanceMatrix.needsUpdate = true;
      if (this.buses && this.apronLoop) {
        for (let b = 0; b < 3; b++) { const a3 = at(this.apronLoop, ((seconds * 6 + b * this.apronLoop.total / 3) % this.apronLoop.total), p); this.d.position.set(p.x, 0.15, p.z); this.d.rotation.set(0, -a3, 0); this.d.updateMatrix(); this.buses.setMatrixAt(b, this.d.matrix); }
        this.buses.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
