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

export type CameraPreset = 'overview' | 'neighborhood' | 'street' | 'top' | 'frame';

