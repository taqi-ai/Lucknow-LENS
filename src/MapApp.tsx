import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction } from './types';
import { CityViewport } from './components/3d/CityViewport';
import { CityUI } from './components/ui/CityUI';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { parseOvertureGeoJSON } from './osm/overtureParser';
import { CameraController } from './city/cameraController';
import { TourGuide } from './components/features/TourGuide';
import { PinTool } from './components/features/PinTool';
import { LayerState } from './components/features/LayerControl';
import { useLiveFlights } from './interactions/flights';
import {
  useLiveFeed, useLiveList,
  type LiveWeatherDTO, type LiveAirQualityDTO,
  type LiveTrainDTO, type LiveTrafficDTO, type LiveNewsDTO,
} from './interactions/liveFeed';
import type { SkylineStyle } from './city/buildingMaterial';
import { DEFAULT_LABEL_SETTINGS, type LabelSettings } from './city/labelManager';
import { THEMES, themeById, type ThemeId } from './components/ui/themes';
import { project } from './geo/projection';
import { Pathfinder } from './navigation/pathfinder';
import { RouteDriver } from './navigation/routeDriver';
import type { NavigationRoute, NavigatorState, RouteWaypoint, GPSTheme } from './navigation/types';

const INITIAL_MAP_DATA: OSMMapData = {
  bounds: {
    minLat: 26.840,
    maxLat: 26.855,
    minLon: 80.935,
    maxLon: 80.955,
    centerLat: 26.8475,
    centerLon: 80.945,
    widthMeters: 2000,
    heightMeters: 1600,
  },
  buildings: [],
  roads: [],
  waterways: [],
  greenAreas: [],
  landmarks: [],
  stats: {
    buildingsCount: 0,
    roadsCount: 0,
    waterwaysCount: 0,
    greenAreasCount: 0,
    landmarksCount: 0,
    widthMeters: 2000,
    heightMeters: 1600,
  }
};

/** Soft glass over the map, so the city reads as if seen through an aircraft window. */
function WindowOverlay() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 48%, transparent 58%, rgba(10,18,26,.22) 84%, rgba(6,12,18,.5) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(240,201,160,.16) 0%, rgba(240,201,160,0) 34%)', mixBlendMode: 'soft-light' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(112deg, rgba(255,255,255,.13) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 66%, rgba(255,255,255,.06) 76%, rgba(255,255,255,0) 88%)' }} />
      <div className="grain absolute inset-0 overflow-hidden" />
    </div>
  );
}

export interface LoadProgress {
  /** 0..1, never goes backwards */
  value: number;
  stage: string;
  ready: boolean;
  error: string | null;
}

interface MapAppProps {
  /** Camera framing to glide to once the map is ready. */
  entryPreset?: CameraPreset;
  onProgress?: (p: LoadProgress) => void;
  onRetry?: () => void;
  /** The fly-in waits for this, so it plays after the visitor dives in rather than behind the loader. */
  released?: boolean;
}

type Prefs = { theme: ThemeId; night: boolean; showLabels: boolean; labelSettings: LabelSettings; windowView: boolean };
const PREFS_KEY = 'terralyt.map.prefs.v1';
function loadPrefs(): Prefs {
  const d: Prefs = { theme: 'warm', night: false, showLabels: true, labelSettings: DEFAULT_LABEL_SETTINGS, windowView: true };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as (Omit<Partial<Prefs>, 'theme'> & { theme?: string }) | null;
    if (!raw) return d;
    // v1 stored night as a theme; it is its own switch now.
    const legacyNight = raw.theme === 'night';
    return {
      theme: THEMES.some((t) => t.id === raw.theme) ? (raw.theme as ThemeId) : d.theme,
      night: typeof raw.night === 'boolean' ? raw.night : legacyNight,
      showLabels: typeof raw.showLabels === 'boolean' ? raw.showLabels : d.showLabels,
      labelSettings: { ...DEFAULT_LABEL_SETTINGS, ...(raw.labelSettings ?? {}) },
      windowView: typeof raw.windowView === 'boolean' ? raw.windowView : d.windowView,
    };
  } catch { return d; }
}
function savePrefs(p: Prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } }

