import * as THREE from 'three';

/**
 * Tree prototypes for Lucknow — low-poly but botanically distinct silhouettes, built
 * once and shared by every tile's InstancedMeshes. Vertex colours carry crown shading
 * (darker underside, lighter sunlit top, per-lobe variation), so a single shared
 * material lights them all and per-instance colour adds individual tint.
 *
 * Species (index):
 *   0 NEEM       irregular rounded crown of several lobes — the commonest city tree
 *   1 MANGO      dense, dark, broad dome on a short trunk — orchards (Malihabad belt)
 *   2 ASHOKA     tall narrow column (Polyalthia longifolia) — Lucknow's avenue tree
 *   3 PEEPAL     very wide umbrella of lobes on a thick trunk — peepal / banyan
 *   4 EUCALYPTUS tall pale trunk with a sparse high crown — roadsides, campuses
 *   5 PALM       ringed trunk and drooping fronds — parks, campuses, institutions
 * FAR (6) is a single 20-triangle blob for distant tiles.
 */

export const SPECIES = { NEEM: 0, MANGO: 1, ASHOKA: 2, PEEPAL: 3, EUCALYPTUS: 4, PALM: 5, FAR: 6 } as const;
export const SPECIES_COUNT = 6;

type Geo = THREE.BufferGeometry;

function colorize(g: Geo, base: THREE.Color, top: THREE.Color, minY: number, maxY: number, jitterSeed = 0): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    // per-triangle shading (flat look, varied facets)
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const t = THREE.MathUtils.clamp((y - minY) / Math.max(0.01, maxY - minY), 0, 1);
    const h = Math.sin((i + 1) * 12.9898 + jitterSeed * 78.233) * 43758.5453;
    const j = (h - Math.floor(h) - 0.5) * 0.16;
    c.copy(base).lerp(top, t * t);
    c.multiplyScalar(1 + j);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function merge(parts: Geo[]): Geo {
  let n = 0;
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position'), c = g.getAttribute('color');
    pos.set(p.array as Float32Array, o * 3);
    if (c) col.set(c.array as Float32Array, o * 3); else col.fill(0.3, o * 3, (o + p.count) * 3);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

const BARK = new THREE.Color(0x4a3d32);
const BARK_PALE = new THREE.Color(0xb9ad98);

function trunk(h: number, r0: number, r1: number, color = BARK, lean = 0): Geo {
  const g = new THREE.CylinderGeometry(r1, r0, h, 6, 1, true);
  g.translate(0, h / 2, 0);
  if (lean) g.rotateZ(lean);
  return colorize(g, color.clone().multiplyScalar(0.8), color, 0, h);
}

function lobe(r: number, x: number, y: number, z: number, sy: number, detail = 1): Geo {
  const g = new THREE.IcosahedronGeometry(r, detail);
  // roughen the silhouette a little so lobes are not perfect spheres
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const h = Math.sin(p.getX(i) * 3.1 + p.getY(i) * 5.7 + p.getZ(i) * 4.3) * 0.12;
    p.setXYZ(i, p.getX(i) * (1 + h), p.getY(i) * (1 + h) * sy, p.getZ(i) * (1 + h));
  }
  g.translate(x, y, z);
  return g;
}

function crown(lobes: Geo[], dark: number, light: number, seed: number): Geo {
  const parts = lobes.map((l, i) => {
    l.computeBoundingBox();
    const bb = l.boundingBox!;
    return colorize(l, new THREE.Color(dark), new THREE.Color(light), bb.min.y, bb.max.y, seed + i);
  });
  return merge(parts);
}

