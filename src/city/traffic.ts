/**
 * TrafficSystem (round 3, phase 2): animated vehicles on the main road network.
 *
 * Lanes come from overview.json major roads (motorway, trunk, primary, secondary, plus flyovers),
 * with the same elevation profiles the overlay uses, so vehicles ride up the ramps and across the
 * decks. Each road gets a lane in each direction (one-way pairs simply get one lane each).
 * Vehicles are pooled and only placed on lanes near the camera; everything is two instanced draws
 * (bodies, and lamps that only show at night). Vehicle count follows the device tier.
 */
import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';
import { buildElevationProfiles, classifyRoad, roadHalfWidth, ROAD_LAYER_Y, type RoadClass } from './ribbon';
import { getDeviceProfile } from './deviceProfile';
import { liftRiverCrossings } from './overlayGeometry';

interface Pt { x: number; z: number; y?: number }
interface Lane { pts: Pt[]; s: number[]; total: number; speed: number; cx: number; cz: number; r: number }

const CLASSES = new Set<RoadClass>(['motorway', 'trunk', 'primary', 'secondary', 'flyover']);
const SPEED: Partial<Record<RoadClass, number>> = { motorway: 19, trunk: 15, primary: 11, secondary: 9, flyover: 14 };
const SPACING: Partial<Record<RoadClass, number>> = { motorway: 38, trunk: 30, primary: 26, secondary: 34, flyover: 32 };

// Vehicle kinds: [length, width, height, paint palette]
const KINDS: Array<{ L: number; W: number; H: number; cols: number[]; w: number }> = [
  { L: 4.3, W: 1.8, H: 1.45, cols: [0xe8e8e6, 0x2b2d31, 0x9aa0a6, 0xb3262e, 0x24477a, 0xd9d3c4], w: 0.55 },   // car
  { L: 11, W: 2.5, H: 3.1, cols: [0xc2402c, 0x2f6a8d, 0xd8a531], w: 0.08 },                                    // bus
  { L: 2.8, W: 1.3, H: 1.7, cols: [0x2f7d3a, 0xd9b52b], w: 0.17 },                                               // auto-rickshaw
  { L: 1.9, W: 0.7, H: 1.3, cols: [0x1d1d1f, 0x8a1d1d, 0x2b3a5c], w: 0.2 },                                      // two-wheeler
];

export class TrafficSystem {
  private group = new THREE.Group();
  private lanes: Lane[] = [];
  private bodies: THREE.InstancedMesh[] = [];
  private lamps: THREE.InstancedMesh | null = null;
  private max = 0;
  private slots: Array<{ lane: number; off: number; kind: number; inst: number; dir: number }> = [];
  private dummy = new THREE.Object3D();
  private v = new THREE.Vector3();
  private night = false;
  private enabled = true;
  private lastAssign = 0;

