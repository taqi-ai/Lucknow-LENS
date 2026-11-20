import React from 'react';
import { Plane, TrainFront, Car, TramFront } from 'lucide-react';
import Stepper, { Step } from '../../reactbits/Stepper';
import SpotlightCard from '../../reactbits/SpotlightCard';
import { ITINERARY, REACH, SEASONS } from '../content';
import { H2, Kicker, PageHero, Wrap } from '../ui';
import { useLiveFeed, type LiveWeatherDTO } from '../../interactions/liveFeed';
import type { TabProps } from '../Landing';

const ICONS = [Plane, TrainFront, Car, TramFront];

export default function Travel({ onEnter }: TabProps) {
  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  return (
    <>
      <PageHero
        kicker="Plan a visit" title="Travel guide" hi="सफ़र"
        intro="Lucknow is easy to reach and best taken slowly. This page covers when to come, how to arrive, and a three-day route through the old city, the colonial centre and the river."
      >
        {weather.value && weather.status !== 'unavailable' && (
          <p className="mt-8 inline-flex items-center gap-3 rounded-full border border-sand/20 bg-terrain/60 px-5 py-2.5 font-mono text-[12.5px] text-sand/90">
            <span className="h-2 w-2 rounded-full bg-sage" />Right now in Lucknow: {Math.round(weather.value.temperatureC)}°C, {weather.value.description.toLowerCase()}
          </p>
        )}
      </PageHero>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>When to go</Kicker><H2>Three seasons</H2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {SEASONS.map((s) => (
            <SpotlightCard key={s.name} spotlightColor="rgba(154,100,40,0.12)" className="!rounded-[24px] !border-sand/12 !bg-terrain/60 p-8">
              <div className="flex gap-1" aria-label={`${s.score} out of 5`}>{Array.from({ length: 5 }).map((_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${i < s.score ? 'bg-sand' : 'bg-sand/15'}`} />)}</div>
              <h3 className="mt-5 font-display text-[1.5rem] font-light">{s.name}</h3>
              <p className="mt-3 text-[14.5px] leading-[1.7] text-paper/65">{s.note}</p>
            </SpotlightCard>
          ))}
        </div>
      </Wrap>

      <Wrap className="pb-24">
        <div className="mb-10 max-w-[640px]"><Kicker>Getting here</Kicker><H2>Arrive by air, rail or road</H2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {REACH.map((r, i) => { const I = ICONS[i]; return (
            <div key={r.mode} className="flex gap-5 rounded-[24px] border border-sand/12 bg-terrain/50 p-7">
              <I className="mt-1 h-7 w-7 shrink-0 text-sage" strokeWidth={1.4} />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-sand/70">{r.mode}</p>
                <h3 className="mt-1 text-[17px] font-semibold">{r.head}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.7] text-paper/60">{r.body}</p>
              </div>
            </div>
          ); })}
        </div>
      </Wrap>

      <Wrap className="pb-28">
        <div className="mb-10 max-w-[640px]"><Kicker>Three days</Kicker><H2>A route through the city</H2></div>
        <Stepper theme="light" accentColor="#9a6428" indicator="numbers" nextButtonText="Next day" backButtonText="Back" completeButtonText="Open the map" onFinalStepCompleted={() => onEnter()} className="stepper-themed mx-auto max-w-[760px]">
          {ITINERARY.map((d) => (
            <React.Fragment key={d.day}><Step>
              <p className="font-mono text-[11px] uppercase tracking-wider text-sage">{d.day}</p>
              <h3 className="mt-1 font-display text-[1.7rem] font-light">{d.title}</h3>
              <ol className="mt-5 space-y-3">
                {d.stops.map((s, i) => <li key={s} className="flex gap-4 text-[15px] text-paper/75"><span className="font-mono text-[12px] text-sand/60">{String(i + 1).padStart(2, '0')}</span>{s}</li>)}
              </ol>
            </Step></React.Fragment>
          ))}
        </Stepper>
      </Wrap>
    </>
  );
}
