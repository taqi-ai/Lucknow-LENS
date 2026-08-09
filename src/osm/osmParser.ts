import { OSMMapData, OSMPoint, OSMBounds, BuildingFootprint, RoadSegmentOSM, WaterwayOSM, GreenAreaOSM, LandmarkOSM } from '../types';

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function parseOSMFile(fileUrl: string = '/map.osm'): Promise<OSMMapData> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load OSM file from ${fileUrl}: ${response.statusText}`);
  }
  const xmlText = await response.text();
  return parseOSMString(xmlText);
}

function sanitizeAndRepairOSM(xmlText: string): string {
  if (!xmlText) return '<osm></osm>';
  
  // If already ends with </osm>, test parser quickly
  let cleaned = xmlText.trim();
  
  if (!cleaned.endsWith('</osm>')) {
    // Find last closed element tag
    const lastNode = cleaned.lastIndexOf('</node>');
    const lastWay = cleaned.lastIndexOf('</way>');
    const lastRelation = cleaned.lastIndexOf('</relation>');
    const lastSelfClosing = cleaned.lastIndexOf('/>');

    const cutPos = Math.max(
      lastNode !== -1 ? lastNode + 7 : 0,
      lastWay !== -1 ? lastWay + 6 : 0,
      lastRelation !== -1 ? lastRelation + 11 : 0,
      lastSelfClosing !== -1 ? lastSelfClosing + 2 : 0
    );

    if (cutPos > 0) {
      cleaned = cleaned.substring(0, cutPos) + '\n</osm>';
    } else {
      cleaned = cleaned + '\n</osm>';
    }
  }

  return cleaned;
}

export function parseOSMString(xmlText: string): OSMMapData {
  let safeXml = sanitizeAndRepairOSM(xmlText);
  let parser = new DOMParser();
  let xmlDoc = parser.parseFromString(safeXml, 'text/xml');

  let parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    // Try stripping up to last way closing
    const lastWay = xmlText.lastIndexOf('</way>');
    if (lastWay !== -1) {
      safeXml = xmlText.substring(0, lastWay + 6) + '\n</osm>';
      xmlDoc = parser.parseFromString(safeXml, 'text/xml');
      parserError = xmlDoc.querySelector('parsererror');
    }
  }

  if (parserError) {
    console.warn('DOMParser failed even after repair, proceeding with partial elements:', parserError.textContent);
  }

  // 1. Collect Nodes
  const nodeMap = new Map<string, { lat: number; lon: number; tags: Record<string, string> }>();
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  const nodeElements = xmlDoc.querySelectorAll('node');
  nodeElements.forEach((nodeEl) => {
    const id = nodeEl.getAttribute('id');
    const latStr = nodeEl.getAttribute('lat');
    const lonStr = nodeEl.getAttribute('lon');

    if (!id || !latStr || !lonStr) return;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || isNaN(lon)) return;

    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);

    const tags: Record<string, string> = {};
    nodeEl.querySelectorAll('tag').forEach((tagEl) => {
      const k = tagEl.getAttribute('k');
      const v = tagEl.getAttribute('v');
      if (k && v) tags[k] = v;
    });

    nodeMap.set(id, { lat, lon, tags });
  });

  // Check explicit <bounds> tag if available
  const boundsEl = xmlDoc.querySelector('bounds');
  if (boundsEl) {
    const bMinLat = parseFloat(boundsEl.getAttribute('minlat') || '');
    const bMinLon = parseFloat(boundsEl.getAttribute('minlon') || '');
    const bMaxLat = parseFloat(boundsEl.getAttribute('maxlat') || '');
    const bMaxLon = parseFloat(boundsEl.getAttribute('maxlon') || '');

    if (!isNaN(bMinLat) && !isNaN(bMinLon) && !isNaN(bMaxLat) && !isNaN(bMaxLon)) {
      minLat = bMinLat;
      minLon = bMinLon;
      maxLat = bMaxLat;
      maxLon = bMaxLon;
    }
  }

  if (!isFinite(minLat) || !isFinite(minLon)) {
    // Default to central Lucknow bounds if empty
    minLat = 26.840;
    maxLat = 26.860;
    minLon = 80.930;
    maxLon = 80.955;
  }

  // 2. Coordinate System Projection Setup
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const mPerLat = 111320; // Meters per degree latitude
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180); // Meters per degree longitude

  function project(lat: number, lon: number): OSMPoint {
    const x = (lon - centerLon) * mPerLon;
    const z = -(lat - centerLat) * mPerLat;
    return { x, z };
  }

  const widthMeters = Math.round((maxLon - minLon) * mPerLon);
  const heightMeters = Math.round((maxLat - minLat) * mPerLat);

  const bounds: OSMBounds = {
    minLat,
    minLon,
    maxLat,
    maxLon,
    centerLat,
    centerLon,
    widthMeters,
    heightMeters,
  };

  // 3. Process Named Landmark Nodes
  const landmarks: LandmarkOSM[] = [];
  nodeMap.forEach((nodeData, nodeId) => {
    const tags = nodeData.tags;
    if (tags.name && (tags.historic || tags.tourism || tags.amenity || tags.office || tags.building || tags.station)) {
      landmarks.push({
        id: `node-lm-${nodeId}`,
        name: tags.name,
        position: project(nodeData.lat, nodeData.lon),
        type: tags.historic ? 'historic' : tags.tourism ? 'tourism' : tags.amenity || 'landmark',
      });
    }
  });

  // 4. Collect & Classify Ways
  const buildings: BuildingFootprint[] = [];
  const roads: RoadSegmentOSM[] = [];
  const waterways: WaterwayOSM[] = [];
  const greenAreas: GreenAreaOSM[] = [];

  const wayElements = xmlDoc.querySelectorAll('way');
  wayElements.forEach((wayEl) => {
    const wayId = wayEl.getAttribute('id') || `way-${Math.random()}`;

    const tags: Record<string, string> = {};
    wayEl.querySelectorAll('tag').forEach((tagEl) => {
      const k = tagEl.getAttribute('k');
      const v = tagEl.getAttribute('v');
      if (k && v) tags[k] = v;
    });

    const nodeRefs: string[] = [];
    wayEl.querySelectorAll('nd').forEach((ndEl) => {
      const ref = ndEl.getAttribute('ref');
      if (ref) nodeRefs.push(ref);
    });

    if (nodeRefs.length < 2) return;

    // Convert refs to projected points
    const points: OSMPoint[] = [];
    nodeRefs.forEach((ref) => {
      const n = nodeMap.get(ref);
      if (n) {
        points.push(project(n.lat, n.lon));
      }
    });

    if (points.length < 2) return;

    // A. BUILDING
    if (tags.building || tags['building:levels'] || tags['building:use']) {
      if (points.length >= 3) {
        const hash = stringHash(wayId);
        
        // Calculate footprint area in square meters
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          area += points[i].x * points[j].z;
          area -= points[j].x * points[i].z;
        }
        area = Math.abs(area) / 2;

        let stories = 1;
        if (tags['building:levels']) {
          stories = Math.max(1, parseInt(tags['building:levels'], 10) || 1);
        } else if (tags.height) {
          const h = parseFloat(tags.height);
          if (!isNaN(h)) stories = Math.max(1, Math.round(h / 3.3));
        } else {
          // Height estimation based on footprint area & building type:
          // Most buildings in central Lucknow are 1-4 stories (low to mid rise)
          if (area < 100) {
            stories = 1 + (hash % 2); // 1-2 stories (small houses/shops)
          } else if (area < 350) {
            stories = 2 + (hash % 3); // 2-4 stories (residences/offices)
          } else if (area < 900) {
            stories = 3 + (hash % 4); // 3-6 stories (commercial/apartments)
          } else {
            // Large building footprint: mostly 3-6 stories, with ~8% taller blocks
            const isTall = (hash % 12) === 0;
            stories = isTall ? 7 + (hash % 6) : 3 + (hash % 4);
          }
        }

        const storyHeight = 3.2;
        const height = stories * storyHeight + ((hash % 10) / 20); // subtle variation

        // Architectural warm/neutral palette
        const palette = ['#ffffff', '#fafafa', '#f5f5f4', '#f1f5f9', '#e2e8f0', '#f8fafc'];
        const color = palette[hash % palette.length];

        buildings.push({
          id: `bld-${wayId}`,
          name: tags.name,
          points,
          height,
          stories,
          color,
        });

        if (tags.name) {
          // Average center point for landmark reference
          const centerX = points.reduce((acc, p) => acc + p.x, 0) / points.length;
          const centerZ = points.reduce((acc, p) => acc + p.z, 0) / points.length;
          landmarks.push({
            id: `way-lm-${wayId}`,
            name: tags.name,
            position: { x: centerX, z: centerZ },
            type: tags.building || 'building',
          });
        }
      }
      return;
    }

    // B. ROAD / HIGHWAY
    if (tags.highway) {
      const hType = tags.highway;
      let width = 6;
      let isMajor = false;

      if (['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'].includes(hType)) {
        width = 15;
        isMajor = true;
      } else if (['secondary', 'secondary_link'].includes(hType)) {
        width = 10;
        isMajor = true;
      } else if (['tertiary', 'tertiary_link'].includes(hType)) {
        width = 8;
        isMajor = true;
      } else if (['residential', 'unclassified'].includes(hType)) {
        width = 5.5;
      } else if (['service', 'living_street'].includes(hType)) {
        width = 4;
      } else if (['footway', 'pedestrian', 'path', 'cycleway', 'steps'].includes(hType)) {
        width = 2.5;
      }

      roads.push({
        id: `road-${wayId}`,
        name: tags.name,
        points,
        width,
        type: hType,
        isMajor,
      });
      return;
    }

    // C. WATERWAYS (Gomti River, canals, lakes)
    if (
      tags.waterway ||
      tags.natural === 'water' ||
      tags.water ||
      tags.landuse === 'reservoir' ||
      tags.landuse === 'basin'
    ) {
      const isClosed = nodeRefs[0] === nodeRefs[nodeRefs.length - 1] || tags.natural === 'water';
      waterways.push({
        id: `water-${wayId}`,
        name: tags.name || 'Waterway',
        points,
        width: tags.waterway === 'river' ? 50 : tags.waterway === 'canal' ? 20 : 12,
        isPolygon: isClosed && points.length >= 3,
      });
      return;
    }

    // D. PARKS / GREEN AREAS
    const leisurePark = ['park', 'garden', 'recreation_ground', 'pitch', 'common', 'playground'].includes(
      tags.leisure || ''
    );
    const landuseGreen = ['grass', 'park', 'meadow', 'forest', 'village_green', 'cemetery', 'allotments'].includes(
      tags.landuse || ''
    );
    const naturalGreen = ['wood', 'grassland', 'scrub'].includes(tags.natural || '');

    if ((leisurePark || landuseGreen || naturalGreen) && points.length >= 3) {
      greenAreas.push({
        id: `green-${wayId}`,
        name: tags.name,
        points,
        type: tags.leisure || tags.landuse || tags.natural || 'park',
      });
      return;
    }
  });

  return {
    bounds,
    buildings,
    roads,
    waterways,
    greenAreas,
    landmarks,
    stats: {
      buildingsCount: buildings.length,
      roadsCount: roads.length,
      waterwaysCount: waterways.length,
      greenAreasCount: greenAreas.length,
      landmarksCount: landmarks.length,
      widthMeters,
      heightMeters,
    },
  };
}
