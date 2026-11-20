import { project, unproject } from '../geo/projection';
import { RoadGraph } from './roadGraph';
import { NavigationRoute } from './types';

export interface GPSPosition {
  lat: number;
  lon: number;
  x: number;
  z: number;
  accuracyMeters: number;
  heading: number | null;
  speedMps: number | null;
  timestamp: number;
  isSimulated: boolean;
}

export interface RerouteEvent {
  currentPosition: GPSPosition;
  snappedPosition: { x: number; z: number };
  deviationDistance: number;
  reason: string;
}

export type GPSStatus = 'idle' | 'requesting' | 'tracking' | 'simulating' | 'denied' | 'unavailable';

export class GPSService {
  private static instance: GPSService | null = null;

  private roadGraph: RoadGraph | null = null;
  private watchId: number | null = null;
  private status: GPSStatus = 'idle';
  private currentPosition: GPSPosition | null = null;
  private currentRoute: NavigationRoute | null = null;

  private deviationThresholdMeters = 65; // Trigger reroute when user > 65m away from route polyline
  private consecutiveDeviations = 0;
  private lastRerouteTime = 0;

  private onPositionCallback: ((pos: GPSPosition) => void) | null = null;
  private onRerouteNeededCallback: ((event: RerouteEvent) => void) | null = null;
  private onStatusCallback: ((status: GPSStatus, message?: string) => void) | null = null;

  // Simulation properties
  private simIntervalId: any = null;
  private simDistance = 0;

  constructor(roadGraph?: RoadGraph) {
    if (roadGraph) {
      this.roadGraph = roadGraph;
    }
  }

  public static getInstance(roadGraph?: RoadGraph): GPSService {
    if (!GPSService.instance) {
      GPSService.instance = new GPSService(roadGraph);
    } else if (roadGraph) {
      GPSService.instance.setRoadGraph(roadGraph);
    }
    return GPSService.instance;
  }

  public setRoadGraph(graph: RoadGraph): void {
    this.roadGraph = graph;
  }

  public getStatus(): GPSStatus {
    return this.status;
  }

  public getCurrentPosition(): GPSPosition | null {
    return this.currentPosition;
  }

  public setActiveRoute(route: NavigationRoute | null): void {
    this.currentRoute = route;
    this.consecutiveDeviations = 0;
  }

  public onPosition(cb: (pos: GPSPosition) => void): void {
    this.onPositionCallback = cb;
  }

  public onRerouteNeeded(cb: (event: RerouteEvent) => void): void {
    this.onRerouteNeededCallback = cb;
  }

  public onStatusChange(cb: (status: GPSStatus, message?: string) => void): void {
    this.onStatusCallback = cb;
  }

  public async startTracking(): Promise<boolean> {
    return this.startRealGPSTracking();
  }

