#!/usr/bin/env node
/**
 * extract_labels_v2.cjs
 * Fixed version: produces clean, deduplicated, Lucknow-only place & road label files.
 *
 * Root causes fixed:
 * 1. Cross-city contamination: crowdsourced Overture entries physically in Lucknow bbox
 *    but representing other cities (Delhi/Mumbai airport, etc.) — filtered by name.
 * 2. Massive duplicates: same real-world place listed 20+ times with name variations
 *    — deduplicated by spatial proximity + canonical name.
 * 3. Ordinary businesses inflating importance=2 bucket — importance scores tightened.
 * 4. Hard BBOX coordinate check in world-space as final gate.
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const TILES_DIR  = path.join(process.cwd(), 'public/overture_tiles_full');
const DATA_DIR   = path.join(process.cwd(), 'data');

// ── Coordinate system (must match generator) ─────────────────────────────────
const CENTER_LAT = 26.84997035;
const CENTER_LON = 80.95005255000001;
const mPerLat    = 111320;
const mPerLon    = 111320 * Math.cos((CENTER_LAT * Math.PI) / 180);

// Lucknow BBOX in world-space coordinates
const MIN_LON = 80.7501301, MAX_LON = 81.149975;
const MIN_LAT = 26.6500106, MAX_LAT = 27.0499301;
const WORLD_MIN_X = (MIN_LON - CENTER_LON) * mPerLon;
const WORLD_MAX_X = (MAX_LON - CENTER_LON) * mPerLon;
const WORLD_MIN_Z = -(MAX_LAT - CENTER_LAT) * mPerLat;
const WORLD_MAX_Z = -(MIN_LAT - CENTER_LAT) * mPerLat;

function project(lon, lat) {
  return {
    x: (lon - CENTER_LON) * mPerLon,
    z: -(lat  - CENTER_LAT) * mPerLat,
  };
}

// ── Ban-list: names containing these strings reference other cities ───────────
const CROSS_CITY_BANS = [
  'mumbai', 'delhi', 'new delhi', 'igi airport', 't3 igi', 'indira gandhi international',
  'chattrapati shivaji', 'chhatrapati', 'kolkata', 'bengaluru', 'bangalore', 'chennai',
  'hyderabad', 'ahmedabad', 'pune', 'navi mumbai', 'jaipur', 'rajasthan university',
  'chandigarh', 'bhopal', 'nagpur', 'surat', 'agra fort', 'taj mahal',
  'qutab minar', 'red fort, delhi', 'gateway of india', 'varanasi', 'banaras',
];

function isCrossCityEntry(name) {
  const n = name.toLowerCase();
  return CROSS_CITY_BANS.some(b => n.includes(b));
}

// ── Curated Lucknow Major Landmarks & Blacklist ──────────────────────────────
const KNOWN_LANDMARKS = [
  { match: /chaudhary charan singh|amausi airport|lucknow airport/i, name: 'Chaudhary Charan Singh International Airport', imp: 10 },
  { match: /charbagh|lucknow junction|lucknow nr/i, name: 'Lucknow Charbagh Railway Station', imp: 10 },
  { match: /bara imambara|asafi imambara/i, name: 'Bara Imambara', imp: 9 },
  { match: /chota imambara/i, name: 'Chota Imambara', imp: 9 },
  { match: /rumi darwaza/i, name: 'Rumi Darwaza', imp: 9 },
  { match: /hazratganj/i, name: 'Hazratganj', imp: 9 },
  { match: /ambedkar.*park|ambedkar memorial/i, name: 'Ambedkar Memorial Park', imp: 9 },
  { match: /janeshwar mishra/i, name: 'Janeshwar Mishra Park', imp: 9 },
  { match: /ekana.*stadium|atal bihari.*stadium/i, name: 'Ekana Cricket Stadium', imp: 9 },
  { match: /lulu mall/i, name: 'Lulu Mall Lucknow', imp: 9 },
  { match: /phoenix palassio/i, name: 'Phoenix Palassio', imp: 9 },
  { match: /sgpgi|sanjay gandhi post/i, name: 'SGPGI Hospital', imp: 9 },
  { match: /kgmu|king george/i, name: 'KGMU Hospital', imp: 9 },
  { match: /iim lucknow/i, name: 'IIM Lucknow', imp: 9 },
  { match: /alambagh.*bus|alambagh.*isbt/i, name: 'Alambagh ISBT Bus Terminal', imp: 9 },
  { match: /vidhan sabha/i, name: 'Vidhan Sabha (Legislative Assembly)', imp: 9 },
  { match: /lucknow university/i, name: 'Lucknow University', imp: 8 },
  { match: /indira gandhi pratishthan/i, name: 'Indira Gandhi Pratishthan', imp: 8 },
  { match: /gomti river front/i, name: 'Gomti Riverfront Park', imp: 8 },
];

// Spam / Fake classification keywords — crowdsourced shops mislabeled as landmarks/airports
const COMMERCIAL_SHOP_SPAM = [
  'technology', 'consultancy', 'gate', 'shop', 'store', 'filling station', 'services',
  'house', 'home', 'center', 'centre', 'edgah', 'nagar', 'colony', 'apartment', 'villa',
  'sofa', 'tiles', 'mobile', 'bakery', 'jeweller', 'footwear', 'tailor', 'salon', 'saloon',
  'hardware', 'sweet', 'sweets', 'trader', 'enterprise', 'agency', 'electronic', 'garment',
  'boutique', 'studio', 'optical', 'beauty', 'hair', 'cloth', 'dryclean', 'pvt ltd', 'pvt. ltd'
];

// ── Importance scoring (1–10) ─────────────────────────────────────────────────
function getImportance(name, type) {
  if (!name) return 2;
  const normName = name.toLowerCase();

  // 1. Check curated major Lucknow landmarks
  for (const lm of KNOWN_LANDMARKS) {
    if (lm.match.test(normName)) return { imp: lm.imp, canonicalName: lm.name };
  }

  // 2. Local shops / commercial businesses — demote to local importance
  const isLocalShop = COMMERCIAL_SHOP_SPAM.some(s => normName.includes(s));
  if (isLocalShop) {
    return { imp: 3, canonicalName: name };
  }

  // 3. Sanitize misclassified airport/terminal tags in crowdsourced data
  const lowerType = (type || '').toLowerCase();
  const isAirportType = lowerType.includes('airport');

  if (isAirportType) {
    // Real airport must mention airport/amausi/ccs
    const isRealAirport = /airport|amausi|ccs/i.test(normName);
    if (!isRealAirport) {
      return { imp: 3, canonicalName: name }; // demote fake airport tag to local business
    }
    return { imp: 10, canonicalName: 'Chaudhary Charan Singh International Airport' };
  }

  // 3. Railway / Bus Transit
  if (lowerType.includes('railway') || lowerType.includes('station') || lowerType.includes('transit')) {
    if (/junction|terminal|isbt|central/i.test(normName)) return { imp: 9, canonicalName: name };
    if (/metro station/i.test(normName)) return { imp: 6, canonicalName: name };
    return { imp: 7, canonicalName: name };
  }

  // 4. Hospitals — distinguish major medical institutes from neighborhood clinics
  if (lowerType.includes('hospital')) {
    if (/institute|medical college|trauma center|super spec|hospital/i.test(normName)) {
      if (/clinic|dental|eye|maternity|pathology|polyclinic/i.test(normName)) {
        return { imp: 4, canonicalName: name };
      }
      return { imp: 7, canonicalName: name };
    }
    return { imp: 4, canonicalName: name };
  }

  // 5. Higher Education & Research
  if (lowerType.includes('university') || lowerType.includes('college')) {
    if (/university|iim|iiit|nift|aktu|amity/i.test(normName)) return { imp: 8, canonicalName: name };
    return { imp: 6, canonicalName: name };
  }

  // 6. Cultural / Historical / Civic
  if (lowerType.includes('landmark') || lowerType.includes('historical') || lowerType.includes('monument')) return { imp: 8, canonicalName: name };
  if (lowerType.includes('government') || lowerType.includes('ministry')) return { imp: 7, canonicalName: name };
  if (lowerType.includes('museum')) return { imp: 8, canonicalName: name };
  if (lowerType.includes('mall') || lowerType.includes('plaza')) return { imp: 7, canonicalName: name };
  if (lowerType.includes('stadium') || lowerType.includes('sport')) return { imp: 7, canonicalName: name };
  if (lowerType.includes('park') || lowerType.includes('garden')) return { imp: 6, canonicalName: name };
  if (lowerType.includes('hotel') || lowerType.includes('resort')) return { imp: 6, canonicalName: name };
  if (lowerType.includes('temple') || lowerType.includes('mosque') || lowerType.includes('mandir') || lowerType.includes('masjid') || lowerType.includes('church')) return { imp: 6, canonicalName: name };

  if (lowerType.includes('school')) return { imp: 5, canonicalName: name };
  if (lowerType.includes('restaurant') || lowerType.includes('food')) return { imp: 4, canonicalName: name };
  if (lowerType.includes('bank')) return { imp: 4, canonicalName: name };

  return { imp: 3, canonicalName: name }; // ordinary businesses
}

// ── Road importance ───────────────────────────────────────────────────────────
const ROAD_CLASS_IMP = {
  motorway: 10, trunk: 9, primary: 8, secondary: 7, tertiary: 6,
  residential: 4, unclassified: 3, path: 2, footway: 1, pedestrian: 2,
  cycleway: 2, track: 2, service: 2,
};
function getRoadImportance(cls) { return ROAD_CLASS_IMP[cls] || 3; }

// ── Spatial deduplication ─────────────────────────────────────────────────────
const DEDUP_CELL = 500; // world units (≈500 m bucket size)
const DEDUP_RADIUS_NORMAL = 150;
const DEDUP_RADIUS_HIGH   = 1200; // airports/major landmarks: 1.2km merge radius
const buckets = new Map();

function normalise(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f ]/g, '') // keep devanagari
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a, b) {
  const sa = new Set(a.split(' ')), sb = new Set(b.split(' '));
  const inter = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function isDuplicate(name, x, z, importance) {
  const bx = Math.floor(x / DEDUP_CELL);
  const bz = Math.floor(z / DEDUP_CELL);
  const norm = normalise(name);
  const radius = importance >= 8 ? DEDUP_RADIUS_HIGH : DEDUP_RADIUS_NORMAL;
  const cells = Math.ceil(radius / DEDUP_CELL) + 1;

  for (let dx = -cells; dx <= cells; dx++) {
    for (let dz = -cells; dz <= cells; dz++) {
      const key = `${bx + dx}_${bz + dz}`;
      const cell = buckets.get(key);
      if (!cell) continue;
      for (const entry of cell) {
        const dist = Math.hypot(entry.x - x, entry.z - z);
        // For high importance landmarks (imp>=8), merge if distance < 1200m or token match >= 0.35
        if (importance >= 8 && entry.importance >= 8 && dist < radius) return true;
        if (dist < radius && jaccardSimilarity(norm, entry.norm) >= 0.35) return true;
      }
    }
  }
  return false;
}

function registerEntry(name, x, z, importance) {
  const bx = Math.floor(x / DEDUP_CELL);
  const bz = Math.floor(z / DEDUP_CELL);
  const key = `${bx}_${bz}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push({ norm: normalise(name), x, z, importance });
}


// ── Main extraction ───────────────────────────────────────────────────────────

async function extractPlaces() {
  console.log('Extracting place labels from tile files...');
  const tileFiles = fs.readdirSync(TILES_DIR).filter(f => f.startsWith('tile_') && f.endsWith('.json'));

  const places = [];
  let skippedCrossCity = 0, skippedDuplicate = 0, skippedOutsideBbox = 0;

  for (const file of tileFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(TILES_DIR, file), 'utf8'));
    const tilePlaces = data.lod2?.places || [];

    for (const p of tilePlaces) {
      if (!p.name || !p.position) continue;

      const { x, z } = p.position;

      // 1. Hard BBOX gate
      if (x < WORLD_MIN_X || x > WORLD_MAX_X || z < WORLD_MIN_Z || z > WORLD_MAX_Z) {
        skippedOutsideBbox++;
        continue;
      }

      // 2. Cross-city name filter
      if (isCrossCityEntry(p.name)) {
        skippedCrossCity++;
        continue;
      }

      const { imp: importance, canonicalName } = getImportance(p.name, p.type);
      // Only store places with importance ≥ 3
      if (importance < 3) { skippedDuplicate++; continue; }

      // 3. Spatial deduplication
      if (isDuplicate(canonicalName, x, z, importance)) {
        skippedDuplicate++;
        continue;
      }

      registerEntry(canonicalName, x, z, importance);
      places.push({ id: p.id, name: canonicalName, x, z, type: p.type, importance });
    }
  }

  // Sort: importance desc, then name asc for deterministic ordering
  places.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));

  // Second-pass: for top landmarks (importance >= 8), enforce strict single-label per canonical name & 1.5km grid cell
  const finalPlaces = [];
  const cellSeen = new Set();
  const nameSeen = new Set();
  const CLUSTER_CELL = 1500; // 1.5km world units

  for (const p of places) {
    if (p.importance >= 8) {
      const bx = Math.floor((p.x - WORLD_MIN_X) / CLUSTER_CELL);
      const bz = Math.floor((p.z - WORLD_MIN_Z) / CLUSTER_CELL);
      const cellKey = `${bx}_${bz}`;
      const nameKey = p.name.toLowerCase();

      if (cellSeen.has(cellKey) || nameSeen.has(nameKey)) continue;
      cellSeen.add(cellKey);
      nameSeen.add(nameKey);
    }
    finalPlaces.push(p);
  }

  console.log(`  Total unique places retained: ${finalPlaces.length} (was ${places.length} before landmark-cluster dedup)`);
  console.log(`  Skipped cross-city: ${skippedCrossCity}`);
  console.log(`  Skipped duplicates/junk: ${skippedDuplicate}`);
  console.log(`  Skipped outside bbox: ${skippedOutsideBbox}`);

  const byImp = {};
  finalPlaces.forEach(p => { byImp[p.importance] = (byImp[p.importance] || 0) + 1; });
  console.log('  By importance:', JSON.stringify(byImp));
  console.log('  Top 15:', finalPlaces.slice(0, 15).map(p => `[${p.importance}] ${p.name}`).join('\n    '));

  fs.writeFileSync(path.join(TILES_DIR, 'places_labels.json'), JSON.stringify(finalPlaces));
  console.log('  Written places_labels.json\n');
}

async function extractRoads() {
  console.log('Extracting road name labels from transport stream...');
  const transportFile = path.join(DATA_DIR, 'overture_transportation.geojsonseq');
  if (!fs.existsSync(transportFile)) {
    console.warn('  Transport file not found, skipping.');
    return;
  }

  const rl = readline.createInterface({ input: fs.createReadStream(transportFile), crlfDelay: Infinity });
  const roads = [];
  const seenNames = new Map(); // name → entry in roads[]
  let count = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    count++;
    try {
      const feat = JSON.parse(line);
      const name = feat.properties?.names?.primary;
      if (!name) continue;

      const cls = feat.properties?.class || 'residential';
      const importance = getRoadImportance(cls);

      const coords = feat.geometry?.coordinates;
      if (feat.geometry?.type !== 'LineString' || !coords?.length) continue;

      // Use midpoint of segment for label placement
      const mid = coords[Math.floor(coords.length / 2)];
      const pt = project(mid[0], mid[1]);

      // Hard bbox check
      if (pt.x < WORLD_MIN_X || pt.x > WORLD_MAX_X || pt.z < WORLD_MIN_Z || pt.z > WORLD_MAX_Z) continue;

      // Deduplicate by name — keep highest-importance segment
      const existing = seenNames.get(name);
      if (existing) {
        if (importance > existing.importance) {
          existing.importance = importance;
          existing.x = pt.x;
          existing.z = pt.z;
          existing.type = cls;
        }
      } else {
        const entry = { id: feat.properties?.id || `road-${Math.random()}`, name, x: pt.x, z: pt.z, type: cls, importance };
        roads.push(entry);
        seenNames.set(name, entry);
      }
    } catch (_) {}
  }

  // Only keep roads importance ≥ 5 (tertiary and above) in the label file
  const filtered = roads.filter(r => r.importance >= 5).sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));

  console.log(`  Processed ${count} road features`);
  console.log(`  Unique named roads ≥ tertiary: ${filtered.length}`);
  console.log('  Top 10:', filtered.slice(0, 10).map(r => `[${r.importance}] ${r.name}`).join('\n    '));

  fs.writeFileSync(path.join(TILES_DIR, 'road_labels.json'), JSON.stringify(filtered));
  console.log('  Written road_labels.json\n');
}

async function main() {
  console.log('=== Label Extraction v2 ===\n');
  await extractPlaces();
  await extractRoads();
  console.log('Done.');
}

main().catch(console.error);
