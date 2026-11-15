import React, { lazy, Suspense, useEffect, useState } from 'react';
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

export type BackdropKind = 'rays' | 'aurora' | 'topo' | 'particles' | 'dots' | 'none';

/** One WebGL backdrop per page, never on phones or with reduced motion. */
export const Backdrop: React.FC<{ kind: BackdropKind }> = ({ kind }) => {
  const rich = useRichMotion();
  // Only the Geography page keeps a live backdrop: the contour field is the subject there. Elsewhere it was decoration.
  if (!rich || kind !== 'topo') return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
      <Suspense fallback={null}>
        {kind === 'topo' && <Topography color="#9a6428" lineCount={46} majorLines elevation={1.1} fog={0.4} glow={0.2} opacity={0.6} lightMode mouseInteraction hoverEffect="lift" />}
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

export const PageHero: React.FC<{ kicker: string; title: string; hi: string; intro: string; backdrop?: BackdropKind; children?: React.ReactNode }> = ({ kicker, title, hi, intro, backdrop = 'none', children }) => (
  <header className="relative isolate overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24">
    <div aria-hidden className="jali absolute inset-0 -z-20" />
    <Backdrop kind={backdrop} />
    <div className="mx-auto max-w-[1280px]">
      <Kicker>{kicker}</Kicker>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <h1 className="font-display text-[clamp(2.8rem,7.4vw,6.2rem)] leading-[0.98] text-paper">{title}</h1>
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
  <h2 className={`font-display text-[clamp(2rem,4.2vw,3.3rem)] leading-[1.05] text-paper ${className}`}>{children}</h2>
);
