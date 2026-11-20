import * as THREE from 'three';

/**
 * SceneTween — one clock for a whole-scene look change (day to night and back).
 *
 * Every subsystem (building shader, roads, ground, trees, lamps, campus lawns,
 * lights, exposure) already knows how to *snap* to day or night. Rather than
 * teach each one to animate on its own timer, which is why they used to finish
 * at different moments, we:
 *   1. read every animatable value in the scene (state A),
 *   2. let the subsystems snap to the new mode,
 *   3. read the same values again (state B),
 *   4. put A back and interpolate A→B on a single eased clock.
 * Anything created mid-transition (a newly streamed tile) simply starts at B.
 */

/** Length of a day/night change, shared by the scene, the sky and the on-screen sweep. */
export const DAY_NIGHT_SECONDS = 2.6;

type NumRef = { o: Record<string, number>; k: string; a: number; b: number };
type ColRef = { c: THREE.Color; a: THREE.Color; b: THREE.Color };
type VecRef = { v: THREE.Vector2 | THREE.Vector3 | THREE.Vector4; a: THREE.Vector4; b: THREE.Vector4 };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const isVec = (v: unknown): v is THREE.Vector2 | THREE.Vector3 | THREE.Vector4 =>
  !!v && ((v as THREE.Vector3).isVector3 || (v as THREE.Vector2).isVector2 || (v as THREE.Vector4).isVector4);
const toV4 = (v: THREE.Vector2 | THREE.Vector3 | THREE.Vector4, out = new THREE.Vector4()) =>
  out.set(v.x, v.y, (v as THREE.Vector3).z ?? 0, (v as THREE.Vector4).w ?? 0);
const fromV4 = (v: THREE.Vector2 | THREE.Vector3 | THREE.Vector4, s: THREE.Vector4) => {
  v.x = s.x; v.y = s.y;
  if ((v as THREE.Vector3).isVector3 || (v as THREE.Vector4).isVector4) (v as THREE.Vector3).z = s.z;
  if ((v as THREE.Vector4).isVector4) (v as THREE.Vector4).w = s.w;
};

export class SceneTween {
  private nums: NumRef[] = [];
  private cols: ColRef[] = [];
  private vecs: VecRef[] = [];
  private t0 = 0;
  private dur = 0;
  private running = false;
  private onProgress: ((t: number) => void) | null = null;

  constructor(private scene: THREE.Scene, private renderer: THREE.WebGLRenderer, private skip: Set<THREE.Material> = new Set()) {}

  /** Collect references to every value that can be interpolated. */
  private collect() {
    const nums: NumRef[] = [], cols: ColRef[] = [], vecs: VecRef[] = [];
    const seenMat = new Set<THREE.Material>();
    const seenUni = new Set<unknown>();
    const addNum = (o: Record<string, number>, k: string) => { if (typeof o[k] === 'number') nums.push({ o, k, a: o[k], b: o[k] }); };
    const addCol = (c?: THREE.Color) => { if (c && c.isColor) cols.push({ c, a: c.clone(), b: c.clone() }); };
    const addVec = (v: THREE.Vector2 | THREE.Vector3 | THREE.Vector4) => vecs.push({ v, a: toV4(v), b: toV4(v) });

    const visitMat = (m: THREE.Material) => {
      if (seenMat.has(m) || this.skip.has(m)) return;
      seenMat.add(m);
      const mm = m as unknown as Record<string, unknown>;
      addCol(mm.color as THREE.Color);
      addCol(mm.emissive as THREE.Color);
      addNum(mm as Record<string, number>, 'emissiveIntensity');
      const uniforms = mm.uniforms as Record<string, { value: unknown }> | undefined;
      if (uniforms) for (const u of Object.values(uniforms)) {
        if (!u || seenUni.has(u)) continue;
        seenUni.add(u);
        const v = u.value;
        if (typeof v === 'number') addNum(u as unknown as Record<string, number>, 'value');
        else if ((v as THREE.Color)?.isColor) addCol(v as THREE.Color);
        else if (isVec(v)) addVec(v);
        else if (Array.isArray(v)) for (const e of v) { if ((e as THREE.Color)?.isColor) addCol(e as THREE.Color); else if (isVec(e)) addVec(e); }
      }
    };

    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(visitMat); else if (mat) visitMat(mat);
      const light = o as THREE.Light;
      if (light.isLight) {
        addCol(light.color);
        addNum(light as unknown as Record<string, number>, 'intensity');
        addCol((light as THREE.HemisphereLight).groundColor);
      }
    });
    addNum(this.renderer as unknown as Record<string, number>, 'toneMappingExposure');
    return { nums, cols, vecs };
  }

  /**
   * Run `apply` (which snaps the scene to its new look), then animate from the
   * old look to the new one over `seconds`. `onProgress` gets the eased 0..1.
   */
  public transition(apply: () => void, seconds: number, onProgress?: (t: number) => void) {
    // If a transition is already running, start from wherever it is now.
    const { nums, cols, vecs } = this.collect();
    apply();
    for (const n of nums) n.b = n.o[n.k];
    for (const c of cols) c.b.copy(c.c);
    for (const v of vecs) toV4(v.v, v.b);
    for (const n of nums) n.o[n.k] = n.a;
    for (const c of cols) c.c.copy(c.a);
    for (const v of vecs) fromV4(v.v, v.a);
    this.nums = nums.filter((n) => n.a !== n.b);
    this.cols = cols.filter((c) => !c.a.equals(c.b));
    this.vecs = vecs.filter((v) => !v.a.equals(v.b));
    this.t0 = performance.now();
    this.dur = seconds * 1000;
    this.onProgress = onProgress ?? null;
    this.running = true;
  }

  /** Call once per frame before rendering. */
  public tick(now = performance.now()) {
    if (!this.running) return;
    const raw = Math.min(1, (now - this.t0) / this.dur);
    const t = ease(raw);
    for (const n of this.nums) n.o[n.k] = n.a + (n.b - n.a) * t;
    for (const c of this.cols) c.c.copy(c.a).lerp(c.b, t);
    const tmp = new THREE.Vector4();
    for (const v of this.vecs) fromV4(v.v, tmp.copy(v.a).lerp(v.b, t));
    this.onProgress?.(t);
    if (raw >= 1) { this.running = false; this.nums = []; this.cols = []; this.vecs = []; }
  }

  public get active() { return this.running; }

  /** Dev only: how many values are moving, and hold the transition at a fixed point. */
  public debug() { return { nums: this.nums.length, colors: this.cols.length, vectors: this.vecs.length }; }
  public freezeAt(t: number) { if (!this.dur) return; this.t0 = performance.now() - Math.min(t, 0.999) * this.dur; this.running = true; this.tick(); this.running = false; }
}
