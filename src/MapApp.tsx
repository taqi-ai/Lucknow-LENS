import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction } from './types';
import { CityViewport } from './components/3d/CityViewport';
import { CityUI } from './components/ui/CityUI';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { parseOvertureGeoJSON } from './osm/overtureParser';
import { CameraController } from './city/cameraController';
import { LayerState } from './components/features/LayerControl';
import { useLiveFlights } from './interactions/flights';
import {
  useLiveFeed, useLiveList,
  type LiveWeatherDTO, type LiveAirQualityDTO,
  type LiveTrainDTO, type LiveTrafficDTO, type LiveNewsDTO,
} from './interactions/liveFeed';
import type { SkylineStyle } from './city/buildingMaterial';
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
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 48%, transparent 52%, rgba(10,18,26,.38) 82%, rgba(6,12,18,.7) 100%)' }} />
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
}

export default function MapApp({ entryPreset = 'hero', onProgress }: MapAppProps) {
  const [mapData, setMapData] = useState<OSMMapData>(INITIAL_MAP_DATA);
  const [error, setError] = useState<string | null>(null);

  const [cameraController, setCameraController] = useState<CameraController | null>(null);

  const [cameraSignal, setCameraSignal] = useState<CameraPreset | 'reset' | null>(null);
  const [nightMode, setNightMode] = useState<boolean>(false); // Daylight by default; the window view reads best by day
  const [skylineStyle, setSkylineStyle] = useState<SkylineStyle>('warm');
  const [showLabels, setShowLabels] = useState<boolean>(true); // Default: labels ON
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [mapOnly, setMapOnly] = useState<boolean>(false);
  // Airplane-window treatment: vignette, glass glare and grain over the map. Cheap CSS, no extra GPU passes.
  const [windowView, setWindowView] = useState<boolean>(true);

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
      labels: true,
    },
    live: {
      traffic: false,
      aqi: false,
      weather: false,
      flights: false,
      railways: false,
      cameras: false,
      news: false,
      emergency: true,
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
        setCameraSignal(entryPreset);
      }, 500);
    } else if (settleRef.current !== null) { window.clearTimeout(settleRef.current); settleRef.current = null; }
    // Safety valve: a slow network should never trap people on the loader.
    if (!settled && elapsed > 30000 && dataLoaded && tilesLoaded > 0) {
      readyRef.current = true; bestRef.current = 1;
      onProgress({ value: 1, stage: 'Ready', ready: true, error: null });
      setCameraSignal(entryPreset);
      return;
    }
    bestRef.current = Math.max(bestRef.current, Math.min(value, 0.97));
    onProgress({ value: bestRef.current, stage, ready: false, error });
  }, [dataLoaded, cameraController, streamingStats, error, onProgress, entryPreset]);

  const handleCameraSignal = (signal: CameraPreset) => {
    setCameraSignal(signal);
    setTimeout(() => setCameraSignal(null), 300);
  };

  const handleUpdateStats = useCallback((stats: RenderStats, sStats?: CityStreamingStats) => {
    setRenderStats(stats);
    if (sStats) setStreamingStats(sStats);
  }, []);

  const handleToggleLayer = (category: 'base' | 'live', layer: string) => {
    setLayers(prev => {
      const nextCategory = { ...prev[category] };
      const key = layer as keyof typeof nextCategory;
      nextCategory[key] = !nextCategory[key] as any;
      
      if (layer === 'labels' && category === 'base') {
        setShowLabels(nextCategory[key] as any);
      }
      
      return {
        ...prev,
        [category]: nextCategory
      };
    });
  };

  const handleToggleLabels = () => {
    setShowLabels(prev => {
      const newVal = !prev;
      setLayers(l => ({ ...l.base, labels: newVal }));
      return newVal;
    });
  };

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
    if (!cameraController) return;

    if (action.type === 'FLY_TO' && action.latitude && action.longitude) {
      cameraController.flyTo(action.latitude, action.longitude, 350);
      
      if (action.layer) {
        setLayers(prev => ({
          ...prev,
          live: {
            ...prev.live,
            [action.layer!]: true
          }
        }));
      }

      const nameMap: Record<string, string> = {
        'traffic': 'Hazratganj Traffic Area',
        'aqi': 'Gomti Nagar AQI Zone',
        'flights': 'Amausi Flight Tracking Hub',
        'railways': 'Charbagh Railways Area',
        'news': 'Gomti News Zone'
      };

      const customRegistry = {
        'traffic': { id: 'ai-traffic', name: 'Hazratganj Traffic Area', x: -382, z: 372, lat: 26.8467, lon: 80.9461 },
        'aqi': { id: 'ai-aqi', name: 'Gomti Nagar AQI Zone', x: 3837, z: 1677, lat: 26.8315, lon: 80.9812 },
        'flights': { id: 'ai-flights', name: 'Amausi Flight Area', x: -9987, z: 9769, lat: 26.7606, lon: 80.8893 },
        'railways': { id: 'ai-railways', name: 'Charbagh Railways Area', x: -1499, z: 1573, lat: 26.8322, lon: 80.9221 },
        'news': { id: 'ai-news', name: 'Gomti News Zone', x: 0, z: 0, lat: 26.8525, lon: 80.9545 }
      };

      const selectedLayer = action.layer || 'news';
      const highlightPOI = customRegistry[selectedLayer as keyof typeof customRegistry];
      
      setSelectedEntity({
        type: 'poi',
        id: highlightPOI.id,
        name: nameMap[selectedLayer] || 'AI Analyzed Zone',
        details: {
          category: 'AI Highlighted Area',
          description: `This zone is currently highlighted on the map as part of your query analysis.`
        },
        latitude: highlightPOI.lat,
        longitude: highlightPOI.lon,
        x: highlightPOI.x,
        z: highlightPOI.z
      });
    } else if (action.type === 'ENABLE_LAYER' && action.layer) {
      setLayers(prev => ({
        ...prev,
        live: {
          ...prev.live,
          [action.layer!]: true
        }
      }));
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

      {windowView && <WindowOverlay />}
      {!presentationMode && !mapOnly && (
        <button
          onClick={() => setWindowView((v) => !v)}
          aria-pressed={windowView}
          title="Toggle the airplane-window look (W)"
          className={`fixed left-1/2 top-3 z-[60] ml-[92px] hidden items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold backdrop-blur-xl transition-colors sm:flex ${windowView ? 'border-amber/60 bg-amber/20 text-amber' : 'border-sand/20 bg-cabin/80 text-paper/70 hover:text-paper'}`}
        >
          Window view
        </button>
      )}

      {/* UI Overlay */}
      <CityUI
        mapData={mapData}
        cameraController={cameraController}
        renderStats={renderStats}
        streamingStats={streamingStats}
        nightMode={nightMode}
        showLabels={showLabels}
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
        onToggleNightMode={() => setNightMode(prev => !prev)}
        skylineStyle={skylineStyle}
        onCycleSkyline={() => setSkylineStyle(p => p === 'warm' ? 'clear' : p === 'clear' ? 'cyberpunk' : 'warm')}
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
