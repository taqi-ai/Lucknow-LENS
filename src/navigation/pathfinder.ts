import { RoadGraph, GraphEdge } from './roadGraph';
import { NavigationRoute, RouteManeuver, RouteWaypoint, ManeuverType } from './types';

class MinPriorityQueue {
  private heap: Array<{ id: number; priority: number }> = [];

  push(id: number, priority: number): void {
    this.heap.push({ id, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): number | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0].id;
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(idx: number): void {
    const el = this.heap[idx];
    while (idx > 0) {
      const pIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[pIdx];
      if (el.priority >= parent.priority) break;
      this.heap[idx] = parent;
      idx = pIdx;
    }
    this.heap[idx] = el;
  }

  private sinkDown(idx: number): void {
    const len = this.heap.length;
    const el = this.heap[idx];
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let swapIdx = -1;

      if (leftIdx < len) {
        if (this.heap[leftIdx].priority < el.priority) {
          swapIdx = leftIdx;
        }
      }

      if (rightIdx < len) {
        if (
          (swapIdx === -1 && this.heap[rightIdx].priority < el.priority) ||
          (swapIdx !== -1 && this.heap[rightIdx].priority < this.heap[leftIdx].priority)
        ) {
          swapIdx = rightIdx;
        }
      }

      if (swapIdx === -1) break;
      this.heap[idx] = this.heap[swapIdx];
      idx = swapIdx;
    }
    this.heap[idx] = el;
  }
}

export class Pathfinder {
  private graph: RoadGraph;

  constructor() {
    this.graph = RoadGraph.getInstance();
  }

  public async calculateRoute(
    start: RouteWaypoint,
    destination: RouteWaypoint
  ): Promise<NavigationRoute | null> {
    await this.graph.ensureLoaded();

    const startMatch = this.graph.findNearestNode(start.x, start.z);
    const destMatch = this.graph.findNearestNode(destination.x, destination.z);

    if (!startMatch || !destMatch) {
      console.warn('[Pathfinder] Could not snap start or destination to road network');
      return null;
    }

    const startNode = startMatch.nodeId;
    const destNode = destMatch.nodeId;

    if (startNode === destNode) {
      return this.createDirectRoute(start, destination);
    }

    // A* Search
    const gScore = new Float32Array(this.graph.nodes.length);
    gScore.fill(Infinity);
    gScore[startNode] = 0;

    const cameFromEdge = new Map<number, { fromNode: number; edge: GraphEdge }>();
    const pq = new MinPriorityQueue();

    const destX = this.graph.nodes[destNode].x;
    const destZ = this.graph.nodes[destNode].z;

    const initialHeuristic = Math.hypot(
      this.graph.nodes[startNode].x - destX,
      this.graph.nodes[startNode].z - destZ
    );
    pq.push(startNode, initialHeuristic);

    const visited = new Uint8Array(this.graph.nodes.length);
    let reached = false;

    while (!pq.isEmpty()) {
      const current = pq.pop()!;
      if (current === destNode) {
        reached = true;
        break;
      }

      if (visited[current]) continue;
      visited[current] = 1;

      const currentG = gScore[current];
      const edges = this.graph.nodes[current].edges;

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const neighbor = edge.toNodeId;

        if (visited[neighbor]) continue;

        const tentativeG = currentG + edge.cost;
        if (tentativeG < gScore[neighbor]) {
          gScore[neighbor] = tentativeG;
          cameFromEdge.set(neighbor, { fromNode: current, edge });

          const nx = this.graph.nodes[neighbor].x;
          const nz = this.graph.nodes[neighbor].z;
          const h = Math.hypot(nx - destX, nz - destZ) * 0.7; // Admissible heuristic
          pq.push(neighbor, tentativeG + h);
        }
      }
    }

    if (!reached) {
      console.warn('[Pathfinder] No path found between nodes; falling back to direct connecting route');
      return this.createDirectRoute(start, destination);
    }

    // Reconstruct route path
    const routeNodes: number[] = [destNode];
    const routeEdges: GraphEdge[] = [];

    let curr = destNode;
    while (curr !== startNode) {
      const prev = cameFromEdge.get(curr);
      if (!prev) break;
      routeEdges.unshift(prev.edge);
      curr = prev.fromNode;
      routeNodes.unshift(curr);
    }

    // Stitch coordinate points
    const points: Array<{ x: number; y: number; z: number }> = [
      { x: start.x, y: (start.y ?? 0) + 0.5, z: start.z }
    ];

    let totalDist = Math.hypot(
      this.graph.nodes[startNode].x - start.x,
      this.graph.nodes[startNode].z - start.z
    );
    let totalSeconds = totalDist / (30 / 3.6); // ~30 km/h initial connection

    for (let i = 0; i < routeEdges.length; i++) {
      const edge = routeEdges[i];
      totalDist += edge.distance;
      totalSeconds += edge.distance / (edge.speedLimitKmH / 3.6);

      for (let pIdx = 0; pIdx < edge.points.length; pIdx++) {
        const pt = edge.points[pIdx];
        points.push({ x: pt.x, y: pt.y + 0.45, z: pt.z });
      }
    }

    // Add final destination
    points.push({ x: destination.x, y: (destination.y ?? 0) + 0.5, z: destination.z });

