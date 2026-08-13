import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats } from '../../types';
import { CityRenderer } from '../../city/renderer';
import { TileStreamer } from '../../city/tileStreamer';
import { LabelManager } from '../../city/labelManager';
import { CameraController } from '../../city/cameraController';
import { HorizonCity } from '../../city/horizonCity';
import { AtmosphericSky } from '../../city/atmosphericSky';

interface CityViewportProps {
  mapData: OSMMapData;
  cameraSignal: CameraPreset | 'reset' | null;
  debugTiles: boolean;
  stableMode: boolean;
  nightMode: boolean;
  showLabels: boolean;
  onUpdateStats: (stats: RenderStats, streamingStats?: CityStreamingStats) => void;
  onCameraControllerReady?: (controller: CameraController) => void;
}

export const CityViewport: React.FC<CityViewportProps> = ({
  mapData,
  cameraSignal,
  debugTiles,
  stableMode,
  nightMode,
  showLabels,
  onUpdateStats,
  onCameraControllerReady,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const streamerRef = useRef<TileStreamer | null>(null);
  const controlsRef = useRef<CameraController | null>(null);
  const labelManagerRef = useRef<LabelManager | null>(null);
  const horizonRef = useRef<HorizonCity | null>(null);
  const skyRef = useRef<AtmosphericSky | null>(null);

  // Initialize Three.js Renderer, TileStreamer, LabelManager, HorizonCity & AtmosphericSky
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const cityRenderer = new CityRenderer(container, mapData);
    rendererRef.current = cityRenderer;

    const streamer = new TileStreamer(cityRenderer.scene);
    streamerRef.current = streamer;

    // Initialize label manager and load label data
    const labelManager = new LabelManager(cityRenderer.scene);
    labelManagerRef.current = labelManager;
    labelManager.setCamera(cityRenderer.camera);
    labelManager.setViewport(container.clientWidth, container.clientHeight);
    labelManager.loadData(); // async, non-blocking

    // Create horizon city and atmospheric sky instances
    const horizon = new HorizonCity();
    horizonRef.current = horizon;

    const sky = new AtmosphericSky();
    skyRef.current = sky;

    // Custom Target-Orbit Navigation
    const controls = new CameraController(cityRenderer.camera, cityRenderer.renderer.domElement);
    controlsRef.current = controls;
    if (onCameraControllerReady) {
      onCameraControllerReady(controls);
    }

    // Build atmospheric sky dome IMMEDIATELY — before async init so there's
    // never a frame showing raw background color
    sky.build(cityRenderer.scene);

    // TileStreamer init — then build horizon and set camera bounds
    streamer.init().then(() => {
      const extent = streamer.getSpatialExtent();

      // Build outer-city horizon ring (purely visual perimeter)
      horizon.build(cityRenderer.scene, extent);

      // Set camera boundary — inset by 1500m from the data extent edges
      const boundaryBuffer = 1500;
      controls.setBounds(
        extent.minX + boundaryBuffer,
        extent.maxX - boundaryBuffer,
        extent.minZ + boundaryBuffer,
        extent.maxZ - boundaryBuffer,
      );
    });

    // Render Loop
    let animId: number;
    let lastStatsTime = 0;
    let lastShadowUpdateTime = 0;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      controls.update(time);

      // Keep sky dome centered on camera every frame and animate shaders
      sky.update(cityRenderer.camera, time);

      // Lock camera clipping planes. 
      // The renderer uses logarithmicDepthBuffer: true, so we don't need dynamic scaling.
      // This prevents the horizon geometry from being sharply clipped before it reaches the fog fade-out distance.
      cityRenderer.camera.near = 2.0;
      cityRenderer.camera.far = 150000;
      cityRenderer.camera.updateProjectionMatrix();

      const altitude = cityRenderer.camera.position.y;

      // Adaptive shadows — disable at high altitude for massive iGPU perf gain
      cityRenderer.setAdaptiveShadows(altitude);

      // Throttled shadow target update — only every 500ms, not every frame
      if (time - lastShadowUpdateTime > 500) {
        cityRenderer.updateSunShadowTarget(controls.target);
        lastShadowUpdateTime = time;
      }

      // Update TileStreamer with current camera position
      streamer.update(cityRenderer.camera);

      // Update label manager — pass current LOD from streamer stats
      const streamingStats = streamer.getStats();
      labelManager.update(cityRenderer.camera.position, streamingStats.currentLOD);

      // Inject boundary debug info when debug mode is active
      const boundaryInfo = controls.getBoundaryDebug();
      if (boundaryInfo && streamerRef.current) {
        streamingStats.boundaryDebug = {
          ...boundaryInfo,
          horizonActive: horizon.isActive(),
        };
      }

      cityRenderer.update();

      if (time - lastStatsTime > 400) {
        onUpdateStats(cityRenderer.getRenderStats(), streamingStats);
        lastStatsTime = time;
      }
    };

    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      rendererRef.current.handleResize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      labelManager.setViewport(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      labelManager.dispose();
      horizon.dispose();
      sky.dispose();
      cityRenderer.dispose();
      if (container.contains(cityRenderer.renderer.domElement)) {
        container.removeChild(cityRenderer.renderer.domElement);
      }
    };
  }, [mapData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update Debug, Stable Mode, Night Mode & Label visibility
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setNightMode(nightMode);
    }
    if (streamerRef.current) {
      streamerRef.current.setDebugMode(debugTiles);
      streamerRef.current.setStableMode(stableMode);
      streamerRef.current.setNightMode(nightMode);
    }
    if (labelManagerRef.current) {
      labelManagerRef.current.setNightMode(nightMode);
      labelManagerRef.current.enabled = showLabels;
    }
    // Forward night mode to horizon and sky systems
    if (horizonRef.current) {
      horizonRef.current.setNightMode(nightMode);
    }
    if (skyRef.current) {
      skyRef.current.setNightMode(nightMode);
    }
  }, [debugTiles, stableMode, nightMode, showLabels]);

  // Handle Camera Presets
  useEffect(() => {
    if (!cameraSignal || !controlsRef.current || !streamerRef.current) return;

    const controls = controlsRef.current;
    const streamer = streamerRef.current;

    const manifest = streamer?.getManifest();
    const extent = manifest?.spatialExtent || { minX: -15000, maxX: 15000, minZ: -15000, maxZ: 15000 };
    const centerX = (extent.minX + extent.maxX) / 2;
    const centerZ = (extent.minZ + extent.maxZ) / 2;
    const width = Math.abs(extent.maxX - extent.minX);
    const depth = Math.abs(extent.maxZ - extent.minZ);
    const maxDim = Math.max(width, depth, 15000);

    let pTarget = new THREE.Vector3(centerX, 0, centerZ);
    let pAzimuth = 0;
    let pPitch = Math.PI / 4;
    let pDistance = 5000;

    if (cameraSignal === 'fullcity' || cameraSignal === 'frame' || cameraSignal === 'reset') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = Math.PI / 4;
      pPitch = Math.PI / 3;
      pDistance = maxDim * 0.9;
    } else if (cameraSignal === 'overview') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = Math.PI / 8;
      pPitch = Math.PI / 3.5;
      pDistance = maxDim * 0.45;
    } else if (cameraSignal === 'neighborhood') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 4;
      pDistance = 1800;
    } else if (cameraSignal === 'street') {
      const firstLm = mapData.landmarks[0]?.position || { x: centerX, z: centerZ };
      pTarget.set(firstLm.x, 0, firstLm.z);
      pAzimuth = 0;
      pPitch = 0.15; // very low horizon look
      pDistance = 200;
    } else if (cameraSignal === 'top') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 2 - 0.05; // straight down
      pDistance = maxDim;
    }

    controls.transitionTo(pTarget, pAzimuth, pPitch, pDistance, 1400);
  }, [cameraSignal, mapData]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />;
};

