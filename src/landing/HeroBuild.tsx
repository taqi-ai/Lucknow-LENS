import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Magnet from '../reactbits/Magnet';
import { LucknowLettering } from './Lettering';
import { prefersReducedMotion } from './bits';
import type { TabProps } from './Landing';

/*
 * The opening: Rumi Darwaza, built in front of you.
 *   1. An ink sketch (traced from the painting itself, so every line lines up) is
 *      drawn in from the ground, with a glowing pen front.
 *   2. The painting rises course by course from the paving to the crown, behind a
 *      gold mason's line, the way a building actually goes up.
 *   3. The sketch lifts away and the colour settles.
 * Day and night each have their own painting and sketch; the site's circle
 * transition swaps them.
 */

const ART = (v: 'day' | 'night') => ({ paint: `/lucknow/art/hero-${v}.webp`, sketch: `/lucknow/art/hero-${v}-sketch.webp` });

/** Hindi and Urdu, always saying the same thing at the same moment. */
const LINES = [
  { hi: 'मुस्कुराइए, आप लखनऊ में हैं', ur: 'مسکرائیے، آپ لکھنؤ میں ہیں', en: 'Smile, you are in Lucknow' },
  { hi: 'पहले आप', ur: 'پہلے آپ', en: 'After you, the city\'s own courtesy' },
  { hi: 'लम्हा लम्हा लखनऊ', ur: 'لمحہ لمحہ لکھنؤ', en: 'Lucknow, moment by moment' },
];

