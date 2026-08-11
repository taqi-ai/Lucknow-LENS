import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline';

// --- CONFIGURATION ---
const USE_FULL_BBOX = true; // Toggle this to true when ready for full generation

// Full Lucknow BBox
const BBOX_FULL = [80.7501301, 26.6500106, 81.149975, 27.0499301];
// Hazratganj Test BBox
const BBOX_TEST = [80.935, 26.840, 80.955, 26.855];

const BBOX = USE_FULL_BBOX ? BBOX_FULL : BBOX_TEST;

const TILE_SIZE = 500;
const OUTPUT_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const DATA_DIR = path.join(process.cwd(), 'data');

// Exact center from manifest.json to perfectly align with existing tiles
const CENTER_LAT = 26.84997035;
const CENTER_LON = 80.95005255000001;
const mPerLat = 111320;
const mPerLon = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

// For density calculation (overview)
const densityGridSize = 200; // split the bbox into a 200x200 grid for density blocks
const densityGrid: number[][] = Array.from({ length: densityGridSize }, () => Array(densityGridSize).fill(0));
const minLon = BBOX_FULL[0], minLat = BBOX_FULL[1], maxLon = BBOX_FULL[2], maxLat = BBOX_FULL[3];

// Stats
const stats = {
  buildingsProcessed: 0,
  roadsProcessed: 0,
  placesProcessed: 0,
  waterProcessed: 0,
  landUseProcessed: 0,
  tilesGenerated: 0
};

// Global Tile Map (we still need this in RAM, but it's much smaller than raw GeoJSON)
// To prevent RAM exhaustion, we could flush tiles to disk, but for Lucknow (5000 tiles), 
// keeping the organized output schema in memory (which omits raw verbose properties) should take < 300MB.
const tiles = new Map<string, any>();

const overviewData = {
  majorRoads: [] as any[],
  waterways: [] as any[],
  greenAreas: [] as any[],
  buildingDensityBlocks: [] as any[]
};

// --- HELPERS ---

function project(lon: number, lat: number) {
  const x = (lon - CENTER_LON) * mPerLon;
  const z = -(lat - CENTER_LAT) * mPerLat;
  return { x, z };
}

