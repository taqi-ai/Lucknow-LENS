import React, { useState } from 'react';
import {
  Building2,
  Navigation,
  TreePine,
  Droplets,
  MapPin,
  Tag,
  Train,
  Waves,
  Activity,
  Flame,
  AlertTriangle,
  ShieldAlert,
  Newspaper,
  CloudSun,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sun,
  CloudRain,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

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
    emergency: boolean;
  };
  hazards: {
    flood: boolean;
    earthquake: boolean;
    rainfall: boolean;
    waterlogging: boolean;
    heatwave: boolean;
  };
  incidents: {
    accidents: boolean;
    fires: boolean;
    waterlogging: boolean;
    emergency: boolean;
    infrastructure: boolean;
  };
  navigation: {
    route: boolean;
    traffic: boolean;
    alternatives: boolean;
    closures: boolean;
  };
  pulse: {
    news: boolean;
    weather: boolean;
    safety: boolean;
    announcements: boolean;
  };
}

export const DEFAULT_LAYERS: LayerState = {
  base: {
    buildings: true,
    roads: true,
    parks: true,
    gomti: true,
    places: true,
    labels: true,
  },
  live: {
    traffic: true,
    aqi: false,
    weather: false,
    flights: false,
    railways: true,
    cameras: false,
    news: true,
    emergency: true,
  },
  hazards: {
    flood: true,
    earthquake: false,
    rainfall: false,
    waterlogging: true,
    heatwave: false,
  },
  incidents: {
    accidents: true,
    fires: true,
    waterlogging: true,
    emergency: true,
    infrastructure: true,
  },
  navigation: {
    route: true,
    traffic: true,
    alternatives: true,
    closures: true,
  },
  pulse: {
    news: true,
    weather: true,
    safety: true,
    announcements: true,
  },
};

interface LayerControlProps {
  layers: LayerState;
  onToggleLayer: (category: keyof LayerState, layer: string) => void;
  onResetLayers?: () => void;
}

