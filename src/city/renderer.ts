import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OSMMapData, RenderStats, OSMPoint } from '../types';

// Helper for safe geometry merging regardless of index or attribute variations
function safeMergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos || geos.length === 0) return null;
  const validGeos = geos.filter((g) => Boolean(g));
  if (validGeos.length === 0) return null;
  if (validGeos.length === 1) return validGeos[0].clone();

  try {
    const nonIndexed: THREE.BufferGeometry[] = [];
    for (const g of validGeos) {
      const ni = g.index ? g.toNonIndexed() : g.clone();
      // Remove all attributes except position and normal so all geometries match attributes exactly
      const keys = Object.keys(ni.attributes);
      for (const k of keys) {
        if (k !== 'position' && k !== 'normal') {
          ni.deleteAttribute(k);
        }
      }
      if (!ni.attributes.normal) {
        ni.computeVertexNormals();
      }
      nonIndexed.push(ni);
    }
    if (nonIndexed.length === 0) return null;
    return BufferGeometryUtils.mergeGeometries(nonIndexed, false);
  } catch (err) {
    console.warn('safeMergeGeometries error:', err);
    return null;
  }
}

// Simple Point-in-Polygon test for tree sampling inside park shapes
function isPointInPolygon(point: OSMPoint, polygon: OSMPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > point.z) !== (zj > point.z)) &&
      (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

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
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(38, width / height, 5, 150000);

    // 3. WebGL Renderer Setup — logarithmic depth buffer eliminates z-fighting
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap at 1.5x for perf on HiDPI
    this.renderer.shadowMap.enabled = false; // Shadows off by default — enabled adaptively at low altitude
    this.renderer.shadowMap.type = THREE.BasicShadowMap; // Fastest shadow type when enabled
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;

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
  private shadowsActive = false;

  // -------------------------------------------------------------
  // LIGHTING ENVIRONMENT (DAY / NIGHT DYNAMIC MODES)
  // -------------------------------------------------------------
  private setupLighting() {
    // Key Sun Light — shadow configured but disabled by default (enabled adaptively)
    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
    this.sunLight.position.set(2500, 3500, 2000);
    this.sunLight.castShadow = false; // Enabled adaptively at low altitude

    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 8000;

    const shadowD = 2000;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.0002;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Ambient Sky Light
    this.ambientLight = new THREE.AmbientLight(0x38bdf8, 0.65);
    this.scene.add(this.ambientLight);

    // Hemisphere Fill Light
    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.7);
    this.scene.add(this.hemiLight);

    this.applyDayNightState(true);
  }

  /** Move sun shadow center to orbit target — call at throttled interval, not every frame */
  public updateSunShadowTarget(target: THREE.Vector3): void {
    if (this.sunLight) {
      this.sunLight.position.set(target.x + 2500, target.y + 3500, target.z + 2000);
      this.sunLight.target.position.copy(target);
      this.sunLight.target.updateMatrixWorld();
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

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.applyDayNightState(night);
  }

  private applyDayNightState(night: boolean): void {
    // scene.background = null — the AtmosphericSky dome provides the backdrop
    this.scene.background = null;

    if (night) {
      // Night Mode — rich navy/slate with clean visibility
      this.scene.fog = new THREE.FogExp2(0x0c1628, 0.000022); // Match sky horizon
      this.sunLight.color.setHex(0x7dd3fc);
      this.sunLight.intensity = 1.0;
      this.ambientLight.color.setHex(0x475569);
      this.ambientLight.intensity = 1.1;
      this.hemiLight.color.setHex(0x7dd3fc);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 0.8;
    } else {
      // Day Mode — warm sun and bright architectural canvas
      this.scene.fog = new THREE.FogExp2(0xc8dae8, 0.000018); // Match sky horizon
      this.sunLight.color.setHex(0xfffbeb);
      this.sunLight.intensity = 1.65;
      this.ambientLight.color.setHex(0xf8fafc);
      this.ambientLight.intensity = 0.85;
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0xe2e8f0);
      this.hemiLight.intensity = 0.55;
    }
  }

  // -------------------------------------------------------------
  // GOMTI RIVER & WATERWAYS
  // -------------------------------------------------------------
  private createWaterways() {
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7, // Deep river blue
      roughness: 0.12,
      metalness: 0.85,
      transmission: 0.6, // Glass-like transparency
      opacity: 0.9,
      transparent: true,
      ior: 1.33, // Index of refraction for water
      side: THREE.DoubleSide,
    });

    const riverBankMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80, // Richer riverbank green
      roughness: 0.95,
    });

    const waterGeos: THREE.BufferGeometry[] = [];
    const bankGeos: THREE.BufferGeometry[] = [];

    this.mapData.waterways.forEach((water) => {
      if (water.isPolygon && water.points.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(water.points[0].x, -water.points[0].z);
        for (let i = 1; i < water.points.length; i++) {
          shape.lineTo(water.points[i].x, -water.points[i].z);
        }

        try {
          const geo = new THREE.ShapeGeometry(shape);
          geo.rotateX(-Math.PI / 2);
          geo.translate(0, 0.04, 0);
          waterGeos.push(geo);
        } catch {
          // Skip malformed geometry
        }
      } else if (water.points.length >= 2) {
        // Line waterway (ribbon path)
        const curvePoints = water.points.map((p) => new THREE.Vector3(p.x, 0.05, p.z));
        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const wWidth = water.width || 35;
        const riverGeo = new THREE.TubeGeometry(curve, Math.max(20, water.points.length * 3), wWidth / 2, 8, false);
        riverGeo.scale(1, 0.02, 1);
        waterGeos.push(riverGeo);

        // Bank verge ribbon
        const bankGeo = new THREE.TubeGeometry(curve, Math.max(20, water.points.length * 3), wWidth / 2 + 3, 8, false);
        bankGeo.scale(1, 0.01, 1);
        bankGeos.push(bankGeo);
      }
    });

    if (bankGeos.length > 0) {
      const mergedBank = safeMergeGeometries(bankGeos);
      if (mergedBank) {
        const bankMesh = new THREE.Mesh(mergedBank, riverBankMat);
        bankMesh.receiveShadow = true;
        this.scene.add(bankMesh);
      }
    }

    if (waterGeos.length > 0) {
      const mergedWater = safeMergeGeometries(waterGeos);
      if (mergedWater) {
        const waterMesh = new THREE.Mesh(mergedWater, waterMat);
        waterMesh.receiveShadow = true;
        this.scene.add(waterMesh);
      }
    }
  }

  // -------------------------------------------------------------
  // PARKS & GREEN AREAS (OSM Polygons)
  // -------------------------------------------------------------
  private createGreenAreas() {
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e, // Richer natural park green
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const greenGeos: THREE.BufferGeometry[] = [];

    this.mapData.greenAreas.forEach((area) => {
      if (area.points.length < 3) return;

      const shape = new THREE.Shape();
      shape.moveTo(area.points[0].x, -area.points[0].z);
      for (let i = 1; i < area.points.length; i++) {
        shape.lineTo(area.points[i].x, -area.points[i].z);
      }

      try {
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0.02, 0);
        greenGeos.push(geo);
      } catch {
        // Skip invalid polygon
      }
    });

    if (greenGeos.length > 0) {
      const mergedGreen = safeMergeGeometries(greenGeos);
      if (mergedGreen) {
        const greenMesh = new THREE.Mesh(mergedGreen, greenMat);
        greenMesh.receiveShadow = true;
        this.scene.add(greenMesh);
      }
    }
  }

  // -------------------------------------------------------------
  // ROADS (REAL OSM Highways + Sidewalks & Markings)
  // -------------------------------------------------------------
  private createRoads() {
    const majorRoadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.1 }); // Darker, smoother asphalt for highways
    const minorRoadMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }); // Slate grey for local roads
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.95 }); // Concrete sidewalk
    const markingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x333333 }); // Brighter white lane marking with slight glow

    const majorRoadGeos: THREE.BufferGeometry[] = [];
    const minorRoadGeos: THREE.BufferGeometry[] = [];
    const sidewalkGeos: THREE.BufferGeometry[] = [];
    const markingGeos: THREE.BufferGeometry[] = [];

    this.mapData.roads.forEach((road) => {
      if (road.points.length < 2) return;

      const isMajor = road.isMajor;
      const rWidth = road.width;

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i];
        const p2 = road.points[i + 1];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.2) continue;

        const angle = Math.atan2(dz, dx);
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;

        // Main Road Surface
        const roadGeo = new THREE.BoxGeometry(len, 0.1, rWidth);
        roadGeo.rotateY(-angle);
        roadGeo.translate(midX, isMajor ? 0.08 : 0.06, midZ);

        if (isMajor) {
          majorRoadGeos.push(roadGeo);

          // Add Sidewalks along Major / Secondary Roads
          const swWidth = 1.8;
          const leftSw = new THREE.BoxGeometry(len, 0.18, swWidth);
          leftSw.rotateY(-angle);
          const perpX = -Math.sin(-angle);
          const perpZ = Math.cos(-angle);
          const offDist = rWidth / 2 + swWidth / 2;

          const leftSwPos = leftSw.clone();
          leftSwPos.translate(midX + perpX * offDist, 0.12, midZ + perpZ * offDist);
          sidewalkGeos.push(leftSwPos);

          const rightSwPos = leftSw.clone();
          rightSwPos.translate(midX - perpX * offDist, 0.12, midZ - perpZ * offDist);
          sidewalkGeos.push(rightSwPos);

          // Dashed Center Lane Markings
          const dashLen = 3.5;
          const gapLen = 4.5;
          const step = dashLen + gapLen;
          let distWalk = 0;

          while (distWalk + dashLen <= len) {
            const frac = (distWalk + dashLen / 2) / len - 0.5;
            const markX = midX + Math.cos(angle) * (frac * len);
            const markZ = midZ + Math.sin(angle) * (frac * len);

            const dashGeo = new THREE.BoxGeometry(dashLen, 0.12, 0.4);
            dashGeo.rotateY(-angle);
            dashGeo.translate(markX, 0.14, markZ);
            markingGeos.push(dashGeo);

            distWalk += step;
          }
        } else {
          minorRoadGeos.push(roadGeo);
        }
      }
    });

    // Merge and add Road Meshes (Drastically cuts draw calls)
    if (majorRoadGeos.length > 0) {
      const mergedMajor = safeMergeGeometries(majorRoadGeos);
      if (mergedMajor) {
        const mesh = new THREE.Mesh(mergedMajor, majorRoadMat);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    if (minorRoadGeos.length > 0) {
      const mergedMinor = safeMergeGeometries(minorRoadGeos);
      if (mergedMinor) {
        const mesh = new THREE.Mesh(mergedMinor, minorRoadMat);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    if (sidewalkGeos.length > 0) {
      const mergedSw = safeMergeGeometries(sidewalkGeos);
      if (mergedSw) {
        const mesh = new THREE.Mesh(mergedSw, sidewalkMat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);
      }
    }

    if (markingGeos.length > 0) {
      const mergedMarkings = safeMergeGeometries(markingGeos);
      if (mergedMarkings) {
        const mesh = new THREE.Mesh(mergedMarkings, markingMat);
        this.scene.add(mesh);
      }
    }
  }

  // -------------------------------------------------------------
  // EXTRUDED BUILDINGS & ARCHITECTURAL MASSING (Merged)
  // -------------------------------------------------------------
  private createExtrudedBuildings() {
    const wallGeosByColor: Record<string, THREE.BufferGeometry[]> = {
      white: [],
      stone: [],
      beige: [],
    };
    const roofCapGeos: THREE.BufferGeometry[] = [];
    const parapetGeos: THREE.BufferGeometry[] = [];

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.05 });
    const beigeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.6, metalness: 0.05 });
    const roofCapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7, metalness: 0.1 });
    const parapetMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6, metalness: 0.1 });

    this.mapData.buildings.forEach((bld, idx) => {
      if (bld.points.length < 3) return;

      // Clean polygon points (remove duplicate consecutive points)
      const cleanPts: OSMPoint[] = [];
      for (let i = 0; i < bld.points.length; i++) {
        const pt = bld.points[i];
        if (cleanPts.length === 0) {
          cleanPts.push(pt);
        } else {
          const last = cleanPts[cleanPts.length - 1];
          if (Math.hypot(pt.x - last.x, pt.z - last.z) > 0.1) {
            cleanPts.push(pt);
          }
        }
      }

      if (cleanPts.length < 3) return;

      const shape = new THREE.Shape();
      shape.moveTo(cleanPts[0].x, -cleanPts[0].z);
      for (let i = 1; i < cleanPts.length; i++) {
        shape.lineTo(cleanPts[i].x, -cleanPts[i].z);
      }

      try {
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: bld.height,
          bevelEnabled: false,
        };

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.rotateX(-Math.PI / 2); // Stands building up along Y axis

        // Categorize into material groups for batching
        if (idx % 3 === 0) {
          wallGeosByColor.white.push(geo);
        } else if (idx % 3 === 1) {
          wallGeosByColor.stone.push(geo);
        } else {
          wallGeosByColor.beige.push(geo);
        }

        // Determine effective detail level
        const detailLevel = bld.detailLevel || (bld.height > 12 ? 'detailed' : bld.height > 8 ? 'medium' : 'simple');

        // Roof Parapet Rim (0.5m perimeter lip) - only for medium & detailed buildings
        if (detailLevel !== 'simple') {
          try {
            const parapetExtrude: THREE.ExtrudeGeometryOptions = {
              depth: 0.4,
              bevelEnabled: false,
            };
            const parapetGeo = new THREE.ExtrudeGeometry(shape, parapetExtrude);
            parapetGeo.rotateX(-Math.PI / 2);
            parapetGeo.translate(0, bld.height, 0);
            parapetGeos.push(parapetGeo);
          } catch {
            // ignore
          }
        }

        // Rooftop Box / Penthouse - only for detailed buildings
        if (detailLevel === 'detailed') {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          cleanPts.forEach((p) => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
          });

          const w = (maxX - minX) * 0.35;
          const d = (maxZ - minZ) * 0.35;
          if (w > 2.5 && d > 2.5) {
            const centerX = (minX + maxX) / 2;
            const centerZ = (minZ + maxZ) / 2;
            const penthouseGeo = new THREE.BoxGeometry(w, 2.2, d);
            penthouseGeo.translate(centerX, bld.height + 1.1, centerZ);
            roofCapGeos.push(penthouseGeo);
          }
        }
      } catch {
        // Skip malformed footprint
      }
    });

    // Merge and add Building Wall Meshes
    if (wallGeosByColor.white.length > 0) {
      const merged = safeMergeGeometries(wallGeosByColor.white);
      if (merged) {
        const mesh = new THREE.Mesh(merged, whiteMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    if (wallGeosByColor.stone.length > 0) {
      const merged = safeMergeGeometries(wallGeosByColor.stone);
      if (merged) {
        const mesh = new THREE.Mesh(merged, stoneMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    if (wallGeosByColor.beige.length > 0) {
      const merged = safeMergeGeometries(wallGeosByColor.beige);
      if (merged) {
        const mesh = new THREE.Mesh(merged, beigeMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }

    if (parapetGeos.length > 0) {
      const mergedParapet = safeMergeGeometries(parapetGeos);
      if (mergedParapet) {
        const mesh = new THREE.Mesh(mergedParapet, parapetMat);
        mesh.castShadow = false; // Tiny geometry — not worth shadow cost
        this.scene.add(mesh);
      }
    }

    if (roofCapGeos.length > 0) {
      const mergedRoofCaps = safeMergeGeometries(roofCapGeos);
      if (mergedRoofCaps) {
        const mesh = new THREE.Mesh(mergedRoofCaps, roofCapMat);
        mesh.castShadow = false; // Tiny geometry — not worth shadow cost
        this.scene.add(mesh);
      }
    }
  }

  // -------------------------------------------------------------
  // INSTANCED TREES (3,000+ TREES IN <6 DRAW CALLS)
  // -------------------------------------------------------------
  private createInstancedTrees() {
    // 5 Tree Prototypes (Canopy + Trunk)
    const treeMatFoliage1 = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 }); // Banyan/Neem deep green
    const treeMatFoliage2 = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 }); // Vibrant park green
    const treeMatFoliage3 = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.85 }); // Cypress dark pine
    const treeMatFoliage4 = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.8 }); // Light avenue green
    const treeMatTrunk = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 }); // Bark brown

    // Prototype 1: Neem / Banyan Canopy
    const p1Geo = new THREE.DodecahedronGeometry(3.2, 1);
    p1Geo.translate(0, 5, 0);

    // Prototype 2: Acacia Umbrella Canopy
    const p2Geo = new THREE.CylinderGeometry(4.5, 2.5, 2.2, 7);
    p2Geo.translate(0, 4.8, 0);

    // Prototype 3: Cypress Slender Cone
    const p3Geo = new THREE.ConeGeometry(2.0, 7.5, 6);
    p3Geo.translate(0, 5.2, 0);

    // Prototype 4: Street Maple Round Crown
    const p4Geo = new THREE.IcosahedronGeometry(2.5, 1);
    p4Geo.translate(0, 4.2, 0);

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 3.5, 6);
    trunkGeo.translate(0, 1.75, 0);

    // Build compound geometries for each tree type
    const treeGeos = [
      safeMergeGeometries([p1Geo, trunkGeo.clone()]) || new THREE.ConeGeometry(3, 7, 6),
      safeMergeGeometries([p2Geo, trunkGeo.clone()]) || new THREE.CylinderGeometry(4, 2, 3, 6),
      safeMergeGeometries([p3Geo, trunkGeo.clone()]) || new THREE.ConeGeometry(2, 7, 5),
      safeMergeGeometries([p4Geo, trunkGeo.clone()]) || new THREE.SphereGeometry(3, 8, 8),
    ];

    const treeMaterials = [treeMatFoliage1, treeMatFoliage2, treeMatFoliage3, treeMatFoliage4];

    // Collect tree placement positions (Parks, Riverbanks, Roadside avenues)
    const treeTransforms: Array<{ pos: THREE.Vector3; scale: number; rotY: number; type: number }> = [];

    // A. Park & Green Area Trees
    this.mapData.greenAreas.forEach((area, aIdx) => {
      if (area.points.length < 3) return;

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      area.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      });

      const areaSq = (maxX - minX) * (maxZ - minZ);
      const targetCount = Math.min(120, Math.max(8, Math.floor(areaSq / 80)));

      let placed = 0;
      let attempts = 0;
      while (placed < targetCount && attempts < targetCount * 3) {
        attempts++;
        const rx = minX + Math.random() * (maxX - minX);
        const rz = minZ + Math.random() * (maxZ - minZ);

        if (isPointInPolygon({ x: rx, z: rz }, area.points)) {
          treeTransforms.push({
            pos: new THREE.Vector3(rx, 0, rz),
            scale: 0.8 + Math.random() * 0.5,
            rotY: Math.random() * Math.PI * 2,
            type: (aIdx + placed) % 4,
          });
          placed++;
        }
      }
    });

    // B. Riverbank Trees along Gomti River
    this.mapData.waterways.forEach((water) => {
      if (water.points.length < 2) return;

      for (let i = 0; i < water.points.length - 1; i += 2) {
        const p1 = water.points[i];
        const p2 = water.points[i + 1];
        const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
        const perpX = -Math.sin(angle);
        const perpZ = Math.cos(angle);

        const dist = (water.width || 35) / 2 + 6 + Math.random() * 8;

        // Left bank tree
        treeTransforms.push({
          pos: new THREE.Vector3(p1.x + perpX * dist, 0, p1.z + perpZ * dist),
          scale: 0.9 + Math.random() * 0.4,
          rotY: Math.random() * Math.PI * 2,
          type: 1, // Acacia / Banyan
        });

        // Right bank tree
        treeTransforms.push({
          pos: new THREE.Vector3(p1.x - perpX * dist, 0, p1.z - perpZ * dist),
          scale: 0.9 + Math.random() * 0.4,
          rotY: Math.random() * Math.PI * 2,
          type: 0,
        });
      }
    });

    // C. Roadside Avenue Trees
    this.mapData.roads.forEach((road) => {
      if (!road.isMajor || road.points.length < 2) return;

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i];
        const p2 = road.points[i + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.hypot(dx, dz);
        if (len < 12) continue;

        const angle = Math.atan2(dz, dx);
        const perpX = -Math.sin(angle);
        const perpZ = Math.cos(angle);
        const offDist = road.width / 2 + 2.5;

        const step = 22; // tree every 22m
        for (let d = 5; d < len; d += step) {
          const frac = d / len;
          const cx = p1.x + dx * frac;
          const cz = p1.z + dz * frac;

          treeTransforms.push({
            pos: new THREE.Vector3(cx + perpX * offDist, 0, cz + perpZ * offDist),
            scale: 0.75 + Math.random() * 0.35,
            rotY: Math.random() * Math.PI * 2,
            type: 3, // Street tree
          });

          treeTransforms.push({
            pos: new THREE.Vector3(cx - perpX * offDist, 0, cz - perpZ * offDist),
            scale: 0.75 + Math.random() * 0.35,
            rotY: Math.random() * Math.PI * 2,
            type: 3,
          });
        }
      }
    });

    // Group tree transforms by type and construct 4 InstancedMeshes
    const transformsByType: Array<typeof treeTransforms> = [[], [], [], []];
    treeTransforms.forEach((t) => transformsByType[t.type].push(t));

    const dummy = new THREE.Object3D();

    for (let t = 0; t < 4; t++) {
      const items = transformsByType[t];
      if (items.length === 0) continue;

      const instMesh = new THREE.InstancedMesh(treeGeos[t], treeMaterials[t], items.length);
      instMesh.castShadow = false; // Trees are the heaviest shadow casters — disabled for perf
      instMesh.receiveShadow = false;

      items.forEach((item, idx) => {
        dummy.position.copy(item.pos);
        dummy.rotation.set(0, item.rotY, 0);
        dummy.scale.set(item.scale, item.scale, item.scale);
        dummy.updateMatrix();
        instMesh.setMatrixAt(idx, dummy.matrix);
      });

      instMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(instMesh);
    }
  }

  // -------------------------------------------------------------
  // LANDMARK MARKERS / DISTINCTIVE TOPS
  // -------------------------------------------------------------
  private createLandmarks() {
    const lmGroup = new THREE.Group();

    // Featured landmarks limit to prevent clutter
    const featured = this.mapData.landmarks.slice(0, 16);

    featured.forEach((lm) => {
      // Beacon Pole & Pin
      const poleGeo = new THREE.CylinderGeometry(0.7, 0.7, 28, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lm.position.x, 14, lm.position.z);
      pole.castShadow = true;
      lmGroup.add(pole);

      const topGeo = new THREE.SphereGeometry(3.2, 12, 12);
      const topMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const topMesh = new THREE.Mesh(topGeo, topMat);
      topMesh.position.set(lm.position.x, 29, lm.position.z);
      lmGroup.add(topMesh);
    });

    this.scene.add(lmGroup);
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
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose() {
    this.renderer.dispose();
  }
}
