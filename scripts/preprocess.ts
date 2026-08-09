import fs from 'fs';
import path from 'path';
import readline from 'readline';

const TILE_SIZE = 500; // 500m x 500m spatial tile

// Strict Lucknow region bounds
const LUCKNOW_MIN_LAT = 26.65;
const LUCKNOW_MAX_LAT = 27.05;
const LUCKNOW_MIN_LON = 80.75;
const LUCKNOW_MAX_LON = 81.15;

interface OSMNode {
  id: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
}

interface FeaturePoint {
  x: number;
  z: number;
}

interface BuildingFeature {
  id: string;
  name?: string;
  points: FeaturePoint[];
  height: number;
  stories: number;
  color: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface RoadFeature {
  id: string;
  name?: string;
  points: FeaturePoint[];
  width: number;
  type: string;
  isMajor: boolean;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface WaterwayFeature {
  id: string;
  name?: string;
  points: FeaturePoint[];
  width?: number;
  isPolygon: boolean;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface GreenFeature {
  id: string;
  name?: string;
  points: FeaturePoint[];
  type: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface LandmarkFeature {
  id: string;
  name: string;
  x: number;
  z: number;
  type: string;
}

interface TreePoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function latLonToMeters(lat: number, lon: number, centerLat: number, centerLon: number): { x: number; z: number } {
  const latRad = (centerLat * Math.PI) / 180;
  const x = (lon - centerLon) * Math.cos(latRad) * 111320;
  const z = -(lat - centerLat) * 111320;
  return { x, z };
}

async function processOSM() {
  const inputOsmPath = fs.existsSync('public/export.osm') ? 'public/export.osm' : 'public/map.osm';
  console.log(`Starting OSM preprocessing on: ${inputOsmPath}`);

  // Step 1: Pass 1 - Filter nodes in Lucknow
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  console.log('Pass 1: Parsing nodes strictly within Lucknow region...');
  
  const nodes = new Map<string, OSMNode>();
  const rl1 = readline.createInterface({
    input: fs.createReadStream(inputOsmPath),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl1) {
    lineCount++;
    if (lineCount % 500000 === 0) {
      console.log(`Read ${lineCount} lines... Collected ${nodes.size} Lucknow nodes.`);
    }

    if (line.includes('<node ')) {
      const idMatch = line.match(/id=["'](\d+)["']/);
      const latMatch = line.match(/lat=["']([-+]?\d*\.?\d+)["']/);
      const lonMatch = line.match(/lon=["']([-+]?\d*\.?\d+)["']/);

      if (idMatch && latMatch && lonMatch) {
        const id = idMatch[1];
        const lat = parseFloat(latMatch[1]);
        const lon = parseFloat(lonMatch[1]);

        if (!isNaN(lat) && !isNaN(lon)) {
          if (lat >= LUCKNOW_MIN_LAT && lat <= LUCKNOW_MAX_LAT && lon >= LUCKNOW_MIN_LON && lon <= LUCKNOW_MAX_LON) {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);

            nodes.set(id, { id, lat, lon, x: 0, z: 0 });
          }
        }
      }
    }
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  console.log(`Lucknow Bounds: lat [${minLat.toFixed(4)}, ${maxLat.toFixed(4)}], lon [${minLon.toFixed(4)}, ${maxLon.toFixed(4)}]`);

  for (const node of nodes.values()) {
    const { x, z } = latLonToMeters(node.lat, node.lon, centerLat, centerLon);
    node.x = x;
    node.z = z;
  }

  // Step 2: Pass 2 - Parse Ways & Features
  console.log('Pass 2: Extracting feature geometries...');

  const buildings: BuildingFeature[] = [];
  const roads: RoadFeature[] = [];
  const waterways: WaterwayFeature[] = [];
  const greenAreas: GreenFeature[] = [];
  const landmarks: LandmarkFeature[] = [];

  const rl2 = readline.createInterface({
    input: fs.createReadStream(inputOsmPath),
    crlfDelay: Infinity,
  });

  let inWay = false;
  let currentWayId = '';
  let currentNdRefs: string[] = [];
  let currentTags: Record<string, string> = {};

  let inNode = false;
  let currentNodeId = '';
  let currentNodeTags: Record<string, string> = {};

  for await (const line of rl2) {
    if (line.includes('<node ')) {
      const idMatch = line.match(/id=["'](\d+)["']/);
      if (idMatch) {
        currentNodeId = idMatch[1];
        currentNodeTags = {};
        if (!line.includes('/>')) inNode = true;
      }
    } else if (inNode) {
      if (line.includes('<tag ')) {
        const kMatch = line.match(/k=["']([^"']+)["']/);
        const vMatch = line.match(/v=["']([^"']+)["']/);
        if (kMatch && vMatch) currentNodeTags[kMatch[1]] = vMatch[1];
      } else if (line.includes('</node>')) {
        inNode = false;
        if (currentNodeTags['name'] && (currentNodeTags['tourism'] || currentNodeTags['amenity'] || currentNodeTags['historic'])) {
          const nodeObj = nodes.get(currentNodeId);
          if (nodeObj) {
            landmarks.push({
              id: currentNodeId,
              name: currentNodeTags['name'],
              x: nodeObj.x,
              z: nodeObj.z,
              type: currentNodeTags['tourism'] || currentNodeTags['amenity'] || currentNodeTags['historic'] || 'landmark',
            });
          }
        }
      }
    }

    if (line.includes('<way ')) {
      const idMatch = line.match(/id=["'](\d+)["']/);
      if (idMatch) {
        currentWayId = idMatch[1];
        currentNdRefs = [];
        currentTags = {};
        inWay = true;
      }
    } else if (inWay) {
      if (line.includes('<nd ')) {
        const refMatch = line.match(/ref=["'](\d+)["']/);
        if (refMatch) currentNdRefs.push(refMatch[1]);
      } else if (line.includes('<tag ')) {
        const kMatch = line.match(/k=["']([^"']+)["']/);
        const vMatch = line.match(/v=["']([^"']+)["']/);
        if (kMatch && vMatch) currentTags[kMatch[1]] = vMatch[1];
      } else if (line.includes('</way>')) {
        inWay = false;
        if (currentNdRefs.length < 2) continue;

        const points: FeaturePoint[] = [];
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

        for (const ref of currentNdRefs) {
          const n = nodes.get(ref);
          if (n) {
            points.push({ x: n.x, z: n.z });
            minX = Math.min(minX, n.x);
            maxX = Math.max(maxX, n.x);
            minZ = Math.min(minZ, n.z);
            maxZ = Math.max(maxZ, n.z);
          }
        }

        if (points.length < 2) continue;

        // Buildings
        if (currentTags['building']) {
          let height = 10;
          let stories = 3;
          if (currentTags['building:levels']) {
            stories = parseInt(currentTags['building:levels']) || 3;
            height = stories * 3.5;
          } else if (currentTags['height']) {
            height = parseFloat(currentTags['height']) || 10;
            stories = Math.max(1, Math.round(height / 3.5));
          } else {
            const h = stringHash(currentWayId);
            stories = (h % 4) + 1;
            height = stories * 3.2 + (h % 3);
          }

          const palette = ['#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#78716c', '#a8a29e', '#38bdf8', '#fbbf24'];
          const color = palette[stringHash(currentWayId) % palette.length];

          buildings.push({
            id: currentWayId,
            name: currentTags['name'],
            points,
            height,
            stories,
            color,
            minX, maxX, minZ, maxZ,
          });
        }
        // Highways / Roads
        else if (currentTags['highway']) {
          const hwType = currentTags['highway'];
          let width = 6;
          let isMajor = false;

          switch (hwType) {
            case 'motorway':
            case 'trunk':
            case 'primary':
              width = 14;
              isMajor = true;
              break;
            case 'secondary':
            case 'tertiary':
              width = 10;
              isMajor = true;
              break;
            case 'residential':
            case 'unclassified':
            case 'service':
            default:
              width = 5;
              isMajor = false;
              break;
          }

          roads.push({
            id: currentWayId,
            name: currentTags['name'],
            points,
            width,
            type: hwType,
            isMajor,
            minX, maxX, minZ, maxZ,
          });
        }
        // Waterways (Gomti River)
        else if (currentTags['waterway'] || currentTags['natural'] === 'water') {
          const isPolygon = points[0].x === points[points.length - 1].x && points[0].z === points[points.length - 1].z;
          let width = 30;
          if (currentTags['name']?.toLowerCase().includes('gomti')) width = 70;

          waterways.push({
            id: currentWayId,
            name: currentTags['name'],
            points,
            width,
            isPolygon,
            minX, maxX, minZ, maxZ,
          });
        }
        // Green areas / Parks
        else if (currentTags['leisure'] === 'park' || currentTags['landuse'] === 'grass' || currentTags['landuse'] === 'forest' || currentTags['natural'] === 'wood') {
          greenAreas.push({
            id: currentWayId,
            name: currentTags['name'],
            points,
            type: currentTags['leisure'] || currentTags['landuse'] || currentTags['natural'] || 'park',
            minX, maxX, minZ, maxZ,
          });
        }
      }
    }
  }

  console.log(`Extracted: ${buildings.length} bldgs, ${roads.length} roads, ${waterways.length} water, ${greenAreas.length} green, ${landmarks.length} landmarks.`);

  // Step 3: Generate Global Overview Layer (LOD 0)
  console.log('Step 3: Creating Global City Overview (LOD 0)...');
  
  const majorRoadsLOD0 = roads.filter(r => r.isMajor);
  const majorWaterLOD0 = waterways;
  const majorGreenLOD0 = greenAreas.filter(g => Math.abs(g.maxX - g.minX) > 100 || Math.abs(g.maxZ - g.minZ) > 100);

  // Group building density centroids for LOD 0 city footprint
  const bldgDensityBlocks: Array<{ x: number; z: number; count: number; avgHeight: number }> = [];
  const blockSize = 1000; // 1km density block

  const densityMap = new Map<string, { sumX: number; sumZ: number; count: number; sumH: number }>();
  for (const b of buildings) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const key = `${Math.floor(cx / blockSize)}_${Math.floor(cz / blockSize)}`;
    if (!densityMap.has(key)) {
      densityMap.set(key, { sumX: 0, sumZ: 0, count: 0, sumH: 0 });
    }
    const d = densityMap.get(key)!;
    d.sumX += cx;
    d.sumZ += cz;
    d.count++;
    d.sumH += b.height;
  }

  for (const [_, d] of densityMap.entries()) {
    bldgDensityBlocks.push({
      x: d.sumX / d.count,
      z: d.sumZ / d.count,
      count: d.count,
      avgHeight: d.sumH / d.count,
    });
  }

  const overviewData = {
    majorRoads: majorRoadsLOD0,
    waterways: majorWaterLOD0,
    greenAreas: majorGreenLOD0,
    buildingDensityBlocks: bldgDensityBlocks,
    landmarks: landmarks.slice(0, 30),
  };

  const outputDir = path.join(process.cwd(), 'public', 'lucknow_tiles');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, 'overview.json'), JSON.stringify(overviewData, null, 0));

  // Step 4: Spatial Tiling & Bucket Assignment for Multi-LOD Tiles
  console.log(`Step 4: Distributing elements into ${TILE_SIZE}m spatial tiles...`);

  interface TileData {
    id: string;
    tileX: number;
    tileZ: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    center: { x: number; z: number };
    lod1: {
      buildings: BuildingFeature[];
      roads: RoadFeature[];
      waterways: WaterwayFeature[];
      greenAreas: GreenFeature[];
    };
    lod2: {
      buildings: BuildingFeature[];
      roads: RoadFeature[];
      waterways: WaterwayFeature[];
      greenAreas: GreenFeature[];
      trees: TreePoint[];
    };
    landmarks: LandmarkFeature[];
  }

  const tileMap = new Map<string, TileData>();

  function getOrCreateTile(tx: number, tz: number): TileData {
    const key = `tile_${tx}_${tz}`;
    if (!tileMap.has(key)) {
      const minX = tx * TILE_SIZE;
      const maxX = (tx + 1) * TILE_SIZE;
      const minZ = tz * TILE_SIZE;
      const maxZ = (tz + 1) * TILE_SIZE;
      tileMap.set(key, {
        id: key,
        tileX: tx,
        tileZ: tz,
        bounds: { minX, maxX, minZ, maxZ },
        center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
        lod1: { buildings: [], roads: [], waterways: [], greenAreas: [] },
        lod2: { buildings: [], roads: [], waterways: [], greenAreas: [], trees: [] },
        landmarks: [],
      });
    }
    return tileMap.get(key)!;
  }

  // Assign features to tile LOD levels
  for (const b of buildings) {
    const tMinX = Math.floor(b.minX / TILE_SIZE);
    const tMaxX = Math.floor(b.maxX / TILE_SIZE);
    const tMinZ = Math.floor(b.minZ / TILE_SIZE);
    const tMaxZ = Math.floor(b.maxZ / TILE_SIZE);

    for (let tx = tMinX; tx <= tMaxX; tx++) {
      for (let tz = tMinZ; tz <= tMaxZ; tz++) {
        const tile = getOrCreateTile(tx, tz);
        tile.lod2.buildings.push(b);
        if (b.height > 12 || b.stories > 3) {
          tile.lod1.buildings.push(b);
        }
      }
    }
  }

  for (const r of roads) {
    const tMinX = Math.floor(r.minX / TILE_SIZE);
    const tMaxX = Math.floor(r.maxX / TILE_SIZE);
    const tMinZ = Math.floor(r.minZ / TILE_SIZE);
    const tMaxZ = Math.floor(r.maxZ / TILE_SIZE);

    for (let tx = tMinX; tx <= tMaxX; tx++) {
      for (let tz = tMinZ; tz <= tMaxZ; tz++) {
        const tile = getOrCreateTile(tx, tz);
        tile.lod2.roads.push(r);
        if (r.isMajor) tile.lod1.roads.push(r);
      }
    }
  }

  for (const w of waterways) {
    const tMinX = Math.floor(w.minX / TILE_SIZE);
    const tMaxX = Math.floor(w.maxX / TILE_SIZE);
    const tMinZ = Math.floor(w.minZ / TILE_SIZE);
    const tMaxZ = Math.floor(w.maxZ / TILE_SIZE);

    for (let tx = tMinX; tx <= tMaxX; tx++) {
      for (let tz = tMinZ; tz <= tMaxZ; tz++) {
        const tile = getOrCreateTile(tx, tz);
        tile.lod2.waterways.push(w);
        tile.lod1.waterways.push(w);
      }
    }
  }

  for (const g of greenAreas) {
    const tMinX = Math.floor(g.minX / TILE_SIZE);
    const tMaxX = Math.floor(g.maxX / TILE_SIZE);
    const tMinZ = Math.floor(g.minZ / TILE_SIZE);
    const tMaxZ = Math.floor(g.maxZ / TILE_SIZE);

    for (let tx = tMinX; tx <= tMaxX; tx++) {
      for (let tz = tMinZ; tz <= tMaxZ; tz++) {
        const tile = getOrCreateTile(tx, tz);
        tile.lod2.greenAreas.push(g);
        tile.lod1.greenAreas.push(g);

        const count = Math.min(25, Math.floor(Math.abs(g.maxX - g.minX) * Math.abs(g.maxZ - g.minZ) / 400));
        for (let i = 0; i < count; i++) {
          const hash = stringHash(`${g.id}_tree_${i}`);
          const rx = g.minX + (hash % 1000) / 1000 * (g.maxX - g.minX);
          const rz = g.minZ + ((hash >> 3) % 1000) / 1000 * (g.maxZ - g.minZ);
          if (rx >= tile.bounds.minX && rx <= tile.bounds.maxX && rz >= tile.bounds.minZ && rz <= tile.bounds.maxZ) {
            tile.lod2.trees.push({
              x: rx,
              y: 0,
              z: rz,
              scale: 0.8 + (hash % 50) / 100,
            });
          }
        }
      }
    }
  }

  for (const lm of landmarks) {
    const tx = Math.floor(lm.x / TILE_SIZE);
    const tz = Math.floor(lm.z / TILE_SIZE);
    getOrCreateTile(tx, tz).landmarks.push(lm);
  }

  // Calculate city spatial extent bounding box
  let globalMinX = Infinity, globalMaxX = -Infinity;
  let globalMinZ = Infinity, globalMaxZ = -Infinity;

  for (const b of buildings) {
    globalMinX = Math.min(globalMinX, b.minX);
    globalMaxX = Math.max(globalMaxX, b.maxX);
    globalMinZ = Math.min(globalMinZ, b.minZ);
    globalMaxZ = Math.max(globalMaxZ, b.maxZ);
  }

  // Export tile JSONs & manifest
  const manifestTiles: Array<{
    id: string;
    tileX: number;
    tileZ: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    center: { x: number; z: number };
    bldgsLOD1: number;
    bldgsLOD2: number;
    roadsCount: number;
    treesCount: number;
  }> = [];

  let exportedTiles = 0;
  for (const [tileId, tile] of tileMap.entries()) {
    if (tile.lod2.buildings.length === 0 && tile.lod2.roads.length === 0 && tile.lod2.waterways.length === 0 && tile.lod2.greenAreas.length === 0) {
      continue;
    }

    const tileFilePath = path.join(outputDir, `${tileId}.json`);
    fs.writeFileSync(tileFilePath, JSON.stringify(tile, null, 0));

    manifestTiles.push({
      id: tile.id,
      tileX: tile.tileX,
      tileZ: tile.tileZ,
      bounds: tile.bounds,
      center: tile.center,
      bldgsLOD1: tile.lod1.buildings.length,
      bldgsLOD2: tile.lod2.buildings.length,
      roadsCount: tile.lod2.roads.length,
      treesCount: tile.lod2.trees.length,
    });
    exportedTiles++;
  }

  const manifest = {
    version: '2.0',
    generatedAt: new Date().toISOString(),
    tileSize: TILE_SIZE,
    centerLat,
    centerLon,
    bounds: { minLat, maxLat, minLon, maxLon },
    spatialExtent: { minX: globalMinX, maxX: globalMaxX, minZ: globalMinZ, maxZ: globalMaxZ },
    totalTiles: manifestTiles.length,
    tiles: manifestTiles,
  };

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`🎉 MULTI-SCALE LUCKNOW PREPROCESSING COMPLETE! Exported Overview + ${exportedTiles} spatial tiles to public/lucknow_tiles/`);
}

processOSM().catch(console.error);
