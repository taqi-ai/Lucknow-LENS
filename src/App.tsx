import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction } from './types';
import { CityViewport } from './components/3d/CityViewport';
import { CityUI } from './components/ui/CityUI';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { parseOvertureGeoJSON } from './osm/overtureParser';
import { CameraController } from './city/cameraController';
import { LayerState, DEFAULT_LAYERS } from './components/features/LayerControl';
import { useLiveFlights } from './interactions/flights';
import {
  useLiveFeed, useLiveList,
  type LiveWeatherDTO, type LiveAirQualityDTO,
  type LiveTrainDTO, type LiveTrafficDTO, type LiveNewsDTO,
} from './interactions/liveFeed';
import type { SkylineStyle } from './city/buildingMaterial';
import { Pathfinder } from './navigation/pathfinder';
import { RouteDriver } from './navigation/routeDriver';
import type { NavigationRoute, NavigatorState, RouteWaypoint, GPSTheme, TransportMode, RoutePreference } from './navigation/types';
import { GPSService } from './navigation/gpsService';
import { SIL } from './spatial/spatialIntelligenceLayer';
import { SpatialIncident } from './spatial/types';
import { project, unproject } from './search/SearchIndex';

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

export default function App() {
  const [mapData, setMapData] = useState<OSMMapData>(INITIAL_MAP_DATA);
  const [error, setError] = useState<string | null>(null);

  const [cameraController, setCameraController] = useState<CameraController | null>(null);

  const [cameraSignal, setCameraSignal] = useState<CameraPreset | 'reset' | null>(null);
  const [nightMode, setNightMode] = useState<boolean>(true); // Default to Night Mode
  const [skylineStyle, setSkylineStyle] = useState<SkylineStyle>('warm');
  const [showLabels, setShowLabels] = useState<boolean>(true); // Default: labels ON
  const [presentationMode, setPresentationMode] = useState<boolean>(false);
  const [mapOnly, setMapOnly] = useState<boolean>(false);

  // GTA GPS Navigation State
  const pathfinderRef = useRef<Pathfinder>(new Pathfinder());
  const routeDriverRef = useRef<RouteDriver | null>(null);
  const gpsServiceRef = useRef<GPSService | null>(null);

  const [navigationRoute, setNavigationRoute] = useState<NavigationRoute | null>(null);
  const [navigatorState, setNavigatorState] = useState<NavigatorState | null>(null);
  const [destinationWaypoint, setDestinationWaypoint] = useState<RouteWaypoint | null>(null);
  const [gpsTheme, setGpsTheme] = useState<GPSTheme>('purple');
  const [followCamera, setFollowCamera] = useState<boolean>(true);

  // Navigation Panel & Live GPS Tracking
  const [isNavigationMode, setIsNavigationMode] = useState<boolean>(false);
  const [isGPSActive, setIsGPSActive] = useState<boolean>(false);
  const [rerouteNotification, setRerouteNotification] = useState<string | null>(null);

  // Initialize GPSService and listen for off-route deviation triggers
  useEffect(() => {
    const graph = pathfinderRef.current.getRoadGraph();
    const gps = new GPSService(graph);
    gpsServiceRef.current = gps;

    gps.onRerouteNeeded(async (evt) => {
      setRerouteNotification(`Dynamic Reroute: Off track (${Math.round(evt.deviationDistance)}m). Recalculating route...`);
      if (destinationWaypoint) {
        const newStart: RouteWaypoint = {
          x: evt.snappedPosition.x,
          z: evt.snappedPosition.z,
          name: 'Current Vehicle Position',
        };
        const newRoute = await pathfinderRef.current.calculateRoute(newStart, destinationWaypoint);
        if (newRoute) {
          setNavigationRoute(newRoute);
          gps.setActiveRoute(newRoute);
        }
      }
      setTimeout(() => setRerouteNotification(null), 4500);
    });

    return () => {
      gps.stopTracking();
    };
  }, [destinationWaypoint]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never steal a key from a text field
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === 'Escape') {
        if (mapOnly) setMapOnly(false);
        else if (presentationMode) setPresentationMode(false);
        else if (isNavigationMode) setIsNavigationMode(false);
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [presentationMode, mapOnly, navigationRoute, isNavigationMode]);

  // Layer toggler state initialized with 5-pillar DEFAULT_LAYERS
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);

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
      setCameraSignal('frame');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load Overture city data: ${message}`);
    }
  }, []);

  useEffect(() => {
    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (idle) {
      const handle = idle(() => loadCityData(), { timeout: 3000 });
      return () => (window as any).cancelIdleCallback?.(handle);
    }
    const t = window.setTimeout(loadCityData, 400);
    return () => window.clearTimeout(t);
  }, [loadCityData]);

  const handleCameraSignal = (signal: CameraPreset) => {
    setCameraSignal(signal);
    setTimeout(() => setCameraSignal(null), 300);
  };

  const handleUpdateStats = useCallback((stats: RenderStats, sStats?: CityStreamingStats) => {
    setRenderStats(stats);
    if (sStats) setStreamingStats(sStats);
  }, []);

  const handleToggleLayer = (category: 'base' | 'live' | 'hazards' | 'incidents' | 'navigation' | 'pulse', layer: string) => {
    setLayers(prev => {
      const nextCategory = { ...prev[category] } as any;
      nextCategory[layer] = !nextCategory[layer];
      
      if (layer === 'labels' && category === 'base') {
        setShowLabels(nextCategory[layer]);
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
      setLayers(l => ({
        ...l,
        base: { ...l.base, labels: newVal }
      }));
      return newVal;
    });
  };

  // GTA GPS Waypoint & Navigation Handlers
  const handleFindRoute = useCallback(async (
    start: RouteWaypoint,
    dest: RouteWaypoint,
    mode: TransportMode = 'car',
    preference: RoutePreference = 'fastest'
  ) => {
    setDestinationWaypoint(dest);
    const calculated = await pathfinderRef.current.calculateRoute(start, dest, mode, preference);
    if (calculated) {
      setNavigationRoute(calculated);
      gpsServiceRef.current?.setActiveRoute(calculated);
      setIsNavigationMode(true);
    }
  }, []);

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

    const calculated = await pathfinderRef.current.calculateRoute(startPoint, dest, 'car', 'fastest');
    if (calculated) {
      setNavigationRoute(calculated);
      gpsServiceRef.current?.setActiveRoute(calculated);
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

  const handleToggleGPS = useCallback(async () => {
    if (!gpsServiceRef.current) return;
    if (isGPSActive) {
      gpsServiceRef.current.stopTracking();
      setIsGPSActive(false);
      setRerouteNotification('GPS tracking paused. Switched to offline view.');
      setTimeout(() => setRerouteNotification(null), 3000);
    } else {
      const granted = await gpsServiceRef.current.startTracking();
      setIsGPSActive(granted);
      if (granted) {
        setRerouteNotification('GPS Live Tracking active. Snapped to Lucknow road network.');
      } else {
        setRerouteNotification('Simulation Mode: Real GPS unavailable. Interactive testing enabled.');
      }
      setTimeout(() => setRerouteNotification(null), 3500);
    }
  }, [isGPSActive]);

  const handleSimulateReroute = useCallback(() => {
    if (!gpsServiceRef.current) return;
    setRerouteNotification('Simulating vehicle off-route deviation (>65m)...');
    gpsServiceRef.current.simulateDeviation();
  }, []);

  const handleCheckRouteImpact = useCallback((incident: SpatialIncident) => {
    if (!navigationRoute) {
      setRerouteNotification(`No active navigation route. Incident is at ${incident.locationName}.`);
      setTimeout(() => setRerouteNotification(null), 3500);
      return;
    }
    const impacts = SIL.checkRouteIncidents(navigationRoute.coordinates);
    const isImpacting = impacts.some(i => i.id === incident.id);
    if (isImpacting) {
      setRerouteNotification(`CRITICAL: Active route directly intersects ${incident.title}! Detour recommended.`);
    } else {
      setRerouteNotification(`Route Clear: Current route path bypasses ${incident.title}.`);
    }
    setTimeout(() => setRerouteNotification(null), 4500);
  }, [navigationRoute]);

  const handleFindAlternativeRoute = useCallback(async (incident: SpatialIncident) => {
    if (!destinationWaypoint) {
      setRerouteNotification(`Please set a destination to calculate an incident detour.`);
      setTimeout(() => setRerouteNotification(null), 3000);
      return;
    }
    setRerouteNotification(`Calculating emergency detour avoiding ${incident.title}...`);
    let startX = -382;
    let startZ = 372;
    if (cameraController) {
      startX = cameraController.target.x;
      startZ = cameraController.target.z;
    }
    const startPoint: RouteWaypoint = {
      x: startX,
      z: startZ,
      name: 'Current Location',
    };
    const nearestNode = pathfinderRef.current.getRoadGraph().findNearestNode(incident.x, incident.z);
    const avoidIds = nearestNode ? [nearestNode.nodeId] : [];
    const detour = await pathfinderRef.current.calculateRoute(
      startPoint,
      destinationWaypoint,
      'car',
      'avoid-closures',
      avoidIds
    );
    if (detour) {
      setNavigationRoute(detour);
      gpsServiceRef.current?.setActiveRoute(detour);
      setRerouteNotification(`Detour confirmed: Avoided ${incident.title} (New distance: ${(detour.totalDistanceMeters / 1000).toFixed(2)} km)`);
      setTimeout(() => setRerouteNotification(null), 4500);
    }
  }, [destinationWaypoint, cameraController]);

  const handleFlyToLocation = useCallback((lat: number, lon: number, distance: number = 400) => {
    if (cameraController) {
      cameraController.flyTo(lat, lon, distance);
    }
  }, [cameraController]);

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
    } else if (action.type === 'CALCULATE_ROUTE') {
      const destName = (typeof action.destination === 'string' ? action.destination : action.destination?.name) || 'Target Location';
      let destX = 3837, destZ = 1677;
      if (action.latitude && action.longitude) {
        const p = project(action.latitude, action.longitude);
        destX = p.x;
        destZ = p.z;
      }
      const dest: RouteWaypoint = { x: destX, z: destZ, name: destName };
      let startX = -382, startZ = 372;
      if (cameraController) {
        startX = cameraController.target.x;
        startZ = cameraController.target.z;
      }
      const start: RouteWaypoint = { x: startX, z: startZ, name: 'Current View' };
      handleFindRoute(start, dest, 'car', 'avoid-closures');
      setIsNavigationMode(true);
      if (action.latitude && action.longitude) {
        cameraController.flyTo(action.latitude, action.longitude, 700);
      }
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
        isNavigationMode={isNavigationMode}
        onToggleNavigationMode={setIsNavigationMode}
        onFindRoute={handleFindRoute}
        onSimulateReroute={handleSimulateReroute}
        isGPSActive={isGPSActive}
        onToggleGPS={handleToggleGPS}
        rerouteNotification={rerouteNotification}
        onCheckRouteImpact={handleCheckRouteImpact}
        onFindAlternativeRoute={handleFindAlternativeRoute}
        onFlyToLocation={handleFlyToLocation}
        cameraCoordinates={cameraController ? unproject(cameraController.target.x, cameraController.target.z) : undefined}
      />
    </div>
  );
}
