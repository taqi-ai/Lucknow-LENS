import * as THREE from 'three';
import { CameraController } from '../city/cameraController';
import { NavigationRoute, NavigatorState } from './types';

export class RouteDriver {
  private route: NavigationRoute | null = null;
  private cameraController: CameraController | null = null;

  private isDriving = false;
  private speedKmH = 65; // default cruising speed
  private currentDistance = 0;
  private totalDistance = 0;

  private cumulativeDists: number[] = [];
  private onUpdateCallback: ((state: NavigatorState) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;

  public followCamera = true;

  constructor() {}

  public setCameraController(ctrl: CameraController | null): void {
    this.cameraController = ctrl;
  }

  public setRoute(route: NavigationRoute | null): void {
    this.route = route;
    this.currentDistance = 0;
    this.isDriving = false;
    this.cumulativeDists = [];

    if (!route || route.points.length < 2) {
      this.totalDistance = 0;
      return;
    }

    let accum = 0;
    this.cumulativeDists.push(0);
    for (let i = 1; i < route.points.length; i++) {
      const p1 = route.points[i - 1];
      const p2 = route.points[i];
      const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      accum += d;
      this.cumulativeDists.push(accum);
    }
    this.totalDistance = accum;
  }

  public startDriving(): void {
    if (!this.route || this.totalDistance === 0) return;
    this.isDriving = true;
    if (this.currentDistance >= this.totalDistance) {
      this.currentDistance = 0;
    }
  }

  public pauseDriving(): void {
    this.isDriving = false;
  }

  public stopDriving(): void {
    this.isDriving = false;
    this.currentDistance = 0;
  }

  public setSpeed(kmH: number): void {
    this.speedKmH = Math.max(10, Math.min(200, kmH));
  }

  public seek(ratio: number): void {
    if (this.totalDistance === 0) return;
    this.currentDistance = Math.max(0, Math.min(this.totalDistance, ratio * this.totalDistance));
  }

  public onUpdate(cb: (state: NavigatorState) => void): void {
    this.onUpdateCallback = cb;
  }

  public onComplete(cb: () => void): void {
    this.onCompleteCallback = cb;
  }

  /**
   * Sample 3D position and heading along polyline at distance `d`
   */
  public sampleAtDistance(d: number): {
    pos: { x: number; y: number; z: number };
    heading: number;
    segmentIndex: number;
  } {
    if (!this.route || this.route.points.length === 0) {
      return { pos: { x: 0, y: 0, z: 0 }, heading: 0, segmentIndex: 0 };
    }

    const pts = this.route.points;
    if (pts.length === 1) {
      return { pos: pts[0], heading: 0, segmentIndex: 0 };
    }

    const clampedD = Math.max(0, Math.min(this.totalDistance, d));

    // Binary search in cumulative distances
    let low = 0;
    let high = this.cumulativeDists.length - 1;
    let segIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.cumulativeDists[mid] <= clampedD) {
        segIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (segIdx >= pts.length - 1) {
      segIdx = pts.length - 2;
    }

    const p1 = pts[segIdx];
    const p2 = pts[segIdx + 1];
    const d1 = this.cumulativeDists[segIdx];
    const d2 = this.cumulativeDists[segIdx + 1];
    const segLen = d2 - d1;

    const t = segLen > 0 ? (clampedD - d1) / segLen : 0;

    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    const z = p1.z + (p2.z - p1.z) * t;

    // Heading angle in radians (XZ plane)
    const heading = Math.atan2(p2.x - p1.x, p2.z - p1.z);

    return { pos: { x, y, z }, heading, segmentIndex: segIdx };
  }

  public update(deltaSeconds: number): NavigatorState | null {
    if (!this.route) return null;

    if (this.isDriving) {
      const speedMeterPerSec = this.speedKmH / 3.6;
      this.currentDistance += speedMeterPerSec * deltaSeconds;

      if (this.currentDistance >= this.totalDistance) {
        this.currentDistance = this.totalDistance;
        this.isDriving = false;
        if (this.onCompleteCallback) this.onCompleteCallback();
      }
    }

    const sample = this.sampleAtDistance(this.currentDistance);
    const progress = this.totalDistance > 0 ? this.currentDistance / this.totalDistance : 0;
    const distRemaining = Math.max(0, this.totalDistance - this.currentDistance);
    const timeRemaining = distRemaining / (this.speedKmH / 3.6);

    // Find active maneuver
    let activeManeuverIdx = 0;
    if (this.route.maneuvers.length > 0) {
      for (let i = 0; i < this.route.maneuvers.length; i++) {
        if (this.route.maneuvers[i].cumulativeDistance <= this.currentDistance) {
          activeManeuverIdx = i;
        } else {
          break;
        }
      }
    }

    const state: NavigatorState = {
      isActive: true,
      isDriving: this.isDriving,
      driveSpeedKmH: this.speedKmH,
      progressRatio: progress,
      currentPosition: sample.pos,
      currentHeading: sample.heading,
      currentManeuverIndex: activeManeuverIdx,
      distanceRemainingMeters: Math.round(distRemaining),
      timeRemainingSeconds: Math.round(timeRemaining),
    };

    // Third-person GTA Chase Camera follow
    if (this.isDriving && this.followCamera && this.cameraController) {
      this.updateChaseCamera(sample.pos, sample.heading);
    }

    if (this.onUpdateCallback) {
      this.onUpdateCallback(state);
    }

    return state;
  }

  /**
   * Smoothly drives the third-person chase camera behind the vehicle
   */
  private updateChaseCamera(pos: { x: number; y: number; z: number }, heading: number): void {
    if (!this.cameraController) return;

    // Follow target: slightly ahead of the vehicle
    const lookAheadDist = 18.0;
    const targetX = pos.x + Math.sin(heading) * lookAheadDist;
    const targetZ = pos.z + Math.cos(heading) * lookAheadDist;
    const targetY = pos.y + 1.8;

    // Camera chase distance and azimuth
    const cameraDist = 55.0; // Distance behind
    // In cameraController: azimuth is radians around target, pitch is angle above horizontal
    // Align azimuth directly behind heading
    const desiredAzimuth = -heading + Math.PI;
    const desiredPitch = 0.28; // ~16 degrees low-slung street angle

    // Smooth transition
    this.cameraController.transitionTo(
      new THREE.Vector3(targetX, targetY, targetZ),
      desiredAzimuth,
      desiredPitch,
      cameraDist,
      14 // fast smooth interpolation
    );
  }
}
