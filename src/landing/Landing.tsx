import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DayNightToggle } from '../components/ui/DayNight';
import { PalettePicker, applyPalette, readPalette } from './PalettePicker';
import Lenis from 'lenis';
import { AnimatePresence, motion } from 'motion/react';
import type { CameraPreset } from '../types';
import { useLiveFeed, type LiveAirQualityDTO, type LiveWeatherDTO } from '../interactions/liveFeed';
import { TerralytMark } from '../components/ui/TerralytMark';
import { prefersReducedMotion } from './bits';
import ClickSpark from '../reactbits/ClickSpark';
import { TABS } from './content';

export interface TabProps { onEnter: (preset?: CameraPreset) => void; goTab: (id: string) => void }

const PAGES: Record<string, React.LazyExoticComponent<React.ComponentType<TabProps>>> = {
  overview: lazy(() => import('./tabs/Overview')),
  heritage: lazy(() => import('./tabs/Heritage')),
  history: lazy(() => import('./tabs/History')),
  food: lazy(() => import('./tabs/Food')),
  travel: lazy(() => import('./tabs/Travel')),
  geography: lazy(() => import('./tabs/Geography')),
  government: lazy(() => import('./tabs/Government')),
  platform: lazy(() => import('./tabs/Platform')),
  about: lazy(() => import('./tabs/About')),
};

const idFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return PAGES[id] ? id : 'overview';
};

type LenisWindow = Window & { __lenis?: Lenis };

interface LandingProps { onEnter: (preset?: CameraPreset) => void; onPrefetch: () => void }

