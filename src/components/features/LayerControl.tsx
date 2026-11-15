import React from 'react';
import { Building2, Navigation, TreePine, Droplets, MapPin, Wind, CloudSun, Plane, Train, Video, Newspaper, ShieldAlert, TrafficCone } from 'lucide-react';

export interface LayerState {
  base: {
    buildings: boolean;
    roads: boolean;
    parks: boolean;
    gomti: boolean;
    places: boolean;
  };
  live: {
    traffic: boolean;
    aqi: boolean;
    weather: boolean;
    flights: boolean;
    railways: boolean;
    cameras: boolean;
    news: boolean;
    emergency: boolean;
  };
}

interface LayerControlProps {
  layers: LayerState;
  onToggleLayer: (category: 'base' | 'live', layer: string) => void;
}

export const Switch: React.FC<{ on: boolean; onChange: () => void; label: string }> = ({ on, onChange, label }) => (
  <button
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onChange}
    className={`relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors ${on ? 'bg-sand' : 'bg-white/15'}`}
  >
    <span className={`absolute top-[3px] h-4 w-4 rounded-full shadow transition-all ${on ? 'left-[19px] bg-terrain' : 'left-[3px] bg-paper/80'}`} />
  </button>
);

const BASE: { key: keyof LayerState['base']; name: string; Icon: React.ElementType }[] = [
  { key: 'buildings', name: 'Buildings', Icon: Building2 },
  { key: 'roads', name: 'Roads', Icon: Navigation },
  { key: 'parks', name: 'Parks and green', Icon: TreePine },
  { key: 'gomti', name: 'Gomti river', Icon: Droplets },
  { key: 'places', name: 'Place markers', Icon: MapPin },
];

const LIVE: { key: keyof LayerState['live']; name: string; note: string; Icon: React.ElementType }[] = [
  { key: 'emergency', name: 'Emergency services', note: 'Hospitals, fire, police', Icon: ShieldAlert },
  { key: 'weather', name: 'Weather', note: 'Open-Meteo', Icon: CloudSun },
  { key: 'aqi', name: 'Air quality', note: 'Open-Meteo', Icon: Wind },
  { key: 'flights', name: 'Aircraft', note: 'Live ADS-B', Icon: Plane },
  { key: 'railways', name: 'Trains', note: 'Needs a provider key', Icon: Train },
  { key: 'traffic', name: 'Traffic', note: 'Needs a provider key', Icon: TrafficCone },
  { key: 'news', name: 'News', note: 'Headlines about Lucknow', Icon: Newspaper },
  { key: 'cameras', name: 'Cameras', note: 'Public camera points', Icon: Video },
];

const Row: React.FC<{ Icon: React.ElementType; name: string; note?: string; on: boolean; onChange: () => void }> = ({ Icon, name, note, on, onChange }) => (
  <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
    <Icon className={`h-4 w-4 flex-shrink-0 ${on ? 'text-sand' : 'text-paper/40'}`} strokeWidth={1.7} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium text-paper/90">{name}</p>
      {note && <p className="truncate text-[11px] text-paper/45">{note}</p>}
    </div>
    <Switch on={on} onChange={onChange} label={name} />
  </div>
);

export const LayerControl: React.FC<LayerControlProps> = ({ layers, onToggleLayer }) => (
  <div className="space-y-5">
    <section>
      <h4 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sand/70">Map</h4>
      {BASE.map(({ key, name, Icon }) => <Row key={key} Icon={Icon} name={name} on={layers.base[key]} onChange={() => onToggleLayer('base', key)} />)}
    </section>
    <section>
      <h4 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sand/70">Live data</h4>
      {LIVE.map(({ key, name, note, Icon }) => <Row key={key} Icon={Icon} name={name} note={note} on={layers.live[key]} onChange={() => onToggleLayer('live', key)} />)}
    </section>
  </div>
);
