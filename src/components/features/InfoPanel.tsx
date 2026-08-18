import React from 'react';
import { SelectedEntity } from '../../types';
import { Building2, MapPin, Plane, X, Shield, Landmark, Ruler, Layers, Eye } from 'lucide-react';

interface InfoPanelProps {
  entity: SelectedEntity | null;
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ entity, onClose }) => {
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
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 block">
              {entity.type} INSPECTOR
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
