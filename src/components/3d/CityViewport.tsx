import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraPreset, OSMMapData, RenderStats, CityStreamingStats, SimulatedFlight, SelectedEntity } from '../../types';
import { CityRenderer } from '../../city/renderer';
import { TileStreamer } from '../../city/tileStreamer';
import { LabelManager } from '../../city/labelManager';
import { CameraController } from '../../city/cameraController';
import { AtmosphericSky } from '../../city/atmosphericSky';
import { BuildingMaterialSystem, type SkylineStyle } from '../../city/buildingMaterial';
import { LandmarkSystem } from '../../city/landmarks';
import { LANDMARKS } from '../../city/landmarkRegistry';
import { CINEMATIC_PRESETS } from '../../city/cameraPresets';
import { LayerState } from '../features/LayerControl';
import { findClickedPOI, findClickedBuilding } from '../../interactions/picking';
import { unproject } from '../../search/SearchIndex';

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
  debugTiles: boolean;
  stableMode: boolean;
  nightMode: boolean;
  skylineStyle: SkylineStyle;
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
  skylineStyle,
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
  const skyRef = useRef<AtmosphericSky | null>(null);
  const materialsRef = useRef<BuildingMaterialSystem | null>(null);
  const landmarksRef = useRef<LandmarkSystem | null>(null);
  
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

  // Initialize Three.js Renderer, TileStreamer, LabelManager, HorizonCity & AtmosphericSky
  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const cityRenderer = new CityRenderer(container, mapDataRef.current);
    rendererRef.current = cityRenderer;

    // One shared material system drives every building — bulk streamed tiles and
    // baked HLOD alike — so variation is a shader concern, not a material count.
    const materials = new BuildingMaterialSystem();
    materialsRef.current = materials;

    const streamer = new TileStreamer(cityRenderer.scene, materials);
    streamerRef.current = streamer;

    // Dedicated geometry for ~14 recognisable Lucknow landmarks. Bulk Overture
    // extrusions inside their footprints are suppressed in the worker and baker.
    const landmarks = new LandmarkSystem(cityRenderer.scene);
    landmarksRef.current = landmarks;

    // Initialize label manager and load label data
    const labelManager = new LabelManager(cityRenderer.scene);
    labelManagerRef.current = labelManager;
    labelManager.setCamera(cityRenderer.camera);
    labelManager.setViewport(container.clientWidth, container.clientHeight);
    labelManager.loadData(); // async, non-blocking

    const sky = new AtmosphericSky();
    skyRef.current = sky;

    // Custom Target-Orbit Navigation
    const controls = new CameraController(cityRenderer.camera, cityRenderer.renderer.domElement);
    controlsRef.current = controls;
    if (onCameraControllerReadyRef.current) {
      onCameraControllerReadyRef.current(controls);
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

    // TileStreamer init — then set camera bounds from the true data extent.
    // The old procedural HorizonCity is gone; the baked HLOD carries real
    // building geometry all the way out to the data boundary.
    streamer.init().then(() => {
      const extent = streamer.getSpatialExtent();

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
    let lastLayerKey = '';
    const aircraftPool: THREE.Group[] = [];

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      controls.update(time);

      // Keep sky dome centered on camera every frame and animate shaders
      sky.update(cityRenderer.camera, time);

      const altitude = cityRenderer.camera.position.y;

      // Aerial perspective needs the camera position every frame; it is a uniform
      // write, not a matrix rebuild.
      materials.updateCamera(cityRenderer.camera.position);

      // Adaptive shadows — disable at high altitude for massive iGPU perf gain
      cityRenderer.setAdaptiveShadows(altitude);

      // Throttled shadow target update — only every 500ms, not every frame
      if (time - lastShadowUpdateTime > 500) {
        cityRenderer.updateSunShadowTarget(controls.target, altitude);
        const atmos = cityRenderer.getAtmosphere();
        materials.setHorizon(atmos.horizon, atmos.strength);
        lastShadowUpdateTime = time;
      }

      // Update TileStreamer with current camera position
      streamer.update(cityRenderer.camera);
      landmarks.update(cityRenderer.camera);

      // Update label manager — pass current LOD from streamer stats
      const streamingStats = streamer.getStats();
      labelManager.update(cityRenderer.camera.position, streamingStats.currentLOD);

      // Inject boundary debug info when debug mode is active
      const boundaryInfo = controls.getBoundaryDebug();
      if (boundaryInfo && streamerRef.current) {
        streamingStats.boundaryDebug = {
          ...boundaryInfo,
          horizonActive: streamer.getHLODStats().fabricMeshes > 0,
        };
      }

      // -------------------------------------------------------------
      // FLIGHTS RENDERING / MOVEMENT UPDATE
      // -------------------------------------------------------------
      // Aircraft are pooled. The previous implementation called flightsGroup.clear()
      // and rebuilt six geometries plus three materials per aircraft on every frame,
      // orphaning all of them for the GC 60 times a second.
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
          // Keep aircraft legible from altitude without turning them into UI pins.
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

      // -------------------------------------------------------------
      // SELECTION HIGHLIGHT ANIMATION
      // -------------------------------------------------------------
      const curSelected = selectedEntityRef.current;
      if (curSelected) {
        highlightRing.position.set(curSelected.x, 0.35, curSelected.z);
        highlightRing.visible = true;
        highlightRing.rotation.z = time * 0.0015;
        highlightRing.scale.setScalar(1.0 + Math.sin(time * 0.005) * 0.08);
      } else {
        highlightRing.visible = false;
      }

      // -------------------------------------------------------------
      // LAYER VISIBILITY
      // Only walk the scene when a toggle actually changed. This used to be a full
      // scene.traverse() every frame across every streamed tile mesh.
      // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // DEV INSTRUMENTATION HOOK (window.__LENS)
    // Lets an automated harness drive the camera, wait for tile streaming
    // to settle, and sample real render statistics. Dev builds only.
    // -------------------------------------------------------------
    if (import.meta.env.DEV) {
      (window as any).__LENS = {
        setShot(s: { t: [number, number]; az: number; pi: number; d: number; night: boolean }) {
          cityRenderer.setNightMode(s.night);
          streamer.setNightMode(s.night);
          landmarks.setNightMode(s.night);
          sky.setNightMode(s.night);
          labelManager.setNightMode(s.night);
          controls.transitionTo(new THREE.Vector3(s.t[0], 0, s.t[1]), s.az, s.pi, s.d, 10);
        },
        /** Switch visual profile without going through React state. */
        setStyle(s: SkylineStyle) {
          materials.setSkylineStyle(s);
          cityRenderer.setSkylineStyle(s);
          streamer.setSkylineStyle(s);
        },
        /** Resolve once the streamer has no pending loads for 4 consecutive checks. */
        waitSettled(timeoutMs = 20000) {
          return new Promise<void>((resolve) => {
            const start = performance.now();
            let quiet = 0;
            const poll = () => {
              const st = streamer.getStats();
              quiet = st.pendingLoads === 0 ? quiet + 1 : 0;
              if (quiet >= 4 || performance.now() - start > timeoutMs) resolve();
              else setTimeout(poll, 250);
            };
            setTimeout(poll, 500);
          });
        },
        /** Sample frame timings over a window and return render + streaming stats. */
        measure(durationMs = 2000) {
          return new Promise<any>((resolve) => {
            const frames: number[] = [];
            let last = performance.now();
            const start = last;
            const tick = () => {
              const now = performance.now();
              frames.push(now - last);
              last = now;
              if (now - start < durationMs) requestAnimationFrame(tick);
              else {
                frames.sort((a, b) => a - b);
                const r = cityRenderer.getRenderStats();
                const st = streamer.getStats();
                resolve({
                  fps: Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)),
                  frameMsP50: +frames[Math.floor(frames.length * 0.5)].toFixed(2),
                  frameMsP95: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
                  drawCalls: r.drawCalls,
                  triangles: r.triangles,
                  geometries: r.geometries,
                  textures: r.textures,
                  programs: cityRenderer.renderer.info.programs?.length ?? 0,
                  tiles: st.loadedTiles,
                  buildings: st.totalBuildings,
                  lod: st.currentLOD,
                  scale: st.zoomScaleName,
                });
              }
            };
            requestAnimationFrame(tick);
          });
        },
        /** Raw scene handle for ad-hoc inspection from a harness console. */
        scene: cityRenderer.scene,
        /**
         * Scene composition by layer. Answers "which representation is actually
         * drawing this?" — the question that separates a streamed tile not
         * loading from a streamed tile loading and then not being rendered.
         */
        probe() {
          const acc: Record<string, { meshes: number; visible: number; tris: number }> = {};
          cityRenderer.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            // Walk up to find which subsystem owns this mesh.
            let owner = 'other';
            for (let p: THREE.Object3D | null = m; p; p = p.parent) {
              if (p.name === 'CityOverlay') { owner = 'overlay'; break; }
              if (p.name === 'HLODLayer') { owner = `hlod:${m.name}`; break; }
              if (/^tile_/.test(p.name)) { owner = `tile:${m.name}`; break; }
            }
            const e = acc[owner] ?? (acc[owner] = { meshes: 0, visible: 0, tris: 0 });
            e.meshes++;
            let vis = m.visible;
            for (let p: THREE.Object3D | null = m.parent; p && vis; p = p.parent) vis = p.visible;
            if (vis) {
              e.visible++;
              const g = m.geometry as THREE.BufferGeometry;
              const pos = g.getAttribute('position');
              if (pos) e.tris += (g.index ? g.index.count : pos.count) / 3;
            }
          });
          const tileGroups: number[] = [];
          cityRenderer.scene.traverse((o) => {
            if (/^tile_/.test(o.name)) tileGroups.push(o.children.length);
          });
          const s = streamer as any;
          (acc as any).__tileGroups = {
            count: tileGroups.length,
            empty: tileGroups.filter((n) => n === 0).length,
            childrenTotal: tileGroups.reduce((a, b) => a + b, 0),
            loadedTilesMap: s.loadedTiles?.size ?? -1,
            parentChildren: s.tileGroupParent?.children?.length ?? -1,
            parentInScene: !!s.tileGroupParent?.parent,
            pending: s.pending?.size ?? -1,
            queue: s.queue?.length ?? -1,
            workers: s.workers?.length ?? -1,
            tileBoxes: s.tileBoxes?.size ?? -1,
            manifestTiles: s.manifest?.tiles?.length ?? -1,
            currentLOD: s.currentLOD,
          };
          return acc;
        },
        /** Debug: dump every landmark's actual world position/rotation from the scene graph. */
        dumpLandmarks() {
          const out: any[] = [];
          cityRenderer.scene.traverse((o) => {
            if (o.userData?.type === 'landmark') {
              const box = new THREE.Box3().setFromObject(o);
              out.push({
                id: o.userData.id,
                name: o.userData.name,
                pos: [o.position.x, o.position.y, o.position.z],
                rotY: o.rotation.y,
                visible: o.visible,
                bbox: [
                  +(box.max.x - box.min.x).toFixed(1),
                  +(box.max.y - box.min.y).toFixed(1),
                  +(box.max.z - box.min.z).toFixed(1),
                ],
                currentLOD: (o as THREE.LOD).getCurrentLevel?.(),
              });
            }
          });
          return out;
        },
        /** Debug: dump every currently-visible label sprite's world position. */
        dumpLabels() {
          const out: any[] = [];
          let groupFound = false, total = 0;
          cityRenderer.scene.traverse((o) => {
            if (o.name === 'LabelGroup') {
              groupFound = true;
              total = o.children.length;
              o.children.forEach((s: any) => {
                if (s.visible) out.push({ pos: [s.position.x, s.position.y, s.position.z], opacity: s.material?.opacity });
              });
            }
          });
          return { groupFound, total, enabled: labelManager.enabled, activeCount: labelManager.getActiveCount(), visible: out };
        },
        controlsState() {
          return {
            target: controls.target.toArray(),
            destTarget: controls.destTarget.toArray(),
            azimuth: controls.azimuth,
            destAzimuth: controls.destAzimuth,
            pitch: controls.pitch,
            distance: controls.distance,
            camPos: cityRenderer.camera.position.toArray(),
          };
        },
        debugLabelState() {
          const lm: any = labelManager;
          return {
            loaded: lm.loaded,
            allPlacesLen: lm.allPlaces?.length,
            allRoadsLen: lm.allRoads?.length,
            currentLOD: lm.currentLOD,
            hasCamera: !!lm.camera,
            camPos: cityRenderer.camera.position.toArray(),
            firstPlaces: lm.allPlaces?.slice(0, 5),
          };
        },
      };
    }

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
        const clickedPOI = findClickedPOI(x, z, mapDataRef.current, customRegistry);
        if (clickedPOI) {
          const lm = clickedPOI.landmark;
          const lmX = ('x' in lm) ? lm.x : lm.position.x;
          const lmZ = ('z' in lm) ? lm.z : lm.position.z;
          const latLon = unproject(lmX, lmZ);
          onSelectEntityRef.current({
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
        const clickedBldg = findClickedBuilding(x, z, mapDataRef.current, streamer);
        if (clickedBldg) {
          let sumX = 0, sumZ = 0;
          clickedBldg.points.forEach(p => { sumX += p.x; sumZ += p.z; });
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
      onSelectEntityRef.current(null);
    };

    container.addEventListener('click', handleViewportClick);
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
      cancelAnimationFrame(animId);
      controls.dispose();
      labelManager.dispose();
      sky.dispose();
      streamer.dispose();
      landmarks.dispose();
      materials.dispose();
      cityRenderer.dispose();
      if (container.contains(cityRenderer.renderer.domElement)) {
        container.removeChild(cityRenderer.renderer.domElement);
      }
    };
  }, []); // Remove mapData dependency to prevent WebGL teardown

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
    if (landmarksRef.current) {
      landmarksRef.current.setNightMode(nightMode);
    }
    if (labelManagerRef.current) {
      labelManagerRef.current.setNightMode(nightMode);
      labelManagerRef.current.enabled = showLabels;
    }
    if (skyRef.current) {
      skyRef.current.setNightMode(nightMode);
    }
  }, [debugTiles, stableMode, nightMode, showLabels]);

  // Skyline look — warm white / clear white / cyberpunk. Palette & lighting swap.
  useEffect(() => {
    materialsRef.current?.setSkylineStyle(skylineStyle);
    rendererRef.current?.setSkylineStyle(skylineStyle);
    streamerRef.current?.setSkylineStyle(skylineStyle);
  }, [skylineStyle]);

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
      pPitch = Math.PI / 3.2; // Slightly lower for better sky/ground ratio
      pDistance = maxDim * 0.9;
    } else if (cameraSignal === 'overview') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = Math.PI / 8;
      pPitch = Math.PI / 3.8;
      pDistance = maxDim * 0.35; // Closer
    } else if (cameraSignal === 'neighborhood') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 3.5; // Lower angle to show building depth
      pDistance = 1400;
    } else if (cameraSignal === 'street') {
      const firstLm = mapData.landmarks[0]?.position || { x: centerX, z: centerZ };
      pTarget.set(firstLm.x, 0, firstLm.z);
      pAzimuth = 0;
      pPitch = 0.2; // very low horizon look
      pDistance = 200;
    } else if (CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS]) {
      // Cinematic framings. These are camera setups over the same real city, not
      // separate scenes — each one is anchored to a real landmark position.
      const preset = CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS];
      const anchor = preset.landmarkId
        ? LANDMARKS.find((l) => l.id === preset.landmarkId)
        : undefined;
      const tx = anchor ? anchor.x : (preset.x ?? centerX);
      const tz = anchor ? anchor.z : (preset.z ?? centerZ);
      pTarget.set(tx, 0, tz);
      pAzimuth = preset.azimuth;
      pPitch = preset.pitch;
      // Frame landmarks against their own footprint so big and small subjects
      // both fill a comparable share of the viewport.
      pDistance = anchor ? Math.max(preset.distance, anchor.radius * 5.2) : preset.distance;
    } else if (cameraSignal === 'top') {
      pTarget.set(centerX, 0, centerZ);
      pAzimuth = 0;
      pPitch = Math.PI / 2 - 0.05; // straight down
      pDistance = maxDim;
    }

    // Longer, eased transitions for the cinematic presets so arrivals feel flown
    // rather than cut.
    const isCinematic = Boolean(CINEMATIC_PRESETS[cameraSignal as keyof typeof CINEMATIC_PRESETS]);
    controls.transitionTo(pTarget, pAzimuth, pPitch, pDistance, isCinematic ? 2600 : 1400);
  }, [cameraSignal, mapData]);

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />;
};
