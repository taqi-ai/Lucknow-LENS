import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraPreset, OSMMapData, RenderStats } from '../../types';
import { CityRenderer } from '../../city/renderer';

interface CityViewportProps {
  mapData: OSMMapData;
  cameraSignal: CameraPreset | 'reset' | null;
  onUpdateStats: (stats: RenderStats) => void;
}

export const CityViewport: React.FC<CityViewportProps> = ({ mapData, cameraSignal, onUpdateStats }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
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

  // Initialize Three.js Renderer & Orbit Controls
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const cityRenderer = new CityRenderer(container, mapData);
    rendererRef.current = cityRenderer;

    // Orbit Controls
    const controls = new OrbitControls(cityRenderer.camera, cityRenderer.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent going underground
    controls.minDistance = 10;
    controls.maxDistance = 10000;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Render Loop
    let animId: number;
    let lastStatsTime = 0;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Handle Smooth Camera Fly Transitions
      if (cameraAnim.current.active) {
        const elapsed = time - cameraAnim.current.startTime;
        const progress = Math.min(elapsed / cameraAnim.current.duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out

        cityRenderer.camera.position.lerpVectors(cameraAnim.current.startPos, cameraAnim.current.endPos, ease);
        controls.target.lerpVectors(cameraAnim.current.startTarget, cameraAnim.current.endTarget, ease);
        controls.update();

        if (progress >= 1) {
          cameraAnim.current.active = false;
        }
      } else {
        controls.update();
      }

      cityRenderer.update();

      // Report Stats back to UI twice per second
      if (time - lastStatsTime > 400) {
        onUpdateStats(cityRenderer.getRenderStats());
        lastStatsTime = time;
      }
    };

    animId = requestAnimationFrame(animate);

    // Responsive Resize Handler
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

  // Handle Camera Presets
  useEffect(() => {
    if (!cameraSignal || !rendererRef.current || !controlsRef.current) return;

    const camera = rendererRef.current.camera;
    const controls = controlsRef.current;

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    const w = mapData.bounds.widthMeters;
    const h = mapData.bounds.heightMeters;
    const maxDim = Math.max(w, h, 800);

    let endPos = new THREE.Vector3(maxDim * 0.45, maxDim * 0.7, maxDim * 0.65);
    let endTarget = new THREE.Vector3(0, 0, 0);

    if (cameraSignal === 'overview' || cameraSignal === 'frame' || cameraSignal === 'reset') {
      // Frame entire imported map area
      endPos = new THREE.Vector3(maxDim * 0.45, maxDim * 0.7, maxDim * 0.65);
      endTarget = new THREE.Vector3(0, 0, 0);
    } else if (cameraSignal === 'neighborhood') {
      // Zoom into central Lucknow neighborhood (e.g., Hazratganj area)
      endPos = new THREE.Vector3(maxDim * 0.15, maxDim * 0.22, maxDim * 0.22);
      endTarget = new THREE.Vector3(0, 10, 0);
    } else if (cameraSignal === 'street') {
      // Low Street-Level Perspective
      const firstLm = mapData.landmarks[0]?.position || { x: 0, z: 0 };
      endPos = new THREE.Vector3(firstLm.x + 60, 16, firstLm.z + 60);
      endTarget = new THREE.Vector3(firstLm.x, 12, firstLm.z);
    } else if (cameraSignal === 'top') {
      // 2D Orthographic Map View
      endPos = new THREE.Vector3(0, maxDim * 1.3, 5);
      endTarget = new THREE.Vector3(0, 0, 0);
    }

    cameraAnim.current = {
      active: true,
      startTime: performance.now(),
      duration: 1300,
      startPos,
      endPos,
      startTarget,
      endTarget,
    };
  }, [cameraSignal, mapData]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />;
};
