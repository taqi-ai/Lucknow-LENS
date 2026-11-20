import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { prefersReducedMotion } from './bits';

interface Climate { source: string; months: { hi: number; lo: number; rain: number }[] }
const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Lucknow's year, from ten years of real daily weather: a temperature band
 * (average daily low to high) over monthly rainfall. Hover a month to read it.
 */
export const ClimateChart: React.FC = () => {
  const [c, setC] = useState<Climate | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { fetch('/geo/lucknow_climate.json').then((r) => r.json()).then(setC).catch(() => setC(null)); }, []);
  if (!c) return <div className="h-[340px] rounded-[28px] bg-terrain" aria-hidden />;

  const W = 720, H = 320, padL = 36, padR = 36, top = 24, bottom = 40;
  const cw = (W - padL - padR) / 12;
  const tMin = 5, tMax = 42, rMax = 380;
  const ty = (t: number) => top + (1 - (t - tMin) / (tMax - tMin)) * (H - top - bottom);
  const ry = (r: number) => (H - bottom) - (r / rMax) * (H - top - bottom) * 0.9;
  const cx = (i: number) => padL + cw * i + cw / 2;
  const band = `${c.months.map((m, i) => `${i ? 'L' : 'M'}${cx(i)} ${ty(m.hi)}`).join(' ')} ${c.months.slice().reverse().map((m, j) => `L${cx(11 - j)} ${ty(m.lo)}`).join(' ')} Z`;
  const hiLine = c.months.map((m, i) => `${i ? 'L' : 'M'}${cx(i)} ${ty(m.hi)}`).join(' ');
  const loLine = c.months.map((m, i) => `${i ? 'L' : 'M'}${cx(i)} ${ty(m.lo)}`).join(' ');
  const reduce = prefersReducedMotion();
  const h = hover ?? 6;
  const cur = c.months[h];

  return (
    <figure className="rounded-[28px] border border-paper/10 bg-terrain p-5 sm:p-7">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-display text-[1.6rem] leading-tight text-paper">{MONTH[h]}</p>
        <p className="text-[14.5px] text-paper/70"><span className="font-semibold text-paper">{cur.lo}° to {cur.hi}°C</span> on an average day, <span className="font-semibold text-paper">{cur.rain} mm</span> of rain in the month</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Average daily temperature range and monthly rainfall in Lucknow, by month" onPointerLeave={() => setHover(null)}>
        {c.months.map((m, i) => (
          <motion.rect key={i} x={cx(i) - cw * 0.3} width={cw * 0.6} rx={4} fill="var(--color-sage)" fillOpacity={hover === i ? 0.55 : 0.28}
            initial={reduce ? false : { y: H - bottom, height: 0 }} whileInView={{ y: ry(m.rain), height: (H - bottom) - ry(m.rain) }} viewport={{ once: true }}
            transition={{ duration: 0.9, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        <motion.path d={band} fill="var(--color-amber)" fillOpacity={0.18} initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 }} />
        <motion.path d={hiLine} fill="none" stroke="var(--color-sand)" strokeWidth={2} initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }} />
        <motion.path d={loLine} fill="none" stroke="var(--color-sand)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 4" initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.2, ease: [0.65, 0, 0.35, 1] }} />
        {c.months.map((m, i) => (
          <g key={i}>
            <circle cx={cx(i)} cy={ty(m.hi)} r={hover === i ? 5 : 3} fill="var(--color-sand)" />
            <text x={cx(i)} y={H - 14} textAnchor="middle" fontSize="13" fill="var(--color-paper)" fillOpacity={hover === i ? 1 : 0.55}>{M[i]}</text>
            <rect x={padL + cw * i} y={0} width={cw} height={H} fill="transparent" onPointerEnter={() => setHover(i)} onClick={() => setHover(i)} />
          </g>
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-paper/55">
        <span className="inline-flex items-center gap-2"><span className="h-[2px] w-5 bg-sand" />Average daily high</span>
        <span className="inline-flex items-center gap-2"><span className="h-[2px] w-5 border-t border-dashed border-sand" />Average daily low</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sage/40" />Rain in the month</span>
        <span>Source: {c.source}.</span>
      </figcaption>
    </figure>
  );
};

export default ClimateChart;
