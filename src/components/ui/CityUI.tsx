import React, { useState } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats } from '../../types';
import { ReportModal } from './ReportModal';
import { CameraWidget } from './CameraWidget';
import { Compass, Building2, FileText, Activity, Map, Navigation, Maximize2, MapPin, Grid, Globe, ShieldCheck, Sun, Moon, Tag } from 'lucide-react';
import { CameraController } from '../../city/cameraController';

interface CityUIProps {
  mapData: OSMMapData;
  cameraController: CameraController | null;
  renderStats: RenderStats;
  streamingStats?: CityStreamingStats;
  debugTiles: boolean;
  stableMode: boolean;
  nightMode: boolean;
  showLabels: boolean;
  onToggleDebugTiles: () => void;
  onToggleStableMode: () => void;
  onToggleNightMode: () => void;
  onToggleLabels: () => void;
  onCameraSignal: (signal: CameraPreset) => void;
  onReloadOSM: () => void;
}

export const CityUI: React.FC<CityUIProps> = ({
  mapData,
  cameraController,
  renderStats,
  streamingStats,
  debugTiles,
  stableMode,
  nightMode,
  showLabels,
  onToggleDebugTiles,
  onToggleStableMode,
  onToggleNightMode,
  onToggleLabels,
  onCameraSignal,
  onReloadOSM,
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
                LUCKNOW CITY DIGITAL TWIN
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                {stableMode ? 'STABLE CITY MODE' : 'DYNAMIC LOD'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Lucknow Bounds • Lat {mapData.bounds.centerLat.toFixed(4)}°, Lon {mapData.bounds.centerLon.toFixed(4)}°
            </p>
          </div>
        </div>
      </div>

      {/* Top Right Controls & Camera View Presets */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none flex flex-wrap items-center gap-2 justify-end">
        <div className="pointer-events-auto flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-1.5 shadow-2xl">
          <button
            onClick={onToggleNightMode}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 border ${
              nightMode
                ? 'bg-indigo-600 text-amber-300 border-indigo-500 shadow-lg shadow-indigo-600/30'
                : 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/30'
            }`}
            title="Toggle Day / Night Mode Atmosphere"
          >
            {nightMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-slate-950" />}
            <span>{nightMode ? 'NIGHT' : 'DAY'}</span>
          </button>

          <button
            onClick={onToggleStableMode}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 border ${
              stableMode
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
            title="Toggle Stable Mode (Zero-Flicker Consistent Representation)"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>[STABLE CITY MODE]</span>
          </button>

          <button
            onClick={() => onCameraSignal('fullcity')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
            title="Frame Complete Lucknow Dataset Bounding Box"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>[ FULL CITY ]</span>
          </button>

          <button
            id="btn-toggle-labels"
            onClick={onToggleLabels}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border ${
              showLabels
                ? 'bg-violet-500 text-white border-violet-400 shadow-lg shadow-violet-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
            title="Toggle Geographic Labels (POIs & Road Names)"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>LABELS</span>
          </button>

          <button
            onClick={onToggleDebugTiles}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border ${
              debugTiles
                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-lg shadow-sky-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
            title="Toggle Spatial 500m Grid Tile Boundaries & IDs"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>DEBUG TILES</span>
          </button>

          <button
            onClick={() => onCameraSignal('overview')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="District Overview Perspective"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">DISTRICT</span>
          </button>

          <button
            onClick={() => onCameraSignal('neighborhood')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Neighborhood Level Perspective"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400" />
            <span>NEIGHBORHOOD</span>
          </button>

          <button
            onClick={() => onCameraSignal('street')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Low Angle Street Level"
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
        </div>
      </div>

      {/* Bottom Left STREAMING ENGINE STATS PANEL */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl text-xs text-slate-200 min-w-[320px]">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 mb-2.5 flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>STABILITY ENGINE METRICS</span>
            </div>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">
              {stableMode ? 'STABLE MODE' : 'DYNAMIC LOD'}
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Zoom Level:</span>
              <strong className="text-amber-300 font-sans font-bold">{streamingStats?.zoomScaleName ?? 'FULL CITY'}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Active LOD:</span>
              <strong className="text-emerald-400 font-sans font-bold">LOD {streamingStats?.currentLOD ?? 2}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Loaded Tiles:</span>
              <strong className="text-sky-300 font-sans font-bold">{streamingStats?.loadedTiles ?? 0} active</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Visible Tiles:</span>
              <strong className="text-indigo-300 font-sans font-bold">{streamingStats?.visibleTiles ?? 0} tiles</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Pending Tile Loads:</span>
              <strong className="text-amber-400 font-sans font-bold">{streamingStats?.pendingLoads ?? 0}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Buildings Rendered:</span>
              <strong className="text-slate-200 font-sans font-bold">{(streamingStats?.totalBuildings ?? 0).toLocaleString()}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Trees Rendered:</span>
              <strong className="text-emerald-300 font-sans font-bold">{(streamingStats?.totalTrees ?? 0).toLocaleString()}</strong>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[10px]">
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



      {/* Camera Controls Widget */}
      <CameraWidget controller={cameraController} />

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

