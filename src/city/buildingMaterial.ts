import * as THREE from 'three';
import { loadBuffer, loadJSON } from '../data/resourceCache';

/**
 * BuildingMaterialSystem — one shared material family for every building in Lucknow.
 *
 * Geometry carries a packed `aPack` (Uint8 x4, BUILDING_FORMAT_VERSION 2, see
 * buildingGeometry.ts):
 *   x hash | y eave height (0.5 m) | z AO<<4 | surface | w typology<<5 | orientation
 *
 * Spatially coherent attributes come from a world-space DISTRICT MAP
 * (public/ground/district.bin, written by scripts/build_buildings.ts) sampled by
 * position, so HLOD fabric, HLOD relief and streamed tiles agree by construction:
 *   R palette family   G night-light density   B commercial share   A old/dense fabric
 *
 * The per-building hash only picks within the family and adds a little jitter, so
 * neighbours share a regional stock (lime-washed old city, cream planned colonies,
 * exposed-brick periphery...) instead of reading as confetti.
 *
 * Facades are procedural per typology (window rhythm, storey height, plinth, bazaar
 * shopfronts with signage bands, arched heritage openings, apartment grids, industrial
 * strip glazing). Roof furniture surfaces (tanks, solar, tin, stair cabins) each get
 * their own albedo/roughness. Normals are flat, from screen-space derivatives.
 */

export type SkylineStyle = 'warm' | 'clear' | 'cyberpunk';

/** 8 palette families x 4 wall colours (sRGB), indexed family*4 + k. */
const WALL_FAMILIES = [
  // 0 old-city: lime white, weathered ochre, grey plaster, faded pink-lime
  0xdcd4c2, 0xc9b088, 0xb3aea4, 0xd2bfb0,
  // 1 bazaar: dusty plaster, stained cream, grey, faded yellow
  0xcfc8b8, 0xb9ad98, 0xa9a59d, 0xd6c79f,
  // 2 planned colonies: off-white, cream, light grey, pale buff
  0xe4e1d9, 0xddd3bf, 0xcfcdc7, 0xe2d8c4,
  // 3 modern: neutral grey, white, concrete, putty
  0xd3d3cf, 0xe6e4df, 0xb3b1ab, 0xc7c2b6,
  // 4 periphery: exposed brick, brick, grey plaster, raw concrete
  0xa36c54, 0x94634e, 0xbdb7ab, 0xa9a49a,
  // 5 village: whitewash, earth, grey, sand
  0xd4cfc3, 0xb8a68a, 0xa8a49b, 0xc1b49a,
  // 6 institutional: Dholpur buff, Lucknow red, sandstone, grey stone
  0xc8a77e, 0xa9705a, 0xd2c4a6, 0xbab4a7,
  // 7 generic urban: off-white, grey, cream, pale pastel
  0xdcd9d1, 0xc5c3bd, 0xd8cdb8, 0xcdd0c8,
];

/** Roof terraces seen from above: RCC grey-beige, brick dust, white-washed, grimy. */
const ROOF_PALETTE = [0xa19c91, 0x938d83, 0xb2a997, 0x898680, 0x9d9183, 0xc4bdae, 0x7d7a74, 0xa6a095];

/** Heritage lime-and-lakhori stock, industrial greys. */
const HERITAGE_WALL = [0xdccdaa, 0xd0b585, 0xc8b089, 0xe3d8bf];
const INDUSTRIAL_WALL = [0xa8a9a5, 0x9ca2a4, 0xb1aca1, 0x8e9395];

const toLinear = (hexes: number[]) => hexes.map((h) => {
  const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b);
});