  /**
   * Starts real device geolocation tracking via Browser Geolocation API.
   * Gracefully falls back if denied or unavailable.
   */
  public async startRealGPSTracking(): Promise<boolean> {
    this.stopTracking();

    if (typeof window === 'undefined' || !navigator.geolocation) {
      this.setStatus('unavailable', 'Geolocation is not supported by your browser environment.');
      return false;
    }

    this.setStatus('requesting', 'Requesting location permission...');

    return new Promise<boolean>((resolve) => {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const { x, z } = project(lat, lon);

          const gpsPos: GPSPosition = {
            lat,
            lon,
            x,
            z,
            accuracyMeters: pos.coords.accuracy,
            heading: pos.coords.heading,
            speedMps: pos.coords.speed,
            timestamp: pos.timestamp,
            isSimulated: false,
          };

          this.currentPosition = gpsPos;
          this.setStatus('tracking', 'Live GPS Lock Active');
          this.onPositionCallback?.(gpsPos);

          this.checkRouteDeviation(gpsPos);
          resolve(true);
        },
        (err) => {
          console.warn('[GPSService] Geolocation error:', err.message);
          if (err.code === err.PERMISSION_DENIED) {
            this.setStatus('denied', 'Location permission was denied. Switched to Simulation Mode.');
          } else {
            this.setStatus('unavailable', `GPS signal lost: ${err.message}. Ready for Simulation Mode.`);
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 10000,
        }
      );
    });
  }

  /**
   * Starts an interactive simulated GPS driver that moves along the route or
   * simulates a sudden off-route deviation for testing rerouting.
   */
  public startSimulatedTracking(
    startPos?: { x: number; z: number },
    simulateDeviationAtRatio: number = 0.45
  ): void {
    this.stopTracking();
    this.setStatus('simulating', 'GPS Simulation Mode Active');

    let initX = startPos?.x ?? (this.currentRoute?.points[0]?.x ?? -382);
    let initZ = startPos?.z ?? (this.currentRoute?.points[0]?.z ?? 372);
    const coords = unproject(initX, initZ);

    this.currentPosition = {
      lat: coords.lat,
      lon: coords.lon,
      x: initX,
      z: initZ,
      accuracyMeters: 5,
      heading: 0,
      speedMps: 14, // ~50 km/h
      timestamp: Date.now(),
      isSimulated: true,
    };
    this.onPositionCallback?.(this.currentPosition);

    this.simDistance = 0;
    const speedMps = 14;

    this.simIntervalId = setInterval(() => {
      if (!this.currentRoute || this.currentRoute.points.length < 2) return;

      const totalDist = this.currentRoute.totalDistanceMeters;
      this.simDistance += speedMps * 0.5; // step every 500ms
      const progress = Math.min(1.0, this.simDistance / (totalDist || 1));

      // Simulate a realistic deviation turn when passing trigger ratio
      let sampleX: number;
      let sampleZ: number;

      if (progress > simulateDeviationAtRatio && progress < simulateDeviationAtRatio + 0.15) {
        // Driver takes a wrong left turn away from route
        const basePt = this.samplePolyline(this.currentRoute.points, progress);
        sampleX = basePt.x + 110; // 110m deviation away from road
        sampleZ = basePt.z + 110;
      } else {
        const basePt = this.samplePolyline(this.currentRoute.points, progress);
        sampleX = basePt.x;
        sampleZ = basePt.z;
      }

      const pCoords = unproject(sampleX, sampleZ);
      const updatedPos: GPSPosition = {
        lat: pCoords.lat,
        lon: pCoords.lon,
        x: sampleX,
        z: sampleZ,
        accuracyMeters: 4,
        heading: 0,
        speedMps: speedMps,
        timestamp: Date.now(),
        isSimulated: true,
      };

      this.currentPosition = updatedPos;
      this.onPositionCallback?.(updatedPos);

      this.checkRouteDeviation(updatedPos);

      if (progress >= 1.0) {
        this.stopTracking();
      }
    }, 500);
  }

  public stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation?.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.simIntervalId !== null) {
      clearInterval(this.simIntervalId);
      this.simIntervalId = null;
    }
    this.setStatus('idle', 'Tracking stopped');
  }

  private setStatus(status: GPSStatus, message?: string): void {
    this.status = status;
    this.onStatusCallback?.(status, message);
  }

  public simulateDeviation(): void {
    if (!this.currentPosition && this.currentRoute?.points.length) {
      const p = this.currentRoute.points[0];
      const coords = unproject(p.x, p.z);
      this.currentPosition = {
        lat: coords.lat,
        lon: coords.lon,
        x: p.x,
        z: p.z,
        accuracyMeters: 5,
        heading: 0,
        speedMps: 15,
        timestamp: Date.now(),
        isSimulated: true,
      };
    }
    if (this.currentPosition) {
      // Shift 120m away to trigger reroute
      const shiftedX = this.currentPosition.x + 120;
      const shiftedZ = this.currentPosition.z + 120;
      const coords = unproject(shiftedX, shiftedZ);
      const devPos: GPSPosition = {
        ...this.currentPosition,
        lat: coords.lat,
        lon: coords.lon,
        x: shiftedX,
        z: shiftedZ,
        isSimulated: true,
      };
      this.currentPosition = devPos;
      this.onPositionCallback?.(devPos);
      this.consecutiveDeviations = 2; // Force trigger
      this.lastRerouteTime = 0;
      let snapPt = { x: shiftedX, z: shiftedZ };
      if (this.roadGraph) {
        const nearestRes = this.roadGraph.findNearestNode(shiftedX, shiftedZ);
        if (nearestRes) {
          const n = this.roadGraph.nodes[nearestRes.nodeId];
          if (n) snapPt = { x: n.x, z: n.z };
        }
      }
      this.onRerouteNeededCallback?.({
        currentPosition: devPos,
        snappedPosition: snapPt,
        deviationDistance: 120,
        reason: 'Route updated. You deviated 120m from the planned path. An alternative path has been calculated.',
      });
    }
  }

  /**
   * Calculates perpendicular minimum distance from current position to route polyline.
   * If distance exceeds threshold consecutively, fires onRerouteNeeded.
   */
  private checkRouteDeviation(pos: GPSPosition): void {
    if (!this.currentRoute || this.currentRoute.points.length < 2) return;

    // Throttle rerouting triggers to once every 6 seconds
    const now = Date.now();
    if (now - this.lastRerouteTime < 6000) return;

    let minDistance = Infinity;
    const pts = this.currentRoute.points;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const d = this.distToSegment(pos.x, pos.z, p1.x, p1.z, p2.x, p2.z);
      if (d < minDistance) minDistance = d;
    }

    if (minDistance > this.deviationThresholdMeters) {
      this.consecutiveDeviations++;
      if (this.consecutiveDeviations >= 2) {
        this.lastRerouteTime = now;
        this.consecutiveDeviations = 0;
        let snapPt = { x: pos.x, z: pos.z };
        if (this.roadGraph) {
          const nearestRes = this.roadGraph.findNearestNode(pos.x, pos.z);
          if (nearestRes) {
            const n = this.roadGraph.nodes[nearestRes.nodeId];
            if (n) snapPt = { x: n.x, z: n.z };
          }
        }
        this.onRerouteNeededCallback?.({
          currentPosition: pos,
          snappedPosition: snapPt,
          deviationDistance: minDistance,
          reason: `Route updated. You deviated ${Math.round(minDistance)}m from the planned path. An alternative route has been recalculated.`,
        });
      }
    } else {
      this.consecutiveDeviations = 0;
    }
  }

  private distToSegment(
    px: number,
    pz: number,
    x1: number,
    z1: number,
    x2: number,
    z2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1);
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);
    let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), pz - (z1 + t * (z2 - z1)));
  }

  private samplePolyline(
    pts: Array<{ x: number; y: number; z: number }>,
    ratio: number
  ): { x: number; z: number } {
    if (pts.length === 0) return { x: 0, z: 0 };
    if (pts.length === 1 || ratio <= 0) return { x: pts[0].x, z: pts[0].z };
    if (ratio >= 1.0) return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };

    let totalLen = 0;
    const dists: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      dists.push(totalLen);
    }

    const targetDist = ratio * totalLen;
    for (let i = 1; i < dists.length; i++) {
      if (dists[i] >= targetDist) {
        const segLen = dists[i] - dists[i - 1];
        const segRatio = segLen > 0 ? (targetDist - dists[i - 1]) / segLen : 0;
        const p1 = pts[i - 1];
        const p2 = pts[i];
        return {
          x: p1.x + (p2.x - p1.x) * segRatio,
          z: p1.z + (p2.z - p1.z) * segRatio,
        };
      }
    }
    return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };
  }
}
