export interface Vector2D {
  x: number;
  z: number;
}

export interface OSMPoint {
  x: number;
  z: number;
}

export interface BuildingFootprint {
  id: string;
  name?: string;
  points: OSMPoint[];
  height: number;
  stories: number;
  color: string;
  detailLevel?: 'simple' | 'medium' | 'detailed';
}

export interface RoadSegmentOSM {
  id: string;
  name?: string;
  points: OSMPoint[];
  width: number;
  type: string;
  isMajor: boolean;
}

export interface WaterwayOSM {
  id: string;
  name?: string;
  points: OSMPoint[];
  width?: number;
  isPolygon: boolean;
}

export interface GreenAreaOSM {
  id: string;
  name?: string;
  points: OSMPoint[];
  type: string;
}

export interface LandmarkOSM {
  id: string;
  name: string;
  position: OSMPoint;
  type: string;
}

export interface OSMBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  centerLat: number;
  centerLon: number;
  widthMeters: number;
  heightMeters: number;
}

export interface OSMMapData {
  bounds: OSMBounds;
  buildings: BuildingFootprint[];
  roads: RoadSegmentOSM[];
  waterways: WaterwayOSM[];
  greenAreas: GreenAreaOSM[];
  landmarks: LandmarkOSM[];
  stats: {
    buildingsCount: number;
    roadsCount: number;
    waterwaysCount: number;
    greenAreasCount: number;
    landmarksCount: number;
    widthMeters: number;
    heightMeters: number;
  };
}

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export type CameraPreset =
  | 'fullcity' | 'overview' | 'neighborhood' | 'street' | 'top' | 'frame'
  /** Cinematic framings over the same real city — see CAMERA_PRESETS. */
  | 'hero' | 'gomti' | 'hazratganj' | 'ekana' | 'oldlucknow' | 'charbagh';

export type LODLevel = 0 | 1 | 2 | 3;

export interface TileBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TileManifestItem {
  id: string;
  tileX: number;
  tileZ: number;
  bounds: TileBounds;
  center: { x: number; z: number };
  bldgsLOD1?: number;
  bldgsLOD2?: number;
  roadsCount: number;
  treesCount: number;
}

export interface OverviewData {
  majorRoads: RoadSegmentOSM[];
  waterways: WaterwayOSM[];
  greenAreas: GreenAreaOSM[];
  buildingDensityBlocks: Array<{ x: number; z: number; density: number; avgHeight?: number }>;
  landmarks: LandmarkOSM[];
}

export interface TileManifest {
  version: string;
  generatedAt: string;
  tileSize: number;
  centerLat: number;
  centerLon: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  spatialExtent: { minX: number; maxX: number; minZ: number; maxZ: number };
  totalTiles: number;
  tiles: TileManifestItem[];
}

export interface TileJSONData {
  id: string;
  tileX: number;
  tileZ: number;
  bounds: TileBounds;
  center: { x: number; z: number };
  lod1: {
    buildings: BuildingFootprint[];
    roads: RoadSegmentOSM[];
    waterways: WaterwayOSM[];
    greenAreas: GreenAreaOSM[];
  };
  lod2: {
    buildings: BuildingFootprint[];
    roads: RoadSegmentOSM[];
    waterways: WaterwayOSM[];
    greenAreas: GreenAreaOSM[];
    trees: Array<{ x: number; y: number; z: number; scale: number }>;
  };
  landmarks: LandmarkOSM[];
}

export interface BoundaryDebugInfo {
  camX: number;
  camZ: number;
  distToEdge: number;
  insidePlayable: boolean;
  horizonActive: boolean;
}

export interface CityStreamingStats {
  loadedTiles: number;
  visibleTiles: number;
  totalBuildings: number;
  totalRoads: number;
  totalTrees: number;
  currentLOD: LODLevel;
  zoomScaleName: 'FULL CITY' | 'DISTRICT' | 'NEIGHBORHOOD' | 'STREET';
  stableMode: boolean;
  pendingLoads: number;
  boundaryDebug?: BoundaryDebugInfo;
}
export interface SearchResult {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  x: number;
  z: number;
  importance: number;
}

export type SelectedEntityType = 'building' | 'poi' | 'aircraft';

export interface SelectedEntity {
  type: SelectedEntityType;
  id: string;
  name: string;
  details: Record<string, any>;
  latitude: number;
  longitude: number;
  x: number;
  z: number;
}

/** Freshness of a live feed. There is no state meaning "made up". */
export type LiveFeedStatus = 'ok' | 'stale' | 'unavailable';

/**
 * An aircraft as the renderer sees it. Named SimulatedFlight for continuity with
 * the original prototype, but every instance now originates from real ADS-B via
 * /api/live/flights; only the position between polls is dead-reckoned.
 */
export interface SimulatedFlight {
  id: string;
  /** Callsign where ADS-B provides one, otherwise the ICAO 24-bit address. */
  airline: string;
  altitude: number;
  /** Ground speed in m/s. */
  speed: number;
  heading: number;
  /** Origin country from the ADS-B registry; route origin is not available. */
  origin: string;
  destination: string;
  x: number;
  z: number;
  progress: number;
  onGround?: boolean;
  verticalRate?: number | null;
  positionTime?: number | null;
}

export interface AIAction {
  type: 'FLY_TO' | 'ENABLE_LAYER' | 'DISABLE_LAYER' | 'NONE';
  latitude?: number;
  longitude?: number;
  layer?: string;
}

export interface AIResponse {
  answer: string;
  sources: string[];
  action?: AIAction;
}
