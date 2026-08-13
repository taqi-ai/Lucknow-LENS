import * as THREE from 'three';

/**
 * HorizonCity — procedural low-detail city perimeter that extends beyond the
 * real Overture data bounds, creating the illusion of an infinite urban horizon.
 *
 * Design:
 *  - 8 radial sectors surrounding the real city, each with its own InstancedMesh
 *  - Buildings are simple boxes with height variation (3–30 m)
 *  - Roads are flat merged planes
 *  - Green patches are flat merged planes
 *  - A ring ground plane covers the gap between the real ground and the horizon edge
 *  - All materials are MeshBasicMaterial — zero lighting cost
 *
 * Performance budget: ~12 draw calls, ~2400 building instances, zero shadows.
 */

// Deterministic pseudo-random — same seed always produces same result
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface HorizonCityConfig {
  /** Inner margin beyond the real city extent before horizon starts */
  innerMargin: number;
  /** How far the horizon extends outward */
  outerRadius: number;
  /** Number of radial sectors */
  sectors: number;
  /** Approx. building instances per sector */
  buildingsPerSector: number;
}

const DEFAULT_CONFIG: HorizonCityConfig = {
  innerMargin: 2000,
  outerRadius: 80000, // Massive radius to completely cover the camera's visible range up to the fog limit
  sectors: 32,        // More sectors for a smooth circular horizon
  buildingsPerSector: 400, // 12,800 total building masses
};

export class HorizonCity {
  private group = new THREE.Group();
  private isNight = true;

  // Materials — MeshBasicMaterial for zero lighting cost
  private buildingMat: THREE.MeshBasicMaterial;
  private buildingMatAlt: THREE.MeshBasicMaterial;
  private roadMat: THREE.MeshBasicMaterial;
  private greenMat: THREE.MeshBasicMaterial;

  // Track instanced meshes so we can update colors
  private buildingMeshes: THREE.InstancedMesh[] = [];

  constructor() {
    this.group.name = 'HorizonCityGroup';
    this.group.renderOrder = -500; // Render before detailed city but after sky

    // Night mode defaults
    this.buildingMat = new THREE.MeshBasicMaterial({
      color: 0x2d3748,
      transparent: true,
      opacity: 0.7,
      fog: true,
    });

    this.buildingMatAlt = new THREE.MeshBasicMaterial({
      color: 0x4a5568,
      transparent: true,
      opacity: 0.6,
      fog: true,
    });

    this.roadMat = new THREE.MeshBasicMaterial({
      color: 0x1a202c,
      transparent: true,
      opacity: 0.5,
      fog: true,
    });

    this.greenMat = new THREE.MeshBasicMaterial({
      color: 0x1a4731,
      transparent: true,
      opacity: 0.3,
      fog: true,
    });
  }

  /**
   * Build the horizon city geometry around the given city extent.
   * Call once after manifest is loaded.
   */
  public build(
    scene: THREE.Scene,
    extent: { minX: number; maxX: number; minZ: number; maxZ: number },
    config: Partial<HorizonCityConfig> = {},
  ): void {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Clear any previous build
    this.dispose();

    const cx = (extent.minX + extent.maxX) / 2;
    const cz = (extent.minZ + extent.maxZ) / 2;
    const halfW = (extent.maxX - extent.minX) / 2;
    const halfD = (extent.maxZ - extent.minZ) / 2;

    // 1. Building instances per sector
    this.buildSectorBuildings(cx, cz, halfW, halfD, cfg);

    // 3. Simplified road grid
    this.buildSimplifiedRoads(cx, cz, halfW, halfD, cfg);

    // 4. Green patches
    this.buildGreenPatches(cx, cz, halfW, halfD, cfg);

    scene.add(this.group);
  }

    // Removed buildGroundRing as it creates a visible rectangular seam.
    // We now rely on tileStreamer's massive 400km infinite ground plane.

  private buildSectorBuildings(
    cx: number, cz: number,
    halfW: number, halfD: number,
    cfg: HorizonCityConfig,
  ): void {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1); // Unit box, scaled per instance

    const innerDist = Math.max(halfW, halfD) + cfg.innerMargin;
    const outerDist = Math.max(halfW, halfD) + cfg.outerRadius;
    const dummy = new THREE.Object3D();

