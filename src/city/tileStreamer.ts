import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';
import {
  TileManifest, TileManifestItem, BuildingFootprint,
  CityStreamingStats, LODLevel,
} from '../types';
import { BuildingMaterialSystem, type SkylineStyle } from './buildingMaterial';
import { HLODLayer } from './hlodLayer';
import { CityOverlay } from './cityOverlay';
import { ROAD_LAYER_Y, type RoadClass } from './ribbon';
import { createRoadMaterial, applyRoadPalette, roadUniforms } from './roadMaterial';
import { GroundSurface } from './groundSurface';
import { buildLandmarkLayer, type LandmarkLayer } from './landmarks';
import { MetroSystem } from './metroSystem';
import { TrafficSystem } from './traffic';
import { RailAirSystem } from './railAir';
import { buildTreePrototypes, createTreeMaterial, pickSpecies, SPECIES, SPECIES_COUNT } from './treePrototypes';
import type { TileWorkerRequest, TileWorkerResponse } from './tileWorker';
import { getDeviceProfile } from './deviceProfile';
import { performanceConfig } from './performanceConfig';

/**
 * TileStreamer — full-detail streaming for the two close scales.
 *
 * The representation is now split by altitude:
 *   FULL CITY / DISTRICT  -> HLODLayer only (baked real-footprint super-tiles)
 *   NEIGHBOURHOOD / STREET -> these 500 m JSON tiles, inside a small radius
 *
 * That split is the fix for the audit's core failure. Previously DISTRICT asked for
 * 500 m tiles across a 25 km radius with 2 concurrent loads, queued hundreds of
 * fetches, and never rendered a single building. 500 m tiles are only requested now
 * when they are actually resolvable on screen.
 */

export enum TileState {
  UNLOADED = 'UNLOADED',
  LOADING = 'LOADING',
  VISIBLE = 'VISIBLE',
}

interface LoadedTileContainer {
  id: string;
  group: THREE.Group;
  lod: LODLevel;
  stats: { buildings: number; roads: number; trees: number };
  /** Near-range rooftop/facade detail mesh, built on demand (see DETAIL_*). */
  detail?: THREE.Mesh;
  detailPending?: boolean;
  /** Full species tree meshes vs the single far blob mesh. */
  treesNear?: THREE.Object3D[];
  treesFar?: THREE.Object3D;
}

/** Rooftop/facade detail only exists below this altitude. */
const DETAIL_MAX_ALT = 1500;

/** Altitude breakpoints, metres. */
const ALT_DISTRICT = 4000;
const ALT_NEIGHBOURHOOD = 1800;
const ALT_STREET = 600;

/** Streaming radius per LOD. HLOD covers the macro city; detail tiles stream in closer. */
const STREAM_RADIUS: Record<number, number> = {
  0: 0,
  1: 3200,
  2: 2600,
  3: 2600,
};

/**
 * Content tier actually requested from the worker. LOD 2 and LOD 3 both read
 * `data.lod2` from the source tiles, so their geometry is byte-identical — the only
 * difference was the radius. Keying loaded tiles on the raw LOD made every 600 m
 * crossing invalidate and rebuild every tile in view, which is the flicker you see
 * when zooming. Both tiers now share one key, so crossing costs nothing.
 */
const CONTENT_TIER = 2 as LODLevel;

/**
 * Night lamp brightness. Well above 1.0 on purpose: under ACES tone mapping an
 * emissive of 1.6 lands in the same range as a sunlit wall, so the old lamps read
 * as beige boxes. Pushing the head into the highlight rolloff is what makes it
 * look like a working sodium lamp.
 */
const LAMP_EMISSIVE_NIGHT = 5.2;
/** Halo and ground-pool opacity at night. */
const LAMP_GLOW_NIGHT = 0.85;
const LAMP_POOL_NIGHT = 0.5;

export class TileStreamer {
  private scene: THREE.Scene;
  private manifest: TileManifest | null = null;
  private hlod: HLODLayer;
  private overlay: CityOverlay;
  private materials: BuildingMaterialSystem;

  private groundGroup = new THREE.Group();
  private tileGroupParent = new THREE.Group();
  /** Only the first worker failure is logged — they arrive per tile. */
  private workerErrorLogged = false;
  private debugGroup = new THREE.Group();

  private loadedTiles = new Map<string, LoadedTileContainer>();
  public loadedBuildings = new Map<string, BuildingFootprint>();
  private tileBuildingsMap = new Map<string, string[]>();

  // ── Worker pool ───────────────────────────────────────────────────────────
  private workers: Worker[] = [];
  private workerBusy: boolean[] = [];
  // Sized from the device: spawning four decode workers on a two-core phone makes
  // them fight each other and the compositor rather than parallelising anything.
  private readonly WORKER_COUNT = getDeviceProfile().workerCount;
  private pending = new Map<string, { tile: TileManifestItem; lod: LODLevel }>();

  /**
   * Stable priority queue. The old implementation rebuilt and re-sorted the queue
   * from scratch every 200 ms, which continuously displaced in-flight work. This one
   * only inserts genuinely new requests and re-scores existing entries in place.
   */
  private queue: Array<{ id: string; tile: TileManifestItem; lod: LODLevel; score: number }> = [];
  private queued = new Set<string>();

  private currentLOD: LODLevel = 0;
  /** Lamps are only worth drawing at street scale; see `setLampsVisible`. */
  private lampsVisible = false;
  public stableMode = true;
  public debugMode = false;
  private isNight = true;
  private skylineStyle: SkylineStyle = 'warm';

