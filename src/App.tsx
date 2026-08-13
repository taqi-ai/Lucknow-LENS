import { useState, useEffect, useCallback } from 'react';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats } from './types';
import { CityViewport } from './components/3d/CityViewport';
import { CityUI } from './components/ui/CityUI';
import { MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { parseOvertureGeoJSON } from './osm/overtureParser';
import { CameraController } from './city/cameraController';

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

  const [renderStats, setRenderStats] = useState<RenderStats>({
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  });

  const [streamingStats, setStreamingStats] = useState<CityStreamingStats | undefined>(undefined);

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

  if (loading) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 animate-pulse">
          <MapPin className="w-8 h-8 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Initializing Lucknow City Engine</h2>
        <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
          Preparing spatial tile streamer and loading Overture Maps data...
        </p>
        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Loading Overture GIS Data...</span>
        </div>
      </div>
    );
  }

  if (error || !mapData) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans p-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2 text-rose-300">Overture Data Import Error</h2>
        <p className="text-sm text-slate-400 mb-6 text-center max-w-md">{error}</p>
        <button
          onClick={loadCityData}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry Loading Map
        </button>
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
        onUpdateStats={handleUpdateStats}
        onCameraControllerReady={setCameraController}
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
        onToggleDebugTiles={() => setDebugTiles(prev => !prev)}
        onToggleStableMode={() => setStableMode(prev => !prev)}
        onToggleNightMode={() => setNightMode(prev => !prev)}
        onToggleLabels={() => setShowLabels(prev => !prev)}
        onCameraSignal={handleCameraSignal}
        onReloadOSM={loadCityData}
      />
    </div>
  );
}
