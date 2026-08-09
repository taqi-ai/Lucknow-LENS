import * as THREE from 'three';
import { TileManifest, TileManifestItem, TileJSONData, OverviewData, BuildingFootprint, RoadSegmentOSM, WaterwayOSM, GreenAreaOSM, CityStreamingStats, LODLevel } from '../types';

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
  private loadQueue: Array<{ tile: TileManifestItem; lod: LODLevel; dist: number }> = [];
  private activeFetches = new Set<string>();

  private MAX_CONCURRENT_LOADS = 4;
  public stableMode = true; // STABLE CITY MODE ON BY DEFAULT (Spec Requirement)
  public debugMode = false;

  // Hysteresis Thresholds for LOD & Distance Streaming
  private currentLOD: LODLevel = 0;
  
  // Shared Materials
  private buildingMaterialHigh: THREE.MeshStandardMaterial;
  private buildingMaterialMid: THREE.MeshStandardMaterial;
  private roadMaterialMajor: THREE.MeshStandardMaterial;
  private roadMaterialMinor: THREE.MeshBasicMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private parkMaterial: THREE.MeshBasicMaterial;
  private treeMeshTemplate: THREE.Mesh;

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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.overviewGroup);
    this.scene.add(this.tileGroupParent);
    this.scene.add(this.debugGroup);

    this.buildingMaterialHigh = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.5,
      metalness: 0.1,
      flatShading: true,
    });
    this.buildingMaterialMid = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.7,
      flatShading: true,
    });

    this.roadMaterialMajor = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
    });
    this.roadMaterialMinor = new THREE.MeshBasicMaterial({
      color: 0x334155,
    });

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85,
    });

    this.parkMaterial = new THREE.MeshBasicMaterial({
      color: 0x16a34a,
      transparent: true,
      opacity: 0.45,
    });

    const foliageGeo = new THREE.ConeGeometry(2.2, 5.5, 5);
    foliageGeo.translate(0, 3, 0);
    const foliageMat = new THREE.MeshBasicMaterial({ color: 0x15803d });
    this.treeMeshTemplate = new THREE.Mesh(foliageGeo, foliageMat);
  }

  public async init(): Promise<void> {
    try {
      const respManifest = await fetch('/lucknow_tiles/manifest.json');
      if (respManifest.ok) {
        this.manifest = await respManifest.json();
      }

      const respOverview = await fetch('/lucknow_tiles/overview.json');
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

    const groundGeo = new THREE.PlaneGeometry(width, depth);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(centerX, -0.5, centerZ);
    ground.receiveShadow = true;
    this.overviewGroup.add(ground);

    this.buildRoadsMesh(this.overviewGroup, this.overviewData.majorRoads, this.roadMaterialMajor);
    this.buildWaterwaysMesh(this.overviewGroup, this.overviewData.waterways);
    this.buildParksMesh(this.overviewGroup, this.overviewData.greenAreas);
  }

  public update(cameraPosition: THREE.Vector3): void {
    if (!this.manifest) return;

    const altitude = cameraPosition.y;
    const camX = cameraPosition.x;
    const camZ = cameraPosition.z;

    // Hysteresis LOD State Machine
    let targetLOD: LODLevel = this.currentLOD;
    let zoomScaleName: 'FULL CITY' | 'DISTRICT' | 'NEIGHBORHOOD' | 'STREET' = 'FULL CITY';

    if (this.stableMode) {
      // STABLE CITY MODE: Always use ONE consistent representation (LOD 2 Neighborhood scale)
      targetLOD = 2;
      zoomScaleName = altitude > 4000 ? 'FULL CITY' : altitude > 1800 ? 'DISTRICT' : altitude > 600 ? 'NEIGHBORHOOD' : 'STREET';
    } else {
      // DYNAMIC LOD WITH HYSTERESIS TRANSITIONS
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

    // Hysteresis Streaming Radii
    const loadRadius = targetLOD === 0 ? 6000 : targetLOD === 1 ? 4000 : targetLOD === 2 ? 3000 : 2000;
    const unloadRadius = loadRadius + 1500; // Hysteresis buffer gap prevents boundary thrashing

    // 1. Calculate desired tiles for loading
    const newQueue: Array<{ tile: TileManifestItem; lod: LODLevel; dist: number }> = [];

    for (const tile of this.manifest.tiles) {
      const dist = Math.hypot(tile.center.x - camX, tile.center.z - camZ);

      if (dist <= loadRadius) {
        const loaded = this.loadedTiles.get(tile.id);
        const fetchKey = `${tile.id}_${targetLOD}`;

        if ((!loaded || loaded.lod !== targetLOD) && !this.activeFetches.has(fetchKey)) {
          newQueue.push({ tile, lod: targetLOD, dist });
        }
      }
    }

    // Sort loading queue by distance (camera center first)
    newQueue.sort((a, b) => a.dist - b.dist);
    this.loadQueue = newQueue;

    // Process Prioritized Asynchronous Queue (Max 4 concurrent)
    while (this.activeFetches.size < this.MAX_CONCURRENT_LOADS && this.loadQueue.length > 0) {
      const nextItem = this.loadQueue.shift();
      if (nextItem) {
        this.fetchAndBuildTile(nextItem.tile, nextItem.lod);
      }
    }

    // 2. Unload distant tiles using UNLOAD_DISTANCE hysteresis threshold
    let totalBldgs = 0;
    let totalRds = 0;
    let totalTrs = 0;

    for (const [tileId, container] of this.loadedTiles.entries()) {
      const tileMeta = this.manifest.tiles.find(t => t.id === tileId);
      if (!tileMeta) continue;

      const dist = Math.hypot(tileMeta.center.x - camX, tileMeta.center.z - camZ);

      if (dist > unloadRadius) {
        // Safe unmount only after hysteresis boundary exceeded
        this.tileGroupParent.remove(container.group);
        if (container.debugHelper) this.debugGroup.remove(container.debugHelper);
        this.disposeGroup(container.group);
        this.loadedTiles.delete(tileId);
        this.tileStateMap.set(tileId, TileState.UNLOADED);
      } else {
        totalBldgs += container.stats.buildings;
        totalRds += container.stats.roads;
        totalTrs += container.stats.trees;
      }
    }

    this.debugGroup.visible = this.debugMode;

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

  private async fetchAndBuildTile(tileMeta: TileManifestItem, lod: LODLevel): Promise<void> {
    const fetchKey = `${tileMeta.id}_${lod}`;
    this.activeFetches.add(fetchKey);
    this.tileStateMap.set(tileMeta.id, TileState.LOADING);

    try {
      const resp = await fetch(`/lucknow_tiles/${tileMeta.id}.json`);
      if (!resp.ok) return;
      const data: TileJSONData = await resp.json();

      const tileGroup = new THREE.Group();
      tileGroup.name = tileMeta.id;

      let bldgCount = 0;
      let roadCount = 0;
      let treeCount = 0;

      // Extract complete features (Buildings, Roads, Water, Green Areas, Instanced Trees)
      const bldgList = (lod >= 2 || this.stableMode) ? data.lod2.buildings : (data.lod1?.buildings || data.lod2.buildings);
      const roadList = (lod >= 2 || this.stableMode) ? data.lod2.roads : (data.lod1?.roads || data.lod2.roads);
      const waterList = data.lod2.waterways || data.lod1?.waterways || [];
      const parkList = data.lod2.greenAreas || data.lod1?.greenAreas || [];
      const treeList = data.lod2.trees || [];

      bldgCount = this.buildBuildingsMesh(tileGroup, bldgList, lod >= 2 ? this.buildingMaterialHigh : this.buildingMaterialMid);
      roadCount = this.buildRoadsMesh(tileGroup, roadList, this.roadMaterialMajor);
      this.buildWaterwaysMesh(tileGroup, waterList);
      this.buildParksMesh(tileGroup, parkList);
      treeCount = this.buildInstancedTrees(tileGroup, treeList);

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

  private buildBuildingsMesh(parent: THREE.Group, buildings: BuildingFootprint[], material: THREE.Material): number {
    if (!buildings || buildings.length === 0) return 0;

    const geometries: THREE.BufferGeometry[] = [];

    for (const bldg of buildings) {
      if (!bldg.points || bldg.points.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(bldg.points[0].x, -bldg.points[0].z);
      for (let i = 1; i < bldg.points.length; i++) {
        shape.lineTo(bldg.points[i].x, -bldg.points[i].z);
      }
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, { depth: bldg.height || 10, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geometries.push(geo);
    }

    if (geometries.length > 0) {
      const mergedGeo = this.mergeGeometries(geometries);
      if (mergedGeo) {
        const mesh = new THREE.Mesh(mergedGeo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }

    return buildings.length;
  }

  private buildRoadsMesh(parent: THREE.Group, roads: RoadSegmentOSM[], material: THREE.Material): number {
    if (!roads || roads.length === 0) return 0;

    const roadGeometries: THREE.BufferGeometry[] = [];

    for (const road of roads) {
      if (!road.points || road.points.length < 2) continue;

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i];
        const p2 = road.points[i + 1];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.1) continue;

        const angle = Math.atan2(dz, dx);
        const w = road.width || 6;

        const planeGeo = new THREE.PlaneGeometry(len, w);
        planeGeo.rotateX(-Math.PI / 2);
        planeGeo.rotateY(-angle);
        planeGeo.translate((p1.x + p2.x) / 2, 0.1, (p1.z + p2.z) / 2);

        roadGeometries.push(planeGeo);
      }
    }

    if (roadGeometries.length > 0) {
      const mergedGeo = this.mergeGeometries(roadGeometries);
      if (mergedGeo) {
        const mesh = new THREE.Mesh(mergedGeo, material);
        mesh.receiveShadow = true;
        parent.add(mesh);
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
          parent.add(mesh);
        }
      }
    }
  }

  private buildParksMesh(parent: THREE.Group, greenAreas: GreenAreaOSM[]): void {
    if (!greenAreas || greenAreas.length === 0) return;

    for (const park of greenAreas) {
      if (!park.points || park.points.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(park.points[0].x, -park.points[0].z);
      for (let i = 1; i < park.points.length; i++) {
        shape.lineTo(park.points[i].x, -park.points[i].z);
      }
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.parkMaterial);
      mesh.position.y = 0.05;
      parent.add(mesh);
    }
  }

  private buildInstancedTrees(parent: THREE.Group, trees: Array<{ x: number; y: number; z: number; scale: number }>): number {
    if (!trees || trees.length === 0) return 0;

    const count = trees.length;
    const instancedMesh = new THREE.InstancedMesh(this.treeMeshTemplate.geometry, this.treeMeshTemplate.material, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const t = trees[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.set(t.scale, t.scale, t.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    parent.add(instancedMesh);
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
}