const Bilingual: React.FC = () => {
  const [i, setI] = useState(0);
  const reduce = prefersReducedMotion();
  useEffect(() => { if (reduce) return; const t = window.setInterval(() => setI((n) => (n + 1) % LINES.length), 4200); return () => window.clearInterval(t); }, [reduce]);
  const l = LINES[i];
  const enter = { opacity: 0, y: 14, filter: 'blur(8px)' };
  const show = { opacity: 1, y: 0, filter: 'blur(0px)' };
  const leave = { opacity: 0, y: -12, filter: 'blur(8px)' };
  return (
    <div className="relative h-[6.4rem] w-full sm:h-[5.6rem]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div key={i} className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-center">
          <motion.span lang="hi" className="font-deva text-[clamp(1.15rem,1.9vw,1.55rem)] text-sand" initial={enter} animate={show} exit={leave} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>{l.hi}</motion.span>
          <motion.span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-amber" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.4, delay: 0.1 }} />
          <motion.span lang="ur" dir="rtl" className="font-urdu text-[clamp(1.2rem,2vw,1.6rem)] leading-[2] text-sand" initial={enter} animate={show} exit={leave} transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>{l.ur}</motion.span>
          <motion.span className="w-full text-[12.5px] font-medium tracking-wide text-paper/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>{l.en}</motion.span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/** One time of day: sketch, rising paint and the mason's line. */
const Build: React.FC<{ v: 'day' | 'night'; play: boolean; y: MotionValue<string> }> = ({ v, play, y }) => {
  const a = ART(v);
  const reduce = prefersReducedMotion() || !play;
  const ease = [0.65, 0, 0.35, 1] as const;
  const common = 'absolute inset-0 h-full w-full object-cover object-[64%_62%]';
  return (
    <div className={`hero-${v} absolute inset-0`}>
      {/* 1. the sketch draws in from the ground up */}
      <motion.img src={a.sketch} alt="" aria-hidden className={`${common} hero-sketch`} style={{ y }}
        initial={reduce ? false : { clipPath: 'inset(100% 0% 0% 0%)', opacity: 1 }}
        animate={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: reduce ? 0 : [1, 1, 0] }}
        transition={{ clipPath: { duration: 1.5, ease }, opacity: { duration: 4.6, times: [0, 0.72, 1] } }} />
      {/* 2. the paint rises course by course */}
      <motion.img src={a.paint} alt={v === 'day' ? 'Rumi Darwaza, Lucknow, painted at golden hour' : 'Rumi Darwaza, Lucknow, lit at night'} className={common} style={{ y }}
        initial={reduce ? false : { clipPath: 'inset(100% 0% 0% 0%)', filter: 'saturate(0.2) brightness(1.08)' }}
        animate={{ clipPath: 'inset(0% 0% 0% 0%)', filter: 'saturate(1) brightness(1)' }}
        transition={{ clipPath: { duration: 2.2, delay: 1.25, ease: [0.76, 0, 0.24, 1] }, filter: { duration: 1.4, delay: 3 } }} />
      {/* the mason's line riding the top of the new courses */}
      {!reduce && (
        <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, var(--color-amber) 30%, #fff3c8 60%, var(--color-amber) 80%, transparent)', boxShadow: '0 0 24px 6px color-mix(in srgb, var(--color-amber) 55%, transparent)' }}
          initial={{ top: '100%', opacity: 0 }} animate={{ top: ['100%', '0%'], opacity: [0, 1, 1, 0] }}
          transition={{ top: { duration: 2.2, delay: 1.25, ease: [0.76, 0, 0.24, 1] }, opacity: { duration: 2.4, delay: 1.2, times: [0, 0.08, 0.85, 1] } }} />
      )}
    </div>
  );
};

export const HeroBuild: React.FC<TabProps> = ({ onEnter, goTab }) => {
  const reduce = prefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '12%']);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);
  const ghostX = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-8%']);

  return (
    <section ref={ref} className="hero-build relative isolate h-[calc(100svh-76px)] min-h-[660px] overflow-hidden bg-cabin">
      <Build v="day" play y={y} />
      <Build v="night" play y={y} />

      {/* the city's name in Nastaliq, large and quiet behind the words */}
      <motion.p aria-hidden lang="ur" dir="rtl" style={{ x: ghostX }}
        className="pointer-events-none absolute left-[-2%] top-[6%] select-none font-urdu text-[clamp(9rem,22vw,20rem)] leading-none text-sand/[0.08]"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, delay: 0.4 }}>لکھنؤ</motion.p>

      {/* legibility on the left, in the page's own colour */}
      <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, var(--color-cabin) 0%, color-mix(in srgb, var(--color-cabin) 86%, transparent) 28%, transparent 56%)' }} />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-36" style={{ background: 'linear-gradient(to top, var(--color-cabin), transparent)' }} />

      <motion.div style={{ y: textY }} className="relative z-10 mx-auto flex h-full max-w-[1320px] items-center px-4 sm:px-8">
        {/* the words sit in an arched plaque that repeats the gate's own outline */}
        <div className="relative w-full max-w-[600px] px-7 pb-10 pt-[clamp(4.5rem,9vh,6.5rem)] text-center sm:px-12">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 140" preserveAspectRatio="none">
            <defs>
              <clipPath id="plaque-clip"><path d="M2 140 V40 C2 26 10 19 20 17 C22 9 30 4 38 3 C42 1 46 0 50 0 C54 0 58 1 62 3 C70 4 78 9 80 17 C90 19 98 26 98 40 V140 Z" /></clipPath>
            </defs>
            <path d="M2 140 V40 C2 26 10 19 20 17 C22 9 30 4 38 3 C42 1 46 0 50 0 C54 0 58 1 62 3 C70 4 78 9 80 17 C90 19 98 26 98 40 V140 Z" fill="color-mix(in srgb, var(--color-cabin) 74%, transparent)" />
            <motion.path d="M2 140 V40 C2 26 10 19 20 17 C22 9 30 4 38 3 C42 1 46 0 50 0 C54 0 58 1 62 3 C70 4 78 9 80 17 C90 19 98 26 98 40 V140" fill="none" stroke="var(--color-amber)" strokeWidth="1.4" vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, delay: 0.3, ease: [0.65, 0, 0.35, 1] }} />
            <motion.path d="M5.5 140 V41 C5.5 29 12.5 23 21.5 21 C23.5 13 31 8.5 38.5 7.2 C42.5 5.4 46.5 4.6 50 4.4 C53.5 4.6 57.5 5.4 61.5 7.2 C69 8.5 76.5 13 78.5 21 C87.5 23 94.5 29 94.5 41 V140" fill="none" stroke="var(--color-amber)" strokeOpacity=".45" strokeWidth="1" vectorEffect="non-scaling-stroke"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, delay: 0.5, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
          {/* a small finial, like the chhatri on the gate */}
          <motion.span aria-hidden className="absolute left-1/2 top-[-14px] grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border border-amber/70 bg-cabin"
            initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.6, type: 'spring', stiffness: 300, damping: 18 }}>
            <span className="h-2 w-2 rotate-45 bg-amber" />
          </motion.span>

          <div className="relative">
            <h1 className="text-paper" aria-label="Fly over Lucknow.">
              <span className="mb-1 block" aria-hidden><LucknowLettering word="namaste" className="mx-auto block h-auto w-[min(30%,110px)] text-amber" delay={0.1} /></span>
              <span className="block" aria-hidden><LucknowLettering word="flyover" className="mx-auto block h-auto w-[min(62%,250px)] text-sand" delay={0.3} /></span>
              <span className="mt-2 block" aria-hidden><LucknowLettering className="mx-auto block h-auto w-[min(100%,470px)] text-paper" delay={0.55} /></span>
            </h1>
            <div aria-hidden className="mx-auto mt-4 flex items-center justify-center gap-3 text-amber">
              <motion.span className="h-px w-16 origin-right bg-current" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.9, duration: 0.9 }} />
              <span className="h-1.5 w-1.5 rotate-45 bg-current" />
              <motion.span className="h-px w-16 origin-left bg-current" initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.9, duration: 0.9 }} />
            </div>
            <div className="mt-4 flex justify-center"><Bilingual /></div>
            <motion.p initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.8 }} className="mx-auto mt-2 max-w-[26rem] text-[clamp(0.98rem,1.25vw,1.1rem)] leading-[1.6] text-paper/75">
              The city of nawabs as a live 3D map, and a guide to its history, its kitchens and its river.
            </motion.p>
            <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15, duration: 0.8 }} className="mt-8 flex flex-wrap items-center justify-center gap-5">
              <Magnet padding={60} magnetStrength={4}>
                <button data-enter onClick={() => onEnter()} className="group inline-flex items-center gap-3 rounded-full bg-sand py-3.5 pl-7 pr-3.5 text-[15px] font-semibold text-terrain shadow-[0_18px_44px_-18px_var(--color-sand)] active:scale-95">
                  Take off<span className="grid h-8 w-8 place-items-center rounded-full bg-terrain/15 transition-transform duration-500 group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
                </button>
              </Magnet>
              <button onClick={() => goTab('heritage')} className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-paper/80 underline-offset-[6px] hover:text-paper hover:underline">Look around first <ArrowUpRight className="h-4 w-4" /></button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroBuild;
