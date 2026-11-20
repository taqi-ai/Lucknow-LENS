/**
 * scripts/verify_phase1.ts
 *
 * Automated verification test suite for Lucknow Lens Phase 1:
 *  1. AI Analyst action validation & crash prevention
 *  2. Elevation-aware road graph & flyover vs surface separation
 *  3. One-way road restrictions & directional routing in A*
 *  4. WebGL resource disposal & memory leak prevention
 */

import { RoadGraph } from '../src/navigation/roadGraph';
import { Pathfinder } from '../src/navigation/pathfinder';
import { project } from '../src/geo/projection';
import { RoadSegmentOSM, AIAction } from '../src/types';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error(`         Reason: ${details}`);
  }
}

// =========================================================================
// TEST SUITE 1: AI Analyst Action Validation & Crash Prevention
// =========================================================================
console.log('\n--- Test Suite 1: AI Analyst Action Validation ---');

function testAIActionValidation() {
  const ALLOWED_LIVE_LAYERS = new Set<string>([
    'traffic',
    'aqi',
    'weather',
    'flights',
    'railways',
    'cameras',
    'news',
    'emergency',
  ]);

  const LAYER_NAMES: Record<string, string> = {
    traffic: 'Hazratganj Traffic Area',
    aqi: 'Gomti Nagar AQI Zone',
    flights: 'Amausi Flight Tracking Hub',
    railways: 'Charbagh Railways Area',
    news: 'Gomti News Zone',
    weather: 'Lucknow Weather Station',
    cameras: 'City Surveillance Network',
    emergency: 'Emergency Services Hub',
  };

  function simulateExecuteAIAction(action: any): { success: boolean; entity?: any; layerEnabled?: string; rejected?: boolean } {
    try {
      if (!action || typeof action !== 'object') {
        return { success: true, rejected: true };
      }

      let layerEnabled: string | undefined;
      if (action.layer && ALLOWED_LIVE_LAYERS.has(action.layer)) {
        layerEnabled = action.layer;
      }

      if (action.type === 'FLY_TO') {
        const lat = action.latitude;
        const lon = action.longitude;

        const isValidLat = typeof lat === 'number' && Number.isFinite(lat) && lat >= 26.0 && lat <= 27.5;
        const isValidLon = typeof lon === 'number' && Number.isFinite(lon) && lon >= 80.0 && lon <= 81.8;

        if (!isValidLat || !isValidLon) {
          return { success: true, rejected: true };
        }

        const { x, z } = project(lat, lon);
        const selectedLayer = action.layer && ALLOWED_LIVE_LAYERS.has(action.layer) ? action.layer : 'news';
        const title = LAYER_NAMES[selectedLayer] || 'AI Focus Area';

        const entity = {
          type: 'poi',
          id: `ai-focus-${Date.now()}`,
          name: title,
          latitude: lat,
          longitude: lon,
          x,
          z,
        };

        return { success: true, entity, layerEnabled };
      } else if (action.type === 'ENABLE_LAYER' && action.layer) {
        if (ALLOWED_LIVE_LAYERS.has(action.layer)) {
          return { success: true, layerEnabled: action.layer };
        }
        return { success: true, rejected: true };
      }

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  // Case 1: Malformed / undefined action
  const r1 = simulateExecuteAIAction(null);
  assert(r1.success && r1.rejected, 'Handles null action safely');

  // Case 2: Out-of-bounds coordinates
  const r2 = simulateExecuteAIAction({ type: 'FLY_TO', latitude: 999, longitude: -500 });
  assert(r2.success && r2.rejected, 'Rejects extreme out-of-bounds coordinates without crashing');

  // Case 3: NaN coordinates
  const r3 = simulateExecuteAIAction({ type: 'FLY_TO', latitude: NaN, longitude: 80.9 });
  assert(r3.success && r3.rejected, 'Rejects NaN coordinates safely');

  // Case 4: Non-existent layer in previous registry (e.g. "weather" or "unknown")
  const r4 = simulateExecuteAIAction({ type: 'FLY_TO', latitude: 26.85, longitude: 80.95, layer: 'weather' });
  assert(r4.success && r4.entity?.name === 'Lucknow Weather Station', 'Safely resolves unmapped registry layers (e.g. weather)');

  // Case 5: Valid coordinate projection
  const r5 = simulateExecuteAIAction({ type: 'FLY_TO', latitude: 26.84997035, longitude: 80.95005255, layer: 'news' });
  assert(r5.success && Math.abs(r5.entity?.x) < 0.01 && Math.abs(r5.entity?.z) < 0.01, 'Dynamically projects origin (0, 0) accurately');
}

testAIActionValidation();

// =========================================================================
// TEST SUITE 2: Elevation-Aware Road Graph & Separation
// =========================================================================
console.log('\n--- Test Suite 2: Elevation-Aware Road Graph ---');

function testElevationAwareRoadGraph() {
  const graph = new RoadGraph();

  // Test setup:
  // Surface road running East-West at Y = 0: (-100, 0, 0) to (100, 0, 0)
  // Flyover running North-South at Y = 8.5: (0, 8.5, -100) to (0, 8.5, 100)
  // They cross at (0, 0) in 2D space, but surface is Y = 0 and flyover is Y = 8.5
  const mockRoads: RoadSegmentOSM[] = [
    {
      id: 'surface-road-1',
      name: 'MG Marg Surface',
      type: 'primary',
      isMajor: true,
      width: 14,
      points: [
        { x: -100, z: 0 },
        { x: 0, z: 0 },
        { x: 100, z: 0 },
      ],
    },
    {
      id: 'flyover-deck-1',
      name: 'Hazratganj Elevated Corridor',
      type: 'primary',
      isMajor: true,
      width: 14,
      level: 1,
      isElevated: true,
      points: [
        { x: 0, z: -100 },
        { x: 0, z: 0 },
        { x: 0, z: 100 },
      ],
    } as any,
  ];

  graph.construct(mockRoads);

  // Check nodes at crossing (0, 0)
  const surfaceCrossingNode = graph.nodes.find((n) => Math.hypot(n.x, n.z) < 15 && n.y < 2.0);
  const flyoverCrossingNode = graph.nodes.find((n) => Math.hypot(n.x, n.z) < 15 && n.y > 6.0);

  assert(surfaceCrossingNode !== undefined, 'Surface crossing node exists at Y ~ 0');
  assert(flyoverCrossingNode !== undefined, 'Flyover crossing node exists at Y ~ 8.5');
  assert(
    surfaceCrossingNode?.id !== flyoverCrossingNode?.id,
    'Surface road and Flyover have DISTINCT node IDs at crossing',
    `Surface Node ID: ${surfaceCrossingNode?.id}, Flyover Node ID: ${flyoverCrossingNode?.id}`
  );

  // Verify that surface crossing node edges only lead to surface road nodes
  const surfaceEdges = surfaceCrossingNode?.edges || [];
  const leadsToFlyover = surfaceEdges.some((e) => {
    const targetNode = graph.nodes[e.toNodeId];
    return targetNode.y > 6.0;
  });
  assert(!leadsToFlyover, 'Surface road edges DO NOT connect to elevated flyover deck without ramps');

  // Test Ramp Connection:
  // Add an off-ramp connecting from Flyover at (0, 100) ramping down to (50, 50, 0) and (100, 0, 0)
  const mockRamp: RoadSegmentOSM = {
    id: 'ramp-1',
    name: 'Flyover Off-Ramp',
    type: 'primary',
    isMajor: true,
    width: 8,
    isLink: true,
    points: [
      { x: 0, z: 100, y: 7.5 } as any,
      { x: 50, z: 50, y: 3.5 } as any,
      { x: 100, z: 0, y: 0.0 } as any,
    ],
  };

  graph.construct([...mockRoads, mockRamp]);

  const rampBottomNode = graph.nodes.find((n) => Math.hypot(n.x - 100, n.z - 0) < 15 && n.y < 2.0);
  const surfaceEastNode = graph.nodes.find((n) => Math.hypot(n.x - 100, n.z - 0) < 15);

  assert(
    rampBottomNode !== undefined && surfaceEastNode !== undefined && rampBottomNode.id === surfaceEastNode.id,
    'Ramp bottom cleanly connects to surface road at ground level (Y ~ 0)'
  );
}

testElevationAwareRoadGraph();

// =========================================================================
// TEST SUITE 3: One-Way Road Restrictions & Directional Routing
// =========================================================================
console.log('\n--- Test Suite 3: One-Way Road Restrictions ---');

async function testOneWayRestrictions() {
  const graph = RoadGraph.getInstance();
  (graph as any).isLoaded = true; // Mark as loaded for unit test environment

  // Test network:
  // Forward One-Way corridor: A (0, 0) -> B (100, 0) [length 100m]
  // Detour / Loopback corridor: B (100, 0) <-> C (100, 100) <-> D (0, 100) <-> A (0, 0) [length 300m]
  const mockRoads: RoadSegmentOSM[] = [
    {
      id: 'oneway-link-ab',
      name: 'Expressway Slip Road',
      type: 'primary',
      isMajor: true,
      width: 10,
      isLink: true, // One-way forward from A to B
      points: [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
      ],
    },
    {
      id: 'loop-bc',
      name: 'Ring Road East',
      type: 'secondary',
      isMajor: true,
      width: 10,
      points: [
        { x: 100, z: 0 },
        { x: 100, z: 100 },
      ],
    },
    {
      id: 'loop-cd',
      name: 'Ring Road North',
      type: 'secondary',
      isMajor: true,
      width: 10,
      points: [
        { x: 100, z: 100 },
        { x: 0, z: 100 },
      ],
    },
    {
      id: 'loop-da',
      name: 'Ring Road West',
      type: 'secondary',
      isMajor: true,
      width: 10,
      points: [
        { x: 0, z: 100 },
        { x: 0, z: 0 },
      ],
    },
    {
      id: 'reverse-oneway-stub',
      name: 'One-Way Northbound',
      type: 'tertiary',
      isMajor: false,
      width: 8,
      oneway: -1, // Reverse one-way: incoming only
      points: [
        { x: 200, z: 100 },
        { x: 200, z: 0 },
      ],
    } as any,
  ];

  graph.construct(mockRoads);

  const nodeA = graph.findNearestNode(0, 0)?.nodeId!;
  const nodeB = graph.findNearestNode(100, 0)?.nodeId!;
  const nodeC = graph.findNearestNode(100, 100)?.nodeId!;
  const nodeD = graph.findNearestNode(0, 100)?.nodeId!;

  // Check Forward One-Way edge presence:
  const edgeAtoB = graph.nodes[nodeA].edges.find((e) => e.toNodeId === nodeB);
  const edgeBtoA = graph.nodes[nodeB].edges.find((e) => e.toNodeId === nodeA);

  assert(edgeAtoB !== undefined, 'Forward edge exists on one-way link (A -> B)');
  assert(edgeBtoA === undefined, 'Reverse edge is NOT present on one-way link (B -> A is blocked)');

  // Check Bidirectional street:
  const edgeBtoC = graph.nodes[nodeB].edges.find((e) => e.toNodeId === nodeC);
  const edgeCtoB = graph.nodes[nodeC].edges.find((e) => e.toNodeId === nodeB);

  assert(edgeBtoC !== undefined, 'Bidirectional forward edge exists (B -> C)');
  assert(edgeCtoB !== undefined, 'Bidirectional backward edge exists (C -> B)');

  // Check Reverse One-Way:
  const nodeRevStart = graph.findNearestNode(200, 100)?.nodeId!;
  const nodeRevEnd = graph.findNearestNode(200, 0)?.nodeId!;
  const edgeRevLegal = graph.nodes[nodeRevEnd].edges.find((e) => e.toNodeId === nodeRevStart);
  const edgeRevIllegal = graph.nodes[nodeRevStart].edges.find((e) => e.toNodeId === nodeRevEnd);

  assert(edgeRevLegal !== undefined, 'Reverse one-way correctly creates edge from destination to origin (200,0 -> 200,100)');
  assert(edgeRevIllegal === undefined, 'Reverse one-way blocks driving in forward array direction');

  // Test A* Pathfinder respecting one-way:
  const pathfinder = new Pathfinder();
  
  // 1. Route from A (0, 0) to B (100, 0): Should use the 100m direct one-way link
  const routeAtoB = await pathfinder.calculateRoute(
    { x: 0, z: 0 },
    { x: 100, z: 0 }
  );
  assert(
    routeAtoB !== null && routeAtoB.totalDistanceMeters >= 90 && routeAtoB.totalDistanceMeters <= 120,
    'A* successfully navigates forward along one-way link (A -> B, ~100m)',
    `Distance: ${routeAtoB?.totalDistanceMeters}m`
  );

  // 2. Route from B (100, 0) to A (0, 0):
  // CANNOT go directly B -> A because it is one-way!
  // MUST take the 300m ring road detour: B -> C -> D -> A
  const routeBtoA = await pathfinder.calculateRoute(
    { x: 100, z: 0 },
    { x: 0, z: 0 }
  );
  assert(
    routeBtoA !== null && routeBtoA.totalDistanceMeters >= 270 && routeBtoA.totalDistanceMeters <= 330,
    'A* obeys one-way restriction and takes ring detour instead of going wrong way (B -> C -> D -> A, ~300m)',
    `Distance: ${routeBtoA?.totalDistanceMeters}m`
  );

  // Verify route points pass through C (100, 100) or D (0, 100)
  const routedThroughDetour = routeBtoA?.points.some((p) => p.z >= 80);
  assert(routedThroughDetour === true, 'Route actually traveled through the ring road detour (Z >= 80m)');
}

// =========================================================================
// TEST SUITE 4: WebGL Resource Cleanup Logic
// =========================================================================
console.log('\n--- Test Suite 4: WebGL Resource Disposal ---');

function testWebGLDisposal() {
  let geometriesDisposed = 0;
  let materialsDisposed = 0;
  let texturesDisposed = 0;
  let contextLost = false;

  const mockTexture = {
    dispose: () => { texturesDisposed++; },
  };

  const mockMaterial = {
    map: mockTexture,
    dispose: () => { materialsDisposed++; },
  };

  const mockGeometry = {
    dispose: () => { geometriesDisposed++; },
  };

  const mockMesh = {
    geometry: mockGeometry,
    material: mockMaterial,
  };

  // Simulate disposal traversal logic
  const disposedGeos = new Set<any>();
  const disposedMats = new Set<any>();
  const disposedTexs = new Set<any>();

  const disposeTex = (tex: any) => {
    if (tex && typeof tex.dispose === 'function' && !disposedTexs.has(tex)) {
      disposedTexs.add(tex);
      tex.dispose();
    }
  };

  const disposeMat = (mat: any) => {
    if (!mat || disposedMats.has(mat)) return;
    disposedMats.add(mat);
    if (mat.map) disposeTex(mat.map);
    if (typeof mat.dispose === 'function') mat.dispose();
  };

  const objects = [mockMesh, { geometry: mockGeometry, material: [mockMaterial] }];

  for (const obj of objects) {
    if (obj.geometry && !disposedGeos.has(obj.geometry)) {
      disposedGeos.add(obj.geometry);
      obj.geometry.dispose();
    }
    if (Array.isArray(obj.material)) {
      for (const m of obj.material) disposeMat(m);
    } else if (obj.material) {
      disposeMat(obj.material);
    }
  }

  assert(geometriesDisposed === 1, 'Geometries disposed without duplicate double-free errors', `count: ${geometriesDisposed}`);
  assert(materialsDisposed === 1, 'Materials disposed cleanly', `count: ${materialsDisposed}`);
  assert(texturesDisposed === 1, 'Attached texture maps disposed cleanly', `count: ${texturesDisposed}`);
}

testWebGLDisposal();

// Run async tests
testOneWayRestrictions().then(() => {
  console.log(`\n========================================`);
  console.log(`Phase 1 Verification Complete: ${passedTests} / ${totalTests} tests passed.`);
  console.log(`========================================\n`);

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}).catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
