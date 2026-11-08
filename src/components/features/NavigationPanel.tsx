import React, { useState } from 'react';
import {
  Navigation,
  Car,
  Bike,
  Footprints,
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Play,
  Pause,
  X,
  Compass,
  MapPin,
  Search,
  RotateCcw,
} from 'lucide-react';
import {
  TransportMode,
  RoutePreference,
  NavigationRoute,
  RouteWaypoint,
} from '../../navigation/types';
import { project } from '../../geo/projection';

interface NavigationPanelProps {
  activeRoute: NavigationRoute | null;
  onFindRoute: (
    start: RouteWaypoint,
    destination: RouteWaypoint,
    mode: TransportMode,
    preference: RoutePreference
  ) => void;
  onClearRoute: () => void;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  isSimulating: boolean;
  cameraTarget: { x: number; z: number };
  onClose: () => void;
}

const FAMOUS_LANDMARKS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Lucknow Charbagh Railway Grand Terminal', lat: 26.8322, lon: 80.9221 },
  { name: 'Chaudhary Charan Singh Int\'l Airport (T3)', lat: 26.7606, lon: 80.8893 },
  { name: 'Hazratganj Central Commercial Crossing', lat: 26.8488, lon: 80.9442 },
  { name: 'Ambedkar Memorial Park', lat: 26.8465, lon: 80.9754 },
  { name: 'Vidhan Sabha (Legislative Assembly)', lat: 26.8427, lon: 80.9419 },
  { name: 'Rumi Darwaza & Bara Imambara', lat: 26.8698, lon: 80.9135 },
  { name: 'Ekana International Cricket Stadium', lat: 26.8115, lon: 81.0118 },
  { name: 'Janeshwar Mishra Park (Gomti Nagar)', lat: 26.8385, lon: 80.9890 },
];

