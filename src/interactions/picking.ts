import { BuildingFootprint, LandmarkOSM, OSMMapData, SearchResult } from '../types';
import { TileStreamer } from '../city/tileStreamer';

// Standard Raycasting Point-in-Polygon (Jordan Curve Theorem)
export function isPointInPolygon(x: number, z: number, polygon: { x: number; z: number }[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z;
    const xj = polygon[j].x, zj = polygon[j].z;
    const intersect = ((zi > z) !== (zj > z)) &&
      (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Find a landmark POI near clicked x, z
export function findClickedPOI(
  x: number, 
  z: number, 
  mapData: OSMMapData, 
  customLandmarks: SearchResult[],
  threshold = 30
): { landmark: LandmarkOSM | SearchResult; dist: number } | null {
  let closest: LandmarkOSM | SearchResult | null = null;
  let minDist = threshold;

  // Search in mapData landmarks
  mapData.landmarks.forEach(lm => {
    const dist = Math.hypot(lm.position.x - x, lm.position.z - z);
    if (dist < minDist) {
      minDist = dist;
      closest = lm;
    }
  });

  // Search in custom/cached search registry landmarks
  customLandmarks.forEach(cl => {
    const dist = Math.hypot(cl.x - x, cl.z - z);
    if (dist < minDist) {
      minDist = dist;
      closest = cl;
    }
  });

  return closest ? { landmark: closest, dist: minDist } : null;
}

// Find building containing clicked x, z
export function findClickedBuilding(
  x: number, 
  z: number, 
  mapData: OSMMapData, 
  tileStreamer: TileStreamer | null
): BuildingFootprint | null {
  // 1. Search in tileStreamer loaded buildings first (covers active streamed-in area)
  if (tileStreamer) {
    for (const b of tileStreamer.loadedBuildings.values()) {
      if (b.points && isPointInPolygon(x, z, b.points)) {
        return b;
      }
    }
  }

  // 2. Fallback: Search in mapData buildings (Hazratganj central area)
  for (const b of mapData.buildings) {
    if (b.points && isPointInPolygon(x, z, b.points)) {
      return b;
    }
  }

  return null;
}
