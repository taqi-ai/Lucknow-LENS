import React, { useRef } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import CountUp from '../../reactbits/CountUp';
import TextType from '../../reactbits/TextType';
import ScrollVelocity from '../../reactbits/ScrollVelocity';
import ScrollReveal from '../../reactbits/ScrollReveal';
import SpotlightCard from '../../reactbits/SpotlightCard';
import FlowingMenu from '../../reactbits/FlowingMenu';
import Magnet from '../../reactbits/Magnet';
import { useLiveFeed, type LiveAirQualityDTO, type LiveWeatherDTO } from '../../interactions/liveFeed';
import { TABS, UNESCO_GASTRONOMY } from '../content';
import { Wrap } from '../ui';
import { ClockTower, ChotaImambara, Handi } from '../Elevations';
import { BoardingPass } from '../BoardingPass';
import { HeroBuild } from '../HeroBuild';
import { Statement } from '../Statement';
import { prefersReducedMotion } from '../bits';
import type { TabProps } from '../Landing';

/*
 * The landing page. No photographs: the monuments are drawn in one thin hand,
 * stroke by stroke. Every colour comes from the theme tokens, so it works in
 * every palette, by day and by night.
 */

const TEHZEEB = [
  { ur: 'پہلے آپ', hi: 'पहले आप', en: 'After you', note: 'The courtesy the city is known for. Two Lucknowis at a door can wait a long time.' },
  { ur: 'تہذیب', hi: 'तहज़ीब', en: 'Tehzeeb', note: 'Refinement in speech, food and manners. Here people say aap, never tu.' },
  { ur: 'آداب', hi: 'आदाब', en: 'Adaab', note: 'The Lucknow greeting: a slight bow, with the right hand raised to the brow.' },
];

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-4 text-[14.5px] font-semibold text-amber">{children}</p>
);

