import React, { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { getDeviceProfile } from '../city/deviceProfile';
import { ART, ART_FOOD, CREDITS, photo, photoSm } from './content';
import { prefersReducedMotion } from './bits';

/** True when a heavy WebGL backdrop is acceptable on this device. */
export function useRichMotion(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      const p = getDeviceProfile();
      setOk(p.tier === 'desktop' && !prefersReducedMotion());
    } catch { setOk(false); }
  }, []);
  return ok;
}

const Topography = lazy(() => import('../reactbits/Topography'));
const LightRays = lazy(() => import('../reactbits/LightRays'));
const SoftAurora = lazy(() => import('../reactbits/SoftAurora'));
const Particles = lazy(() => import('../reactbits/Particles'));
const DotGrid = lazy(() => import('../reactbits/DotGrid'));

/** Read the live palette so WebGL backdrops match the theme (they cannot use CSS variables). */
function useThemeColors() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim() || '#9a6428';
    return { sand: v('--color-sand'), amber: v('--color-amber'), dusk: v('--color-dusk'), paper: v('--color-paper'), slate: v('--color-slate'), night: document.documentElement.dataset.time === 'night' };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setC(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-time', 'data-palette'] });
    return () => mo.disconnect();
  }, []);
  return c;
}

export type BackdropKind = 'rays' | 'aurora' | 'topo' | 'particles' | 'dots' | 'none';

/** One WebGL backdrop per page, never on phones or with reduced motion. */
export const Backdrop: React.FC<{ kind: BackdropKind }> = ({ kind }) => {
  const rich = useRichMotion();
  // Only the Geography page keeps a live backdrop: the contour field is the subject there. Elsewhere it was decoration.
  if (!rich || kind === 'none') return null;
  return <BackdropInner kind={kind} />;
};

const BackdropInner: React.FC<{ kind: BackdropKind }> = ({ kind }) => {
  const c = useThemeColors();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
      <Suspense fallback={null}>
        {kind === 'topo' && <Topography key={c.sand + c.night} color={c.sand} lineCount={46} majorLines elevation={1.1} fog={0.4} glow={c.night ? 0.5 : 0.2} opacity={0.6} lightMode={!c.night} mouseInteraction hoverEffect="lift" />}
        {kind === 'rays' && <LightRays key={c.dusk + c.night} raysOrigin="top-center" raysColor={c.dusk} raysSpeed={0.5} lightSpread={0.9} rayLength={1.5} followMouse mouseInfluence={0.08} lightMode={!c.night} opacity={c.night ? 0.9 : 0.75} />}
        {kind === 'aurora' && <SoftAurora key={c.sand + c.night} color1={c.sand} color2={c.amber} speed={0.45} brightness={c.night ? 1 : 0.9} enableMouseInteraction={false} lightMode={!c.night} opacity={0.6} />}
        {kind === 'particles' && <Particles key={c.sand + c.night} particleCount={160} particleColors={[c.sand, c.amber, c.dusk]} speed={0.08} particleBaseSize={80} moveParticlesOnHover alphaParticles lightMode={!c.night} />}
        {kind === 'dots' && <DotGrid key={c.sand + c.night} dotSize={3} gap={26} baseColor={c.slate} activeColor={c.sand} proximity={140} />}
      </Suspense>
    </div>
  );
};

/** Photograph with responsive sources. `slug` names a file in /public/lucknow. */
export const Photo: React.FC<{ slug: string; alt: string; className?: string; eager?: boolean; sizes?: string }> = ({ slug, alt, className, eager, sizes = '(max-width: 768px) 92vw, 640px' }) => (
  <img
    src={photo(slug)}
    srcSet={`${photoSm(slug)} 640w, ${photo(slug)} 1400w`}
    sizes={sizes}
    alt={alt}
    className={className}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    draggable={false}
  />
);