// Byte 2 packs AO (high nibble, varies between a wall's bottom and top vertices) with
// the surface kind (low nibble, constant per primitive). Interpolating that byte across a
// face scrambles the low nibble, so the surface kind is decoded per vertex and passed
// FLAT, while AO is read from the smoothly interpolated byte.
const VERT_PARS = /* glsl */ `
attribute vec4 aPack;
varying vec4 vPack;
varying vec3 vWorldPos;
flat varying float vSurf;
`;
const VERT_MAIN = /* glsl */ `
vPack = aPack;
vSurf = mod(floor(aPack.z * 255.0 + 0.5), 16.0);
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vPack;
varying vec3 vWorldPos;
flat varying float vSurf;

uniform vec3 uWallFam[32];
uniform vec3 uRoofPal[8];
uniform vec3 uHeritagePal[4];
uniform vec3 uIndustrialPal[4];
uniform float uNight;
uniform float uDetail;
uniform vec3 uCameraPos;
uniform float uCyber;
uniform float uClear;
uniform float uDebug;
uniform sampler2D uDistrict;
uniform vec4 uDistrictXform; // originX, originZ, 1/size(m), unused

// Sine-free hashes (Hoskins): sin() of city-scale coordinates loses float precision
// and turns into visible banding.
float lensHash(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float lensHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(lensHash2(i),lensHash2(i+vec2(1,0)),f.x), mix(lensHash2(i+vec2(0,1)),lensHash2(i+vec2(1,1)),f.x), f.y); }

float floorH(float typ) {
  if (typ < 0.5) return 3.1; if (typ < 1.5) return 3.3; if (typ < 2.5) return 3.6; if (typ < 3.5) return 4.8;
  if (typ < 4.5) return 3.0; if (typ < 5.5) return 3.9; if (typ < 6.5) return 6.5; return 3.15;
}

// Decoded per-fragment building state, shared by colour and output stages.
float bHash, bHeight, bAO, bSurf, bTyp, bOrient;
vec4 bDistrict;
void decodePack() {
  bHash = vPack.x;
  bHeight = floor(vPack.y * 255.0 + 0.5) * 0.5;
  bAO = clamp(vPack.z * 255.0 / 256.0 + 0.03, 0.0, 1.0);
  bSurf = vSurf;
  float b3 = floor(vPack.w * 255.0 + 0.5);
  bTyp = floor(b3 / 32.0);
  bOrient = mod(b3, 32.0) / 32.0;
  // Sample the district map with a per-building offset so zone edges dither by
  // building instead of following the 176 m grid.
  vec2 jit = (vec2(lensHash(bHash * 31.7), lensHash(bHash * 53.3)) - 0.5) * 140.0;
  vec2 duv = (vWorldPos.xz + jit - uDistrictXform.xy) * uDistrictXform.z;
  bDistrict = texture2D(uDistrict, clamp(duv, 0.0, 1.0));
}

// Facade-local coordinates: u along the wall, v up. Summing both orientation axes keeps
// u varying on walls parallel AND perpendicular to the building's longest edge.
vec2 facadeUV() {
  float ang = bOrient * 6.2831853 - 3.1415927;
  vec2 d = vec2(cos(ang), sin(ang));
  vec2 n = vec2(-d.y, d.x);
  return vec2(dot(vWorldPos.xz, d) + dot(vWorldPos.xz, n), vWorldPos.y);
}

// Window mask for a typology. Returns (pane, frame) in 0..1 and writes the cell id.
vec2 windowMask(vec2 fuv, float fh, float typ, out vec2 cell, out float bay) {
  float spacing = 3.2; float ww = 0.36; float sill = 0.30; float head = 0.78;
  if (typ < 0.5) { spacing = 3.4; ww = 0.34; }
  else if (typ < 1.5) { spacing = 2.6; ww = 0.30; sill = 0.32; head = 0.74; }
  else if (typ < 2.5) { spacing = 3.0; ww = 0.40; }
  else if (typ < 3.5) { spacing = 3.8; ww = 0.30; sill = 0.18; head = 0.86; }
  else if (typ < 4.5) { spacing = 2.9; ww = 0.48; sill = 0.28; head = 0.80; }
  else if (typ < 5.5) { spacing = 2.2; ww = 0.70; sill = 0.32; head = 0.72; }
  else if (typ < 6.5) { spacing = 4.0; ww = 0.80; sill = 0.80; head = 0.92; }
  else { spacing = 3.3; ww = 0.40; }
  float u = fuv.x / spacing + lensHash(bHash * 7.1);
  float v = fuv.y / fh;
  cell = vec2(floor(u), floor(v));
  bay = lensHash2(cell + bHash * 13.0);
  vec2 f = fract(vec2(u, v));
  // Old-city windows jitter in size and position from bay to bay.
  float jw = typ > 0.5 && typ < 1.5 ? (bay - 0.5) * 0.12 : 0.0;
  float hx = ww * 0.5 + jw;
  float aa = max(fwidth(u), 1e-4) * 0.8;
  float aav = max(fwidth(v), 1e-4) * 0.8;
  float px = smoothstep(0.5 - hx - aa, 0.5 - hx + aa, f.x) * (1.0 - smoothstep(0.5 + hx - aa, 0.5 + hx + aa, f.x));
  float top = head;
  // Heritage: arched heads.
  if (typ > 2.5 && typ < 3.5) { float dx = (f.x - 0.5) / max(hx, 0.01); top = head - 0.10 + 0.10 * sqrt(max(0.0, 1.0 - dx * dx)); }
  float py = smoothstep(sill - aav, sill + aav, f.y) * (1.0 - smoothstep(top - aav, top + aav, f.y));
  float pane = px * py;
  float fx = smoothstep(0.5 - hx - 0.06 - aa, 0.5 - hx - 0.06 + aa, f.x) * (1.0 - smoothstep(0.5 + hx + 0.06 - aa, 0.5 + hx + 0.06 + aa, f.x));
  float fy = smoothstep(sill - 0.05 - aav, sill - 0.05 + aav, f.y) * (1.0 - smoothstep(top + 0.04 - aav, top + 0.04 + aav, f.y));
  return vec2(pane, max(0.0, fx * fy - pane));
}
`;

