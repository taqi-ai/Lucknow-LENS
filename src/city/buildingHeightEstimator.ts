import { OSMPoint } from '../types';

export interface HeightEstimationInput {
  id: string;
  points: OSMPoint[];
  properties?: Record<string, any>;
}

export interface HeightEstimationResult {
  height: number;
  stories: number;
  isRealData: boolean;
  detailLevel: 'simple' | 'medium' | 'detailed';
  color: string;
  area: number;
}

function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function calculateFootprintArea(points: OSMPoint[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].z;
    area -= points[j].x * points[i].z;
  }
  return Math.abs(area) / 2;
}

function calculateBoundingBox(points: OSMPoint[]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const width = Math.max(0.1, maxX - minX);
  const depth = Math.max(0.1, maxZ - minZ);
  const aspectRatio = Math.max(width, depth) / Math.min(width, depth);
  return { width, depth, aspectRatio, minX, maxX, minZ, maxZ };
}

export function estimateBuildingHeight(input: HeightEstimationInput): HeightEstimationResult {
  const { id, points, properties = {} } = input;
  const hash = stringHash(id);

  // 1. Calculate Footprint Metrics
  const area = calculateFootprintArea(points);
  const bbox = calculateBoundingBox(points);

  // Colors palette (warm architectural neutral shades)
  const palette = ['#ffffff', '#fafafa', '#f5f5f4', '#f1f5f9', '#e2e8f0', '#f8fafc'];
  const color = palette[hash % palette.length];

  // -------------------------------------------------------------
  // PRIORITY 1: EXPLICIT REAL OVERTURE / OSM HEIGHT OR FLOORS
  // -------------------------------------------------------------
  const explicitHeight = properties.height ?? properties.height_m ?? properties.height_meters;
  if (typeof explicitHeight === 'number' && explicitHeight > 0) {
    const stories = Math.max(1, Math.round(explicitHeight / 3.2));
    const detailLevel = area < 100 ? 'simple' : area < 400 ? 'medium' : 'detailed';
    return {
      height: explicitHeight,
      stories,
      isRealData: true,
      detailLevel,
      color,
      area,
    };
  }

  const explicitFloors = properties.num_floors ?? properties.num_levels ?? properties.levels ?? properties.stories;
  if (typeof explicitFloors === 'number' && explicitFloors > 0) {
    const stories = Math.max(1, Math.round(explicitFloors));
    const height = stories * 3.2;
    const detailLevel = area < 100 ? 'simple' : area < 400 ? 'medium' : 'detailed';
    return {
      height,
      stories,
      isRealData: true,
      detailLevel,
      color,
      area,
    };
  }

  // -------------------------------------------------------------
  // PRIORITY 2: CONSERVATIVE DETERMINISTIC ESTIMATION FOR LUCKNOW
  // -------------------------------------------------------------
  const bldClass = String(
    properties.class || properties.subtype || properties.building || properties.category || ''
  ).toLowerCase();

  let stories = 2;

  // Spatial Bias: Gomti Nagar / newer developments are roughly located in the east/southeast.
  // Assuming city center is near (0,0), positive X and positive Z bias towards newer taller structures.
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerZ = (bbox.minZ + bbox.maxZ) / 2;
  // A pseudo "modern zone" score based on location
  const isModernZone = (centerX > 3000 && centerZ > -2000) || (hash % 100 < 5); // 5% chance anywhere, or specific geographic bias

  // Deterministic random float [0, 1] for probability thresholds
  const rand = (hash % 1000) / 1000;

  if (['garage', 'shed', 'kiosk', 'outbuilding', 'roof', 'service', 'carport'].includes(bldClass)) {
    stories = 1;
  } else if (['commercial', 'office', 'civic', 'public', 'hospital', 'hotel', 'retail'].includes(bldClass)) {
    if (area < 200) stories = rand < 0.6 ? 2 : 3;
    else if (area < 800) stories = rand < 0.4 ? 3 : rand < 0.8 ? 4 : 5;
    else stories = rand < 0.5 ? 4 : rand < 0.8 ? 6 : 8;
  } else if (['apartments', 'residential_complex'].includes(bldClass) || (isModernZone && area > 600)) {
    if (area < 500) stories = rand < 0.5 ? 4 : 5;
    else if (area < 1500) stories = rand < 0.4 ? 6 : rand < 0.8 ? 8 : 12;
    else {
      // High rise clusters (Rare)
      stories = rand < 0.5 ? 10 : rand < 0.85 ? 15 : 22; // Skyline accents
    }
  } else {
    // Normal Urban Fabric (The 70-80% bulk of the city)
    if (area < 150) {
      // Small plots: 75% 1-2 floors, 25% 3 floors
      if (rand < 0.4) stories = 1;
      else if (rand < 0.85) stories = 2;
      else stories = 3;
    } else if (area < 350) {
      // Medium plots: 50% 2 floors, 40% 3 floors, 10% 4 floors
      if (rand < 0.5) stories = 2;
      else if (rand < 0.9) stories = 3;
      else stories = 4;
    } else if (area < 800) {
      // Large normal plots
      if (rand < 0.6) stories = 3;
      else if (rand < 0.9) stories = 4;
      else stories = 5;
    } else {
      // Very large unclassified footprints
      if (rand < 0.7) stories = 3;
      else if (rand < 0.95) stories = 4;
      else stories = 6;
    }
  }

  // Aspect ratio penalty for long narrow structures (corridors / boundary walls)
  if (bbox.aspectRatio > 4.5 && area < 300) {
    stories = Math.max(1, stories - 1);
  }

  // Controlled deterministic height jitter (+/- 0.2m to 0.8m) to avoid step-like uniform roofs
  const jitter = ((hash % 10) / 10) * 0.8 - 0.4;
  const storyHeight = 3.2;
  const height = Math.max(3.0, stories * storyHeight + jitter);

  // Detail level assignment
  const detailLevel = area < 100 ? 'simple' : area < 400 ? 'medium' : 'detailed';

  return {
    height,
    stories,
    isRealData: false,
    detailLevel,
    color,
    area,
  };
}
