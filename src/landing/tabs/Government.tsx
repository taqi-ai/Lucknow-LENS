import React, { useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import SpotlightCard from '../../reactbits/SpotlightCard';
import GlareHover from '../../reactbits/GlareHover';
import { GOV_BODIES, HELPLINES, type Helpline } from '../content';
import { H2, Kicker, PageHero, Wrap } from '../ui';
import type { TabProps } from '../Landing';

const FILTERS: { id: 'all' | Helpline['kind']; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'emergency', label: 'Emergency' }, { id: 'health', label: 'Health' },
  { id: 'safety', label: 'Safety' }, { id: 'civic', label: 'Civic' }, { id: 'travel', label: 'Travel' },
];

export default function Government({ onEnter }: TabProps) {
  const [f, setF] = useState<(typeof FILTERS)[number]['id']>('all');
  const list = useMemo(() => HELPLINES.filter((h) => f === 'all' || h.kind === f), [f]);
  return (
    <>
      <PageHero
        kicker="Services and helplines" title="Government" hi="शासन"
        intro="Who runs what in Lucknow, and the numbers to call. Terralyt is an independent project: this page points to the departments that issue each service, and does not speak for them."
      >
        <a href="tel:112" className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#b3402f] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_18px_50px_-14px_rgba(179,64,47,.7)] transition-transform active:scale-95">
          <Phone className="h-4 w-4" /> In an emergency, call 112
        </a>
      </PageHero>

      <Wrap className="pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[560px]"><Kicker>Helplines</Kicker><H2>Numbers worth saving</H2></div>
          <div role="tablist" aria-label="Filter helplines" className="flex flex-wrap gap-2">
            {FILTERS.map((x) => (
              <button key={x.id} role="tab" aria-selected={f === x.id} onClick={() => setF(x.id)} className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${f === x.id ? 'border-sand bg-sand text-terrain' : 'border-sand/25 text-paper/70 hover:border-sand/60'}`}>{x.label}</button>
            ))}
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((h) => (
            <li key={h.number + h.name}>
              <a href={`tel:${h.number}`} className="block h-full rounded-[22px] focus-visible:outline-offset-4">
                <SpotlightCard spotlightColor="rgba(154,100,40,0.12)" className="!h-full !rounded-[22px] !border-sand/12 !bg-terrain/60 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-display text-[2.4rem] font-light leading-none tabular text-sand">{h.number}</p>
                    <span className="rounded-full border border-sand/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-paper/55">{h.kind}</span>
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold">{h.name}</h3>
                  <p className="mt-1 text-[13px] text-paper/55">{h.issuer}</p>
                  {h.note && <p className="mt-2 text-[13px] leading-[1.6] text-paper/65">{h.note}</p>}
                </SpotlightCard>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[48rem] text-[12px] leading-[1.7] text-paper/45">Numbers are national or state-level services as published by the issuing departments at the time of writing. Services and numbers can change, so confirm with the issuing department before you rely on one.</p>
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Who does what</Kicker><H2>The bodies that run the city</H2></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {GOV_BODIES.map((b) => (
            <div key={b.name} className="contents"><GlareHover width="100%" height="100%" background="var(--color-terrain)" borderColor="color-mix(in srgb, var(--color-paper) 12%, transparent)" borderRadius="22px" glareColor="#ffffff" glareOpacity={0.22} style={{ display: 'block', height: '100%' }}>
              <div className="p-7 text-left">
                <p className="font-deva text-[1.1rem] text-sand/80" lang="hi">{b.hi}</p>
                <h3 className="mt-1 font-display text-[1.35rem] font-light">{b.name}</h3>
                <p className="mt-3 text-[14px] leading-[1.7] text-paper/60">{b.body}</p>
              </div>
            </GlareHover></div>
          ))}
        </div>
      </Wrap>

      <Wrap className="pb-28">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-sand/15 bg-terrain/60 p-8 sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-[40rem]">
            <h3 className="font-display text-[1.7rem] font-light">See emergency coverage on the map</h3>
            <p className="mt-3 text-[15px] leading-[1.7] text-paper/65">Hospitals, fire stations and police stations are on the live map with coverage radii, so gaps in cover are easy to spot.</p>
          </div>
          <button data-enter onClick={() => onEnter()} className="shrink-0 rounded-full bg-sand px-7 py-3.5 text-[14px] font-semibold text-terrain transition-transform active:scale-95">Open the map</button>
        </div>
      </Wrap>
    </>
  );
}
