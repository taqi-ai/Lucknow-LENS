import * as THREE from 'three';
import { type RoadClass } from './ribbon';
import { BridgeSystem } from './bridges';

/**
 * CityOverlay — the city-wide road network, the Gomti and the parks.
 *
 * Built once from public/overture_tiles_full/overview.json (14,471 major roads,
 * 527 waterways, 1,480 green areas) and kept resident. These are the features that
 * give Lucknow its readable structure at every altitude, so unlike buildings they
 * are never streamed — the whole set is a few hundred thousand triangles.
 *
 * At neighbourhood/street scale the streamed tiles draw the full local road network
 * on top; this layer sits fractionally lower with a polygon offset so the detailed
 * roads win the depth test where both exist.
 */

const ROAD_COLORS_DAY: Record<RoadClass, number> = {
  motorway: 0x5e5c5a,
  trunk: 0x646260,
  primary: 0x6b6966,
  secondary: 0x74716d,
  tertiary: 0x7d7a75,
  residential: 0x86837e,
  service: 0x8d8a85,
  footway: 0x99958f,
  railway: 0x47494d,
  flyover: 0x525459,
};

/**
 * Night road hierarchy. Not emissive glow — asphalt lit by streetlights. Bigger
 * corridors are lit more consistently in a real city, so they read brighter, and
 * the emissive term is what carries that hierarchy without neon.
 */
const ROAD_COLORS_NIGHT: Record<RoadClass, number> = {
  motorway: 0x3d3f46,
  trunk: 0x393b42,
  primary: 0x34363c,
  secondary: 0x2e3036,
  tertiary: 0x282a30,
  residential: 0x232529,
  service: 0x1f2124,
  footway: 0x1b1d20,
  railway: 0x2b2c30,
  flyover: 0x3a3c42,
};

const ROAD_EMISSIVE_NIGHT: Record<RoadClass, number> = {
  motorway: 0x3e352a,
  trunk: 0x372f25,
  primary: 0x2f2921,
  secondary: 0x24201a,
  tertiary: 0x1a1713,
  residential: 0x100e0b,
  service: 0x080706,
  footway: 0x000000,
  railway: 0x121418,
  flyover: 0x483a24,
};

export class CityOverlay {
  private group = new THREE.Group();
  private roadMeshes = new Map<RoadClass, THREE.Mesh>();
  private roadMaterials = new Map<RoadClass, THREE.MeshStandardMaterial>();
  private flyoverPierMesh: THREE.Mesh | null = null;
  private flyoverBarrierMesh: THREE.Mesh | null = null;
  private flyoverPierMat: THREE.MeshStandardMaterial;
  private flyoverBarrierMat: THREE.MeshStandardMaterial;
  private railBedMesh: THREE.Mesh | null = null;
  private railSleeperMesh: THREE.Mesh | null = null;
  private railRailsMesh: THREE.Mesh | null = null;
  private railBedMat: THREE.MeshStandardMaterial;
  private railSleeperMat: THREE.MeshStandardMaterial;
  private railRailsMat: THREE.MeshStandardMaterial;
  private metroDeckMesh: THREE.Mesh | null = null;
  private metroCanopyMesh: THREE.Mesh | null = null;
  private metroColumnMesh: THREE.Mesh | null = null;
  private metroDeckMat: THREE.MeshStandardMaterial;
  private metroCanopyMat: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private parkMaterial: THREE.MeshStandardMaterial;
  private waterMesh: THREE.Mesh | null = null;
  private parkMesh: THREE.Mesh | null = null;
  private isNight = true;
  private roadsEnabled = true;

  private bridges: BridgeSystem;

  /** Shared uniforms driving the water shader. */
  private waterTime = { value: 0 };
  private waterNight = { value: 1 };

  public stats = { roadVerts: 0, waterVerts: 0, parkVerts: 0, railVerts: 0 };