  public async init(scene: THREE.Scene): Promise<void> {
    const q = getDeviceProfile().quality;
    this.max = q === 'low' ? 0 : q === 'medium' ? 700 : 1500;
    if (!this.max) return;
    let ov: { majorRoads: Array<{ points: Pt[]; type?: string; subtype?: string; level?: number; isElevated?: boolean; id?: string }>; waterways: never[]; greenAreas: Array<{ points: Pt[] }> };
    try { ov = await loadJSON('/overture_tiles_full/overview.json'); } catch { return; }
    const MOTOR = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;
    const roads = liftRiverCrossings(ov.majorRoads.filter((r) => r.points?.length >= 2 && r.subtype !== 'rail' && MOTOR.test(r.type ?? '')), ov.waterways ?? []);
    const parks = (ov.greenAreas ?? []).filter((g) => g.points?.length > 2 && areaOf(g.points) > 15e4);
    const inPark = (x: number, z: number) => parks.some((g) => { const P = g.points; let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; });
    const profiles = buildElevationProfiles(roads as never);
    for (const r of roads) {
      const cls = classifyRoad(r.type, r.subtype, r.level, r.isElevated);
      if (!CLASSES.has(cls)) continue;
      const mid = r.points[r.points.length >> 1];
      if (inPark(mid.x, mid.z)) continue;
      const base = (profiles.get(r as never) as Pt[] | undefined) ?? r.points;
      const half = roadHalfWidth(cls, r.type, r.id);
      for (const dir of [1, -1]) {
        const src = dir > 0 ? base : [...base].reverse();
        const off = half * 0.45;
        const pts: Pt[] = src.map((p, i) => {
          const a = src[Math.max(0, i - 1)], b = src[Math.min(src.length - 1, i + 1)];
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
          return { x: p.x + (dz / L) * off, z: p.z - (dx / L) * off, y: (p.y ?? ROAD_LAYER_Y[cls]) + 0.05 };
        });
        const s = [0];
        for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
        const total = s[s.length - 1];
        if (total < 40) continue;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
        this.lanes.push({ pts, s, total, speed: SPEED[cls] ?? 10, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 });
        (this.lanes[this.lanes.length - 1] as Lane & { gap: number }).gap = SPACING[cls] ?? 30;
      }
    }
    // Geometry per kind, with vertex colours: body, glass band, dark wheels.
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
    for (const k of KINDS) {
      // Body (paint), tapered cabin/glass, wheels, lights; buses get a window band, two-wheelers a rider.
      const parts: Array<[THREE.BufferGeometry, number]> = [];
      const bus = k.L > 8, bike = k.W < 1;
      const body = new THREE.BoxGeometry(k.L, k.H * (bus ? 0.78 : 0.5), k.W); body.translate(0, k.H * (bus ? 0.39 : 0.25) + 0.35, 0); parts.push([body, 0xffffff]);
      if (bus) { const w = new THREE.BoxGeometry(k.L * 0.96, k.H * 0.22, k.W * 1.01); w.translate(0, k.H * 0.6 + 0.35, 0); parts.push([w, 0x26343d]); }
      else if (!bike) {
        const cab = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1); cab.rotateY(Math.PI / 4); cab.scale(k.L * 0.62, k.H * 0.42, k.W * 0.92 * 1.41); cab.translate(-k.L * 0.04, k.H * 0.71 + 0.35, 0); parts.push([cab, 0x2a3540]);
      } else { const rider = new THREE.BoxGeometry(0.45, 0.8, 0.45); rider.translate(-0.1, 1.35, 0); parts.push([rider, 0x5a4a3a]); }
      for (const fx of bike ? [-0.65, 0.65] : [-k.L * 0.32, k.L * 0.32]) for (const fz of bike ? [0] : [-k.W * 0.46, k.W * 0.46]) {
        const wh = new THREE.CylinderGeometry(bike ? 0.32 : 0.36, bike ? 0.32 : 0.36, bike ? 0.12 : 0.25, 10); wh.rotateX(Math.PI / 2); wh.translate(fx, 0.36, fz); parts.push([wh, 0x161616]);
      }
      for (const fz of bike ? [0] : [-k.W * 0.35, k.W * 0.35]) {
        const hl = new THREE.BoxGeometry(0.05, 0.16, 0.3); hl.translate(k.L / 2, 0.75, fz); parts.push([hl, 0xfff3d0]);
        const tl = new THREE.BoxGeometry(0.05, 0.16, 0.3); tl.translate(-k.L / 2, 0.75, fz); parts.push([tl, 0xb3261e]);
      }
      const merged = mergeColored(parts);
      const m = new THREE.InstancedMesh(merged, mat, this.max);
      m.count = 0; m.frustumCulled = false; m.castShadow = getDeviceProfile().quality === 'high';
      this.bodies.push(m); this.group.add(m);
    }
    const lampGeo = new THREE.PlaneGeometry(0.7, 0.5);
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false, toneMapped: false, side: THREE.DoubleSide }), this.max * 2);
    this.lamps.count = 0; this.lamps.frustumCulled = false; this.lamps.visible = false;
    this.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 2 * 3), 3);
    this.group.add(this.lamps);
    this.group.name = 'traffic';
    scene.add(this.group);
  }

  public setNightMode(n: boolean): void { this.night = n; }
  public setVisible(v: boolean): void { this.enabled = v; this.group.visible = v; }

  private hash(i: number): number { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /** Re-pick which lanes carry vehicles: those nearest the camera, until the pool is full. */
  private assign(cx: number, cz: number, radius: number): void {
    const near = this.lanes.map((l, i) => ({ i, d: Math.hypot(l.cx - cx, l.cz - cz) - l.r })).filter((q) => q.d < radius).sort((a, b) => a.d - b.d);
    this.slots = [];
    const perKind = new Array(KINDS.length).fill(0);
    for (const { i } of near) {
      const l = this.lanes[i] as Lane & { gap: number };
      const n = Math.max(1, Math.floor(l.total / l.gap));
      for (let j = 0; j < n && this.slots.length < this.max; j++) {
        const h = this.hash(i * 977 + j);
        let kind = 0, acc = 0;
        for (let k = 0; k < KINDS.length; k++) { acc += KINDS[k].w; if (h < acc) { kind = k; break; } }
        if (perKind[kind] >= this.max) continue;
        this.slots.push({ lane: i, off: (j / n) * l.total + h * l.gap * 0.6, kind, inst: perKind[kind]++, dir: 1 });
        const col = new THREE.Color(KINDS[kind].cols[Math.floor(this.hash(i * 31 + j) * KINDS[kind].cols.length)]);
        this.bodies[kind].setColorAt(perKind[kind] - 1, col);
      }
      if (this.slots.length >= this.max) break;
    }
    this.bodies.forEach((b, k) => { b.count = perKind[k]; if (b.instanceColor) b.instanceColor.needsUpdate = true; });
    if (this.lamps) this.lamps.count = this.slots.length * 2;
  }

  public update(seconds: number, camera: THREE.Camera, altitude: number): void {
    if (!this.max || !this.enabled) return;
    const show = altitude < 3500;
    this.group.visible = show;
    if (!show) return;
    const cx = camera.position.x, cz = camera.position.z;
    if (seconds - this.lastAssign > 2.5) { this.lastAssign = seconds; this.assign(cx, cz, Math.max(900, altitude * 1.6)); }
    const head = new THREE.Color(0xfff2d0), tail = new THREE.Color(0xff3020);
    let li = 0;
    for (const sl of this.slots) {
      const l = this.lanes[sl.lane];
      const d = (sl.off + seconds * l.speed * (0.8 + this.hash(sl.lane + sl.off) * 0.4)) % l.total;
      let lo = 0, hi = l.s.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.s[m] < d) lo = m; else hi = m; }
      const a = l.pts[lo], b = l.pts[hi], t = (d - l.s[lo]) / Math.max(1e-6, l.s[hi] - l.s[lo]);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const pitch = Math.atan2((b.y ?? 0) - (a.y ?? 0), Math.max(0.1, l.s[hi] - l.s[lo]));
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, -ang, pitch);
      this.dummy.updateMatrix();
      this.bodies[sl.kind].setMatrixAt(sl.inst, this.dummy.matrix);
      if (this.lamps && this.night) {
        const k = KINDS[sl.kind], ca = Math.cos(ang), sa = Math.sin(ang);
        for (const [f, col] of [[1, head], [-1, tail]] as Array<[number, THREE.Color]>) {
          this.dummy.position.set(x + ca * k.L * 0.51 * f, y + 0.75, z + sa * k.L * 0.51 * f);
          this.dummy.rotation.set(0, -ang + Math.PI / 2, 0);
          this.dummy.updateMatrix();
          this.lamps.setMatrixAt(li, this.dummy.matrix); this.lamps.setColorAt(li, col); li++;
        }
      }
    }
    for (const b of this.bodies) b.instanceMatrix.needsUpdate = true;
    if (this.lamps) {
      this.lamps.visible = this.night;
      if (this.night) { this.lamps.count = li; this.lamps.instanceMatrix.needsUpdate = true; if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true; }
    }
    void this.v;
  }
}

function areaOf(p: Pt[]): number { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i].x * p[j].z - p[j].x * p[i].z; } return Math.abs(a) / 2; }

function mergeColored(parts: Array<[THREE.BufferGeometry, number]>): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  for (const [g0, c] of parts) {
    const g = g0.toNonIndexed(); const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const cc = new THREE.Color(c);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(cc.r, cc.g, cc.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
