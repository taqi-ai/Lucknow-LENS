import { OSMPoint } from '../types';

export type ManeuverType =
  | 'depart'
  | 'straight'
  | 'slight-right'
  | 'turn-right'
  | 'sharp-right'
  | 'slight-left'
  | 'turn-left'
  | 'sharp-left'
  | 'u-turn'
  | 'arrive';

export interface RouteManeuver {
  type: ManeuverType;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  location: OSMPoint;
  cumulativeDistance: number;
}

export interface RouteWaypoint {
  x: number;
  z: number;
  y?: number;
  label?: string;
  name?: string;
}

export interface NavigationRoute {
  id: string;
  start: RouteWaypoint;
  destination: RouteWaypoint;
  points: Array<{ x: number; y: number; z: number }>;
  totalDistanceMeters: number;
  estimatedDurationSeconds: number;
  maneuvers: RouteManeuver[];
}

export interface NavigatorState {
  isActive: boolean;
  isDriving: boolean;
  driveSpeedKmH: number; // e.g. 50 km/h
  progressRatio: number; // 0.0 to 1.0
  currentPosition: { x: number; y: number; z: number };
  currentHeading: number; // radians
  currentManeuverIndex: number;
  distanceRemainingMeters: number;
  timeRemainingSeconds: number;
}

export type GPSTheme = 'purple' | 'cyan' | 'neon' | 'amber';
