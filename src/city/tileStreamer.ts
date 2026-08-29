import * as THREE from 'three';
import {
  TileManifest, TileManifestItem, BuildingFootprint,
  CityStreamingStats, LODLevel,
} from '../types';
import { BuildingMaterialSystem } from './buildingMaterial';
import { HLODLayer } from './hlodLayer';
import { CityOverlay } from './cityOverlay';
import { ROAD_LAYER_Y, type RoadClass } from './ribbon';
import { SeededRNG } from './rng';
import type { TileWorkerRequest, TileWorkerResponse } from './tileWorker';

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
}

/** Altitude breakpoints, metres. */
const ALT_DISTRICT = 4000;
const ALT_NEIGHBOURHOOD = 1800;
const ALT_STREET = 600;

/** Streaming radius per LOD. Deliberately small — HLOD covers everything beyond. */
const STREAM_RADIUS: Record<number, number> = {
  0: 0,
  1: 0,
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

/** Night lighting hierarchy: bigger corridors are lit more consistently. */
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
  private readonly WORKER_COUNT = 4;
  private pending = new Map<string, { tile: TileManifestItem; lod: LODLevel }>();

  /**
   * Stable priority queue. The old implementation rebuilt and re-sorted the queue
   * from scratch every 200 ms, which continuously displaced in-flight work. This one
   * only inserts genuinely new requests and re-scores existing entries in place.
   */
  private queue: Array<{ id: string; tile: TileManifestItem; lod: LODLevel; score: number }> = [];
  private queued = new Set<string>();

  private currentLOD: LODLevel = 0;
  public stableMode = true;
  public debugMode = false;
  private isNight = true;

  private roadMaterials: Record<string, THREE.MeshStandardMaterial> = {};
  private parkMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private groundMaterial: THREE.MeshStandardMaterial;
  private treeGeometries: THREE.BufferGeometry[] = [];
  private treeMaterials: THREE.MeshStandardMaterial[] = [];

  private lampMastGeo!: THREE.BufferGeometry;
  private lampHeadGeo!: THREE.BufferGeometry;
  private lampMastMat!: THREE.MeshStandardMaterial;
  private lampHeadMat!: THREE.MeshStandardMaterial;

  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 120;

  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();
  private tileBoxes = new Map<string, THREE.Box3>();

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

    this.groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c1628, roughness: 1.0, metalness: 0.0,
    });

    for (const cat of Object.keys(ROAD_COLORS_DAY) as RoadClass[]) {
      this.roadMaterials[cat] = new THREE.MeshStandardMaterial({
        color: ROAD_COLORS_NIGHT[cat],
        emissive: ROAD_EMISSIVE_NIGHT[cat],
        roughness: cat === 'motorway' || cat === 'trunk' ? 0.62 : 0.86,
        metalness: 0.0,
      });
    }

    this.parkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f3e2f, roughness: 0.98, metalness: 0.0,
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d2438, roughness: 0.32, metalness: 0.08,
    });

    this.buildTreePrototypes();
    this.buildLampPrototype();
    this.initWorkers();

    this.hlod = new HLODLayer(scene, materials);
    this.overlay = new CityOverlay(scene);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP

  private buildTreePrototypes(): void {
    // Three silhouettes rather than four near-identical blobs. Low poly by design;
    // trees are instanced in the thousands.
    const mkTrunk = (h: number, r: number) => {
      const g = new THREE.CylinderGeometry(r * 0.7, r, h, 5);
      g.translate(0, h / 2, 0);
      return g;
    };

    // Neem / mango — broad rounded crown.
    const c1 = new THREE.IcosahedronGeometry(3.4, 1);
    c1.scale(1, 0.82, 1);
    c1.translate(0, 5.6, 0);

    // Ashoka / palm-ish — tall narrow.
    const c2 = new THREE.ConeGeometry(1.9, 8.5, 6);
    c2.translate(0, 6.0, 0);

    // Banyan / acacia — wide umbrella.
    const c3 = new THREE.SphereGeometry(4.2, 7, 5);
    c3.scale(1, 0.5, 1);
    c3.translate(0, 5.2, 0);

    this.treeGeometries = [
      mergePositionOnly([c1, mkTrunk(4.2, 0.34)]),
      mergePositionOnly([c2, mkTrunk(3.4, 0.26)]),
      mergePositionOnly([c3, mkTrunk(4.6, 0.42)]),
    ];

    this.treeMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1d3524, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x24402a, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x1a2e20, roughness: 0.95, flatShading: true }),
    ];
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
    // Sodium-vapour warm. Emissive only — no PointLight per lamp.
    this.lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0x2a2724,
      emissive: 0xffb457,
      emissiveIntensity: 1.6,
      roughness: 0.5,
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

  public async init(): Promise<void> {
    const [manifestResult, hlodManifest] = await Promise.all([
      fetch('/overture_tiles_full/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      this.hlod.init(),
      // The city-wide road network, Gomti and parks are built once and stay
      // resident — they are what makes Lucknow legible at every altitude.
      this.overlay.init(),
    ]);

    if (manifestResult) {
      this.manifest = manifestResult;
      for (const t of this.manifest!.tiles) {
        this.tileBoxes.set(t.id, new THREE.Box3(
          new THREE.Vector3(t.bounds.minX, -20, t.bounds.minZ),
          new THREE.Vector3(t.bounds.maxX, 320, t.bounds.maxZ),
        ));
      }
    }

    void hlodManifest;
    this.buildGround();
  }

  private buildGround(): void {
    this.groundGroup.clear();
    const extent = this.getSpatialExtent();
    const cx = (extent.minX + extent.maxX) / 2;
    const cz = (extent.minZ + extent.maxZ) / 2;

    // Single large disc so the horizon reads as a curve rather than a rectangle edge.
    const geo = new THREE.CircleGeometry(150000, 96);
    const ground = new THREE.Mesh(geo, this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.6, cz);
    ground.receiveShadow = false;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    this.groundGroup.add(ground);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE

  public update(camera: THREE.PerspectiveCamera): void {
    const now = performance.now();

    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) {
      this.cullLoadedTiles();
      return;
    }
    const dt = Math.max(1, now - this.lastUpdateTime);
    this.lastUpdateTime = now;

    this.camVelocity.subVectors(camera.position, this.lastCamPos).multiplyScalar(1000 / dt);
    this.lastCamPos.copy(camera.position);

    const altitude = camera.position.y;
    const { lod, scaleName } = this.resolveLOD(altitude);
    this.currentLOD = lod;

    // Detail ramp feeds the building shader: facade banding and AO strength fade in
    // as you descend, so nothing aliases at city scale.
    this.materials.setDetail(1 - THREE.MathUtils.clamp((altitude - 300) / 3000, 0, 1));

    const streamRadius = STREAM_RADIUS[lod] ?? 0;

    // Minor road classes drop out with altitude; major corridors never do.
    this.overlay.update(altitude);
    this.overlay.updateTime(now / 1000);

    // HLOD carries district and above; below that it fills in beyond the streamed
    // radius so the horizon stays continuous.
    this.hlod.update(camera, lod >= 1 || altitude < ALT_DISTRICT, streamRadius * 0.85);

    if (streamRadius > 0 && this.manifest) {
      this.updateStreamedTiles(camera, lod, streamRadius);
    } else {
      // Nothing streamed at city/district scale, so HLOD must draw everywhere.
      this.materials.setStreamedCoverage(camera.position.x, camera.position.z, 0);
      this.retireAllStreamedTiles();
    }

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
    const unloadRadius = radius * 1.5;

    // Look-ahead point: where the camera will be in ~1.5 s. Tiles near it score
    // better, so flying forward preloads forward instead of behind.
    const aheadX = camX + this.camVelocity.x * 1.5;
    const aheadZ = camZ + this.camVelocity.z * 1.5;

    // Distance to the nearest tile that is wanted but not yet on screen. Every
    // tile closer than this is loaded, so that disc — less one tile diagonal, so
    // a half-covered tile never counts — is genuinely covered at full detail and
    // the HLOD copy underneath it can be discarded.
    let nearestGap = Infinity;

    for (const tile of this.manifest!.tiles) {
      const dist = Math.hypot(tile.center.x - camX, tile.center.z - camZ);
      if (dist > radius) continue;
      if ((tile.bldgsLOD2 ?? 0) === 0 && (tile.roadsCount ?? 0) === 0) continue;

      const box = this.tileBoxes.get(tile.id);
      if (!box) continue;

      const inView = this.frustum.intersectsBox(box);
      const existing = this.loadedTiles.get(tile.id);
      if (existing && existing.lod === CONTENT_TIER) continue;
      if (dist < nearestGap) nearestGap = dist;
      if (this.pending.has(tile.id)) continue;

      const aheadDist = Math.hypot(tile.center.x - aheadX, tile.center.z - aheadZ);
      // Lower score = loaded sooner. In-frustum tiles win outright; everything else
      // is ordered by how soon the camera is heading towards it.
      const score = (inView ? 0 : 100000) + Math.min(dist, aheadDist);

      this.enqueue(tile, CONTENT_TIER, score);
    }

    // One 500 m tile's diagonal of slack, so the cull never eats into a tile that
    // is only partly present. Shrinks to 0 the instant a near tile is missing,
    // which brings the HLOD back rather than leaving a hole.
    const TILE_DIAG = 708;
    const covered = Number.isFinite(nearestGap) ? Math.max(0, nearestGap - TILE_DIAG) : radius;
    this.materials.setStreamedCoverage(camX, camZ, Math.min(covered, radius));

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

      const req: TileWorkerRequest = {
        id: next.id,
        url: `/overture_tiles_full/${next.tile.id}.json`,
        lod: next.lod,
        originX,
        originZ,
      };
      this.workers[i].postMessage(req);
    }
  }

  private onWorkerMessage(workerIndex: number, msg: TileWorkerResponse): void {
    this.workerBusy[workerIndex] = false;
    const req = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (!req) return;
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
      this.addTrees(group, msg.trees);
    }

    if (msg.streetlights && msg.streetlights.length > 0) {
      this.addStreetlights(group, msg.streetlights);
    }

    return group;
  }

  /**
   * Streetlights as two InstancedMeshes per tile — mast and lamp head. Thousands of
   * lamps therefore cost two draw calls, not thousands of objects, and none of them
   * is a real light: the head is emissive and the pooled illumination comes from the
   * building shader's night floor plus the road emissive hierarchy.
   */
  private addStreetlights(group: THREE.Group, lamps: Float32Array): void {
    const count = lamps.length / 3;
    if (count === 0) return;

    const mast = new THREE.InstancedMesh(this.lampMastGeo, this.lampMastMat, count);
    const head = new THREE.InstancedMesh(this.lampHeadGeo, this.lampHeadMat, count);
    mast.name = 'streetlights';
    head.name = 'streetlights';
    mast.castShadow = false;
    head.castShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(lamps[i * 3], 0, lamps[i * 3 + 1]);
      dummy.rotation.set(0, -lamps[i * 3 + 2], 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mast.setMatrixAt(i, dummy.matrix);
      head.setMatrixAt(i, dummy.matrix);
    }
    mast.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    group.add(mast);
    group.add(head);
  }

  private addTrees(group: THREE.Group, trees: Float32Array): void {
    const count = trees.length / 4;
    const buckets: number[][] = [[], [], []];
    for (let i = 0; i < count; i++) {
      const hash = SeededRNG.hashString(`${trees[i * 4].toFixed(1)},${trees[i * 4 + 2].toFixed(1)}`);
      buckets[hash % 3].push(i);
    }

    const dummy = new THREE.Object3D();
    for (let b = 0; b < 3; b++) {
      const idx = buckets[b];
      if (idx.length === 0) continue;
      const inst = new THREE.InstancedMesh(this.treeGeometries[b], this.treeMaterials[b], idx.length);
      inst.name = 'trees';
      inst.castShadow = false;
      inst.receiveShadow = false;
      for (let j = 0; j < idx.length; j++) {
        const i = idx[j];
        const hash = SeededRNG.hashString(`${trees[i * 4].toFixed(2)},${trees[i * 4 + 2].toFixed(2)}`);
        const s = (trees[i * 4 + 3] || 1) * (0.8 + ((hash % 100) / 100) * 0.55);
        dummy.position.set(trees[i * 4], trees[i * 4 + 1], trees[i * 4 + 2]);
        dummy.scale.set(s, s * (0.9 + ((hash >> 3) % 40) / 100), s);
        dummy.rotation.set(0, ((hash % 360) * Math.PI) / 180, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(j, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
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

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.materials.setNightMode(night);

    const roadColors = night ? ROAD_COLORS_NIGHT : ROAD_COLORS_DAY;
    for (const cat of Object.keys(this.roadMaterials) as RoadClass[]) {
      const mat = this.roadMaterials[cat];
      mat.color.setHex(roadColors[cat]);
      mat.emissive.setHex(night ? ROAD_EMISSIVE_NIGHT[cat] : 0x000000);
      mat.emissiveIntensity = night ? 1 : 0;
    }
    this.overlay.setNightMode(night);

    if (night) {
      this.groundMaterial.color.setHex(0x1e2430);
      this.parkMaterial.color.setHex(0x1a2a1e);
      this.waterMaterial.color.setHex(0x14293d);
      this.lampHeadMat.emissiveIntensity = 1.6;
      this.treeMaterials[0].color.setHex(0x101d15);
      this.treeMaterials[1].color.setHex(0x142218);
      this.treeMaterials[2].color.setHex(0x0e1a13);
    } else {
      // Warm neutral earth. The old pale mint-grey dominated every aerial frame and
      // pushed the whole image green.
      this.groundMaterial.color.setHex(0x8d9080);
      this.parkMaterial.color.setHex(0x6f8a5c);
      this.waterMaterial.color.setHex(0x5c7d86);
      // Lamps are off in daylight — the head reads as a dark fitting.
      this.lampHeadMat.emissiveIntensity = 0.0;
      this.treeMaterials[0].color.setHex(0x3f6136);
      this.treeMaterials[1].color.setHex(0x4a6b3d);
      this.treeMaterials[2].color.setHex(0x374f30);
    }
  }

  /**
   * Apply layer toggles. Called only when a toggle actually changes — the render
   * loop previously ran a full scene.traverse() for this on every frame.
   */
  public setLayerVisibility(v: { buildings: boolean; roads: boolean; parks: boolean; water: boolean }): void {
    this.layerVisibility = v;
    this.hlod.setVisible(v.buildings);
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
    this.overlay.dispose();
    for (const g of this.treeGeometries) g.dispose();
    this.lampMastGeo.dispose();
    this.lampHeadGeo.dispose();
    this.lampMastMat.dispose();
    this.lampHeadMat.dispose();
    for (const m of this.treeMaterials) m.dispose();
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
      case 'roads': child.visible = v.roads; break;
      case 'parks': child.visible = v.parks; break;
      case 'water': child.visible = v.water; break;
      case 'trees': child.visible = v.parks; break; // trees ride with the parks layer
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
