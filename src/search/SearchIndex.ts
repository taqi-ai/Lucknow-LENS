import { SearchResult, OSMMapData } from '../types';
import { loadJSON } from '../data/resourceCache';
import { project, unproject } from '../geo/projection';

export { project, unproject };

export class SearchIndex {
  private items: SearchResult[] = [];
  private initialized = false;

  constructor() {
    this.items = [];
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Same shared cache LabelManager uses — these two files are parsed once
      // for the whole app.
      const [placesData, roadsData] = await Promise.all([
        loadJSON<any[]>('/overture_tiles_full/places_labels.json'),
        loadJSON<any[]>('/overture_tiles_full/road_labels.json'),
      ]);

      // Name dedup runs through a Set. The previous version called
      // `this.items.some(...)` once per incoming record against an array that grew
      // to ~48,000 entries — roughly 2.3 billion lowercase string comparisons, and
      // the single 50-second main-thread stall that made the page look hung on load.
      const seenNames = new Set<string>(
        this.items.map((item) => item.name.toLowerCase()),
      );

      const merge = (record: any, category: string) => {
        const name: string = record?.name;
        if (!name) return;
        const key = name.toLowerCase();
        if (seenNames.has(key)) return;
        seenNames.add(key);

        const coords = unproject(record.x, record.z);
        this.items.push({
          id: record.id,
          name,
          category,
          latitude: coords.lat,
          longitude: coords.lon,
          x: record.x,
          z: record.z,
          importance: record.importance || 5,
        });
      };

      for (const p of placesData) merge(p, p.type || 'Landmark');
      for (const r of roadsData) merge(r, 'Road');

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
