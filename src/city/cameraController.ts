import * as THREE from 'three';
import { project } from '../geo/projection';
import { performanceConfig } from './performanceConfig';

export const CAMERA_CONFIG = {
  MIN_DISTANCE: 20,
  MAX_DISTANCE: 60000,
  MIN_PITCH: 0.05,
  MAX_PITCH: Math.PI / 2 - 0.01,
  GROUND_Y: 0,
  CAMERA_CLEARANCE: 2,
  DEFAULT_RESPONSIVENESS: 40,
};

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;

  // Actual State
  public target = new THREE.Vector3(0, 0, 0);
  public azimuth = 0; // 0 = looking North (camera at +Z)
  public pitch = Math.PI / 4; // 0 = horizontal, PI/2 = top down
  public distance = 5000;

  // Desired State for Damping
  public destTarget = new THREE.Vector3(0, 0, 0);
  public destAzimuth = 0;
  private destPitch = Math.PI / 4;
  private destDistance = 5000;

  // Responsiveness (0 to 100 scale, default 40)
  private _moveResponsiveness: number = CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
  private _zoomResponsiveness: number = CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;

  // Input state
  private isDragging = false;
  private dragMode: 'pan' | 'rotate' | null = null;
  private lastMouse = new THREE.Vector2();

  // Touch state. Tracked per pointerId because a phone has no wheel and no right
  // button: pinch is the only zoom, and two-finger drag is the only rotate/tilt.
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinchMidpoint = new THREE.Vector2();

  // Presets
  private presetActive = false;
  private presetStartTime = 0;
  private presetDuration = 0;
  private startState = { target: new THREE.Vector3(), azimuth: 0, pitch: 0, distance: 0 };
  private endState = { target: new THREE.Vector3(), azimuth: 0, pitch: 0, distance: 0 };

  // Soft position boundary — constrains destTarget XZ only
  private hasBounds = false;
  private boundsMinX = -Infinity;
  private boundsMaxX = Infinity;
  private boundsMinZ = -Infinity;
  private boundsMaxZ = Infinity;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Set initial derived state
    this.updateCameraTransform();

    this.attachEvents();
  }

  public get moveResponsiveness(): number {
    return Number.isFinite(this._moveResponsiveness) ? this._moveResponsiveness : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
  }

  public setMoveResponsiveness(val: number): void {
    const num = Number(val);
    if (!Number.isFinite(num)) {
      this._moveResponsiveness = CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
    } else {
      this._moveResponsiveness = Math.max(0, Math.min(100, Math.round(num)));
    }
  }

  public get zoomResponsiveness(): number {
    return Number.isFinite(this._zoomResponsiveness) ? this._zoomResponsiveness : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
  }

  public setZoomResponsiveness(val: number): void {
    const num = Number(val);
    if (!Number.isFinite(num)) {
      this._zoomResponsiveness = CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
    } else {
      this._zoomResponsiveness = Math.max(0, Math.min(100, Math.round(num)));
    }
  }

  public get moveResponsivenessMultiplier(): number {
    const r = this.moveResponsiveness;
    const t = r / 100; // 0.0 to 1.0
    const mult = 0.4 + (3.6 * Math.pow(t, 1.5));
    return Number.isFinite(mult) ? mult : 1.0;
  }

  public get zoomResponsivenessMultiplier(): number {
    const r = this.zoomResponsiveness;
    const t = r / 100; // 0.0 to 1.0
    const mult = 0.4 + (3.6 * Math.pow(t, 1.5));
    return Number.isFinite(mult) ? mult : 1.0;
  }

  private attachEvents() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', e => e.preventDefault());
    // Without this the browser claims pan/pinch for scroll and page zoom, and the
    // canvas never sees the second pointer at all.
    this.domElement.style.touchAction = 'none';
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
  }

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.presetActive = false; // Cancel preset animation on user input
    performanceConfig.startInteraction();

    if (e.pointerType === 'touch') {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2) {
        // Two fingers down: enter pinch zoom & two-finger pan
        this.isDragging = false;
        this.dragMode = null;
        this.seedPinch();
        return;
      }
      if (this.activePointers.size > 2) return;
      // Single finger on mobile touch: ROTATE map smoothly (azimuth & pitch)
      this.isDragging = true;
      this.dragMode = 'rotate';
      this.lastMouse.set(e.clientX, e.clientY);
      return;
    }

    this.isDragging = true;
    this.lastMouse.set(e.clientX, e.clientY);

    if (e.button === 0 && !e.ctrlKey) {
      this.dragMode = 'pan';
    } else if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      this.dragMode = 'rotate';
    } else {
      this.dragMode = 'pan';
    }
  };

  /** Record the current two-finger span and midpoint as the pinch baseline. */
  private seedPinch(): void {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return;
    this.pinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    this.pinchMidpoint.set((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  }

  /**
   * Two fingers touch gesture:
   * 1. Span ratio drives smooth zooming.
   * 2. Midpoint travel drives two-finger panning across the city.
   */
  private handlePinch(): void {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return;

    const span = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;

    // Zoom via pinch span ratio
    if (this.pinchDistance > 0 && span > 0) {
      const ratio = this.pinchDistance / span;
      if (Number.isFinite(ratio) && ratio > 0) {
        this.destDistance *= Math.pow(ratio, 1.35);
      }
    }

    // Two-finger pan via midpoint delta
    const mdx = midX - this.pinchMidpoint.x;
    const mdy = midY - this.pinchMidpoint.y;
    const panSens = this.destDistance * 0.0016 * this.moveResponsivenessMultiplier;

    const rightX = Math.cos(this.destAzimuth);
    const rightZ = -Math.sin(this.destAzimuth);
    const fwdX = Math.sin(this.destAzimuth);
    const fwdZ = Math.cos(this.destAzimuth);

    this.destTarget.x -= (rightX * mdx + fwdX * mdy) * panSens;
    this.destTarget.z -= (rightZ * mdx + fwdZ * mdy) * panSens;
    this.softClampPosition();

    this.pinchDistance = span;
    this.pinchMidpoint.set(midX, midY);
    this.clampDesiredState();
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      performanceConfig.startInteraction();
      if (this.activePointers.size >= 2) {
        e.preventDefault();
        this.handlePinch();
        return;
      }
    }

    if (!this.isDragging) return;
    e.preventDefault();
    performanceConfig.startInteraction();

    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse.set(e.clientX, e.clientY);

    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    if (this.dragMode === 'rotate') {
      // Rotation & Tilt sensitivity scaled by move responsiveness
      const baseRotSens = 0.0055;
      const rotSens = baseRotSens * this.moveResponsivenessMultiplier;
      
      this.destAzimuth -= dx * rotSens;
      this.destPitch -= dy * rotSens;
      this.clampDesiredState();
    } else if (this.dragMode === 'pan') {
      // Pan sensitivity scales with distance and move responsiveness
      const panSens = this.destDistance * 0.0015 * this.moveResponsivenessMultiplier;
      
      const rightX = Math.cos(this.destAzimuth);
      const rightZ = -Math.sin(this.destAzimuth);
      
      const fwdX = Math.sin(this.destAzimuth);
      const fwdZ = Math.cos(this.destAzimuth);

      this.destTarget.x -= rightX * dx * panSens;
      this.destTarget.z -= rightZ * dx * panSens;
      
      this.destTarget.x -= fwdX * dy * panSens;
      this.destTarget.z -= fwdZ * dy * panSens;

      // Soft boundary clamp after pan
      this.softClampPosition();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 1) {
        // Lifting one finger resumes rotation with the finger still down
        const [p] = [...this.activePointers.values()];
        this.lastMouse.set(p.x, p.y);
        this.isDragging = true;
        this.dragMode = 'rotate';
        return;
      }
      if (this.activePointers.size === 0) {
        this.pinchDistance = 0;
        this.isDragging = false;
        this.dragMode = null;
        performanceConfig.endInteraction();
        return;
      }
    }
    this.isDragging = false;
    this.dragMode = null;
    performanceConfig.endInteraction();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.presetActive = false;
    
    const rawDelta = e.deltaY;
    if (!Number.isFinite(rawDelta) || rawDelta === 0) return;

    // Normalize wheel deltaY across different devices (trackpads vs mouse wheels)
    const normalizedDelta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 120) / 120;

    // Base zoom rate per notch (doubled again to 3.20)
    // About 1.6x per wheel notch: fast scrolling stays smooth and does not outrun tile streaming.
    const baseZoomRate = 0.6;
    const zoomRate = baseZoomRate * this.zoomResponsivenessMultiplier;
    
    // Zoom factor based on normalized delta
    const zoomFactor = Math.pow(1 + zoomRate, normalizedDelta);

    if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
      this.destDistance *= zoomFactor;
      this.clampDesiredState();
    }
  };

  private clampDesiredState() {
    this.destPitch = Math.max(CAMERA_CONFIG.MIN_PITCH, Math.min(CAMERA_CONFIG.MAX_PITCH, this.destPitch));
    this.destDistance = Math.max(CAMERA_CONFIG.MIN_DISTANCE, Math.min(CAMERA_CONFIG.MAX_DISTANCE, this.destDistance));
  }

  // --- Soft Position Boundary ---

  /**
   * Set the playable boundary rectangle. The camera target (orbit center)
   * will be gently pushed back if it leaves these bounds.
   * Only constrains XZ position — heading, tilt, zoom are never affected.
   */
  public setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.hasBounds = true;
    this.boundsMinX = minX;
    this.boundsMaxX = maxX;
    this.boundsMinZ = minZ;
    this.boundsMaxZ = maxZ;
  }

  /**
   * Rubber-band pushback: if destTarget is outside bounds, exponentially
   * pull it back. Strength increases with overshoot distance, giving a
   * natural elastic feel rather than hard clamping.
   */
  private softClampPosition(): void {
    if (!this.hasBounds) return;

    const pushStrength = 0.15; // How aggressively to push back (0–1)

    if (this.destTarget.x < this.boundsMinX) {
      const overshoot = this.boundsMinX - this.destTarget.x;
      this.destTarget.x += overshoot * pushStrength;
    } else if (this.destTarget.x > this.boundsMaxX) {
      const overshoot = this.destTarget.x - this.boundsMaxX;
      this.destTarget.x -= overshoot * pushStrength;
    }

    if (this.destTarget.z < this.boundsMinZ) {
      const overshoot = this.boundsMinZ - this.destTarget.z;
      this.destTarget.z += overshoot * pushStrength;
    } else if (this.destTarget.z > this.boundsMaxZ) {
      const overshoot = this.destTarget.z - this.boundsMaxZ;
      this.destTarget.z -= overshoot * pushStrength;
    }
  }

  /**
   * Returns boundary debug info for the HUD overlay.
   * Returns null if no bounds are set.
   */
  public getBoundaryDebug(): { camX: number; camZ: number; distToEdge: number; insidePlayable: boolean } | null {
    if (!this.hasBounds) return null;

    const x = this.target.x;
    const z = this.target.z;

    const dLeft   = x - this.boundsMinX;
    const dRight  = this.boundsMaxX - x;
    const dTop    = z - this.boundsMinZ;
    const dBottom = this.boundsMaxZ - z;

    const distToEdge = Math.min(dLeft, dRight, dTop, dBottom);
    const insidePlayable = dLeft >= 0 && dRight >= 0 && dTop >= 0 && dBottom >= 0;

    return { camX: x, camZ: z, distToEdge, insidePlayable };
  }

  // --- Public UI Controls ---

  public setHeading(azimuth: number) {
    if (!Number.isFinite(azimuth)) return;
    this.presetActive = false;
    this.destAzimuth = azimuth;
  }

  public addAzimuthDelta(delta: number) {
    if (!Number.isFinite(delta)) return;
    this.presetActive = false;
    this.destAzimuth += delta;
  }

  public setPitch(pitch: number) {
    if (!Number.isFinite(pitch)) return;
    this.presetActive = false;
    this.destPitch = pitch;
    this.clampDesiredState();
  }

  public resetHeading() {
    this.presetActive = false;
    // Set destAzimuth to the nearest 0 azimuth (nearest multiple of 2PI)
    const currentRevolutions = Math.round(this.destAzimuth / (Math.PI * 2));
    this.destAzimuth = currentRevolutions * Math.PI * 2;
  }

  public transitionTo(target: THREE.Vector3, azimuth: number, pitch: number, distance: number, duration = 1200) {
    this.startState = {
      target: this.target.clone(),
      azimuth: this.azimuth,
      pitch: this.pitch,
      distance: this.distance
    };

    // Unwind azimuth to take the shortest path relative to current azimuth
    let deltaAzimuth = azimuth - (this.startState.azimuth % (Math.PI * 2));
    while (deltaAzimuth > Math.PI) deltaAzimuth -= Math.PI * 2;
    while (deltaAzimuth < -Math.PI) deltaAzimuth += Math.PI * 2;
    
    this.endState = {
      target: target.clone(),
      azimuth: this.startState.azimuth + deltaAzimuth,
      pitch: Math.max(CAMERA_CONFIG.MIN_PITCH, Math.min(CAMERA_CONFIG.MAX_PITCH, pitch)),
      distance: Math.max(CAMERA_CONFIG.MIN_DISTANCE, Math.min(CAMERA_CONFIG.MAX_DISTANCE, distance))
    };

    this.presetStartTime = performance.now();
    this.presetDuration = duration;
    this.presetActive = true;
    
    // Sync dest state so user interaction smoothly overtakes
    this.destTarget.copy(this.endState.target);
    this.destAzimuth = this.endState.azimuth;
    this.destPitch = this.endState.pitch;
    this.destDistance = this.endState.distance;
  }

  public flyTo(lat: number, lon: number, distance = 400, duration = 1400) {
    const { x, z } = project(lat, lon);
    const targetVector = new THREE.Vector3(x, 0, z);
    this.transitionTo(targetVector, this.destAzimuth, Math.PI / 4, distance, duration);
  }


  private lastTick = 0;
  public update(time: number = performance.now()) {
    // Frame-rate independent smoothing: the same feel at 30, 60 or 144 fps (low-end devices used to
    // feel sluggish because damping was applied per frame).
    const dt = this.lastTick ? Math.min(0.1, Math.max(0.001, (time - this.lastTick) / 1000)) : 1 / 60;
    this.lastTick = time;
    if (this.presetActive) {
      const elapsed = time - this.presetStartTime;
      const progress = Math.min(elapsed / this.presetDuration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out

      this.target.lerpVectors(this.startState.target, this.endState.target, ease);
      this.azimuth = this.startState.azimuth + (this.endState.azimuth - this.startState.azimuth) * ease;
      this.pitch = this.startState.pitch + (this.endState.pitch - this.startState.pitch) * ease;
      this.distance = this.startState.distance + (this.endState.distance - this.startState.distance) * ease;

      // Sync dest state to prevent snapping when preset ends
      this.destTarget.copy(this.target);
      this.destAzimuth = this.azimuth;
      this.destPitch = this.pitch;
      this.destDistance = this.distance;

      if (progress >= 1) {
        this.presetActive = false;
      }
    } else {
      // Soft boundary clamp every frame to ensure smooth convergence
      this.softClampPosition();

      // Damping
      // When actively dragging/touching, use higher damping responsiveness (0.32) for zero-lag finger tracking;
      // when released, smoothly ease with baseDamping (0.14)
      const baseDamping = (this.isDragging || this.activePointers.size > 0) ? 0.32 : 0.14;
      const k60 = dt * 60;
      const tMoveDamp = 1 - Math.pow(1 - Math.min(0.98, baseDamping * this.moveResponsivenessMultiplier), k60);
      const tZoomDamp = 1 - Math.pow(1 - Math.min(0.98, baseDamping * this.zoomResponsivenessMultiplier), k60);
      
      this.target.lerp(this.destTarget, tMoveDamp);
      this.azimuth += (this.destAzimuth - this.azimuth) * tMoveDamp;
      this.pitch += (this.destPitch - this.pitch) * tMoveDamp;
      this.distance += (this.destDistance - this.distance) * tZoomDamp;
    }

    this.updateCameraTransform();
  }

  private updateCameraTransform() {
    const horizontalDist = this.distance * Math.cos(this.pitch);
    const verticalDist = this.distance * Math.sin(this.pitch);

    const x = this.target.x + horizontalDist * Math.sin(this.azimuth);
    const z = this.target.z + horizontalDist * Math.cos(this.azimuth);
    const y = this.target.y + verticalDist;

    // Hard safety invariant: Camera must never pass below clearance
    const safeY = Math.max(y, CAMERA_CONFIG.GROUND_Y + CAMERA_CONFIG.CAMERA_CLEARANCE);
    
    this.camera.position.set(x, safeY, z);
    this.camera.lookAt(this.target);
  }
}