  private roadMaterials: Record<string, THREE.MeshStandardMaterial> = {};
  private parkMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private ground: GroundSurface;
  private treeGeometries: THREE.BufferGeometry[] = [];
  private treeMaterial!: THREE.MeshStandardMaterial;
  private readonly detailRadius = getDeviceProfile().detailRadius;
  private readonly treeNearRadius = getDeviceProfile().treeNearRadius;
  private lastAltitude = 1e9;
  private landmarks: LandmarkLayer;
  private metro = new MetroSystem();
  private traffic = new TrafficSystem();
  private railAir = new RailAirSystem();

  private lampMastGeo!: THREE.BufferGeometry;
  private lampHeadGeo!: THREE.BufferGeometry;
  private lampMastMat!: THREE.MeshStandardMaterial;
  private lampHeadMat!: THREE.MeshStandardMaterial;
  /** Additive halo + ground pool that make a lamp read as a light, not a lit box. */
  private lampGlowGeo!: THREE.BufferGeometry;
  private lampGlowMat!: THREE.Material;
  private lampPoolGeo!: THREE.BufferGeometry;
  private lampPoolMat!: THREE.Material;

  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 120;

  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();
  private tileBoxes = new Map<string, THREE.Box3>();
  private manifestIndex = new Map<string, TileManifestItem>();

  /** Camera motion, used to bias loading along the direction of travel. */
  private lastCamPos = new THREE.Vector3();
  private camVelocity = new THREE.Vector3();

  private layerVisibility = { buildings: true, roads: true, parks: true, water: true };

  private stats: CityStreamingStats = {
    loadedTiles: 0, visibleTiles: 0, totalBuildings: 0, totalRoads: 0,
    totalTrees: 0, currentLOD: 0, zoomScaleName: 'FULL CITY',
    stableMode: true, pendingLoads: 0,
  };

  constructor(scene: THREE.Scene, materials: BuildingMaterialSystem) {
    this.scene = scene;
    this.materials = materials;

    scene.add(this.groundGroup);
    scene.add(this.tileGroupParent);
    scene.add(this.debugGroup);

    const dist = materials.getDistrictUniforms();
    this.ground = new GroundSurface(dist.tex, dist.xform);
    scene.add(this.ground.group);

    for (const cat of ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'railway', 'flyover'] as RoadClass[]) {
      this.roadMaterials[cat] = createRoadMaterial(cat);
      (this.roadMaterials[cat] as unknown as { uniforms: unknown }).uniforms = roadUniforms;
    }

