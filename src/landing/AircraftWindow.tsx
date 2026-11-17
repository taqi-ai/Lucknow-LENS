import React, { useEffect, useId, useRef } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

/**
 * An aircraft cabin window, drawn in SVG so it scales cleanly from a hero
 * illustration to a full-screen cabin you zoom through.
 *
 * Layers, outside in: cabin wall, moulded trim, the deep reveal, the inner pane
 * (with its breather hole), and the pull-down shade. In `hole` mode the pane is
 * left transparent, so whatever is rendered behind the SVG (the live map) is the
 * view outside.
 */

const W = 400, H = 560;
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;

const TRIM = { x: 34, y: 30, w: 332, h: 500, r: 150 };
const REVEAL = { x: 64, y: 64, w: 272, h: 432, r: 124 };
export const PANE = { x: 86, y: 90, w: 228, h: 382, r: 104 };

export interface AircraftWindowProps {
  /** 0 = shade fully up (open), 1 = fully down (closed). */
  shade: number;
  /** 'photo' shows the aerial picture; 'hole' leaves the pane see-through. */
  view: 'photo' | 'hole';
  /** Extend the cabin wall far past the trim, for the full-screen cabin. */
  fullWall?: boolean;
  /** Let people pull the shade. Reports the new position. */
  onShadeDrag?: (v: number) => void;
  className?: string;
  label?: string;
}