    // Build maneuvers (turn-by-turn instructions)
    const maneuvers = this.generateManeuvers(routeEdges, points, destination);

    return {
      id: `route_${Date.now()}`,
      start,
      destination,
      points: this.smoothPolyline(points),
      totalDistanceMeters: Math.round(totalDist),
      estimatedDurationSeconds: Math.round(totalSeconds),
      maneuvers,
    };
  }

  private createDirectRoute(start: RouteWaypoint, destination: RouteWaypoint): NavigationRoute {
    const dist = Math.hypot(destination.x - start.x, destination.z - start.z);
    const duration = dist / (40 / 3.6);

    return {
      id: `direct_${Date.now()}`,
      start,
      destination,
      points: [
        { x: start.x, y: (start.y ?? 0) + 0.5, z: start.z },
        { x: destination.x, y: (destination.y ?? 0) + 0.5, z: destination.z },
      ],
      totalDistanceMeters: Math.round(dist),
      estimatedDurationSeconds: Math.round(duration),
      maneuvers: [
        {
          type: 'depart',
          instruction: 'Proceed directly toward waypoint',
          streetName: destination.name || 'Target Location',
          distanceMeters: Math.round(dist),
          location: { x: start.x, z: start.z },
          cumulativeDistance: 0,
        },
        {
          type: 'arrive',
          instruction: `Arrive at ${destination.name || 'Destination'}`,
          streetName: destination.name || 'Destination',
          distanceMeters: 0,
          location: { x: destination.x, z: destination.z },
          cumulativeDistance: Math.round(dist),
        },
      ],
    };
  }

  private generateManeuvers(
    edges: GraphEdge[],
    points: Array<{ x: number; y: number; z: number }>,
    dest: RouteWaypoint
  ): RouteManeuver[] {
    const maneuvers: RouteManeuver[] = [];
    if (edges.length === 0) return maneuvers;

    let cumulativeDist = 0;

    // 1. Depart maneuver
    const firstEdge = edges[0];
    maneuvers.push({
      type: 'depart',
      instruction: `Head on ${firstEdge.roadName}`,
      streetName: firstEdge.roadName,
      distanceMeters: Math.round(firstEdge.distance),
      location: { x: points[0].x, z: points[0].z },
      cumulativeDistance: 0,
    });

    cumulativeDist += firstEdge.distance;

    // Detect turn maneuvers along consecutive edges
    for (let i = 1; i < edges.length; i++) {
      const prevEdge = edges[i - 1];
      const curEdge = edges[i];

      const p1 = prevEdge.points[0];
      const p2 = prevEdge.points[prevEdge.points.length - 1];
      const p3 = curEdge.points[curEdge.points.length - 1];

      // Calculate bearing change
      const b1 = Math.atan2(p2.x - p1.x, p2.z - p1.z);
      const b2 = Math.atan2(p3.x - p2.x, p3.z - p2.z);
      let angleDiff = (b2 - b1) * (180 / Math.PI);
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;

      const isNameChange = curEdge.roadName !== prevEdge.roadName && curEdge.roadName !== 'Unnamed Road';
      const isSignificantTurn = Math.abs(angleDiff) > 28;

      if (isSignificantTurn || isNameChange) {
        let mType: ManeuverType = 'straight';
        let verb = 'Continue onto';

        if (angleDiff > 135 || angleDiff < -135) {
          mType = 'u-turn';
          verb = 'Make a U-turn onto';
        } else if (angleDiff >= 60) {
          mType = 'turn-right';
          verb = 'Turn right onto';
        } else if (angleDiff > 28) {
          mType = 'slight-right';
          verb = 'Slight right onto';
        } else if (angleDiff <= -60) {
          mType = 'turn-left';
          verb = 'Turn left onto';
        } else if (angleDiff < -28) {
          mType = 'slight-left';
          verb = 'Slight left onto';
        }

        maneuvers.push({
          type: mType,
          instruction: `${verb} ${curEdge.roadName}`,
          streetName: curEdge.roadName,
          distanceMeters: Math.round(curEdge.distance),
          location: { x: p2.x, z: p2.z },
          cumulativeDistance: Math.round(cumulativeDist),
        });
      }

      cumulativeDist += curEdge.distance;
    }

    // Arrival maneuver
    maneuvers.push({
      type: 'arrive',
      instruction: `Arrive at ${dest.name || 'Waypoint Destination'}`,
      streetName: dest.name || 'Destination',
      distanceMeters: 0,
      location: { x: dest.x, z: dest.z },
      cumulativeDistance: Math.round(cumulativeDist),
    });

    return maneuvers;
  }

  /**
   * Remove redundant consecutive collinear points for smooth rendering
   */
  private smoothPolyline(pts: Array<{ x: number; y: number; z: number }>): Array<{ x: number; y: number; z: number }> {
    if (pts.length <= 2) return pts;
    const res: Array<{ x: number; y: number; z: number }> = [pts[0]];

    for (let i = 1; i < pts.length - 1; i++) {
      const prev = res[res.length - 1];
      const cur = pts[i];
      const next = pts[i + 1];

      // If point is virtually identical to previous, skip
      const d1 = Math.hypot(cur.x - prev.x, cur.z - prev.z);
      if (d1 < 1.0) continue;

      res.push(cur);
    }

    res.push(pts[pts.length - 1]);
    return res;
  }
}