const FRAG_COLOR = /* glsl */ `
  decodePack();
  float isRoofLike = (bSurf == 1.0 || bSurf == 6.0 || bSurf == 7.0) ? 1.0 : 0.0;
  float fam = floor(bDistrict.r * 255.0 + 0.5);
  float pick = floor(lensHash(bHash * 3.7 + 0.31) * 4.0 * 0.999);
  // 12% of buildings borrow from the generic family so districts are not uniform.
  if (lensHash(bHash * 9.1) < 0.12) fam = 7.0;
  if (bTyp > 3.5 && bTyp < 4.5 && fam > 3.5 && fam < 5.5) fam = 3.0; // apartments are not exposed brick
  int wi = int(fam * 4.0 + pick);
  vec3 wallCol = uWallFam[0];
  for (int i = 1; i < 32; i++) { if (i == wi) wallCol = uWallFam[i]; }
  int pk = int(pick);
  if (bTyp > 2.5 && bTyp < 3.5) { for (int i = 0; i < 4; i++) if (i == pk) wallCol = uHeritagePal[i]; }
  if (bTyp > 5.5 && bTyp < 6.5) { for (int i = 0; i < 4; i++) if (i == pk) wallCol = uIndustrialPal[i]; }
  int ri = int(floor(lensHash(bHash * 5.3 + 0.7) * 8.0 * 0.999));
  vec3 roofCol = uRoofPal[0];
  for (int i = 1; i < 8; i++) { if (i == ri) roofCol = uRoofPal[i]; }
  // Old fabric roofs are grimier; planned/modern roofs cleaner.
  roofCol *= mix(1.0, 0.86, bDistrict.a);

  float jitter = (lensHash(bHash * 71.3) - 0.5) * 0.07;
  wallCol *= 1.0 + jitter;
  vec3 baseCol = wallCol;
  float rough = 0.86; float metal = 0.0;

  vec2 fuv = facadeUV();
  float fh = floorH(bTyp);
  float near = uDetail;

  if (bSurf == 0.0 || bSurf == 2.0 || bSurf == 3.0) {
    // ---- walls, parapets, stair cabins ----
    float y = vWorldPos.y;
    // Rain streaks and plaster weathering, strongest on old fabric.
    float streak = vnoise(vec2(fuv.x * 1.3, y * 0.08)) * vnoise(vec2(fuv.x * 0.21, y * 0.5));
    baseCol *= 1.0 - (0.10 + 0.14 * bDistrict.a) * streak * (0.4 + 0.6 * near);
    baseCol *= 1.0 - exp(-max(y, 0.0) / 1.8) * 0.20;     // splash grime at the plinth
    if (bSurf == 0.0) {
      // Plinth band.
      float plinth = 1.0 - smoothstep(0.55, 0.62, y);
      baseCol = mix(baseCol, baseCol * vec3(0.78, 0.76, 0.74), plinth);
      // Storey slab lines.
      float sl = fract(y / fh);
      float slab = (1.0 - smoothstep(0.0, 0.06, sl)) * step(1.0, y / fh);
      baseCol *= 1.0 - 0.10 * slab * near;
      // Windows (not on parapets / cabins, not on the ground floor of shops).
      vec2 cell; float bay;
      vec2 wm = windowMask(fuv, fh, bTyp, cell, bay);
      float storeys = bHeight / fh;
      float inFloors = step(0.85, y / fh) * (1.0 - step(storeys - 0.25, y / fh));
      bool shop = bTyp > 1.5 && bTyp < 2.5 && y < fh;
      if (shop) {
        // Bazaar ground floor: dark open bays between piers, rolling shutters, signboards.
        float bayU = fract(fuv.x / 3.4 + lensHash(bHash));
        float open = smoothstep(0.10, 0.14, bayU) * (1.0 - smoothstep(0.86, 0.90, bayU)) * (1.0 - smoothstep(2.55, 2.62, y));
        float shutter = step(0.55, lensHash2(vec2(floor(fuv.x / 3.4), bHash * 17.0)));
        vec3 inside = mix(vec3(0.10, 0.09, 0.08), vec3(0.42, 0.44, 0.45) * (0.85 + 0.15 * step(0.5, fract(y * 6.0))), shutter);
        baseCol = mix(baseCol, inside, open * (0.4 + 0.6 * near));
        float sign = smoothstep(2.62, 2.68, y) * (1.0 - smoothstep(3.25, 3.31, y));
        vec3 signCol = mix(vec3(0.70, 0.18, 0.12), mix(vec3(0.95, 0.80, 0.25), vec3(0.15, 0.35, 0.60), step(0.5, lensHash(floor(fuv.x / 6.0) + bHash * 3.0))), step(0.33, lensHash(floor(fuv.x / 6.0) * 1.3 + bHash)));
        baseCol = mix(baseCol, signCol, sign * 0.85 * near);
      } else {
        float wAmt = wm.x * inFloors;
        // Glass: dark interior with a cool sky reflection, kept subtle.
        vec3 glass = mix(vec3(0.07, 0.08, 0.09), vec3(0.30, 0.36, 0.42), 0.35 + 0.3 * bay);
        if (bTyp > 4.5 && bTyp < 5.5) glass = mix(glass, vec3(0.20, 0.30, 0.34), 0.5);
        float blend = mix(0.35, 0.95, near);
        baseCol = mix(baseCol, glass, wAmt * blend);
        baseCol = mix(baseCol, baseCol * 1.06 + 0.02, wm.y * inFloors * near * 0.5); // frames / lintels
        // Roughness stays constant: glossy sub-pixel window bands alias into stripes
        // under a low sun. Glass reads through colour alone.
      }
    } else if (bSurf == 2.0) {
      baseCol *= 0.94;
    } else {
      baseCol *= 0.97;
    }
  } else if (bSurf == 1.0) {
    // ---- flat RCC terrace ----
    float g = vnoise(vWorldPos.xz * 0.9) * 0.5 + vnoise(vWorldPos.xz * 0.17) * 0.5;
    baseCol = roofCol * (0.90 + 0.18 * g);
    float stain = smoothstep(0.55, 0.8, vnoise(vWorldPos.xz * 0.35 + bHash * 40.0));
    baseCol *= 1.0 - 0.12 * stain * near;
    rough = 0.92;
  } else if (bSurf == 4.0) { baseCol = vec3(0.035, 0.036, 0.038); rough = 0.45; }
  else if (bSurf == 5.0) { baseCol = vec3(0.70, 0.66, 0.58); rough = 0.5; }
  else if (bSurf == 6.0) {
    vec2 sp = fract(vWorldPos.xz * vec2(1.0, 0.55));
    float cellLine = step(0.94, max(sp.x, sp.y));
    baseCol = mix(vec3(0.045, 0.07, 0.13), vec3(0.55, 0.57, 0.6), cellLine * near);
    rough = 0.18; metal = 0.3;
  } else if (bSurf == 7.0) {
    // corrugated sheet: galvanised to rusty
    float corr = 0.5 + 0.5 * sin(dot(vWorldPos.xz, vec2(cos(bOrient * 6.283), sin(bOrient * 6.283))) * 9.0);
    vec3 galv = vec3(0.56, 0.58, 0.58); vec3 rust = vec3(0.45, 0.30, 0.22); vec3 blue = vec3(0.28, 0.40, 0.55);
    float t = lensHash(bHash * 2.9);
    baseCol = t < 0.55 ? galv : (t < 0.8 ? rust : blue);
    baseCol *= 0.88 + 0.12 * corr * near + 0.1 * vnoise(vWorldPos.xz * 0.3);
    rough = 0.55; metal = t < 0.55 ? 0.45 : 0.1;
  } else if (bSurf == 8.0) { baseCol = mix(wallCol, vec3(0.62, 0.60, 0.56), 0.5); }
  else if (bSurf == 9.0) { baseCol = vec3(0.72, 0.72, 0.70); rough = 0.6; }
  else if (bSurf == 10.0) {
    // landmark stone: lime plaster over lakhori brick, with mouldings every ~1.6 m
    float mould = smoothstep(0.0, 0.06, abs(fract(vWorldPos.y / 1.6) - 0.5) - 0.44);
    baseCol = vec3(0.80, 0.71, 0.52) * (0.92 + 0.12 * vnoise(vWorldPos.xz * 0.5 + vWorldPos.y * 0.3)) * (1.0 - 0.10 * mould);
    baseCol *= 1.0 - 0.15 * vnoise(vec2(fuv.x * 0.8, vWorldPos.y * 0.15));
    rough = 0.88;
  }
  else if (bSurf == 11.0) { baseCol = vec3(0.86, 0.83, 0.76) * (0.95 + 0.08 * vnoise(vWorldPos.xz * 0.6)); rough = 0.7; }
  else if (bSurf == 12.0) { baseCol = vec3(0.78, 0.60, 0.25); rough = 0.35; metal = 0.8; }
  else if (bSurf == 13.0) {
    // Glass on modern blocks; on heritage fabric the same surface is a deep arch opening.
    // Heritage: deep arch opening. Curtain walls: tinted glass with a sky reflection band
    // (no environment map, so the reflection is painted rather than left black).
    if (bTyp > 2.5 && bTyp < 3.5 && vWorldPos.y < 40.0 && bHeight < 50.0) baseCol = vec3(0.075, 0.065, 0.055);
    else {
      float sky = clamp(vWorldPos.y / max(bHeight, 1.0), 0.0, 1.0);
      baseCol = mix(vec3(0.20, 0.30, 0.33), vec3(0.50, 0.60, 0.64), sky * 0.7) * (0.9 + 0.2 * vnoise(vec2(fuv.x * 0.25, vWorldPos.y * 0.3)));
    }
    rough = 0.6;
  }
  else if (bSurf == 14.0) { baseCol = vec3(0.90, 0.86, 0.78); rough = 0.8; }
  else if (bSurf == 15.0) {
    // red sandstone / brick with coursing
    float course = smoothstep(0.0, 0.08, abs(fract(vWorldPos.y / 0.45) - 0.5) - 0.40);
    baseCol = vec3(0.56, 0.27, 0.19) * (0.90 + 0.14 * vnoise(vWorldPos.xz * 0.7 + vWorldPos.y)) * (1.0 - 0.10 * course * near);
    rough = 0.85;
  }

  if (uDebug > 0.5) { baseCol = wallCol * (bSurf == 1.0 ? 0.6 : 1.0); rough = 0.9; metal = 0.0; }
  // Baked contact AO.
  float aoStrength = mix(0.45 + 0.25 * near, 0.15, uNight);
  baseCol *= mix(1.0, bAO, aoStrength);

  // Style looks: "clear" = cooler, cleaner; "cyberpunk" = steel-blue stock.
  float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
  baseCol = mix(baseCol, mix(baseCol, vec3(lum) * vec3(0.96, 0.99, 1.04), 0.45), uClear);
  baseCol = mix(baseCol, vec3(lum) * vec3(0.55, 0.62, 0.95), uCyber * 0.85);
  // Night: surfaces read darker so emitted light carries the scene.
  baseCol *= mix(1.0, 0.5, uNight);

  diffuseColor.rgb *= baseCol;
  float bRough = rough; float bMetal = metal;
`;

