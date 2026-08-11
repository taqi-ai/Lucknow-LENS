import { OSMMapData, OSMPoint, OSMBounds, BuildingFootprint, RoadSegmentOSM, WaterwayOSM, GreenAreaOSM, LandmarkOSM } from '../types';
import { estimateBuildingHeight } from '../city/buildingHeightEstimator';

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function parseOvertureGeoJSON(): Promise<OSMMapData> {
  const [bldgsRes, roadsRes, placesRes] = await Promise.all([
    fetch('/overture/lucknow_buildings.geojson'),
    fetch('/overture/lucknow_roads.geojson'),
    fetch('/overture/lucknow_places.geojson')
  ]);

  if (!bldgsRes.ok || !roadsRes.ok || !placesRes.ok) {
    throw new Error('Failed to load Overture GeoJSON files from /overture/ directory.');
  }

  const [bldgsGeo, roadsGeo, placesGeo] = await Promise.all([
    bldgsRes.json(),
    roadsRes.json(),
    placesRes.json()
  ]);

  // Use the exact bounds we used to download Overture Data
  const minLon = 80.935;
  const maxLon = 80.955;
  const minLat = 26.840;
  const maxLat = 26.855;

  // 2. Coordinate System Projection Setup (Same as osmParser)
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const mPerLat = 111320; // Meters per degree latitude
  const mPerLon = 111320 * Math.cos((centerLat * Math.PI) / 180); // Meters per degree longitude

  function project(lon: number, lat: number): OSMPoint {
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

  const buildings: BuildingFootprint[] = [];
  const roads: RoadSegmentOSM[] = [];
  const waterways: WaterwayOSM[] = [];
  const greenAreas: GreenAreaOSM[] = [];
  const landmarks: LandmarkOSM[] = [];

  // Parse Buildings
  if (bldgsGeo.features) {
    for (const feat of bldgsGeo.features) {
      if (feat.geometry && feat.geometry.type === 'Polygon') {
        const coords = feat.geometry.coordinates[0]; // exterior ring
        if (!coords || coords.length < 3) continue;

        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const bldId = feat.properties?.id || `bld-${Math.random()}`;
        
        const est = estimateBuildingHeight({
          id: bldId,
          points,
          properties: feat.properties || {},
        });

        buildings.push({
          id: bldId,
          name: feat.properties?.names?.primary || undefined,
          points,
          height: est.height,
          stories: est.stories,
          color: est.color,
          detailLevel: est.detailLevel,
        });
      } else if (feat.geometry && feat.geometry.type === 'MultiPolygon') {
        // Handle multipolygons simply by taking the first polygon
        const coords = feat.geometry.coordinates[0][0]; 
        if (!coords || coords.length < 3) continue;

        const points = coords.map((c: number[]) => project(c[0], c[1]));
        const bldId = feat.properties?.id || `bld-${Math.random()}`;
        
        const est = estimateBuildingHeight({
          id: bldId,
          points,
          properties: feat.properties || {},
        });

        buildings.push({
          id: bldId,
          name: feat.properties?.names?.primary || undefined,
          points,
          height: est.height,
          stories: est.stories,
          color: est.color,
          detailLevel: est.detailLevel,
        });
      }
    }
  }

  // Parse Roads
  if (roadsGeo.features) {
    for (const feat of roadsGeo.features) {
      if (feat.geometry && feat.geometry.type === 'LineString') {
        const coords = feat.geometry.coordinates;
        if (!coords || coords.length < 2) continue;

        const points = coords.map((c: number[]) => project(c[0], c[1]));
        
        const hType = feat.properties?.class || 'residential';
        const subtype = feat.properties?.subtype || 'road';
        let width = 6;
        let isMajor = false;

        if (['motorway', 'primary', 'trunk'].includes(hType)) {
          width = 15;
          isMajor = true;
        } else if (['secondary'].includes(hType)) {
          width = 10;
          isMajor = true;
        } else if (['tertiary'].includes(hType)) {
          width = 8;
          isMajor = true;
        } else if (['residential', 'unclassified'].includes(hType)) {
          width = 5.5;
        } else if (['path', 'footway', 'pedestrian'].includes(hType) || subtype === 'footpath') {
          width = 2.5;
        }

        roads.push({
          id: feat.properties?.id || `road-${Math.random()}`,
          name: feat.properties?.names?.primary || undefined,
          points,
          width,
          type: hType,
          isMajor,
        });
      }
    }
  }

  // Parse Places (Landmarks)
  if (placesGeo.features) {
    let limit = 0; // limit POIs for verification as requested
    for (const feat of placesGeo.features) {
      if (feat.geometry && feat.geometry.type === 'Point' && feat.properties?.names?.primary) {
        if (limit > 50) break; // Render a small number of POIs
        const coords = feat.geometry.coordinates;
        
        const type = feat.properties?.categories?.primary || 'landmark';

        landmarks.push({
          id: feat.properties?.id || `place-${Math.random()}`,
          name: feat.properties.names.primary,
          position: project(coords[0], coords[1]),
          type: type,
        });
        limit++;
      }
    }
  }

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
