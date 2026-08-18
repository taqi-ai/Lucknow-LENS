import * as THREE from 'three';
import { TileManifest, TileManifestItem, TileJSONData, OverviewData, BuildingFootprint, RoadSegmentOSM, WaterwayOSM, GreenAreaOSM, CityStreamingStats, LODLevel } from '../types';
import { BuildingVisuals } from './buildingVisuals';
import { SeededRNG } from './rng';

export enum TileState {
  UNLOADED = 'UNLOADED',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  VISIBLE = 'VISIBLE',
  PENDING_UNLOAD = 'PENDING_UNLOAD',
}

interface LoadedTileContainer {
  id: string;
  group: THREE.Group;
  debugHelper?: THREE.LineSegments;
  lod: LODLevel;
  state: TileState;
  stats: { buildings: number; roads: number; trees: number };
}

export class TileStreamer {
  private scene: THREE.Scene;
  private manifest: TileManifest | null = null;
  private overviewData: OverviewData | null = null;

  // Render Groups
  private overviewGroup = new THREE.Group();
  private tileGroupParent = new THREE.Group();
  private debugGroup = new THREE.Group();

  private loadedTiles = new Map<string, LoadedTileContainer>();
  private tileStateMap = new Map<string, TileState>();
  public loadedBuildings = new Map<string, BuildingFootprint>();
  private tileBuildingsMap = new Map<string, string[]>();
  private loadQueue: Array<{ tile: TileManifestItem; lod: LODLevel; dist: number }> = [];
  private activeFetches = new Set<string>();

  private MAX_CONCURRENT_LOADS = 2; // Reduced from 4 — fewer concurrent geometry builds = smoother frames
  public stableMode = true; // STABLE CITY MODE ON BY DEFAULT (Spec Requirement)
  public debugMode = false;

  // Hysteresis Thresholds for LOD & Distance Streaming
  private currentLOD: LODLevel = 0;
  
  // Visuals & Materials
  private buildingVisuals: BuildingVisuals;
  private roadMaterials: Record<string, THREE.MeshLambertMaterial | THREE.MeshBasicMaterial>;
  private parkMaterials: THREE.MeshBasicMaterial[];
  private waterMaterial: THREE.MeshStandardMaterial;
  private treeMeshTemplates: THREE.Mesh[] = [];

  private stats: CityStreamingStats = {
    loadedTiles: 0,
    visibleTiles: 0,
    totalBuildings: 0,
    totalRoads: 0,
    totalTrees: 0,
    currentLOD: 0,
    zoomScaleName: 'FULL CITY',
    stableMode: true,
    pendingLoads: 0,
  };

  private isNight = true;
  private groundMaterial: THREE.MeshLambertMaterial;

  // Throttle state — update tile logic max 5Hz to avoid starving render loop
  private lastUpdateTime = 0;
  private readonly UPDATE_INTERVAL = 200; // ms

  // Frustum culling
  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();
  private tileBoxes = new Map<string, THREE.Box3>();