export default function Overview(props: TabProps) {
  const { onEnter } = props;
  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  const air = useLiveFeed<LiveAirQualityDTO>('/api/live/air', true, 600_000);
  const w = weather.value && weather.status !== 'unavailable' ? weather.value : null;
  const a = air.value && air.status !== 'unavailable' ? air.value : null;

  return (
    <>
      <HeroBuild {...props} />

      {/* the city's vocabulary, moving with your scroll */}
      <section aria-hidden className="overflow-hidden border-y border-paper/10 py-5">
        <ScrollVelocity
          texts={[
            <span key="a" className="font-display">Imambara <span className="text-amber">✦</span> Kebab <span className="text-amber">✦</span> Chikankari <span className="text-amber">✦</span> Tehzeeb <span className="text-amber">✦</span> Gomti <span className="text-amber">✦</span> Biryani <span className="text-amber">✦</span></span>,
            <span key="b" className="font-deva text-paper/45">इमामबाड़ा ✦ कबाब ✦ चिकनकारी ✦ तहज़ीब ✦ गोमती ✦ बिरयानी ✦</span>,
          ]}
          velocity={34}
          className="px-4 text-[clamp(1.8rem,4.4vw,3.6rem)] leading-tight text-paper"
        />
      </section>

      {/* the statement, with the city set in the line */}
      <Statement />

      {/* three rooms, each with its drawing */}
      <Wrap className="pb-28">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { href: '#/heritage', title: 'The heritage', body: 'Gateways, imambaras and palaces, with the stories behind them.', Draw: ChotaImambara },
            { href: '#/food', title: 'The table', body: `${UNESCO_GASTRONOMY.text.replace('In October 2025 UNESCO named', 'UNESCO named')}`, Draw: Handi },
            { href: '#/history', title: 'The history', body: 'From the court of Awadh and the siege of 1857 to the metro.', Draw: ClockTower },
          ].map(({ href, title, body, Draw }, i) => (
            <a key={href} href={href} className="group block min-w-0">
              <SpotlightCard spotlightColor="color-mix(in srgb, var(--color-amber) 22%, transparent)" className="!h-full !rounded-[28px] !border-paper/10 !bg-terrain p-7">
                <div className="flex h-[200px] items-end justify-center text-paper/80 transition-colors group-hover:text-sand">
                  <Draw className="h-full w-auto" delay={i * 0.25} />
                </div>
                <h3 className="mt-6 flex items-center justify-between font-display text-[1.7rem] leading-tight text-paper">{title}<ArrowUpRight className="h-5 w-5 text-sand transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-paper/65">{body}</p>
              </SpotlightCard>
            </a>
          ))}
        </div>
      </Wrap>

      {/* numbers */}
      <section className="border-y border-paper/10">
        <Wrap className="grid divide-y divide-paper/10 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[
            { to: 1775, l: 'the year the Nawabs made Lucknow their capital' },
            { to: 1784, l: 'Rumi Darwaza and Bara Imambara are finished' },
            { to: 959, s: 'k', l: 'buildings, roads and places on the live map' },
            { to: 30, s: ' km', l: 'of the Gomti, winding through the city' },
          ].map((x) => (
            <div key={x.l} className="py-10 lg:px-8 lg:first:pl-0">
              <p className="font-display text-[clamp(2.6rem,5vw,4rem)] leading-none tabular text-paper"><CountUp to={x.to} suffix={x.s} duration={2} separator="" /></p>
              <p className="mt-3 max-w-[15rem] text-[14px] leading-[1.5] text-paper/60">{x.l}</p>
            </div>
          ))}
        </Wrap>
      </section>

      {/* tehzeeb */}
      <Wrap className="py-28">
        <Eyebrow>Tehzeeb</Eyebrow>
        <h2 className="max-w-[40rem] font-display text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.02] text-paper">Three words you will hear in Lucknow</h2>
        <div className="mt-14 grid gap-12 md:grid-cols-3">
          {TEHZEEB.map((t, i) => (
            <motion.div key={t.en} initial={prefersReducedMotion() ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.8, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}>
              <p className="font-urdu text-[clamp(2.2rem,3.6vw,3rem)] leading-[1.9] text-sand" dir="rtl" lang="ur">{t.ur}</p>
              <p className="font-deva text-[1.3rem] text-paper/75" lang="hi">{t.hi}</p>
              <p className="mt-4 text-[17px] font-semibold text-paper">{t.en}</p>
              <p className="mt-1.5 max-w-[22rem] text-[15px] leading-[1.65] text-paper/65">{t.note}</p>
            </motion.div>
          ))}
        </div>
      </Wrap>

      {/* board */}
      <section className="relative overflow-hidden border-y border-paper/10 bg-terrain py-24">
        <Wrap className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <Eyebrow>Seat 26A, by the window</Eyebrow>
            <h2 className="max-w-[16ch] font-display text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.02] text-paper">Tear the stub when you are ready to fly</h2>
            <p className="mt-5 max-w-[30rem] text-[16px] leading-[1.65] text-paper/70">The map loads behind a cabin window while the shade rises. Then you dive through the glass. Nothing downloads until you reach for it.</p>
            {(w || a) && (
              <p className="mt-6 max-w-[30rem] text-[14.5px] leading-[1.6] text-paper/70">
                From the flight deck: {w ? <strong className="font-semibold text-paper">{Math.round(w.temperatureC)}°C over Lucknow, {w.description.toLowerCase()}</strong> : 'calm over Lucknow'}{a && <>, and the air is {a.category.toLowerCase()} (AQI {Math.round(a.usAqi)})</>}.
              </p>
            )}
          </div>
          <BoardingPass onBoard={() => onEnter()} weather={w ? `${Math.round(w.temperatureC)}°C, ${w.description.toLowerCase()}` : null} />
        </Wrap>
      </section>

      {/* index of rooms */}
      <section className="py-24">
        <Wrap className="mb-8"><Eyebrow>Every room</Eyebrow><h2 className="font-display text-[clamp(2.2rem,4.6vw,3.8rem)] leading-[1.02] text-paper">Where to next</h2></Wrap>
        <div style={{ height: (TABS.length - 1) * 88 }}>
          <FlowingMenu
            items={TABS.filter((t) => t.id !== 'overview').map((t) => ({ text: t.label, link: `#/${t.id}`, marquee: `${t.label} · ${t.hi} · ${t.blurb}` }))}
            textColor="var(--color-paper)" bgColor="var(--color-cabin)" marqueeBgColor="var(--color-sand)" marqueeTextColor="var(--color-terrain)" borderColor="color-mix(in srgb, var(--color-paper) 12%, transparent)"
          />
        </div>
      </section>
      {/* finale: the gate at night, and a last invitation */}
      <section className="relative isolate overflow-hidden">
        <img src="/lucknow/art/hero-day.webp" alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover object-[60%_55%]" />
        <img src="/lucknow/art/hero-night.webp" alt="" aria-hidden loading="lazy" className="finale-night absolute inset-0 -z-20 h-full w-full object-cover object-[60%_55%]" />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, var(--color-cabin) 0%, rgba(28,9,16,.55) 30%, rgba(28,9,16,.8) 100%)' }} />
        <div className="mx-auto flex min-h-[92svh] max-w-[1280px] flex-col items-center justify-center px-5 py-28 text-center sm:px-8">
          <p className="font-urdu text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.9] text-[#ecc98a]" dir="rtl" lang="ur">پھر ملیں گے</p>
          <p className="font-deva -mt-2 text-[clamp(1.4rem,2.6vw,2.1rem)] text-[#f6e7cf]/85" lang="hi">फिर मिलेंगे</p>
          <h2 className="mt-6 max-w-[16ch] font-display text-[clamp(2.8rem,6.4vw,6rem)] leading-[0.98] text-[#f6e7cf]">Lucknow is waiting below.</h2>
          <p className="mt-6 max-w-[34rem] text-[16.5px] leading-[1.65] text-[#f6e7cf]/75">Every gate, lane and street light, live in 3D. Take the window seat whenever you are ready.</p>
          <div className="mt-10"><Magnet padding={80} magnetStrength={4}>
            <button data-enter onClick={() => onEnter()} className="group inline-flex items-center gap-3 rounded-full bg-[#ecc98a] py-4 pl-8 pr-4 text-[16px] font-semibold text-[#2a0f18] shadow-[0_20px_60px_-20px_#ecc98a] active:scale-95">
              Take off<span className="grid h-9 w-9 place-items-center rounded-full bg-[#2a0f18]/10 transition-transform duration-500 group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
            </button>
          </Magnet></div>
        </div>
      </section>
    </>
  );
}
