import {
  HazardType,
  IncidentCategory,
  IncidentSeverity,
  SpatialHazardZone,
  SpatialIncident,
  CityPulseItem,
  CityPulseCategory,
  ProviderMetadata,
  OperatingMode,
} from './types';
import { LUCKNOW_HAZARDS } from './hazardData';
import { LUCKNOW_INCIDENTS } from './incidentData';
import { LUCKNOW_CITY_PULSE } from './cityPulseData';

export class SpatialIntelligenceLayer {
  private static instance: SpatialIntelligenceLayer | null = null;

  private hazards: SpatialHazardZone[] = [...LUCKNOW_HAZARDS];
  private incidents: SpatialIncident[] = [...LUCKNOW_INCIDENTS];
  private cityPulse: CityPulseItem[] = [...LUCKNOW_CITY_PULSE];

  private mode: OperatingMode = 'demo';
  private providers: Map<string, ProviderMetadata> = new Map();

  private constructor() {
    this.initProviders();
  }

  public static getInstance(): SpatialIntelligenceLayer {
    if (!SpatialIntelligenceLayer.instance) {
      SpatialIntelligenceLayer.instance = new SpatialIntelligenceLayer();
    }
    return SpatialIntelligenceLayer.instance;
  }

  private initProviders(): void {
    const now = new Date().toISOString();
    this.providers.set('upsdma-hazards', {
      providerId: 'upsdma-hazards',
      name: 'UP State Disaster Management Authority & BIS Mapping',
      isLive: false,
      isSimulated: false,
      freshnessTimestamp: now,
      coverageArea: 'Lucknow Metropolitan Area',
      attribution: 'UPSDMA & BIS IS:1893:2016 National Hazard Atlas',
    });

    this.providers.set('lucknow-itms-incidents', {
      providerId: 'lucknow-itms-incidents',
      name: 'Lucknow Integrated Traffic Management System (ITMS)',
      isLive: true,
      isSimulated: true, // Operating with realistic simulated incident stream
      freshnessTimestamp: now,
      coverageArea: 'Lucknow City Core & Major Arterial Corridors',
      attribution: 'Lucknow ITMS & City Police Traffic Feed',
    });

    this.providers.set('city-pulse-bulletins', {
      providerId: 'city-pulse-bulletins',
      name: 'Lucknow District Information & Municipal Bulletin',
      isLive: true,
      isSimulated: true,
      freshnessTimestamp: now,
      coverageArea: 'All 8 Administrative Zones of Lucknow',
      attribution: 'LMC, UPMRC, NR & Adani Airports Public Relations',
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HAZARD INTELLIGENCE QUERIES
  // ───────────────────────────────────────────────────────────────────────────

  public getHazards(type?: HazardType): SpatialHazardZone[] {
    if (!type) return this.hazards;
    return this.hazards.filter((h) => h.hazardType === type);
  }

  public getHazardById(id: string): SpatialHazardZone | undefined {
    return this.hazards.find((h) => h.id === id);
  }

  /** Checks if point (x, z) falls inside any hazard polygon (Ray-casting point in polygon) */
  public findHazardsContainingPoint(x: number, z: number): SpatialHazardZone[] {
    const hits: SpatialHazardZone[] = [];
    for (const h of this.hazards) {
      if (this.pointInPolygon(x, z, h.geometry)) {
        hits.push(h);
      }
    }
    return hits;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIVE INCIDENT INTELLIGENCE QUERIES
  // ───────────────────────────────────────────────────────────────────────────

  public getIncidents(category?: IncidentCategory, severity?: IncidentSeverity): SpatialIncident[] {
    let result = this.incidents;
    if (category) {
      result = result.filter((i) => i.type === category);
    }
    if (severity) {
      result = result.filter((i) => i.severity === severity);
    }
    return result;
  }

  public getIncidentById(id: string): SpatialIncident | undefined {
    return this.incidents.find((i) => i.id === id);
  }

  public getBlockingIncidents(): SpatialIncident[] {
    return this.incidents.filter((i) => i.blocksTraffic && i.status !== 'cleared');
  }

  /**
   * Evaluates if a given navigation polyline intersects with any active road incidents.
   */
  public evaluateRouteIncidentImpact(
    routePoints: Array<{ x: number; z: number }>
  ): {
    impacted: boolean;
    incidents: SpatialIncident[];
    totalEstimatedDelayMinutes: number;
    avoidableAlternateSuggested: boolean;
  } {
    const impactedIncidents: SpatialIncident[] = [];
    let totalDelay = 0;

    for (const inc of this.incidents) {
      if (inc.status === 'cleared') continue;

      // Proximity check along route points (within 60m of incident)
      for (const pt of routePoints) {
        const dist = Math.hypot(pt.x - inc.x, pt.z - inc.z);
        if (dist < 60) {
          if (!impactedIncidents.some((x) => x.id === inc.id)) {
            impactedIncidents.push(inc);
            totalDelay += inc.estimatedDelayMinutes || 5;
          }
          break;
        }
      }
    }

    return {
      impacted: impactedIncidents.length > 0,
      incidents: impactedIncidents,
      totalEstimatedDelayMinutes: totalDelay,
      avoidableAlternateSuggested: impactedIncidents.some((i) => i.blocksTraffic),
    };
  }

  public checkRouteIncidents(routePoints: Array<{ x: number; z: number }>): SpatialIncident[] {
    return this.evaluateRouteIncidentImpact(routePoints).incidents;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CITY PULSE LOCATION-BASED NEWS QUERIES
  // ───────────────────────────────────────────────────────────────────────────

  public getCityPulse(category?: CityPulseCategory): CityPulseItem[] {
    if (!category) return this.cityPulse;
    return this.cityPulse.filter((p) => p.category === category);
  }

  public getCityPulseById(id: string): CityPulseItem | undefined {
    return this.cityPulse.find((p) => p.id === id);
  }

  /**
   * Finds news updates geographically closest to camera or selected coordinate
   */
  public getCityPulseNear(x: number, z: number, radiusMeters: number = 3500): CityPulseItem[] {
    return this.cityPulse
      .map((item) => ({
        item,
        distance: Math.hypot(item.x - x, item.z - z),
      }))
      .filter((entry) => entry.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance)
      .map((entry) => entry.item);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // OPERATING MODE & DATA PROVENANCE
  // ───────────────────────────────────────────────────────────────────────────

  public setOperatingMode(mode: OperatingMode): void {
    this.mode = mode;
  }

  public getOperatingMode(): OperatingMode {
    return this.mode;
  }

  public getProviders(): ProviderMetadata[] {
    return Array.from(this.providers.values());
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GEOMETRIC UTILITIES
  // ───────────────────────────────────────────────────────────────────────────

  private pointInPolygon(
    px: number,
    pz: number,
    polygon: Array<{ x: number; z: number }>
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, zi = polygon[i].z;
      const xj = polygon[j].x, zj = polygon[j].z;

      const intersect =
        zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

export const SIL = SpatialIntelligenceLayer.getInstance();
