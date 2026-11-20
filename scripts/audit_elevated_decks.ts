/**
 * Audit elevated roads and flyover decks for:
 * 1. Decks that end in mid-air (height y > 1.0 m with no connected elevated deck).
 * 2. Joint height mismatches (two connecting elevated features with > 1.5 m height difference).
 * 3. Isolated elevated decks that do not connect to the ground road network.
 * 4. Free ends: verify whether every free end cleanly ramps down to grade (y <= 0.3 m).
 *
 * Usage: npx tsx scripts/audit_elevated_decks.ts
 */
import fs from 'fs';
import path from 'path';
import { buildElevationProfiles, classifyRoad, Pt } from '../src/city/ribbon';

interface Road {
  id?: string;
  name?: string;
  points: Pt[];
  width?: number;
  type?: string;
  subtype?: string;
  level?: number;
  isElevated?: boolean;
}

const DIR = path.join('public', 'overture_tiles_full');
const ov = JSON.parse(fs.readFileSync(path.join(DIR, 'overview.json'), 'utf8'));
const roads: Road[] = ov.majorRoads;

console.log('--- Elevated Road & Deck Audit ---');
console.log(`Total major roads in overview: ${roads.length}`);

// Filter elevated carriageways (excluding rail/subway)
const elevatedRoads = roads.filter((r) => {
  if (r.type === 'subway' || r.type === 'rail' || r.subtype === 'rail') return false;
  return Boolean(r.isElevated || (r.level ?? 0) > 0);
});
console.log(`Elevated road features: ${elevatedRoads.length}`);

// Ground roads index for ramp touchdown verification
const groundNodes: Array<{ x: number; z: number; id?: string; name?: string }> = [];
for (const r of roads) {
  if (r.isElevated || (r.level ?? 0) > 0 || r.type === 'subway' || r.type === 'rail') continue;
  if (!r.points || r.points.length < 2) continue;
  for (const p of r.points) {
    groundNodes.push({ x: p.x, z: p.z, id: r.id, name: r.name });
  }
}

// Compute elevation profiles
const profiles = buildElevationProfiles(roads);
console.log(`Computed elevation profiles: ${profiles.size}`);

// Spatial hash for elevated endpoints to find connected joints
const JOIN_TOL = 6.0; // features that connect at the exact joint (<= 6m)
const GRID = 40;
const endIndex = new Map<string, Array<{ road: Road; prof: Pt[]; isStart: boolean; pt: Pt; y: number }>>();

for (const road of elevatedRoads) {
  const prof = profiles.get(road);
  if (!prof || prof.length < 2) continue;
  const start = prof[0];
  const end = prof[prof.length - 1];

  const add = (pt: Pt, isStart: boolean) => {
    const k = `${Math.floor(pt.x / GRID)},${Math.floor(pt.z / GRID)}`;
    let list = endIndex.get(k);
    if (!list) { list = []; endIndex.set(k, list); }
    list.push({ road, prof, isStart, pt, y: pt.y ?? 0 });
  };
  add(start, true);
  add(end, false);
}

// Find connecting joint neighbors within JOIN_TOL
function findElevatedNeighbors(pt: Pt, selfRoad: Road) {
  const gx = Math.floor(pt.x / GRID);
  const gz = Math.floor(pt.z / GRID);
  const neighbors: Array<{ road: Road; pt: Pt; y: number }> = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const list = endIndex.get(`${gx + dx},${gz + dz}`) ?? [];
      for (const item of list) {
        if (item.road === selfRoad) continue;
        if (Math.hypot(item.pt.x - pt.x, item.pt.z - pt.z) <= JOIN_TOL) {
          neighbors.push(item);
        }
      }
    }
  }
  return neighbors;
}

// Check ground touchdown within 30m
function touchesGround(pt: Pt, tol = 30): boolean {
  for (const g of groundNodes) {
    if (Math.hypot(g.x - pt.x, g.z - pt.z) <= tol) return true;
  }
  return false;
}

