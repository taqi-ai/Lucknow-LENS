import fs from 'fs';
import path from 'path';

const TILES_DIR = path.join(process.cwd(), 'public/overture_tiles_full');
const OUT_FILE = path.join(TILES_DIR, 'city_massing.json');

const CELL_SIZE = 200; // 200 meters

interface CellData {
  count: number;
  totalHeight: number;
  maxHeight: number;
  sumX: number;
  sumZ: number;
}

async function main() {
  console.log('Generating multi-scale city massing...');
  
  if (!fs.existsSync(TILES_DIR)) {
    console.error('Directory not found:', TILES_DIR);
    return;
  }

  const files = fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.json') && f !== 'overview.json' && f !== 'city_massing.json');
  
  const grid = new Map<string, CellData>();
  
  let totalProcessed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const data = JSON.parse(fs.readFileSync(path.join(TILES_DIR, file), 'utf8'));
    
    // Process LOD2 buildings (which has all buildings)
    if (data.lod2 && data.lod2.buildings) {
      for (const bldg of data.lod2.buildings) {
        if (!bldg.points || bldg.points.length === 0) continue;
        
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        for (const pt of bldg.points) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.z < minZ) minZ = pt.z;
          if (pt.z > maxZ) maxZ = pt.z;
        }
        
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        
        const gridX = Math.floor(cx / CELL_SIZE);
        const gridZ = Math.floor(cz / CELL_SIZE);
        const key = `${gridX}_${gridZ}`;
        
        const h = bldg.height || 10;
        
        if (!grid.has(key)) {
          grid.set(key, { count: 0, totalHeight: 0, maxHeight: 0, sumX: 0, sumZ: 0 });
        }
        
        const cell = grid.get(key)!;
        cell.count++;
        cell.totalHeight += h;
        cell.sumX += cx;
        cell.sumZ += cz;
        if (h > cell.maxHeight) cell.maxHeight = h;
        
        totalProcessed++;
      }
    }
    
    if ((i + 1) % 500 === 0) {
      console.log(`Processed ${i + 1}/${files.length} tiles...`);
    }
  }
  
  console.log(`Processed ${totalProcessed} total buildings.`);
  
  const blocks = [];
  
  for (const [key, cell] of grid.entries()) {
    // We compute average center rather than grid center to be slightly more organic
    const cx = cell.sumX / cell.count;
    const cz = cell.sumZ / cell.count;
    const avgH = cell.totalHeight / cell.count;
    
    // Map density 0-1 (e.g. 50 buildings in a 200x200m cell is quite dense)
    const density = Math.min(cell.count / 80, 1.0);
    
    blocks.push({
      x: Math.round(cx * 10) / 10,
      z: Math.round(cz * 10) / 10,
      density: Math.round(density * 100) / 100,
      avgHeight: Math.round(avgH * 10) / 10,
      maxHeight: Math.round(cell.maxHeight * 10) / 10
    });
  }
  
  console.log(`Generated ${blocks.length} city massing blocks.`);
  
  fs.writeFileSync(OUT_FILE, JSON.stringify(blocks));
  console.log(`Saved to ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB)`);
}

main().catch(console.error);