export function buildTreePrototypes(): Geo[] {
  const neem = merge([
    trunk(3.2, 0.32, 0.22),
    crown([lobe(2.6, 0, 5.2, 0, 0.8), lobe(2.0, 1.7, 4.6, 0.6, 0.8), lobe(1.9, -1.5, 4.8, -0.9, 0.8), lobe(1.7, 0.3, 6.3, -1.1, 0.75), lobe(1.6, -0.6, 4.4, 1.6, 0.8)],
      0x2c4a24, 0x5d7f3a, 1),
  ]);
  const mango = merge([
    trunk(1.9, 0.38, 0.28),
    crown([lobe(3.4, 0, 4.2, 0, 0.72, 1), lobe(2.4, 2.0, 3.6, 0.8, 0.75), lobe(2.3, -2.1, 3.7, -0.5, 0.75), lobe(2.2, 0.4, 3.5, -2.2, 0.75), lobe(2.1, -0.3, 3.4, 2.2, 0.75)],
      0x1d3519, 0x3f5f2a, 2),
  ]);
  const ashokaCrown = new THREE.ConeGeometry(1.25, 9.5, 7, 4);
  {
    const p = ashokaCrown.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      // drooping columnar profile: fuller in the lower-middle
      const k = 1 + 0.35 * Math.sin(((y + 4.75) / 9.5) * Math.PI) - 0.1;
      p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
    }
    ashokaCrown.translate(0, 6.0, 0);
  }
  const ashoka = merge([trunk(2.0, 0.18, 0.14), crown([ashokaCrown], 0x1f3b1e, 0x4c6e34, 3)]);
  const peepal = merge([
    trunk(3.4, 0.6, 0.42),
    trunk(2.6, 0.22, 0.16, BARK, 0.55), trunk(2.6, 0.22, 0.16, BARK, -0.6),
    crown([lobe(3.2, 0, 6.0, 0, 0.62), lobe(2.8, 3.0, 5.6, 0.8, 0.62), lobe(2.8, -3.0, 5.7, -0.6, 0.62),
      lobe(2.6, 0.6, 5.4, 2.9, 0.62), lobe(2.6, -0.4, 5.5, -3.0, 0.62), lobe(2.2, 2.0, 6.7, -1.8, 0.6)], 0x2a4721, 0x6a8a3e, 4),
  ]);
  const eucalyptus = merge([
    trunk(9.0, 0.26, 0.12, BARK_PALE),
    crown([lobe(1.7, 0.3, 10.2, 0, 1.1), lobe(1.3, -0.9, 9.0, 0.5, 1.0), lobe(1.2, 0.8, 11.4, -0.4, 1.0)], 0x48593a, 0x7d8e5c, 5),
  ]);
  const palmParts: Geo[] = [trunk(8.5, 0.24, 0.2, new THREE.Color(0x6b5f50))];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const frond = new THREE.PlaneGeometry(0.9, 3.6, 1, 3);
    const p = frond.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const v = (p.getY(k) + 1.8) / 3.6; // 0 at base -> 1 at tip
      p.setXYZ(k, p.getX(k) * (1 - v * 0.7), v * 3.4, -v * v * 1.6);
    }
    frond.rotateX(-0.25);
    frond.rotateY(a);
    frond.translate(0, 8.4, 0);
    palmParts.push(colorize(frond, new THREE.Color(0x2f4f22), new THREE.Color(0x5e7d34), 7, 10, 6 + i));
    // back face so fronds read from below
    const back = frond.toNonIndexed(); const bi = back.getAttribute('position');
    const arr = bi.array as Float32Array;
    for (let t = 0; t < arr.length; t += 9) { for (let q = 0; q < 3; q++) { const tmp = arr[t + 3 + q]; arr[t + 3 + q] = arr[t + 6 + q]; arr[t + 6 + q] = tmp; } }
    palmParts.push(colorize(back, new THREE.Color(0x2f4f22), new THREE.Color(0x4e6d2c), 7, 10, 20 + i));
  }
  const palm = merge(palmParts);
  const far = merge([
    trunk(2.2, 0.3, 0.25),
    colorize(new THREE.IcosahedronGeometry(3.0, 0).scale(1, 0.8, 1).translate(0, 4.6, 0), new THREE.Color(0x26401f), new THREE.Color(0x4d6a33), 2, 7),
  ]);
  return [neem, mango, ashoka, peepal, eucalyptus, palm, far];
}

/**
 * Species mix per planting context (place_vegetation.ts `k`): 0 park, 1 verge,
 * 2 open land, 3 yard/courtyard, 4 orchard. Returns cumulative weights per species.
 */
const MIX: number[][] = [
  /* park    */ [0.30, 0.10, 0.18, 0.16, 0.10, 0.16],
  /* verge   */ [0.36, 0.04, 0.38, 0.08, 0.12, 0.02],
  /* open    */ [0.40, 0.18, 0.02, 0.14, 0.24, 0.02],
  /* yard    */ [0.42, 0.18, 0.12, 0.18, 0.05, 0.05],
  /* orchard */ [0.10, 0.86, 0.00, 0.02, 0.02, 0.00],
  /* palm    */ [0.04, 0.00, 0.06, 0.00, 0.00, 0.90],
];

export function pickSpecies(kind: number, h: number): number {
  const w = MIX[kind] ?? MIX[0];
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i]; if (h < acc) return i; }
  return 0;
}

/** Shared material; colour is tweened for night by SceneTween. */
export function createTreeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true, side: THREE.DoubleSide });
}
