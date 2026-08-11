import * as fs from 'fs';
import * as path from 'path';

const FULL_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const OLD_DIR = path.join(process.cwd(), 'public/lucknow_tiles');

const manifestPath = path.join(FULL_DIR, 'manifest.json');
const overviewPath = path.join(FULL_DIR, 'overview.json');

console.log("=== 1. MANIFEST & OVERVIEW INTEGRITY ===");
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const overview = JSON.parse(fs.readFileSync(overviewPath, 'utf8'));

console.log(`Manifest Version: ${manifest.version}`);
console.log(`Manifest Center: Lat ${manifest.centerLat}, Lon ${manifest.centerLon}`);
console.log(`Manifest Tile Count: ${manifest.totalTiles}`);
console.log(`Manifest Tiles Array Length: ${manifest.tiles.length}`);
console.log(`Overview Major Roads: ${overview.majorRoads.length}`);
console.log(`Overview Waterways: ${overview.waterways.length}`);
console.log(`Overview Green Areas: ${overview.greenAreas.length}`);
console.log(`Overview Density Blocks: ${overview.buildingDensityBlocks.length}`);

console.log("\n=== 2. TILE SAMPLING & VALIDATION (25 RANDOM TILES) ===");
const allTileFiles = fs.readdirSync(FULL_DIR).filter(f => f.startsWith('tile_') && f.endsWith('.json'));
console.log(`Total Tile JSON Files on Disk: ${allTileFiles.length}`);

// Sample 25 tiles evenly spread out across the array
const sampledFiles: string[] = [];
const step = Math.floor(allTileFiles.length / 25);
for (let i = 0; i < 25; i++) {
  sampledFiles.push(allTileFiles[i * step]);
}

let jsonErrors = 0;
let outOfBoundsCoords = 0;
const tileStats: { file: string; bldgsLOD1: number; bldgsLOD2: number; roads: number; places: number }[] = [];

// Bounding box in local X/Z coordinates centered around (0,0) at (CENTER_LON, CENTER_LAT)
// CENTER_LON = 80.95005255000001, CENTER_LAT = 26.84997035
// BBOX_FULL = [80.7501301, 26.6500106, 81.149975, 27.0499301]
const mPerLat = 111320;
const mPerLon = 111320 * Math.cos((26.84997035 * Math.PI) / 180);

const minX = (80.7501301 - 80.95005255) * mPerLon;
const maxX = (81.149975 - 80.95005255) * mPerLon;
const minZ = -(27.0499301 - 26.84997035) * mPerLat; // Note: maxLat gives minZ in inverted Z coordinates
const maxZ = -(26.6500106 - 26.84997035) * mPerLat;

console.log(`Target Bounds in Projected Meters: X [${minX.toFixed(1)}, ${maxX.toFixed(1)}], Z [${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);

for (const file of sampledFiles) {
  try {
    const raw = fs.readFileSync(path.join(FULL_DIR, file), 'utf8');
    const tile = JSON.parse(raw);

    let bldgsLOD1 = tile.lod1?.buildings?.length || 0;
    let bldgsLOD2 = tile.lod2?.buildings?.length || 0;
    let roads = tile.lod2?.roads?.length || 0;
    let places = tile.lod2?.places?.length || 0;

    tileStats.push({ file, bldgsLOD1, bldgsLOD2, roads, places });

    // Check building points
    for (const bldg of (tile.lod2?.buildings || [])) {
      for (const pt of (bldg.points || [])) {
        if (pt.x < minX - 1000 || pt.x > maxX + 1000 || pt.z < minZ - 1000 || pt.z > maxZ + 1000) {
          outOfBoundsCoords++;
        }
      }
    }
  } catch (err) {
    jsonErrors++;
    console.error(`Error parsing ${file}:`, err);
  }
}

console.log(`Sampled 25 Tiles Verification:`);
console.log(`  - JSON Errors: ${jsonErrors}`);
console.log(`  - Out-of-Bounds Coordinate Violations: ${outOfBoundsCoords}`);

console.log("\n=== 3. GRID & COORDINATE SYSTEM ALIGNMENT WITH OLD LUCKNOW_TILES ===");
const oldTileFiles = fs.readdirSync(OLD_DIR).filter(f => f.startsWith('tile_') && f.endsWith('.json'));
let matchingGridTiles = 0;
let checkedOldTiles = 0;

for (const oldFile of oldTileFiles.slice(0, 50)) {
  checkedOldTiles++;
  if (fs.existsSync(path.join(FULL_DIR, oldFile))) {
    matchingGridTiles++;
  }
}
console.log(`Checked 50 old tiles: ${matchingGridTiles}/${checkedOldTiles} exist in new overture_tiles_full!`);

console.log("\n=== 4. BUILDING COUNTS IN DENSE / MEDIUM / SPARSE TILES ===");
// Sort sampled tiles by bldgsLOD2 count
tileStats.sort((a, b) => b.bldgsLOD2 - a.bldgsLOD2);
console.log(`Dense Tile Sample (${tileStats[0].file}): LOD1=${tileStats[0].bldgsLOD1}, LOD2=${tileStats[0].bldgsLOD2}, Roads=${tileStats[0].roads}`);
console.log(`Medium Tile Sample (${tileStats[12].file}): LOD1=${tileStats[12].bldgsLOD1}, LOD2=${tileStats[12].bldgsLOD2}, Roads=${tileStats[12].roads}`);
console.log(`Sparse Tile Sample (${tileStats[24].file}): LOD1=${tileStats[24].bldgsLOD1}, LOD2=${tileStats[24].bldgsLOD2}, Roads=${tileStats[24].roads}`);

console.log("\n=== 5. SIMULTANEOUS ACTIVE BUILDING ESTIMATION AT DIFFERENT ZOOMS ===");
// In TileStreamer, radius around camera determines loaded tiles:
// Street level (Zoom high, small camera range): ~5-9 active tiles
// Neighborhood level: ~25 active tiles
// City level (Top view / LOD1): ~81-121 active tiles (or reading overview.json)

const avgBldgsLOD2 = tileStats.reduce((sum, t) => sum + t.bldgsLOD2, 0) / tileStats.length;
const avgBldgsLOD1 = tileStats.reduce((sum, t) => sum + t.bldgsLOD1, 0) / tileStats.length;

console.log(`Average LOD2 buildings per tile (sample): ${avgBldgsLOD2.toFixed(1)}`);
console.log(`Average LOD1 buildings per tile (sample): ${avgBldgsLOD1.toFixed(1)}`);

console.log(`Estimated Active Buildings:`);
console.log(`  - Street Level (9 tiles @ LOD2): ~${Math.round(9 * avgBldgsLOD2)} buildings`);
console.log(`  - Neighborhood Level (25 tiles @ LOD2): ~${Math.round(25 * avgBldgsLOD2)} buildings`);
console.log(`  - City View (Top Map using overview.json / LOD1 across 81 tiles): ~${Math.round(81 * avgBldgsLOD1)} buildings (or 0 if overview density plane is used)`);

console.log("\n=== PRE-SWITCH VALIDATION COMPLETE ===");
