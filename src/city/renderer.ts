import * as THREE from 'three';
import { OSMMapData, RenderStats } from '../types';

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
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap at 1.5x for perf on HiDPI
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
    const shouldEnable = altitude < 3000;
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

  private applyDayNightState(night: boolean): void {
    this.scene.background = null;

    if (night) {
      if (this.skylineStyle === 'cyberpunk') {
        // True Cyberpunk Night: High contrast dark indigo backdrop, neon-accented lighting
        this.scene.fog = new THREE.FogExp2(0x050714, 0.000000);
        this.sunLight.color.setHex(0x00f0ff); // Electric cyan directional
        this.sunLight.intensity = 1.6;
        this.ambientLight.color.setHex(0x1a0a2a); // Deep magenta ambient fill
        this.ambientLight.intensity = 1.8;
        this.hemiLight.color.setHex(0x00d2ff); // Cyan sky
        this.hemiLight.groundColor.setHex(0x380036); // Magenta ground
        this.hemiLight.intensity = 2.2;
        this.renderer.toneMappingExposure = 1.8;
      } else {
        // Realistic Lucknow Night
        this.scene.fog = new THREE.FogExp2(0x0a1220, 0.000000);
        this.sunLight.color.setHex(0x9fc0e8);
        this.sunLight.intensity = 1.2;
        this.ambientLight.color.setHex(0x607490);
        this.ambientLight.intensity = 2.0;
        this.hemiLight.color.setHex(0x6a87ae);
        this.hemiLight.groundColor.setHex(0x2a3040);
        this.hemiLight.intensity = 1.8;
        this.renderer.toneMappingExposure = 1.6;
      }
    } else {
      if (this.skylineStyle === 'clear') {
        // NATURAL WHITE — midday, neutral white balance. The reference the other
        // two are read against, so it commits to nothing: white sun, faintly
        // cool sky fill, neutral ground bounce.
        this.scene.fog = new THREE.FogExp2(0xe6ebf0, 0.000000);
        this.sunLight.color.setHex(0xffffff);
        this.sunLight.intensity = 3.6;
        this.ambientLight.color.setHex(0xdfe7f0);
        this.ambientLight.intensity = 0.34;
        this.hemiLight.color.setHex(0xd6e6f7);
        this.hemiLight.groundColor.setHex(0x95999e);
        this.hemiLight.intensity = 0.78;
        this.renderer.toneMappingExposure = 0.95;
      } else if (this.skylineStyle === 'cyberpunk') {
        // CYBERPUNK — a genuinely different profile, not a tinted day. The key
        // is that almost no light comes from the sky: a deep indigo environment
        // with a cold cyan key from one side and a magenta ground bounce from
        // the other, so surfaces split into cyan-lit and magenta-shadowed. The
        // building shader's uCyber term supplies the neon windows and accents.
        this.scene.fog = new THREE.FogExp2(0x0e1430, 0.000000);
        this.sunLight.color.setHex(0x7af0ff);
        this.sunLight.intensity = 3.4;
        this.ambientLight.color.setHex(0x2a1a55);
        this.ambientLight.intensity = 0.42;
        // A strong cyan hemisphere floods the ground plane, which is what turned
        // the whole city into a flat cyan sheet. Kept low; the sun carries the key.
        this.hemiLight.color.setHex(0x5fd0f5);
        this.hemiLight.groundColor.setHex(0x4a1440);
        this.hemiLight.intensity = 0.50;
        this.renderer.toneMappingExposure = 1.02;
      } else {
        // WARM WHITE — late golden afternoon.
        //
        // The ambient used to be 0xc3d8ef, a cool blue, which is what made this
        // mode nearly indistinguishable from Natural White: a golden key light
        // cancelled by a cold fill reads as neutral. Every term is warm now —
        // sun, ambient, sky and ground bounce — and the exposure is lifted, so
        // the difference is obvious at a glance rather than on close inspection.
        this.scene.fog = new THREE.FogExp2(0xe8d7bc, 0.000000);
        this.sunLight.color.setHex(0xffcf8a);
        this.sunLight.intensity = 4.4;
        this.ambientLight.color.setHex(0xf2d3a6);
        this.ambientLight.intensity = 0.32;
        this.hemiLight.color.setHex(0xffd9a8);
        this.hemiLight.groundColor.setHex(0x8a6a44);
        this.hemiLight.intensity = 0.72;
        this.renderer.toneMappingExposure = 1.04;
      }
    }
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
