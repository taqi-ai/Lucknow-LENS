import React from 'react';
import { Building2, Navigation, TreePine, Droplets, MapPin, Tag, Wind, CloudSun, Plane, Train, Video, Newspaper, Eye, EyeOff } from 'lucide-react';

export interface LayerState {
  base: {
    buildings: boolean;
    roads: boolean;
    parks: boolean;
    gomti: boolean;
    places: boolean;
    labels: boolean;
  };
  live: {
    traffic: boolean;
    aqi: boolean;
    weather: boolean;
    flights: boolean;
    railways: boolean;
    cameras: boolean;
    news: boolean;
  };
}

interface LayerControlProps {
  layers: LayerState;
  onToggleLayer: (category: 'base' | 'live', layer: string) => void;
}

export const LayerControl: React.FC<LayerControlProps> = ({ layers, onToggleLayer }) => {
  return (
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/80">
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-1.5 border-b border-slate-800 pb-2">
        <Navigation className="w-3.5 h-3.5 text-amber-400" />
        <span>CITY LAYERS SYSTEM</span>
      </h3>

      <div className="space-y-4">
        {/* BASE LAYERS */}
        <div>
          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
            <span>BASE VECTOR LAYERS</span>
            <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono font-bold">STATIC</span>
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(layers.base).map((key) => {
              const active = layers.base[key as keyof typeof layers.base];
              return (
                <button
                  key={key}
                  onClick={() => onToggleLayer('base', key)}
                  className={`flex items-center justify-between p-2 rounded-xl text-left border transition-all duration-200 ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {key === 'buildings' && <Building2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    {key === 'roads' && <Navigation className="w-3.5 h-3.5 flex-shrink-0 rotate-45" />}
                    {key === 'parks' && <TreePine className="w-3.5 h-3.5 flex-shrink-0" />}
                    {key === 'gomti' && <Droplets className="w-3.5 h-3.5 flex-shrink-0" />}
                    {key === 'places' && <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
                    {key === 'labels' && <Tag className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="text-[11px] font-semibold truncate capitalize">{key}</span>
                  </div>
                  {active ? (
                    <Eye className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* LIVE LAYERS */}
        <div>
          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-between">
            <span>LIVE SERVICES & FEEDS</span>
            <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">STREAMING</span>
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(layers.live).map((key) => {
              const active = layers.live[key as keyof typeof layers.live];
              return (
                <button
                  key={key}
                  onClick={() => onToggleLayer('live', key)}
                  className={`flex items-center justify-between p-2 rounded-xl text-left border transition-all duration-200 ${
                    active
                      ? 'bg-sky-500/10 border-sky-500/40 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.05)]'
                      : 'bg-slate-800/40 border-slate-700/30 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {key === 'traffic' && <Navigation className="w-3.5 h-3.5 flex-shrink-0 text-rose-400" />}
                    {key === 'aqi' && <Wind className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />}
                    {key === 'weather' && <CloudSun className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />}
                    {key === 'flights' && <Plane className="w-3.5 h-3.5 flex-shrink-0 text-cyan-400" />}
                    {key === 'railways' && <Train className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />}
                    {key === 'cameras' && <Video className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />}
                    {key === 'news' && <Newspaper className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" />}
                    <span className="text-[11px] font-semibold truncate capitalize">{key}</span>
                  </div>
                  {active ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_#0ea5e9] flex-shrink-0 ml-1" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700 flex-shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