export const LayerControl: React.FC<LayerControlProps> = ({
  layers,
  onToggleLayer,
  onResetLayers,
}) => {
  // Collapsible section states (Defaults: Sections 1, 2, 3 open, 4 & 5 collapsed for tidy elegance)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    infra: true,
    nav: true,
    hazards: false,
    incidents: true,
    pulse: false,
  });

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const countActive = (catObj: Record<string, boolean>) => {
    return Object.values(catObj).filter(Boolean).length;
  };

  return (
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/90 shadow-2xl border border-slate-700/60">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-amber-400" />
          <span>CITY LAYERS SYSTEM</span>
        </h3>
        {onResetLayers && (
          <button
            onClick={onResetLayers}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-amber-300 font-bold px-2 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Reset all layers to default view"
          >
            <RotateCcw className="w-3 h-3" />
            <span>RESET</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5 text-xs">
        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 01: URBAN INFRASTRUCTURE */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('infra')}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-850 text-left transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-amber-400/90 tracking-wider">01</span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide truncate">
                URBAN INFRASTRUCTURE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                {countActive(layers.base)}
              </span>
              {openSections.infra ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
          </button>

          {openSections.infra && (
            <div className="p-2.5 grid grid-cols-2 gap-1.5 border-t border-slate-800/60 bg-slate-950/20">
              {/* Buildings */}
              <button
                onClick={() => onToggleLayer('base', 'buildings')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.buildings
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Buildings</span>
                </div>
                {layers.base.buildings ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Roads */}
              <button
                onClick={() => onToggleLayer('base', 'roads')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.roads
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Navigation className="w-3.5 h-3.5 rotate-45 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Roads</span>
                </div>
                {layers.base.roads ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Parks */}
              <button
                onClick={() => onToggleLayer('base', 'parks')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.parks
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <TreePine className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Parks & Greens</span>
                </div>
                {layers.base.parks ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Gomti River */}
              <button
                onClick={() => onToggleLayer('base', 'gomti')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.gomti
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Droplets className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Gomti River</span>
                </div>
                {layers.base.gomti ? <Eye className="w-3 h-3 text-sky-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Places / POIs */}
              <button
                onClick={() => onToggleLayer('base', 'places')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.places
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Landmarks</span>
                </div>
                {layers.base.places ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Labels */}
              <button
                onClick={() => onToggleLayer('base', 'labels')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.base.labels
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Labels</span>
                </div>
                {layers.base.labels ? <Eye className="w-3 h-3 text-purple-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 02: NAVIGATION & TRAFFIC */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('nav')}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-850 text-left transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-purple-400 tracking-wider">02</span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide truncate">
                NAVIGATION & TRAFFIC
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                {countActive(layers.navigation)}
              </span>
              {openSections.nav ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
          </button>

          {openSections.nav && (
            <div className="p-2.5 grid grid-cols-2 gap-1.5 border-t border-slate-800/60 bg-slate-950/20">
              {/* Active Route */}
              <button
                onClick={() => onToggleLayer('navigation', 'route')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.navigation.route
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Active Route</span>
                </div>
                {layers.navigation.route ? <Eye className="w-3 h-3 text-purple-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Traffic Conditions */}
              <button
                onClick={() => onToggleLayer('live', 'traffic')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.live.traffic
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Navigation className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Traffic Delays</span>
                </div>
                {layers.live.traffic ? <Eye className="w-3 h-3 text-rose-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Alternative Routes */}
              <button
                onClick={() => onToggleLayer('navigation', 'alternatives')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.navigation.alternatives
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Alternatives</span>
                </div>
                {layers.navigation.alternatives ? <Eye className="w-3 h-3 text-sky-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Road Closures */}
              <button
                onClick={() => onToggleLayer('navigation', 'closures')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.navigation.closures
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-amber-400 font-bold text-xs flex-shrink-0">⛔</span>
                  <span className="truncate text-[11px] font-medium">Road Closures</span>
                </div>
                {layers.navigation.closures ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 03: NATURAL HAZARDS */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('hazards')}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-850 text-left transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-rose-400 tracking-wider">03</span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide truncate">
                NATURAL HAZARDS
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                {countActive(layers.hazards)}
              </span>
              {openSections.hazards ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
          </button>

          {openSections.hazards && (
            <div className="p-2.5 space-y-2 border-t border-slate-800/60 bg-slate-950/20">
              <div className="grid grid-cols-2 gap-1.5">
                {/* Flood */}
                <button
                  onClick={() => onToggleLayer('hazards', 'flood')}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                    layers.hazards.flood
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Waves className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <span className="truncate text-[11px] font-medium">Flood Basin</span>
                  </div>
                  {layers.hazards.flood ? <Eye className="w-3 h-3 text-blue-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                </button>

                {/* Waterlogging */}
                <button
                  onClick={() => onToggleLayer('hazards', 'waterlogging')}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                    layers.hazards.waterlogging
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Droplets className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="truncate text-[11px] font-medium">Waterlogging</span>
                  </div>
                  {layers.hazards.waterlogging ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                </button>

                {/* Earthquake */}
                <button
                  onClick={() => onToggleLayer('hazards', 'earthquake')}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                    layers.hazards.earthquake
                      ? 'bg-orange-600/20 border-orange-500/50 text-orange-300'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Activity className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span className="truncate text-[11px] font-medium">Seismic Zone III</span>
                  </div>
                  {layers.hazards.earthquake ? <Eye className="w-3 h-3 text-orange-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                </button>

                {/* Heatwave */}
                <button
                  onClick={() => onToggleLayer('hazards', 'heatwave')}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                    layers.hazards.heatwave
                      ? 'bg-red-600/20 border-red-500/50 text-red-300'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sun className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span className="truncate text-[11px] font-medium">Heat Island (UHI)</span>
                  </div>
                  {layers.hazards.heatwave ? <Eye className="w-3 h-3 text-red-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                </button>

                {/* Heavy Rainfall */}
                <button
                  onClick={() => onToggleLayer('hazards', 'rainfall')}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all col-span-2 ${
                    layers.hazards.rainfall
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CloudRain className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span className="truncate text-[11px] font-medium">Heavy Rainfall Flash Exposure</span>
                  </div>
                  {layers.hazards.rainfall ? <Eye className="w-3 h-3 text-indigo-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                </button>
              </div>

              {/* Hazard Legend Key */}
              <div className="pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Flood
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Waterlog
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Seismic
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Heatwave
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 04: LIVE INCIDENTS */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('incidents')}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-850 text-left transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-rose-500 tracking-wider">04</span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide truncate">
                LIVE INCIDENTS
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                {countActive(layers.incidents)}
              </span>
              {openSections.incidents ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
          </button>

          {openSections.incidents && (
            <div className="p-2.5 grid grid-cols-2 gap-1.5 border-t border-slate-800/60 bg-slate-950/20">
              {/* Road Accidents */}
              <button
                onClick={() => onToggleLayer('incidents', 'accidents')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.incidents.accidents
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-rose-400 text-xs flex-shrink-0">💥</span>
                  <span className="truncate text-[11px] font-medium">Accidents</span>
                </div>
                {layers.incidents.accidents ? <Eye className="w-3 h-3 text-rose-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Fire Incidents */}
              <button
                onClick={() => onToggleLayer('incidents', 'fires')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.incidents.fires
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Flame className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Fire Incidents</span>
                </div>
                {layers.incidents.fires ? <Eye className="w-3 h-3 text-orange-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Emergency Services */}
              <button
                onClick={() => onToggleLayer('live', 'emergency')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.live.emergency
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Hospitals & Police</span>
                </div>
                {layers.live.emergency ? <Eye className="w-3 h-3 text-rose-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Infrastructure Damage */}
              <button
                onClick={() => onToggleLayer('incidents', 'infrastructure')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.incidents.infrastructure
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Roadworks</span>
                </div>
                {layers.incidents.infrastructure ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION 05: CITY PULSE */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          <button
            onClick={() => toggleSection('pulse')}
            className="w-full flex items-center justify-between p-2.5 bg-slate-900/60 hover:bg-slate-850 text-left transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-sky-400 tracking-wider">05</span>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide truncate">
                CITY PULSE (LOCATION NEWS)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-md">
                {countActive(layers.pulse)}
              </span>
              {openSections.pulse ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
          </button>

          {openSections.pulse && (
            <div className="p-2.5 grid grid-cols-2 gap-1.5 border-t border-slate-800/60 bg-slate-950/20">
              {/* Local News */}
              <button
                onClick={() => onToggleLayer('live', 'news')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.live.news
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Newspaper className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Local News</span>
                </div>
                {layers.live.news ? <Eye className="w-3 h-3 text-sky-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Weather Alerts */}
              <button
                onClick={() => onToggleLayer('live', 'weather')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.live.weather
                    ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CloudSun className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Weather Telemetry</span>
                </div>
                {layers.live.weather ? <Eye className="w-3 h-3 text-yellow-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Public Transport */}
              <button
                onClick={() => onToggleLayer('live', 'railways')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.live.railways
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Train className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Railways & Metro</span>
                </div>
                {layers.live.railways ? <Eye className="w-3 h-3 text-indigo-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>

              {/* Public Safety / Announcements */}
              <button
                onClick={() => onToggleLayer('pulse', 'announcements')}
                className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                  layers.pulse.announcements
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Radio className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="truncate text-[11px] font-medium">Announcements</span>
                </div>
                {layers.pulse.announcements ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
