import { SearchResult, OSMMapData } from '../types';

const centerLat = 26.8475;
const centerLon = 80.945;
const mPerLat = 111320;
const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180);

export function unproject(x: number, z: number) {
  const lat = centerLat - z / mPerLat;
  const lon = centerLon + x / mPerLon;
  return { lat, lon };
}

export function project(lat: number, lon: number) {
  const x = (lon - centerLon) * mPerLon;
  const z = -(lat - centerLat) * mPerLat;
  return { x, z };
}

// Custom Registry of major landmarks with exact coordinates/projected meters
const LUCKNOW_CUSTOM_REGISTRY: Omit<SearchResult, 'x' | 'z'>[] = [
  {
    id: 'custom-hazratganj',
    name: 'Hazratganj',
    category: 'Area',
    latitude: 26.8467,
    longitude: 80.9461,
    importance: 10
  },
  {
    id: 'custom-charbagh',
    name: 'Charbagh Railway Station',
    category: 'Railway',
    latitude: 26.8322,
    longitude: 80.9221,
    importance: 10
  },
  {
    id: 'custom-amausi',
    name: 'Amausi Airport (Chaudhary Charan Singh International Airport)',
    category: 'Airport',
    latitude: 26.7606,
    longitude: 80.8893,
    importance: 10
  },
  {
    id: 'custom-palassio',
    name: 'Phoenix Palassio',
    category: 'Shopping',
    latitude: 26.8015,
    longitude: 81.0028,
    importance: 10
  },
  {
    id: 'custom-sgpgi',
    name: 'SGPGI Hospital (Sanjay Gandhi Postgraduate Institute of Medical Sciences)',
    category: 'Hospital',
    latitude: 26.7538,
    longitude: 80.9392,
    importance: 10
  },
  {
    id: 'custom-university',
    name: 'Lucknow University',
    category: 'University',
    latitude: 26.8643,
    longitude: 80.9382,
    importance: 9
  },
  {
    id: 'custom-rumi',
    name: 'Rumi Darwaza',
    category: 'Landmark',
    latitude: 26.8694,
    longitude: 80.9115,
    importance: 10
  },
  {
    id: 'custom-gomti',
    name: 'Gomti River Viewpoint Point',
    category: 'Gomti',
    latitude: 26.8525,
    longitude: 80.9545,
    importance: 9
  },
  {
    id: 'custom-janeshwar',
    name: 'Janeshwar Mishra Park',
    category: 'Park',
    latitude: 26.8315,
    longitude: 80.9812,
    importance: 9
  },
  {
    id: 'custom-ambedkar',
    name: 'Ambedkar Memorial Park',
    category: 'Park',
    latitude: 26.8435,
    longitude: 80.9695,
    importance: 9
  }
];

export class SearchIndex {
  private items: SearchResult[] = [];
  private initialized = false;

  constructor() {
    // Load custom registry immediately
    this.items = LUCKNOW_CUSTOM_REGISTRY.map(item => {
      const { x, z } = project(item.latitude, item.longitude);
      return { ...item, x, z };
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const [placesRes, roadsRes] = await Promise.all([
        fetch('/overture_tiles_full/places_labels.json'),
        fetch('/overture_tiles_full/road_labels.json')
      ]);

      if (placesRes.ok) {
        const places = await placesRes.json();
        const mappedPlaces: SearchResult[] = places.map((p: any) => {
          const coords = unproject(p.x, p.z);
          return {
            id: p.id,
            name: p.name,
            category: p.type || 'Landmark',
            latitude: coords.lat,
            longitude: coords.lon,
            x: p.x,
            z: p.z,
            importance: p.importance || 5
          };
        });
        // Merge without duplicating names
        mappedPlaces.forEach(p => {
          if (!this.items.some(existing => existing.name.toLowerCase() === p.name.toLowerCase())) {
            this.items.push(p);
          }
        });
      }

      if (roadsRes.ok) {
        const roads = await roadsRes.json();
        const mappedRoads: SearchResult[] = roads.map((r: any) => {
          const coords = unproject(r.x, r.z);
          return {
            id: r.id,
            name: r.name,
            category: 'Road',
            latitude: coords.lat,
            longitude: coords.lon,
            x: r.x,
            z: r.z,
            importance: r.importance || 5
          };
        });
        mappedRoads.forEach(r => {
          if (!this.items.some(existing => existing.name.toLowerCase() === r.name.toLowerCase())) {
            this.items.push(r);
          }
        });
      }

      this.initialized = true;
    } catch (e) {
      console.warn('Failed to load places/roads for SearchIndex:', e);
    }
  }

  public search(query: string, mapData?: OSMMapData): SearchResult[] {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    // 1. Dynamic search over active mapData elements if present
    const dynamicResults: SearchResult[] = [];
    if (mapData) {
      mapData.landmarks.forEach(lm => {
        if (lm.name.toLowerCase().includes(cleanQuery)) {
          const latLon = unproject(lm.position.x, lm.position.z);
          dynamicResults.push({
            id: lm.id,
            name: lm.name,
            category: lm.type || 'Landmark',
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: lm.position.x,
            z: lm.position.z,
            importance: 7
          });
        }
      });

      mapData.buildings.forEach(b => {
        if (b.name && b.name.toLowerCase().includes(cleanQuery)) {
          // find center of points
          let sumX = 0, sumZ = 0;
          b.points.forEach(p => { sumX += p.x; sumZ += p.z; });
          const cx = sumX / b.points.length;
          const cz = sumZ / b.points.length;
          const latLon = unproject(cx, cz);
          dynamicResults.push({
            id: b.id,
            name: b.name,
            category: 'Building',
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: cx,
            z: cz,
            importance: 6
          });
        }
      });
    }

    // 2. Filter static items in index
    const staticResults = this.items.filter(item => 
      item.name.toLowerCase().includes(cleanQuery) ||
      item.category.toLowerCase().includes(cleanQuery)
    );

    // Merge both list and keep unique ones
    const allResults = [...dynamicResults, ...staticResults];
    const uniqueResults: SearchResult[] = [];
    const seenNames = new Set<string>();

    allResults.forEach(item => {
      const key = `${item.name.toLowerCase()}-${item.category.toLowerCase()}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        uniqueResults.push(item);
      }
    });

    // Sort by:
    // 1. Exact match / prefix match
    // 2. Importance score
    return uniqueResults.sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(cleanQuery);
      const bStart = b.name.toLowerCase().startsWith(cleanQuery);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return 1;
      return b.importance - a.importance;
    }).slice(0, 8); // top 8 results
  }
}
