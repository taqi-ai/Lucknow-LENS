import React from 'react';
import CountUp from '../../reactbits/CountUp';
import { GEO_FACTS, GEO_TEXT } from '../content';
import { H2, Kicker, PageHero, Wrap } from '../ui';
import { ReliefMap } from '../ReliefMap';
import { ClimateChart } from '../ClimateChart';
import { useLiveFeed, type LiveAirQualityDTO, type LiveWeatherDTO } from '../../interactions/liveFeed';
import type { TabProps } from '../Landing';

export default function Geography({ onEnter }: TabProps) {
  const weather = useLiveFeed<LiveWeatherDTO>('/api/live/weather', true, 600_000);
  const air = useLiveFeed<LiveAirQualityDTO>('/api/live/air', true, 600_000);
  return (
    <>
      <PageHero
        kicker="River, plain and relief" title="Geography" hi="भूगोल" backdrop="topo"
        intro="Lucknow is built on a plain so flat that thirty metres of height is the whole story. Terralyt is named for the land it maps, so here is the land: real elevation, real river, and the weather above it right now."
      >
        <p className="mt-8 font-mono text-[13px] text-sand/80">26.85° N · 80.95° E · 123 m</p>
      </PageHero>

      <Wrap className="pb-24">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <ReliefMap />
          <div className="space-y-5 lg:sticky lg:top-24">
            <Kicker>The shape of the land</Kicker>
            {GEO_TEXT.map((p) => <p key={p.slice(0, 20)} className="text-[15.5px] leading-[1.8] text-paper/70">{p}</p>)}
            <button data-enter onClick={() => onEnter('gomti')} className="mt-2 inline-flex items-center rounded-full bg-sand px-6 py-3 text-[14px] font-semibold text-terrain transition-transform active:scale-95">Fly along the Gomti</button>
          </div>
        </div>
      </Wrap>

      <Wrap className="pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <Kicker>A year in Lucknow</Kicker>
            <H2>Hot dry summers, a heavy monsoon, foggy winters</H2>
            <p className="mt-5 max-w-[30rem] text-[15.5px] leading-[1.75] text-paper/70">Almost all the rain falls between June and September, when the Gomti runs high. May is the hottest month. January nights get cold enough for the famous winter fog. Hover a month to read it.</p>
          </div>
          <ClimateChart />
        </div>
      </Wrap>

      <Wrap className="pb-24">
        <div className="grid gap-px overflow-hidden rounded-[28px] border border-sand/12 bg-sand/10 sm:grid-cols-2 lg:grid-cols-4">
          {GEO_FACTS.map((f) => (
            <div key={f.label} className="bg-terrain p-8">
              <p className="font-display text-[clamp(2rem,3.4vw,3rem)] font-light leading-none text-sand"><CountUp to={f.value} decimals={f.decimals} suffix={f.suffix} duration={2} /></p>
              <p className="mt-4 text-[14px] font-semibold">{f.label}</p>
              <p className="mt-2 text-[13px] leading-[1.6] text-paper/55">{f.note}</p>
            </div>
          ))}
        </div>
      </Wrap>

      <Wrap className="pb-28">
        <div className="mb-8 max-w-[640px]"><Kicker>Overhead, live</Kicker><H2>The sky above the plain</H2></div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { k: 'Temperature', v: weather.value && weather.status !== 'unavailable' ? `${Math.round(weather.value.temperatureC)}°C` : null, s: weather.value?.description },
            { k: 'Humidity', v: weather.value && weather.status !== 'unavailable' ? `${Math.round(weather.value.humidityPct)}%` : null, s: 'Relative humidity' },
            { k: 'Air quality (US AQI)', v: air.value && air.status !== 'unavailable' ? `${Math.round(air.value.usAqi)}` : null, s: air.value?.category },
          ].map((c) => (
            <div key={c.k} className="rounded-[24px] border border-sand/12 bg-terrain/50 p-7">
              <p className="font-mono text-[11px] uppercase tracking-wider text-sage">{c.k}</p>
              <p className="mt-3 font-display text-[2.6rem] font-light leading-none">{c.v ?? <span className="text-[1.1rem] text-paper/45">Feed unavailable</span>}</p>
              <p className="mt-3 text-[13px] text-paper/55">{c.v ? c.s : 'We show nothing rather than a made-up number.'}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-paper/40">Weather and air quality from Open-Meteo.</p>
      </Wrap>
    </>
  );
}