  constructor(scene: THREE.Scene) {
    this.group.name = 'CityOverlay';
    scene.add(this.group);
    this.bridges = new BridgeSystem(scene);

    this.flyoverPierMat = new THREE.MeshStandardMaterial({
      color: 0x2a2b30,
      roughness: 0.85,
      flatShading: true,
    });
    this.flyoverBarrierMat = new THREE.MeshStandardMaterial({
      color: 0x3a3c42,
      roughness: 0.7,
      emissive: 0x261d10,
    });

    // Track. Ballast is crushed stone — very rough, no specular. The rails are
    // the one genuinely metallic surface in the scene: polished by traffic, so
    // they catch the sun and are what makes a line read as railway from above.
    this.railBedMat = new THREE.MeshStandardMaterial({
      color: 0x3a3733,
      roughness: 0.96,
      flatShading: true,
    });
    this.railSleeperMat = new THREE.MeshStandardMaterial({
      color: 0x4a4640,
      roughness: 0.88,
    });
    this.railRailsMat = new THREE.MeshStandardMaterial({
      color: 0x8a8b8f,
      roughness: 0.28,
      metalness: 0.55,
    });

    // Metro stations. Pale concrete box with a light metal canopy — the two
    // materials that make an elevated station read as a station and not as
    // another stretch of viaduct.
    this.metroDeckMat = new THREE.MeshStandardMaterial({
      color: 0xb9b3a8,
      roughness: 0.82,
    });
    this.metroCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xd2d6da,
      roughness: 0.42,
      metalness: 0.30,
    });

    for (const cls of Object.keys(ROAD_COLORS_DAY) as RoadClass[]) {
      this.roadMaterials.set(cls, new THREE.MeshStandardMaterial({
        color: ROAD_COLORS_NIGHT[cls],
        emissive: ROAD_EMISSIVE_NIGHT[cls],
        // Wider roads are smoother, better-maintained asphalt.
        roughness: cls === 'motorway' || cls === 'trunk' || cls === 'flyover' ? 0.62 : 0.86,
        metalness: cls === 'railway' ? 0.25 : 0.0,
        polygonOffset: true,
        polygonOffsetFactor: cls === 'flyover' ? -2 : 3,
        polygonOffsetUnits: cls === 'flyover' ? -4 : 6,
      }));
    }

    // Metalness stays low. A metallic surface with no environment map has nothing
    // to reflect and renders near-black, which is what turned the Gomti into a
    // black ribbon in daylight. Low roughness alone gives the sheen.
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d2438,
      roughness: 0.32,
      metalness: 0.08,
    });
    // A flat-shaded plane reads as painted cardboard no matter what colour it is.
    // These two chunks add drifting ripple normals, a grazing-angle Fresnel
    // brighten, and a depth gradient toward the banks.
    this.waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterTime;
      shader.uniforms.uNightW = this.waterNight;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', ['#include <common>', 'varying vec3 vWPos;'].join('\n'))
        .replace('#include <project_vertex>',
                 ['vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;', '#include <project_vertex>'].join('\n'));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
                 ['#include <common>', 'varying vec3 vWPos;', 'uniform float uTime;', 'uniform float uNightW;'].join('\n'))
        .replace('#include <normal_fragment_begin>', /* glsl */ `
          #include <normal_fragment_begin>
          // Two crossed wave trains at different scales and drift rates.
          vec2 w1 = vWPos.xz * 0.055 + vec2(uTime * 0.16, uTime * 0.09);
          vec2 w2 = vWPos.zx * 0.021 - vec2(uTime * 0.07, uTime * 0.11);
          float h = sin(w1.x) * cos(w1.y) * 0.6 + sin(w2.x * 1.7) * cos(w2.y * 1.3) * 0.4;
          vec3 ripple = normalize(vec3(
            dFdx(h) * 26.0 + h * 0.16,
            1.0,
            dFdy(h) * 26.0 + h * 0.12
          ));
          // Ripples are sub-pixel past ~1.5 km and produce heavy moire across the
          // whole river, so they fade out with distance.
          float rippleFade = 1.0 - smoothstep(600.0, 2200.0, length(vViewPosition));
          normal = normalize(mix(normal, ripple, 0.55 * rippleFade));
        `)
        .replace('#include <fog_fragment>', /* glsl */ `
          // Fresnel: water is far more reflective at grazing angles, which is what
          // separates a river from a coloured polygon when seen from a low camera.
          vec3 vDir = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(dot(normalize(normal), vDir), 0.0, 1.0), 3.2);
          vec3 skyTint = mix(vec3(0.44, 0.58, 0.70), vec3(0.10, 0.15, 0.26), uNightW);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyTint, fres * mix(0.55, 0.35, uNightW));
          // Silt gradient — shallower, warmer water toward the banks.
          float siltFade = 1.0 - smoothstep(1500.0, 6000.0, length(vViewPosition));
          float silt = 0.5 + 0.5 * sin(vWPos.x * 0.004 + vWPos.z * 0.0031);
          gl_FragColor.rgb *= mix(1.0, mix(0.88, 1.10, silt), siltFade);
          // Specular glints riding the wave crests.
          float glint = smoothstep(0.72, 0.99, h * 0.5 + 0.5) * fres
                      * (1.0 - smoothstep(600.0, 2200.0, length(vViewPosition)));
          gl_FragColor.rgb += mix(vec3(1.0, 0.97, 0.88), vec3(0.55, 0.68, 0.92), uNightW)
                            * glint * mix(0.45, 0.28, uNightW);
          #include <fog_fragment>
        `);
    };
    this.waterMaterial.customProgramCacheKey = () => 'lens-water';

    this.parkMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2a1e,
      roughness: 0.98,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 8,
    });
  }

  /**
   * Load the baked overlay produced by `npm run bake`.
   *
   * This used to fetch overview.json (7.3 MB), parse it, push 14,471 polylines
   * through the ribbon builder and run an unindexed road-vs-waterway intersection
   * for the bridges. That saturated the main thread for ~43 s at every page load —
   * long enough that the tab could not even be queried and looked hung. All of it
   * is now precomputed; the client only uploads buffers.
   */
  public async init(): Promise<void> {
    try {
      const resp = await fetch('/hlod/overlay.bin');
      if (!resp.ok) {
        console.warn('[CityOverlay] overlay.bin missing — run `npm run bake`.');
        return;
      }
      const buf = await resp.arrayBuffer();
      this.readSections(buf);
      this.bridges.crossingCount = this.lastCrossings;
    } catch (e) {
      console.warn('[CityOverlay] init failed:', e);
    }
  }

  private lastCrossings = 0;

  /**
   * Street-level track detail, fetched the first time the camera drops low
   * enough to see it. Keeping it out of init() is what stops a 14 MB sleeper
   * buffer from sitting in front of the first frame.
   */
  private detailState: 'idle' | 'loading' | 'done' = 'idle';

  private loadDetail(): void {
    if (this.detailState !== 'idle') return;
    this.detailState = 'loading';
    fetch('/hlod/overlay_detail.bin')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        this.readSections(buf);
        this.detailState = 'done';
      })
      .catch((e) => {
        // Not fatal: the track still reads from its ballast and rails.
        console.warn('[CityOverlay] detail load failed:', e);
        this.detailState = 'done';
      });
  }

  private readSections(buf: ArrayBuffer): void {
    {
      const view = new DataView(buf);
      const headerLen = view.getUint32(0, true);
      // headerLen counts the 4-byte alignment padding, which is NUL. Those bytes
      // are part of the length by design, so they have to come off before
      // JSON.parse — otherwise the whole overlay silently fails to load whenever
      // the header's length happens not to be a multiple of four.
      const headerText = new TextDecoder()
        .decode(new Uint8Array(buf, 4, headerLen))
        .replace(/\0+$/, '');
      const header = JSON.parse(headerText);
      const dataStart = 4 + headerLen;
      this.lastCrossings = header.crossings ?? this.lastCrossings;

      for (const sec of header.sections as Array<{ name: string; offset: number; floats: number }>) {
        const pos = new Float32Array(buf, dataStart + sec.offset, sec.floats);
        if (sec.name.startsWith('road:')) {
          const cls = sec.name.slice(5) as RoadClass;
          const mesh = this.makeMesh(pos, this.roadMaterials.get(cls)!, 'roads');
          this.roadMeshes.set(cls, mesh);
          this.stats.roadVerts += sec.floats / 3;
        } else if (sec.name === 'water') {
          this.waterMesh = this.makeMesh(pos, this.waterMaterial, 'water');
          this.stats.waterVerts = sec.floats / 3;
        } else if (sec.name === 'parks') {
          this.parkMesh = this.makeMesh(pos, this.parkMaterial, 'parks');
          this.stats.parkVerts = sec.floats / 3;
        } else if (sec.name === 'bridgeDeck') {
          this.bridges.addSection(pos, 'deck');
        } else if (sec.name === 'bridgePier') {
          this.bridges.addSection(pos, 'pier');
        } else if (sec.name === 'bridgeRail') {
          this.bridges.addSection(pos, 'rail');
        } else if (sec.name === 'flyoverPiers') {
          this.flyoverPierMesh = this.makeMesh(pos, this.flyoverPierMat, 'flyoverPiers');
        } else if (sec.name === 'flyoverBarriers') {
          this.flyoverBarrierMesh = this.makeMesh(pos, this.flyoverBarrierMat, 'flyoverBarriers');
        } else if (sec.name === 'railBed') {
          this.railBedMesh = this.makeMesh(pos, this.railBedMat, 'railBed');
          this.railBedMesh.castShadow = true;
          this.stats.railVerts += sec.floats / 3;
        } else if (sec.name === 'railSleepers') {
          this.railSleeperMesh = this.makeMesh(pos, this.railSleeperMat, 'railSleepers');
          this.stats.railVerts += sec.floats / 3;
        } else if (sec.name === 'railRails') {
          this.railRailsMesh = this.makeMesh(pos, this.railRailsMat, 'railRails');
          this.stats.railVerts += sec.floats / 3;
        } else if (sec.name === 'metroDeck') {
          this.metroDeckMesh = this.makeMesh(pos, this.metroDeckMat, 'metroDeck');
          this.metroDeckMesh.castShadow = true;
        } else if (sec.name === 'metroCanopy') {
          this.metroCanopyMesh = this.makeMesh(pos, this.metroCanopyMat, 'metroCanopy');
          this.metroCanopyMesh.castShadow = true;
        } else if (sec.name === 'metroColumn') {
          this.metroColumnMesh = this.makeMesh(pos, this.metroDeckMat, 'metroColumn');
        }
      }
    }
  }

  private makeMesh(
    pos: Float32Array,
    mat: THREE.MeshStandardMaterial,
    name: string,
  ): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }

  /** Advance the water animation. Called every frame from the render loop. */
  public updateTime(seconds: number): void {
    this.waterTime.value = seconds;
  }

  public update(altitude: number): void {
    const show = (cls: RoadClass, maxAlt: number) => {
      const mesh = this.roadMeshes.get(cls);
      if (mesh) mesh.visible = this.roadsEnabled && altitude <= maxAlt;
    };
    show('motorway', Infinity);
    show('trunk', Infinity);
    show('primary', Infinity);
    show('flyover', Infinity);
    show('railway', Infinity);

    if (this.flyoverPierMesh) this.flyoverPierMesh.visible = this.roadsEnabled && altitude <= 6000;
    if (this.flyoverBarrierMesh) this.flyoverBarrierMesh.visible = this.roadsEnabled && altitude <= 6000;

    // The bed carries the line at every altitude; rails and sleepers are detail
    // that stops resolving well before it stops costing anything.
    if (this.railBedMesh) this.railBedMesh.visible = this.roadsEnabled;
    // The rails are what identify a line as a railway rather than a service
    // road, so they stay on as long as the bed does rather than dropping out at
    // district height and leaving a bare ballast strip.
    if (this.railRailsMesh) this.railRailsMesh.visible = this.roadsEnabled && altitude <= 12000;
    if (altitude <= 1800) this.loadDetail();
    if (this.railSleeperMesh) this.railSleeperMesh.visible = this.roadsEnabled && altitude <= 1800;

    const metroOn = this.roadsEnabled && altitude <= 6000;
    if (this.metroDeckMesh) this.metroDeckMesh.visible = metroOn;
    if (this.metroCanopyMesh) this.metroCanopyMesh.visible = metroOn;
    if (this.metroColumnMesh) this.metroColumnMesh.visible = metroOn;

    const n = this.isNight ? 3.2 : 1.0;
    show('secondary', 9000 * n);
    show('tertiary', 4500 * n);
    show('residential', 2200 * n);
    show('service', 1200);
    show('footway', 700);
  }

  public setLayerVisibility(v: { roads: boolean; parks: boolean; water: boolean }): void {
    this.roadsEnabled = v.roads;
    this.bridges.setVisible(v.roads);
    if (!v.roads) {
      for (const mesh of this.roadMeshes.values()) mesh.visible = false;
      if (this.flyoverPierMesh) this.flyoverPierMesh.visible = false;
      if (this.flyoverBarrierMesh) this.flyoverBarrierMesh.visible = false;
      if (this.railBedMesh) this.railBedMesh.visible = false;
      if (this.railSleeperMesh) this.railSleeperMesh.visible = false;
      if (this.railRailsMesh) this.railRailsMesh.visible = false;
      if (this.metroDeckMesh) this.metroDeckMesh.visible = false;
      if (this.metroCanopyMesh) this.metroCanopyMesh.visible = false;
      if (this.metroColumnMesh) this.metroColumnMesh.visible = false;
    }
    if (this.waterMesh) this.waterMesh.visible = v.water;
    if (this.parkMesh) this.parkMesh.visible = v.parks;
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;

    this.bridges.setNightMode(night);
    for (const [cls, mat] of this.roadMaterials) {
      mat.color.setHex(night ? ROAD_COLORS_NIGHT[cls] : ROAD_COLORS_DAY[cls]);
      mat.emissive.setHex(night ? ROAD_EMISSIVE_NIGHT[cls] : 0x000000);
      mat.emissiveIntensity = night ? 1 : 0;
    }

    if (night) {
      this.waterMaterial.color.setHex(0x14293d);
      this.waterMaterial.roughness = 0.22;
      this.waterNight.value = 1;
      this.parkMaterial.color.setHex(0x16241a);
      this.flyoverPierMat.color.setHex(0x1e2025);
      this.flyoverBarrierMat.color.setHex(0x2d2f36);
      this.flyoverBarrierMat.emissive.setHex(0x382a14);
      this.railBedMat.color.setHex(0x24221f);
      this.railSleeperMat.color.setHex(0x2b2824);
      // Yard lighting is what makes Charbagh legible at night.
      this.railRailsMat.color.setHex(0x5c5f66);
      this.metroDeckMat.color.setHex(0x33353c);
      this.metroCanopyMat.color.setHex(0x3d4149);
      this.metroCanopyMat.emissive.setHex(0x2a2213);
    } else {
      this.waterMaterial.color.setHex(0x4e7a80);
      this.waterMaterial.roughness = 0.34;
      this.waterNight.value = 0;
      this.parkMaterial.color.setHex(0x5f7a4c);
      this.flyoverPierMat.color.setHex(0x606268);
      this.flyoverBarrierMat.color.setHex(0x7a7d84);
      this.flyoverBarrierMat.emissive.setHex(0x000000);
      this.railBedMat.color.setHex(0x6b645a);
      this.railSleeperMat.color.setHex(0x8a8478);
      this.railRailsMat.color.setHex(0x9a9ba0);
      this.metroDeckMat.color.setHex(0xb9b3a8);
      this.metroCanopyMat.color.setHex(0xd2d6da);
      this.metroCanopyMat.emissive.setHex(0x000000);
    }
  }

  public dispose(): void {
    this.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.bridges.dispose();
    this.flyoverPierMat.dispose();
    this.flyoverBarrierMat.dispose();
    this.railBedMat.dispose();
    this.railSleeperMat.dispose();
    this.railRailsMat.dispose();
    this.metroDeckMat.dispose();
    this.metroCanopyMat.dispose();
    for (const mat of this.roadMaterials.values()) mat.dispose();
    this.waterMaterial.dispose();
    this.parkMaterial.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