export const NavigationPanel: React.FC<NavigationPanelProps> = ({
  activeRoute,
  onFindRoute,
  onClearRoute,
  onStartSimulation,
  onPauseSimulation,
  isSimulating,
  cameraTarget,
  onClose,
}) => {
  const [startType, setStartType] = useState<'current' | 'landmark'>('current');
  const [selectedStartLandmark, setSelectedStartLandmark] = useState<string>(FAMOUS_LANDMARKS[2].name);
  const [selectedDestLandmark, setSelectedDestLandmark] = useState<string>(FAMOUS_LANDMARKS[0].name);

  const [transportMode, setTransportMode] = useState<TransportMode>('car');
  const [preference, setPreference] = useState<RoutePreference>('fastest');
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);

    // 1. Resolve Origin Point
    let startPoint: RouteWaypoint;
    if (startType === 'current') {
      startPoint = {
        x: cameraTarget.x,
        z: cameraTarget.z,
        name: 'Current Camera / GPS Location',
      };
    } else {
      const lm = FAMOUS_LANDMARKS.find((l) => l.name === selectedStartLandmark) || FAMOUS_LANDMARKS[2];
      const { x, z } = project(lm.lat, lm.lon);
      startPoint = { x, z, name: lm.name, lat: lm.lat, lon: lm.lon };
    }

    // 2. Resolve Destination Point
    const destLm = FAMOUS_LANDMARKS.find((l) => l.name === selectedDestLandmark) || FAMOUS_LANDMARKS[0];
    const { x: dx, z: dz } = project(destLm.lat, destLm.lon);
    const destPoint: RouteWaypoint = {
      x: dx,
      z: dz,
      name: destLm.name,
      lat: destLm.lat,
      lon: destLm.lon,
    };

    await onFindRoute(startPoint, destPoint, transportMode, preference);
    setLoading(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/90 shadow-2xl border border-purple-500/40 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-400">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              GTA-STYLE INTELLIGENT NAVIGATION
            </h3>
            <span className="text-[9px] font-bold text-purple-400/90 block">
              Road-Network A* Topological Routing Engine
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Origin Selection */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-cyan-400" />
          <span>Starting Location:</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setStartType('current')}
            className={`p-2 rounded-xl text-left border text-xs font-bold transition-all ${
              startType === 'current'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            📍 Current / Map View
          </button>
          <button
            onClick={() => setStartType('landmark')}
            className={`p-2 rounded-xl text-left border text-xs font-bold transition-all ${
              startType === 'landmark'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            🏛️ Choose Landmark
          </button>
        </div>

        {startType === 'landmark' && (
          <select
            value={selectedStartLandmark}
            onChange={(e) => setSelectedStartLandmark(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl p-2 outline-none focus:border-cyan-500"
          >
            {FAMOUS_LANDMARKS.map((lm) => (
              <option key={lm.name} value={lm.name}>
                {lm.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Destination Selection */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <MapPin className="w-3 h-3 text-purple-400" />
          <span>Destination Location:</span>
        </label>
        <select
          value={selectedDestLandmark}
          onChange={(e) => setSelectedDestLandmark(e.target.value)}
          className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs font-medium rounded-xl p-2 outline-none focus:border-purple-500"
        >
          {FAMOUS_LANDMARKS.map((lm) => (
            <option key={lm.name} value={lm.name}>
              {lm.name}
            </option>
          ))}
        </select>
      </div>

      {/* Transport Mode Toggles */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          Transport Mode:
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => setTransportMode('car')}
            className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition-all ${
              transportMode === 'car'
                ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-lg shadow-purple-600/20'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Car</span>
          </button>

          <button
            onClick={() => setTransportMode('bike')}
            className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition-all ${
              transportMode === 'bike'
                ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-lg shadow-purple-600/20'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Bike</span>
          </button>

          <button
            onClick={() => setTransportMode('walking')}
            className={`flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-bold border transition-all ${
              transportMode === 'walking'
                ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-lg shadow-purple-600/20'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            <span>Walk</span>
          </button>
        </div>
      </div>

      {/* Route Preferences */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          Route Preferences:
        </label>
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          <button
            onClick={() => setPreference('fastest')}
            className={`p-1.5 rounded-xl border text-center font-bold transition-all ${
              preference === 'fastest'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            ⚡ Fastest
          </button>
          <button
            onClick={() => setPreference('shortest')}
            className={`p-1.5 rounded-xl border text-center font-bold transition-all ${
              preference === 'shortest'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            📏 Shortest
          </button>
          <button
            onClick={() => setPreference('avoid-closures')}
            className={`p-1.5 rounded-xl border text-center font-bold transition-all ${
              preference === 'avoid-closures'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-400'
            }`}
          >
            🛡️ Avoid Closures
          </button>
        </div>
      </div>

      {/* Action CTA: FIND ROUTE */}
      <button
        onClick={handleCalculate}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-purple-600/30 transition-all flex items-center justify-center gap-2 border border-purple-400/40"
      >
        <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
        <span>{loading ? 'CALCULATING ROAD PATH...' : 'FIND ROUTE'}</span>
      </button>

      {/* Active Route Information Card */}
      {activeRoute && (
        <div className="pt-2 border-t border-slate-800 space-y-2.5 bg-slate-950/40 p-3 rounded-xl border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
              ACTIVE ROUTE SUMMARY
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              {activeRoute.trafficConditions.toUpperCase()} TRAFFIC
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Total Distance</span>
              <strong className="text-sm font-black text-white font-mono">
                {(activeRoute.totalDistanceMeters / 1000).toFixed(1)} km
              </strong>
            </div>

            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Estimated Time</span>
              <strong className="text-sm font-black text-amber-300 font-mono">
                {Math.round(activeRoute.estimatedDurationSeconds / 60)} mins
              </strong>
            </div>
          </div>

          {activeRoute.majorRoads.length > 0 && (
            <div className="text-[10px] text-slate-400 leading-snug">
              <span className="font-bold text-slate-300">Via Corridors: </span>
              {activeRoute.majorRoads.join(' ➔ ')}
            </div>
          )}

          {activeRoute.closuresAvoidedCount > 0 && (
            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{activeRoute.closuresAvoidedCount} active road closure bypassed safely</span>
            </div>
          )}

          {activeRoute.alternativeRoutes && activeRoute.alternativeRoutes.length > 0 && (
            <div className="text-[10px] text-sky-400 font-semibold bg-sky-950/40 p-1.5 rounded-lg border border-sky-500/30">
              ℹ️ 1 Subdued alternative route visualized on 3D map
            </div>
          )}

          {/* Simulation & Clear Controls */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={isSimulating ? onPauseSimulation : onStartSimulation}
              className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
            >
              {isSimulating ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{isSimulating ? 'Pause Drive' : 'Simulate GPS'}</span>
            </button>

            <button
              onClick={onClearRoute}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs border border-rose-500/40 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
