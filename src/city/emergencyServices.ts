/**
 * Emergency Services Registry for Lucknow LENS
 *
 * Provides real spatial data, coverage radiuses, and facility intelligence
 * for Lucknow's Emergency Network:
 *  - Hospitals & Trauma Centres (Red Cross badge, ~2,200 m medical response radius)
 *  - Police Stations & Kotwalis (Blue Shield badge, ~1,600 m patrol radius)
 *  - Fire Stations & Rescue Brigades (Orange Flame badge, ~1,800 m fire safety radius)
 *
 * Data is backed by real geo-coordinates from Lucknow Overture Places and
 * curated municipal hubs inspired by SimCity BuildIt municipal tiering.
 */

import { loadJSON } from '../data/resourceCache';

export type EmergencyFacilityType = 'hospital' | 'police' | 'fire';

export interface EmergencyFacility {
  id: string;
  name: string;
  type: EmergencyFacilityType;
  x: number;
  z: number;
  coverageRadiusMeters: number;
  level: number;
  maxLevel: number;
  tierName: string;
  status: 'active' | 'responding' | 'patrolling';
  vehicles: string;
  capacity: string;
  phone?: string;
  district?: string;
}

/** Pre-curated premier emergency hubs with verified coordinates and municipal data */
export const CURATED_EMERGENCY_HUBS: EmergencyFacility[] = [
  // --- FIRE STATIONS ---
  {
    id: 'fire-lalbagh',
    name: 'Fire Station Lalbagh',
    type: 'fire',
    x: -1128.98,
    z: 262.74,
    coverageRadiusMeters: 1900,
    level: 4,
    maxLevel: 5,
    tierName: 'Central Fire Headquarters',
    status: 'active',
    vehicles: '5 Engines, 2 Turntable Ladders',
    capacity: '24/7 Rapid Response Unit',
    phone: '101 / 0522-2615610',
    district: 'Hazratganj / Lalbagh',
  },
  {
    id: 'fire-chowk',
    name: 'Fire Station Chowk Lucknow',
    type: 'fire',
    x: -4237.20,
    z: -2240.83,
    coverageRadiusMeters: 1750,
    level: 3,
    maxLevel: 5,
    tierName: 'Heritage Division Fire Station',
    status: 'active',
    vehicles: '3 Engines, 1 Narrow-Alley Mist Tender',
    capacity: 'Old City Special Fire Tender',
    phone: '101 / 0522-2255555',
    district: 'Chowk / Old Lucknow',
  },
  {
    id: 'fire-gomti-nagar',
    name: 'Gomti Nagar Fire Station',
    type: 'fire',
    x: 7452.21,
    z: -1880.02,
    coverageRadiusMeters: 2000,
    level: 4,
    maxLevel: 5,
    tierName: 'Deluxe Suburban Fire Station',
    status: 'active',
    vehicles: '4 Fire Engines, 1 Chemical Foam Tender',
    capacity: 'High-Rise & Industrial Fire Division',
    phone: '101 / 0522-2304101',
    district: 'Gomti Nagar Phase 1',
  },
  {
    id: 'fire-police-cantt',
    name: 'Police & Fire Station Cantt',
    type: 'fire',
    x: -2030.45,
    z: -1134.22,
    coverageRadiusMeters: 1600,
    level: 2,
    maxLevel: 5,
    tierName: 'Cantonment Integrated Fire Post',
    status: 'active',
    vehicles: '2 Engines, 1 Rapid Intervention Vehicle',
    capacity: 'Defence & Cantonment Fire Safety',
    phone: '101',
    district: 'Lucknow Cantonment',
  },

  // --- MAJOR HOSPITALS & TRAUMA CENTRES ---
  {
    id: 'hosp-kgmu',
    name: "KGMU Trauma Centre & Hospital",
    type: 'hospital',
    x: -3320.50,
    z: -1280.20,
    coverageRadiusMeters: 2600,
    level: 8,
    maxLevel: 8,
    tierName: 'Apex Regional Medical University',
    status: 'active',
    vehicles: '12 Advanced Life Support Ambulances, Heli-Evac Pad',
    capacity: '4,500 Beds, 24/7 Level-1 Trauma Centre',
    phone: '108 / 0522-2257540',
    district: 'Chowk / Shah Mina Road',
  },
  {
    id: 'hosp-sgpgi',
    name: 'SGPGI Super Speciality Hospital',
    type: 'hospital',
    x: -315.22,
    z: 11420.93,
    coverageRadiusMeters: 2800,
    level: 8,
    maxLevel: 8,
    tierName: 'National Premier Medical Institute',
    status: 'active',
    vehicles: '8 ICU Ambulances, Air Ambulance Helipad',
    capacity: '1,800 Super-Speciality Tertiary Beds',
    phone: '108 / 0522-2668004',
    district: 'Raebareli Road',
  },
  {
    id: 'hosp-medanta',
    name: 'Medanta Hospital Lucknow',
    type: 'hospital',
    x: 3200.40,
    z: 4800.10,
    coverageRadiusMeters: 2400,
    level: 7,
    maxLevel: 8,
    tierName: 'Multispeciality Medical Centre',
    status: 'active',
    vehicles: '6 Cardiac Ambulances, Rooftop Helipad',
    capacity: '1,000 Multispeciality Beds',
    phone: '0522-4505050',
    district: 'Shaheed Path / Sushant Golf City',
  },
  {
    id: 'hosp-civil',
    name: 'Shyama Prasad Mukherjee Civil Hospital',
    type: 'hospital',
    x: -950.15,
    z: 420.30,
    coverageRadiusMeters: 2100,
    level: 5,
    maxLevel: 8,
    tierName: 'District Government Hospital',
    status: 'active',
    vehicles: '5 Emergency Ambulances',
    capacity: '400 Emergency & General Care Beds',
    phone: '0522-2239000',
    district: 'Hazratganj Park Road',
  },
  {
    id: 'hosp-balrampur',
    name: 'Balrampur Hospital',
    type: 'hospital',
    x: -2410.60,
    z: -720.40,
    coverageRadiusMeters: 2100,
    level: 5,
    maxLevel: 8,
    tierName: 'City Central Civil Hospital',
    status: 'active',
    vehicles: '6 Emergency Ambulances',
    capacity: '750 Beds, Emergency OT',
    phone: '0522-2224040',
    district: 'Golaganj / Kaiserbagh',
  },

  // --- POLICE STATIONS & KOTWALIS ---
  {
    id: 'pol-hazratganj',
    name: 'Hazratganj Kotwali Police Station',
    type: 'police',
    x: -780.20,
    z: 550.10,
    coverageRadiusMeters: 1700,
    level: 4,
    maxLevel: 5,
    tierName: 'Central Precinct Headquarters',
    status: 'patrolling',
    vehicles: '8 PCR Vans, 14 Cheetah Mobile Patrols',
    capacity: 'VVIP & Central Business District Security',
    phone: '112 / 0522-2222222',
    district: 'Hazratganj Central',
  },
  {
    id: 'pol-chowk',
    name: 'Chowk Thana Police Station',
    type: 'police',
    x: -3980.40,
    z: -2100.30,
    coverageRadiusMeters: 1500,
    level: 3,
    maxLevel: 5,
    tierName: 'Old City Division Precinct',
    status: 'patrolling',
    vehicles: '5 PCR Vans, 10 Motorcycle Patrols',
    capacity: 'Dense Urban & Heritage Sector Patrol',
    phone: '112 / 0522-2256000',
    district: 'Chowk Heritage Zone',
  },
  {
    id: 'pol-gomti-nagar',
    name: 'Gomti Nagar Police Station',
    type: 'police',
    x: 6890.30,
    z: -1420.50,
    coverageRadiusMeters: 1800,
    level: 4,
    maxLevel: 5,
    tierName: 'Metro Sector Police Precinct',
    status: 'patrolling',
    vehicles: '7 PCR Vans, 12 Cheetah Patrols',
    capacity: 'Suburban Highway & Residential Sector',
    phone: '112 / 0522-2305555',
    district: 'Gomti Nagar Vibhuti Khand',
  },
  {
    id: 'pol-alambagh',
    name: 'Alambagh Police Station',
    type: 'police',
    x: -4520.10,
    z: 3840.20,
    coverageRadiusMeters: 1600,
    level: 3,
    maxLevel: 5,
    tierName: 'Transit Hub Police Station',
    status: 'patrolling',
    vehicles: '6 PCR Vans, 8 Patrol Bikes',
    capacity: 'Railway & Bus Transit Hub Security',
    phone: '112 / 0522-2451000',
    district: 'Alambagh Junction',
  },
  {
    id: 'pol-grp-line',
    name: 'GRP Police Lines Charbagh',
    type: 'police',
    x: -3251.03,
    z: 1913.58,
    coverageRadiusMeters: 1650,
    level: 4,
    maxLevel: 5,
    tierName: 'Railway Police Headquarters',
    status: 'patrolling',
    vehicles: '10 Interceptor Vehicles, Dog Squad',
    capacity: 'Inter-City Rail Security & Reserve Force',
    phone: '112 / 1512',
    district: 'Charbagh Rail District',
  },
];

