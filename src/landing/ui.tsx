import React, { lazy, Suspense, useEffect, useState } from 'react';
import BlurText from '../reactbits/BlurText';
import { getDeviceProfile } from '../city/deviceProfile';
import { CREDITS, photo, photoSm } from './content';
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

const LightRays = lazy(() => import('../reactbits/LightRays'));
const SoftAurora = lazy(() => import('../reactbits/SoftAurora'));
const Topography = lazy(() => import('../reactbits/Topography'));
const Particles = lazy(() => import('../reactbits/Particles'));
const DotGrid = lazy(() => import('../reactbits/DotGrid'));

export type BackdropKind = 'rays' | 'aurora' | 'topo' | 'particles' | 'dots' | 'none';

/** One WebGL backdrop per page, never on phones or with reduced motion. */
export const Backdrop: React.FC<{ kind: BackdropKind }> = ({ kind }) => {
  const rich = useRichMotion();
  if (!rich || kind === 'none') return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
      <Suspense fallback={null}>
        {kind === 'rays' && <LightRays raysOrigin="top-center" raysColor="#f0c9a0" raysSpeed={0.6} lightSpread={0.9} rayLength={1.6} followMouse mouseInfluence={0.08} />}
        {kind === 'aurora' && <SoftAurora color1="#789a85" color2="#c68b54" speed={0.5} brightness={1.1} enableMouseInteraction={false} />}
        {kind === 'topo' && <Topography color="#d5c7a5" lineCount={46} majorLines elevation={1.1} fog={0.5} glow={0.5} opacity={0.85} mouseInteraction hoverEffect="lift" />}
        {kind === 'particles' && <Particles particleCount={140} particleColors={['#d5c7a5', '#c68b54', '#789a85']} speed={0.08} particleBaseSize={90} moveParticlesOnHover alphaParticles />}
        {kind === 'dots' && <DotGrid dotSize={3} gap={26} baseColor="#263c42" activeColor="#d5c7a5" proximity={140} />}
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
      Photo: {c.author.length > 34 ? c.author.slice(0, 32) + '…' : c.author}, {c.licence}
    </a>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-5 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.18em] text-sand/75">
    <span className="h-px w-8 bg-sand/50" />{children}
  </p>
);

export const PageHero: React.FC<{ kicker: string; title: string; hi: string; intro: string; backdrop?: BackdropKind; children?: React.ReactNode }> = ({ kicker, title, hi, intro, backdrop = 'none', children }) => (
  <header className="relative isolate overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
    <div aria-hidden className="absolute inset-0 -z-20" style={{ background: 'radial-gradient(60% 70% at 85% 0%, rgba(198,139,84,.18), transparent 70%), radial-gradient(50% 60% at 0% 100%, rgba(120,154,133,.12), transparent 70%)' }} />
    <Backdrop kind={backdrop} />
    <div className="mx-auto max-w-[1280px]">
      <Kicker>{kicker}</Kicker>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <BlurText text={title} className="font-display text-[clamp(2.6rem,7vw,5.8rem)] font-light leading-[1.02] tracking-[-0.025em] text-paper" animateBy="words" trigger="load" />
        <span className="font-deva pb-2 text-[clamp(1.6rem,3.4vw,2.6rem)] text-sand/70" lang="hi">{hi}</span>
      </div>
      <p className="mt-7 max-w-[44rem] text-[clamp(1rem,1.5vw,1.15rem)] leading-[1.75] text-paper/70">{intro}</p>
      {children}
    </div>
  </header>
);

export const Wrap: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({ children, className = '', id }) => (
  <section id={id} className={`mx-auto max-w-[1280px] px-5 sm:px-8 ${className}`}>{children}</section>
);

export const H2: React.FC<{ children: string; className?: string }> = ({ children, className = '' }) => (
  <BlurText text={children} className={`font-display text-[clamp(1.9rem,4vw,3.2rem)] font-light leading-[1.1] tracking-[-0.02em] text-paper ${className}`} animateBy="words" />
);
