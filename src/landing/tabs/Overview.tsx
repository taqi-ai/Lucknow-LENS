import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import BlurText from '../../reactbits/BlurText';
import CountUp from '../../reactbits/CountUp';
import CurvedLoop from '../../reactbits/CurvedLoop';
import GradientText from '../../reactbits/GradientText';
import MagicBento, { type MagicBentoItem } from '../../reactbits/MagicBento';
import Magnet from '../../reactbits/Magnet';
import ShinyText from '../../reactbits/ShinyText';
import StarBorder from '../../reactbits/StarBorder';
import { useLiveFeed, type LiveAirQualityDTO, type LiveWeatherDTO } from '../../interactions/liveFeed';
import { MONUMENTS, TABS, photo } from '../content';
import { Photo, Wrap, H2, Kicker } from '../ui';
import { WindowHero } from '../WindowHero';
import { prefersReducedMotion } from '../bits';
import type { TabProps } from '../Landing';

const Stat: React.FC<{ to: number; suffix?: string; decimals?: number; label: string }> = ({ to, suffix, decimals, label }) => (
  <div className="border-l border-sand/20 pl-5">
    <p className="font-display text-[clamp(2rem,4vw,3.2rem)] font-light leading-none text-paper"><CountUp to={to} suffix={suffix} decimals={decimals} duration={2.2} separator="," /></p>
    <p className="mt-3 text-[13px] leading-[1.5] text-paper/55">{label}</p>
  </div>
);

