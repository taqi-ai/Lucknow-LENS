/// <reference lib="webworker" />
/**
 * tileWorker — moves tile fetching, JSON parsing and geometry construction off the
 * main thread.
 *
 * The audit found the main thread doing a synchronous JSON.parse plus N x
 * ExtrudeGeometry per tile, which is what starved the render loop and left the city
 * empty. The worker returns transferable typed arrays, so the main thread's only
 * remaining job is wrapping them in BufferAttributes.
 *
 * The wire format of the source tiles is unchanged — this is purely a relocation of
 * work, not a data migration.
 */

import { buildBuildings, triangulate, type BuildingInput } from './buildingGeometry';
import { appendRibbon, buildElevationProfiles, classifyRoad, ROAD_HALF_WIDTH, type Pt } from './ribbon';

export interface TileWorkerRequest {
  id: string;
  url: string;
  /** 2 = neighbourhood, 3 = street. LOD 0/1 are served by the HLOD layer. */
  lod: number;
  originX: number;
  originZ: number;
}

export interface RoadStrip {
  category: string;
  pos: Float32Array;
}

export interface TileWorkerResponse {
  id: string;
  ok: boolean;
  error?: string;
  originX: number;
  originZ: number;
  buildings?: { pos: Float32Array; pack: Uint8Array; count: number; ids: string[] };
  roads?: RoadStrip[];
  parks?: Float32Array;
  water?: Float32Array;
  trees?: Float32Array;
  /** x, z, rotationY triples for streetlight placement. */
  streetlights?: Float32Array;
  counts?: { buildings: number; roads: number; trees: number; streetlights: number };
}

interface RoadIn {
  id: string;
  points: Pt[];
  width?: number;
  type?: string;
  subtype?: string;
  level?: number;
  isElevated?: boolean;
}
interface AreaIn { id: string; points: Pt[] }

/**
 * Continuous mitred ribbons, one merged buffer per road class. The previous
 * implementation emitted an independent quad per segment, which left a notch at
 * every bend and made the network read as disconnected flat lines.
 */
/** Tile edge in metres — roads are cut at these seams by build_transportation.ts. */
const TILE_SIZE = 500;
/** A cut end this close to a tile edge is a seam, not the end of the structure. */
const SEAM_TOL = 1.5;

function buildRoadRibbons(roads: RoadIn[], originX: number, originZ: number): RoadStrip[] {
  const byCat = new Map<string, number[]>();

  // Elevated roads get a real ramp-hold-ramp profile rather than a flat 6.8 m
  // slab. Features are cut at tile borders, so an endpoint sitting on a seam is
  // a continuation — ramping there would make every tile edge a dip.
  // Tiles are cut on the global 500 m grid, so world coordinates identify a seam
  // directly and this stays correct whatever `originX` refers to.
  const onSeam = (v: number) => {
    const m = ((v % TILE_SIZE) + TILE_SIZE) % TILE_SIZE;
    return m < SEAM_TOL || m > TILE_SIZE - SEAM_TOL;
  };
  const profiles = buildElevationProfiles(roads, (p) => !onSeam(p.x) && !onSeam(p.z));

  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    const cls = classifyRoad(road.type, road.subtype, road.level, road.isElevated);
    // Railways are owned by CityOverlay, which draws real ballast, sleepers and
    // rails city-wide at every altitude. Emitting a flat ribbon here too would
    // z-fight with the track bed it is supposed to be part of.
    if (cls === 'railway') continue;
    // Source width wins where present, but never below the class floor so the
    // motorway/footway hierarchy stays legible.
    const half = Math.max(ROAD_HALF_WIDTH[cls], (road.width ?? 0) / 2);
    let arr = byCat.get(cls);
    if (!arr) { arr = []; byCat.set(cls, arr); }
    appendRibbon(arr, profiles.get(road) ?? road.points, { half, originX, originZ, y: 0 });
  }

  const out: RoadStrip[] = [];
  for (const [category, verts] of byCat) {
    if (verts.length === 0) continue;
    out.push({ category, pos: new Float32Array(verts) });
  }
  return out;
}

/**
 * Streetlight placement. Lamps are sampled along the carriageway edge of roads that
 * would realistically be lit — arterials and above, plus tertiary — at a spacing
 * that scales with road class. Returned as bare transforms so the main thread can
 * push them straight into an InstancedMesh; nothing here allocates per-lamp objects.
 */
/**
 * Spacing between lamp columns, metres. These are deliberately wider than real
 * highway practice (~30 m). At the old 30-45 m values every arterial in view
 * carried a dense picket of masts that read as a fence rather than as lighting,
 * and the count buried the glow pass in overdraw. Real Lucknow arterials are lit
 * far more sparsely than a motorway spec suggests, so the wider spacing is both
 * cheaper and closer to the city.
 */
const LIT_ROAD_SPACING: Partial<Record<string, number>> = {
  motorway: 78,
  trunk: 76,
  primary: 72,
  secondary: 68,
  // Tertiary streets get occasional lighting only — they used to be lit at 30 m,
  // which is what flooded residential-scale streets with masts.
  tertiary: 95,
};