function getTileIndex(x: number, z: number) {
  const tileX = Math.floor(x / TILE_SIZE);
  const tileZ = Math.floor(z / TILE_SIZE);
  return { tileX, tileZ, id: `tile_${tileX}_${tileZ}` };
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTile(x: number, z: number) {
  const { tileX, tileZ, id } = getTileIndex(x, z);
  if (!tiles.has(id)) {
    tiles.set(id, {
      id, tileX, tileZ,
      bounds: {
        minX: tileX * TILE_SIZE,
        maxX: (tileX + 1) * TILE_SIZE,
        minZ: tileZ * TILE_SIZE,
        maxZ: (tileZ + 1) * TILE_SIZE,
      },
      center: {
        x: tileX * TILE_SIZE + TILE_SIZE / 2,
        z: tileZ * TILE_SIZE + TILE_SIZE / 2,
      },
      lod1: { buildings: [], roads: [], waterways: [], greenAreas: [] },
      lod2: { buildings: [], roads: [], places: [], waterways: [], greenAreas: [], trees: [] },
      counts: { bldgsLOD1: 0, bldgsLOD2: 0, roadsCount: 0, treesCount: 0 }
    });
  }
  return tiles.get(id)!;
}

function trackDensity(lon: number, lat: number) {
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return;
  const gridX = Math.floor(((lon - minLon) / (maxLon - minLon)) * densityGridSize);
  const gridZ = Math.floor(((maxLat - lat) / (maxLat - minLat)) * densityGridSize); // invert lat for Z
  if (gridX >= 0 && gridX < densityGridSize && gridZ >= 0 && gridZ < densityGridSize) {
    densityGrid[gridZ][gridX]++;
  }
}

function reportMemory() {
  const used = process.memoryUsage();
  return `RAM: ${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`;
}

// --- STREAMING PARSER ---

async function processStream(filePath: string, type: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }
  
  console.log(`Processing stream: ${type} ...`);
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  const startTime = Date.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    count++;
    if (count % 50000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [${type}] Processed ${count} features | ${elapsed}s | ${reportMemory()}`);
    }

    try {
      const feat = JSON.parse(line);
      const props = feat.properties || {};
      const gType = feat.geometry?.type;
      
      let coords = [];
      if (gType === 'Polygon') coords = feat.geometry.coordinates[0];
      else if (gType === 'MultiPolygon') coords = feat.geometry.coordinates[0][0];
      else if (gType === 'LineString') coords = feat.geometry.coordinates;
      else if (gType === 'Point') coords = feat.geometry.coordinates;
      
      if (!coords || coords.length === 0) continue;

      if (type === 'building') {
        stats.buildingsProcessed++;
        if (coords.length < 3) continue;
        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const bldId = props.id || `bld-${Math.random()}`;
        const tile = getTile(points[0].x, points[0].z);
        
        // Use the first coord for density tracking
        trackDensity(coords[0][0], coords[0][1]);

        const hash = stringHash(bldId);
        const isLarge = props.level >= 3 || hash % 10 > 8; 
        let height = 12 + (hash % 15);
        if (props.height) height = props.height;
        else if (props.num_floors) height = props.num_floors * 3.5;

        const bldgObj = {
          id: bldId,
          points,
          height,
          stories: Math.ceil(height / 3.5),
          color: hash % 2 === 0 ? '#cbd5e1' : '#94a3b8'
        };

        tile.lod2.buildings.push(bldgObj);
        tile.counts.bldgsLOD2++;
        if (isLarge) {
          tile.lod1.buildings.push(bldgObj);
          tile.counts.bldgsLOD1++;
        }

      } else if (type === 'segment') {
        stats.roadsProcessed++;
        if (coords.length < 2) continue;
        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const tile = getTile(points[0].x, points[0].z);
        
        const hType = props.class || 'residential';
        const subtype = props.subtype || 'road';
        let width = 6;
        let isMajor = false;

        if (['motorway', 'primary', 'trunk'].includes(hType)) { width = 15; isMajor = true; }
        else if (['secondary'].includes(hType)) { width = 10; isMajor = true; }
        else if (['tertiary'].includes(hType)) { width = 8; isMajor = true; }
        else if (['path', 'footway', 'pedestrian'].includes(hType) || subtype === 'footpath') width = 2.5;

        const roadObj = {
          id: props.id || `road-${Math.random()}`,
          points,
          width,
          type: hType,
          isMajor
        };

        tile.lod2.roads.push(roadObj);
        tile.counts.roadsCount++;
        if (isMajor) {
          tile.lod1.roads.push(roadObj);
          overviewData.majorRoads.push(roadObj);
        }

      } else if (type === 'place') {
        stats.placesProcessed++;
        if (gType !== 'Point') continue;
        const pt = project(coords[0], coords[1]);
        const tile = getTile(pt.x, pt.z);
        
        const pType = props.categories?.primary || 'landmark';
        const placeObj = {
          id: props.id || `place-${Math.random()}`,
          name: props.names?.primary || 'Unknown',
          position: pt,
          type: pType
        };
        tile.lod2.places.push(placeObj);

      } else if (type === 'water') {
        stats.waterProcessed++;
        if (coords.length < 2) continue;
        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const tile = getTile(points[0].x, points[0].z);
        const obj = { id: props.id || `water-${Math.random()}`, points, width: 35, isPolygon: gType.includes('Polygon') };
        tile.lod2.waterways.push(obj);
        tile.lod1.waterways.push(obj);
        overviewData.waterways.push(obj);

      } else if (type === 'land_use') {
        stats.landUseProcessed++;
        if (coords.length < 3) continue;
        const subtype = props.subtype;
        if (!['park', 'forest', 'grass', 'nature_reserve'].includes(subtype)) continue;

        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const tile = getTile(points[0].x, points[0].z);
        const obj = { id: props.id || `park-${Math.random()}`, points };
        tile.lod2.greenAreas.push(obj);
        tile.lod1.greenAreas.push(obj);
        overviewData.greenAreas.push(obj);

        if (gType.includes('Polygon')) {
           for(let i=0; i < 5; i++) {
              tile.lod2.trees.push({
                 x: points[0].x + (Math.random() * 20 - 10),
                 y: 0,
                 z: points[0].z + (Math.random() * 20 - 10),
                 scale: 0.8 + Math.random() * 0.5
              });
              tile.counts.treesCount++;
           }
        }
      }
    } catch (err) {
      // ignore parse errors for a single line
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${type}] Finished. Total: ${count} features in ${elapsed}s`);
}

// --- MAIN RUNNER ---