    for (let s = 0; s < cfg.sectors; s++) {
      const angleStart = (s / cfg.sectors) * Math.PI * 2;
      const angleEnd = ((s + 1) / cfg.sectors) * Math.PI * 2;
      const count = cfg.buildingsPerSector;
      const mat = s % 2 === 0 ? this.buildingMat : this.buildingMatAlt;

      const instMesh = new THREE.InstancedMesh(boxGeo, mat, count);
      instMesh.castShadow = false;
      instMesh.receiveShadow = false;
      instMesh.frustumCulled = true;

      for (let i = 0; i < count; i++) {
        const seed = s * 10000 + i;
        const angle = angleStart + seededRandom(seed) * (angleEnd - angleStart);

        // Distance distribution: higher density near the inner edge, sparser toward outer
        const distT = seededRandom(seed + 1);
        const dist = innerDist + (outerDist - innerDist) * (distT * distT); // Quadratic bias toward inner

        const px = cx + Math.cos(angle) * dist;
        const pz = cz + Math.sin(angle) * dist;

        // Height: taller near the city center, shorter at the edge
        const centerBias = 1 - (dist - innerDist) / (outerDist - innerDist);
        const baseHeight = 3 + seededRandom(seed + 2) * 22 * centerBias;
        const height = Math.max(3, baseHeight);

        // Footprint width/depth
        const fw = 8 + seededRandom(seed + 3) * 20;
        const fd = 8 + seededRandom(seed + 4) * 20;

        dummy.position.set(px, height / 2, pz);
        dummy.scale.set(fw, height, fd);
        dummy.rotation.set(0, seededRandom(seed + 5) * Math.PI * 0.5, 0);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }

      instMesh.instanceMatrix.needsUpdate = true;
      this.group.add(instMesh);
      this.buildingMeshes.push(instMesh);
    }
  }

  private buildSimplifiedRoads(
    cx: number, cz: number,
    halfW: number, halfD: number,
    cfg: HorizonCityConfig,
  ): void {
    const roadGeos: THREE.BufferGeometry[] = [];
    const innerDist = Math.max(halfW, halfD) + cfg.innerMargin;
    const outerDist = Math.max(halfW, halfD) + cfg.outerRadius;

    // Radial roads
    const radialCount = 16;
    for (let i = 0; i < radialCount; i++) {
      const angle = (i / radialCount) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * innerDist;
      const z1 = cz + Math.sin(angle) * innerDist;
      const x2 = cx + Math.cos(angle) * outerDist;
      const z2 = cz + Math.sin(angle) * outerDist;

      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const roadAngle = Math.atan2(dz, dx);

      const geo = new THREE.PlaneGeometry(len, 8 + (i % 3) * 4);
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(-roadAngle);
      geo.translate((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
      roadGeos.push(geo);
    }

    // Ring roads at various distances
    const ringDistances = [0.25, 0.5, 0.75];
    for (const t of ringDistances) {
      const ringDist = innerDist + (outerDist - innerDist) * t;
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const x1 = cx + Math.cos(a1) * ringDist;
        const z1 = cz + Math.sin(a1) * ringDist;
        const x2 = cx + Math.cos(a2) * ringDist;
        const z2 = cz + Math.sin(a2) * ringDist;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        const segAngle = Math.atan2(dz, dx);

        const geo = new THREE.PlaneGeometry(len, 6);
        geo.rotateX(-Math.PI / 2);
        geo.rotateY(-segAngle);
        geo.translate((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
        roadGeos.push(geo);
      }
    }

    if (roadGeos.length > 0) {
      const merged = this.mergeGeos(roadGeos);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.roadMat);
        mesh.receiveShadow = false;
        this.group.add(mesh);
      }
    }
  }

  private buildGreenPatches(
    cx: number, cz: number,
    halfW: number, halfD: number,
    cfg: HorizonCityConfig,
  ): void {
    const greenGeos: THREE.BufferGeometry[] = [];
    const innerDist = Math.max(halfW, halfD) + cfg.innerMargin;
    const outerDist = Math.max(halfW, halfD) + cfg.outerRadius;

    // Scatter ~60 green patches
    const patchCount = 60;
    for (let i = 0; i < patchCount; i++) {
      const seed = 50000 + i;
      const angle = seededRandom(seed) * Math.PI * 2;
      const distT = seededRandom(seed + 1);
      const dist = innerDist + (outerDist - innerDist) * distT;

      const px = cx + Math.cos(angle) * dist;
      const pz = cz + Math.sin(angle) * dist;

      const w = 60 + seededRandom(seed + 2) * 200;
      const d = 60 + seededRandom(seed + 3) * 200;

      const geo = new THREE.PlaneGeometry(w, d);
      geo.rotateX(-Math.PI / 2);
      geo.translate(px, 0.03, pz);
      greenGeos.push(geo);
    }

    if (greenGeos.length > 0) {
      const merged = this.mergeGeos(greenGeos);
      if (merged) {
        const mesh = new THREE.Mesh(merged, this.greenMat);
        mesh.receiveShadow = false;
        this.group.add(mesh);
      }
    }
  }

  // Lightweight geometry merge (positions only, no normals)
  private mergeGeos(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (geometries.length === 0) return null;

    let totalPositions = 0;
    let totalIndices = 0;

    for (const g of geometries) {
      const pos = g.getAttribute('position');
      if (pos) totalPositions += pos.array.length;
      if (g.index) totalIndices += g.index.array.length;
    }

    const positions = new Float32Array(totalPositions);
    const indices = totalIndices > 0 ? new Uint32Array(totalIndices) : null;

    let posOff = 0;
    let idxOff = 0;
    let vtxOff = 0;

    for (const g of geometries) {
      const pos = g.getAttribute('position');
      if (pos) {
        positions.set(pos.array, posOff);
        posOff += pos.array.length;
      }
      if (g.index && indices) {
        for (let i = 0; i < g.index.array.length; i++) {
          indices[idxOff + i] = g.index.array[i] + vtxOff;
        }
        idxOff += g.index.array.length;
      }
      if (pos) vtxOff += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (indices) merged.setIndex(new THREE.BufferAttribute(indices, 1));

    return merged;
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;

    if (night) {
      this.buildingMat.color.setHex(0x2d3748);
      this.buildingMat.opacity = 0.7;
      this.buildingMatAlt.color.setHex(0x4a5568);
      this.buildingMatAlt.opacity = 0.6;
      this.roadMat.color.setHex(0x1a202c);
      this.greenMat.color.setHex(0x1a4731);
    } else {
      this.buildingMat.color.setHex(0xd1d5db);
      this.buildingMat.opacity = 0.65;
      this.buildingMatAlt.color.setHex(0xbfc4cc);
      this.buildingMatAlt.opacity = 0.55;
      this.roadMat.color.setHex(0xb0b8c4);
      this.greenMat.color.setHex(0xa7d9a2);
    }
  }

  public isActive(): boolean {
    return this.group.parent !== null;
  }

  public dispose(): void {
    // Remove from scene
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }

    // Dispose geometry and materials
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
      }
    });

    this.group.clear();
    this.buildingMeshes = [];
  }
}
