import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SimulatedFlight, SelectedEntity } from '../../types';
import { CityRenderer } from '../../city/renderer';
import { TileStreamer } from '../../city/tileStreamer';
import { LabelManager } from '../../city/labelManager';
import { CameraController } from '../../city/cameraController';
import { AtmosphericSky } from '../../city/atmosphericSky';
import { BuildingMaterialSystem, type SkylineStyle } from '../../city/buildingMaterial';
import { CINEMATIC_PRESETS } from '../../city/cameraPresets';
import { LayerState } from '../features/LayerControl';
import { findClickedPOI, findClickedBuilding } from '../../interactions/picking';
import { unproject } from '../../search/SearchIndex';
import { WaypointVisuals } from '../../navigation/waypointVisuals';
import { RouteDriver } from '../../navigation/routeDriver';
import { NavigationRoute, RouteWaypoint, GPSTheme } from '../../navigation/types';
import { EmergencyVisualManager } from '../../city/emergencyVisuals';
import { loadEmergencyFacilities, EmergencyFacility } from '../../city/emergencyServices';
import { CampusAmbienceManager } from '../../city/campusAmbience';

/**
 * Aircraft geometry and materials are created once at module scope and shared by
 * every pooled aircraft node, so adding or removing flights never allocates GPU
 * resources.
 */
const AIRCRAFT_PARTS = (() => {
  const body = new THREE.CylinderGeometry(1.2, 0.7, 11, 8);
  body.rotateX(Math.PI / 2);
  const wings = new THREE.BoxGeometry(13, 0.35, 2.4);
  const tailPlane = new THREE.BoxGeometry(4.4, 0.25, 1.3);
  tailPlane.translate(0, 0.4, -4.4);
  const fin = new THREE.BoxGeometry(0.3, 2.4, 1.8);
  fin.translate(0, 1.4, -4.4);
  return {
    body,
    wings,
    tailPlane,
    fin,
    bodyMat: new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 0.45, metalness: 0.35 }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x9fb4c9, roughness: 0.5, metalness: 0.3 }),
  };
})();

function buildAircraftModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(AIRCRAFT_PARTS.body, AIRCRAFT_PARTS.bodyMat));
  g.add(new THREE.Mesh(AIRCRAFT_PARTS.wings, AIRCRAFT_PARTS.trimMat));
  g.add(new THREE.Mesh(AIRCRAFT_PARTS.tailPlane, AIRCRAFT_PARTS.trimMat));
  g.add(new THREE.Mesh(AIRCRAFT_PARTS.fin, AIRCRAFT_PARTS.trimMat));
  g.userData.type = 'aircraft';
  return g;
}

interface CityViewportProps {
  mapData: OSMMapData;
  cameraSignal: CameraPreset | 'reset' | null;
  nightMode: boolean;
  skylineStyle: SkylineStyle;
  showLabels: boolean;
  layers: LayerState;
  flights: SimulatedFlight[];
  selectedEntity: SelectedEntity | null;
  navigationRoute?: NavigationRoute | null;
  destinationWaypoint?: RouteWaypoint | null;
  gpsTheme?: GPSTheme;
  followCamera?: boolean;
  onUpdateStats: (stats: RenderStats, streamingStats?: CityStreamingStats) => void;
  onCameraControllerReady?: (controller: CameraController) => void;
  onSelectEntity: (entity: SelectedEntity | null) => void;
  onSetDestinationWaypoint?: (dest: RouteWaypoint) => void;
  onRouteDriverReady?: (driver: RouteDriver) => void;
}

