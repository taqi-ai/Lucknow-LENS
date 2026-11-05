import { loadJSON } from '../data/resourceCache';
import { RoadSegmentOSM, OverviewData } from '../types';

export interface GraphEdge {
  toNodeId: number;
  distance: number;
  cost: number;
  speedLimitKmH: number;
  roadName: string;
  roadType: string;
  points: Array<{ x: number; y: number; z: number }>;
}

export interface GraphNode {
  id: number;
  x: number;
  y: number;
  z: number;
  edges: GraphEdge[];
}

const DRIVABLE_TYPES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'unclassified',
  'service',
]);

const SPEED_LIMITS: Record<string, number> = {
  motorway: 80,
  trunk: 65,
  primary: 50,
  secondary: 40,
  tertiary: 35,
  residential: 25,
  unclassified: 30,
  service: 20,
};

const WEIGHT_MULTIPLIERS: Record<string, number> = {
  motorway: 0.65,
  trunk: 0.75,
  primary: 0.85,
  secondary: 0.95,
  tertiary: 1.05,
  residential: 1.30,
  unclassified: 1.15,
  service: 1.40,
};

const SNAP_RESOLUTION = 20; // 20-meter snapping for road endpoint junctions
const BUCKET_SIZE = 250;     // 250-meter spatial buckets for fast neighbor lookup

export class RoadGraph {
  private static instance: RoadGraph | null = null;

  public nodes: GraphNode[] = [];
  private nodeLookup = new Map<string, number>();
  private spatialBuckets = new Map<string, number[]>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  public static getInstance(): RoadGraph {
    if (!RoadGraph.instance) {
      RoadGraph.instance = new RoadGraph();
    }
    return RoadGraph.instance;
  }

  public async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.buildGraph();
    return this.loadPromise;
  }

  private async buildGraph(): Promise<void> {
    try {
      const data = await loadJSON<OverviewData>('/overture_tiles_full/overview.json');
      if (!data || !data.majorRoads) {
        console.warn('[RoadGraph] overview.json had no majorRoads array');
        return;
      }

      this.construct(data.majorRoads);
      this.isLoaded = true;
    } catch (err) {
      console.error('[RoadGraph] Failed to load or build road graph:', err);
    }
  }

  private getSnapKey(x: number, z: number): string {
    const sx = Math.round(x / SNAP_RESOLUTION) * SNAP_RESOLUTION;
    const sz = Math.round(z / SNAP_RESOLUTION) * SNAP_RESOLUTION;
    return `${sx},${sz}`;
  }

  private getOrCreateNode(x: number, y: number, z: number): number {
    const key = this.getSnapKey(x, z);
    const existing = this.nodeLookup.get(key);
    if (existing !== undefined) return existing;

    const id = this.nodes.length;
    const node: GraphNode = { id, x, y, z, edges: [] };
    this.nodes.push(node);
    this.nodeLookup.set(key, id);

    // Register into spatial bucket
    const bx = Math.floor(x / BUCKET_SIZE);
    const bz = Math.floor(z / BUCKET_SIZE);
    const bKey = `${bx},${bz}`;
    let bucket = this.spatialBuckets.get(bKey);
    if (!bucket) {
      bucket = [];
      this.spatialBuckets.set(bKey, bucket);
    }
    bucket.push(id);

    return id;
  }

  public construct(roads: RoadSegmentOSM[]): void {
    this.nodes = [];
    this.nodeLookup.clear();
    this.spatialBuckets.clear();

    for (const road of roads) {
      if (!DRIVABLE_TYPES.has(road.type) || !road.points || road.points.length < 2) {
        continue;
      }

      const roadName = road.name || 'Unnamed Road';
      const roadType = road.type;
      const speed = SPEED_LIMITS[roadType] || 35;
      const weightMult = WEIGHT_MULTIPLIERS[roadType] || 1.0;
      
      // Determine base elevation if elevated flyover
      const isElevated = (road as any).isElevated ?? false;
      const baseElevation = isElevated ? 8.5 : 0.0;

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i];
        const p2 = road.points[i + 1];

        const n1 = this.getOrCreateNode(p1.x, baseElevation, p1.z);
        const n2 = this.getOrCreateNode(p2.x, baseElevation, p2.z);

        if (n1 === n2) continue;

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const dist = Math.hypot(dx, dz);
        const cost = dist * weightMult;

        const segmentPoints = [
          { x: p1.x, y: baseElevation, z: p1.z },
          { x: p2.x, y: baseElevation, z: p2.z },
        ];

        // Bi-directional edge for two-way streets
        this.nodes[n1].edges.push({
          toNodeId: n2,
          distance: dist,
          cost,
          speedLimitKmH: speed,
          roadName,
          roadType,
          points: segmentPoints,
        });

        this.nodes[n2].edges.push({
          toNodeId: n1,
          distance: dist,
          cost,
          speedLimitKmH: speed,
          roadName,
          roadType,
          points: [segmentPoints[1], segmentPoints[0]],
        });
      }
    }
  }

  /**
   * Find closest node in the graph to an arbitrary 3D position
   */
  public findNearestNode(x: number, z: number, maxRadius = 800): { nodeId: number; distance: number } | null {
    if (this.nodes.length === 0) return null;

    const bx = Math.floor(x / BUCKET_SIZE);
    const bz = Math.floor(z / BUCKET_SIZE);
    const radiusBuckets = Math.ceil(maxRadius / BUCKET_SIZE);

    let bestId = -1;
    let bestDistSq = maxRadius * maxRadius;

    // Search concentric bucket rings
    for (let dx = -radiusBuckets; dx <= radiusBuckets; dx++) {
      for (let dz = -radiusBuckets; dz <= radiusBuckets; dz++) {
        const bKey = `${bx + dx},${bz + dz}`;
        const bucket = this.spatialBuckets.get(bKey);
        if (!bucket) continue;

        for (const id of bucket) {
          const n = this.nodes[id];
          const distSq = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestId = id;
          }
        }
      }
    }

    if (bestId !== -1) {
      return { nodeId: bestId, distance: Math.sqrt(bestDistSq) };
    }

    // Fallback if beyond radius: scan all nodes
    let fallbackId = 0;
    let fallbackDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const distSq = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (distSq < fallbackDistSq) {
        fallbackDistSq = distSq;
        fallbackId = i;
      }
    }

    return { nodeId: fallbackId, distance: Math.sqrt(fallbackDistSq) };
  }
}
