import React from 'react';
import { SelectedEntity } from '../../types';
import {
  Building2,
  MapPin,
  Plane,
  X,
  Shield,
  Landmark,
  Ruler,
  Layers,
  Navigation,
  ShieldAlert,
  HeartPulse,
  Flame,
  Radio,
  PhoneCall,
  AlertTriangle,
  Waves,
  Sun,
  Activity,
  CloudRain,
  Newspaper,
  CheckCircle2,
  Compass,
  ArrowRight,
  Route,
  Zap,
} from 'lucide-react';
import { SpatialHazardZone, SpatialIncident, CityPulseItem } from '../../spatial/types';
import { NavigationRoute } from '../../navigation/types';

interface InfoPanelProps {
  entity: SelectedEntity | null;
  onClose: () => void;
  onSetDestinationWaypoint?: (dest: { x: number; z: number; name: string }) => void;
  onCheckRouteImpact?: (incident: SpatialIncident) => void;
  onFindAlternativeRoute?: (incident: SpatialIncident) => void;
  onFlyToLocation?: (lat: number, lon: number, altitude?: number) => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  entity,
  onClose,
  onSetDestinationWaypoint,
  onCheckRouteImpact,
  onFindAlternativeRoute,
  onFlyToLocation,
}) => {
  if (!entity) return null;

  return (
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/95 shadow-2xl border border-slate-700/80 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-100 flex-shrink-0">
            {entity.type === 'building' && <Building2 className="w-4 h-4 text-emerald-400" />}
            {entity.type === 'poi' && <Landmark className="w-4 h-4 text-amber-400" />}
            {entity.type === 'aircraft' && <Plane className="w-4 h-4 text-cyan-400" />}
            {entity.type === 'emergency' && entity.details.type === 'hospital' && <HeartPulse className="w-4 h-4 text-rose-400" />}
            {entity.type === 'emergency' && entity.details.type === 'police' && <ShieldAlert className="w-4 h-4 text-blue-400" />}
            {entity.type === 'emergency' && entity.details.type === 'fire' && <Flame className="w-4 h-4 text-orange-400" />}
            {entity.type === 'transport-hub' && (entity.details.category === 'airport' ? <Plane className="w-4 h-4 text-sky-400" /> : <Navigation className="w-4 h-4 text-amber-400" />)}
            {entity.type === 'hazard' && <Waves className="w-4 h-4 text-blue-400" />}
            {entity.type === 'incident' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            {entity.type === 'news' && <Newspaper className="w-4 h-4 text-sky-400" />}
            {entity.type === 'route' && <Route className="w-4 h-4 text-purple-400" />}
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
              {entity.type === 'transport-hub'
                ? 'TRANSPORT GATEWAY'
                : entity.type === 'hazard'
                ? 'NATURAL HAZARD ZONE'
                : entity.type === 'incident'
                ? 'LIVE CITY INCIDENT'
                : entity.type === 'news'
                ? 'CITY PULSE BULLETIN'
                : `${entity.type} INSPECTOR`}
            </span>
            <h3 className="text-xs font-bold text-white truncate capitalize">
              {entity.name || `${entity.type} Selection`}
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3 text-xs">
        {/* 1. BUILDING DETAILS */}
        {entity.type === 'building' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Estimated Height:</span>
              <strong className="text-emerald-400 font-mono text-[11px]">
                {entity.details.height?.toFixed(1)}m
              </strong>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Approx. Floors:</span>
              <strong className="text-slate-200 font-mono text-[11px]">{entity.details.stories}</strong>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Footprint Area:</span>
              <strong className="text-slate-200 font-mono text-[11px]">{Math.round(entity.details.area || 0)}m²</strong>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Structure Type:</span>
              <strong className="text-slate-200 capitalize font-medium">{entity.details.type || 'Urban Fabric'}</strong>
            </div>
          </div>
        )}

        {/* 2. HAZARD ZONE DETAILS */}
        {entity.type === 'hazard' && (() => {
          const zone = entity.details as SpatialHazardZone;
          return (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">Assessed Risk:</span>
                <span className={`px-2 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${
                  zone.riskLevel === 'very-high'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : zone.riskLevel === 'high'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {zone.riskLevel} RISK
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                {zone.description}
              </p>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Defensible Scientific Parameters:
                </span>
                <div className="bg-slate-900/60 p-2 rounded-xl space-y-1 text-[10px] border border-slate-800/40">
                  {Object.entries(zone.defensibleParameters || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5">
                      <span className="text-slate-400">{k}:</span>
                      <strong className="text-slate-200 font-mono">{String(v)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/40 space-y-0.5">
                <div><span className="font-bold text-slate-400">Data Source:</span> {zone.dataSource}</div>
                <div><span className="font-bold text-slate-400">Assessment:</span> {zone.lastUpdated}</div>
                <div className="text-[9px] text-amber-400 font-bold mt-1">
                  🛡️ Historical Hazard Assessment (Not an active disaster alert)
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. LIVE INCIDENT DETAILS */}
        {entity.type === 'incident' && (() => {
          const inc = entity.details as SpatialIncident;
          return (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${
                  inc.severity === 'critical'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                    : inc.severity === 'major'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {inc.severity} SEVERITY
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Status: <span className="text-white capitalize">{inc.status}</span>
                </span>
              </div>

              <p className="text-[11px] text-slate-200 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                {inc.description}
              </p>

              <div className="bg-slate-900/60 p-2 rounded-xl text-[10px] space-y-1 border border-slate-800/40">
                <div className="flex justify-between">
                  <span className="text-slate-400">Location:</span>
                  <strong className="text-slate-200">{inc.locationName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Traffic Effect:</span>
                  <strong className={inc.blocksTraffic ? 'text-rose-400' : 'text-amber-400'}>
                    {inc.blocksTraffic ? 'Carriageway Blocked' : 'Sluggish Movement'}
                  </strong>
                </div>
                {inc.estimatedDelayMinutes && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Estimated Delay:</span>
                    <strong className="text-amber-300 font-mono">+{inc.estimatedDelayMinutes} mins</strong>
                  </div>
                )}
                <div className="flex justify-between text-[9px] text-slate-400 pt-1 border-t border-slate-800/40">
                  <span>Source: {inc.source}</span>
                  <span>{inc.timestamp}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => onFlyToLocation?.(inc.latitude, inc.longitude, 400)}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border border-slate-700 transition-colors"
                >
                  <Compass className="w-3 h-3 text-cyan-400" />
                  <span>VIEW LOCATION</span>
                </button>

                <button
                  onClick={() => onCheckRouteImpact?.(inc)}
                  className="py-1.5 px-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border border-purple-500/40 transition-colors"
                >
                  <Navigation className="w-3 h-3 text-purple-300" />
                  <span>CHECK ROUTE</span>
                </button>

                {inc.blocksTraffic && (
                  <button
                    onClick={() => onFindAlternativeRoute?.(inc)}
                    className="col-span-2 py-1.5 px-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border border-amber-500/40 transition-colors"
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>FIND ALTERNATIVE DETOUR</span>
                  </button>
                )}
              </div>

              {inc.isSimulated && (
                <div className="text-[9px] text-slate-400 text-center font-mono">
                  [ SIMULATED DEMO EVENT FOR TESTING ]
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. CITY PULSE NEWS DETAILS */}
        {entity.type === 'news' && (() => {
          const item = entity.details as CityPulseItem;
          return (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/40">
                  {item.category.toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-400">{item.publishedAt}</span>
              </div>

              <h4 className="text-xs font-bold text-white leading-snug">
                {item.headline}
              </h4>

              <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                {item.summary}
              </p>

              <div className="text-[10px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/40">
                <div><span className="font-bold text-slate-400">Area:</span> {item.affectedArea}</div>
                <div><span className="font-bold text-slate-400">Source:</span> {item.source}</div>
                <div className="text-[9px] text-slate-400 font-mono mt-1">
                  Verification: <span className="text-amber-400 uppercase font-bold">{item.verificationStatus}</span>
                </div>
              </div>

              {onSetDestinationWaypoint && (
                <button
                  onClick={() => onSetDestinationWaypoint({ x: item.x, z: item.z, name: item.affectedArea })}
                  className="w-full py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-purple-500/40 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5 text-purple-300" />
                  <span>Navigate to this Location</span>
                </button>
              )}
            </div>
          );
        })()}

        {/* 5. TRANSPORT HUB / AIRPORT / RAILWAY */}
        {entity.type === 'transport-hub' && (
          <div className="space-y-2.5">
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 space-y-1.5">
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Capacity:</span>
                <strong className="text-slate-200">{entity.details.metadata?.capacity}</strong>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Status:</span>
                <strong className="text-emerald-400">{entity.details.metadata?.status}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Infrastructure Specifications:
              </span>
              <div className="bg-slate-900/60 p-2 rounded-xl text-[10px] space-y-1 border border-slate-800/40">
                {Object.entries(entity.details.metadata?.details || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5">
                    <span className="text-slate-400">{k}:</span>
                    <strong className="text-slate-200 text-right max-w-[55%] truncate">{String(v)}</strong>
                  </div>
                ))}
              </div>
            </div>

            {onSetDestinationWaypoint && (
              <button
                onClick={() => onSetDestinationWaypoint({ x: entity.x, z: entity.z, name: entity.name })}
                className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all border border-purple-400/40"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Navigate to {entity.name.split(' ')[0]}</span>
              </button>
            )}
          </div>
        )}

        {/* 6. EMERGENCY FACILITY */}
        {entity.type === 'emergency' && (
          <div className="space-y-2">
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Facility Type:</span>
                <strong className="text-white capitalize">{entity.details.type}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Contact Hotline:</span>
                <strong className="text-emerald-400 font-mono">{entity.details.phone}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Operating Hours:</span>
                <strong className="text-slate-200">{entity.details.hours}</strong>
              </div>
            </div>

            {onSetDestinationWaypoint && (
              <button
                onClick={() => onSetDestinationWaypoint({ x: entity.x, z: entity.z, name: entity.name })}
                className="w-full py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-rose-500/40 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5 text-rose-300" />
                <span>Emergency Navigation Route</span>
              </button>
            )}
          </div>
        )}

        {/* 7. POI / LANDMARK */}
        {entity.type === 'poi' && (
          <div className="space-y-2 text-xs">
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Category:</span>
                <strong className="text-amber-400 capitalize">{entity.details.category || entity.details.type || 'Heritage'}</strong>
              </div>
              {entity.details.highlights && (
                <p className="text-[10px] text-slate-300 pt-1 leading-relaxed">
                  {entity.details.highlights}
                </p>
              )}
            </div>

            {onSetDestinationWaypoint && (
              <button
                onClick={() => onSetDestinationWaypoint({ x: entity.x, z: entity.z, name: entity.name })}
                className="w-full py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-purple-500/40 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5 text-purple-300" />
                <span>Route to this Landmark</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