function buildStreetlights(roads: RoadIn[], originX: number, originZ: number): Float32Array {
  const out: number[] = [];

  for (const road of roads) {
    if (!road?.points || road.points.length < 2) continue;
    const cls = classifyRoad(road.type);
    const spacing = LIT_ROAD_SPACING[cls];
    if (!spacing) continue;

    const half = Math.max(ROAD_HALF_WIDTH[cls], (road.width ?? 0) / 2) + 1.2;
    // Only genuine dual-carriageway classes are lit from both sides. Primary used
    // to be included, which doubled the mast count on ordinary city avenues that
    // in reality carry a single staggered row.
    const bothSides = cls === 'motorway' || cls === 'trunk';

    let carry = 0;
    let flip = false;
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i];
      const p2 = road.points[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;

      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      const angle = Math.atan2(dz, dx);

      for (let d = carry; d < len; d += spacing) {
        const cx = p1.x + ux * d - originX;
        const cz = p1.z + uz * d - originZ;
        if (bothSides) {
          out.push(cx + nx * half, cz + nz * half, angle);
          out.push(cx - nx * half, cz - nz * half, angle + Math.PI);
        } else {
          const s = flip ? 1 : -1;
          out.push(cx + nx * half * s, cz + nz * half * s, flip ? angle : angle + Math.PI);
          flip = !flip;
        }
      }
      carry = (carry - len) % spacing;
      if (carry < 0) carry += spacing;
    }
  }

  return new Float32Array(out);
}

/**
 * Ear-clip areas into a flat mesh at a given height.
 *
 * This genuinely ear-clips now. It used to fan from vertex 0 on the claim that
 * "park/water polygons in this dataset are near-convex", which is false: river
 * channels, lakes and park boundaries are strongly concave, and a fan over a
 * concave ring emits triangles spanning the ring's *convex hull*. That is what
 * flooded whole neighbourhoods — Ambedkar Memorial Park among them — with water
 * that the source polygon never covered.
 *
 * It only showed when zoomed in because the city-wide overlay always ear-clipped
 * (overlayGeometry.triangulateArea); only the streamed tiles fanned, so the
 * spill appeared exactly when tile geometry took over from the overlay.
 */
function buildAreas(areas: AreaIn[], originX: number, originZ: number, y: number): Float32Array {
  const verts: number[] = [];
  for (const a of areas) {
    if (!a?.points || a.points.length < 3) continue;
    const ring = a.points;
    const tris = triangulate(ring);
    for (let t = 0; t < tris.length; t += 3) {
      const pa = ring[tris[t]], pb = ring[tris[t + 1]], pc = ring[tris[t + 2]];
      if (!pa || !pb || !pc) continue;
      const cross = (pb.x - pa.x) * (pc.z - pa.z) - (pb.z - pa.z) * (pc.x - pa.x);
      const tri = cross > 0 ? [pa, pc, pb] : [pa, pb, pc];
      for (const p of tri) {
        verts.push(p.x - originX, y, p.z - originZ);
      }
    }
  }
  return new Float32Array(verts);
}

self.onmessage = async (e: MessageEvent<TileWorkerRequest>) => {
  const req = e.data;
  const { id, url, lod, originX, originZ } = req;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      (self as unknown as Worker).postMessage({ id, ok: false, error: `HTTP ${resp.status}`, originX, originZ });
      return;
    }
    const data = await resp.json();

    const src = lod >= 2 ? data.lod2 : (data.lod1 || data.lod2);
    const bldgList: BuildingInput[] = src?.buildings || [];
    const roadList: RoadIn[] = src?.roads || [];
    const waterList: AreaIn[] = (data.lod2?.waterways || data.lod1?.waterways || []).filter((w: any) => w.isPolygon);
    const parkList: AreaIn[] = data.lod2?.greenAreas || data.lod1?.greenAreas || [];
    const treeList: Array<{ x: number; y: number; z: number; scale: number }> = data.lod2?.trees || [];

    const built = buildBuildings(bldgList, originX, originZ);
    const ids = bldgList.map((b) => b.id);

    const roads = buildRoadRibbons(roadList, originX, originZ);
    // Lamps are built for every streamed tile and hidden by the main thread above
    // street level. They used to be gated on `lod >= 3` here, but the streamer
    // unified LOD 2 and 3 onto a single content tier (CONTENT_TIER = 2) so that
    // crossing 600 m stops rebuilding every tile — which meant this branch had
    // been false for every request since, and no streetlight was ever built.
    const streetlights = lod >= 2 ? buildStreetlights(roadList, originX, originZ) : new Float32Array(0);
    const parks = buildAreas(parkList, originX, originZ, 0.05);
    const water = buildAreas(waterList, originX, originZ, -0.15);

    // Trees: x, y, z, scale packed flat.
    const trees = new Float32Array(treeList.length * 4);
    for (let i = 0; i < treeList.length; i++) {
      const t = treeList[i];
      trees[i * 4] = t.x - originX;
      trees[i * 4 + 1] = t.y || 0;
      trees[i * 4 + 2] = t.z - originZ;
      trees[i * 4 + 3] = t.scale || 1;
    }

    const response: TileWorkerResponse = {
      id, ok: true, originX, originZ,
      buildings: { pos: built.pos, pack: built.pack, count: built.count, ids },
      roads, parks, water, trees, streetlights,
      counts: {
        buildings: bldgList.length,
        roads: roadList.length,
        trees: treeList.length,
        streetlights: streetlights.length / 3,
      },
    };

    const transfer: Transferable[] = [
      built.pos.buffer, built.pack.buffer,
      parks.buffer, water.buffer, trees.buffer, streetlights.buffer,
      ...roads.map((r) => r.pos.buffer),
    ];
    (self as unknown as Worker).postMessage(response, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id, ok: false, error: String(err), originX, originZ,
    });
  }
};
