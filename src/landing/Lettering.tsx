import React from 'react';
import { motion } from 'motion/react';
import lucknowRaw from './assets/lucknow-lettering.svg?raw';
import flyoverRaw from './assets/flyover-lettering.svg?raw';
import namasteRaw from './assets/namaste-lettering.svg?raw';
import { prefersReducedMotion } from './bits';

/*
 * "Lucknow" in Indic display lettering (Samarkan-style), drawn for this site with
 * Google Flow and vectorised, so it is original artwork rather than a licensed font.
 * It writes itself: the outline is traced like a pen, then the ink fills in.
 */
const parse = (raw: string) => ({ vb: raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1000 400', paths: Array.from(raw.matchAll(/ d="([^"]+)"/g)).map((m) => m[1]) });
const WORDS = { lucknow: parse(lucknowRaw), flyover: parse(flyoverRaw), namaste: parse(namasteRaw) };

export const LucknowLettering: React.FC<{ className?: string; delay?: number; word?: keyof typeof WORDS }> = ({ className, delay = 0.4, word = 'lucknow' }) => {
  const { vb: VIEWBOX, paths: PATHS } = WORDS[word];
  const reduce = prefersReducedMotion();
  return (
    <svg viewBox={VIEWBOX} className={className} role="img" aria-label="Lucknow" fillRule="evenodd">
      {PATHS.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2.5}
          initial={reduce ? false : { pathLength: 0, fillOpacity: 0 }}
          animate={{ pathLength: 1, fillOpacity: 1 }}
          transition={{ pathLength: { duration: 2.2, delay, ease: [0.65, 0, 0.35, 1] }, fillOpacity: { duration: 0.9, delay: delay + 1.6, ease: 'easeOut' } }}
        />
      ))}
    </svg>
  );
};

export default LucknowLettering;