async function run() {
  console.log(`🚀 Starting Overture Generation (${USE_FULL_BBOX ? 'FULL LUCKNOW' : 'HAZRATGANJ TEST'})`);
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const bboxStr = BBOX.join(',');
  const downloads = [
    { name: 'buildings', type: 'building' },
    { name: 'transportation', type: 'segment' },
    { name: 'places', type: 'place' },
    { name: 'water', type: 'water' },
    { name: 'land_use', type: 'land_use' }
  ];

  console.log('\n--- 1. DOWNLOADING DATA (GEOJSONSEQ) ---');
  for (const item of downloads) {
    const outFile = path.join(DATA_DIR, `overture_${item.name}.geojsonseq`);
    if (!fs.existsSync(outFile) || USE_FULL_BBOX) {
      console.log(`Downloading ${item.name}...`);
      try {
        // -f geojsonseq outputs Newline Delimited GeoJSON, perfect for streaming
        execSync(`overturemaps download --bbox ${bboxStr} -f geojsonseq -t ${item.type} -o "${outFile}"`, { stdio: 'inherit' });
      } catch (err) {
        console.warn(`Failed to download ${item.name}.`);
      }
    } else {
      console.log(`Using cached ${item.name}...`);
    }
  }

  console.log('\n--- 2. PROCESSING DATA STREAM ---');
  await processStream(path.join(DATA_DIR, 'overture_buildings.geojsonseq'), 'building');
  await processStream(path.join(DATA_DIR, 'overture_transportation.geojsonseq'), 'segment');
  await processStream(path.join(DATA_DIR, 'overture_places.geojsonseq'), 'place');
  await processStream(path.join(DATA_DIR, 'overture_water.geojsonseq'), 'water');
  await processStream(path.join(DATA_DIR, 'overture_land_use.geojsonseq'), 'land_use');

  console.log('\n--- 3. CALCULATING DENSITY OVERVIEW ---');
  for (let z = 0; z < densityGridSize; z++) {
    for (let x = 0; x < densityGridSize; x++) {
      if (densityGrid[z][x] > 0) {
        // Convert grid cell back to projection coordinates
        const cellLon = minLon + (x / densityGridSize) * (maxLon - minLon);
        const cellLat = maxLat - (z / densityGridSize) * (maxLat - minLat); // inverted Lat
        const pt = project(cellLon, cellLat);
        
        overviewData.buildingDensityBlocks.push({
          x: pt.x,
          z: pt.z,
          density: Math.min(densityGrid[z][x] / 100, 1.0) // normalized density 0-1
        });
      }
    }
  }

  console.log('\n--- 4. WRITING OUTPUT FILES ---');
  // Write Overview
  fs.writeFileSync(path.join(OUTPUT_DIR, 'overview.json'), JSON.stringify(overviewData));
  console.log(`Wrote overview.json with ${overviewData.majorRoads.length} major roads, ${overviewData.buildingDensityBlocks.length} density blocks.`);

  // Write Manifest
  const manifestTiles = [];
  let tilesWritten = 0;
  for (const [id, tile] of tiles.entries()) {
    // Only write tiles that actually have data to save disk space
    if (tile.counts.bldgsLOD2 > 0 || tile.counts.roadsCount > 0 || tile.counts.treesCount > 0 || tile.lod2.waterways.length > 0) {
      
      const cleanTile = {
        id: tile.id,
        lod1: tile.lod1,
        lod2: tile.lod2
      };
      
      fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.json`), JSON.stringify(cleanTile));
      tilesWritten++;

      manifestTiles.push({
        id: tile.id,
        tileX: tile.tileX,
        tileZ: tile.tileZ,
        bounds: tile.bounds,
        center: tile.center,
        bldgsLOD1: tile.counts.bldgsLOD1,
        bldgsLOD2: tile.counts.bldgsLOD2,
        roadsCount: tile.counts.roadsCount,
        treesCount: tile.counts.treesCount
      });
    }
  }

  const manifest = {
    version: "2.0",
    generatedAt: new Date().toISOString(),
    tileSize: TILE_SIZE,
    centerLat: CENTER_LAT,
    centerLon: CENTER_LON,
    bounds: {
      minLat: BBOX[1], maxLat: BBOX[3],
      minLon: BBOX[0], maxLon: BBOX[2]
    },
    totalTiles: tilesWritten,
    tiles: manifestTiles
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Wrote manifest.json with ${tilesWritten} active tiles.`);

  console.log('\n--- SUMMARY ---');
  console.log(`Buildings: ${stats.buildingsProcessed}`);
  console.log(`Roads: ${stats.roadsProcessed}`);
  console.log(`Places: ${stats.placesProcessed}`);
  console.log(`Waterways: ${stats.waterProcessed}`);
  console.log(`Land Use: ${stats.landUseProcessed}`);
  console.log(`Total Tiles Written: ${tilesWritten}`);
  console.log(`Final Memory: ${reportMemory()}`);
}

run().catch(console.error);