export const CreditLine: React.FC<{ slug: string; className?: string }> = ({ slug, className }) => {
  const c = CREDITS[slug];
  if (!c) return null;
  return (
    <a href={c.page} target="_blank" rel="noreferrer noopener" className={`text-[10px] text-paper/45 underline-offset-2 hover:text-paper/80 hover:underline ${className ?? ''}`}>
      {ART.has(slug) || ART_FOOD.has(slug) ? 'AI illustration (Google Flow) after a photo by ' : 'Photo: '}{c.author.length > 34 ? c.author.slice(0, 32) + '…' : c.author}, {c.licence}
    </a>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-sand">
    <svg aria-hidden width="12" height="15" viewBox="0 0 12 15" className="flex-shrink-0"><path d="M1 15V7.5C1 5 2.4 4.2 3.6 4.1 4 2.2 5 1 6 0.6 7 1 8 2.2 8.4 4.1 9.6 4.2 11 5 11 7.5V15" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
    {children}
  </p>
);

/** A different living background for each page. */
const PAGE_BG: Record<string, BackdropKind> = {
  Heritage: 'rays', History: 'particles', Food: 'aurora', 'Travel guide': 'dots', Government: 'rays', 'The platform': 'dots', About: 'particles',
};

/** Which painting opens each page. */
const PAGE_ART: Record<string, string> = {
  Heritage: 'chota-imambara', History: 'residency', Food: 'biryani', 'Travel guide': 'charbagh',
  Geography: 'gomti-riverfront', Government: 'vidhan-sabha', 'The platform': 'hero-night', About: 'rumi-darwaza', Lucknowpedia: 'nawabs',
};

export const PageHero: React.FC<{ kicker: string; title: string; hi: string; intro: string; backdrop?: BackdropKind; art?: string; children?: React.ReactNode }> = ({ kicker, title, hi, intro, backdrop = 'none', art, children }) => {
  const slug = art ?? PAGE_ART[title];
  const bg = (backdrop !== 'none' ? backdrop : (PAGE_BG[title] ?? 'none')) as BackdropKind;
  const src = slug ? (slug.startsWith('hero-') ? `/lucknow/art/${slug}.webp` : photo(slug)) : null;
  const reduce = prefersReducedMotion();
  return (
    <header className="relative isolate overflow-hidden px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
      <div aria-hidden className="jali absolute inset-0 -z-20" />
      <Backdrop kind={bg} />
      <div className={`mx-auto grid max-w-[1280px] items-center gap-10 ${src ? 'lg:grid-cols-[1.05fr_0.95fr]' : ''}`}>
        <div>
          <Kicker>{kicker}</Kicker>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <h1 className="overflow-hidden pb-[0.06em] font-display text-[clamp(2.1rem,7.4vw,6.2rem)] leading-[1.02] text-paper [overflow-wrap:anywhere]">
              <motion.span className="block" initial={reduce ? false : { y: '105%' }} animate={{ y: '0%' }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>{title}</motion.span>
            </h1>
            <motion.span className="font-deva pb-2 text-[clamp(1.6rem,3.4vw,2.6rem)] text-sand/80" lang="hi" initial={reduce ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>{hi}</motion.span>
          </div>
          <motion.p className="mt-7 max-w-[40rem] text-[clamp(1rem,1.5vw,1.15rem)] leading-[1.75] text-paper/70" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.8 }}>{intro}</motion.p>
          {children}
        </div>
        {src && (
          <motion.div className="relative mx-auto w-full max-w-[460px]" initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
            {/* a gold outline offset behind the painting, like a mount */}
            <div aria-hidden className="arch-card absolute inset-0 translate-x-3 translate-y-3 bg-amber/35" />
            <div className="arch-card relative aspect-[4/5] overflow-hidden bg-slate">
              <img src={src} alt="" aria-hidden className="kenburns absolute inset-0 h-full w-full object-cover" />
            </div>
          </motion.div>
        )}
      </div>
    </header>
  );
};

export const Wrap: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({ children, className = '', id }) => (
  <section id={id} className={`mx-auto max-w-[1280px] px-5 sm:px-8 ${className}`}>{children}</section>
);

export const H2: React.FC<{ children: string; className?: string }> = ({ children, className = '' }) => (
  <h2 className={`font-display text-[clamp(2rem,4.2vw,3.3rem)] leading-[1.05] text-paper ${className}`}>{children}</h2>
);