const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = bRough;
`;
const FRAG_METAL = /* glsl */ `
  metalnessFactor = bMetal;
`;

/** Emissive city light, applied after lighting so windows survive tone mapping. */
const FRAG_OUTPUT = /* glsl */ `
  if (uNight > 0.01) {
    float dist = length(vWorldPos - uCameraPos);
    float density = bDistrict.g;                 // 0..1 district light density
    float commercial = bDistrict.b;
    // Building-level occupancy: denser and more commercial districts burn more lights.
    float occ = 0.30 + 0.45 * density + 0.20 * commercial;
    if (bTyp > 1.5 && bTyp < 2.5) occ += 0.25;          // bazaars
    if (bTyp > 3.5 && bTyp < 4.5) occ += 0.10;          // apartments
    if (bTyp > 4.5 && bTyp < 5.5) occ *= 0.55;          // offices empty at night
    if (bTyp > 5.5 && bTyp < 6.5) occ *= 0.35;          // industrial
    float litBldg = step(1.0 - clamp(occ, 0.05, 0.95), lensHash(bHash * 17.3 + 4.1));
    // Lamp colours: warm incandescent/LED, neutral, and the cool tube lights common in Indian homes.
    float lt = lensHash(bHash * 37.0);
    vec3 warm = vec3(1.0, 0.76, 0.48), neutral = vec3(1.0, 0.90, 0.76), cool = vec3(0.84, 0.94, 1.0);
    vec3 lampCol = lt < 0.45 ? warm : (lt < 0.70 ? neutral : cool);
    lampCol = mix(lampCol, mix(vec3(0.30, 0.97, 1.0), vec3(1.0, 0.38, 0.92), step(0.5, lensHash(bHash * 5.7))), uCyber);
    float fh = floorH(bTyp);

    if (bSurf == 0.0) {
      vec2 fuv = facadeUV();
      vec2 cell; float bay;
      vec2 wm = windowMask(fuv, fh, bTyp, cell, bay);
      float storeys = bHeight / fh;
      float v = vWorldPos.y / fh;
      float inFloors = step(0.85, v) * (1.0 - step(storeys - 0.25, v));
      // Floor-coherent occupancy: a household lights a run of adjacent windows.
      float floorOn = step(0.45, lensHash2(vec2(cell.y, floor(cell.x / 3.0)) + bHash * 7.0));
      float on = step(1.0 - clamp(occ * 0.8, 0.0, 0.85), bay) * floorOn * mix(0.25, 1.0, litBldg);
      vec3 winCol = mix(lampCol, lt < 0.7 ? cool : warm, step(0.8, lensHash2(cell * 1.7 + bHash)));
      float foot = max(fwidth(fuv.x / 3.0), fwidth(v));
      float blur = smoothstep(0.30, 1.10, foot);
      float paneF = mix(wm.x, 0.12, blur);
      float onF = mix(on, (occ * 0.6) * mix(0.25, 1.0, litBldg), blur);
      gl_FragColor.rgb += winCol * onF * paneF * inFloors * uNight * 0.95;
      // Bazaar shopfronts glow along the whole ground floor.
      if (bTyp > 1.5 && bTyp < 2.5 && vWorldPos.y < fh) {
        float bayU = fract(fuv.x / 3.4 + lensHash(bHash));
        float open = smoothstep(0.10, 0.14, bayU) * (1.0 - smoothstep(0.86, 0.90, bayU)) * (1.0 - smoothstep(2.55, 2.62, vWorldPos.y));
        float shopOn = step(0.25, lensHash2(vec2(floor(fuv.x / 3.4), bHash * 17.0)));
        gl_FragColor.rgb += vec3(1.0, 0.82, 0.55) * open * shopOn * uNight * 0.9;
        float sign = smoothstep(2.62, 2.68, vWorldPos.y) * (1.0 - smoothstep(3.25, 3.31, vWorldPos.y));
        gl_FragColor.rgb += vec3(1.0, 0.93, 0.80) * sign * shopOn * uNight * 0.55;
      }
      // Warm street spill on lower storeys, stronger in commercial districts.
      float nearness = 1.0 - smoothstep(250.0, 1400.0, dist);
      gl_FragColor.rgb += vec3(0.20, 0.14, 0.08) * (0.4 + commercial) * nearness * exp(-max(vWorldPos.y, 0.0) / 9.0) * uNight;
    }
    // Heritage fabric is floodlit from below.
    if (bTyp > 2.5 && bTyp < 3.5 && (bSurf == 0.0 || bSurf >= 10.0)) {
      float flood = exp(-max(vWorldPos.y, 0.0) / 14.0) * 0.65 + 0.12;
      gl_FragColor.rgb += vec3(1.0, 0.72, 0.40) * flood * uNight * 0.55;
    }
    // From altitude you see roofs and the light standing over each block: a per-building
    // constant ramped by distance, weighted to the district's light density.
    float spill = smoothstep(900.0, 6000.0, dist);
    float roofW = (bSurf == 1.0 || bSurf == 7.0) ? 1.0 : 0.4;
    vec3 spillCol = mix(lampCol, warm, 0.6);
    gl_FragColor.rgb += spillCol * litBldg * (0.25 + 0.75 * density) * spill * roofW * uNight * 0.45;
  }