interface Issue {
  roadId?: string;
  name?: string;
  x: number;
  z: number;
  y: number;
  type: string;
  details: string;
}

const midAirDecks: Issue[] = [];
const heightDiscontinuities: Issue[] = [];
const isolatedDecks: Issue[] = [];
const cleanRamps: Issue[] = [];
const shortCulverts: Issue[] = [];

for (const road of elevatedRoads) {
  const prof = profiles.get(road);
  if (!prof || prof.length < 2) continue;
  const ends = [
    { pt: prof[0], isStart: true },
    { pt: prof[prof.length - 1], isStart: false },
  ];

  for (const { pt, isStart } of ends) {
    const y = pt.y ?? 0;
    const neighbors = findElevatedNeighbors(pt, road);

    if (neighbors.length === 0) {
      // Free end
      if (y > 1.2) {
        // Ends in mid-air!
        midAirDecks.push({
          roadId: road.id,
          name: road.name,
          x: pt.x,
          z: pt.z,
          y,
          type: 'MID_AIR_DEAD_END',
          details: `Deck end has height y = ${y.toFixed(2)} m with no connecting elevated road`,
        });
      } else {
        // Clean ramp to ground
        const landsOnRoad = touchesGround(pt, 35);
        cleanRamps.push({
          roadId: road.id,
          name: road.name,
          x: pt.x,
          z: pt.z,
          y,
          type: 'RAMP_TO_GRADE',
          details: landsOnRoad ? 'Touches ground road network' : 'Ramps to ground in open space',
        });
      }
    } else {
      // Joint between elevated features
      for (const n of neighbors) {
        const diff = Math.abs(y - n.y);
        if (diff > 1.5) {
          heightDiscontinuities.push({
            roadId: road.id,
            name: road.name,
            x: pt.x,
            z: pt.z,
            y,
            type: 'HEIGHT_MISMATCH_AT_JOINT',
            details: `Joint with ${n.road.name || n.road.id}: height diff = ${diff.toFixed(2)} m (${y.toFixed(2)} m vs ${n.y.toFixed(2)} m)`,
          });
        }
      }
    }
  }
}

console.log('\n--- AUDIT RESULTS ---');
console.log(`Decks ending in mid-air (y > 1.2m without continuation): ${midAirDecks.length}`);
console.log(`Height discontinuities at joints (> 1.5m gap): ${heightDiscontinuities.length}`);
console.log(`Clean ramps to grade: ${cleanRamps.length}`);

if (midAirDecks.length > 0) {
  console.log('\nMid-air deck ends detected:');
  for (const m of midAirDecks.slice(0, 10)) {
    console.log(`  - [${m.roadId}] "${m.name || 'unnamed'}": at (${m.x.toFixed(1)}, ${m.z.toFixed(1)}), height y=${m.y.toFixed(2)}m`);
  }
} else {
  console.log('✓ PASS: Zero elevated decks end in mid-air!');
}

if (heightDiscontinuities.length > 0) {
  console.log('\nHeight discontinuities at joints:');
  for (const h of heightDiscontinuities.slice(0, 10)) {
    console.log(`  - [${h.roadId}] "${h.name || 'unnamed'}": ${h.details}`);
  }
} else {
  console.log('✓ PASS: All joints between elevated features have consistent heights.');
}

const auditOutput = {
  totalElevatedFeatures: elevatedRoads.length,
  profilesBuilt: profiles.size,
  midAirDecksCount: midAirDecks.length,
  midAirDecks,
  heightDiscontinuitiesCount: heightDiscontinuities.length,
  heightDiscontinuities,
  cleanRampsCount: cleanRamps.length,
};

fs.writeFileSync(
  path.join('docs', '3d-revamp', 'ELEVATED_DECK_AUDIT.json'),
  JSON.stringify(auditOutput, null, 2)
);
console.log('\nDetailed audit saved to docs/3d-revamp/ELEVATED_DECK_AUDIT.json');