interface RawPlaceRecord {
  name: string;
  x: number;
  z: number;
  category?: string;
  importance?: number;
}

let cachedFacilities: EmergencyFacility[] | null = null;
let loadPromise: Promise<EmergencyFacility[]> | null = null;

function isFirePlace(name: string): boolean {
  return (
    /\bfire station\b|\bfire brigade\b|\bpolice fire station\b/i.test(name) &&
    !/restaurant|cafe|studio|dance|works|consultant|service/i.test(name)
  );
}

function isPolicePlace(name: string): boolean {
  return (
    (/\bpolice station\b|\bpolice chowki\b|\bkotwali\b|\bthana\b|\bpolice line\b/i.test(name) ||
      /^police\b/i.test(name)) &&
    !/filling stat|petrol|filling\b/i.test(name)
  );
}

function isHospitalPlace(name: string): boolean {
  return (
    (/\bhospital\b|\bmedical college\b|\btrauma centre\b|\bhealth centre\b|\bcommunity health\b/i.test(name)) &&
    !/dr\s+[a-z]+|clinic|specialist|dentist|optician|eye care|pathology|diagnostic|pharmacy|chemist/i.test(name)
  );
}

/**
 * Loads all emergency services facilities, merging curated premier hubs
 * with full Overture places dataset.
 */
