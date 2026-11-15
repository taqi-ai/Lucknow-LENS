import React from 'react';
import TiltedCard from '../../reactbits/TiltedCard';
import ScrollVelocity from '../../reactbits/ScrollVelocity';
import ShinyText from '../../reactbits/ShinyText';
import { DISHES, FOOD_NOTES, photo } from '../content';
import { CreditLine, H2, Kicker, PageHero, Wrap } from '../ui';
import type { TabProps } from '../Landing';

export default function Food(_: TabProps) {
  return (
    <>
      <PageHero
        kicker="The table of Awadh" title="Food" hi="ज़ायका" backdrop="aurora"
        intro="The Nawabs competed in their kitchens as much as in their palaces. The result is a cuisine of slow fires, saffron and kebabs soft enough to dissolve. Tilt a card to read about the dish."
      />

      <section aria-hidden className="overflow-hidden border-y border-sand/10 py-5">
        <ScrollVelocity texts={['कबाब · बिरयानी · शीरमाल · कुल्फी ·', 'Kebab · Biryani · Sheermal · Kulfi ·']} velocity={50} className="font-display font-light italic text-sand/55" />
      </section>

      <Wrap className="py-24">
        <div className="mb-12 max-w-[640px]"><Kicker>What to eat</Kicker><H2>Nine things, in no particular order</H2></div>
        <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {DISHES.map((d) => (
            <li key={d.slug}>
              <TiltedCard
                imageSrc={photo(d.slug)} altText={d.name} captionText={d.name}
                containerHeight="340px" imageHeight="340px" imageWidth="100%" rotateAmplitude={11} scaleOnHover={1.04} showTooltip={false} radius={26}
                displayOverlayContent
                overlayContent={<span className="m-4 inline-block rounded-full bg-cabin/75 px-3 py-1 font-mono text-[11px] text-sand backdrop-blur">{d.kind}</span>}
              />
              <div className="mt-5 px-1">
                <p className="font-deva text-[1.3rem] text-sand/90" lang="hi">{d.hi}</p>
                <h3 className="font-display text-[1.6rem] font-light"><ShinyText text={d.name} speed={5} color="#eae9df" shineColor="#f0c9a0" /></h3>
                <p className="mt-2 text-[14.5px] leading-[1.7] text-paper/65">{d.note}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
                  {d.where ? <span className="text-sage">{d.where}</span> : <span />}
                  <CreditLine slug={d.slug} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Wrap>

      <Wrap className="pb-24">
        <div className="rounded-[28px] border border-sand/12 bg-terrain/50 p-8 sm:p-10">
          <h3 className="font-display text-[1.6rem] font-light">Before you go</h3>
          <ul className="mt-5 space-y-3 text-[15px] leading-[1.7] text-paper/65">
            {FOOD_NOTES.map((n) => <li key={n} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{n}</li>)}
          </ul>
        </div>
      </Wrap>
    </>
  );
}
