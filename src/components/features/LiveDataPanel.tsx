import React, { useState } from 'react';
import {
  LiveFeedState, LiveListState,
  LiveWeatherDTO, LiveAirQualityDTO, LiveTrainDTO, LiveTrafficDTO, LiveNewsDTO,
} from '../../interactions/liveFeed';
import { SimulatedFlight } from '../../types';
import {
  CloudSun, Wind, Plane, TrainFront, TrafficCone, Newspaper, Camera,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';

/**
 * LiveDataPanel — the detailed popup for the "Live Services" layers.
 *
 * The top status pills (in CityUI) answer "is this feed alive right now?" in one
 * line. This panel answers "what is it actually seeing?" — every real item a
 * provider returned, or an honest explanation when there is nothing to show.
 * Nothing here is invented: a provider with no key or no results renders its
 * `reason` text, never a placeholder number.
 */

interface StatusDotProps { status: 'ok' | 'stale' | 'unavailable' }
const StatusDot: React.FC<StatusDotProps> = ({ status }) => (
  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
    status === 'ok' ? 'bg-emerald-400' : status === 'stale' ? 'bg-amber-400' : 'bg-rose-500'
  }`} />
);

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  status: 'ok' | 'stale' | 'unavailable';
  summary: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, title, status, summary, defaultOpen, children }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-slate-800/60 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 py-2.5 px-0.5 text-left hover:bg-slate-800/30 rounded-lg transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusDot status={status} />
            <span className="text-xs font-bold text-slate-100">{title}</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">{summary}</div>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>
      {open && <div className="pb-3 pl-9 pr-1 space-y-1.5">{children}</div>}
    </div>
  );
};

const Unavailable: React.FC<{ reason?: string }> = ({ reason }) => (
  <div className="text-[10px] text-slate-500 italic bg-slate-900/50 border border-slate-800/60 rounded-lg px-2.5 py-2">
    {reason ?? 'No data available.'}
  </div>
);

function aqiColor(v: number): string {
  return v <= 50 ? 'text-emerald-400' : v <= 100 ? 'text-yellow-400' : v <= 150 ? 'text-orange-400' : v <= 200 ? 'text-rose-400' : 'text-fuchsia-400';
}

interface LiveDataPanelProps {
  layers: { aqi: boolean; weather: boolean; flights: boolean; railways: boolean; traffic: boolean; news: boolean; cameras: boolean };
  weatherFeed?: LiveFeedState<LiveWeatherDTO>;
  airFeed?: LiveFeedState<LiveAirQualityDTO>;
  flightFeed?: { status: 'ok' | 'stale' | 'unavailable'; provider: string; ageSeconds: number | null; reason?: string };
  flights: SimulatedFlight[];
  trainFeed?: LiveListState<LiveTrainDTO>;
  trafficFeed?: LiveListState<LiveTrafficDTO>;
  newsFeed?: LiveListState<LiveNewsDTO>;
}

export const LiveDataPanel: React.FC<LiveDataPanelProps> = ({
  layers, weatherFeed, airFeed, flightFeed, flights, trainFeed, trafficFeed, newsFeed,
}) => {
  const anyOn = layers.aqi || layers.weather || layers.flights || layers.railways || layers.traffic || layers.news || layers.cameras;
  if (!anyOn) return null;

  return (
    <div className="glass-panel rounded-2xl px-3 w-full max-h-[46vh] overflow-y-auto">
      <div className="pt-1 pb-0.5 px-0.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-500 sticky top-0 bg-slate-900/95 backdrop-blur">
        Live Intelligence
      </div>

      {layers.weather && weatherFeed && (
        <Section
          icon={<CloudSun className="w-3.5 h-3.5 text-sky-400" />}
          title="Weather"
          status={weatherFeed.status}
          summary={weatherFeed.value ? `${weatherFeed.value.temperatureC.toFixed(1)}°C · ${weatherFeed.value.description}` : (weatherFeed.reason ?? 'Unavailable')}
        >
          {weatherFeed.value ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
              <div>Feels like <strong className="text-slate-100">{weatherFeed.value.apparentTemperatureC?.toFixed(1) ?? '?'}°C</strong></div>
              <div>Humidity <strong className="text-slate-100">{weatherFeed.value.humidityPct ?? '?'}%</strong></div>
              <div>Wind <strong className="text-slate-100">{weatherFeed.value.windSpeedKph?.toFixed(0) ?? '?'} km/h</strong></div>
              <div>Pressure <strong className="text-slate-100">{weatherFeed.value.pressureHpa?.toFixed(0) ?? '?'} hPa</strong></div>
              <div>Precip <strong className="text-slate-100">{weatherFeed.value.precipitationMm ?? 0} mm</strong></div>
              <div>{weatherFeed.value.isDay ? 'Daytime' : 'Nighttime'}</div>
            </div>
          ) : <Unavailable reason={weatherFeed.reason} />}
          {weatherFeed.attribution && <div className="text-[9px] text-slate-600 pt-1">{weatherFeed.attribution}</div>}
        </Section>
      )}

      {layers.aqi && airFeed && (
        <Section
          icon={<Wind className="w-3.5 h-3.5 text-emerald-400" />}
          title="Air Quality"
          status={airFeed.status}
          summary={airFeed.value ? `AQI ${airFeed.value.usAqi} · ${airFeed.value.category}` : (airFeed.reason ?? 'Unavailable')}
        >
          {airFeed.value ? (
            <div className="space-y-1">
              <div className={`text-sm font-extrabold ${aqiColor(airFeed.value.usAqi)}`}>
                {airFeed.value.usAqi} <span className="text-[11px] font-normal">{airFeed.value.category}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
                <div>Dominant <strong className="text-slate-100">{airFeed.value.dominantPollutant}</strong></div>
                <div>PM2.5 <strong className="text-slate-100">{airFeed.value.pm25?.toFixed(0) ?? '?'} µg/m³</strong></div>
                <div>PM10 <strong className="text-slate-100">{airFeed.value.pm10?.toFixed(0) ?? '?'} µg/m³</strong></div>
                <div>NO₂ <strong className="text-slate-100">{airFeed.value.nitrogenDioxide?.toFixed(0) ?? '?'} µg/m³</strong></div>
                <div>O₃ <strong className="text-slate-100">{airFeed.value.ozone?.toFixed(0) ?? '?'} µg/m³</strong></div>
                <div>CO <strong className="text-slate-100">{airFeed.value.carbonMonoxide?.toFixed(0) ?? '?'} µg/m³</strong></div>
              </div>
            </div>
          ) : <Unavailable reason={airFeed.reason} />}
          {airFeed.attribution && <div className="text-[9px] text-slate-600 pt-1">{airFeed.attribution}</div>}
        </Section>
      )}

      {layers.flights && flightFeed && (
        <Section
          icon={<Plane className="w-3.5 h-3.5 text-cyan-400" />}
          title="Flights"
          status={flightFeed.status}
          summary={flightFeed.status === 'unavailable' ? (flightFeed.reason ?? 'Unavailable') : `${flights.length} aircraft tracked`}
        >
          {flightFeed.status !== 'unavailable' && flights.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {flights.slice(0, 15).map(f => (
                <div key={f.id} className="flex items-center justify-between text-[11px] text-slate-300 py-0.5 border-b border-slate-800/40 last:border-b-0">
                  <span className="font-mono text-slate-100">{f.airline}</span>
                  <span className="text-slate-500">{Math.round(f.altitude)}m · {Math.round(f.speed * 3.6)} km/h</span>
                </div>
              ))}
            </div>
          ) : <Unavailable reason={flightFeed.status === 'unavailable' ? flightFeed.reason : 'No aircraft currently in range.'} />}
        </Section>
      )}

      {layers.railways && trainFeed && (
        <Section
          icon={<TrainFront className="w-3.5 h-3.5 text-orange-400" />}
          title="Trains"
          status={trainFeed.status}
          summary={trainFeed.status === 'unavailable' ? (trainFeed.reason ?? 'Unavailable') : `${trainFeed.items.length} trains tracked`}
        >
          {trainFeed.status !== 'unavailable' && trainFeed.items.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {trainFeed.items.slice(0, 15).map(t => (
                <div key={t.id} className="text-[11px] text-slate-300 py-0.5 border-b border-slate-800/40 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-100">{t.number ?? t.id}</span>
                    {t.delayMinutes != null && (
                      <span className={t.delayMinutes > 5 ? 'text-rose-400' : 'text-emerald-400'}>
                        {t.delayMinutes > 0 ? `+${t.delayMinutes}m` : 'on time'}
                      </span>
                    )}
                  </div>
                  {t.name && <div className="text-slate-500 truncate">{t.name}{t.nextStation ? ` → ${t.nextStation}` : ''}</div>}
                </div>
              ))}
            </div>
          ) : <Unavailable reason={trainFeed.status === 'unavailable' ? trainFeed.reason : 'No trains currently reported.'} />}
        </Section>
      )}

      {layers.traffic && trafficFeed && (
        <Section
          icon={<TrafficCone className="w-3.5 h-3.5 text-amber-400" />}
          title="Traffic"
          status={trafficFeed.status}
          summary={trafficFeed.status === 'unavailable' ? (trafficFeed.reason ?? 'Unavailable') : `${trafficFeed.items.length} incidents`}
        >
          {trafficFeed.status !== 'unavailable' && trafficFeed.items.length > 0 ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {trafficFeed.items.slice(0, 15).map(t => (
                <div key={t.id} className="text-[11px] text-slate-300 py-0.5 border-b border-slate-800/40 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-amber-300 font-semibold truncate">{t.category ?? 'Incident'}</span>
                    {t.delaySeconds != null && <span className="text-slate-500 flex-shrink-0">{Math.round(t.delaySeconds / 60)}m delay</span>}
                  </div>
                  {(t.description || t.roadName) && <div className="text-slate-500 truncate">{t.description ?? t.roadName}</div>}
                </div>
              ))}
            </div>
          ) : <Unavailable reason={trafficFeed.status === 'unavailable' ? trafficFeed.reason : 'No incidents currently reported.'} />}
        </Section>
      )}

      {layers.news && newsFeed && (
        <Section
          icon={<Newspaper className="w-3.5 h-3.5 text-violet-400" />}
          title="News"
          status={newsFeed.status}
          summary={newsFeed.status === 'unavailable' ? (newsFeed.reason ?? 'Unavailable') : `${newsFeed.items.length} recent articles`}
        >
          {newsFeed.status !== 'unavailable' && newsFeed.items.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {newsFeed.items.slice(0, 12).map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                   className="flex items-start gap-1.5 text-[11px] text-slate-300 hover:text-white py-0.5 border-b border-slate-800/40 last:border-b-0 group">
                  <ExternalLink className="w-3 h-3 mt-0.5 text-slate-600 group-hover:text-violet-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate">{a.title}</div>
                    {a.source && <div className="text-slate-600 text-[10px]">{a.source}</div>}
                  </div>
                </a>
              ))}
            </div>
          ) : <Unavailable reason={newsFeed.status === 'unavailable' ? newsFeed.reason : 'No recent articles found.'} />}
        </Section>
      )}

      {layers.cameras && (
        <Section
          icon={<Camera className="w-3.5 h-3.5 text-slate-400" />}
          title="Traffic Cameras"
          status="unavailable"
          summary="No public feed available"
          defaultOpen
        >
          <Unavailable reason="No licensed public traffic-camera feed exists for Lucknow. This layer intentionally shows nothing rather than a fake stream." />
        </Section>
      )}
    </div>
  );
};
