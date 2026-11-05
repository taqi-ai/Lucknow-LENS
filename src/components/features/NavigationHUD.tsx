import React from 'react';
import { NavigationRoute, NavigatorState, GPSTheme, ManeuverType } from '../../navigation/types';
import {
  Navigation,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  RotateCcw,
  Flag,
  Play,
  Pause,
  X,
  Compass,
  Gauge,
  Camera,
  Palette,
  Clock,
  MapPin,
} from 'lucide-react';

interface NavigationHUDProps {
  route: NavigationRoute | null;
  state: NavigatorState | null;
  theme: GPSTheme;
  followCamera: boolean;
  onToggleDrive: () => void;
  onToggleFollowCamera: () => void;
  onChangeSpeed: (kmH: number) => void;
  onChangeTheme: (theme: GPSTheme) => void;
  onClearRoute: () => void;
}

function getManeuverIcon(type?: ManeuverType) {
  switch (type) {
    case 'turn-left':
    case 'sharp-left':
      return <CornerUpLeft className="w-7 h-7 text-white animate-pulse" />;
    case 'turn-right':
    case 'sharp-right':
      return <CornerUpRight className="w-7 h-7 text-white animate-pulse" />;
    case 'slight-left':
      return <ArrowUpLeft className="w-7 h-7 text-white" />;
    case 'slight-right':
      return <ArrowUpRight className="w-7 h-7 text-white" />;
    case 'u-turn':
      return <RotateCcw className="w-7 h-7 text-white" />;
    case 'arrive':
      return <Flag className="w-7 h-7 text-emerald-400" />;
    case 'depart':
    case 'straight':
    default:
      return <ArrowUp className="w-7 h-7 text-white" />;
  }
}

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  route,
  state,
  theme,
  followCamera,
  onToggleDrive,
  onToggleFollowCamera,
  onChangeSpeed,
  onChangeTheme,
  onClearRoute,
}) => {
  if (!route) return null;

  const activeManeuver =
    state && route.maneuvers[state.currentManeuverIndex]
      ? route.maneuvers[state.currentManeuverIndex]
      : route.maneuvers[0];

  const nextManeuver =
    state && route.maneuvers[state.currentManeuverIndex + 1]
      ? route.maneuvers[state.currentManeuverIndex + 1]
      : null;

  const distMeters = state ? state.distanceRemainingMeters : route.totalDistanceMeters;
  const distText = distMeters > 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${distMeters} m`;

  const timeSeconds = state ? state.timeRemainingSeconds : route.estimatedDurationSeconds;
  const minutes = Math.floor(timeSeconds / 60);
  const seconds = Math.floor(timeSeconds % 60);
  const timeText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const isDriving = state?.isDriving ?? false;
  const currentSpeed = state?.driveSpeedKmH ?? 65;

  const themeBorder =
    theme === 'cyan'
      ? 'border-cyan-500/50 shadow-cyan-500/20'
      : theme === 'neon'
      ? 'border-pink-500/50 shadow-pink-500/20'
      : 'border-amber-500/50 shadow-amber-500/20';

  const themeBgBadge =
    theme === 'cyan'
      ? 'bg-cyan-500 text-slate-950'
      : theme === 'neon'
      ? 'bg-pink-500 text-white'
      : 'bg-amber-500 text-slate-950';

  const themeText =
    theme === 'cyan' ? 'text-cyan-400' : theme === 'neon' ? 'text-pink-400' : 'text-amber-400';

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92vw] sm:w-[540px] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
      <div
        className={`bg-slate-950/90 backdrop-blur-xl border ${themeBorder} rounded-3xl p-4 shadow-2xl transition-all`}
      >
        {/* Top Header: Waypoint Name & Cancel Button */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 ${themeBgBadge}`}
            >
              <Navigation className="w-2.5 h-2.5 fill-current" />
              GTA GPS ACTIVE
            </span>
            <span className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {route.destination.name || 'Marked Waypoint'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Theme switcher */}
            <button
              onClick={() => {
                const next: GPSTheme = theme === 'cyan' ? 'neon' : theme === 'neon' ? 'amber' : 'cyan';
                onChangeTheme(next);
              }}
              title="Cycle GPS Theme Color"
              className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {/* Close / Clear button */}
            <button
              onClick={onClearRoute}
              title="Cancel GPS Waypoint"
              className="p-1.5 hover:bg-rose-500/20 hover:text-rose-300 rounded-xl text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Turn Maneuver & Next Turn */}
        <div className="flex items-center gap-4">
          {/* Large Turn Arrow Box */}
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-slate-900 border border-slate-700/60 shadow-lg ${
              theme === 'cyan'
                ? 'shadow-cyan-500/10'
                : theme === 'neon'
                ? 'shadow-pink-500/10'
                : 'shadow-amber-500/10'
            }`}
          >
            {getManeuverIcon(nextManeuver ? nextManeuver.type : activeManeuver?.type)}
          </div>

          {/* Maneuver Text */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-slate-400">
              {nextManeuver
                ? `In ${Math.max(10, nextManeuver.distanceMeters)}m`
                : 'Current road:'}
            </div>
            <h4 className="text-sm sm:text-base font-extrabold text-white truncate tracking-tight">
              {nextManeuver ? nextManeuver.instruction : activeManeuver?.instruction}
            </h4>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              Follow {activeManeuver?.streetName || 'Road Network'}
            </div>
          </div>

          {/* Quick Metrics (Remaining distance & time) */}
          <div className="text-right flex-shrink-0 pl-2 border-l border-slate-800">
            <div className={`text-base sm:text-lg font-black font-mono leading-none ${themeText}`}>
              {distText}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-mono mt-1">
              <Clock className="w-3 h-3 text-slate-500" />
              {timeText}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Cruise Controls & Speed */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2">
            {/* Drive / Pause Route Button */}
            <button
              onClick={onToggleDrive}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-md ${
                isDriving
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : `${themeBgBadge} hover:opacity-90 shadow-cyan-500/20`
              }`}
            >
              {isDriving ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" /> Pause Drive
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Drive Route
                </>
              )}
            </button>

            {/* Chase Camera Toggle */}
            <button
              onClick={onToggleFollowCamera}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                followCamera
                  ? 'bg-slate-800 text-white border-slate-600'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {followCamera ? 'Chase Cam: ON' : 'Free Cam'}
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-800">
            {[35, 65, 110].map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                  currentSpeed === s
                    ? `${themeBgBadge}`
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}k
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
