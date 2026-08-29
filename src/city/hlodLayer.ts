import * as THREE from 'three';
import { BuildingMaterialSystem } from './buildingMaterial';

/**
 * HLODLayer — city-scale building representation built entirely from real Overture
 * footprints, baked offline by scripts/bake_hlod.ts.
 *
 * Two streams per 4 km super-tile:
 *   fabric — every one of the ~959k footprints as a flat roof polygon at its true
 *            height. This is what makes Full City read as Lucknow rather than an
 *            empty map: real density, real urban shape, ~67 MB for the whole city.
 *   relief — full extrusions for buildings that actually read at altitude, giving
 *            skyline silhouette and 3D depth. Loaded only within a radius.
 *
 * Activation is a plain buffer upload: positions arrive as quantised Int16 and are
 * de-quantised by the mesh's own transform, so there is zero triangulation, zero
 * JSON parsing and zero per-vertex CPU work on the main thread.
 */

export interface HLODSuperTileMeta {
  key: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  center: { x: number; z: number };
  buildings: number;
  fabricVerts: number;
  reliefVerts: number;
  fabricBytes: number;
  reliefBytes: number;
}

export interface HLODManifest {
  version: number;
  generatedAt?: string;
  superTileSize: number;
  quantisation: { scaleXZ: number; scaleY: number };
  spatialExtent: { minX: number; maxX: number; minZ: number; maxZ: number };
  totalBuildings: number;
  totalSuperTiles: number;
  superTiles: HLODSuperTileMeta[];
}

type StreamKind = 'f' | 'r';

interface LoadedStream {
  mesh: THREE.Mesh;
  verts: number;
  bytes: number;
}

interface SuperTileState {
  meta: HLODSuperTileMeta;
  box: THREE.Box3;
  fabric?: LoadedStream;
  relief?: LoadedStream;
  fabricPending: boolean;
  reliefPending: boolean;
  /** Marked each update; used to retire streams that fall out of range. */
  lastSeen: number;
}

const HEADER_BYTES = 32;
const MAGIC = 0x304c484c; // 'LHL0'

export interface HLODStats {
  superTilesLoaded: number;
  fabricMeshes: number;
  reliefMeshes: number;
  buildings: number;
  vertices: number;
  bytes: number;
  pending: number;
}

export class HLODLayer {
  private group = new THREE.Group();
  private manifest: HLODManifest | null = null;
  private tiles = new Map<string, SuperTileState>();
  private materials: BuildingMaterialSystem;

  private inFlight = new Set<string>();
  private queue: Array<{ key: string; kind: StreamKind; priority: number }> = [];
  private readonly MAX_CONCURRENT = 6;

  /** `?v=<bake timestamp>`, appended to every super-tile request. */
  private cacheBust = '';

  private frameId = 0;
  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();

  /** Beyond this the relief stream is dropped and fabric alone represents the city. */
  private reliefRadius = 9000;
  /** Fabric covers the whole city, so this is effectively "everything in frustum". */
  private fabricRadius = 60000;

  private stats: HLODStats = {
    superTilesLoaded: 0, fabricMeshes: 0, reliefMeshes: 0,
    buildings: 0, vertices: 0, bytes: 0, pending: 0,
  };

  constructor(scene: THREE.Scene, materials: BuildingMaterialSystem) {
    this.group.name = 'HLODLayer';
    this.materials = materials;
    scene.add(this.group);
  }

