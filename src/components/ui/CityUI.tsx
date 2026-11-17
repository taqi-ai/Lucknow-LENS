import type { LiveFeedState, LiveWeatherDTO, LiveAirQualityDTO, LiveListState, LiveTrainDTO, LiveTrafficDTO, LiveNewsDTO } from '../../interactions/liveFeed';
import React, { useEffect, useState } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction, SearchResult } from '../../types';
import { ReportModal } from './ReportModal';
import { CameraWidget } from './CameraWidget';
import { SearchUI } from '../features/SearchUI';
import type { LayerState } from '../features/LayerControl';
import { MapControls } from './MapControls';
import { DayNightToggle } from './DayNight';
import { runDayNight } from '../../landing/dayNightTransition';
import type { ThemeId } from './themes';
import type { LabelSettings } from '../../city/labelManager';
import { InfoPanel } from '../features/InfoPanel';
import { LiveDataPanel } from '../features/LiveDataPanel';
import { NavigationHUD } from '../features/NavigationHUD';
import { TerralytMark } from './TerralytMark';
import type { NavigationRoute, NavigatorState, GPSTheme, RouteWaypoint } from '../../navigation/types';
import { Eye, Search as SearchIcon, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { CameraController } from '../../city/cameraController';

interface CityUIProps {
  mapData: OSMMapData;
  cameraController: CameraController | null;
  renderStats: RenderStats;
  streamingStats?: CityStreamingStats;
  showLabels: boolean;
  labelSettings: LabelSettings;
  onLabelSettings: (s: LabelSettings) => void;
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  night: boolean;
  onNight: (n: boolean) => void;
  windowView: boolean;
  onWindowView: (v: boolean) => void;
  presentationMode: boolean;
  mapOnly: boolean;
  layers: LayerState;
  selectedEntity: SelectedEntity | null;
  flights: SimulatedFlight[];
  onToggleLabels: () => void;
  onTogglePresentationMode: () => void;
  onToggleMapOnly: () => void;
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

  // Navigation system props
  navigationRoute?: NavigationRoute | null;
  navigatorState?: NavigatorState | null;
  gpsTheme?: GPSTheme;
  followCamera?: boolean;
  onToggleDrive?: () => void;
  onToggleFollowCamera?: () => void;
  onChangeSpeed?: (kmH: number) => void;
  onChangeTheme?: (theme: GPSTheme) => void;
  onClearRoute?: () => void;
  onSetDestinationWaypoint?: (dest: RouteWaypoint) => void;
}

const QUICK = [
  { id: 'husainabad', label: 'Bara Imambara' }, { id: 'rumi_darwaza', label: 'Rumi Darwaza' }, { id: 'hazratganj', label: 'Hazratganj' },
  { id: 'charbagh', label: 'Charbagh' }, { id: 'ambedkar_park', label: 'Ambedkar Park' }, { id: 'janeshwar_park', label: 'Janeshwar' },
  { id: 'ekana', label: 'Ekana' }, { id: 'vidhan_sabha', label: 'Vidhan Sabha' }, { id: 'ccs_airport', label: 'Airport' },
];

export const CityUI: React.FC<CityUIProps> = ({
  mapData,
  cameraController,
  renderStats,
  streamingStats,
  showLabels,
  labelSettings,
  onLabelSettings,
  theme,
  onTheme,
  night,
  onNight,
  windowView,
  onWindowView,
  presentationMode,
  mapOnly,
  layers,
  selectedEntity,
  flights,
  onToggleLabels,
  onTogglePresentationMode,
  onToggleMapOnly,
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
  navigationRoute = null,
  navigatorState = null,
  gpsTheme = 'cyan',
  followCamera = true,
  onToggleDrive,
  onToggleFollowCamera,
  onChangeSpeed,
  onChangeTheme,
  onClearRoute,
  onSetDestinationWaypoint,
}) => {
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Panels start minimised (icons only). Expanding is one click and is remembered.
  const [minimal, setMinimal] = useState<boolean>(() => { try { return localStorage.getItem('terralyt.map.ui.expanded') !== '1'; } catch { return true; } });
  const toggleMinimal = () => setMinimal((m) => { try { localStorage.setItem('terralyt.map.ui.expanded', m ? '1' : '0'); } catch { /* storage blocked */ } return !m; });
  const [searchOpen, setSearchOpen] = useState(false);
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  );
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const handleSearchResultClick = (result: SearchResult) => {
    if (result.presetId) onCameraSignal(result.presetId as CameraPreset);
    if (cameraController) {
      if (!result.presetId) cameraController.flyTo(result.latitude, result.longitude, 350);
      onSelectEntity({
        type: result.category === 'Road' ? 'poi' : (result.category === 'Building' ? 'building' : 'poi'),
        id: result.id,
        name: result.name,
        details: result,
        latitude: result.latitude,
        longitude: result.longitude,
        x: result.x,
        z: result.z,
      });
    }
  };

  if (mapOnly) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center">
        <button
          onClick={onToggleMapOnly}
          className="map-only-pill pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/15 bg-[#0c161d]/80 py-2.5 pl-4 pr-2.5 text-[13px] font-semibold text-[#eae9df] shadow-[0_14px_40px_-12px_rgba(0,0,0,.7)] backdrop-blur-xl hover:bg-[#0c161d]"
        >
          <Eye className="h-4 w-4 text-[#e0a55a]" /> Show controls
          {!compact && <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/70">M</kbd>}
        </button>
      </div>
    );
  }

  return (
    <>
      {navigationRoute && (
        <NavigationHUD
          route={navigationRoute}
          state={navigatorState}
          theme={gpsTheme}
          followCamera={followCamera}
          onToggleDrive={onToggleDrive ?? (() => {})}
          onToggleFollowCamera={onToggleFollowCamera ?? (() => {})}
          onChangeSpeed={onChangeSpeed ?? (() => {})}
          onChangeTheme={onChangeTheme ?? (() => {})}
          onClearRoute={onClearRoute ?? (() => {})}
        />
      )}

      {/* Left: where am I, and find something. Minimised: two icons. */}
      {minimal ? (
        <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
          <button onClick={toggleMinimal} title="Show panels" aria-label="Show panels" className="glass-panel grid h-11 w-11 place-items-center rounded-full text-paper/80 hover:text-paper">
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
          <button onClick={() => setSearchOpen((v) => !v)} title="Search" aria-label="Search" aria-expanded={searchOpen} className={`glass-panel grid h-11 w-11 place-items-center rounded-full transition-colors ${searchOpen ? 'text-sand' : 'text-paper/80 hover:text-paper'}`}>
            <SearchIcon className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
          <button onClick={() => window.dispatchEvent(new Event('lens:start-tour'))} title="Guided tour of Lucknow" aria-label="Guided tour of Lucknow"
            className="flex h-11 items-center gap-2 self-start rounded-full bg-[#e0a55a] px-4 text-[13px] font-semibold text-[#2a1a10] shadow-[0_8px_22px_-8px_rgba(224,165,90,.8)] transition-transform hover:scale-105 active:scale-95">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
            <span>Guided tour</span>
          </button>
          {/* Quick fly-to chips: one tap flies to a highlight. */}
          <div className="pointer-events-auto flex max-w-[300px] gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="list" aria-label="Quick fly to">
            {QUICK.map((q) => (
              <button key={q.id} role="listitem" onClick={() => onCameraSignal(`dest:${q.id}` as CameraPreset)}
                className="glass-panel flex-shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-paper/85 hover:text-paper">{q.label}</button>
            ))}
          </div>
          {searchOpen && (
            <div className={`${compact ? 'w-[calc(100vw-5.5rem)]' : 'w-[300px]'} -mt-[52px] ml-[52px]`}>
              <SearchUI mapData={mapData} onSelectResult={(r) => { handleSearchResultClick(r); setSearchOpen(false); }} onSetDestinationWaypoint={onSetDestinationWaypoint} />
            </div>
          )}
          {selectedEntity && (
            <div className={`${compact ? 'w-[calc(100vw-1.5rem)]' : 'w-[300px]'} max-h-[60vh] overflow-y-auto no-scrollbar`}>
              <InfoPanel entity={selectedEntity} onClose={() => onSelectEntity(null)} onSetDestinationWaypoint={onSetDestinationWaypoint} />
            </div>
          )}
        </div>
      ) : (
      <div className={`absolute left-3 top-3 z-20 pointer-events-none flex flex-col gap-2.5 overflow-y-auto no-scrollbar ${compact ? 'right-[68px] max-h-[55vh]' : 'w-[300px] max-h-[calc(100vh-1.5rem)]'}`}>
        <div className="pointer-events-auto glass-panel flex items-center gap-3 rounded-2xl px-3.5 py-2.5">
          <TerralytMark className="h-9 w-9 flex-shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[1.15rem] leading-none text-paper">Lucknow Lens <span className="font-deva text-[0.9rem] text-sand">लखनऊ</span></h1>
            <p className="mt-1 text-[11px] text-paper/45">{mapData.bounds.centerLat.toFixed(3)}° N, {mapData.bounds.centerLon.toFixed(3)}° E</p>
          </div>
          <button onClick={toggleMinimal} title="Minimise panels" aria-label="Minimise panels" className="grid h-8 w-8 place-items-center rounded-full text-paper/60 hover:bg-white/10 hover:text-paper">
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
        <div className="pointer-events-auto">
          <SearchUI mapData={mapData} onSelectResult={handleSearchResultClick} onSetDestinationWaypoint={onSetDestinationWaypoint} />
        </div>
        <div className="pointer-events-auto">
          <button onClick={() => window.dispatchEvent(new Event('lens:start-tour'))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e0a55a] px-4 py-2.5 text-[13.5px] font-semibold text-[#2a1a10] shadow-[0_10px_28px_-10px_rgba(224,165,90,.8)] transition-transform hover:scale-[1.015] active:scale-[0.98]">
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
            Guided tour of Lucknow
          </button>
        </div>
        {/* Quick fly-to chips: one tap flies to a highlight. */}
          <div className="pointer-events-auto flex max-w-[300px] gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="list" aria-label="Quick fly to">
            {QUICK.map((q) => (
              <button key={q.id} role="listitem" onClick={() => onCameraSignal(`dest:${q.id}` as CameraPreset)}
                className="glass-panel flex-shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-paper/85 hover:text-paper">{q.label}</button>
            ))}
          </div>
        {selectedEntity && (
          <div className="pointer-events-auto">
            <InfoPanel entity={selectedEntity} onClose={() => onSelectEntity(null)} onSetDestinationWaypoint={onSetDestinationWaypoint} />
          </div>
        )}
      </div>
      )}

      {/* Bottom-left: only the live feeds you switched on */}
      <div className={`absolute z-20 pointer-events-none flex flex-col gap-1.5 ${compact ? 'bottom-[88px] left-3' : 'bottom-3 left-3'}`}>
        {flightFeed && layers.live.flights && (
          <Chip status={flightFeed.status}>
            {flightFeed.status === 'unavailable' ? (flightFeed.reason ?? 'Aircraft unavailable') : `${flights.length} aircraft · ${flightFeed.ageSeconds ?? '?'}s ago`}
          </Chip>
        )}
        {weatherFeed && layers.live.weather && (
          <Chip status={weatherFeed.status}>
            {weatherFeed.value ? `${weatherFeed.value.temperatureC.toFixed(0)}°C · ${weatherFeed.value.description} · ${weatherFeed.value.humidityPct ?? '?'}% humidity` : 'Weather unavailable'}
          </Chip>
        )}
        {airFeed && layers.live.aqi && (
          <Chip status={airFeed.status}>
            {airFeed.value ? `AQI ${airFeed.value.usAqi} · ${airFeed.value.category}` : 'Air quality unavailable'}
          </Chip>
        )}
      </div>

      {!presentationMode && (
        <div className={`absolute z-30 ${compact ? 'right-3 top-[64px]' : 'right-3 top-3'}`}><DayNightToggle night={night} onChange={(n, origin) => runDayNight(() => onNight(n), origin)} compact={compact} /></div>
      )}
      {!presentationMode && (
        <MapControls
          compact={compact}
          layers={layers}
          onToggleLayer={onToggleLayer}
          showLabels={showLabels}
          onToggleLabels={onToggleLabels}
          labelSettings={labelSettings}
          onLabelSettings={onLabelSettings}
          theme={theme}
          onTheme={onTheme}
          night={night}
          cameraPanel={<CameraWidget controller={cameraController} embedded />}
          windowView={windowView}
          onWindowView={onWindowView}
          onCameraSignal={onCameraSignal}
          onExecuteAction={onExecuteAction}
          onReport={() => setIsReportOpen(true)}
          onPresent={onTogglePresentationMode}
          onMapOnly={onToggleMapOnly}
          liveDetails={
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
          }
        />
      )}

      {presentationMode && (
        <div className="absolute bottom-6 right-6 z-30">
          <button onClick={onTogglePresentationMode} className="group flex items-center gap-2 rounded-xl border border-white/10 bg-cabin/80 px-4 py-2.5 text-xs font-bold text-paper shadow-2xl backdrop-blur-xl hover:bg-cabin">
            <span>Exit presentation</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-paper/70">ESC</kbd>
          </button>
        </div>
      )}


      <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} mapData={mapData} renderStats={renderStats} />
    </>
  );
};

const Chip: React.FC<{ status: 'ok' | 'stale' | 'unavailable'; children: React.ReactNode }> = ({ status, children }) => (
  <div className="glass-panel flex w-fit max-w-[70vw] items-center gap-2 truncate rounded-full px-3 py-1.5 text-[11.5px] text-paper/80">
    <span className={`h-1.5 w-1.5 rounded-full ${status === 'ok' ? 'bg-amber-300' : status === 'stale' ? 'bg-amber-400' : 'bg-rose-500'}`} />
    {children}
  </div>
);