export const AircraftWindow: React.FC<AircraftWindowProps> = ({ shade, view, fullWall, onShadeDrag, className, label }) => {
  const id = useId().replace(/:/g, '');
  const s = useSpring(shade as number, { stiffness: 70, damping: 18, mass: 0.9 });
  useEffect(() => { s.set(shade); }, [shade, s]);
  // shade travels from fully above the pane (open) to covering it (closed)
  const shadeY = useTransform(s as unknown as import("motion/react").MotionValue<number>, (v: number) => (v - 1) * (PANE.h + 8));
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ y0: number; v0: number } | null>(null);

  const toUnits = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return (clientY / r.height) * H;
  };

  const wallPath = fullWall ? `${rr(-6000, -6000, W + 12000, H + 12000, 0)} ${rr(TRIM.x, TRIM.y, TRIM.w, TRIM.h, TRIM.r)}` : '';
  const trimPath = `${rr(TRIM.x, TRIM.y, TRIM.w, TRIM.h, TRIM.r)} ${rr(REVEAL.x, REVEAL.y, REVEAL.w, REVEAL.h, REVEAL.r)}`;
  const revealPath = `${rr(REVEAL.x, REVEAL.y, REVEAL.w, REVEAL.h, REVEAL.r)} ${rr(PANE.x, PANE.y, PANE.w, PANE.h, PANE.r)}`;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ overflow: 'visible', touchAction: onShadeDrag ? 'none' : undefined }}
      role="img"
      aria-label={label ?? 'An aircraft window'}
      onPointerDown={onShadeDrag ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { y0: toUnits(e.clientY), v0: shade }; } : undefined}
      onPointerMove={onShadeDrag ? (e) => { if (!drag.current) return; const dy = toUnits(e.clientY) - drag.current.y0; onShadeDrag(Math.max(0, Math.min(1, drag.current.v0 + dy / PANE.h))); } : undefined}
      onPointerUp={onShadeDrag ? () => { drag.current = null; } : undefined}
    >
      <defs>
        <clipPath id={`pane-${id}`}><path d={rr(PANE.x, PANE.y, PANE.w, PANE.h, PANE.r)} /></clipPath>
        <linearGradient id={`wall-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1d14" /><stop offset="1" stopColor="#120c08" />
        </linearGradient>
        <linearGradient id={`trim-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a3626" /><stop offset=".55" stopColor="#2e2117" /><stop offset="1" stopColor="#1a120c" />
        </linearGradient>
        <linearGradient id={`reveal-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0705" /><stop offset=".2" stopColor="#221810" /><stop offset=".85" stopColor="#35271b" /><stop offset="1" stopColor="#2b1f15" />
        </linearGradient>
        <linearGradient id={`glare-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".3" stopColor="#fff" stopOpacity="0" />
          <stop offset=".68" stopColor="#fff" stopOpacity="0" /><stop offset=".76" stopColor="#fff" stopOpacity=".1" /><stop offset=".86" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`edge-${id}`} cx=".5" cy=".5" r=".62">
          <stop offset=".72" stopColor="#0b1216" stopOpacity="0" /><stop offset="1" stopColor="#0b1216" stopOpacity=".42" />
        </radialGradient>
        <linearGradient id={`blind-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2efe8" /><stop offset="1" stopColor="#e2ddd2" />
        </linearGradient>
        <pattern id={`ribs-${id}`} width="10" height="9" patternUnits="userSpaceOnUse">
          <rect width="10" height="9" fill="transparent" /><rect y="6.5" width="10" height="1" fill="#fff" fillOpacity=".35" /><rect y="7.5" width="10" height="1.2" fill="#000" fillOpacity=".06" />
        </pattern>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c6d0da" /><stop offset=".55" stopColor="#dfe3e4" stopOpacity=".85" /><stop offset="1" stopColor="#e9dfcf" stopOpacity="0" /></linearGradient>
        <linearGradient id={`curve-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".18" /><stop offset=".18" stopColor="#000" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".12" /><stop offset=".82" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`lip-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f3ea" /><stop offset=".35" stopColor="#ddd5c5" /><stop offset="1" stopColor="#b9b0a0" />
        </linearGradient>
        <filter id={`soft-${id}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id={`drop-${id}`} x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#1e2428" floodOpacity=".28" /></filter>
        <filter id={`grain-${id}`}><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
      </defs>

      {/* view outside */}
      {view === 'photo' && (
        <g clipPath={`url(#pane-${id})`}>
          <rect x={PANE.x} y={PANE.y} width={PANE.w} height={PANE.h} fill="#b8c4cf" />
          <g className="window-drift">
            <image href="/brand/hero-aerial.webp" x={PANE.x - 150} y={PANE.y + 70} width={PANE.w + 300} height={PANE.h} preserveAspectRatio="xMidYMid slice" />
          </g>
          <rect x={PANE.x} y={PANE.y} width={PANE.w} height={PANE.h * 0.55} fill={`url(#sky-${id})`} />
          <g className="cloud-pass" filter={`url(#soft-${id})`} opacity=".85">
            <ellipse cx="120" cy="330" rx="90" ry="22" fill="#fff" /><ellipse cx="250" cy="300" rx="70" ry="16" fill="#fff" opacity=".8" />
          </g>
        </g>
      )}

      {/* pane effects (kept off in hole mode except a faint glare) */}
      <g clipPath={`url(#pane-${id})`} pointerEvents="none">
        {view === 'photo' && <rect x={PANE.x} y={PANE.y} width={PANE.w} height={PANE.h} fill={`url(#edge-${id})`} />}
        <rect x={PANE.x} y={PANE.y} width={PANE.w} height={PANE.h} fill={`url(#glare-${id})`} opacity={view === 'hole' ? 0.55 : 1} />
        {/* double glazing: the outer pane sits a little deeper, its edge catching light */}
        <path d={rr(PANE.x + 9, PANE.y + 11, PANE.w - 18, PANE.h - 22, PANE.r - 9)} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="1.2" />
        <ellipse cx={PANE.x + PANE.w * 0.3} cy={PANE.y + PANE.h * 0.22} rx="38" ry="70" fill="#fff" opacity=".05" transform={`rotate(-18 ${PANE.x + PANE.w * 0.3} ${PANE.y + PANE.h * 0.22})`} />
        {/* the breather hole every aircraft inner pane has */}
        <circle cx={W / 2} cy={PANE.y + PANE.h - 30} r="2.4" fill="#1e2428" fillOpacity=".35" />
        <circle cx={W / 2 + 0.6} cy={PANE.y + PANE.h - 30.6} r="0.9" fill="#fff" fillOpacity=".5" />
        {/* shade */}
        <motion.g style={{ y: shadeY }}>
          <rect x={PANE.x - 6} y={PANE.y} width={PANE.w + 12} height={PANE.h} fill={`url(#blind-${id})`} />
          <rect x={PANE.x - 6} y={PANE.y} width={PANE.w + 12} height={PANE.h} fill={`url(#ribs-${id})`} />
          {/* the blind curves with the fuselage: darker at the sides, a soft sheen down the middle */}
          <rect x={PANE.x - 6} y={PANE.y} width={PANE.w + 12} height={PANE.h} fill={`url(#curve-${id})`} />
          {/* moulded lip with a highlight and a recessed finger grip */}
          <rect x={PANE.x - 6} y={PANE.y + PANE.h - 18} width={PANE.w + 12} height="18" fill={`url(#lip-${id})`} />
          <rect x={PANE.x - 6} y={PANE.y + PANE.h - 18} width={PANE.w + 12} height="1.2" fill="#fff" fillOpacity=".8" />
          <rect x={PANE.x - 6} y={PANE.y + PANE.h - 1.5} width={PANE.w + 12} height="1.5" fill="#000" fillOpacity=".25" />
          <rect x={W / 2 - 30} y={PANE.y + PANE.h - 13} width="60" height="8" rx="4" fill="#8f877a" />
          <rect x={W / 2 - 28} y={PANE.y + PANE.h - 12} width="56" height="3" rx="1.5" fill="#000" fillOpacity=".25" />
          {shade > 0.01 && <rect x={PANE.x - 6} y={PANE.y + PANE.h} width={PANE.w + 12} height="12" fill="#000" opacity=".22" filter={`url(#soft-${id})`} />}
        </motion.g>
      </g>

      {/* cabin wall, trim and reveal */}
      {fullWall && <path d={wallPath} fill={`url(#wall-${id})`} fillRule="evenodd" />}
      <g filter={fullWall ? undefined : `url(#drop-${id})`}>
        <path d={trimPath} fill={`url(#trim-${id})`} fillRule="evenodd" />
      </g>
      <path d={revealPath} fill={`url(#reveal-${id})`} fillRule="evenodd" />
      {/* lip highlight and seal */}
      <path d={rr(REVEAL.x, REVEAL.y, REVEAL.w, REVEAL.h, REVEAL.r)} fill="none" stroke="#f0c48a" strokeOpacity=".22" strokeWidth="1.5" />
      <path d={rr(PANE.x - 2, PANE.y - 2, PANE.w + 4, PANE.h + 4, PANE.r + 2)} fill="none" stroke="#5e5a53" strokeOpacity=".55" strokeWidth="3" />
      <path d={rr(TRIM.x, TRIM.y, TRIM.w, TRIM.h, TRIM.r)} fill="none" stroke="#f0c48a" strokeOpacity=".18" strokeWidth="1.2" />
      {/* Film grain only on the small hero window: an feTurbulence filter re-rasterises on every
          frame of the full-screen dive and was the main cause of the zoom stutter. */}
      {!fullWall && <path d={trimPath} fill="#000" fillRule="evenodd" filter={`url(#grain-${id})`} opacity=".6" pointerEvents="none" />}
    </svg>
  );
};

export default AircraftWindow;