export async function loadEmergencyFacilities(): Promise<EmergencyFacility[]> {
  if (cachedFacilities) return cachedFacilities;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const list: EmergencyFacility[] = [...CURATED_EMERGENCY_HUBS];
    const seenNames = new Set(list.map((f) => f.name.toLowerCase().trim()));

    try {
      const places = await loadJSON<RawPlaceRecord[]>('/overture_tiles_full/places_labels.json');
      let autoId = 100;

      for (const p of places) {
        if (!p.name || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
        const lower = p.name.toLowerCase().trim();
        if (seenNames.has(lower)) continue;

        let type: EmergencyFacilityType | null = null;
        let radius = 1600;
        let tierName = 'Local Facility';
        let level = 2;
        let maxLevel = 5;
        let vehicles = 'Response Units On Duty';
        let capacity = 'Municipal Service Post';

        if (isFirePlace(p.name)) {
          type = 'fire';
          radius = 1800;
          tierName = 'Municipal Fire Station';
          level = 3;
          maxLevel = 5;
          vehicles = '3 Fire Tenders, Emergency Water Bowsers';
          capacity = '24/7 Fire & Disaster Unit';
        } else if (isPolicePlace(p.name)) {
          type = 'police';
          radius = 1500;
          tierName = lower.includes('chowki') ? 'Police Chowki Post' : 'Police Station';
          level = lower.includes('chowki') ? 2 : 3;
          maxLevel = 5;
          vehicles = '3 PCR Vans, 4 Rapid Patrol Bikes';
          capacity = 'Local Law & Order Command';
        } else if (isHospitalPlace(p.name)) {
          type = 'hospital';
          radius = 2000;
          tierName = lower.includes('medical college') ? 'Tertiary Medical Centre' : 'Community Hospital';
          level = lower.includes('medical college') ? 6 : 4;
          maxLevel = 8;
          vehicles = '4 Emergency Ambulances';
          capacity = 'Emergency & Inpatient Care';
        }

        if (type) {
          seenNames.add(lower);
          list.push({
            id: `emg-${autoId++}`,
            name: p.name,
            type,
            x: p.x,
            z: p.z,
            coverageRadiusMeters: radius,
            level,
            maxLevel,
            tierName,
            status: type === 'police' ? 'patrolling' : 'active',
            vehicles,
            capacity,
            district: 'Lucknow Metropolitan Area',
          });
        }
      }
    } catch (e) {
      console.warn('Could not load full places for emergency facilities, using curated hubs:', e);
    }

    cachedFacilities = list;
    return list;
  })();

  return loadPromise;
}

/** Check if a given coordinate in Lucknow is within coverage of an emergency service */
export function evaluateEmergencyCoverage(
  x: number,
  z: number,
  facilities: EmergencyFacility[],
  type?: EmergencyFacilityType,
): { covered: boolean; nearestFacility?: EmergencyFacility; distanceMeters: number } {
  let minDistance = Infinity;
  let nearest: EmergencyFacility | undefined;

  for (const fac of facilities) {
    if (type && fac.type !== type) continue;
    const dx = fac.x - x;
    const dz = fac.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < minDistance) {
      minDistance = dist;
      nearest = fac;
    }
  }

  const covered = nearest ? minDistance <= nearest.coverageRadiusMeters : false;
  return {
    covered,
    nearestFacility: nearest,
    distanceMeters: Math.round(minDistance),
  };
}
