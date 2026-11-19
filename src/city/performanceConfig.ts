/**
 * performanceConfig.ts — Centralized adaptive rendering & performance controller.
 *
 * Implements:
 * 1. Three mobile quality profiles (High Performance, Balanced, Performance) + Desktop profile
 * 2. Interaction-aware rendering state (lowers render scale & defers heavy work during drag/rotate)
 * 3. Adaptive FPS controller with hysteresis & cooldown to prevent quality oscillation
 * 4. Capability-first device tiering (pointer type, cores, memory, GPU)
 */

export type MobileQualityProfile = 'performance' | 'balanced' | 'high' | 'desktop';

export interface RenderProfileConfig {
  name: MobileQualityProfile;
  label: string;
  targetFps: number;
  maxPixelRatio: number;
  interactionPixelRatio: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowMaxAltitude: number;
  treeNearRadius: number;
  detailRadius: number;
  streamRadiusScale: number;
  workerCount: number;
  antialias: boolean;
  lampGlow: boolean;
}

const PROFILES: Record<MobileQualityProfile, RenderProfileConfig> = {
  // Performance: Mid-range / budget Android devices (prioritizes 30-45 FPS and fluid camera rotation)
  performance: {
    name: 'performance',
    label: 'Smooth Performance (Mid-Range)',
    targetFps: 35,
    maxPixelRatio: 1.0,
    interactionPixelRatio: 0.85,
    shadowsEnabled: false,
    shadowMapSize: 1024,
    shadowMaxAltitude: 0,
    treeNearRadius: 600,
    detailRadius: 0,
    streamRadiusScale: 0.55,
    workerCount: 2,
    antialias: false,
    lampGlow: false,
  },

  // Balanced: Standard Android mid-range / upper mid-range (45-60 FPS target, balanced visuals)
  balanced: {
    name: 'balanced',
    label: 'Balanced (Mobile 45-60 FPS)',
    targetFps: 50,
    maxPixelRatio: 1.25,
    interactionPixelRatio: 0.95,
    shadowsEnabled: false,
    shadowMapSize: 1024,
    shadowMaxAltitude: 800,
    treeNearRadius: 900,
    detailRadius: 450,
    streamRadiusScale: 0.65,
    workerCount: 2,
    antialias: false,
    lampGlow: true,
  },

  // High: Premium mobile flagship devices (60 FPS target, rich detail)
  high: {
    name: 'high',
    label: 'High Quality (Mobile 60 FPS)',
    targetFps: 60,
    maxPixelRatio: 1.5,
    interactionPixelRatio: 1.15,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowMaxAltitude: 1600,
    treeNearRadius: 1200,
    detailRadius: 750,
    streamRadiusScale: 0.75,
    workerCount: 3,
    antialias: false,
    lampGlow: true,
  },

  // Desktop: Complete desktop fidelity preserved (full shadows, antialiasing, and streaming)
  desktop: {
    name: 'desktop',
    label: 'Desktop Full Fidelity',
    targetFps: 60,
    maxPixelRatio: 1.5,
    interactionPixelRatio: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    shadowMaxAltitude: 3200,
    treeNearRadius: 1700,
    detailRadius: 1100,
    streamRadiusScale: 1.0,
    workerCount: 4,
    antialias: true,
    lampGlow: true,
  },
};

export class PerformanceController {
  private static instance: PerformanceController | null = null;

  public isTouch: boolean = false;
  public isMobile: boolean = false;
  public currentProfileKey: MobileQualityProfile = 'desktop';
  public config: RenderProfileConfig = PROFILES.desktop;

  // Interaction State
  private _isInteracting: boolean = false;
  private interactionEndTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly INTERACTION_COOLDOWN_MS = 250;

  // Adaptive FPS & Frame Time Monitoring
  private frameTimes: number[] = [];
  private lastFpsCheck = performance.now();
  private lastQualitySwitch = performance.now();
  private readonly SWITCH_COOLDOWN_MS = 4000; // prevent quality oscillation
  private listeners = new Set<() => void>();