export default function Overview({ onEnter, goTab }: TabProps) {
  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  const air = useLiveFeed<LiveAirQualityDTO>('/api/live/air', true, 600_000);

  const bento: MagicBentoItem[] = [
    { id: 'city', label: 'The 3D city', title: 'Every street, every building', description: 'Close to a million real map features, placed where they stand. Rotate, tilt and fly from the whole city to a single lane.', image: photo('skyline'), colSpan: 2, rowSpan: 2, onClick: () => onEnter() },
    { id: 'live', label: 'Live', title: 'Air, weather, aircraft', description: 'Public feeds with the age of every reading shown. If a feed is down, the map says so.', colSpan: 1, rowSpan: 1 },
    { id: 'route', label: 'Routes', title: 'Drive a route', description: 'Pick two places and the route is drawn over the real road network.', colSpan: 1, rowSpan: 1 },
    { id: 'heritage', label: 'Heritage', title: 'Walk the Nawabi city', description: 'Gateways, imambaras and palaces, each with a fly-to.', image: photo('chota-imambara'), colSpan: 1, rowSpan: 1, onClick: () => goTab('heritage') },
    { id: 'emergency', label: 'Services', title: 'Hospitals, fire, police', description: 'Coverage radii for emergency services across the city.', colSpan: 1, rowSpan: 1, onClick: () => goTab('government') },
  ];

  return (
    <>
      {/* hero */}
      <section className="relative isolate overflow-hidden px-5 pb-16 pt-12 sm:px-8 lg:pb-24 lg:pt-8">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(70% 60% at 78% 45%, rgba(198,139,84,.24), transparent 70%), radial-gradient(60% 50% at 10% 100%, rgba(120,154,133,.14), transparent 70%)' }} />
        <div className="mx-auto grid min-h-[calc(100svh-120px)] max-w-[1280px] items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="max-w-[660px]">
            <p className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-sand/80">
              <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage shadow-[0_0_10px_#789a85]" />Live from Lucknow, Uttar Pradesh</span>
              {weather.value && weather.status !== 'unavailable' && <span>{Math.round(weather.value.temperatureC)}°C, {weather.value.description.toLowerCase()}</span>}
              {air.value && air.status !== 'unavailable' && <span>AQI {Math.round(air.value.usAqi)} ({air.value.category.toLowerCase()})</span>}
            </p>
            <BlurText text="Lucknow, as you would see it from the window seat." trigger="load" delay={120} className="font-display text-[clamp(2.7rem,6.2vw,5.6rem)] font-light leading-[1.02] tracking-[-0.025em] text-paper" />
            <p className="mt-7 max-w-[36rem] text-[17px] leading-[1.7] text-paper/70">
              <GradientText colors={['#d5c7a5', '#f0c9a0', '#c68b54']} animationSpeed={8}>The city of nawabs</GradientText>, mapped in 3D. Explore its monuments, its table and its river here, then fly into the live map when you are ready.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Magnet>
                <StarBorder as="button" onClick={() => onEnter()} theme="light" color="#f0c9a0" backgroundColor="#d5c7a5" textColor="#14232d" duration={5} style={{ fontSize: 15, fontWeight: 700 }}>
                  <span className="inline-flex items-center gap-3 px-4 py-1.5">Enter the city <ArrowRight className="h-4 w-4" /></span>
                </StarBorder>
              </Magnet>
              <button onClick={() => goTab('heritage')} className="inline-flex items-center gap-2 text-[14px] font-medium text-paper/75 transition-colors hover:text-paper">
                <ShinyText text="Explore the heritage first" speed={3} /> <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <motion.div initial={prefersReducedMotion() ? false : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }} className="lg:justify-self-end">
            <WindowHero />
          </motion.div>
        </div>
      </section>

      {/* names drifting along a curve */}
      <section aria-hidden className="overflow-hidden border-y border-sand/10">
        <div className="hidden py-2 sm:block"><CurvedLoop marqueeText="लखनऊ ✦ Lucknow ✦ لکھنؤ ✦ Awadh ✦ अवध ✦ Gomti ✦ गोमती ✦ " speed={1.6} curveAmount={90} className="fill-sand/70" fontSize={56} /></div>
        <div className="flex py-5 sm:hidden"><div className="marquee-track flex shrink-0 gap-8 whitespace-nowrap font-display text-[1.7rem] font-light italic text-sand/70">{Array.from({ length: 2 }).flatMap((_, k) => ['लखनऊ', 'Lucknow', 'لکھنؤ', 'Awadh', 'अवध', 'Gomti', 'गोमती'].map((w) => <span key={k + w}>{w} ✦</span>))}</div></div>
      </section>

      {/* facts */}
      <Wrap className="py-24">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <Stat to={2.8} decimals={1} suffix=" M" label="residents in the city (2011 census)" />
          <Stat to={1784} label="Rumi Darwaza and Bara Imambara completed" />
          <Stat to={959} suffix="k" label="buildings, roads and places on the map" />
          <Stat to={6} label="live public feeds, each with its age shown" />
        </div>
      </Wrap>

      {/* bento */}
      <Wrap className="pb-28">
        <div className="mb-12 max-w-[640px]">
          <Kicker>What is inside</Kicker>
          <H2>One map, many ways in</H2>
        </div>
        <MagicBento items={bento} columns={4} rowHeight={220} gap={14} theme="dark" glowColor="213, 199, 165" enableStars={false} enableTilt={false} enableMagnetism={false} />
      </Wrap>

      {/* places */}
      <section className="pb-28">
        <Wrap className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[560px]">
            <Kicker>Start somewhere</Kicker>
            <H2>Pick a place, and fly there</H2>
          </div>
          <button onClick={() => goTab('heritage')} className="text-[14px] font-semibold text-sand underline-offset-4 hover:underline">All monuments</button>
        </Wrap>
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:px-8 lg:px-[max(2rem,calc((100vw-1280px)/2+2rem))]" data-lenis-prevent-wheel>
          {MONUMENTS.filter((m) => m.preset).map((m) => (
            <article key={m.slug} className="group relative h-[420px] w-[min(80vw,320px)] shrink-0 snap-start overflow-hidden rounded-[26px] border border-sand/12">
              <Photo slug={m.slug} alt={m.en} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]" />
              <div className="absolute inset-0 bg-gradient-to-t from-cabin via-cabin/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="font-deva text-[1.5rem] text-sand" lang="hi">{m.hi}</p>
                <h3 className="font-display text-[1.5rem] font-light">{m.en}</h3>
                <button onClick={() => onEnter(m.preset)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-sand/95 px-4 py-2 text-[13px] font-semibold text-terrain transition-transform active:scale-95">
                  Fly there <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* portal to other pages */}
      <Wrap className="pb-28">
        <div className="mb-10 max-w-[640px]"><Kicker>Beyond the map</Kicker><H2>Everything about the city</H2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { id: 'food', slug: 'tunday' }, { id: 'history', slug: 'residency' }, { id: 'travel', slug: 'charbagh' },
            { id: 'geography', slug: 'gomti-riverfront' }, { id: 'government', slug: 'vidhan-sabha' }, { id: 'platform', slug: 'metro' },
          ].map(({ id, slug }) => {
            const t = TABS.find((x) => x.id === id)!;
            return (
              <a key={id} href={`#/${id}`} className="group relative flex h-[220px] flex-col justify-end overflow-hidden rounded-[24px] border border-sand/12 p-6">
                <Photo slug={slug} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-all duration-700 group-hover:scale-105 group-hover:opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-cabin via-cabin/50 to-transparent" />
                <p className="relative font-deva text-[1.2rem] text-sand/90" lang="hi">{t.hi}</p>
                <p className="relative flex items-center justify-between font-display text-[1.6rem] font-light">{t.label}<ArrowUpRight className="h-5 w-5 text-sand transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></p>
                <p className="relative text-[13px] text-paper/60">{t.blurb}</p>
              </a>
            );
          })}
        </div>
      </Wrap>

      {/* close */}
      <section className="relative isolate overflow-hidden border-t border-sand/10 px-5 py-28 text-center sm:px-8 sm:py-40">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(60% 70% at 50% 100%, rgba(198,139,84,.3), transparent 70%)' }} />
        <BlurText text="Come and see it from above." className="mx-auto max-w-[900px] justify-center font-display text-[clamp(2.4rem,6vw,5rem)] font-light leading-[1.04] tracking-[-0.025em]" />
        <div className="mt-11 flex justify-center">
          <Magnet><button onClick={() => onEnter()} className="rounded-full bg-sand px-10 py-5 text-[16px] font-semibold text-terrain transition-transform active:scale-95">Enter the city</button></Magnet>
        </div>
      </section>
    </>
  );
}
