import React from 'react';
import ScrollStack, { ScrollStackItem } from '../../reactbits/ScrollStack';
import { ERAS } from '../content';
import { PageHero, Photo, Wrap } from '../ui';
import type { TabProps } from '../Landing';

export default function History(_: TabProps) {
  return (
    <>
      <PageHero
        kicker="From Kosala to the metro" title="History" hi="इतिहास"
        intro="Lucknow has been a provincial town, the capital of a court, the scene of a siege and the seat of a modern state. Scroll to stack the centuries."
      />
      <Wrap className="pb-8">
        <ScrollStack useWindowScroll itemDistance={70} itemStackDistance={26} stackPosition="18%" baseScale={0.92} itemScale={0.035} blurAmount={1.2}>
          {ERAS.map((e, i) => (
            <React.Fragment key={e.year + e.title}><ScrollStackItem itemClassName="!h-auto !p-0 overflow-hidden" style={{ background: 'var(--color-terrain)', color: 'var(--color-paper)', border: '1px solid color-mix(in srgb, var(--color-paper) 12%, transparent)' }}>
              <div className="grid min-h-[300px] md:grid-cols-[1.1fr_0.9fr]">
                <div className="flex flex-col justify-between p-8 sm:p-10">
                  <div>
                    <p className="font-mono text-[12px] text-sage">0{i + 1} / 0{ERAS.length}</p>
                    <p className="mt-4 font-display text-[clamp(2.4rem,5vw,4rem)] font-light leading-none text-sand">
                      {e.year}
                    </p>
                  </div>
                  <div className="mt-8">
                    <h3 className="font-display text-[1.7rem] font-light">{e.title}</h3>
                    <p className="mt-3 max-w-[30rem] text-[15px] leading-[1.75] text-paper/65">{e.body}</p>
                  </div>
                </div>
                <div className="relative hidden min-h-[240px] md:block">
                  {e.slug
                    ? <Photo slug={e.slug} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 70% at 70% 30%, rgba(198,139,84,.35), transparent 70%), #0f1c24' }} />}
                  <div className="absolute inset-0 bg-gradient-to-r from-terrain to-transparent" />
                </div>
              </div>
            </ScrollStackItem></React.Fragment>
          ))}
        </ScrollStack>
      </Wrap>
      <Wrap className="pb-24">
        <p className="max-w-[44rem] text-[13px] leading-[1.7] text-paper/45">Dates and events are summarised from widely documented histories, including the Archaeological Survey of India's monument records and standard encyclopedias. This page is an overview, not a scholarly source.</p>
      </Wrap>
    </>
  );
}