`;

export interface BuildingMaterialUniforms {
  [k: string]: { value: unknown };
  uNight: { value: number };
  uDetail: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uCyber: { value: number };
  uClear: { value: number };
  uDebug: { value: number };
  uWallFam: { value: THREE.Vector3[] };
  uRoofPal: { value: THREE.Vector3[] };
  uHeritagePal: { value: THREE.Vector3[] };
  uIndustrialPal: { value: THREE.Vector3[] };
  uDistrict: { value: THREE.Texture };
  uDistrictXform: { value: THREE.Vector4 };
}

export class BuildingMaterialSystem {
  /** Full-detail material for the streamed tiles (base + detail streams). */
  public readonly solid: THREE.MeshStandardMaterial;
  /**
   * HLOD relief material — a separate instance with a depth bias so the streamed tiles
   * win wherever both extrude the same building (otherwise they z-fight).
   */
  public readonly hlodSolid: THREE.MeshStandardMaterial;
  /** Roof-cap-only fabric layer for city scale. */
  public readonly fabric: THREE.MeshStandardMaterial;

  private uniforms: BuildingMaterialUniforms;
  private isNight = true;
  private style: SkylineStyle = 'warm';

  constructor() {
    const fallback = new THREE.DataTexture(new Uint8Array([7, 110, 40, 60]), 1, 1, THREE.RGBAFormat);
    fallback.needsUpdate = true;
    this.uniforms = {
      uNight: { value: 1 },
      uDetail: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uCyber: { value: 0 },
      uClear: { value: 0 },
      uDebug: { value: 0 },
      uWallFam: { value: toLinear(WALL_FAMILIES) },
      uRoofPal: { value: toLinear(ROOF_PALETTE) },
      uHeritagePal: { value: toLinear(HERITAGE_WALL) },
      uIndustrialPal: { value: toLinear(INDUSTRIAL_WALL) },
      uDistrict: { value: fallback },
      uDistrictXform: { value: new THREE.Vector4(-22528, -22528, 1 / 45056, 0) },
    };

    this.solid = this.build({ roughness: 0.86, metalness: 0.0 }, 'solid');
    this.hlodSolid = this.build({
      roughness: 0.86, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    }, 'hlod');
    this.fabric = this.build({
      roughness: 0.95, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    }, 'fabric');

    void this.loadDistrictMap();
  }

  /** Load the district map baked by scripts/build_buildings.ts. */
  private async loadDistrictMap(): Promise<void> {
    try {
      const meta = await loadJSON<{ size: number; cell: number; originX: number; originZ: number }>('/ground/district_meta.json');
      const buf = await loadBuffer('/ground/district.bin');
      if (buf.byteLength !== meta.size * meta.size * 4) throw new Error('district.bin size mismatch');
      const tex = new THREE.DataTexture(new Uint8Array(buf), meta.size, meta.size, THREE.RGBAFormat);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.uniforms.uDistrict.value = tex;
      this.uniforms.uDistrictXform.value.set(meta.originX, meta.originZ, 1 / (meta.size * meta.cell), 0);
    } catch (e) {
      console.warn('[Buildings] district map unavailable, using neutral defaults:', e);
    }
  }

  private build(params: THREE.MeshStandardMaterialParameters, key: string): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, ...params });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <project_vertex>', `${VERT_MAIN}\n#include <project_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${FRAG_METAL}`)
        .replace('#include <fog_fragment>', `${FRAG_OUTPUT}\n#include <fog_fragment>`);
    };
    mat.customProgramCacheKey = () => `lens-bldg-v2-${key}`;
    // Exposed so SceneTween can interpolate uNight, palettes and style mixes.
    (mat as unknown as { uniforms: BuildingMaterialUniforms }).uniforms = this.uniforms;
    return mat;
  }

  public updateCamera(pos: THREE.Vector3): void {
    this.uniforms.uCameraPos.value.copy(pos);
  }

  /** 0 at full-city scale, 1 at street scale. Fades detail that would alias. */
  public setDetail(t: number): void {
    this.uniforms.uDetail.value = THREE.MathUtils.clamp(t, 0, 1);
  }

  /** Kept for API compatibility; haze is now scene fog (renderer.ts). */
  public setHorizon(_color: THREE.Color, _strength: number): void { /* no-op */ }

  public setNightMode(night: boolean): void {
    this.isNight = night;
    this.uniforms.uNight.value = night ? 1 : 0;
  }

  public setSkylineStyle(style: SkylineStyle): void {
    this.style = style;
    this.uniforms.uCyber.value = style === 'cyberpunk' ? 1 : 0;
    this.uniforms.uClear.value = style === 'clear' ? 1 : 0;
  }

  public getSkylineStyle(): SkylineStyle { return this.style; }
  /** Shared district map uniforms, so the ground glow samples the same texture. */
  public getDistrictUniforms(): { tex: { value: THREE.Texture }; xform: { value: THREE.Vector4 } } {
    return { tex: this.uniforms.uDistrict, xform: this.uniforms.uDistrictXform };
  }
  public getNight(): boolean { return this.isNight; }

  public dispose(): void {
    this.solid.dispose();
    this.hlodSolid.dispose();
    this.fabric.dispose();
  }
}