  // Tile cache — keep dormant tiles to avoid refetch on pan-back
  private tileCache = new Map<string, LoadedTileContainer>();
  private readonly MAX_CACHE_SIZE = 50;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.overviewGroup);
    this.scene.add(this.tileGroupParent);
    this.scene.add(this.debugGroup);

    this.groundMaterial = new THREE.MeshLambertMaterial({
      color: 0x1e293b,
    });

    this.buildingVisuals = new BuildingVisuals();

    this.roadMaterials = {
      motorway: new THREE.MeshLambertMaterial({ color: 0x475569 }),
      arterial: new THREE.MeshLambertMaterial({ color: 0x94a3b8 }),
      normal: new THREE.MeshLambertMaterial({ color: 0xcbd5e1 }),
      pedestrian: new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
    };

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85,
    });

    this.parkMaterials = [
      new THREE.MeshBasicMaterial({ color: 0x5c7a5c, transparent: true, opacity: 0.6 }), // Muted natural green
      new THREE.MeshBasicMaterial({ color: 0x6b8a64, transparent: true, opacity: 0.6 }), // Lighter muted
      new THREE.MeshBasicMaterial({ color: 0x4d664d, transparent: true, opacity: 0.6 })  // Darker muted
    ];

    // 4 Distinct Tree Prototypes
    // 1. Dark Green Cone (Cypress/Pine)
    const coneGeo = new THREE.ConeGeometry(2.5, 7, 5);
    coneGeo.translate(0, 3.5, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x14532d });

    // 2. Medium Green Sphere (Mango/Neem)
    const sphereGeo = new THREE.SphereGeometry(3.5, 6, 6);
    sphereGeo.translate(0, 4, 0);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x15803d });

    // 3. Light Green Dodecahedron (Smaller avenue trees)
    const dodecGeo = new THREE.DodecahedronGeometry(2.8, 0);
    dodecGeo.translate(0, 3.5, 0);
    const dodecMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });

    // 4. Olive Green Cylinder/Umbrella (Banyan/Acacia)
    const cylGeo = new THREE.CylinderGeometry(4, 3, 5, 6);
    cylGeo.translate(0, 4.5, 0);
    const cylMat = new THREE.MeshBasicMaterial({ color: 0x4d7c0f });

    this.treeMeshTemplates = [
      new THREE.Mesh(coneGeo, coneMat),
      new THREE.Mesh(sphereGeo, sphereMat),
      new THREE.Mesh(dodecGeo, dodecMat),
      new THREE.Mesh(cylGeo, cylMat)
    ];
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;

    this.buildingVisuals.setNightMode(night);

    if (night) {
      this.groundMaterial.color.setHex(0x0c1628); // matches atmosphericSky night horizon
      this.roadMaterials.motorway.color.setHex(0x18181b);
      this.roadMaterials.arterial.color.setHex(0x27272a);
      this.roadMaterials.normal.color.setHex(0x3f3f46);
      this.roadMaterials.pedestrian.color.setHex(0x52525b);
      this.waterMaterial.color.setHex(0x0ea5e9);
      this.parkMaterials[0].color.setHex(0x2f3e2f);
      this.parkMaterials[1].color.setHex(0x384734);
      this.parkMaterials[2].color.setHex(0x273627);
      (this.treeMeshTemplates[0].material as THREE.MeshBasicMaterial).color.setHex(0x064e3b);
      (this.treeMeshTemplates[1].material as THREE.MeshBasicMaterial).color.setHex(0x065f46);
      (this.treeMeshTemplates[2].material as THREE.MeshBasicMaterial).color.setHex(0x059669);
      (this.treeMeshTemplates[3].material as THREE.MeshBasicMaterial).color.setHex(0x166534);
    } else {
      this.groundMaterial.color.setHex(0xc8dae8); // matches atmosphericSky day horizon
      this.roadMaterials.motorway.color.setHex(0x3f3f46);
      this.roadMaterials.arterial.color.setHex(0x52525b);
      this.roadMaterials.normal.color.setHex(0x9ca3af);
      this.roadMaterials.pedestrian.color.setHex(0xd1d5db);
      this.waterMaterial.color.setHex(0x0ea5e9);
      this.parkMaterials[0].color.setHex(0x5c7a5c);
      this.parkMaterials[1].color.setHex(0x6b8a64);
      this.parkMaterials[2].color.setHex(0x4d664d);
      (this.treeMeshTemplates[0].material as THREE.MeshBasicMaterial).color.setHex(0x14532d);
      (this.treeMeshTemplates[1].material as THREE.MeshBasicMaterial).color.setHex(0x15803d);
      (this.treeMeshTemplates[2].material as THREE.MeshBasicMaterial).color.setHex(0x4ade80);
      (this.treeMeshTemplates[3].material as THREE.MeshBasicMaterial).color.setHex(0x4d7c0f);
    }
  }

  public async init(): Promise<void> {
    try {
      const respManifest = await fetch('/overture_tiles_full/manifest.json');
      if (!respManifest.ok) throw new Error(`Manifest fetch failed: ${respManifest.statusText}`);
      this.manifest = await respManifest.json();

      // Precompute tile bounding boxes
      this.manifest!.tiles.forEach(t => {
        this.tileBoxes.set(t.id, new THREE.Box3(
          new THREE.Vector3(t.bounds.minX, -20, t.bounds.minZ),
          new THREE.Vector3(t.bounds.maxX, 200, t.bounds.maxZ)
        ));
      });

      const respOverview = await fetch('/overture_tiles_full/overview.json');
      if (respOverview.ok) {
        this.overviewData = await respOverview.json();
        this.buildGlobalOverview();
      }
    } catch (e) {
      console.warn('Failed to load tile streamer manifests:', e);
    }
  }

  private buildGlobalOverview(): void {
    if (!this.overviewData || !this.manifest) return;

    this.overviewGroup.clear();

    const extent = this.manifest.spatialExtent || { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 };
    const width = Math.abs(extent.maxX - extent.minX) + 10000;
    const depth = Math.abs(extent.maxZ - extent.minZ) + 10000;
    const centerX = (extent.minX + extent.maxX) / 2;
    const centerZ = (extent.minZ + extent.maxZ) / 2;

    // Use a massive circular ground plane (150km radius) matching the max camera far plane.
    // A circle ensures that even if the geometry is somehow clipped or rendered near the edge,
    // it forms a natural curved horizon instead of a straight diagonal rectangular edge.
    const groundRadius = 150000;
    const groundGeo = new THREE.CircleGeometry(groundRadius, 64);
    const ground = new THREE.Mesh(groundGeo, this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, -0.5, centerZ);
    ground.receiveShadow = false;
    this.overviewGroup.add(ground);

    this.buildRoadsMesh(this.overviewGroup, this.overviewData.majorRoads);
    this.buildWaterwaysMesh(this.overviewGroup, this.overviewData.waterways);
    this.buildParksMesh(this.overviewGroup, this.overviewData.greenAreas);

  }

  public update(camera: THREE.PerspectiveCamera): void {
    if (!this.manifest) return;

    // Throttle tile logic to max 5Hz — camera/render loop runs at 60fps independently
    const now = performance.now();
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) {
      // Still do frustum culling every frame (cheap)
      this.updateFrustumCulling(camera);
      return;
    }
    this.lastUpdateTime = now;

    // Build Frustum
    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    const altitude = camera.position.y;
    const camX = camera.position.x;
    const camZ = camera.position.z;

    // Hysteresis LOD State Machine
    let targetLOD: LODLevel = this.currentLOD;
    let zoomScaleName: 'FULL CITY' | 'DISTRICT' | 'NEIGHBORHOOD' | 'STREET' = 'FULL CITY';

    if (this.stableMode) {
      targetLOD = altitude > 4000 ? 0 : altitude > 1800 ? 1 : altitude > 600 ? 2 : 3;
      zoomScaleName = altitude > 4000 ? 'FULL CITY' : altitude > 1800 ? 'DISTRICT' : altitude > 600 ? 'NEIGHBORHOOD' : 'STREET';
    } else {
      if (this.currentLOD === 0) {
        if (altitude < 4500) targetLOD = 1;
      } else if (this.currentLOD === 1) {
        if (altitude > 5200) targetLOD = 0;
        else if (altitude < 2000) targetLOD = 2;
      } else if (this.currentLOD === 2) {
        if (altitude > 2400) targetLOD = 1;
        else if (altitude < 700) targetLOD = 3;
      } else if (this.currentLOD === 3) {
        if (altitude > 850) targetLOD = 2;
      }

      if (targetLOD === 0) zoomScaleName = 'FULL CITY';
      else if (targetLOD === 1) zoomScaleName = 'DISTRICT';
      else if (targetLOD === 2) zoomScaleName = 'NEIGHBORHOOD';
      else zoomScaleName = 'STREET';
    }

    this.currentLOD = targetLOD;

    // Dynamic load radius — extends as camera zooms out for Google Earth-style wide view
    const viewScale = Math.max(1, altitude / 1200);
    const baseRadius = targetLOD === 0 ? 12000 : targetLOD === 1 ? 8000 : targetLOD === 2 ? 6000 : 4000;
    const loadRadius = Math.min(baseRadius * viewScale, 25000);
    // Increase hysteresis slightly for smoother transitions
    const unloadRadius = loadRadius + 4000;

    // 1. Calculate desired tiles for loading
    const newQueue: Array<{ tile: TileManifestItem; lod: LODLevel; dist: number }> = [];
    const visibleTilesThisFrame = new Set<string>();

    for (const tile of this.manifest.tiles) {
      const tileBox = this.tileBoxes.get(tile.id);
      if (!tileBox) continue;

      const dist = Math.hypot(tile.center.x - camX, tile.center.z - camZ);

      // Fast distance reject
      if (dist > unloadRadius) continue;

      // Frustum check
      if (this.frustum.intersectsBox(tileBox)) {
        visibleTilesThisFrame.add(tile.id);

        if (dist <= loadRadius) {
          const loaded = this.loadedTiles.get(tile.id);
          const fetchKey = `${tile.id}_${targetLOD}`;

          if ((!loaded || loaded.lod !== targetLOD) && !this.activeFetches.has(fetchKey)) {
            // Check tile cache first before queuing fetch
            const cached = this.tileCache.get(fetchKey);
            if (cached) {
              // Restore from cache instead of refetching
              this.tileGroupParent.add(cached.group);
              if (cached.debugHelper) this.debugGroup.add(cached.debugHelper);
              cached.state = TileState.VISIBLE;
              this.loadedTiles.set(tile.id, cached);
              this.tileCache.delete(fetchKey);
            } else {
              newQueue.push({ tile, lod: targetLOD, dist });
            }
          }
        }
      }
    }

    // Sort loading queue by distance (camera center first)
    newQueue.sort((a, b) => a.dist - b.dist);
    this.loadQueue = newQueue;

    // Process Prioritized Asynchronous Queue
    while (this.activeFetches.size < this.MAX_CONCURRENT_LOADS && this.loadQueue.length > 0) {
      const nextItem = this.loadQueue.shift();
      if (nextItem) {
        this.fetchAndBuildTile(nextItem.tile, nextItem.lod);
      }
    }

    // 2. Unload distant tiles — move to cache instead of destroying
    let totalBldgs = 0;
    let totalRds = 0;
    let totalTrs = 0;

    for (const [tileId, container] of this.loadedTiles.entries()) {
      const tileMeta = this.manifest.tiles.find(t => t.id === tileId);
      if (!tileMeta) continue;

      const dist = Math.hypot(tileMeta.center.x - camX, tileMeta.center.z - camZ);
      const isVisible = visibleTilesThisFrame.has(tileId);

      if (dist > unloadRadius || (!isVisible && dist > loadRadius * 0.5)) {
        // Move to cache instead of destroying
        this.tileGroupParent.remove(container.group);
        if (container.debugHelper) this.debugGroup.remove(container.debugHelper);
        container.state = TileState.PENDING_UNLOAD;

        const cacheKey = `${tileId}_${container.lod}`;
        this.tileCache.set(cacheKey, container);
        this.loadedTiles.delete(tileId);
        this.tileStateMap.set(tileId, TileState.UNLOADED);

        const bldgIds = this.tileBuildingsMap.get(tileId);
        if (bldgIds) {
          bldgIds.forEach(id => this.loadedBuildings.delete(id));
          this.tileBuildingsMap.delete(tileId);
        }

        // Evict oldest cache entries if over limit
        if (this.tileCache.size > this.MAX_CACHE_SIZE) {
          const firstKey = this.tileCache.keys().next().value;
          if (firstKey) {
            const evicted = this.tileCache.get(firstKey);
            if (evicted) this.disposeGroup(evicted.group);
            this.tileCache.delete(firstKey);
          }
        }
      } else {
        totalBldgs += container.stats.buildings;
        totalRds += container.stats.roads;
        totalTrs += container.stats.trees;
      }
    }

    this.debugGroup.visible = this.debugMode;

    // Frustum cull after tile updates
    this.updateFrustumCulling(camera);

    this.stats = {
      loadedTiles: this.loadedTiles.size,
      visibleTiles: this.loadedTiles.size,
      totalBuildings: totalBldgs,
      totalRoads: totalRds,
      totalTrees: totalTrs,
      currentLOD: targetLOD,
      zoomScaleName,
      stableMode: this.stableMode,
      pendingLoads: this.activeFetches.size + this.loadQueue.length,
    };
  }

  /** Frustum culling — hide tiles behind the camera to save 40-60% draw calls */
  private updateFrustumCulling(camera: THREE.PerspectiveCamera): void {
    if (!camera.matrixWorldInverse) {
      console.error("Camera missing matrixWorldInverse:", camera);
      return;
    }
    // Build frustum from current camera
    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    for (const [, container] of this.loadedTiles) {
      if (container.group.children.length === 0) continue;
      // Use bounding sphere check — fast and sufficient for tile-sized groups
      if (!container.group.userData.boundingSphere) {
        const box = new THREE.Box3().setFromObject(container.group);
        container.group.userData.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      }
      const sphere = container.group.userData.boundingSphere as THREE.Sphere;
      container.group.visible = this.frustum.intersectsSphere(sphere);
    }
  }

  private async fetchAndBuildTile(tileMeta: TileManifestItem, lod: LODLevel): Promise<void> {
    const fetchKey = `${tileMeta.id}_${lod}`;
    this.activeFetches.add(fetchKey);
    this.tileStateMap.set(tileMeta.id, TileState.LOADING);

    try {
      const resp = await fetch(`/overture_tiles_full/${tileMeta.id}.json`);
      if (!resp.ok) return;
      const data: TileJSONData = await resp.json();

      const tileGroup = new THREE.Group();
      tileGroup.name = tileMeta.id;

      let bldgCount = 0;
      let roadCount = 0;
      let treeCount = 0;

      const bldgList = lod <= 1 ? (data.lod1?.buildings || []) : (lod >= 2 ? data.lod2.buildings : []);
      const roadList = lod <= 1 ? (data.lod1?.roads || []) : (lod >= 2 ? data.lod2.roads : []);
      const waterList = data.lod2.waterways || data.lod1?.waterways || [];
      const parkList = data.lod2.greenAreas || data.lod1?.greenAreas || [];
      const treeList = data.lod2.trees || [];

      bldgCount = this.buildBuildingsMesh(tileGroup, bldgList, lod);
      roadCount = this.buildRoadsMesh(tileGroup, roadList);
      this.buildWaterwaysMesh(tileGroup, waterList);
      this.buildParksMesh(tileGroup, parkList);
      treeCount = this.buildInstancedTrees(tileGroup, treeList);

      const bldgIds: string[] = [];
      bldgList.forEach(b => {
        this.loadedBuildings.set(b.id, b);
        bldgIds.push(b.id);
      });
      this.tileBuildingsMap.set(tileMeta.id, bldgIds);


      const debugHelper = this.createTileDebugOutline(tileMeta);
      this.debugGroup.add(debugHelper);

      // NEVER DESTROY OLD TILE UNTIL NEW TILE IS READY (Zero Tearing)
      const oldContainer = this.loadedTiles.get(tileMeta.id);
      if (oldContainer) {
        this.tileGroupParent.remove(oldContainer.group);
        if (oldContainer.debugHelper) this.debugGroup.remove(oldContainer.debugHelper);
        this.disposeGroup(oldContainer.group);
      }

      this.tileGroupParent.add(tileGroup);

      this.loadedTiles.set(tileMeta.id, {
        id: tileMeta.id,
        group: tileGroup,
        debugHelper,
        lod,
        state: TileState.VISIBLE,
        stats: { buildings: bldgCount, roads: roadCount, trees: treeCount },
      });


      this.tileStateMap.set(tileMeta.id, TileState.VISIBLE);

    } catch (err) {
      console.error(`Failed to load tile ${tileMeta.id}:`, err);
    } finally {
      this.activeFetches.delete(fetchKey);
    }
  }

  private buildBuildingsMesh(parent: THREE.Group, buildings: BuildingFootprint[], lod: LODLevel): number {
    if (!buildings || buildings.length === 0) return 0;

    const wallGeos: THREE.BufferGeometry[][] = [[], [], [], [], []];
    const roofGeos: THREE.BufferGeometry[][] = [[], [], [], [], []];

    for (const bldg of buildings) {
      if (!bldg.points || bldg.points.length < 3) continue;

      const matIndex = this.buildingVisuals.getMaterialIndexForId(bldg.id);
      const bldgHeight = bldg.height || 10;

      const shape = new THREE.Shape();
      shape.moveTo(bldg.points[0].x, -bldg.points[0].z);
      for (let i = 1; i < bldg.points.length; i++) {
        shape.lineTo(bldg.points[i].x, -bldg.points[i].z);
      }
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, { depth: bldgHeight, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      wallGeos[matIndex].push(geo);

      // LOD 3 (Street level): Add roof caps for buildings to give visual definition
      if (lod === 3) {
        let roofDepth = 0.3; // Mid-rise default
        if (bldgHeight < 8) {
          roofDepth = 0.1; // Low-rise: very subtle parapet
        } else if (bldgHeight >= 15) {
          roofDepth = 0.6; // High-rise: prominent roof structure
        }

        const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: roofDepth, bevelEnabled: false });
        roofGeo.rotateX(-Math.PI / 2);
        roofGeo.translate(0, bldgHeight, 0);
        
        // Use a slightly different material index to add visual variation for high rises if desired,
        // or keep consistent. We will keep consistent to ensure matched palettes.
        roofGeos[matIndex].push(roofGeo);
      }
    }

    for (let i = 0; i < 5; i++) {
      if (wallGeos[i].length > 0) {
        const mergedWall = this.mergeGeometries(wallGeos[i]);
        if (mergedWall) {
          const mesh = new THREE.Mesh(mergedWall, this.buildingVisuals.wallMaterials[i]);
          mesh.name = 'buildings';
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          parent.add(mesh);
        }
      }
      
      if (roofGeos[i].length > 0) {
        const mergedRoof = this.mergeGeometries(roofGeos[i]);
        if (mergedRoof) {
          const mesh = new THREE.Mesh(mergedRoof, this.buildingVisuals.roofMaterials[i]);
          mesh.name = 'buildings';
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          parent.add(mesh);
        }
      }
    }

    return buildings.length;
  }

  private buildRoadsMesh(parent: THREE.Group, roads: RoadSegmentOSM[]): number {
    if (!roads || roads.length === 0) return 0;

    const geos: Record<string, THREE.BufferGeometry[]> = {
      motorway: [],
      arterial: [],
      normal: [],
      pedestrian: []
    };

    for (const road of roads) {
      if (!road.points || road.points.length < 2) continue;

      let category = 'normal';
      if (road.type === 'motorway' || road.type === 'trunk') category = 'motorway';
      else if (road.type === 'primary' || road.type === 'secondary') category = 'arterial';
      else if (road.type === 'footway' || road.type === 'path' || road.type === 'pedestrian') category = 'pedestrian';

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i];
        const p2 = road.points[i + 1];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.1) continue;

        const angle = Math.atan2(dz, dx);
        const w = road.width || (category === 'motorway' ? 12 : category === 'arterial' ? 8 : category === 'pedestrian' ? 2 : 6);

        const planeGeo = new THREE.PlaneGeometry(len, w);
        planeGeo.rotateX(-Math.PI / 2);
        planeGeo.rotateY(-angle);
        const yOff = category === 'motorway' ? 0.13 : category === 'arterial' ? 0.12 : category === 'normal' ? 0.11 : 0.14;
        planeGeo.translate((p1.x + p2.x) / 2, yOff, (p1.z + p2.z) / 2);

        geos[category].push(planeGeo);
      }
    }

    for (const cat of Object.keys(geos)) {
      if (geos[cat].length > 0) {
        const mergedGeo = this.mergeGeometries(geos[cat]);
        if (mergedGeo) {
          const mesh = new THREE.Mesh(mergedGeo, this.roadMaterials[cat]);
          mesh.name = 'roads';
          mesh.receiveShadow = true;
          parent.add(mesh);
        }
      }
    }

    return roads.length;
  }

  private buildWaterwaysMesh(parent: THREE.Group, waterways: WaterwayOSM[]): void {
    if (!waterways || waterways.length === 0) return;

    for (const w of waterways) {
      if (!w.points || w.points.length < 2) continue;

      if (w.isPolygon && w.points.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(w.points[0].x, -w.points[0].z);
        for (let i = 1; i < w.points.length; i++) {
          shape.lineTo(w.points[i].x, -w.points[i].z);
        }
        shape.closePath();

        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, this.waterMaterial);
        mesh.name = 'water';
        mesh.position.y = -0.2;
        parent.add(mesh);
      } else {
        for (let i = 0; i < w.points.length - 1; i++) {
          const p1 = w.points[i];
          const p2 = w.points[i + 1];
          const dx = p2.x - p1.x;
          const dz = p2.z - p1.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.1) continue;

          const angle = Math.atan2(dz, dx);
          const width = w.width || 35;

          const geo = new THREE.PlaneGeometry(len, width);
          geo.rotateX(-Math.PI / 2);
          geo.rotateY(-angle);
          geo.translate((p1.x + p2.x) / 2, -0.1, (p1.z + p2.z) / 2);

          const mesh = new THREE.Mesh(geo, this.waterMaterial);
          mesh.name = 'water';
          parent.add(mesh);
        }
      }
    }
  }

  private buildParksMesh(parent: THREE.Group, greenAreas: GreenAreaOSM[]): void {
    if (!greenAreas || greenAreas.length === 0) return;

    const geos: THREE.BufferGeometry[][] = [[], [], []];

    for (const park of greenAreas) {
      if (!park.points || park.points.length < 3) continue;

      const hash = SeededRNG.hashString(park.id || '');
      const matIndex = hash % 3;

      const shape = new THREE.Shape();
      shape.moveTo(park.points[0].x, -park.points[0].z);
      for (let i = 1; i < park.points.length; i++) {
        shape.lineTo(park.points[i].x, -park.points[i].z);
      }
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.05, 0);
      geos[matIndex].push(geo);
    }

    for (let i = 0; i < 3; i++) {
      if (geos[i].length > 0) {
        const merged = this.mergeGeometries(geos[i]);
        if (merged) {
          const mesh = new THREE.Mesh(merged, this.parkMaterials[i]);
          mesh.name = 'parks';
          parent.add(mesh);
        }
      }
    }
  }

  private buildInstancedTrees(parent: THREE.Group, trees: Array<{ x: number; y: number; z: number; scale: number }>): number {
    if (!trees || trees.length === 0) return 0;

    const count = trees.length;
    const buckets: number[][] = [[], [], [], []];

    for (let i = 0; i < count; i++) {
      const t = trees[i];
      const hash = SeededRNG.hashString(`${t.x.toFixed(2)},${t.z.toFixed(2)}`);
      const bucketIdx = hash % 4;
      buckets[bucketIdx].push(i);
    }

    const dummy = new THREE.Object3D();

    for (let b = 0; b < 4; b++) {
      const indices = buckets[b];
      if (indices.length === 0) continue;

      const template = this.treeMeshTemplates[b];
      const instancedMesh = new THREE.InstancedMesh(template.geometry, template.material, indices.length);
      instancedMesh.name = 'trees';

      for (let j = 0; j < indices.length; j++) {
        const t = trees[indices[j]];
        const hash = SeededRNG.hashString(`${t.x.toFixed(2)},${t.z.toFixed(2)}`);
        
        dummy.position.set(t.x, t.y, t.z);
        
        const scaleMod = 0.8 + ((hash % 100) / 100) * 0.6; // 0.8 to 1.4
        const finalScale = (t.scale || 1) * scaleMod;
        
        dummy.scale.set(finalScale, finalScale, finalScale);
        dummy.rotation.set(0, ((hash % 360) * Math.PI) / 180, 0);
        
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(j, dummy.matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      parent.add(instancedMesh);
    }

    return count;
  }

  private createTileDebugOutline(tile: TileManifestItem): THREE.LineSegments {
    const { minX, maxX, minZ, maxZ } = tile.bounds;
    const points = [
      new THREE.Vector3(minX, 2, minZ), new THREE.Vector3(maxX, 2, minZ),
      new THREE.Vector3(maxX, 2, minZ), new THREE.Vector3(maxX, 2, maxZ),
      new THREE.Vector3(maxX, 2, maxZ), new THREE.Vector3(minX, 2, maxZ),
      new THREE.Vector3(minX, 2, maxZ), new THREE.Vector3(minX, 2, minZ),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
    return new THREE.LineSegments(geo, mat);
  }

  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (geometries.length === 0) return null;

    let totalPositions = 0;
    let totalIndex = 0;

    for (const g of geometries) {
      const pos = g.getAttribute('position');
      if (pos) totalPositions += pos.array.length;
      if (g.index) totalIndex += g.index.array.length;
    }

    const mergedPositions = new Float32Array(totalPositions);
    const mergedIndices = totalIndex > 0 ? new Uint32Array(totalIndex) : null;

    let posOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (const g of geometries) {
      const pos = g.getAttribute('position');
      if (pos) {
        mergedPositions.set(pos.array, posOffset);
        posOffset += pos.array.length;
      }

      if (g.index && mergedIndices) {
        for (let i = 0; i < g.index.array.length; i++) {
          mergedIndices[indexOffset + i] = g.index.array[i] + vertexOffset;
        }
        indexOffset += g.index.array.length;
      }

      if (pos) vertexOffset += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    if (mergedIndices) merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    merged.computeVertexNormals();

    return merged;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
      }
    });
  }

  public getStats(): CityStreamingStats {
    return this.stats;
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  public setStableMode(enabled: boolean): void {
    this.stableMode = enabled;
  }

  public getManifest(): TileManifest | null {
    return this.manifest;
  }

  public getSpatialExtent(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    if (this.manifest?.spatialExtent) {
      return this.manifest.spatialExtent;
    }
    return { minX: -15000, maxX: 15000, minZ: -15000, maxZ: 15000 };
  }
}
