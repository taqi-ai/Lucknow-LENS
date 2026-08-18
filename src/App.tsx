import { useState, useEffect, useCallback } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SelectedEntity, SimulatedFlight, AIAction } from './types';
import { CityViewport } from './components/3d/CityViewport';
import { CityUI } from './components/ui/CityUI';
import { MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { parseOvertureGeoJSON } from './osm/overtureParser';
import { CameraController } from './city/cameraController';
import { LayerState } from './components/features/LayerControl';
import { INITIAL_FLIGHTS, updateSimulatedFlights } from './interactions/flights';

export default function App() {
  const [mapData, setMapData] = useState<OSMMapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [cameraController, setCameraController] = useState<CameraController | null>(null);

  const [cameraSignal, setCameraSignal] = useState<CameraPreset | 'reset' | null>(null);
  const [debugTiles, setDebugTiles] = useState<boolean>(false);
  const [stableMode, setStableMode] = useState<boolean>(true);
  const [nightMode, setNightMode] = useState<boolean>(true); // Default to Night Mode
  const [showLabels, setShowLabels] = useState<boolean>(true); // Default: labels ON

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
    }
  });

  // Selection states
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  // Simulated flights feed
  const [flights, setFlights] = useState<SimulatedFlight[]>(INITIAL_FLIGHTS);

  const [renderStats, setRenderStats] = useState<RenderStats>({
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });

  const [streamingStats, setStreamingStats] = useState<CityStreamingStats | undefined>(undefined);

  // Flights updater loop
  useEffect(() => {
    let lastTime = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      
      setFlights(prev => updateSimulatedFlights(prev, dt));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const loadCityData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await parseOvertureGeoJSON();
      setMapData(data);
      setCameraSignal('frame');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load Overture city data: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCityData();
  }, [loadCityData]);

  const handleCameraSignal = (signal: CameraPreset) => {
    setCameraSignal(signal);
    setTimeout(() => setCameraSignal(null), 300);
  };

  const handleUpdateStats = useCallback((stats: RenderStats, sStats?: CityStreamingStats) => {
    setRenderStats(stats);
    if (sStats) setStreamingStats(sStats);
  }, []);

  // Layer toggling handles labels sync
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
      setLayers(l => ({ ...l, base: { ...l.base, labels: newVal } }));
      return newVal;
    });
  };

  // View on Map actions execution (camera glide + layer enable + marker select)
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

      // Generate context highlighted area to show in inspector
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

  if (loading) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-6 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="glass-panel rounded-3xl p-10 flex flex-col items-center max-w-lg w-full relative z-10 border-white/5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center mb-6 animate-pulse shadow-lg shadow-amber-500/10">
            <MapPin className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-2 tracking-tight text-white">LUCKNOW LENS</h2>
          <h3 className="text-sm font-semibold tracking-widest text-amber-500/80 mb-6 uppercase">3D Digital Twin</h3>
          
          <p className="text-sm text-slate-400 mb-8 text-center leading-relaxed">
            Initializing spatial engine and streaming Overture Maps data. Preparing city geometry...
          </p>
          
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 w-1/2 animate-[pulse_2s_ease-in-out_infinite] rounded-full" />
            </div>
            <div className="flex items-center gap-2 text-slate-300 text-xs font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Loading Geographic Data...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        debugTiles={debugTiles}
        stableMode={stableMode}
        nightMode={nightMode}
        showLabels={showLabels}
        layers={layers}
        flights={flights}
        selectedEntity={selectedEntity}
        onUpdateStats={handleUpdateStats}
        onCameraControllerReady={setCameraController}
        onSelectEntity={setSelectedEntity}
      />

      {/* UI Overlay */}
      <CityUI
        mapData={mapData}
        cameraController={cameraController}
        renderStats={renderStats}
        streamingStats={streamingStats}
        debugTiles={debugTiles}
        stableMode={stableMode}
        nightMode={nightMode}
        showLabels={showLabels}
        layers={layers}
        selectedEntity={selectedEntity}
        flights={flights}
        onToggleDebugTiles={() => setDebugTiles(prev => !prev)}
        onToggleStableMode={() => setStableMode(prev => !prev)}
        onToggleNightMode={() => setNightMode(prev => !prev)}
        onToggleLabels={handleToggleLabels}
        onCameraSignal={handleCameraSignal}
        onReloadOSM={loadCityData}
        onToggleLayer={handleToggleLayer}
        onSelectEntity={setSelectedEntity}
        onExecuteAction={handleExecuteAIAction}
      />
    </div>
  );
}
