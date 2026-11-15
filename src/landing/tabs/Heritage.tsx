import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import FlowingMenu from '../../reactbits/FlowingMenu';
import CircularGallery from '../../reactbits/CircularGallery';
import SpotlightCard from '../../reactbits/SpotlightCard';
import { ARCH_STYLES, MONUMENTS, photo } from '../content';
import { CreditLine, H2, Kicker, PageHero, Photo, Wrap } from '../ui';
import type { TabProps } from '../Landing';

export default function Heritage({ onEnter }: TabProps) {
  const [sel, setSel] = useState(0);
  const m = MONUMENTS[sel];
  const detailRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <PageHero
        kicker="Monuments and architecture" title="Heritage" hi="विरासत" backdrop="rays"
        intro="Two and a half centuries of Awadhi court culture left Lucknow with gateways, imambaras and palaces that still stand in the middle of a modern city. Choose one below, then fly to it on the live map."
      />

      <Wrap className="pb-24">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div role="list" aria-label="Monuments" style={{ height: MONUMENTS.length * 64 }} className="overflow-hidden rounded-[28px] border border-sand/12 bg-terrain/40">
            <FlowingMenu
              items={MONUMENTS.map((x) => ({ text: x.en, link: '#', image: photo(x.slug).replace('.webp', '-sm.webp'), marquee: `${x.en} · ${x.year} · ${x.style}`, meta: x.year }))}
              onItemClick={(_, i, e) => {
                e.preventDefault(); setSel(i);
                // on phones the detail card sits below the list, so bring it into view
                if (window.innerWidth < 1024) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
              }}
              activeIndex={sel}
              textColor="#eae9df" bgColor="#0f1c24" marqueeBgColor="#d5c7a5" marqueeTextColor="#14232d" borderColor="rgba(213,199,165,.14)"
            />
          </div>

          <div ref={detailRef} className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
            <AnimatePresence mode="wait">
              <motion.article key={m.slug} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden rounded-[28px] border border-sand/12 bg-terrain/60">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Photo slug={m.slug} alt={m.en} className="h-full w-full object-cover" eager sizes="(max-width: 1024px) 92vw, 560px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-terrain via-transparent to-transparent" />
                  <span className="absolute left-5 top-5 rounded-full bg-cabin/75 px-3 py-1 font-mono text-[11px] text-sand backdrop-blur">{m.year}</span>
                </div>
                <div className="p-7">
                  <p className="font-deva text-[2rem] leading-tight text-sand" lang="hi">{m.hi}</p>
                  {m.ur && <p className="font-urdu text-[1.5rem] leading-[2] text-sand/55" dir="rtl" lang="ur">{m.ur}</p>}
                  <h3 className="mt-2 font-display text-[1.9rem] font-light">{m.en}</h3>
                  <p className="mt-1 text-[12px] font-medium text-sage">{m.style}</p>
                  <p className="mt-4 text-[15px] leading-[1.75] text-paper/70">{m.body}</p>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    {m.preset ? (
                      <button onClick={() => onEnter(m.preset)} className="inline-flex items-center gap-2 rounded-full bg-sand px-5 py-2.5 text-[13px] font-semibold text-terrain transition-transform active:scale-95">Fly there on the map <ArrowRight className="h-4 w-4" /></button>
                    ) : <span className="text-[12px] text-paper/40">Not yet a map fly-to</span>}
                    <CreditLine slug={m.slug} />
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </Wrap>

      {/* gallery */}
      <section className="border-y border-sand/10 bg-[#0a1318] py-20">
        <Wrap className="mb-6">
          <Kicker>Gallery</Kicker>
          <H2>Drag to look around</H2>
        </Wrap>
        <div className="h-[min(70vh,560px)] w-full" aria-label="Photo gallery of Lucknow monuments">
          <CircularGallery
            items={MONUMENTS.slice(0, 12).map((x) => ({ image: photo(x.slug), text: x.en, alt: x.en }))}
            bend={2.4} textColor="#eae9df" borderRadius={0.06} scrollSpeed={2.2} autoScroll={0.35}
          />
        </div>
      </section>

      {/* styles */}
      <Wrap className="py-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Reading the buildings</Kicker><H2>Four styles you will see</H2></div>
        <div className="grid gap-4 md:grid-cols-2">
          {ARCH_STYLES.map((s, i) => (
            <SpotlightCard key={s.name} spotlightColor="rgba(213,199,165,0.16)" className="!rounded-[24px] !border-sand/12 !bg-terrain/60 p-8">
              <p className="font-mono text-[11px] text-sage">0{i + 1}</p>
              <h3 className="mt-3 font-display text-[1.7rem] font-light">{s.name}</h3>
              <p className="mt-3 text-[15px] leading-[1.75] text-paper/65">{s.note}</p>
            </SpotlightCard>
          ))}
        </div>
      </Wrap>
    </>
  );
}