  public async init(): Promise<HLODManifest | null> {
    try {
      const resp = await fetch('/hlod/hlod_manifest.json');
      if (!resp.ok) {
        console.warn('[HLOD] manifest missing — run `npm run bake`. City-scale layer disabled.');
        return null;
      }
      this.manifest = await resp.json();
      this.cacheBust = this.manifest?.generatedAt
        ? `?v=${encodeURIComponent(this.manifest.generatedAt)}`
        : '';

      for (const meta of this.manifest!.superTiles) {
        this.tiles.set(meta.key, {
          meta,
          box: new THREE.Box3(
            new THREE.Vector3(meta.bounds.minX, -5, meta.bounds.minZ),
            new THREE.Vector3(meta.bounds.maxX, 320, meta.bounds.maxZ),
          ),
          fabricPending: false,
          reliefPending: false,
          lastSeen: 0,
        });
      }
      return this.manifest;
    } catch (e) {
      console.warn('[HLOD] init failed:', e);
      return null;
    }
  }

  public getSpatialExtent(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    return this.manifest?.spatialExtent ?? null;
  }

  /**
   * Called every tile-update tick.
   * @param camera        active camera
   * @param wantRelief    false at Full City — fabric alone carries the view
   * @param streamedRadius radius inside which full-detail streamed tiles take over,
   *                       so HLOD hides itself there rather than double-drawing
   */
  public update(camera: THREE.PerspectiveCamera, wantRelief: boolean, streamedRadius: number): void {
    if (!this.manifest) return;
    this.frameId++;

    this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    const cx = camera.position.x;
    const cz = camera.position.z;

    this.queue.length = 0;

    let buildings = 0;
    let vertices = 0;
    let bytes = 0;
    let fabricMeshes = 0;
    let reliefMeshes = 0;
    let loaded = 0;

    for (const state of this.tiles.values()) {
      const { meta } = state;
      const dist = Math.hypot(meta.center.x - cx, meta.center.z - cz);
      const visible = this.frustum.intersectsBox(state.box);

      // Only stand down where streamed tiles cover the ENTIRE super-tile. Testing
      // the centre meant a 4 km super-tile vanished as soon as its midpoint entered
      // the streamed radius, even though most of it was still outside — which is
      // what produced the flicker and the holes when zooming in.
      const halfDiag = Math.hypot(
        (meta.bounds.maxX - meta.bounds.minX) * 0.5,
        (meta.bounds.maxZ - meta.bounds.minZ) * 0.5,
      );
      const supersededByStreaming = streamedRadius > 0 && dist + halfDiag < streamedRadius;

      if (visible && dist < this.fabricRadius) {
        state.lastSeen = this.frameId;
        if (!state.fabric && !state.fabricPending && meta.fabricVerts > 0) {
          this.queue.push({ key: meta.key, kind: 'f', priority: dist });
        }
        if (wantRelief && dist < this.reliefRadius && !state.relief && !state.reliefPending && meta.reliefVerts > 0) {
          // Relief is the expensive stream — bias it hard toward the camera.
          this.queue.push({ key: meta.key, kind: 'r', priority: dist * 0.25 });
        }
      }

      if (state.fabric) {
        // Fabric and relief coexist. Relief only covers the ~24% of buildings that
        // read at altitude, so hiding fabric wherever relief loaded used to drop the
        // other 76% and left District looking like scattered blocks on empty ground.
        // The two streams overlap only on relief buildings' roof caps, and the
        // fabric material's polygon offset makes relief win that depth test.
        state.fabric.mesh.visible = visible && !supersededByStreaming;
        if (state.fabric.mesh.visible) {
          fabricMeshes++;
          vertices += state.fabric.verts;
        }
        bytes += state.fabric.bytes;
      }
      if (state.relief) {
        state.relief.mesh.visible = visible && !supersededByStreaming;
        if (state.relief.mesh.visible) {
          reliefMeshes++;
          vertices += state.relief.verts;
        }
        bytes += state.relief.bytes;
      }

      if (state.fabric || state.relief) {
        loaded++;
        if (visible && !supersededByStreaming) buildings += meta.buildings;
      }

      // Retire relief that has fallen well outside its radius. Fabric is cheap and
      // covers the whole city, so it is never unloaded once fetched.
      if (state.relief && dist > this.reliefRadius * 1.6) {
        this.disposeStream(state.relief);
        state.relief = undefined;
      }
    }

    this.queue.sort((a, b) => a.priority - b.priority);
    while (this.inFlight.size < this.MAX_CONCURRENT && this.queue.length > 0) {
      const next = this.queue.shift()!;
      void this.loadStream(next.key, next.kind);
    }

    this.stats = {
      superTilesLoaded: loaded,
      fabricMeshes,
      reliefMeshes,
      buildings,
      vertices,
      bytes,
      pending: this.inFlight.size + this.queue.length,
    };
  }

