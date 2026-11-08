import React from 'react';
import { SelectedEntity } from '../../types';
import { Building2, MapPin, Plane, X, Shield, Landmark, Ruler, Layers, Navigation, ShieldAlert, HeartPulse, Flame, Radio, PhoneCall } from 'lucide-react';

interface InfoPanelProps {
  entity: SelectedEntity | null;
  onClose: () => void;
  onSetDestinationWaypoint?: (dest: { x: number; z: number; name: string }) => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ entity, onClose, onSetDestinationWaypoint }) => {
  if (!entity) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 w-full transition-all hover:bg-slate-900/80 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-100 flex-shrink-0">
            {entity.type === 'building' && <Building2 className="w-4 h-4 text-emerald-400" />}
            {entity.type === 'poi' && <Landmark className="w-4 h-4 text-amber-400" />}
            {entity.type === 'aircraft' && <Plane className="w-4 h-4 text-cyan-400" />}
            {entity.type === 'emergency' && entity.details.type === 'hospital' && <HeartPulse className="w-4 h-4 text-rose-400" />}
            {entity.type === 'emergency' && entity.details.type === 'police' && <ShieldAlert className="w-4 h-4 text-blue-400" />}
            {entity.type === 'emergency' && entity.details.type === 'fire' && <Flame className="w-4 h-4 text-orange-400" />}
            {entity.type === 'transport-hub' && (entity.details.category === 'airport' ? <Plane className="w-4 h-4 text-sky-400" /> : <Navigation className="w-4 h-4 text-amber-400" />)}
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block">
              {entity.type === 'transport-hub' ? 'TRANSPORT GATEWAY' : entity.type} INSPECTOR
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
      <div className="space-y-3.5">
        {entity.type === 'building' && (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-slate-500" />
                Estimated Height:
              </span>
              <strong className="text-emerald-400 font-mono text-[11px]">
                {entity.details.height?.toFixed(1)}m <span className="text-[9px] text-slate-500 font-normal italic">(Estimated)</span>
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Approx. Floors:
              </span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {entity.details.stories} <span className="text-[9px] text-slate-500 font-normal italic">(Estimated)</span>
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                Footprint Area:
              </span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {Math.round(entity.details.area || 0)}m²
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                Building Type:
              </span>
              <strong className="text-slate-200 capitalize font-medium">
                {entity.details.type || 'Urban Fabric'}
              </strong>
            </div>
            
            <div className="pt-1 text-[10px] text-slate-500 leading-relaxed italic bg-slate-900/40 p-2 rounded-xl border border-slate-800/40">
              Structural dimensions are calculated procedurally using spatial massing footprint envelopes. Labeled height measurements are models of estimation.
            </div>
          </div>
        )}

        {entity.type === 'poi' && (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-slate-500" />
                POI Category:
              </span>
              <strong className="text-amber-400 capitalize bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px]">
                {entity.details.category}
              </strong>
            </div>

            {entity.details.address && (
              <div className="py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400 block mb-1">Address:</span>
                <p className="text-slate-200 leading-relaxed text-[11px]">
                  {entity.details.address}
                </p>
              </div>
            )}

            {entity.details.phone && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400">Phone:</span>
                <span className="text-slate-200 font-mono">{entity.details.phone}</span>
              </div>
            )}

            {entity.details.website && (
              <div className="py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400 block mb-1">Website:</span>
                <a
                  href={entity.details.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:underline truncate block text-[11px]"
                >
                  {entity.details.website}
                </a>
              </div>
            )}
          </div>
        )}

        {entity.type === 'aircraft' && (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-slate-500" />
                Flight Carrier:
              </span>
              <strong className="text-cyan-400 font-bold">
                {entity.details.airline} ({entity.id})
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400">Altitude (MSL):</span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {entity.details.altitude.toLocaleString()} m
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400">Airspeed:</span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {entity.details.speed} kts
              </strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400">Heading:</span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {entity.details.heading}°
              </strong>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50 text-center">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">ORIGIN</span>
                <strong className="text-xs text-white font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700/50">
                  {entity.details.origin}
                </strong>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-0.5">DESTINATION</span>
                <strong className="text-xs text-white font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700/50">
                  {entity.details.destination}
                </strong>
              </div>
            </div>
          </div>
        )}

        {entity.type === 'emergency' && (
          <div className="space-y-2.5 text-xs">
            {/* Municipal Facility Banner */}
            <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
              entity.details.type === 'hospital'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : entity.details.type === 'police'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
            }`}>
              <div>
                <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-75 block">
                  EMERGENCY FACILITY
                </span>
                <strong className="text-xs font-bold text-white">
                  {entity.details.tierName}
                </strong>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900/80 border border-current flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                24/7 ACTIVE
              </span>
            </div>

            {/* Coverage Radius Indicator */}
            <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Response Radius:
              </span>
              <strong className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" />
                {entity.details.coverageRadiusMeters.toLocaleString()} m ({((entity.details.coverageRadiusMeters) / 1000).toFixed(1)} km)
              </strong>
            </div>

            {/* Fleet / Equipment */}
            <div className="py-1.5 border-b border-slate-800/40">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">DISPATCH FLEET & SQUAD:</span>
              <strong className="text-slate-200 text-[11px]">
                {entity.details.vehicles}
              </strong>
            </div>

            {/* Capacity / Role */}
            <div className="py-1.5 border-b border-slate-800/40">
              <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">OPERATIONAL CAPACITY:</span>
              <strong className="text-slate-200 text-[11px]">
                {entity.details.capacity}
              </strong>
            </div>

            {/* Sector / District */}
            {entity.details.district && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400">Jurisdiction:</span>
                <strong className="text-slate-300 font-mono text-[11px]">
                  {entity.details.district}
                </strong>
              </div>
            )}

            {/* Helpline Hotline */}
            {entity.details.phone && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400 flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
                  Direct Hotline:
                </span>
                <strong className="text-amber-400 font-bold font-mono text-xs">
                  {entity.details.phone}
                </strong>
              </div>
            )}
          </div>
        )}

        {entity.type === 'transport-hub' && (
          <div className="space-y-2 text-xs">
            {/* Status & Category Badge */}
            <div className="flex justify-between items-center py-2 px-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                  STRATEGIC GATEWAY
                </span>
                <strong className="text-xs font-bold text-white capitalize">
                  {entity.details.category === 'airport' ? 'International Airport' : 'Railway Grand Terminal'}
                </strong>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900/80 border border-emerald-500/40 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                24/7 ACTIVE
              </span>
            </div>

            {/* Operational Status */}
            {entity.details.metadata?.status && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400">Operation Status:</span>
                <strong className="text-sky-400 font-mono text-[11px]">
                  {entity.details.metadata.status}
                </strong>
              </div>
            )}

            {/* Capacity */}
            {entity.details.metadata?.capacity && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                <span className="text-slate-400">Passenger Traffic:</span>
                <strong className="text-amber-400 font-bold text-[11px]">
                  {entity.details.metadata.capacity}
                </strong>
              </div>
            )}

            {/* Key Features */}
            {entity.details.metadata?.keyFeatures && (
              <div className="py-1.5 border-b border-slate-800/40">
                <span className="text-[10px] text-slate-400 block mb-0.5 font-medium">KEY INFRASTRUCTURE:</span>
                <p className="text-slate-200 text-[11px] leading-relaxed">
                  {entity.details.metadata.keyFeatures}
                </p>
              </div>
            )}

            {/* Detailed Key-Value Breakdown */}
            {entity.details.metadata?.details && (
              <div className="pt-1 space-y-1.5">
                {Object.entries(entity.details.metadata.details).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start py-1 border-b border-slate-800/30 text-[11px]">
                    <span className="text-slate-400 pr-2">{k}:</span>
                    <strong className="text-slate-200 text-right font-medium max-w-[62%]">{String(v)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Button: Set GTA GPS Waypoint */}
        {onSetDestinationWaypoint && entity.type !== 'aircraft' && (
          <button
            onClick={() => onSetDestinationWaypoint({ x: entity.x, z: entity.z, name: entity.name })}
            className="w-full mt-2.5 py-2.5 px-3 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Navigation className="w-3.5 h-3.5 fill-current" />
            <span>SET GTA GPS WAYPOINT</span>
          </button>
        )}

        {/* Global Coordinates */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-slate-500" />
            <span>GEO LAT/LON:</span>
          </div>
          <span>
            {entity.latitude.toFixed(5)}°, {entity.longitude.toFixed(5)}°
          </span>
        </div>
      </div>
    </div>
  );
};
