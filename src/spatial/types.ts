/**
 * SPATIAL INTELLIGENCE LAYER (SIL) — Unified Type Definitions
 * 
 * Provides a standardized geographical reference schema for Lucknow Lens:
 * - Navigation & Routes
 * - Natural Disaster & Hazard Zones
 * - Live City Incidents & Traffic Blockages
 * - City Pulse Location-Based News
 * - Data Provider & Verification Provenance
 */

export type HazardType =
  | 'flood'
  | 'earthquake'
  | 'rainfall'
  | 'waterlogging'
  | 'heatwave';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very-high';

export interface SpatialPolygonPoint {
  lat: number;
  lon: number;
  x: number;
  z: number;
}

export interface SpatialHazardZone {
  id: string;
  hazardType: HazardType;
  name: string;
  riskLevel: RiskLevel;
  affectedAreaName: string;
  geometry: SpatialPolygonPoint[];
  centroid: { lat: number; lon: number; x: number; z: number };
  description: string;
  historicalContext: string;
  defensibleParameters: Record<string, string | number>;
  dataSource: string;
  lastUpdated: string;
  isSimulated: boolean;
}

export type IncidentCategory =
  | 'accident'
  | 'fire'
  | 'waterlogging'
  | 'road-closure'
  | 'infrastructure'
  | 'emergency';

export type IncidentSeverity = 'critical' | 'major' | 'moderate' | 'info';

export interface SpatialIncident {
  id: string;
  type: IncidentCategory;
  title: string;
  severity: IncidentSeverity;
  status: 'reported' | 'investigating' | 'active-response' | 'cleared';
  latitude: number;
  longitude: number;
  x: number;
  z: number;
  locationName: string;
  description: string;
  affectedRoadIds: string[];
  blocksTraffic: boolean;
  estimatedDelayMinutes?: number;
  source: string;
  timestamp: string;
  verified: boolean;
  isSimulated: boolean;
}

export type CityPulseCategory =
  | 'traffic'
  | 'weather'
  | 'safety'
  | 'infrastructure'
  | 'transport'
  | 'local'
  | 'announcement';

export interface CityPulseItem {
  id: string;
  headline: string;
  summary: string;
  category: CityPulseCategory;
  latitude: number;
  longitude: number;
  x: number;
  z: number;
  affectedArea: string;
  source: string;
  publishedAt: string;
  verificationStatus: 'verified' | 'official-bulletin' | 'simulated';
  isSimulated: boolean;
  relatedEntityId?: string;
}

export interface ProviderMetadata {
  providerId: string;
  name: string;
  isLive: boolean;
  isSimulated: boolean;
  freshnessTimestamp: string;
  coverageArea: string;
  attribution: string;
}

export type OperatingMode = 'demo' | 'live';
