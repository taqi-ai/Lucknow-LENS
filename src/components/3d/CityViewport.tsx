import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SimulatedFlight, SelectedEntity } from '../../types';
import { CityRenderer } from '../../city/renderer';
import { TileStreamer } from '../../city/tileStreamer';
import { LabelManager } from '../../city/labelManager';
import { CameraController } from '../../city/cameraController';
import { HorizonCity } from '../../city/horizonCity';
import { AtmosphericSky } from '../../city/atmosphericSky';
import { LayerState } from '../features/LayerControl';
import { findClickedPOI, findClickedBuilding } from '../../interactions/picking';
import { unproject } from '../../search/SearchIndex';

interface CityViewportProps {
  mapData: OSMMapData;
  cameraSignal: CameraPreset | 'reset' | null;
  debugTiles: boolean;
  stableMode: boolean;
  nightMode: boolean;
  showLabels: boolean;
  layers: LayerState;
  flights: SimulatedFlight[];
  selectedEntity: SelectedEntity | null;
  onUpdateStats: (stats: RenderStats, streamingStats?: CityStreamingStats) => void;
  onCameraControllerReady?: (controller: CameraController) => void;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}

export const CityViewport: React.FC<CityViewportProps> = ({
  mapData,
  cameraSignal,
  debugTiles,
  stableMode,
  nightMode,
  showLabels,
  layers,
  flights,
  selectedEntity,
  onUpdateStats,
  onCameraControllerReady,
  onSelectEntity,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const streamerRef = useRef<TileStreamer | null>(null);
  const controlsRef = useRef<CameraController | null>(null);
  const labelManagerRef = useRef<LabelManager | null>(null);
  const horizonRef = useRef<HorizonCity | null>(null);
  const skyRef = useRef<AtmosphericSky | null>(null);
  
  const flightsGroupRef = useRef<THREE.Group | null>(null);
  const highlightRingRef = useRef<THREE.Mesh | null>(null);

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

    // Group for flight visualizations
    const flightsGroup = new THREE.Group();
    flightsGroupRef.current = flightsGroup;
    cityRenderer.scene.add(flightsGroup);

    // Dynamic selected highlight ring
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b, // Amber 500
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    const highlightGeo = new THREE.RingGeometry(2, 22, 32);
    highlightGeo.rotateX(-Math.PI / 2);
    const highlightRing = new THREE.Mesh(highlightGeo, highlightMat);
    highlightRing.visible = false;
    highlightRingRef.current = highlightRing;
    cityRenderer.scene.add(highlightRing);

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

      // -------------------------------------------------------------
      // FLIGHTS RENDERING / MOVEMENT UPDATE
      // -------------------------------------------------------------
      flightsGroup.clear();
      if (layers.live.flights) {
        flights.forEach(flight => {
          const planeGroup = new THREE.Group();
          planeGroup.name = flight.id;
          planeGroup.position.set(flight.x, flight.altitude, flight.z);
          planeGroup.rotation.y = -(flight.heading * Math.PI / 180);

          // Proc plane body
          const bodyGeo = new THREE.CylinderGeometry(1.2, 1.2, 9, 8);
          bodyGeo.rotateX(Math.PI / 2);
          const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }); // Sky blue body
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          planeGroup.add(body);

          // Wings
          const wingsGeo = new THREE.BoxGeometry(10, 0.3, 2.2);
          const wingsMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // White wings
          const wings = new THREE.Mesh(wingsGeo, wingsMat);
          planeGroup.add(wings);

          // Tail wing
          const tailGeo = new THREE.BoxGeometry(3.5, 0.2, 1.2);
          const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const tail = new THREE.Mesh(tailGeo, tailMat);
          tail.position.set(0, 0.3, -3.8);
          planeGroup.add(tail);

          planeGroup.userData = { type: 'aircraft', id: flight.id, data: flight };
          flightsGroup.add(planeGroup);
        });
      }

      // -------------------------------------------------------------
      // SELECTION HIGHLIGHT ANIMATION
      // -------------------------------------------------------------
      if (selectedEntity) {
        highlightRing.position.set(selectedEntity.x, 0.35, selectedEntity.z);
        highlightRing.visible = true;
        highlightRing.rotation.z = time * 0.0015;
        highlightRing.scale.setScalar(1.0 + Math.sin(time * 0.005) * 0.08);
      } else {
        highlightRing.visible = false;
      }

      // -------------------------------------------------------------
      // LAYER VISIBILITY SETTINGS (TRAVERSING MESHS IN STREAMER SCENE)
      // -------------------------------------------------------------
      cityRenderer.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.InstancedMesh).isInstancedMesh) {
          if (child.name === 'buildings') {
            child.visible = layers.base.buildings;
          } else if (child.name === 'roads') {
            child.visible = layers.base.roads;
          } else if (child.name === 'parks') {
            child.visible = layers.base.parks;
          } else if (child.name === 'water') {
            child.visible = layers.base.gomti;
          } else if (child.name === 'trees') {
            child.visible = layers.base.parks; // trees grouped with parks
          }
        }
      });

      cityRenderer.update();

      if (time - lastStatsTime > 400) {
        onUpdateStats(cityRenderer.getRenderStats(), streamingStats);
        lastStatsTime = time;
      }
    };

    animId = requestAnimationFrame(animate);

    // -------------------------------------------------------------
    // RAYCAST INTERACTION & INSPECTION
    // -------------------------------------------------------------
    const handleViewportClick = (e: MouseEvent) => {
      if (!rendererRef.current || !controlsRef.current) return;

      // Ignore clicking if user was actively dragging
      if (controls.destTarget.distanceTo(controls.target) > 10) return;

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, rendererRef.current.camera);

      // A. Intersect with Aircrafts first
      if (layers.live.flights && flightsGroupRef.current) {
        const intersects = raycaster.intersectObjects(flightsGroupRef.current.children, true);
        if (intersects.length > 0) {
          let rootPlane = intersects[0].object;
          while (rootPlane.parent && rootPlane.parent !== flightsGroupRef.current) {
            rootPlane = rootPlane.parent;
          }
          const flightData = rootPlane.userData.data as SimulatedFlight;
          if (flightData) {
            const coords = unproject(flightData.x, flightData.z);
            onSelectEntity({
              type: 'aircraft',
              id: flightData.id,
              name: `${flightData.airline} Flight ${flightData.id}`,
              details: flightData,
              latitude: coords.lat,
              longitude: coords.lon,
              x: flightData.x,
              z: flightData.z
            });
            return;
          }
        }
      }

      // B. Intersect with Ground Plane at y = 0
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const groundIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, groundIntersect)) {
        const { x, z } = groundIntersect;

        // Custom Registry of Landmarks for clicking
        const customRegistry = [
          { id: 'custom-hazratganj', name: 'Hazratganj', category: 'Area', x: -382, z: 372, latitude: 26.8467, longitude: 80.9461, importance: 10 },
          { id: 'custom-charbagh', name: 'Charbagh Railway Station', category: 'Railway', x: -1499.08, z: 1573.89, latitude: 26.8322, longitude: 80.9221, importance: 10 },
          { id: 'custom-amausi', name: 'Amausi Airport', category: 'Airport', x: -9987.75, z: 9769.48, latitude: 26.7606, longitude: 80.8893, importance: 10 },
          { id: 'custom-palassio', name: 'Phoenix Palassio', category: 'Shopping', x: 5433.29, z: 1427.02, latitude: 26.8015, longitude: 81.0028, importance: 10 },
          { id: 'custom-sgpgi', name: 'SGPGI Hospital', category: 'Hospital', x: -315.22, z: 11420.92, latitude: 26.7538, longitude: 80.9392, importance: 10 },
          { id: 'custom-university', name: 'Lucknow University', category: 'University', x: -3453.56, z: -6233.88, latitude: 26.8643, longitude: 80.9382, importance: 9 },
          { id: 'custom-rumi', name: 'Rumi Darwaza', category: 'Landmark', x: -3700, z: -2500, latitude: 26.8694, longitude: 80.9115, importance: 10 },
          { id: 'custom-gomti', name: 'Gomti River Viewpoint', category: 'Gomti', x: 0, z: 0, latitude: 26.8525, longitude: 80.9545, importance: 9 }
        ];

        // 1. Proximity POI Click Check
        const clickedPOI = findClickedPOI(x, z, mapData, customRegistry);
        if (clickedPOI) {
          const lm = clickedPOI.landmark;
          const lmX = ('x' in lm) ? lm.x : lm.position.x;
          const lmZ = ('z' in lm) ? lm.z : lm.position.z;
          const latLon = unproject(lmX, lmZ);
          onSelectEntity({
            type: 'poi',
            id: lm.id,
            name: lm.name,
            details: lm,
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: lmX,
            z: lmZ
          });
          controls.flyTo(latLon.lat, latLon.lon, 400);
          return;
        }

        // 2. Point-in-polygon building check
        const clickedBldg = findClickedBuilding(x, z, mapData, streamer);
        if (clickedBldg) {
          let sumX = 0, sumZ = 0;
          clickedBldg.points.forEach(p => { sumX += p.x; sumZ += p.z; });
          const cx = sumX / clickedBldg.points.length;
          const cz = sumZ / clickedBldg.points.length;
          const latLon = unproject(cx, cz);
          
          onSelectEntity({
            type: 'building',
            id: clickedBldg.id,
            name: clickedBldg.name || 'Extruded Building',
            details: {
              height: clickedBldg.height,
              stories: clickedBldg.stories,
              area: clickedBldg.height > 0 ? (clickedBldg.height * 20) : 150, // estimated footprint area
              type: clickedBldg.height > 15 ? 'Commercial' : 'Residential'
            },
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: cx,
            z: cz
          });
          controls.flyTo(latLon.lat, latLon.lon, 300);
          return;
        }
      }

      // C. Clicked empty space -> Clear selection
      onSelectEntity(null);
    };

    container.addEventListener('click', handleViewportClick);
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      rendererRef.current.handleResize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      labelManager.setViewport(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('click', handleViewportClick);
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
  }, [mapData, layers.live.flights, flights]); // eslint-disable-line react-hooks/exhaustive-deps

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
