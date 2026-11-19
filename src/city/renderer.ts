import * as THREE from 'three';
import { OSMMapData, RenderStats } from '../types';
import { getDeviceProfile } from './deviceProfile';

/** Lucknow, for the solar position. */
const LAT = 26.85;
const LON = 80.95;

/**
 * Solar azimuth/elevation (NOAA low-precision formulae) for Lucknow at a local IST
 * hour on a given day of year. Returns a unit vector toward the sun in the app frame
 * (x east, y up, z south).
 */
export function sunDirection(hourIST: number, dayOfYear: number, out = new THREE.Vector3()): THREE.Vector3 {
  const g = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourIST - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hourIST * 60 + eqt + 4 * LON - 60 * 5.5; // true solar time, minutes
  const ha = THREE.MathUtils.degToRad(tst / 4 - 180);
  const lat = THREE.MathUtils.degToRad(LAT);
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(THREE.MathUtils.clamp(cosZen, -1, 1));
  const el = Math.PI / 2 - zen;
  let az = Math.acos(THREE.MathUtils.clamp((Math.sin(lat) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(lat) * Math.sin(zen)), -1, 1));
  az = ha > 0 ? (az + Math.PI) % (2 * Math.PI) : (3 * Math.PI - az) % (2 * Math.PI); // from north, clockwise
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/** Distance of the sun light from its shadow focus. */
const SUN_DISTANCE = 4800;

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
    this.maxRatio = device.maxPixelRatio;
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
  /** Local IST hour driving the sun in daylight (default mid-afternoon). */
  private dayHour = 15.25;
  private dayOfYear = 320; // mid-November
  private sunDir = new THREE.Vector3();
  private moonDir = new THREE.Vector3(-0.35, 0.72, 0.6).normalize();
  private shadowTarget = new THREE.Vector3();

  /** Set the time of day for the daylight sun (IST hours, 6-18). */
  public setTimeOfDay(hour: number, dayOfYear = this.dayOfYear): void {
    this.dayHour = THREE.MathUtils.clamp(hour, 6.5, 17.8);
    this.dayOfYear = dayOfYear;
    this.updateSunPosition();
  }

  private updateSunPosition(): void {
    if (!this.sunLight) return;
    if (this.isNight) this.sunDir.copy(this.moonDir);
    else sunDirection(this.dayHour, this.dayOfYear, this.sunDir);
    if (this.sunDir.y < 0.12) this.sunDir.y = 0.12;
    this.sunDir.normalize();
    const t = this.shadowTarget;
    this.sunLight.position.set(t.x + this.sunDir.x * SUN_DISTANCE, t.y + this.sunDir.y * SUN_DISTANCE, t.z + this.sunDir.z * SUN_DISTANCE);
    this.sunLight.target.position.copy(t);
    this.sunLight.target.updateMatrixWorld();
  }

  private setupLighting() {
    // Key sun. Mid-afternoon elevation (~38 deg) rather than overhead, so buildings
    // throw shadows long enough to read street layout and massing from the air.
    this.sunLight = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.sunLight.castShadow = false; // Enabled adaptively at low altitude

    const shadowSize = getDeviceProfile().shadowMapSize;
    this.sunLight.shadow.mapSize.width = shadowSize;
    this.sunLight.shadow.mapSize.height = shadowSize;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 12000;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.5;
    this.sunLight.shadow.radius = 2;
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
    // Snap the focus to a texel-sized grid so shadows do not crawl as the camera pans.
    const extent = THREE.MathUtils.clamp(altitude * 0.9, 220, 3200);
    const texel = (extent * 2) / this.sunLight.shadow.mapSize.width;
    this.shadowTarget.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
    this.updateSunPosition();
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
    const dp = getDeviceProfile();
    const shouldEnable = dp.allowShadows && altitude < dp.shadowMaxAltitude && !this.isNight;
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
      // Moonlight is a faint cool key; most of what you see is emitted city light, so
      // exposure is lifted rather than flooding ambient (which flattened the old night).
      if (st === 'cyberpunk') t = P(0x00f0ff, 0.7, 0x1a0a2a, 0.9, 0x00d2ff, 0x380036, 1.2, 1.7);
      else if (st === 'clear') t = P(0xb8cdf0, 0.55, 0x3d4a60, 0.7, 0x4a5f80, 0x22293a, 0.9, 1.55);
      else t = P(0xc4d2ec, 0.5, 0x4a4038, 0.75, 0x46597a, 0x3a2c22, 0.95, 1.6);
    } else {
      // Warm, slightly hazy afternoon sun; a dusty ground bounce in the hemisphere.
      if (st === 'clear') t = P(0xfff6ea, 3.3, 0xdfe7f0, 0.30, 0xcfe0f2, 0x9a9890, 0.85, 0.95);
      else if (st === 'cyberpunk') t = P(0x7af0ff, 3.0, 0x2a1a55, 0.40, 0x5fd0f5, 0x4a1440, 0.6, 1.0);
      else t = P(0xffe4c4, 3.1, 0xd4d2c8, 0.30, 0xc8d6e4, 0x8f7d62, 0.95, 0.98);
    }
    // Fog (aerial perspective) is owned by AtmosphericSky so it always matches the horizon.
    this.lightTarget = t;
    this.stepLighting(1);
    this.updateSunPosition();
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

  /** Kept for API compatibility; haze is scene fog owned by AtmosphericSky. */
  public getAtmosphere(): { horizon: THREE.Color; strength: number } {
    return { horizon: new THREE.Color(this.isNight ? 0x2a2420 : 0xe4dfd1), strength: 0 };
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

    // Dynamic resolution: if frames get slow, render fewer pixels (down to 55% of the device's cap);
    // recover when there is headroom. Checked every half second on a smoothed frame time.
    const ft = now - (this.lastFrameAt || now);
    this.lastFrameAt = now;
    if (ft > 0 && ft < 250) this.ftEma = this.ftEma * 0.92 + ft * 0.08;
    if (now - this.lastScaleAt > 500) {
      this.lastScaleAt = now;
      const cap = this.maxRatio;
      let r = this.renderer.getPixelRatio();
      if (this.ftEma > 26 && r > cap * 0.55) r = Math.max(cap * 0.55, r - 0.1);
      else if (this.ftEma < 14 && r < cap) r = Math.min(cap, r + 0.05);
      if (Math.abs(r - this.renderer.getPixelRatio()) > 0.01) this.renderer.setPixelRatio(r);
    }

    this.renderer.render(this.scene, this.camera);
  }
  private lastFrameAt = 0;
  private lastScaleAt = 0;
  private ftEma = 16;
  private maxRatio = 1;

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

  /**
   * Complete WebGL resource cleanup:
   * Disposes scene geometries, materials, textures, render targets, shadow maps,
   * renderer WebGL context, and safely unlinks the canvas DOM element.
   */
  public dispose() {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    const disposedTextures = new Set<THREE.Texture>();

    const disposeTexture = (tex: any) => {
      if (tex && typeof tex.dispose === 'function' && !disposedTextures.has(tex)) {
        disposedTextures.add(tex);
        tex.dispose();
      }
    };

    const disposeMaterial = (mat: any) => {
      if (!mat || disposedMaterials.has(mat)) return;
      disposedMaterials.add(mat);

      const textureKeys = [
        'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
        'envMap', 'alphaMap', 'aoMap', 'displacementMap',
        'roughnessMap', 'metalnessMap', 'emissiveMap',
      ];
      for (const key of textureKeys) {
        if (mat[key]) disposeTexture(mat[key]);
      }

      if (typeof mat.dispose === 'function') {
        mat.dispose();
      }
    };

    // Traverse scene and release all attached non-shared render resources
    this.scene.traverse((obj: any) => {
      if (obj.geometry && typeof obj.geometry.dispose === 'function' && !disposedGeometries.has(obj.geometry)) {
        disposedGeometries.add(obj.geometry);
        obj.geometry.dispose();
      }

      if (obj.material) {
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) disposeMaterial(m);
        } else {
          disposeMaterial(obj.material);
        }
      }
    });

    // Dispose lights and shadow map render targets
    if (this.sunLight) {
      if (this.sunLight.shadow?.map) {
        this.sunLight.shadow.map.dispose();
      }
      this.sunLight.dispose?.();
    }
    if (this.ambientLight) {
      this.ambientLight.dispose?.();
    }
    if (this.hemiLight) {
      this.hemiLight.dispose?.();
    }

    // Clean up internal renderer render lists
    this.renderer.renderLists?.dispose?.();

    // Dispose WebGLRenderer and force context loss to release GPU resources immediately
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();

    // Safely remove canvas DOM element if still connected
    const dom = this.renderer.domElement;
    if (dom && dom.parentNode) {
      dom.parentNode.removeChild(dom);
    }

    // Clear scene graph references
    this.scene.clear();
  }
}