    this.parkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3e2f, roughness: 0.98, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d2438, roughness: 0.32, metalness: 0.08,
    });

    this.buildTreePrototypes();
    this.buildLampPrototype();
    this.initWorkers();

    this.hlod = new HLODLayer(scene, materials);
    // Procedural landmark models (their source footprints are excluded from tiles + HLOD).
    this.landmarks = buildLandmarkLayer(materials.solid);
    scene.add(this.landmarks.group);
    this.overlay = new CityOverlay(scene);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP

  private buildTreePrototypes(): void {
    this.treeGeometries = buildTreePrototypes();
    this.treeMaterial = createTreeMaterial();
  }

  /**
   * A single lamp prototype: vertical mast plus a short cantilever arm, and a
   * separate head so only the head can be emissive at night. Both are shared by
   * every InstancedMesh, so lamp count costs matrices, not geometry.
   */
  private buildLampPrototype(): void {
    const mastH = 8.5;
    const pole = new THREE.CylinderGeometry(0.11, 0.16, mastH, 5);
    pole.translate(0, mastH / 2, 0);
    const arm = new THREE.BoxGeometry(1.9, 0.13, 0.13);
    arm.translate(0.95, mastH - 0.25, 0);
    this.lampMastGeo = mergePositionOnly([pole, arm]);

    const head = new THREE.BoxGeometry(0.85, 0.22, 0.42);
    head.translate(1.75, mastH - 0.42, 0);
    this.lampHeadGeo = head;

    this.lampMastMat = new THREE.MeshStandardMaterial({
      color: 0x3a3d42, roughness: 0.7, metalness: 0.5,
    });
    // Sodium-vapour warm. Emissive only — no PointLight per lamp. Driven well past
    // 1.0 so ACES tone mapping still resolves the head as a hot white-orange core
    // rather than clipping it to the same flat amber as the surrounding fitting.
    this.lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0x2a2724,
      emissive: 0xffc271,
      emissiveIntensity: LAMP_EMISSIVE_NIGHT,
      roughness: 0.5,
    });

    // Halo: a camera-facing quad with a soft radial falloff, additively blended.
    // This is what actually sells brightness — an emissive box cannot bloom, and a
    // real PointLight per lamp would be thousands of lights per frame.
    this.lampGlowGeo = new THREE.PlaneGeometry(7.2, 7.2);
    // The quad's vertices sit at the origin and are moved to the lamp head by the
    // vertex shader, so the geometry's own bounds describe the wrong place and the
    // instanced bounding sphere would cull halos that are still on screen. State
    // the real extent — centred on the head, radius covering the quad's diagonal.
    this.lampGlowGeo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(1.75, mastH - 0.42, 0), 5.2,
    );
    this.lampGlowMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Seeded to the night values because `isNight` starts true and
      // `setNightMode` short-circuits when the flag does not change — so
      // applyPalette never runs on a cold start and a 0 here left the glow
      // switched off for the whole session.
      uniforms: { uIntensity: { value: LAMP_GLOW_NIGHT }, uColor: { value: new THREE.Color(0xffb457) } },
      // Billboarded in view space: the lamp head's world position comes from the
      // instance matrix, then the quad is expanded on the view axes so the halo
      // faces the camera from any orbit angle instead of edge-on vanishing.
      // The logdepthbuf chunks are not optional. The renderer runs with
      // `logarithmicDepthBuffer: true`, and a raw ShaderMaterial that omits them
      // writes a depth three's own materials never agree with, so every glow
      // fragment failed the depth test — the quads were drawn and invisible.
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 head = instanceMatrix * vec4(${'1.75'}, ${(mastH - 0.42).toFixed(2)}, 0.0, 1.0);
          vec4 center = modelViewMatrix * head;
          gl_Position = projectionMatrix * vec4(center.xyz + vec3(position.xy, 0.0), 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uIntensity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float d = distance(vUv, vec2(0.5)) * 2.0;
          // Two lobes: a tight core plus a wide bloom, so the falloff reads as
          // light scattering in air rather than as a flat translucent disc.
          float core = pow(max(0.0, 1.0 - d), 5.0);
          float bloom = pow(max(0.0, 1.0 - d), 1.6) * 0.35;
          float a = (core + bloom) * uIntensity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });

    // Ground pool: the light actually landing on the carriageway. Laid flat just
    // above the road surface, which is the cue the previous lamps never gave.
    this.lampPoolGeo = new THREE.PlaneGeometry(15, 15);
    this.lampPoolGeo.rotateX(-Math.PI / 2);
    this.lampPoolGeo.translate(1.75, 0.35, 0);
    this.lampPoolMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uIntensity: { value: LAMP_POOL_NIGHT }, uColor: { value: new THREE.Color(0xffa845) } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uIntensity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float d = distance(vUv, vec2(0.5)) * 2.0;
          float a = pow(max(0.0, 1.0 - d), 2.6) * uIntensity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
  }

  private initWorkers(): void {
    for (let i = 0; i < this.WORKER_COUNT; i++) {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<TileWorkerResponse>) => this.onWorkerMessage(i, e.data);
      w.onerror = (err) => {
        console.warn('[TileStreamer] worker error:', err.message);
        this.workerBusy[i] = false;
      };
      this.workers.push(w);
      this.workerBusy.push(false);
    }
  }

  /** Current position of a metro train head, for the guided tour camera. */
  public metroTrainHead(): { x: number; y: number; z: number; ang: number } | null {
    return this.metro.trainHead(performance.now() / 1000);
  }

  public async init(): Promise<void> {
    const [manifestResult, hlodManifest] = await Promise.all([
      loadJSON<TileManifest>('/overture_tiles_full/manifest.json').catch(() => null),
      this.hlod.init(),
      // The city-wide road network, Gomti and parks are built once and stay
      // resident — they are what makes Lucknow legible at every altitude.
      this.overlay.init(),
    ]);

    if (manifestResult) {
      this.manifest = manifestResult;
      for (const t of this.manifest!.tiles) {
        this.manifestIndex.set(t.id, t);
        this.tileBoxes.set(t.id, new THREE.Box3(
          new THREE.Vector3(t.bounds.minX, -20, t.bounds.minZ),
          new THREE.Vector3(t.bounds.maxX, 320, t.bounds.maxZ),
        ));
      }
    }

    void hlodManifest;
    await this.ground.init().catch((e) => console.warn('[TileStreamer] ground init failed:', e));
    await this.metro.init(this.scene).catch((e) => console.warn('[TileStreamer] metro init failed:', e));
    this.metro.setNightMode(this.isNight);
    await this.traffic.init(this.scene).catch((e) => console.warn('[TileStreamer] traffic init failed:', e));
    this.traffic.setNightMode(this.isNight);
    await this.railAir.init(this.scene).catch((e) => console.warn('[TileStreamer] rail/air init failed:', e));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE

  public update(camera: THREE.PerspectiveCamera): void {
    const now = performance.now();

    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    // Traffic animates every frame (the rest of the streamer is throttled).
    this.traffic.update(now / 1000, camera, camera.position.y);
    this.railAir.update(now / 1000, camera.position.y);

    const isInteracting = performanceConfig.isInteracting;
    const updateInterval = isInteracting ? 450 : this.UPDATE_INTERVAL;
    if (now - this.lastUpdateTime < updateInterval) {
      if (!isInteracting) this.cullLoadedTiles();
      return;
    }
    const dt = Math.max(1, now - this.lastUpdateTime);
    this.lastUpdateTime = now;

    this.camVelocity.subVectors(camera.position, this.lastCamPos).multiplyScalar(1000 / dt);
    this.lastCamPos.copy(camera.position);

    const altitude = camera.position.y;
    const { lod, scaleName } = this.resolveLOD(altitude);
    this.currentLOD = lod;
    // Lamps show at street scale during day, and extend to neighborhood scale at night for glowing road networks
    this.setLampsVisible(lod >= 3 || (this.isNight && lod >= 2));

    // Detail ramp feeds the building shader: facade banding and AO strength fade in
    // as you descend, so nothing aliases at city scale.
    this.materials.setDetail(1 - THREE.MathUtils.clamp((altitude - 300) / 3000, 0, 1));

    const hasHlod = this.hlod.hasManifest();
    const baseRadius = hasHlod ? (STREAM_RADIUS[lod] ?? 0) : Math.max(STREAM_RADIUS[lod] ?? 0, 3200);
    const streamRadius = baseRadius * performanceConfig.config.streamRadiusScale;

    // Minor road classes drop out with altitude; major corridors never do.
    this.overlay.update(altitude);
    this.overlay.updateTime(now / 1000);

    // HLOD carries district and full city scale; relief stream gives 3D massing to skyline landmarks.
    this.hlod.update(camera, true, streamRadius * 0.85);

    if (streamRadius > 0 && this.manifest) {
      this.updateStreamedTiles(camera, lod, streamRadius);
      if (!isInteracting) {
        this.warmCache(camera.position.x, camera.position.z, streamRadius);
      }
    } else {
      this.retireAllStreamedTiles();
    }

    this.lastAltitude = altitude;
    this.ground.update(camera.position);
    roadUniforms.uRoadCam.value.copy(camera.position);
    this.updateDetailAndTrees(camera, altitude);
    this.metro.update(now / 1000, altitude);
    this.landmarks.update(now / 1000);

    this.pumpQueue();
    this.cullLoadedTiles();
    this.debugGroup.visible = this.debugMode;

    let bldgs = 0, roads = 0, trees = 0;
    for (const c of this.loadedTiles.values()) {
      bldgs += c.stats.buildings;
      roads += c.stats.roads;
      trees += c.stats.trees;
    }

    const h = this.hlod.getStats();
    this.stats = {
      loadedTiles: this.loadedTiles.size + h.superTilesLoaded,
      visibleTiles: this.loadedTiles.size + h.fabricMeshes + h.reliefMeshes,
      // HLOD buildings are real Overture footprints, so they count.
      totalBuildings: bldgs + h.buildings,
      totalRoads: roads,
      totalTrees: trees,
      currentLOD: lod,
      zoomScaleName: scaleName,
      stableMode: this.stableMode,
      pendingLoads: this.queue.length + this.pending.size + h.pending,
    };
  }

  private resolveLOD(altitude: number): { lod: LODLevel; scaleName: CityStreamingStats['zoomScaleName'] } {
    // Hysteresis applies in both modes. Hard thresholds meant hovering near a
    // boundary flipped LOD every tick.
    const cur0 = this.currentLOD;
    const up = 1.12;
    const down = 0.89;
    let lod0 = cur0;
    if (cur0 === 0 && altitude < ALT_DISTRICT * down) lod0 = 1;
    else if (cur0 === 1) {
      if (altitude > ALT_DISTRICT * up) lod0 = 0;
      else if (altitude < ALT_NEIGHBOURHOOD * down) lod0 = 2;
    } else if (cur0 === 2) {
      if (altitude > ALT_NEIGHBOURHOOD * up) lod0 = 1;
      else if (altitude < ALT_STREET * down) lod0 = 3;
    } else if (cur0 === 3 && altitude > ALT_STREET * up) lod0 = 2;

    const names: CityStreamingStats['zoomScaleName'][] = ['FULL CITY', 'DISTRICT', 'NEIGHBORHOOD', 'STREET'];
    return { lod: lod0 as LODLevel, scaleName: names[lod0] };
  }

  private updateStreamedTiles(camera: THREE.PerspectiveCamera, lod: LODLevel, radius: number): void {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    // Keep loaded tiles well beyond the stream radius so zooming out and back in never reloads them.
    const unloadRadius = radius * (getDeviceProfile().tier === 'low' ? 1.6 : 2.4);

    // Look-ahead point: where the camera will be in ~1.5 s. Tiles near it score
    // better, so flying forward preloads forward instead of behind.
    const aheadX = camX + this.camVelocity.x * 1.5;
    const aheadZ = camZ + this.camVelocity.z * 1.5;

    for (const tile of this.manifest!.tiles) {
      const dist = Math.hypot(tile.center.x - camX, tile.center.z - camZ);
      if (dist > radius) continue;
      if ((tile.bldgsLOD2 ?? 0) === 0 && (tile.roadsCount ?? 0) === 0) continue;

      const box = this.tileBoxes.get(tile.id);
      if (!box) continue;

      const inView = this.frustum.intersectsBox(box);
      const existing = this.loadedTiles.get(tile.id);
      if (existing && existing.lod === CONTENT_TIER) continue;
      if (this.pending.has(tile.id)) continue;

      const aheadDist = Math.hypot(tile.center.x - aheadX, tile.center.z - aheadZ);
      // Lower score = loaded sooner. In-frustum tiles win outright; everything else
      // is ordered by how soon the camera is heading towards it.
      const score = (inView ? 0 : 100000) + Math.min(dist, aheadDist);

      this.enqueue(tile, CONTENT_TIER, score);
    }

    // Drop queue entries that have fallen out of range entirely.
    if (this.queue.length > 0) {
      this.queue = this.queue.filter((q) => {
        const d = Math.hypot(q.tile.center.x - camX, q.tile.center.z - camZ);
        if (d > unloadRadius) {
          this.queued.delete(q.id);
          return false;
        }
        return true;
      });
    }

    // Retire far tiles.
    for (const [id, container] of this.loadedTiles) {
      const meta = this.tileBoxes.get(id);
      if (!meta) continue;
      const cx = (meta.min.x + meta.max.x) / 2;
      const cz = (meta.min.z + meta.max.z) / 2;
      if (Math.hypot(cx - camX, cz - camZ) > unloadRadius) {
        this.retireTile(id, container);
      }
    }
  }

  private enqueue(tile: TileManifestItem, lod: LODLevel, score: number): void {
    if (this.queued.has(tile.id)) {
      // Re-score in place rather than rebuilding the queue.
      const entry = this.queue.find((q) => q.id === tile.id);
      if (entry) { entry.score = score; entry.lod = lod; }
      return;
    }
    this.queue.push({ id: tile.id, tile, lod, score });
    this.queued.add(tile.id);
  }

  /** Idle prefetch: when nothing is queued, quietly fetch tile files around the camera into the HTTP
   *  cache (no geometry is built), so panning and zooming find them already downloaded. */
  private warmed = new Set<string>();
  private lastWarm = 0;
  private warmCache(cx: number, cz: number, radius: number): void {
    if (!this.manifest || this.queue.length > 0 || this.pending.size > 0 || performanceConfig.isInteracting) return;
    const now = performance.now();
    if (now - this.lastWarm < 600) return;
    this.lastWarm = now;
    let n = 0;
    const r = radius * (getDeviceProfile().tier === 'low' ? 1.3 : 1.8);
    // Fast linear scan with early break instead of full array allocation and sort
    for (let i = 0; i < this.manifest.tiles.length; i++) {
      const t = this.manifest.tiles[i];
      if (this.warmed.has(t.id) || this.loadedTiles.has(t.id)) continue;
      const d = Math.hypot(t.center.x - cx, t.center.z - cz);
      if (d < r) {
        this.warmed.add(t.id);
        fetch(`/overture_tiles_full/${t.id}.json`, { priority: 'low' } as RequestInit).catch(() => this.warmed.delete(t.id));
        if (++n >= 4) break;
      }
    }
  }

  private pumpQueue(): void {
    if (this.queue.length === 0) return;
    this.queue.sort((a, b) => a.score - b.score);

    for (let i = 0; i < this.workers.length && this.queue.length > 0; i++) {
      if (this.workerBusy[i]) continue;
      const next = this.queue.shift()!;
      this.queued.delete(next.id);

      const originX = next.tile.center.x;
      const originZ = next.tile.center.z;
      this.pending.set(next.id, { tile: next.tile, lod: next.lod });
      this.workerBusy[i] = true;

      const isDetail = next.id.endsWith('#d');
      const req: TileWorkerRequest = {
        id: next.id,
        url: `/overture_tiles_full/${isDetail ? next.id.slice(0, -2) : next.tile.id}.json`,
        lod: next.lod,
        originX,
        originZ,
        kind: isDetail ? 'detail' : 'full',
      };
      this.workers[i].postMessage(req);
    }
  }

  private onWorkerMessage(workerIndex: number, msg: TileWorkerResponse): void {
    this.workerBusy[workerIndex] = false;
    const req = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (!req) return;
    if (msg.kind === 'detail') {
      const baseId = msg.id.slice(0, -2);
      const container = this.loadedTiles.get(baseId);
      if (container) {
        container.detailPending = false;
        if (msg.ok && msg.detail && msg.detail.count > 0 && !container.detail) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(msg.detail.pos, 3));
          geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(msg.detail.pack, 4, true));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, this.materials.solid);
          mesh.name = 'buildingDetail';
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.visible = this.layerVisibility.buildings && this.lastAltitude < DETAIL_MAX_ALT;
          container.group.add(mesh);
          container.detail = mesh;
        }
      }
      this.pumpQueue();
      return;
    }
    if (!msg.ok) {
      // Previously a bare `return`. A worker that throws on every tile then looks
      // exactly like a city with no streamed detail and a clean console, which is
      // precisely how it went unnoticed.
      if (!this.workerErrorLogged) {
        this.workerErrorLogged = true;
        console.error(`[TileStreamer] tile worker failed on ${msg.id}: ${msg.error}`);
      }
      return;
    }

    const group = this.assembleTile(msg);
    // Swap only once the replacement is fully built — no half-built regions.
    const old = this.loadedTiles.get(msg.id);
    if (old) {
      this.tileGroupParent.remove(old.group);
      disposeGroup(old.group);
    }
    applyLayerVisibility(group, this.layerVisibility);
    this.tileGroupParent.add(group);

    this.loadedTiles.set(msg.id, {
      id: msg.id,
      group,
      treesNear: group.userData.treesNear,
      treesFar: group.userData.treesFar,
      lod: req.lod,
      stats: {
        buildings: msg.counts?.buildings ?? 0,
        roads: msg.counts?.roads ?? 0,
        trees: msg.counts?.trees ?? 0,
      },
    });

    // Building records back the click-to-inspect path.
    if (msg.buildings?.ids) {
      this.tileBuildingsMap.set(msg.id, msg.buildings.ids);
    }

    // Immediately pull more work through.
    this.pumpQueue();
  }

  private assembleTile(msg: TileWorkerResponse): THREE.Group {
    const group = new THREE.Group();
    group.name = msg.id;
    group.position.set(msg.originX, 0, msg.originZ);
    group.matrixAutoUpdate = false;
    group.updateMatrix();

    if (msg.buildings && msg.buildings.count > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(msg.buildings.pos, 3));
      geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(msg.buildings.pack, 4, true));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials.solid);
      mesh.name = 'buildings';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    if (msg.roads) {
      for (const strip of msg.roads) {
        if (strip.pos.length === 0) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(strip.pos, 3));
        geo.setAttribute('aRoadUV', new THREE.BufferAttribute(strip.uv, 2));
        geo.computeBoundingSphere();
        const mat = this.roadMaterials[strip.category] || this.roadMaterials.residential;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'roads';
        mesh.position.y = ROAD_LAYER_Y[strip.category as RoadClass] ?? 0.12;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    if (msg.parks && msg.parks.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(msg.parks, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.parkMaterial);
      mesh.name = 'parks';
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    if (msg.water && msg.water.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(msg.water, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.name = 'water';
      group.add(mesh);
    }

    if (msg.trees && msg.trees.length > 0) {
      const t = this.addTrees(group, msg.trees);
      if (t) { group.userData.treesNear = t.near; group.userData.treesFar = t.far; }
    }

    if (msg.streetlights && msg.streetlights.length > 0) {
      this.addStreetlights(group, msg.streetlights, this.lampsVisible);
    }

    return group;
  }

  /**
   * Lamps exist on every streamed tile but are only drawn at street scale — from
   * neighbourhood up they are a picket of sub-pixel masts that costs four draws a
   * tile and reads as noise. Toggling visibility is far cheaper than the old
   * approach of rebuilding tile geometry when the altitude band changes.
   */
  private setLampsVisible(on: boolean): void {
    if (on === this.lampsVisible) return;
    this.lampsVisible = on;
    for (const t of this.loadedTiles.values()) {
      for (const child of t.group.children) {
        if (child.name === 'streetlights') child.visible = on;
      }
    }
  }

  /** Drive both additive lamp passes from one place. */
  private setLampGlow(halo: number, pool: number): void {
    const g = this.lampGlowMat as THREE.ShaderMaterial;
    const p = this.lampPoolMat as THREE.ShaderMaterial;
    if (g?.uniforms?.uIntensity) g.uniforms.uIntensity.value = halo;
    if (p?.uniforms?.uIntensity) p.uniforms.uIntensity.value = pool;
  }

  /**
   * Streetlights as two InstancedMeshes per tile — mast and lamp head. Thousands of
   * lamps therefore cost two draw calls, not thousands of objects, and none of them
   * is a real light: the head is emissive and the pooled illumination comes from the
   * building shader's night floor plus the road emissive hierarchy.
   */
  private addStreetlights(group: THREE.Group, lamps: Float32Array, visible: boolean): void {
    const count = lamps.length / 3;
    if (count === 0) return;

    const mast = new THREE.InstancedMesh(this.lampMastGeo, this.lampMastMat, count);
    const head = new THREE.InstancedMesh(this.lampHeadGeo, this.lampHeadMat, count);
    mast.name = 'streetlights';
    head.name = 'streetlights';
    mast.castShadow = false;
    head.castShadow = false;
    // A tile that streams in while the camera is high must not pop its lamps on.
    mast.visible = visible;
    head.visible = visible;

    // Glow is two more instanced draws per tile, and only where the device can
    // afford the additive overdraw.
    const wantGlow = getDeviceProfile().lampGlow;
    const glow = wantGlow ? new THREE.InstancedMesh(this.lampGlowGeo, this.lampGlowMat, count) : null;
    const pool = wantGlow ? new THREE.InstancedMesh(this.lampPoolGeo, this.lampPoolMat, count) : null;
    if (glow && pool) {
      glow.name = 'streetlights';
      pool.name = 'streetlights';
      // Additive halos must not occlude each other or the buildings behind them.
      glow.renderOrder = 3;
      pool.renderOrder = 2;
      glow.frustumCulled = true;
      pool.frustumCulled = true;
      glow.visible = visible;
      pool.visible = visible;
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(lamps[i * 3], 0, lamps[i * 3 + 1]);
      dummy.rotation.set(0, -lamps[i * 3 + 2], 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mast.setMatrixAt(i, dummy.matrix);
      head.setMatrixAt(i, dummy.matrix);
      glow?.setMatrixAt(i, dummy.matrix);
      pool?.setMatrixAt(i, dummy.matrix);
    }
    mast.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    group.add(mast);
    group.add(head);
    if (glow && pool) {
      glow.instanceMatrix.needsUpdate = true;
      pool.instanceMatrix.needsUpdate = true;
      group.add(glow);
      group.add(pool);
    }
  }

  /**
   * Trees: one InstancedMesh per species for the near representation, plus one blob
   * InstancedMesh for distance. Which one shows is decided per tile by camera distance
   * in updateDetailAndTrees, so a tile costs at most six tree draws up close and one far.
   * Worker layout: x, y, z, scale, kind (5 floats per tree).
   */
  private addTrees(group: THREE.Group, trees: Float32Array): { near: THREE.Object3D[]; far: THREE.Object3D } | null {
    const count = Math.floor(trees.length / 5);
    if (count === 0) return null;
    const buckets: number[][] = Array.from({ length: SPECIES_COUNT }, () => []);
    const hashOf = (i: number) => {
      const h = Math.sin(trees[i * 5] * 12.9898 + trees[i * 5 + 2] * 78.233) * 43758.5453;
      return h - Math.floor(h);
    };
    // Device budget: weaker tiers keep a deterministic fraction of the (dense) canopy.
    const keepFrac = getDeviceProfile().quality === 'low' ? 0.38 : getDeviceProfile().quality === 'medium' ? 0.7 : 1;
    const kept: number[] = [];
    for (let i = 0; i < count; i++) {
      const hk = Math.sin(trees[i * 5] * 4.1414 + trees[i * 5 + 2] * 9.7351) * 24634.6345;
      if (keepFrac >= 1 || hk - Math.floor(hk) < keepFrac) kept.push(i);
    }
    for (const i of kept) buckets[pickSpecies(trees[i * 5 + 4], hashOf(i))].push(i);

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    const frac = (v: number) => v - Math.floor(v);
    const place = (inst: THREE.InstancedMesh, j: number, i: number) => {
      const h = hashOf(i);
      const s = (trees[i * 5 + 3] || 1) * (0.85 + h * 0.3);
      dummy.position.set(trees[i * 5], trees[i * 5 + 1], trees[i * 5 + 2]);
      dummy.scale.set(s * (0.9 + frac(h * 7) * 0.2), s * (0.85 + frac(h * 13) * 0.3), s * (0.9 + frac(h * 3) * 0.2));
      dummy.rotation.set(0, h * Math.PI * 2, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(j, dummy.matrix);
      // Individual tint: health, dust and leaf age (multiplying a green crown by a warm
      // "flowering" colour only turns it brown, so no flowering tints).
      tint.setRGB(0.88 + frac(h * 31) * 0.22, 0.92 + frac(h * 17) * 0.18, 0.84 + frac(h * 23) * 0.2);
      inst.setColorAt(j, tint);
    };

    const near: THREE.Object3D[] = [];
    const castShadow = getDeviceProfile().quality === 'high';
    for (let b = 0; b < SPECIES_COUNT; b++) {
      const idx = buckets[b];
      if (idx.length === 0) continue;
      const inst = new THREE.InstancedMesh(this.treeGeometries[b], this.treeMaterial, idx.length);
      inst.name = 'trees';
      inst.castShadow = castShadow;
      for (let j = 0; j < idx.length; j++) place(inst, j, idx[j]);
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.visible = false;
      group.add(inst);
      near.push(inst);
    }
    const far = new THREE.InstancedMesh(this.treeGeometries[SPECIES.FAR], this.treeMaterial, kept.length);
    far.name = 'trees';
    for (let j = 0; j < kept.length; j++) place(far, j, kept[j]);
    far.instanceMatrix.needsUpdate = true;
    if (far.instanceColor) far.instanceColor.needsUpdate = true;
    far.computeBoundingSphere();
    group.add(far);
    return { near, far };
  }

  /**
   * Per tick: request/retire near-range building detail, and swap each tile's trees
   * between the species meshes and the far blob by 3D distance to the camera.
   */
  private updateDetailAndTrees(camera: THREE.PerspectiveCamera, altitude: number): void {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const detailOn = this.detailRadius > 0 && altitude < DETAIL_MAX_ALT;
    for (const [id, c] of this.loadedTiles) {
      const box = this.tileBoxes.get(id);
      if (!box) continue;
      const tx = (box.min.x + box.max.x) / 2, tz = (box.min.z + box.max.z) / 2;
      const d2 = Math.hypot(tx - cx, tz - cz);
      const d3 = Math.hypot(d2, cy);
      if (c.treesFar) {
        const parks = this.layerVisibility.parks;
        const nearOn = d3 < this.treeNearRadius;
        for (const m of c.treesNear ?? []) m.visible = parks && nearOn;
        c.treesFar.visible = parks && !nearOn;
      }
      if (detailOn && d2 < this.detailRadius && !c.detail && !c.detailPending) {
        const tile = this.manifestIndex.get(id);
        if (tile && (tile.bldgsLOD2 ?? 0) > 0) {
          c.detailPending = true;
          this.enqueue({ ...tile, id: `${id}#d` } as TileManifestItem, CONTENT_TIER, d2 * 0.5);
        }
      }
      if (c.detail) {
        c.detail.visible = detailOn && this.layerVisibility.buildings && d2 < this.detailRadius * 1.25;
        if (d2 > this.detailRadius * 1.6 || altitude > DETAIL_MAX_ALT * 1.5) {
          c.group.remove(c.detail);
          c.detail.geometry.dispose();
          c.detail = undefined;
        }
      }
    }
  }

  private cullLoadedTiles(): void {
    for (const container of this.loadedTiles.values()) {
      const g = container.group;
      if (g.children.length === 0) continue;
      let sphere = g.userData.boundingSphere as THREE.Sphere | undefined;
      if (!sphere) {
        const box = new THREE.Box3().setFromObject(g);
        sphere = box.getBoundingSphere(new THREE.Sphere());
        g.userData.boundingSphere = sphere;
      }
      g.visible = this.frustum.intersectsSphere(sphere);
    }
  }

  private retireTile(id: string, container: LoadedTileContainer): void {
    this.tileGroupParent.remove(container.group);
    disposeGroup(container.group);
    this.loadedTiles.delete(id);
    const ids = this.tileBuildingsMap.get(id);
    if (ids) {
      for (const bid of ids) this.loadedBuildings.delete(bid);
      this.tileBuildingsMap.delete(id);
    }
  }

  private retireAllStreamedTiles(): void {
    if (this.loadedTiles.size === 0 && this.queue.length === 0) return;
    for (const [id, c] of this.loadedTiles) this.retireTile(id, c);
    this.queue.length = 0;
    this.queued.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODES & ACCESSORS

  /**
   * Ground, parks and water are style-aware, not just day/night aware.
   *
   * They were not, and it showed: under Cyberpunk's cyan key the warm grey-green
   * daytime ground (0x8d9080) turned into a flat teal sheet covering the entire
   * frame. The surface colour has to move with the light, or a stylised profile
   * just tints one enormous polygon.
   */
  public setSkylineStyle(style: SkylineStyle): void {
    if (this.skylineStyle === style) return;
    this.skylineStyle = style;
    this.applyPalette();
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.materials.setNightMode(night);
    this.applyPalette();
  }

  private applyPalette(): void {
    const night = this.isNight;
    const cyber = this.skylineStyle === 'cyberpunk';

    for (const cat of Object.keys(this.roadMaterials) as RoadClass[]) {
      applyRoadPalette(this.roadMaterials[cat], cat, night);
    }
    roadUniforms.uRoadNight.value = night ? 1 : 0;
    this.overlay.setNightMode(night);
    this.ground.setNightMode(night, cyber);
    this.metro.setNightMode(night);
    this.traffic.setNightMode(night);
    this.landmarks.setNight(night);

    if (night) {
      this.parkMaterial.color.setHex(0x16241a);
      this.waterMaterial.color.setHex(0x14293d);
      this.lampHeadMat.emissiveIntensity = LAMP_EMISSIVE_NIGHT;
      this.setLampGlow(LAMP_GLOW_NIGHT, LAMP_POOL_NIGHT);
      this.treeMaterial.color.setHex(0x3a4640);
    } else if (cyber) {
      this.parkMaterial.color.setHex(0x1f3a3a);
      this.waterMaterial.color.setHex(0x16304a);
      this.lampHeadMat.emissiveIntensity = 0.0;
      this.setLampGlow(0, 0);
      this.treeMaterial.color.setHex(0x9fd0c8);
    } else {
      // Lawns close to the baked ground's park tone, not a saturated sheet of green.
      this.parkMaterial.color.setHex(0x637548);
      this.waterMaterial.color.setHex(0x4b5a50);
      this.lampHeadMat.emissiveIntensity = 0.0;
      this.setLampGlow(0, 0);
      this.treeMaterial.color.setHex(0xffffff);
    }
  }

  /**
   * Apply layer toggles. Called only when a toggle actually changes — the render
   * loop previously ran a full scene.traverse() for this on every frame.
   */
  public setLayerVisibility(v: { buildings: boolean; roads: boolean; parks: boolean; water: boolean }): void {
    this.layerVisibility = v;
    this.hlod.setVisible(v.buildings);
    this.landmarks.group.visible = v.buildings;
    this.metro.setVisible(v.roads);
    this.traffic.setVisible(v.roads);
    this.overlay.setLayerVisibility({ roads: v.roads, parks: v.parks, water: v.water });
    for (const container of this.loadedTiles.values()) {
      applyLayerVisibility(container.group, v);
    }
  }

  public getStats(): CityStreamingStats { return this.stats; }
  public setDebugMode(enabled: boolean): void { this.debugMode = enabled; }
  public setStableMode(enabled: boolean): void { this.stableMode = enabled; }
  public getManifest(): TileManifest | null { return this.manifest; }

  /**
   * True data extent. The HLOD manifest computes this from the real tile bounds;
   * the legacy fallback of +/-15,000 was wrong (actual data spans +/-20,000).
   */
  public getSpatialExtent(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const fromHlod = this.hlod.getSpatialExtent();
    if (fromHlod) return fromHlod;
    if (this.manifest?.spatialExtent) return this.manifest.spatialExtent;

    if (this.manifest?.tiles?.length) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const t of this.manifest.tiles) {
        if (t.bounds.minX < minX) minX = t.bounds.minX;
        if (t.bounds.maxX > maxX) maxX = t.bounds.maxX;
        if (t.bounds.minZ < minZ) minZ = t.bounds.minZ;
        if (t.bounds.maxZ > maxZ) maxZ = t.bounds.maxZ;
      }
      return { minX, maxX, minZ, maxZ };
    }
    return { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 };
  }

  public getHLODStats() { return this.hlod.getStats(); }

  public dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const [id, c] of this.loadedTiles) this.retireTile(id, c);
    this.hlod.dispose();
    this.landmarks.dispose();
    this.metro.dispose();
    this.traffic.dispose();
    this.overlay.dispose();
    for (const g of this.treeGeometries) g.dispose();
    this.treeMaterial.dispose();
    this.ground.dispose();
    this.lampMastGeo.dispose();
    this.lampHeadGeo.dispose();
    this.lampMastMat.dispose();
    this.lampHeadMat.dispose();
    this.lampGlowGeo.dispose();
    this.lampGlowMat.dispose();
    this.lampPoolGeo.dispose();
    this.lampPoolMat.dispose();
  }
}

// ───────────────────────────────────────────────────────────────────────────

function applyLayerVisibility(
  group: THREE.Group,
  v: { buildings: boolean; roads: boolean; parks: boolean; water: boolean },
): void {
  for (const child of group.children) {
    switch (child.name) {
      case 'buildings': child.visible = v.buildings; break;
      case 'buildingDetail': child.visible = v.buildings; break;
      case 'roads': child.visible = v.roads; break;
      case 'parks': child.visible = v.parks; break;
      case 'water': child.visible = v.water; break;
      case 'trees': break; // parks layer; the near/far swap in updateDetailAndTrees owns visibility
      case 'streetlights': child.visible = v.roads; break;
    }
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

/** Minimal position-only merge for the tree prototypes. */
function mergePositionOnly(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIndexed) total += g.getAttribute('position').array.length;

  const positions = new Float32Array(total);
  let off = 0;
  for (const g of nonIndexed) {
    const arr = g.getAttribute('position').array as ArrayLike<number>;
    positions.set(arr as unknown as Float32Array, off);
    off += arr.length;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}