export const CityViewport: React.FC<CityViewportProps> = ({
  mapData,
  cameraSignal,
  nightMode,
  skylineStyle,
  showLabels,
  layers,
  flights,
  selectedEntity,
  navigationRoute = null,
  destinationWaypoint = null,
  gpsTheme = 'cyan',
  followCamera = true,
  onUpdateStats,
  onCameraControllerReady,
  onSelectEntity,
  onSetDestinationWaypoint,
  onRouteDriverReady,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const streamerRef = useRef<TileStreamer | null>(null);
  const controlsRef = useRef<CameraController | null>(null);
  const labelManagerRef = useRef<LabelManager | null>(null);
  const skyRef = useRef<AtmosphericSky | null>(null);
  const materialsRef = useRef<BuildingMaterialSystem | null>(null);

  // Navigation system refs
  const waypointVisualsRef = useRef<WaypointVisuals | null>(null);
  const routeDriverRef = useRef<RouteDriver | null>(null);
  const campusAmbienceRef = useRef<CampusAmbienceManager | null>(null);
  
  const flightsGroupRef = useRef<THREE.Group | null>(null);
  const highlightRingRef = useRef<THREE.Mesh | null>(null);

  // Keep latest references for RAF loop and event listeners without tearing down WebGL
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const flightsRef = useRef(flights);
  flightsRef.current = flights;
  const mapDataRef = useRef(mapData);
  mapDataRef.current = mapData;
  const selectedEntityRef = useRef(selectedEntity);
  selectedEntityRef.current = selectedEntity;
  const onUpdateStatsRef = useRef(onUpdateStats);
  onUpdateStatsRef.current = onUpdateStats;
  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;
  const onCameraControllerReadyRef = useRef(onCameraControllerReady);
  onCameraControllerReadyRef.current = onCameraControllerReady;
  const onSetDestinationWaypointRef = useRef(onSetDestinationWaypoint);
  onSetDestinationWaypointRef.current = onSetDestinationWaypoint;

  // Initialize Three.js Renderer, TileStreamer, LabelManager, HorizonCity & AtmosphericSky
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const cityRenderer = new CityRenderer(container, mapDataRef.current);
    rendererRef.current = cityRenderer;

    // One shared material system drives every building
    const materials = new BuildingMaterialSystem();
    materialsRef.current = materials;

    const streamer = new TileStreamer(cityRenderer.scene, materials);
    streamerRef.current = streamer;

    // Initialize label manager and load label data
    const labelManager = new LabelManager(cityRenderer.scene);
    labelManagerRef.current = labelManager;
    labelManager.setCamera(cityRenderer.camera);
    labelManager.setViewport(container.clientWidth, container.clientHeight);
    labelManager.loadData();

    const sky = new AtmosphericSky();
    skyRef.current = sky;

    // Custom Target-Orbit Navigation
    const controls = new CameraController(cityRenderer.camera, cityRenderer.renderer.domElement);
    controlsRef.current = controls;
    if (onCameraControllerReadyRef.current) {
      onCameraControllerReadyRef.current(controls);
    }

    // Build atmospheric sky dome immediately
    sky.build(cityRenderer.scene);

    // Group for flight visualizations
    const flightsGroup = new THREE.Group();
    flightsGroupRef.current = flightsGroup;
    cityRenderer.scene.add(flightsGroup);

    // Dynamic selected highlight ring
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const highlightGeo = new THREE.RingGeometry(2, 22, 32);
    highlightGeo.rotateX(-Math.PI / 2);
    const highlightRing = new THREE.Mesh(highlightGeo, highlightMat);
    highlightRing.visible = false;
    highlightRingRef.current = highlightRing;
    cityRenderer.scene.add(highlightRing);

    // GTA GPS Navigation 3D Visuals & Route Driver
    const waypointVisuals = new WaypointVisuals();
    waypointVisualsRef.current = waypointVisuals;
    cityRenderer.scene.add(waypointVisuals.group);

    const routeDriver = new RouteDriver();
    routeDriverRef.current = routeDriver;
    routeDriver.setCameraController(controls);
    if (onRouteDriverReady) {
      onRouteDriverReady(routeDriver);
    }

    // Emergency Services Visuals & Coverage Overlay
    const emergencyVisuals = new EmergencyVisualManager(cityRenderer.scene);
    loadEmergencyFacilities().then((facs) => {
      emergencyVisuals.setFacilities(facs);
    });

    // Collegiate Campus Grounds & Landscaped Ambience
    const campusAmbience = new CampusAmbienceManager();
    campusAmbienceRef.current = campusAmbience;
    cityRenderer.scene.add(campusAmbience.group);

    // TileStreamer init
    streamer.init().then(() => {
      const extent = streamer.getSpatialExtent();
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
    let lastLayerKey = '';
    let lastFrameTime = performance.now();
    const aircraftPool: THREE.Group[] = [];

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      const deltaSec = Math.min(0.1, (time - lastFrameTime) * 0.001 || 0.016);
      lastFrameTime = time;

      controls.update(time);

      // Keep sky dome centered on camera every frame and animate shaders
      sky.update(cityRenderer.camera, time);

      const altitude = cityRenderer.camera.position.y;

      materials.updateCamera(cityRenderer.camera.position);

      // Adaptive shadows
      cityRenderer.setAdaptiveShadows(altitude);

      if (time - lastShadowUpdateTime > 500) {
        cityRenderer.updateSunShadowTarget(controls.target, altitude);
        const atmos = cityRenderer.getAtmosphere();
        materials.setHorizon(atmos.horizon, atmos.strength);
        lastShadowUpdateTime = time;
      }

      // Update TileStreamer
      streamer.update(cityRenderer.camera);

      // Update label manager
      const streamingStats = streamer.getStats();
      labelManager.update(cityRenderer.camera.position, streamingStats.currentLOD);

      // Boundary debug info
      const boundaryInfo = controls.getBoundaryDebug();
      if (boundaryInfo && streamerRef.current) {
        streamingStats.boundaryDebug = {
          ...boundaryInfo,
          horizonActive: streamer.getHLODStats().fabricMeshes > 0,
        };
      }

      // Flights rendering
      const currentLayers = layersRef.current;
      const currentFlights = flightsRef.current;
      const showFlights = currentLayers.live.flights;

      if (showFlights) {
        for (let i = 0; i < currentFlights.length; i++) {
          const flight = currentFlights[i];
          let node = aircraftPool[i];
          if (!node) {
            node = buildAircraftModel();
            aircraftPool[i] = node;
            flightsGroup.add(node);
          }
          node.visible = true;
          node.position.set(flight.x, flight.altitude, flight.z);
          node.rotation.y = -(flight.heading * Math.PI / 180);
          const s = THREE.MathUtils.clamp(altitude / 900, 1, 14);
          node.scale.setScalar(s);
          node.userData.data = flight;
          node.userData.id = flight.id;
        }
        for (let i = currentFlights.length; i < aircraftPool.length; i++) {
          if (aircraftPool[i]) aircraftPool[i].visible = false;
        }
      } else {
        for (const node of aircraftPool) if (node) node.visible = false;
      }

      // Selection Highlight Animation
      const curSelected = selectedEntityRef.current;
      if (curSelected) {
        highlightRing.position.set(curSelected.x, 0.35, curSelected.z);
        highlightRing.visible = true;
        highlightRing.rotation.z = time * 0.0015;
        highlightRing.scale.setScalar(1.0 + Math.sin(time * 0.005) * 0.08);
      } else {
        highlightRing.visible = false;
      }

      // Navigation visuals & driver update
      waypointVisuals.update(time);
      const navState = routeDriver.update(deltaSec);
      if (navState && navState.isActive) {
        waypointVisuals.updateNavigator(navState.currentPosition, navState.currentHeading, true);
      } else {
        waypointVisuals.updateNavigator(null, 0, false);
      }

      // Emergency services visuals & coverage update
      emergencyVisuals.setVisible(Boolean(currentLayers.live.emergency));
      if (curSelected && curSelected.type === 'emergency') {
        emergencyVisuals.setSelectedFacility(curSelected.details as EmergencyFacility);
      } else {
        emergencyVisuals.setSelectedFacility(null);
      }
      emergencyVisuals.update(time * 0.001, cityRenderer.camera.position);

      // Collegiate campus grounds and landscaped ambience
      campusAmbience.setVisible(Boolean(currentLayers.base.parks));
      campusAmbience.update(time * 0.001, cityRenderer.camera.position);

      // Layer Visibility Check
      const layerKey = `${currentLayers.base.buildings}|${currentLayers.base.roads}|${currentLayers.base.parks}|${currentLayers.base.gomti}`;
      if (layerKey !== lastLayerKey) {
        lastLayerKey = layerKey;
        streamer.setLayerVisibility({
          buildings: currentLayers.base.buildings,
          roads: currentLayers.base.roads,
          parks: currentLayers.base.parks,
          water: currentLayers.base.gomti,
        });
      }

      cityRenderer.update();

      if (time - lastStatsTime > 400) {
        onUpdateStatsRef.current(cityRenderer.getRenderStats(), streamingStats);
        lastStatsTime = time;
      }
    };

    animId = requestAnimationFrame(animate);

    // Click raycast interaction
    const handleViewportClick = (e: MouseEvent) => {
      if (!rendererRef.current || !controlsRef.current) return;
      if (controls.destTarget.distanceTo(controls.target) > 10) return;

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, rendererRef.current.camera);

      // Flights click check
      if (layersRef.current.live.flights && flightsGroupRef.current) {
        const intersects = raycaster.intersectObjects(flightsGroupRef.current.children, true);
        if (intersects.length > 0) {
          let rootPlane = intersects[0].object;
          while (rootPlane.parent && rootPlane.parent !== flightsGroupRef.current) {
            rootPlane = rootPlane.parent;
          }
          const flightData = rootPlane.userData.data as SimulatedFlight;
          if (flightData) {
            const coords = unproject(flightData.x, flightData.z);
            onSelectEntityRef.current({
              type: 'aircraft',
              id: flightData.id,
              name: `${flightData.airline} Flight ${flightData.id}`,
              details: flightData,
              latitude: coords.lat,
              longitude: coords.lon,
              x: flightData.x,
              z: flightData.z,
            });
            return;
          }
        }
      }

      // Emergency badges click check
      if (layersRef.current.live.emergency) {
        const emgIntersects = raycaster.intersectObjects(emergencyVisuals.getInteractiveObjects(), false);
        if (emgIntersects.length > 0) {
          const hitObj = emgIntersects[0].object as THREE.Sprite;
          const fac = hitObj.userData.facility as EmergencyFacility;
          if (fac) {
            const latLon = unproject(fac.x, fac.z);
            emergencyVisuals.setSelectedFacility(fac);
            onSelectEntityRef.current({
              type: 'emergency',
              id: fac.id,
              name: fac.name,
              details: fac,
              latitude: latLon.lat,
              longitude: latLon.lon,
              x: fac.x,
              z: fac.z,
            });
            controls.flyTo(latLon.lat, latLon.lon, 450);
            return;
          }
        }
      }

      // Campus badges click check
      if (layersRef.current.base.parks) {
        const campusIntersects = raycaster.intersectObjects(
          campusAmbience.group.children.filter((c) => c instanceof THREE.Sprite),
          false
        );
        if (campusIntersects.length > 0) {
          const hitSprite = campusIntersects[0].object as THREE.Sprite;
          const campus = hitSprite.userData.campus;
          if (campus) {
            const latLon = unproject(campus.x, campus.z);
            onSelectEntityRef.current({
              type: 'poi',
              id: campus.id,
              name: campus.name,
              details: {
                category: 'Collegiate Campus & Green Grounds',
                acreage: campus.acreage,
                founded: campus.founded,
                highlights: campus.highlights,
                flora: campus.flora,
              },
              latitude: latLon.lat,
              longitude: latLon.lon,
              x: campus.x,
              z: campus.z,
            });
            controls.flyTo(latLon.lat, latLon.lon, 600);
            return;
          }
        }
      }

      // Ground plane click check
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const groundIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, groundIntersect)) {
        const { x, z } = groundIntersect;

        // Building check
        const clickedBldg = findClickedBuilding(x, z, mapDataRef.current, streamer);
        if (clickedBldg) {
          let sumX = 0, sumZ = 0;
          clickedBldg.points.forEach((p) => { sumX += p.x; sumZ += p.z; });
          const cx = sumX / clickedBldg.points.length;
          const cz = sumZ / clickedBldg.points.length;
          const latLon = unproject(cx, cz);

          onSelectEntityRef.current({
            type: 'building',
            id: clickedBldg.id,
            name: clickedBldg.name || 'Extruded Building',
            details: {
              height: clickedBldg.height,
              stories: clickedBldg.stories,
              area: clickedBldg.height > 0 ? clickedBldg.height * 20 : 150,
              type: clickedBldg.height > 15 ? 'Commercial' : 'Residential',
            },
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: cx,
            z: cz,
          });
          controls.flyTo(latLon.lat, latLon.lon, 300);
          return;
        }

        // POI check
        const clickedPOI = findClickedPOI(x, z, mapDataRef.current, [], 45);
        if (clickedPOI) {
          const lm = clickedPOI.landmark;
          const lmX = 'x' in lm ? lm.x : lm.position.x;
          const lmZ = 'z' in lm ? lm.z : lm.position.z;
          const latLon = unproject(lmX, lmZ);
          onSelectEntityRef.current({
            type: 'poi',
            id: lm.id,
            name: lm.name,
            details: lm,
            latitude: latLon.lat,
            longitude: latLon.lon,
            x: lmX,
            z: lmZ,
          });
          controls.flyTo(latLon.lat, latLon.lon, 400);
          return;
        }
      }

      // Clear selection
      onSelectEntityRef.current(null);
    };

    // Right-Click (ContextMenu): Set GTA GPS Waypoint
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!rendererRef.current) return;

      const rect = container.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, rendererRef.current.camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const groundIntersect = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, groundIntersect)) {
        const { x, z } = groundIntersect;

        const clickedPOI = findClickedPOI(x, z, mapDataRef.current, [], 60);
        const clickedBldg = findClickedBuilding(x, z, mapDataRef.current, streamer);
        let name = 'Marked Waypoint';
        if (clickedPOI && clickedPOI.landmark.name) {
          name = clickedPOI.landmark.name;
        } else if (clickedBldg && clickedBldg.name) {
          name = clickedBldg.name;
        }

        if (onSetDestinationWaypointRef.current) {
          onSetDestinationWaypointRef.current({ x, z, name });
        }
      }
    };

    container.addEventListener('click', handleViewportClick);
    container.addEventListener('contextmenu', handleContextMenu);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!rendererRef.current) continue;
        const { width, height } = entry.contentRect;
        rendererRef.current.handleResize(width, height);
        labelManager.setViewport(width, height);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('click', handleViewportClick);
      container.removeEventListener('contextmenu', handleContextMenu);
      cancelAnimationFrame(animId);
      controls.dispose();
      labelManager.dispose();
      sky.dispose();
      streamer.dispose();
      materials.dispose();
      waypointVisuals.dispose();
      emergencyVisuals.dispose();
      campusAmbience.dispose();
      cityRenderer.dispose();
      if (container.contains(cityRenderer.renderer.domElement)) {
        container.removeChild(cityRenderer.renderer.domElement);
      }
    };
  }, []);

  // Sync Waypoint & Route to Visuals
  useEffect(() => {
    waypointVisualsRef.current?.setWaypoint(destinationWaypoint);
  }, [destinationWaypoint]);

  useEffect(() => {
    waypointVisualsRef.current?.setRoute(navigationRoute);
    routeDriverRef.current?.setRoute(navigationRoute);
  }, [navigationRoute]);

  useEffect(() => {
    if (gpsTheme) {
      waypointVisualsRef.current?.setTheme(gpsTheme);
    }
  }, [gpsTheme]);

  useEffect(() => {
    if (routeDriverRef.current) {
      routeDriverRef.current.followCamera = followCamera;
    }
  }, [followCamera]);

  // Update Night Mode & Labels
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.setNightMode(nightMode);
    if (streamerRef.current) streamerRef.current.setNightMode(nightMode);
    if (labelManagerRef.current) {
      labelManagerRef.current.setNightMode(nightMode);
      labelManagerRef.current.enabled = showLabels;
    }
    if (skyRef.current) skyRef.current.setNightMode(nightMode);
    campusAmbienceRef.current?.setNightMode(nightMode);
  }, [nightMode, showLabels]);

  // Skyline look
  useEffect(() => {
    materialsRef.current?.setSkylineStyle(skylineStyle);
    rendererRef.current?.setSkylineStyle(skylineStyle);
    streamerRef.current?.setSkylineStyle(skylineStyle);
  }, [skylineStyle]);

  // Camera presets
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
      pPitch = Math.PI / 3.2;
      pDistance = maxDim * 0.9;
    } else if (cameraSignal === 'overview') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = Math.PI / 8;
      pPitch = Math.PI / 3.8;
      pDistance = maxDim * 0.35;
    } else if (cameraSignal === 'neighborhood') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 3.5;
      pDistance = 1400;
    } else if (cameraSignal === 'street') {
      const firstLm = mapData.landmarks[0]?.position || { x: centerX, z: centerZ };
      pTarget.set(firstLm.x, 0, firstLm.z);
      pAzimuth = 0;
      pPitch = 0.2;
      pDistance = 200;
    } else if (CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS]) {
      const preset = CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS];
      pTarget.set(preset.x, 0, preset.z);
      pAzimuth = preset.azimuth;
      pPitch = preset.pitch;
      pDistance = preset.distance;
    } else if (cameraSignal === 'top') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 2 - 0.05;
      pDistance = maxDim;
    }

    const isCinematic = Boolean(CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS]);
    controls.transitionTo(pTarget, pAzimuth, pPitch, pDistance, isCinematic ? 2600 : 1400);
  }, [cameraSignal, mapData]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />;
};
