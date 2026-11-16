import * as THREE from 'three';
import type { RoadClass } from './ribbon';

/**
 * Shared road surface material for the city overlay and the streamed tiles.
 *
 * Ribbons carry `aRoadUV` = (u across, -1 right .. +1 left; v metres along). The shader
 * builds the surface procedurally, so there are no textures to fetch:
 *   - asphalt grain at two scales, darker repair patches and tyre-polished wheel paths
 *   - dusty, lighter shoulders on minor roads (unkerbed Indian streets)
 *   - markings ONLY where they exist in practice: median kerb + lane dashes + edge lines
 *     on dual carriageways, centre dashes + edges on primary, centre dashes on secondary;
 *     nothing on residential lanes
 *   - at night, warm light pools spaced like the streetlights of that class
 * Everything resolves analytically (fwidth) so markings fade instead of shimmering.
 */

export const ROAD_DAY: Record<RoadClass, number> = {
  motorway: 0x3f4144,
  trunk: 0x434447,
  primary: 0x47484a,
  secondary: 0x4e4e4f,
  tertiary: 0x585654,
  residential: 0x63605b,
  service: 0x6b6760,
  footway: 0x8a8276,
  railway: 0x4a4744,
  flyover: 0x45474a,
};

export const ROAD_NIGHT: Record<RoadClass, number> = {
  motorway: 0x16171a, trunk: 0x17181b, primary: 0x18191c, secondary: 0x1a1b1e,
  tertiary: 0x1c1c1e, residential: 0x1d1d1f, service: 0x1e1e20, footway: 0x222224,
  railway: 0x18181a, flyover: 0x161719,
};

/** Light-pool strength and spacing (m) by class at night. 0 = unlit. */
const POOL: Record<RoadClass, [number, number]> = {
  motorway: [1.0, 39], trunk: [0.95, 38], primary: [0.85, 36], secondary: [0.7, 34],
  tertiary: [0.5, 47], residential: [0.28, 60], service: [0.15, 70], footway: [0.0, 1],
  railway: [0.0, 1], flyover: [1.0, 39],
};

/**
 * Markings: 0 none, 1 centre dash, 2 centre dash + edges, 3 multi-lane (lane dashes + edges).
 * Overture maps divided highways as one way per carriageway, so no class paints a median:
 * a painted median on each one-way way would put two medians on every divided road.
 */
const MARKS: Record<RoadClass, number> = {
  motorway: 3, trunk: 3, primary: 2, secondary: 1, tertiary: 0, residential: 0,
  service: 0, footway: 0, railway: 0, flyover: 3,
};

/** Nominal half widths so markings can be placed in metres. */
const HALF: Record<RoadClass, number> = {
  motorway: 11, trunk: 9, primary: 7, secondary: 5, tertiary: 4, residential: 2.6,
  service: 2.2, footway: 1, railway: 2.6, flyover: 7.5,
};

/** Shared across every road material so one write drives them all. */
export const roadUniforms = {
  uRoadNight: { value: 1 },
  uRoadCam: { value: new THREE.Vector3() },
};

