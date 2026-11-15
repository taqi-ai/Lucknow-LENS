import React from 'react';
import { motion } from 'motion/react';
import CountUp from '../../reactbits/CountUp';
import SpotlightCard from '../../reactbits/SpotlightCard';
import { GOV_USES, PIPELINE, PLATFORM_STATS } from '../content';
import { H2, Kicker, PageHero, Wrap } from '../ui';
import { prefersReducedMotion } from '../bits';
import type { TabProps } from '../Landing';

export default function Platform({ onEnter }: TabProps) {
  return (
    <>
      <PageHero
        kicker="What Terralyt is" title="The platform" hi="मंच" backdrop="dots"
        intro="Terralyt Lucknow is a living 3D map of the city, built from open data and designed so a department, a planner or a resident can read it at a glance. Lucknow is the first deployment. The pipeline is built to be pointed at other Indian cities."
      />

      <Wrap className="pb-24">
        <div className="grid gap-px overflow-hidden rounded-[28px] border border-sand/12 bg-sand/10 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_STATS.map((s) => (
            <div key={s.label} className="bg-[#0f1c24] p-8">
              <p className="font-display text-[clamp(2.2rem,4vw,3.4rem)] font-light leading-none text-sand"><CountUp to={s.value} suffix={s.suffix} duration={2.2} separator="," /></p>
              <p className="mt-4 text-[14px] font-semibold">{s.label}</p>
              <p className="mt-2 text-[13px] leading-[1.6] text-paper/55">{s.note}</p>
            </div>
          ))}
        </div>
      </Wrap>

      <Wrap className="grid gap-12 pb-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Kicker>For the city</Kicker>
          <H2>Made for the people who run it</H2>
          <p className="mt-6 max-w-[28rem] text-[15.5px] leading-[1.75] text-paper/65">One shared picture of Lucknow for the departments that plan, serve and respond. We say plainly what works today and what is still ahead.</p>
          <div className="mt-8 flex items-center gap-5 text-[12px] text-paper/55">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sage" />Working today</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full border border-amber" />Roadmap</span>
          </div>
        </div>
        <ul className="divide-y divide-sand/10 border-y border-sand/10">
          {GOV_USES.map((u) => (
            <motion.li key={u.title} initial={prefersReducedMotion() ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: 0.6 }} className="grid gap-3 py-7 sm:grid-cols-[1fr_auto] sm:gap-10">
              <div>
                <h3 className="font-display text-[1.45rem] font-light">{u.title}</h3>
                <p className="mt-2 max-w-[34rem] text-[14.5px] leading-[1.7] text-paper/60">{u.body}</p>
              </div>
              <span className={`h-fit justify-self-start rounded-full px-3.5 py-1.5 text-[12px] font-medium sm:justify-self-end ${u.status === 'live' ? 'bg-sage/15 text-sage' : 'border border-amber/50 text-amber'}`}>{u.status === 'live' ? 'Working today' : 'Roadmap'}</span>
            </motion.li>
          ))}
        </ul>
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Under the hood</Kicker><H2>From open data to your screen</H2></div>
        <ol className="grid gap-4 md:grid-cols-5">
          {PIPELINE.map((p, i) => (
            <li key={p.t}>
              <SpotlightCard spotlightColor="rgba(120,154,133,0.2)" className="!h-full !rounded-[22px] !border-sand/12 !bg-terrain/60 p-6">
                <p className="font-mono text-[11px] text-sage">0{i + 1}</p>
                <h3 className="mt-3 text-[15.5px] font-semibold leading-snug">{p.t}</h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-paper/58">{p.d}</p>
              </SpotlightCard>
            </li>
          ))}
        </ol>
      </Wrap>

      <Wrap className="pb-28">
        <div className="rounded-[28px] border border-sand/15 bg-terrain/60 p-8 sm:p-12">
          <h3 className="font-display text-[1.9rem] font-light">Our rule about data</h3>
          <p className="mt-4 max-w-[46rem] text-[15.5px] leading-[1.8] text-paper/70">Every live layer shows where it comes from and how old the reading is. When a feed is down, the layer says it is down. We never fill the gap with invented numbers, because a city tool that guesses is worse than one that admits it cannot see.</p>
          <button onClick={() => onEnter()} className="mt-8 rounded-full bg-sand px-7 py-3.5 text-[14px] font-semibold text-terrain transition-transform active:scale-95">See it live</button>
        </div>
      </Wrap>
    </>
  );
}
