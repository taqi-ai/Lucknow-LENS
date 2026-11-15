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
import { RumiDarwaza, ClockTower, ChotaImambara, Handi } from '../Elevations';
import { BoardingPass } from '../BoardingPass';
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
  { ur: 'گنگا جمنی', hi: 'गंगा-जमुनी', en: 'Ganga-Jamuni', note: 'The shared Hindu and Muslim culture of the city, in its festivals, food and poetry.' },
];

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-4 text-[14.5px] font-semibold text-amber">{children}</p>
);

const Hero: React.FC<TabProps> = ({ onEnter, goTab }) => {
  const ref = useRef<HTMLElement>(null);
  const reduce = prefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const drawY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  // a little life under the cursor: the drawing leans away from it
  const mx = useSpring(useMotionValue(0), { stiffness: 60, damping: 20 });
  const lean = useTransform(mx, (v) => v * -14);

  return (
    <section
      ref={ref}
      className="relative isolate flex h-[calc(100svh-97px)] min-h-[620px] flex-col overflow-hidden"
      onPointerMove={(e) => { if (!reduce && e.pointerType === 'mouse') mx.set((e.clientX / window.innerWidth - 0.5) * 2); }}
    >
      <div aria-hidden className="jali absolute inset-0 -z-10 opacity-70" />

      <motion.div style={{ y: textY, opacity: fade }} className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pt-[6svh] sm:px-10">
        <TextType as="p" className="font-deva min-h-[1.6em] text-[clamp(1rem,1.8vw,1.35rem)] text-amber" text={['मुस्कुराइए, कि आप लखनऊ में हैं', 'Smile, you are in Lucknow']} typingSpeed={50} deletingSpeed={24} pauseDuration={2800} cursorCharacter="|" loop />
        <h1 className="mt-3 max-w-[12ch] font-display text-[clamp(3.2rem,9vw,8.6rem)] leading-[0.95] text-paper" aria-label="Fly over Lucknow.">
          {['Fly', 'over', 'Lucknow.'].map((wd, i) => (
            <span key={wd} className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
              <motion.span className="inline-block" initial={reduce ? false : { y: '105%' }} animate={{ y: '0%' }} transition={{ duration: 1.1, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}>{wd}</motion.span>
            </span>
          ))}
        </h1>
        <p className="mt-7 max-w-[34rem] text-[clamp(1.02rem,1.4vw,1.2rem)] leading-[1.6] text-paper/70">
          The city of nawabs as a live 3D map: every gate, every lane, every street light. And a guide to its history, its kitchens and its river.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-6">
          <Magnet padding={60} magnetStrength={4}>
            <button data-enter onClick={() => onEnter()} className="group inline-flex items-center gap-3 rounded-full bg-sand py-4 pl-7 pr-4 text-[15.5px] font-semibold text-terrain shadow-[0_18px_44px_-18px_var(--color-sand)] transition-transform active:scale-95">
              Take off
              <span className="grid h-8 w-8 place-items-center rounded-full bg-terrain/15 transition-transform duration-500 group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
            </button>
          </Magnet>
          <button onClick={() => goTab('heritage')} className="inline-flex items-center gap-2 text-[15px] font-semibold text-paper/75 underline-offset-[6px] hover:text-paper hover:underline">
            Look around first <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {/* Rumi Darwaza, drawn */}
      <motion.div style={{ y: drawY, x: lean }} className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[46%] justify-center text-paper lg:left-[38%] lg:h-[78%]">
        <div aria-hidden className="absolute left-1/2 top-[4%] aspect-square h-[30%] -translate-x-1/2 rounded-full border border-amber/50 bg-amber/10 transition-colors duration-700" />
        <RumiDarwaza className="relative h-full w-auto max-w-none opacity-90" delay={0.4} />
      </motion.div>
    </section>
  );
};

export default function Overview(props: TabProps) {
  const { onEnter } = props;
  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  const air = useLiveFeed<LiveAirQualityDTO>('/api/live/air', true, 600_000);
  const w = weather.value && weather.status !== 'unavailable' ? weather.value : null;
  const a = air.value && air.status !== 'unavailable' ? air.value : null;

  return (
    <>
      <Hero {...props} />

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

      {/* a statement, read word by word */}
      <Wrap className="py-28 sm:py-36">
        <ScrollReveal baseOpacity={0.1} enableBlur blurStrength={4} baseRotation={1.5} containerClassName="max-w-[60rem]" textClassName="font-display text-[clamp(1.8rem,3.8vw,3.2rem)] leading-[1.22] text-paper">
          For two centuries Lucknow was the capital of the Nawabs of Awadh. They gave it gateways, imambaras and a cuisine of slow fires. You can read about all of it here, then see it from the air.
        </ScrollReveal>
      </Wrap>

      {/* three rooms, each with its drawing */}
      <Wrap className="pb-28">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { href: '#/heritage', title: 'The heritage', body: 'Gateways, imambaras and palaces, with the stories behind them.', Draw: ChotaImambara },
            { href: '#/food', title: 'The table', body: `${UNESCO_GASTRONOMY.text.replace('In October 2025 UNESCO named', 'UNESCO named')}`, Draw: Handi },
            { href: '#/history', title: 'The history', body: 'From the court of Awadh and the siege of 1857 to the metro.', Draw: ClockTower },
          ].map(({ href, title, body, Draw }, i) => (
            <a key={href} href={href} className="group block">
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
    </>
  );
}