export const Landing: React.FC<LandingProps> = ({ onEnter, onPrefetch }) => {
  const [tab, setTab] = useState(idFromHash);
  const [scrolled, setScrolled] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [night, setNight] = useState<boolean>(() => { try { return localStorage.getItem('terralyt.site.night') === '1'; } catch { return false; } });
  useEffect(() => { document.documentElement.dataset.time = night ? 'night' : 'day'; }, [night]);
  /** Day/night for the whole site; the map picks up the same choice when you board. */
  const switchTime = useCallback((n: boolean, origin?: { x: number; y: number }) => {
    try {
      localStorage.setItem('terralyt.site.night', n ? '1' : '0');
      const k = 'terralyt.map.prefs.v1';
      const prefs = JSON.parse(localStorage.getItem(k) ?? '{}');
      localStorage.setItem(k, JSON.stringify({ ...prefs, night: n }));
    } catch { /* storage blocked */ }
    const root = document.documentElement;
    if (origin) { root.style.setProperty('--dn-x', origin.x + 'px'); root.style.setProperty('--dn-y', origin.y + 'px'); }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !prefersReducedMotion()) doc.startViewTransition(() => flushSync(() => setNight(n)));
    else setNight(n);
  }, []);
  const navRef = useRef<HTMLElement>(null);

  const goTab = useCallback((id: string) => {
    if (window.location.hash !== `#/${id}`) window.location.hash = `/${id}`;
    else setTab(id);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setTab(idFromHash());
      window.scrollTo({ top: 0 });
      (window as LenisWindow).__lenis?.scrollTo(0, { immediate: true });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => { document.title = `${TABS.find((t) => t.id === tab)?.label ?? 'Overview'} · TERRALYT LUCKNOW`; }, [tab]);

  // keep the active tab visible in the scrolling tab strip on phones
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    (window as LenisWindow).__lenis = lenis;
    return () => { cancelAnimationFrame(raf); lenis.destroy(); delete (window as LenisWindow).__lenis; };
  }, []);
  useEffect(() => {
    const onScroll = () => { setScrolled(window.scrollY > 24); setPastHero(window.scrollY > window.innerHeight * 0.82); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The map downloads only when someone reaches for an Enter control (hover, focus, touch).
  const intent = (e: React.SyntheticEvent) => { if ((e.target as Element).closest?.('[data-enter]')) onPrefetch(); };

  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  const air = useLiveFeed<LiveAirQualityDTO>('/api/live/air', true, 600_000);
  const Page = PAGES[tab];
  // On the Overview the header floats over the opening photo until you scroll past it.
  const floating = false;

  return (
    <ClickSpark sparkColor={['#b8892e', '#7a1630', '#d9b26a']} sparkCount={10} sparkRadius={28} duration={520} disabled={prefersReducedMotion()}>
      <div id="top" className="relative min-h-screen bg-cabin text-paper" onPointerOver={intent} onFocus={intent} onTouchStart={intent}>
        <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-sand focus:px-4 focus:py-2 focus:text-terrain">Skip to content</a>

        <div className={`${tab === 'overview' ? 'fixed' : 'sticky'} inset-x-0 top-0 z-40 transition-transform duration-500`} style={tab === 'overview' && pastHero ? { transform: 'translateY(-33px)' } : undefined}>
        {/* utility strip */}
        <div className={`relative z-50 text-[11.5px] transition-colors duration-500 ${floating ? 'border-b border-white/10 bg-transparent text-white/70' : 'border-b border-sand/10 bg-terrain text-paper/60'}`}>
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2 sm:px-8">
            <p>An independent student project. Not an official website of any government body.</p>
            <p className="flex items-center gap-4 font-mono">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sage" />Lucknow</span>
              {weather.value && weather.status !== 'unavailable' && <span>{Math.round(weather.value.temperatureC)}°C</span>}
              {air.value && air.status !== 'unavailable' && <span>AQI {Math.round(air.value.usAqi)}</span>}
              <a href="#/government" className="hidden underline-offset-4 hover:text-paper hover:underline sm:inline">Emergency 112</a>
            </p>
          </div>
        </div>

        {/* header */}
        <header className={`transition-colors duration-500 ${floating ? 'border-b border-transparent bg-transparent' : scrolled ? 'border-b border-paper/10 bg-cabin/90 backdrop-blur-xl' : 'border-b border-transparent bg-cabin/60 backdrop-blur-md'}`}>
          <div className="mx-auto flex h-[64px] max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
            <a href="#/overview" className="flex shrink-0 items-center gap-3" aria-label="Terralyt Lucknow, overview">
              <span className="font-display text-[1.6rem] leading-none text-paper">Terralyt</span>
              <span className="font-deva mt-1 hidden text-[1rem] leading-none text-sand sm:inline" lang="hi">लखनऊ</span>
            </a>
            <nav ref={navRef} aria-label="Sections" className="no-scrollbar -mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1 text-[13px] font-medium">
              {TABS.map((t) => (
                <a key={t.id} href={`#/${t.id}`} aria-current={tab === t.id ? 'page' : undefined} className={`relative whitespace-nowrap rounded-full px-3.5 py-2 transition-colors ${tab === t.id ? 'text-terrain' : floating ? 'text-white/80 hover:text-white' : 'text-paper/65 hover:text-paper'}`}>
                  {tab === t.id && <motion.span layoutId="tabpill" className="absolute inset-0 -z-10 rounded-full bg-sand" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  {t.label}
                </a>
              ))}
            </nav>
            <PalettePicker className="shrink-0" />
            <DayNightToggle night={night} onChange={switchTime} className="shrink-0" />
            <button data-enter onClick={() => onEnter()} className="hidden shrink-0 rounded-full bg-sand px-5 py-2.5 text-[13px] font-semibold text-terrain transition-transform hover:scale-[1.04] active:scale-95 lg:block">Enter the city</button>
          </div>
        </header>
        </div>

        <main id="main" tabIndex={-1} className="outline-none">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={prefersReducedMotion() ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <Suspense fallback={<div className="grid min-h-[70vh] place-items-center font-mono text-[12px] text-sand/60">Loading…</div>}>
                <Page onEnter={onEnter} goTab={goTab} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* mobile floating CTA (the Overview hero has its own boarding pass) */}
        {tab !== 'overview' && <button data-enter onClick={() => onEnter()} className="fixed bottom-4 right-4 z-40 rounded-full bg-sand px-5 py-3 text-[13px] font-semibold text-terrain shadow-[0_14px_40px_-8px_rgba(0,0,0,.7)] active:scale-95 lg:hidden">Enter the city</button>}

        <footer className="border-t border-sand/10 bg-terrain px-5 py-12 sm:px-8">
          <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3"><TerralytMark className="h-9 w-9 object-contain" /><span className="text-[14px] font-bold tracking-[0.14em]">TERRALYT <span className="text-sand">LUCKNOW</span></span></div>
              <p className="mt-4 max-w-[26rem] text-[13px] leading-[1.7] text-paper/55">Urban spatial intelligence for Lucknow. Built by students, using open data. Not affiliated with, endorsed by, or published on behalf of any government department.</p>
            </div>
            <ul className="space-y-2 text-[13px] text-paper/60">
              {TABS.slice(0, 5).map((t) => <li key={t.id}><a className="hover:text-paper" href={`#/${t.id}`}>{t.label}</a></li>)}
            </ul>
            <ul className="space-y-2 text-[13px] text-paper/60">
              {TABS.slice(5).map((t) => <li key={t.id}><a className="hover:text-paper" href={`#/${t.id}`}>{t.label}</a></li>)}
              <li><a className="hover:text-paper" href="#/about">Photo credits</a></li>
            </ul>
          </div>
        </footer>
      </div>
    </ClickSpark>
  );
};

export default Landing;
