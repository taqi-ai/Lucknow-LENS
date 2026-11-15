import * as THREE from 'three';
import { OSMMapData, RenderStats } from '../types';
import { getDeviceProfile } from './deviceProfile';

/**
 * Sun direction relative to the shadow focus point. Azimuth ~west-south-west with a
 * ~38 degree elevation: high enough to light roofs, low enough that shadows describe
 * building height and street orientation from an aerial view.
 */
const SUN_OFFSET = new THREE.Vector3(3800, 2350, 1900);

export class CityRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public mapData: OSMMapData;

  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();
  private currentFps: number = 60;

  constructor(container: HTMLElement, mapData: OSMMapData) {
    this.mapData = mapData;

    // 1. Scene & Canvas Environment Setup
    this.scene = new THREE.Scene();
    this.scene.background = null; // Sky dome provides the backdrop

    // 2. Camera Setup
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    // Clip planes are set once here. The render loop used to reassign them and call
    // updateProjectionMatrix() every frame, which rebuilt the matrix 60x/second for
    // no reason. logarithmicDepthBuffer keeps this range precise.
    this.camera = new THREE.PerspectiveCamera(38, width / height, 2, 150000);

    // 3. WebGL Renderer Setup — logarithmic depth buffer eliminates z-fighting
    // Budgets come from deviceProfile, not from a fixed cap: a phone at 3x DPR
    // with MSAA on asks for roughly 9x the fragment work a desktop does, which is
    // what made the city unusable on mobile rather than merely slower.
    const device = getDeviceProfile();
    this.renderer = new THREE.WebGLRenderer({
      antialias: device.antialias,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(device.maxPixelRatio);
    this.renderer.shadowMap.enabled = false; // Shadows off by default — enabled adaptively at low altitude
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185
    // Explicit colour management. Materials author colours in sRGB, lighting happens
    // in linear, and ACES maps the result back for display.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    container.appendChild(this.renderer.domElement);

    // 4. Setup Lighting
    try { this.setupLighting(); } catch (e) { console.error('Lighting setup error:', e); }

    // Initial framing
    this.frameDataset();
  }

  // -------------------------------------------------------------
  // LIGHTING
  private sunLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private isNight = true;
  private skylineStyle: 'warm' | 'clear' | 'cyberpunk' = 'warm';
  private shadowsActive = false;

  // -------------------------------------------------------------
  // LIGHTING ENVIRONMENT (DAY / NIGHT DYNAMIC MODES)
  // -------------------------------------------------------------
  private setupLighting() {
    // Key sun. Mid-afternoon elevation (~38 deg) rather than overhead, so buildings
    // throw shadows long enough to read street layout and massing from the air.
    this.sunLight = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.sunLight.position.copy(SUN_OFFSET);
    this.sunLight.castShadow = false; // Enabled adaptively at low altitude

    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 14000;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.6;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Ambient is deliberately low. The old 1.5 ambient + 1.2 hemisphere washed out
    // every face difference; roughly half the illumination had no direction at all.
    this.ambientLight = new THREE.AmbientLight(0xd8e6f5, 0.22);
    this.scene.add(this.ambientLight);

    // Sky/ground hemisphere carries the indirect fill instead.
    this.hemiLight = new THREE.HemisphereLight(0xbcd7f0, 0x6b6152, 0.5);
    this.scene.add(this.hemiLight);

    this.applyDayNightState(true);
  }

  /**
   * Keep the shadow frustum wrapped tightly around what the camera is looking at.
   * A fixed 2500 m box wastes almost all texels at street level and misses geometry
   * at district level; scaling it with altitude keeps shadow resolution usable.
   */
  public updateSunShadowTarget(target: THREE.Vector3, altitude = 1000): void {
    if (!this.sunLight) return;
    this.sunLight.position.set(
      target.x + SUN_OFFSET.x, target.y + SUN_OFFSET.y, target.z + SUN_OFFSET.z,
    );
    this.sunLight.target.position.copy(target);
    this.sunLight.target.updateMatrixWorld();

    const extent = THREE.MathUtils.clamp(altitude * 1.1, 300, 4000);
    const cam = this.sunLight.shadow.camera;
    if (cam.right !== extent) {
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
    }
  }

  /** Enable/disable shadows based on camera altitude — huge perf win at zoom-out */
  public setAdaptiveShadows(altitude: number): void {
    // Shadow maps are a second full scene traversal per frame; mobile GPUs pay
    // for it in bandwidth they do not have.
    const shouldEnable = getDeviceProfile().allowShadows && altitude < 3000;
    if (shouldEnable === this.shadowsActive) return;
    this.shadowsActive = shouldEnable;
    this.renderer.shadowMap.enabled = shouldEnable;
    this.sunLight.castShadow = shouldEnable;
    // Mark all materials as needing shadow update
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        if (mat && !Array.isArray(mat)) {
          mat.needsUpdate = true;
        }
      }
    });
  }

  public setSkylineStyle(style: 'warm' | 'clear' | 'cyberpunk'): void {
    this.skylineStyle = style;
    this.applyDayNightState(this.isNight);
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.applyDayNightState(night);
  }

  /**
   * Lighting presets per (time of day x style). Applied as targets and eased in
   * update(), so switching day and night is a ~1.6 s dusk/dawn instead of a cut.
   */
  private lightTarget: { sun: THREE.Color; sunI: number; amb: THREE.Color; ambI: number; sky: THREE.Color; ground: THREE.Color; hemiI: number; exposure: number } | null = null;
  private lastLightTick = performance.now();

  private applyDayNightState(night: boolean): void {
    this.scene.background = null;
    const P = (sun: number, sunI: number, amb: number, ambI: number, sky: number, ground: number, hemiI: number, exposure: number) => ({
      sun: new THREE.Color(sun), sunI, amb: new THREE.Color(amb), ambI, sky: new THREE.Color(sky), ground: new THREE.Color(ground), hemiI, exposure,
    });
    const st = this.skylineStyle;
    let t;
    if (night) {
      if (st === 'cyberpunk') t = P(0x00f0ff, 1.6, 0x1a0a2a, 1.8, 0x00d2ff, 0x380036, 2.2, 1.8);
      else if (st === 'clear') t = P(0xb8cdf0, 1.0, 0x50627e, 1.7, 0x5e78a0, 0x22293a, 1.6, 1.45); // cool moonlight
      else t = P(0xffc68a, 1.1, 0x6a5a4e, 1.9, 0x6a87ae, 0x3a2e24, 1.7, 1.6); // warm: sodium-lit streets
    } else {
      if (st === 'clear') t = P(0xffffff, 3.6, 0xdfe7f0, 0.34, 0xd6e6f7, 0x95999e, 0.78, 0.95);
      else if (st === 'cyberpunk') t = P(0x7af0ff, 3.4, 0x2a1a55, 0.42, 0x5fd0f5, 0x4a1440, 0.5, 1.02);
      else t = P(0xffecd0, 3.6, 0xb2c8dc, 0.38, 0xc6def2, 0x9c8868, 0.65, 1.0);
    }
    this.scene.fog = new THREE.FogExp2(night ? 0x0a1220 : 0xd6e5f3, 0);
    // Snap: the scene-wide SceneTween animates from the old look to this one.
    this.lightTarget = t;
    this.stepLighting(1);
  }

  /** Ease the lights toward the current target. k = 1 snaps. */
  private stepLighting(k: number): void {
    const t = this.lightTarget;
    if (!t || !this.sunLight) return;
    this.sunLight.color.lerp(t.sun, k);
    this.sunLight.intensity += (t.sunI - this.sunLight.intensity) * k;
    this.ambientLight.color.lerp(t.amb, k);
    this.ambientLight.intensity += (t.ambI - this.ambientLight.intensity) * k;
    this.hemiLight.color.lerp(t.sky, k);
    this.hemiLight.groundColor.lerp(t.ground, k);
    this.hemiLight.intensity += (t.hemiI - this.hemiLight.intensity) * k;
    this.renderer.toneMappingExposure += (t.exposure - this.renderer.toneMappingExposure) * k;
  }

  /** Horizon colour + haze strength currently in effect, for the building shader. */
  public getAtmosphere(): { horizon: THREE.Color; strength: number } {
    if (this.isNight) {
      const col = this.skylineStyle === 'cyberpunk' ? 0x050714 : 0x0a1220;
      return { horizon: new THREE.Color(col), strength: 0.000000 };
    }
    const col = this.skylineStyle === 'clear' ? 0xe2e8f0 : (this.skylineStyle === 'cyberpunk' ? 0x1a2035 : 0xcfdcea);
    return { horizon: new THREE.Color(col), strength: 0.000000 };
  }

  // -------------------------------------------------------------
  // CAMERA FRAMING
  // -------------------------------------------------------------
  public frameDataset() {
    const w = this.mapData.bounds.widthMeters;
    const h = this.mapData.bounds.heightMeters;

    const maxDim = Math.max(w, h, 800);
    const dist = maxDim * 1.1;

    // High-angle oblique aerial camera view
    this.camera.position.set(dist * 0.45, dist * 0.72, dist * 0.65);
    this.camera.lookAt(0, 0, 0);
  }

  // -------------------------------------------------------------
  // RENDER LOOP & STATS
  // -------------------------------------------------------------
  public update() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public getRenderStats(): RenderStats {
    const info = this.renderer.info;
    return {
      fps: this.currentFps,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  public handleResize(width: number, height: number) {
    const safeWidth = width || 1;
    const safeHeight = height || 1;
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight);
  }

  public dispose() {
    this.renderer.dispose();
  }
}
