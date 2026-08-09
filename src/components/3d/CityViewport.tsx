import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats } from '../../types';
import { CityRenderer } from '../../city/renderer';
import { TileStreamer } from '../../city/tileStreamer';

interface CityViewportProps {
  mapData: OSMMapData;
  cameraSignal: CameraPreset | 'reset' | null;
  debugTiles: boolean;
  stableMode: boolean;
  onUpdateStats: (stats: RenderStats, streamingStats?: CityStreamingStats) => void;
}

export const CityViewport: React.FC<CityViewportProps> = ({ mapData, cameraSignal, debugTiles, stableMode, onUpdateStats }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const streamerRef = useRef<TileStreamer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Smooth camera interpolation state
  const cameraAnim = useRef<{
    active: boolean;
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
  }>({
    active: false,
    startTime: 0,
    duration: 1200,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
  });

  // Initialize Three.js Renderer & TileStreamer
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const cityRenderer = new CityRenderer(container, mapData);
    rendererRef.current = cityRenderer;

    const streamer = new TileStreamer(cityRenderer.scene);
    streamerRef.current = streamer;
    streamer.init();

    // Orbit Controls
    const controls = new OrbitControls(cityRenderer.camera, cityRenderer.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 10;
    controls.maxDistance = 15000;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Render Loop
    let animId: number;
    let lastStatsTime = 0;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      if (cameraAnim.current.active) {
        const elapsed = time - cameraAnim.current.startTime;
        const progress = Math.min(elapsed / cameraAnim.current.duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);

        cityRenderer.camera.position.lerpVectors(cameraAnim.current.startPos, cameraAnim.current.endPos, ease);
        controls.target.lerpVectors(cameraAnim.current.startTarget, cameraAnim.current.endTarget, ease);
        controls.update();

        if (progress >= 1) {
          cameraAnim.current.active = false;
        }
      } else {
        controls.update();
      }

      // Update TileStreamer with current camera position
      streamer.update(cityRenderer.camera.position);

      cityRenderer.update();

      if (time - lastStatsTime > 400) {
        onUpdateStats(cityRenderer.getRenderStats(), streamer.getStats());
        lastStatsTime = time;
      }
    };

    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      rendererRef.current.handleResize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      cityRenderer.dispose();
      if (container.contains(cityRenderer.renderer.domElement)) {
        container.removeChild(cityRenderer.renderer.domElement);
      }
    };
  }, [mapData]);

  // Update Debug & Stable Mode Toggle States
  useEffect(() => {
    if (streamerRef.current) {
      streamerRef.current.setDebugMode(debugTiles);
      streamerRef.current.setStableMode(stableMode);
    }
  }, [debugTiles, stableMode]);

  // Handle Camera Presets
  useEffect(() => {
    if (!cameraSignal || !rendererRef.current || !controlsRef.current) return;

    const camera = rendererRef.current.camera;
    const controls = controlsRef.current;
    const streamer = streamerRef.current;

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    let endPos = new THREE.Vector3(0, 12000, 10000);
    let endTarget = new THREE.Vector3(0, 0, 0);

    const manifest = streamer?.getManifest();
    const extent = manifest?.spatialExtent || { minX: -15000, maxX: 15000, minZ: -15000, maxZ: 15000 };
    const centerX = (extent.minX + extent.maxX) / 2;
    const centerZ = (extent.minZ + extent.maxZ) / 2;
    const width = Math.abs(extent.maxX - extent.minX);
    const depth = Math.abs(extent.maxZ - extent.minZ);
    const maxDim = Math.max(width, depth, 15000);

    if (cameraSignal === 'fullcity' || cameraSignal === 'frame' || cameraSignal === 'reset') {
      // Dynamic framing calculation based on dataset spatial bounding box
      const targetAltitude = maxDim * 0.75;
      endPos = new THREE.Vector3(centerX + maxDim * 0.25, targetAltitude, centerZ + maxDim * 0.45);
      endTarget = new THREE.Vector3(centerX, 0, centerZ);
    } else if (cameraSignal === 'overview') {
      endPos = new THREE.Vector3(centerX + maxDim * 0.15, maxDim * 0.35, centerZ + maxDim * 0.25);
      endTarget = new THREE.Vector3(centerX, 0, centerZ);
    } else if (cameraSignal === 'neighborhood') {
      endPos = new THREE.Vector3(centerX + 800, 1800, centerZ + 1200);
      endTarget = new THREE.Vector3(centerX, 10, centerZ);
    } else if (cameraSignal === 'street') {
      const firstLm = mapData.landmarks[0]?.position || { x: centerX, z: centerZ };
      endPos = new THREE.Vector3(firstLm.x + 80, 22, firstLm.z + 80);
      endTarget = new THREE.Vector3(firstLm.x, 12, firstLm.z);
    } else if (cameraSignal === 'top') {
      endPos = new THREE.Vector3(centerX, maxDim * 1.1, centerZ + 10);
      endTarget = new THREE.Vector3(centerX, 0, centerZ);
    }

    cameraAnim.current = {
      active: true,
      startTime: performance.now(),
      duration: 1400,
      startPos,
      endPos,
      startTarget,
      endTarget,
    };
  }, [cameraSignal, mapData]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />;
};