  private async loadStream(key: string, kind: StreamKind): Promise<void> {
    const state = this.tiles.get(key);
    if (!state) return;
    const flightKey = `${key}.${kind}`;
    if (this.inFlight.has(flightKey)) return;

    this.inFlight.add(flightKey);
    if (kind === 'f') state.fabricPending = true;
    else state.reliefPending = true;

    try {
      // Super-tiles are served with a long immutable cache, so a re-bake would
      // otherwise be masked by stale entries. The bake timestamp busts it.
      const resp = await fetch(`/hlod/s_${key}.${kind}.bin${this.cacheBust}`);
      if (!resp.ok) return;
      const buf = await resp.arrayBuffer();

      const header = new DataView(buf);
      if (header.getUint32(0, true) !== MAGIC) {
        console.warn(`[HLOD] bad magic in s_${key}.${kind}.bin`);
        return;
      }
      const originX = header.getFloat32(8, true);
      const originZ = header.getFloat32(12, true);
      const scaleXZ = header.getFloat32(16, true);
      const scaleY = header.getFloat32(20, true);
      const count = header.getUint32(24, true);
      if (count === 0) return;

      const posBytes = count * 3 * 2;
      const packOffset = (HEADER_BYTES + posBytes + 3) & ~3;

      const positions = new Int16Array(buf, HEADER_BYTES, count * 3);
      const packs = new Uint8Array(buf, packOffset, count * 4);

      const geo = new THREE.BufferGeometry();
      // Raw quantised ints; the mesh transform below converts them to metres.
      geo.setAttribute('position', new THREE.Int16BufferAttribute(positions, 3, false));
      geo.setAttribute('aPack', new THREE.Uint8BufferAttribute(packs, 4, true));

      // Bounding volumes must be computed in quantised space, then the transform
      // scales them — so set them by hand rather than letting three guess.
      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      // hlodSolid, not solid: the streamed tiles own `solid`, and relief must be a
      // distinct material so it can carry the streamed-coverage cull.
      const material = kind === 'f' ? this.materials.fabric : this.materials.hlodSolid;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = 'buildings';
      mesh.position.set(originX, 0, originZ);
      mesh.scale.set(scaleXZ, scaleY, scaleXZ);
      // Relief casts shadows at close range; the flat fabric layer never needs to.
      mesh.castShadow = kind === 'r';
      mesh.receiveShadow = kind === 'r';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);
      mesh.visible = false; // revealed by the next update() pass

      this.group.add(mesh);

      const stream: LoadedStream = { mesh, verts: count, bytes: buf.byteLength };
      if (kind === 'f') state.fabric = stream;
      else state.relief = stream;
    } catch (e) {
      console.warn(`[HLOD] failed to load ${key}.${kind}:`, e);
    } finally {
      this.inFlight.delete(flightKey);
      if (kind === 'f') state.fabricPending = false;
      else state.reliefPending = false;
    }
  }

  private disposeStream(stream: LoadedStream): void {
    this.group.remove(stream.mesh);
    stream.mesh.geometry.dispose();
  }

  public getStats(): HLODStats {
    return this.stats;
  }

  public setVisible(v: boolean): void {
    this.group.visible = v;
  }

  public dispose(): void {
    for (const state of this.tiles.values()) {
      if (state.fabric) this.disposeStream(state.fabric);
      if (state.relief) this.disposeStream(state.relief);
    }
    this.tiles.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
