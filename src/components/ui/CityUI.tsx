import type { LiveFeedState, LiveWeatherDTO, LiveAirQualityDTO, LiveListState, LiveTrainDTO, LiveTrafficDTO, LiveNewsDTO } from '../../interactions/liveFeed';
import React, { useEffect, useState } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction, SearchResult } from '../../types';
import { ReportModal } from './ReportModal';
import { CameraWidget } from './CameraWidget';
import { SearchUI } from '../features/SearchUI';
import { LayerControl, LayerState } from '../features/LayerControl';
import { InfoPanel } from '../features/InfoPanel';
import { AnalystPanel } from '../features/AnalystPanel';
import { LiveDataPanel } from '../features/LiveDataPanel';
import { Compass, Building2, FileText, Activity, Map, Navigation, MapPin, Grid, Globe, ShieldCheck, Sun, Moon, Tag, Palette, Maximize2, Eye, SlidersHorizontal, X } from 'lucide-react';
import { CameraController } from '../../city/cameraController';

interface CityUIProps {
  mapData: OSMMapData;
  cameraController: CameraController | null;
  renderStats: RenderStats;
  streamingStats?: CityStreamingStats;
  nightMode: boolean;
  showLabels: boolean;
  presentationMode: boolean;
  /**
   * Map-only: every panel is unmounted, not merely hidden, leaving the 3D view
   * and one restore chip. Distinct from presentation mode, which keeps branding,
   * search and layer controls and only drops developer surfaces.
   */
  mapOnly: boolean;
  layers: LayerState;
  selectedEntity: SelectedEntity | null;
  flights: SimulatedFlight[];
  onToggleNightMode: () => void;
  onToggleLabels: () => void;
  onTogglePresentationMode: () => void;
  onToggleMapOnly: () => void;
  skylineStyle?: 'warm' | 'clear' | 'cyberpunk';
  onCycleSkyline?: () => void;
  /** Freshness of the live aircraft feed. Never rendered as "live" unless status is ok. */
  flightFeed?: { status: 'ok' | 'stale' | 'unavailable'; provider: string; ageSeconds: number | null; reason?: string };
  weatherFeed?: LiveFeedState<LiveWeatherDTO>;
  airFeed?: LiveFeedState<LiveAirQualityDTO>;
  trainFeed?: LiveListState<LiveTrainDTO>;
  trafficFeed?: LiveListState<LiveTrafficDTO>;
  newsFeed?: LiveListState<LiveNewsDTO>;
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
  nightMode,
  showLabels,
  presentationMode,
  mapOnly,
  layers,
  selectedEntity,
  flights,
  onToggleNightMode,
  onToggleLabels,
  onTogglePresentationMode,
  onToggleMapOnly,
  skylineStyle,
  onCycleSkyline,
  flightFeed,
  weatherFeed,
  airFeed,
  trainFeed,
  trafficFeed,
  newsFeed,
  onCameraSignal,
  onReloadOSM,
  onToggleLayer,
  onSelectEntity,
  onExecuteAction,
}) => {
  const [isReportOpen, setIsReportOpen] = useState(false);

  /**
   * Compact layout. The two dashboard columns are 290 px and 310 px wide, so on
   * anything narrower than about 640 px they overlap each other and bury the map
   * they are annotating. Below the breakpoint the right column becomes a sheet
   * the user opens deliberately, and the developer surfaces drop out entirely.
   *
   * Keyed on width rather than on the device profile's `isTouch`: a tablet in
   * landscape has plenty of room for both columns, and a narrow desktop window
   * has the same problem a phone does.
   */
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  // Tapping a building on a phone must show its inspector, but the inspector
  // lives in the sheet — so the selection has to open it.
  useEffect(() => {
    if (compact && selectedEntity) setSheetOpen(true);
  }, [compact, selectedEntity]);

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

  // Map-only returns before any panel is constructed. Hiding them with CSS
  // would keep their subscriptions and re-renders alive, which is the opposite
  // of what "just the map" is for on a phone.
  if (mapOnly) {
    return (
      <div className="absolute bottom-4 right-4 z-30 pointer-events-auto">
        <button
          onClick={onToggleMapOnly}
          className="w-11 h-11 rounded-full bg-slate-900/55 hover:bg-slate-900/85 backdrop-blur-md border border-white/10 text-slate-200 flex items-center justify-center shadow-2xl transition-all"
          title="Show panels (Esc)"
          aria-label="Show panels"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Presentation Mode keeps branding, search, scale controls and layers.
          Only developer surfaces (AI analyst, diagnostics, debug toggles) are hidden. */}
      <>

          {/* Left Column Dashboard Stack (Branding + Search + AI Analyst) */}
          <div className={`absolute top-3 left-3 z-20 overflow-y-auto no-scrollbar pointer-events-none flex flex-col gap-2.5 ${compact ? "right-3 w-auto max-h-[40vh]" : "w-[290px] max-h-[calc(100vh-1.5rem)]"}`}>
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
                DYNAMIC LOD
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

        {/* Ask Lucknow Lens AI Panel — hidden while presenting, and on compact
            layouts where it would occupy most of the screen. */}
        {!presentationMode && !compact && (
          <div className="pointer-events-auto">
            <AnalystPanel onExecuteAction={onExecuteAction} />
          </div>
        )}
      </div>

      {/* Right Column Dashboard Stack (Toggles + Layers + Inspector Card) */}
      <div className={`absolute z-20 overflow-y-auto no-scrollbar pointer-events-none flex flex-col gap-2.5 items-end ${
          compact
            ? `left-3 right-3 bottom-16 max-h-[62vh] ${sheetOpen ? "" : "hidden"}`
            : "top-3 right-3 w-[310px] max-h-[calc(100vh-1.5rem)]"
        }`}>
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
            onClick={onToggleMapOnly}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-slate-700"
            title="Hide all panels and show only the map"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>MAP ONLY</span>
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
          {!presentationMode && (
          <button
            onClick={() => setIsReportOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700/60 flex items-center gap-1.5"
            title="Open City Analytics Report"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>REPORT</span>
          </button>
          )}

          {/* Skyline look: warm white / clear white / cyberpunk */}
          <button
            onClick={onCycleSkyline}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border ${
              skylineStyle === 'cyberpunk'
                ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-lg shadow-fuchsia-600/30'
                : skylineStyle === 'clear'
                  ? 'bg-sky-100 text-slate-900 border-sky-200'
                  : 'bg-amber-500 text-slate-950 border-amber-400'
            }`}
            title="Cycle skyline look"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{skylineStyle === 'cyberpunk' ? 'CYBER' : skylineStyle === 'clear' ? 'CLEAR' : 'WARM'}</span>
          </button>

          {/* Presentation Mode Toggle Button */}
          {!presentationMode && (
          <button
            onClick={onTogglePresentationMode}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
            title="Enter Cinematic Presentation Mode"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>PRESENT</span>
          </button>
          )}
        </div>

        {/* Live feed status. Rule: stale data is never presented as real-time. */}
        {flightFeed && layers.live.flights && (
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-xl px-3 py-1.5 text-[11px] shadow-2xl">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                flightFeed.status === 'ok'
                  ? 'bg-emerald-400'
                  : flightFeed.status === 'stale'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
              }`}
            />
            <span className="font-bold uppercase tracking-wide text-slate-300">
              {flightFeed.status === 'ok' ? 'Live' : flightFeed.status === 'stale' ? 'Stale' : 'Unavailable'}
            </span>
            <span className="text-slate-500">
              {flightFeed.status === 'unavailable'
                ? (flightFeed.reason ?? 'No provider')
                : `${flights.length} aircraft · ${flightFeed.ageSeconds ?? '?'}s ago · ${flightFeed.provider}`}
            </span>
          </div>
        )}

        {/* Live weather. Real observation from Open-Meteo, or an explicit
            statement that it is not available — never a plausible stand-in. */}
        {weatherFeed && layers.live.weather && (
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-xl px-3 py-1.5 text-[11px] shadow-2xl">
            <span className={`w-1.5 h-1.5 rounded-full ${
              weatherFeed.status === 'ok' ? 'bg-emerald-400'
                : weatherFeed.status === 'stale' ? 'bg-amber-400' : 'bg-rose-500'}`} />
            {weatherFeed.value ? (
              <>
                <span className="font-bold text-slate-100">
                  {weatherFeed.value.temperatureC.toFixed(1)}&deg;C
                </span>
                <span className="text-slate-400">{weatherFeed.value.description}</span>
                <span className="text-slate-500">
                  feels {weatherFeed.value.apparentTemperatureC?.toFixed(1) ?? '?'}&deg; &middot;{' '}
                  {weatherFeed.value.humidityPct ?? '?'}% RH &middot;{' '}
                  {weatherFeed.value.windSpeedKph?.toFixed(0) ?? '?'} km/h
                </span>
              </>
            ) : (
              <span className="text-slate-500">
                Weather unavailable{weatherFeed.reason ? ` · ${weatherFeed.reason}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Live air quality. The category label is derived from the same index
            that is displayed, so the number and the words cannot disagree. */}
        {airFeed && layers.live.aqi && (
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-xl px-3 py-1.5 text-[11px] shadow-2xl">
            <span className={`w-1.5 h-1.5 rounded-full ${
              airFeed.status === 'ok' ? 'bg-emerald-400'
                : airFeed.status === 'stale' ? 'bg-amber-400' : 'bg-rose-500'}`} />
            {airFeed.value ? (
              <>
                <span className="font-bold text-slate-100">AQI {airFeed.value.usAqi}</span>
                <span className={
                  airFeed.value.usAqi <= 50 ? 'text-emerald-400'
                    : airFeed.value.usAqi <= 100 ? 'text-yellow-400'
                    : airFeed.value.usAqi <= 150 ? 'text-orange-400'
                    : airFeed.value.usAqi <= 200 ? 'text-rose-400' : 'text-fuchsia-400'
                }>{airFeed.value.category}</span>
                <span className="text-slate-500">
                  {airFeed.value.dominantPollutant} &middot; PM2.5 {airFeed.value.pm25?.toFixed(0) ?? '?'}
                  &micro;g/m&sup3;
                </span>
              </>
            ) : (
              <span className="text-slate-500">
                Air quality unavailable{airFeed.reason ? ` · ${airFeed.reason}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Layers control manager widget */}
        <div className="pointer-events-auto w-full">
          <LayerControl layers={layers} onToggleLayer={onToggleLayer} />
        </div>

        {/* Detailed live-data popup: full contents behind each enabled live layer. */}
        <div className="pointer-events-auto w-full">
          <LiveDataPanel
            layers={layers.live}
            weatherFeed={weatherFeed}
            airFeed={airFeed}
            flightFeed={flightFeed}
            flights={flights}
            trainFeed={trainFeed}
            trafficFeed={trafficFeed}
            newsFeed={newsFeed}
          />
        </div>

        {/* Selected entity inspector info panel card */}
        {selectedEntity && (
          <div className="pointer-events-auto w-full">
            <InfoPanel entity={selectedEntity} onClose={() => onSelectEntity(null)} />
          </div>
        )}
      </div>

      </>

      {/* Floating Presentation Mode Exit Button */}
      {presentationMode && (
        <div className="absolute bottom-6 right-6 z-30">
          <button
            onClick={onTogglePresentationMode}
            className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-xl border border-white/10 text-white text-xs font-bold rounded-xl transition-all shadow-2xl flex items-center gap-2 group"
          >
            <span>Exit Presentation</span>
            <kbd className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded group-hover:bg-slate-700">ESC</kbd>
          </button>
        </div>
      )}

      {/* Camera Controls Widget — the compass/tilt dial is a fine-pointer control
          and duplicates gestures the touch camera already handles. */}
      {!compact && <CameraWidget controller={cameraController} />}

      {/* Compact layout: the right column is a sheet, so it needs a handle. */}
      {compact && !presentationMode && (
        <div className="absolute bottom-4 right-4 z-30 pointer-events-auto flex flex-col gap-2">
          <button
            onClick={onToggleMapOnly}
            className="w-11 h-11 rounded-full bg-slate-900/60 hover:bg-slate-900/85 backdrop-blur-md border border-white/10 text-slate-200 flex items-center justify-center shadow-2xl"
            title="Map only"
            aria-label="Map only"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSheetOpen((v) => !v)}
            className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center shadow-2xl transition-all ${
              sheetOpen
                ? 'bg-amber-500 border-amber-400 text-slate-950'
                : 'bg-slate-900/60 hover:bg-slate-900/85 border-white/10 text-slate-200'
            }`}
            title={sheetOpen ? 'Hide controls' : 'Show controls'}
            aria-label={sheetOpen ? 'Hide controls' : 'Show controls'}
            aria-expanded={sheetOpen}
          >
            {sheetOpen ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
          </button>
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
