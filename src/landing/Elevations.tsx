import React from 'react';
import { motion } from 'motion/react';
import { prefersReducedMotion } from './bits';

/**
 * Architectural elevations of Lucknow's monuments, drawn as thin lines. They
 * are the landing page's only imagery: one consistent hand, drawn stroke by
 * stroke as they come into view, and tinted by the current text colour so they
 * work by day and by night.
 */

type DrawProps = { className?: string; delay?: number; duration?: number; strokeWidth?: number; label: string; viewBox: string; paths: string[] };

const Draw: React.FC<DrawProps> = ({ className, delay = 0, duration = 2.2, strokeWidth = 1.15, label, viewBox, paths }) => {
  const reduce = prefersReducedMotion();
  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label={label} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, margin: '-5% 0px' }}
          transition={{ pathLength: { duration, delay: delay + (i / paths.length) * duration * 0.7, ease: [0.65, 0, 0.35, 1] }, opacity: { duration: 0.2, delay: delay + (i / paths.length) * duration * 0.7 } }}
        />
      ))}
    </svg>
  );
};

const arches = (x0: number, n: number, w: number, base: number, rise: number, top: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = x0 + i * w;
    const pad = w * 0.16;
    return `M${x + pad} ${base} V${top} Q${x + w / 2} ${top - rise} ${x + w - pad} ${top} V${base}`;
  }).join(' ');

/* Rumi Darwaza, 1784. Central gate under a tall pointed, scalloped arch, two
   slender minarets, a chhatri on top, arcaded wings and corner towers. */
const RUMI: string[] = [
  'M20 540 H980',
  // wings
  'M138 540 V332 H386 M614 332 H862 V540',
  'M138 352 H386 M614 352 H862',
  arches(150, 6, 39, 540, 34, 432),
  arches(624, 6, 39, 540, 34, 432),
  arches(150, 6, 39, 412, 18, 372),
  arches(624, 6, 39, 412, 18, 372),
  // corner towers
  'M104 540 V306 H138 M862 306 H896 V540 M104 306 Q121 282 138 306 M862 306 Q879 282 896 306 M121 290 V274 M879 290 V274',
  // minarets
  'M380 540 V196 M392 540 V196 M608 540 V196 M620 540 V196 M376 196 Q386 172 396 196 M604 196 Q614 172 624 196 M386 178 V160 M614 178 V160 M378 260 H394 M606 260 H622 M378 330 H394 M606 330 H622',
  // the great arch frame
  'M400 540 V236 Q400 206 428 196 L500 112 L572 196 Q600 206 600 236 V540',
  // the recess with its scalloped edge
  'M434 540 V300 C434 252 466 222 500 196 C534 222 566 252 566 300 V540',
  'M440 300 C445 285 455 280 462 283 C466 268 478 262 486 266 C490 254 497 249 500 246 C503 249 510 254 514 266 C522 262 534 268 538 283 C545 280 555 285 560 300',
  // openings at the foot of the recess
  arches(452, 3, 32, 540, 22, 478),
  // chhatri on top
  'M478 118 V98 H522 V118 M476 98 Q500 64 524 98 M500 66 V48 M496 52 H504',
];

/* Hussainabad Clock Tower, 1881. */
const CLOCK: string[] = [
  'M10 540 H190',
  'M74 540 V170 H126 V540',
  'M66 170 H134 M70 164 H130',
  'M80 164 V118 H120 V164',
  'M80 118 L100 52 L120 118',
  'M100 52 V30 M95 36 H105',
  'M100 210 m-15 0 a15 15 0 1 0 30 0 a15 15 0 1 0 -30 0 M100 210 V199 M100 210 L108 214',
  'M86 540 V250 M114 540 V250 M74 300 H126 M74 420 H126',
  arches(80, 1, 40, 540, 22, 490),
];

/* Chota Imambara, 1838. Long arcaded hall, a central onion dome, small minarets. */
const CHOTA: string[] = [
  'M10 540 H590',
  'M50 540 V372 H550 V540 M50 392 H550',
  arches(62, 12, 39.6, 540, 26, 452),
  'M218 372 C214 326 250 300 300 270 C350 300 386 326 382 372',
  'M300 270 V242 M294 250 H306',
  'M232 372 V352 H368 V372',
  'M58 372 V220 M70 372 V220 M54 220 Q64 196 74 220 M64 202 V184',
  'M530 372 V220 M542 372 V220 M526 220 Q536 196 546 220 M536 202 V184',
  'M150 372 V336 Q166 314 182 336 V372 M418 372 V336 Q434 314 450 336 V372',
];

/* Satkhanda, 1840s. A watch tower left at four storeys. */
const SATKHANDA: string[] = [
  'M10 540 H210',
  'M44 540 V410 H156 V540',
  'M54 410 V300 H146 V410',
  'M64 300 V206 H136 V300',
  'M74 206 V130 H126 V206',
  'M40 410 H160 M50 300 H150 M60 206 H140 M70 130 H130',
  arches(50, 3, 33.3, 540, 20, 470),
  arches(60, 3, 27.3, 410, 16, 352),
  arches(70, 2, 30, 300, 14, 250),
  arches(80, 1, 40, 206, 14, 170),
];

/* A biryani handi, sealed with dough for dum, steam escaping. */
const HANDI: string[] = [
  'M20 520 H300',
  'M70 500 C40 470 40 380 80 340 C100 320 120 316 160 316 C200 316 220 320 240 340 C280 380 280 470 250 500 Z',
  'M60 500 H260 M90 508 H230',
  'M96 330 C100 306 128 296 160 296 C192 296 220 306 224 330',
  'M92 334 C120 344 200 344 228 334',
  'M118 300 C116 286 132 280 160 280 C188 280 204 286 202 300',
  'M152 280 C150 268 170 268 168 280',
  'M120 268 C110 248 132 236 122 214 M160 262 C150 238 172 224 160 196 M200 268 C190 248 212 236 202 214',
  'M70 410 C120 424 200 424 250 410',
];

export const Handi: React.FC<{ className?: string; delay?: number }> = ({ className, delay }) => (
  <Draw label="Line drawing of a biryani handi" viewBox="0 180 320 340" paths={HANDI} className={className} delay={delay} />
);

export const RumiDarwaza: React.FC<{ className?: string; delay?: number }> = ({ className, delay }) => (
  <Draw label="Line drawing of Rumi Darwaza" viewBox="0 30 1000 520" paths={RUMI} className={className} delay={delay} duration={2.6} />
);
export const ClockTower: React.FC<{ className?: string; delay?: number }> = ({ className, delay }) => (
  <Draw label="Line drawing of the Hussainabad Clock Tower" viewBox="0 20 200 530" paths={CLOCK} className={className} delay={delay} />
);
export const ChotaImambara: React.FC<{ className?: string; delay?: number }> = ({ className, delay }) => (
  <Draw label="Line drawing of Chota Imambara" viewBox="0 170 600 380" paths={CHOTA} className={className} delay={delay} />
);
export const Satkhanda: React.FC<{ className?: string; delay?: number }> = ({ className, delay }) => (
  <Draw label="Line drawing of Satkhanda" viewBox="0 120 220 430" paths={SATKHANDA} className={className} delay={delay} />
);