export default function MapApp({ entryPreset = 'hero', onProgress, released = true }: MapAppProps) {
  const [mapData, setMapData] = useState<OSMMapData>(INITIAL_MAP_DATA);
  const [error, setError] = useState<string | null>(null);

  const [cameraController, setCameraController] = useState<CameraController | null>(null);

  const [cameraSignal, setCameraSignal] = useState<CameraPreset | 'reset' | null>(null);
  // Preferences survive reloads. Defaults: Natural warm, calm labels, window view on.
  const prefs = useRef(loadPrefs()).current;
  const [theme, setTheme] = useState<ThemeId>(prefs.theme);
  const [nightMode, setNightMode] = useState<boolean>(prefs.night);
  const skylineStyle = themeById(theme).style;
  const [showLabels, setShowLabels] = useState<boolean>(prefs.showLabels);
  const [labelSettings, setLabelSettings] = useState<LabelSettings>(prefs.labelSettings);
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [mapOnly, setMapOnly] = useState<boolean>(false);
  // Airplane-window treatment: vignette, glass glare and grain over the map. Cheap CSS, no extra GPU passes.
  const [windowView, setWindowView] = useState<boolean>(prefs.windowView);
  useEffect(() => { savePrefs({ theme, night: nightMode, showLabels, labelSettings, windowView }); }, [theme, nightMode, showLabels, labelSettings, windowView]);
  // DEV ONLY: lets scripts/visual_harness.mjs switch day/night through the real state path.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __LENS_setNight?: (n: boolean) => void }).__LENS_setNight = setNightMode;
  }, []);

  // GTA GPS Navigation State
  const pathfinderRef = useRef<Pathfinder>(new Pathfinder());
  const routeDriverRef = useRef<RouteDriver | null>(null);

  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const [navigatorState, setNavigatorState] = useState<NavigatorState | null>(null);
  const [destinationWaypoint, setDestinationWaypoint] = useState<RouteWaypoint | null>(null);
  const [gpsTheme, setGpsTheme] = useState<GPSTheme>('purple');
  const [followCamera, setFollowCamera] = useState<boolean>(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never steal a key from a text field
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === 'Escape') {
        if (mapOnly) setMapOnly(false);
        else if (presentationMode) setPresentationMode(false);
        else if (navigationRoute) {
          setNavigationRoute(null);
          setDestinationWaypoint(null);
          setNavigatorState(null);
          routeDriverRef.current?.stopDriving();
        }
        return;
      }
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setMapOnly((v) => !v);
      }
      if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setWindowView((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [presentationMode, mapOnly, navigationRoute]);

  // Layer toggler state
  const [layers, setLayers] = useState<LayerState>({
    base: {
      buildings: true,
      roads: true,
      parks: true,
      gomti: true,
      places: true,
    },
    live: {
      traffic: false,
      aqi: false,
      weather: false,
      flights: false,
      railways: false,
      cameras: false,
      news: false,
      emergency: false,
    }
  });

  // Selection states
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  // Live feeds
  const flightFeed = useLiveFlights(layers.live.flights);
  const flights = flightFeed.flights;

  const weatherFeed = useLiveFeed<LiveWeatherDTO>('/api/live/weather', layers.live.weather, 300_000);
  const airFeed = useLiveFeed<LiveAirQualityDTO>('/api/live/air', layers.live.aqi, 600_000);
  const trainFeed = useLiveList<LiveTrainDTO>('/api/live/trains', layers.live.railways, 20_000);
  const trafficFeed = useLiveList<LiveTrafficDTO>('/api/live/traffic', layers.live.traffic, 60_000);
  const newsFeed = useLiveList<LiveNewsDTO>('/api/live/news', layers.live.news, 900_000);

  const [renderStats, setRenderStats] = useState<RenderStats>({
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });

  const [streamingStats, setStreamingStats] = useState<CityStreamingStats | undefined>(undefined);

  const loadCityData = useCallback(async () => {
    setError(null);
    try {
      const data = await parseOvertureGeoJSON();
      setMapData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load Overture city data: ${message}`);
    }
  }, []);

  useEffect(() => { loadCityData(); }, [loadCityData]);

  // Real progress: data parsed, camera ready, then tiles actually streamed in.
  const [dataLoaded, setDataLoaded] = useState(false);
  const bestRef = useRef(0);
  const readyRef = useRef(false);
  const flyInPendingRef = useRef(false);
  const [flyInTick, setFlyInTick] = useState(0);
  // Through the cabin window the city should look like it does from a plane, not from space.
  const windowViewSetRef = useRef(false);
  useEffect(() => {
    if (cameraController && !released && !windowViewSetRef.current) { windowViewSetRef.current = true; setCameraSignal('window' as CameraPreset); }
  }, [cameraController, released]);
  const settleRef = useRef<number | null>(null);
  const t0Ref = useRef(performance.now());
  useEffect(() => {
    if (mapData.buildings.length > 0 || mapData.roads.length > 0 || mapData.stats.buildingsCount > 0) setDataLoaded(true);
  }, [mapData]);
  useEffect(() => {
    if (!onProgress || readyRef.current) return;
    const tilesLoaded = streamingStats?.loadedTiles ?? 0;
    const pending = streamingStats?.pendingLoads ?? 0;
    const tileFrac = tilesLoaded > 0 ? tilesLoaded / (tilesLoaded + pending) : 0;
    let value = 0.04 + (dataLoaded ? 0.4 : 0) + (cameraController ? 0.08 : 0) + 0.48 * tileFrac;
    let stage = !dataLoaded ? 'Reading streets and buildings' : !cameraController ? 'Preparing the camera' : tilesLoaded === 0 ? 'Raising the city' : 'Lighting the streets';
    const elapsed = performance.now() - t0Ref.current;
    const settled = dataLoaded && !!cameraController && tilesLoaded > 0 && pending === 0;
    if (settled) {
      if (settleRef.current === null) settleRef.current = window.setTimeout(() => {
        readyRef.current = true; bestRef.current = 1;
        onProgress({ value: 1, stage: 'Ready', ready: true, error: null });
        flyInPendingRef.current = true; setFlyInTick((n) => n + 1);
      }, 500);
    } else if (settleRef.current !== null) { window.clearTimeout(settleRef.current); settleRef.current = null; }
    // Safety valve: a slow network should never trap people on the loader.
    if (!settled && elapsed > 30000 && dataLoaded && tilesLoaded > 0) {
      readyRef.current = true; bestRef.current = 1;
      onProgress({ value: 1, stage: 'Ready', ready: true, error: null });
      flyInPendingRef.current = true; setFlyInTick((n) => n + 1);
      return;
    }
    bestRef.current = Math.max(bestRef.current, Math.min(value, 0.97));
    onProgress({ value: bestRef.current, stage, ready: false, error });
  }, [dataLoaded, cameraController, streamingStats, error, onProgress, entryPreset]);

  useEffect(() => {
    if (released && flyInPendingRef.current) {
      flyInPendingRef.current = false;
      setCameraSignal(entryPreset);
    }
  }, [released, flyInTick, entryPreset]);

  const handleCameraSignal = (signal: CameraPreset) => {
    setCameraSignal(signal);
    setTimeout(() => setCameraSignal(null), 300);
  };

  const handleUpdateStats = useCallback((stats: RenderStats, sStats?: CityStreamingStats) => {
    setRenderStats(stats);
    if (sStats) setStreamingStats(sStats);
  }, []);

  const handleToggleLayer = (category: 'base' | 'live', layer: string) => {
    setLayers((prev) => ({
      ...prev,
      [category]: { ...prev[category], [layer]: !(prev[category] as Record<string, boolean>)[layer] },
    }));
  };

  const handleToggleLabels = useCallback(() => setShowLabels((v) => !v), []);

  // GTA GPS Waypoint & Navigation Handlers
  const handleSetDestinationWaypoint = useCallback(async (dest: RouteWaypoint) => {
    setDestinationWaypoint(dest);

    let startX = -382;
    let startZ = 372;
    if (cameraController) {
      startX = cameraController.target.x;
      startZ = cameraController.target.z;
    }

    const startPoint: RouteWaypoint = {
      x: startX,
      z: startZ,
      name: 'Current Camera View',
    };

    const calculated = await pathfinderRef.current.calculateRoute(startPoint, dest);
    if (calculated) {
      setNavigationRoute(calculated);
    }
  }, [cameraController]);

  const handleClearRoute = useCallback(() => {
    setNavigationRoute(null);
    setDestinationWaypoint(null);
    setNavigatorState(null);
    routeDriverRef.current?.stopDriving();
  }, []);

  const handleToggleDrive = useCallback(() => {
    if (!routeDriverRef.current) return;
    if (navigatorState?.isDriving) {
      routeDriverRef.current.pauseDriving();
    } else {
      routeDriverRef.current.startDriving();
    }
  }, [navigatorState]);

  const handleToggleFollowCamera = useCallback(() => {
    setFollowCamera((prev) => !prev);
  }, []);

  const handleChangeSpeed = useCallback((kmH: number) => {
    routeDriverRef.current?.setSpeed(kmH);
  }, []);

  const handleChangeTheme = useCallback((theme: GPSTheme) => {
    setGpsTheme(theme);
  }, []);

  const handleRouteDriverReady = useCallback((driver: RouteDriver) => {
    routeDriverRef.current = driver;
    driver.onUpdate((state) => {
      setNavigatorState(state);
    });
  }, []);

  const handleExecuteAIAction = (action: AIAction) => {
    try {
      if (!action || typeof action !== 'object') return;

      const ALLOWED_LIVE_LAYERS = new Set<string>([
        'traffic',
        'aqi',
        'weather',
        'flights',
        'railways',
        'cameras',
        'news',
        'emergency',
      ]);

      const LAYER_NAMES: Record<string, string> = {
        traffic: 'Hazratganj Traffic Area',
        aqi: 'Gomti Nagar AQI Zone',
        flights: 'Amausi Flight Tracking Hub',
        railways: 'Charbagh Railways Area',
        news: 'Gomti News Zone',
        weather: 'Lucknow Weather Station',
        cameras: 'City Surveillance Network',
        emergency: 'Emergency Services Hub',
      };

      // Safely validate and apply layer toggles if specified
      if (action.layer && ALLOWED_LIVE_LAYERS.has(action.layer)) {
        const layerKey = action.layer as keyof LayerState['live'];
        const isEnable = action.type !== 'DISABLE_LAYER';
        setLayers((prev) => ({
          ...prev,
          live: {
            ...prev.live,
            [layerKey]: isEnable,
          },
        }));
      }

      if (action.type === 'FLY_TO') {
        const lat = action.latitude;
        const lon = action.longitude;

        // Reject invalid, non-numeric, or extreme out-of-bounds coordinates
        const isValidLat = typeof lat === 'number' && Number.isFinite(lat) && lat >= 26.0 && lat <= 27.5;
        const isValidLon = typeof lon === 'number' && Number.isFinite(lon) && lon >= 80.0 && lon <= 81.8;

        if (!isValidLat || !isValidLon) {
          console.warn('[AI Action] Rejected invalid or out-of-bounds coordinates:', { lat, lon });
          return;
        }

        if (cameraController) {
          cameraController.flyTo(lat!, lon!, 350);
        }

        // Dynamically project world coordinates rather than reading undefined hardcoded dictionaries
        const { x, z } = project(lat!, lon!);
        const selectedLayer = action.layer && ALLOWED_LIVE_LAYERS.has(action.layer) ? action.layer : 'news';
        const title = LAYER_NAMES[selectedLayer] || 'AI Focus Area';

        setSelectedEntity({
          type: 'poi',
          id: `ai-focus-${Date.now()}`,
          name: title,
          details: {
            category: 'AI Highlighted Area',
            description: `Identified by City Analyst query at (${lat!.toFixed(4)}, ${lon!.toFixed(4)}).`,
          },
          latitude: lat!,
          longitude: lon!,
          x,
          z,
        });
      }
    } catch (err) {
      console.error('[AI Action] Safely caught error during action execution:', err);
    }
  };

  if (error || !mapData) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-6 relative">
        <div className="glass-panel rounded-3xl p-10 flex flex-col items-center max-w-lg w-full border-rose-500/20">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/20 border border-rose-500/30 flex items-center justify-center mb-6 text-rose-400 shadow-lg shadow-rose-500/10">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-2 text-rose-100 tracking-tight">System Initialization Failed</h2>
          <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed">{error}</p>
          
          <button
            onClick={loadCityData}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          >
            <RefreshCw className="w-4 h-4" /> Reboot Engine
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* Main 3D Canvas Viewport */}
      <CityViewport
        mapData={mapData}
        cameraSignal={cameraSignal}
        nightMode={nightMode}
        skylineStyle={skylineStyle}
        showLabels={showLabels}
        labelSettings={labelSettings}
        layers={layers}
        flights={flights}
        selectedEntity={selectedEntity}
        navigationRoute={navigationRoute}
        destinationWaypoint={destinationWaypoint}
        gpsTheme={gpsTheme}
        followCamera={followCamera}
        onUpdateStats={handleUpdateStats}
        onCameraControllerReady={setCameraController}
        onSelectEntity={setSelectedEntity}
        onSetDestinationWaypoint={handleSetDestinationWaypoint}
        onRouteDriverReady={handleRouteDriverReady}
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] transition-opacity ease-in-out" style={{ opacity: theme === 'warm' && !nightMode ? 1 : 0, transitionDuration: '2600ms', background: 'linear-gradient(180deg, rgba(246,196,128,.22), rgba(232,170,100,.14))', mixBlendMode: 'soft-light' }} />
      {/* Data attribution required by ODbL / CC BY 4.0 sources (docs/3d-revamp/DATA_SOURCES.md). */}
      <div className="pointer-events-auto absolute bottom-1 right-2 z-[5] max-w-[70vw] truncate text-[9.5px] leading-tight text-white/55 [text-shadow:0_1px_2px_rgba(0,0,0,.6)] max-sm:hidden"
        title="Footprints, roads, land use and water: OpenStreetMap contributors (ODbL), Overture Maps Foundation, Google Open Buildings (CC BY 4.0), Microsoft ML Buildings (ODbL). Heights: Google Open Buildings 2.5D Temporal (CC BY 4.0, model estimates). Land cover: ESA WorldCover 2021 (CC BY 4.0). Elevation shading: Copernicus DEM GLO-30. Buildings beyond the data are procedural reconstructions.">
        © OpenStreetMap contributors · Overture Maps · Google Open Buildings 2.5D · ESA WorldCover · Copernicus DEM
      </div>
      {windowView && <WindowOverlay />}
      <PinTool controller={cameraController} hidden={presentationMode || mapOnly || !released} />
      <TourGuide controller={cameraController} night={nightMode} onNight={setNightMode} hidden={presentationMode || mapOnly || !released} />
      {/* UI Overlay */}
      <CityUI
        mapData={mapData}
        cameraController={cameraController}
        renderStats={renderStats}
        streamingStats={streamingStats}
        showLabels={showLabels}
        labelSettings={labelSettings}
        onLabelSettings={setLabelSettings}
        theme={theme}
        onTheme={setTheme}
        night={nightMode}
        onNight={setNightMode}
        windowView={windowView}
        onWindowView={setWindowView}
        presentationMode={presentationMode}
        mapOnly={mapOnly}
        onToggleMapOnly={() => setMapOnly((v) => !v)}
        layers={layers}
        selectedEntity={selectedEntity}
        flights={flights}
        flightFeed={{ status: flightFeed.status, provider: flightFeed.provider, ageSeconds: flightFeed.ageSeconds, reason: flightFeed.reason }}
        weatherFeed={weatherFeed}
        airFeed={airFeed}
        trainFeed={trainFeed}
        trafficFeed={trafficFeed}
        newsFeed={newsFeed}
        onToggleLabels={handleToggleLabels}
        onTogglePresentationMode={() => setPresentationMode(prev => !prev)}
        onCameraSignal={handleCameraSignal}
        onReloadOSM={loadCityData}
        onToggleLayer={handleToggleLayer}
        onSelectEntity={setSelectedEntity}
        onExecuteAction={handleExecuteAIAction}
        navigationRoute={navigationRoute}
        navigatorState={navigatorState}
        gpsTheme={gpsTheme}
        followCamera={followCamera}
        onToggleDrive={handleToggleDrive}
        onToggleFollowCamera={handleToggleFollowCamera}
        onChangeSpeed={handleChangeSpeed}
        onChangeTheme={handleChangeTheme}
        onClearRoute={handleClearRoute}
        onSetDestinationWaypoint={handleSetDestinationWaypoint}
      />
    </div>
  );
}
