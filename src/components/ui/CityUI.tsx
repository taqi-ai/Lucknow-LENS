import React, { useState } from 'react';
import { CameraPreset, OSMMapData, RenderStats } from '../../types';
import { ReportModal } from './ReportModal';
import { Compass, Building2, FileText, Activity, Map, Navigation, Maximize2, MapPin } from 'lucide-react';

interface CityUIProps {
  mapData: OSMMapData;
  renderStats: RenderStats;
  onCameraSignal: (signal: CameraPreset) => void;
  onReloadOSM: () => void;
}

export const CityUI: React.FC<CityUIProps> = ({
  mapData,
  renderStats,
  onCameraSignal,
}) => {
  const [isReportOpen, setIsReportOpen] = useState(false);

  return (
    <>
      {/* Top Left Branding Header Badge */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-md">
            <Building2 className="w-5 h-5 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-extrabold text-white tracking-tight">
                LUCKNOW REAL GIS MAP (map.osm)
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                REAL DATA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Central Lucknow • Latitude {mapData.bounds.centerLat.toFixed(4)}°, Longitude {mapData.bounds.centerLon.toFixed(4)}°
            </p>
          </div>
        </div>
      </div>

      {/* Top Right Controls & Camera View Presets */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none flex flex-wrap items-center gap-2 justify-end">
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-1.5 shadow-2xl">
          <button
            onClick={() => onCameraSignal('frame')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            title="Reset Camera to Frame Full Imported OSM Dataset"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>FRAME CITY</span>
          </button>

          <button
            onClick={() => onCameraSignal('overview')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Grand Aerial Oblique City Overview"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">OVERVIEW</span>
          </button>

          <button
            onClick={() => onCameraSignal('neighborhood')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Medium Zoom onto Central Neighborhood"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>NEIGHBORHOOD</span>
          </button>

          <button
            onClick={() => onCameraSignal('street')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Low Angle Street Perspective"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>STREET</span>
          </button>

          <button
            onClick={() => onCameraSignal('top')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Orthographic Top-Down Map View"
          >
            <Map className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">TOP MAP</span>
          </button>

          <button
            onClick={() => setIsReportOpen(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
            title="View Technical Architectural Report"
          >
            <FileText className="w-3.5 h-3.5 text-amber-300" />
            <span>REPORT</span>
          </button>
        </div>
      </div>

      {/* Bottom Left DEBUG PANEL (Mandated by Spec) */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl text-xs text-slate-200 min-w-[280px]">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 mb-2.5 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>DEBUG INFORMATION (map.osm)</span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Buildings loaded:</span>
              <strong className="text-amber-300 font-sans font-bold">{mapData.stats.buildingsCount}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Roads loaded:</span>
              <strong className="text-sky-300 font-sans font-bold">{mapData.stats.roadsCount}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Waterways loaded:</span>
              <strong className="text-blue-400 font-sans font-bold">{mapData.stats.waterwaysCount}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Green areas loaded:</span>
              <strong className="text-emerald-400 font-sans font-bold">{mapData.stats.greenAreasCount}</strong>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-1">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Dataset width:</span>
                <span className="text-slate-200 font-sans">~{mapData.stats.widthMeters} meters</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-400">Dataset height:</span>
                <span className="text-slate-200 font-sans">~{mapData.stats.heightMeters} meters</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px]">
              <div>
                <span className="text-slate-400">FPS:</span>{' '}
                <strong className={`font-sans ${renderStats.fps >= 45 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {renderStats.fps}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Draw Calls:</span>{' '}
                <strong className="text-indigo-300 font-sans">{renderStats.drawCalls}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Right Named Locations / Landmarks Quick Finder */}
      {mapData.landmarks.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden md:block">
          <div className="pointer-events-auto bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-3 shadow-2xl text-xs text-slate-300 max-w-[220px]">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-amber-400" /> Key Features
            </div>
            <div className="space-y-1 max-h-[110px] overflow-y-auto text-[11px] pr-1">
              {mapData.landmarks.slice(0, 6).map((lm) => (
                <div key={lm.id} className="truncate text-slate-200 hover:text-amber-300 transition-colors">
                  • {lm.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        mapData={mapData}
        renderStats={renderStats}
      />
    </>
  );
};