  public static getInstance(): PerformanceController {
    if (!PerformanceController.instance) {
      PerformanceController.instance = new PerformanceController();
    }
    return PerformanceController.instance;
  }

  constructor() {
    this.detectInitialProfile();
  }

  private detectInitialProfile(): void {
    if (typeof window === 'undefined') return;

    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
    this.isTouch = coarse && noHover;

    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    this.isMobile = this.isTouch || isMobileUA;

    // Check manual override via URL or localStorage
    const urlOverride = new URLSearchParams(window.location.search).get('profile') as MobileQualityProfile | null;
    let storedOverride: string | null = null;
    try {
      storedOverride = localStorage.getItem('lens.mobile_profile');
    } catch {}

    const override = urlOverride || storedOverride;
    if (override && PROFILES[override as MobileQualityProfile]) {
      this.setProfile(override as MobileQualityProfile);
      return;
    }

    if (!this.isMobile) {
      this.setProfile('desktop');
      return;
    }

    // Mid-range mobile detection: check hardwareConcurrency and deviceMemory
    const cores = navigator.hardwareConcurrency || 4;
    const memGB = (navigator as { deviceMemory?: number }).deviceMemory || 4;

    if (cores <= 4 || memGB <= 4) {
      this.setProfile('performance');
    } else if (cores <= 6 || memGB <= 6) {
      this.setProfile('balanced');
    } else {
      this.setProfile('balanced'); // Safe default for Android mid-range to prevent rotation lag
    }
  }

  public setProfile(profileKey: MobileQualityProfile): void {
    this.currentProfileKey = profileKey;
    this.config = PROFILES[profileKey];
    this.notifyListeners();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch {}
    }
  }

  // --- Interaction Management ---

  public get isInteracting(): boolean {
    return this._isInteracting;
  }

  public startInteraction(): void {
    if (this.interactionEndTimer) {
      clearTimeout(this.interactionEndTimer);
      this.interactionEndTimer = null;
    }
    if (!this._isInteracting) {
      this._isInteracting = true;
      this.notifyListeners();
    }
  }

  public endInteraction(): void {
    if (this.interactionEndTimer) {
      clearTimeout(this.interactionEndTimer);
    }
    this.interactionEndTimer = setTimeout(() => {
      this._isInteracting = false;
      this.interactionEndTimer = null;
      this.notifyListeners();
    }, this.INTERACTION_COOLDOWN_MS);
  }

  /**
   * Returns current effective pixel ratio:
   * During active finger drag / camera rotation, applies interactionPixelRatio
   * to eliminate GPU fillrate bottlenecks, restoring maxPixelRatio after interaction.
   */
  public getEffectivePixelRatio(): number {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    const cap = this._isInteracting
      ? this.config.interactionPixelRatio
      : this.config.maxPixelRatio;
    return Math.min(dpr, cap);
  }

  // --- Adaptive FPS Controller ---

  public recordFrameTime(deltaMs: number): void {
    if (this.currentProfileKey === 'desktop') return; // Desktop maintains full quality

    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > 120) this.frameTimes.shift();

    const now = performance.now();
    if (now - this.lastFpsCheck < 2000) return;
    this.lastFpsCheck = now;

    if (this.frameTimes.length < 30) return;
    if (now - this.lastQualitySwitch < this.SWITCH_COOLDOWN_MS) return;

    // Calculate median frame time
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length * 0.5)];

    // Downgrade if sustained frame time > 33ms (< 30 FPS)
    if (medianMs > 33) {
      if (this.currentProfileKey === 'high') {
        this.setProfile('balanced');
        this.lastQualitySwitch = now;
      } else if (this.currentProfileKey === 'balanced') {
        this.setProfile('performance');
        this.lastQualitySwitch = now;
      }
    }
    // Upgrade if sustained frame time < 17ms (> 58 FPS) with headroom
    else if (medianMs < 17 && !this._isInteracting) {
      if (this.currentProfileKey === 'performance') {
        this.setProfile('balanced');
        this.lastQualitySwitch = now;
      }
    }
  }
}

export const performanceConfig = PerformanceController.getInstance();