export function createRoadMaterial(cls: RoadClass, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: ROAD_NIGHT[cls],
    roughness: cls === 'motorway' || cls === 'trunk' || cls === 'flyover' ? 0.78 : 0.9,
    metalness: 0,
    ...extra,
  });
  const [poolI, poolSp] = POOL[cls];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRoadNight = roadUniforms.uRoadNight;
    shader.uniforms.uRoadCam = roadUniforms.uRoadCam;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRoadUV;\nvarying vec2 vRoadUV;\nvarying vec3 vRoadW;')
      .replace('#include <project_vertex>', 'vRoadUV = aRoadUV;\nvRoadW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying vec2 vRoadUV;
varying vec3 vRoadW;
uniform float uRoadNight;
uniform vec3 uRoadCam;
float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(rh(i),rh(i+vec2(1,0)),f.x), mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),f.x), f.y); }
float band(float x, float c, float w){ float d = abs(x - c); float aa = fwidth(x) * 0.75 + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, d); }
float dash(float v, float on, float period){ float f = fract(v / period) * period; float aa = fwidth(v) + 1e-4; return smoothstep(0.0, aa, f) * (1.0 - smoothstep(on - aa, on + aa, f)); }
`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
  {
    float dist = length(vRoadW - uRoadCam);
    float near = 1.0 - smoothstep(400.0, 2600.0, dist);
    vec2 wp = vRoadW.xz;
    // Grain + repair patches + wheel paths.
    float g = rn(wp * 1.7) * 0.5 + rn(wp * 0.23) * 0.5;
    float patchy = smoothstep(0.62, 0.70, rn(wp * 0.045 + 7.0));
    float u = vRoadUV.x;
    float wheel = 1.0 - 0.06 * (band(fract(abs(u) * 2.0), 0.5, 0.12)) * ${MARKS[cls] > 0 ? '1.0' : '0.0'};
    vec3 c = diffuseColor.rgb * (0.90 + 0.16 * g) * (1.0 - 0.10 * patchy * near) * wheel;
    // Dusty unkerbed shoulders on minor roads.
    float shoulder = smoothstep(0.62, 1.0, abs(u)) * ${MARKS[cls] >= 2 ? '0.15' : '0.55'};
    c = mix(c, vec3(0.44, 0.40, 0.34) * (0.85 + 0.3 * g), shoulder * (1.0 - uRoadNight * 0.7));
    // Markings in metres across.
    float um = u * ${HALF[cls].toFixed(2)};
    float hw = ${HALF[cls].toFixed(2)};
    float m = 0.0; vec3 mc = vec3(0.86, 0.85, 0.80);
    ${MARKS[cls] === 3 ? `
      m = max(m, band(um, 0.0, 0.07) * dash(vRoadUV.y, 3.0, 7.5));            // centre lane line
      m = max(m, band(abs(um), hw * 0.5, 0.07) * dash(vRoadUV.y, 3.0, 7.5));  // lane lines
      m = max(m, band(abs(um), hw - 0.45, 0.08));                              // edge lines
    ` : MARKS[cls] === 2 ? `
      m = max(m, band(um, 0.0, 0.07) * dash(vRoadUV.y, 3.0, 7.5));
      m = max(m, band(abs(um), hw - 0.4, 0.07) * 0.85);
    ` : MARKS[cls] === 1 ? `
      m = max(m, band(um, 0.0, 0.06) * dash(vRoadUV.y, 2.5, 8.0) * 0.8);
    ` : ''}
    // Paint is worn and dusty, and dims at night (no retroreflection without headlights).
    m *= (0.65 + 0.35 * rn(wp * 0.9)) * near * mix(1.0, 0.35, uRoadNight);
    c = mix(c, mc * mix(1.0, 0.25, uRoadNight), m);
    diffuseColor.rgb = c;
  }
`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
  {
    // Night: pools of warm light under the streetlights, staggered one side to the other,
    // plus a faint continuous wash so lit corridors still read from altitude.
    float pool = 0.0;
    ${poolI > 0 ? `
      float ph = fract(vRoadUV.y / ${poolSp.toFixed(1)});
      float side = mod(floor(vRoadUV.y / ${poolSp.toFixed(1)}), 2.0) * 2.0 - 1.0;
      float along = exp(-pow((ph - 0.5) * ${poolSp.toFixed(1)} / 9.0, 2.0));
      float across = exp(-pow((vRoadUV.x - side * 0.55) * 1.4, 2.0));
      float dist2 = length(vRoadW - uRoadCam);
      float resolve = smoothstep(4500.0, 1500.0, dist2);   // far away the pools average out
      pool = mix(0.38, along * (0.35 + 0.65 * across), resolve) * ${poolI.toFixed(2)};
    ` : ''}
    totalEmissiveRadiance += vec3(1.0, 0.70, 0.38) * pool * uRoadNight * 0.55;
  }
`);
  };
  mat.customProgramCacheKey = () => `lens-road-${cls}`;
  return mat;
}

/** Day/night colour (tweened by SceneTween through `color`). */
export function applyRoadPalette(mat: THREE.MeshStandardMaterial, cls: RoadClass, night: boolean): void {
  mat.color.setHex(night ? ROAD_NIGHT[cls] : ROAD_DAY[cls]);
  mat.emissive.setHex(0x000000);
}
