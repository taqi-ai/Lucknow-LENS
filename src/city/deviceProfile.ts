/**
 * deviceProfile — one place that decides how hard this device may be pushed.
 *
 * Lucknow LENS streams ~950k buildings and a citywide overlay. Those budgets were
 * tuned on a desktop GPU; running them unchanged on a phone means a 3-4x
 * overdraw penalty on a tile-based mobile GPU, four decode workers competing with
 * the compositor for two efficiency cores, and a 3x device pixel ratio quietly
 * asking for nine times the fragments. The result is a hot device at ~12 fps.
 *
 * Every knob here is read once at startup. Detection is capability-first
 * (pointer type, memory, core count) rather than user-agent sniffing, so a
 * touch laptop is judged on its actual hardware and a desktop browser in
 * responsive-design mode is not misclassified as a phone.
 */

export type DeviceTier = 'desktop' | 'mobile' | 'low';

export interface DeviceProfile {
  tier: DeviceTier;
  /** True for genuinely touch-primary devices — drives UI layout, not just perf. */
  isTouch: boolean;
  /** Upper bound on renderer.setPixelRatio. */
  maxPixelRatio: number;
  /** MSAA is a real cost on tiled mobile GPUs for a mostly flat-shaded city. */
  antialias: boolean;
  /** Tile decode workers. More than the core count only adds contention. */
  workerCount: number;
  /** Multiplier on the per-LOD streaming radius. */
  streamRadiusScale: number;
  /** Multiplier on streetlight density (see tileWorker LIT_ROAD_SPACING). */
  lampDensityScale: number;
  /** Skip the lamp glow billboards entirely — they are additive overdraw. */
  lampGlow: boolean;
  /** Adaptive shadows are off below this tier. */
  allowShadows: boolean;
}

function detectTier(): { tier: DeviceTier; isTouch: boolean } {
  if (typeof window === 'undefined') {
    return { tier: 'desktop', isTouch: false };
  }

  // `pointer: coarse` means the primary input has no fine pixel precision — a
  // finger. This is the signal that actually matters for layout, and unlike a
  // width breakpoint it does not flip when a desktop window is made narrow.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  const isTouch = coarse && noHover;

  const cores = navigator.hardwareConcurrency ?? 4;
  // Chromium-only, absent elsewhere — treated as "unknown", never as "low".
  const memGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 0;

  // A phone that also reports few cores or little RAM gets the reduced budget.
  if (isTouch && (cores <= 4 || (memGB > 0 && memGB <= 4))) return { tier: 'low', isTouch };
  if (isTouch) return { tier: 'mobile', isTouch };
  // Very weak desktops (old integrated GPUs, VMs) benefit from the mobile budget.
  if (cores <= 2 || (memGB > 0 && memGB <= 2)) return { tier: 'low', isTouch };
  return { tier: 'desktop', isTouch };
}

function build(): DeviceProfile {
  const { tier, isTouch } = detectTier();
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

  if (tier === 'low') {
    return {
      tier, isTouch,
      // 1.0 is a real quality drop, but a 5-year-old phone at 3x DPR cannot
      // shade this many fragments and stay interactive.
      maxPixelRatio: Math.min(dpr, 1.0),
      antialias: false,
      workerCount: 2,
      streamRadiusScale: 0.55,
      lampDensityScale: 0.55,
      lampGlow: false,
      allowShadows: false,
    };
  }

  if (tier === 'mobile') {
    return {
      tier, isTouch,
      maxPixelRatio: Math.min(dpr, 1.5),
      antialias: false,
      workerCount: Math.max(2, Math.min(3, cores - 1)),
      streamRadiusScale: 0.7,
      lampDensityScale: 0.7,
      lampGlow: true,
      allowShadows: false,
    };
  }

  return {
    tier, isTouch,
    maxPixelRatio: Math.min(dpr, 1.5),
    antialias: true,
    workerCount: Math.max(2, Math.min(4, cores - 1)),
    streamRadiusScale: 1,
    lampDensityScale: 1,
    lampGlow: true,
    allowShadows: true,
  };
}

let cached: DeviceProfile | null = null;

/** Resolved once per session; detection cannot change without a reload. */
export function getDeviceProfile(): DeviceProfile {
  if (!cached) cached = build();
  return cached;
}
