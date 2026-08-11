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

  // Classify by building type if available
  if (['garage', 'shed', 'kiosk', 'outbuilding', 'roof', 'service', 'carport'].includes(bldClass)) {
    stories = 1;
  } else {
    // Area-based baseline story counts for Lucknow
    if (area < 50) {
      // Small plots / single family residences / small shops
      stories = 1 + (hash % 2); // 1 to 2 floors
    } else if (area < 180) {
      // Typical Lucknow townhouses & residential plots
      stories = 2 + (hash % 2); // 2 to 3 floors
    } else if (area < 500) {
      // Mid-rise residential & neighborhood commercial
      stories = 3 + (hash % 2); // 3 to 4 floors
    } else if (area < 1200) {
      // Larger commercial blocks & apartments
      stories = 4 + (hash % 3); // 4 to 6 floors
    } else {
      // Institutional / Mall / Large complexes (capped conservatively at 8 floors max)
      stories = 5 + (hash % 4); // 5 to 8 floors
    }

    // Direct classification adjustments
    if (['residential', 'house', 'detached', 'terrace', 'apartments'].includes(bldClass)) {
      stories = Math.min(stories, 4);
    } else if (['commercial', 'office', 'civic', 'public', 'hospital', 'hotel', 'retail'].includes(bldClass)) {
      stories = Math.min(stories + 1, 9);
    }

    // Aspect ratio penalty for long narrow structures (corridors / boundary walls)
    if (bbox.aspectRatio > 4.5 && area < 300) {
      stories = Math.max(1, stories - 1);
    }
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
