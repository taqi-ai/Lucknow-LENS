import React, { useState } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction, SearchResult } from '../../types';
import { ReportModal } from './ReportModal';
import { CameraWidget } from './CameraWidget';
import { SearchUI } from '../features/SearchUI';
import { LayerControl, LayerState } from '../features/LayerControl';
import { InfoPanel } from '../features/InfoPanel';
import { AnalystPanel } from '../features/AnalystPanel';
import { Compass, Building2, FileText, Activity, Map, Navigation, MapPin, Grid, Globe, ShieldCheck, Sun, Moon, Tag } from 'lucide-react';
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
  layers: LayerState;
  selectedEntity: SelectedEntity | null;
  flights: SimulatedFlight[];
  onToggleDebugTiles: () => void;
  onToggleStableMode: () => void;
  onToggleNightMode: () => void;
  onToggleLabels: () => void;
  onCameraSignal: (signal: CameraPreset) => void;
  onReloadOSM: () => void;
  onToggleLayer: (category: 'base' | 'live', layer: string) => void;
  onSelectEntity: (entity: SelectedEntity | null) => void;
  onExecuteAction: (action: AIAction) => void;
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
  layers,
  selectedEntity,
  flights,
  onToggleDebugTiles,
  onToggleStableMode,
  onToggleNightMode,
  onToggleLabels,
  onCameraSignal,
  onReloadOSM,
  onToggleLayer,
  onSelectEntity,
  onExecuteAction,
}) => {
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleSearchResultClick = (result: SearchResult) => {
    if (cameraController) {
      cameraController.flyTo(result.latitude, result.longitude, 350);
      onSelectEntity({
        type: result.category === 'Road' ? 'poi' : (result.category === 'Building' ? 'building' : 'poi'),
        id: result.id,
        name: result.name,
        details: result,
        latitude: result.latitude,
        longitude: result.longitude,
        x: result.x,
        z: result.z
      });
    }
  };

  return (
    <>
      {/* Left Column Dashboard Stack (Branding + Search + AI Analyst) */}
      <div className="absolute top-4 left-4 z-20 w-[330px] pointer-events-none flex flex-col gap-3">
        {/* Branding header badge */}
        <div className="pointer-events-auto glass-panel rounded-2xl p-3.5 flex items-center gap-4 transition-all hover:bg-slate-900/80">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-300 flex items-center justify-center text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <Building2 className="w-5 h-5 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-sm font-display font-extrabold text-white tracking-wide">
                LUCKNOW LENS
              </h1>
              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                {stableMode ? 'STABLE MODE' : 'DYNAMIC LOD'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium tracking-wide">
              Lat {mapData.bounds.centerLat.toFixed(4)}° • Lon {mapData.bounds.centerLon.toFixed(4)}°
            </p>
          </div>
        </div>

        {/* Search bar autocomplete input widget */}
        <div className="pointer-events-auto">
          <SearchUI mapData={mapData} onSelectResult={handleSearchResultClick} />
        </div>

        {/* Ask Lucknow Lens AI Panel */}
        <div className="pointer-events-auto">
          <AnalystPanel onExecuteAction={onExecuteAction} />
        </div>
      </div>

      {/* Right Column Dashboard Stack (Toggles + Layers + Inspector Card) */}
      <div className="absolute top-4 right-4 z-20 w-[350px] pointer-events-none flex flex-col gap-3 items-end">
        {/* Preset Modes / Preset Camera Signals */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-1.5 shadow-2xl justify-end">
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
            <span>[STABLE]</span>
          </button>

          <button
            onClick={() => onCameraSignal('fullcity')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
            title="Frame Complete Lucknow Dataset Bounding Box"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>[ FULL ]</span>
          </button>

          <button
            id="btn-toggle-labels"
            onClick={onToggleLabels}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border ${
              showLabels
                ? 'bg-violet-500 text-white border-violet-400 shadow-lg shadow-violet-500/20'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
            title="Toggle Geographic Labels"
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
            title="Toggle Spatial Grid Tiles"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>GRID</span>
          </button>

          <button
            onClick={() => onCameraSignal('overview')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="District Overview Perspective"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>DISTRICT</span>
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
            <span>TOP MAP</span>
          </button>

          {/* New Report Modal trigger button */}
          <button
            onClick={() => setIsReportOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Open City Analytics Report"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>REPORT</span>
          </button>
        </div>

        {/* Layers control manager widget */}
        <div className="pointer-events-auto w-full">
          <LayerControl layers={layers} onToggleLayer={onToggleLayer} />
        </div>

        {/* Selected entity inspector info panel card */}
        {selectedEntity && (
          <div className="pointer-events-auto w-full">
            <InfoPanel entity={selectedEntity} onClose={() => onSelectEntity(null)} />
          </div>
        )}
      </div>

      {/* Bottom Left STREAMING ENGINE STATS PANEL */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="pointer-events-auto glass-panel rounded-2xl p-5 text-xs text-slate-200 min-w-[320px] transition-all hover:bg-slate-900/80">
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

          {/* Boundary Debug Info — only shown when DEBUG TILES is active */}
          {debugTiles && streamingStats?.boundaryDebug && (
            <div className="mt-3 pt-2.5 border-t border-cyan-500/30">
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-cyan-400 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>BOUNDARY DEBUG</span>
              </div>
              <div className="space-y-1 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Camera X/Z:</span>
                  <span className="text-cyan-300">
                    {Math.round(streamingStats.boundaryDebug.camX)}, {Math.round(streamingStats.boundaryDebug.camZ)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dist to Edge:</span>
                  <span className={streamingStats.boundaryDebug.distToEdge < 2000 ? 'text-amber-400' : 'text-emerald-300'}>
                    {Math.round(streamingStats.boundaryDebug.distToEdge)}m
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Inside Playable:</span>
                  <span className={streamingStats.boundaryDebug.insidePlayable ? 'text-emerald-400' : 'text-rose-400'}>
                    {streamingStats.boundaryDebug.insidePlayable ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Horizon Active:</span>
                  <span className={streamingStats.boundaryDebug.horizonActive ? 'text-emerald-400' : 'text-slate-500'}>
                    {streamingStats.boundaryDebug.horizonActive ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
            </div>
          )}
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
