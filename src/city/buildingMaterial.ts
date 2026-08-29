import * as THREE from 'three';

/**
 * BuildingMaterialSystem — one shared material for every building in Lucknow.
 *
 * The previous approach allocated five wall + five roof MeshStandardMaterials and
 * bucketed geometry into them, which capped variation at ten flavours and forced ten
 * merge buckets per tile. Instead, every building vertex now carries a packed
 * attribute (`aPack`, 4 x uint8, produced by scripts/bake_hlod.ts and by the tile
 * worker) and the shader derives all variation from it:
 *
 *   x  hash    deterministic per-building seed -> palette, tint jitter, windows
 *   y  height  normalised (height / 80 m)      -> weathering, window density
 *   z  ao      baked contact occlusion         -> ground contact, canyon depth
 *   w  flags   bit0 isRoof, bits1-2 class, bits3-7 orientation
 *
 * Geometry deliberately carries no normal attribute. Buildings are hard-edged, so
 * flat normals are reconstructed per-fragment from screen-space derivatives. That
 * halves vertex bandwidth and sidesteps the smoothed-normal artefact produced by
 * calling computeVertexNormals() on merged extrusions.
 */

/**
 * Restrained Lucknow wall palette — warm whites through sandstone to weathered
 * grey. Deliberately low-saturation: the spread between entries is small enough
 * that the city reads as one material family, not a colour wheel.
 */
const WALL_PALETTE_DAY = [
  0xf1ece3, // warm ivory
  0xe8e1d6, // cream
  0xded7c9, // pale sandstone
  0xd8d2c8, // weathered plaster
  0xd2cbbe, // beige
  0xcbc7c0, // muted concrete
  0xc0b8ab, // dusty sandstone
  0xb5a998, // restrained brick-tinted render
];

/**
 * Roofs read darker than walls from the air, but only moderately so. An earlier
 * pass used values around 0x5c-0x6b, which is ~6x darker than the walls in linear
 * space and turned every rooftop into a black cap. Sun-bleached concrete and tar
 * felt sit closer to a 2-3x ratio.
 */
const ROOF_PALETTE_DAY = [
  0xa39a8e,
  0x968d82,
  0xab9f8f,
  0x8d857b,
  0xb08d71, // occasional terracotta-leaning concrete
  0x9c948a,
  0x8f877d,
  0xb2a695,
];

/**
 * Night walls are cool and dark but not black. At the previous values buildings
 * lost all massing and the city read as a void with floating windows; these keep
 * facades separable from the sky and from each other.
 */
const WALL_PALETTE_NIGHT = [
  0x3f4854, 0x3a434e, 0x434c58, 0x353d47,
  0x3c4551, 0x373f4a, 0x414a56, 0x323a44,
];

/**
 * Roofs are the surface you actually see from altitude, so they set how the night
 * city reads. Kept dark on purpose: with aerial perspective disabled there is
 * nothing else attenuating distant buildings, and a lighter roof value turned the
 * whole city into a field of cool white speckle that drowned the warm window glow.
 */
const ROOF_PALETTE_NIGHT = [
  0x232a33, 0x20262e, 0x262d36, 0x1d232b,
  0x222831, 0x1f252d, 0x252b34, 0x1b2129,
];

/** User-selectable skyline looks. Day palette + night palette + light colour. */
export type SkylineStyle = 'warm' | 'clear' | 'cyberpunk';

/** Neutral, cooler daytime stone — the "clear white Lucknow" look. */
const WALL_PALETTE_CLEAR = [
  0xf4f5f6, 0xeceef0, 0xe3e6e9, 0xdcdfe3,
  0xd5d9dd, 0xcdd2d7, 0xc4cad0, 0xb9c0c7,
];
const ROOF_PALETTE_CLEAR = [
  0xa8adb2, 0x9ba0a6, 0xb0b5ba, 0x91969c,
  0x9fa4aa, 0x969ba1, 0x8d9298, 0xb4b9bf,
];

/** Neon night city. Deep indigo stock, saturated cyan/magenta light. */
const WALL_PALETTE_CYBER = [
  0x1b1f3a, 0x181b33, 0x1f2340, 0x15182d,
  0x1d2138, 0x171a30, 0x212545, 0x131629,
];
const ROOF_PALETTE_CYBER = [
  0x101430, 0x0e1129, 0x131734, 0x0c0f24,
  0x11142e, 0x0f1228, 0x141838, 0x0a0d20,
];
const WALL_PALETTE_CYBER_DAY = [
  0x2a3050, 0x262b48, 0x2f3557, 0x222741,
  0x2c3252, 0x282d4a, 0x31375a, 0x1f243c,
];

function paletteToVec3Array(hexes: number[]): THREE.Vector3[] {
  return hexes.map((h) => {
    const c = new THREE.Color(h);
    c.convertSRGBToLinear();
    return new THREE.Vector3(c.r, c.g, c.b);
  });
}

const VERT_PARS = /* glsl */ `
attribute vec4 aPack;
varying vec4 vPack;
varying vec3 vWorldPos;
`;

const VERT_MAIN = /* glsl */ `
vPack = aPack;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vPack;
varying vec3 vWorldPos;

uniform vec3 uWallPalette[8];
uniform vec3 uRoofPalette[8];
uniform float uNight;
uniform vec3 uHorizonColor;
uniform float uAerialStrength;
uniform float uDetail;      // 0 at city scale -> 1 at street scale
uniform vec3 uCameraPos;
uniform float uCyber;   // 0 = normal, 1 = cyberpunk

/**
 * Mean coverage of the window pane function over one cell, integrated
 * analytically: the x factor is on for 0.28 of the cell plus half of its two
 * 0.10 smoothstep ramps (0.38), the y factor for 0.20 plus the same (0.30).
 * This is the value the grid converges to once a cell falls below one pixel.
 */
#define PANE_MEAN 0.114

float lensHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float lensHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

/**
 * Replaces the whole diffuse-colour stage. Runs before lighting so the result feeds
 * the standard PBR pipeline rather than being pasted on top of it.
 */
const FRAG_COLOR = /* glsl */ `
  float packHash   = vPack.x;
  float heightNorm = vPack.y;
  float bakedAO    = vPack.z;
  float flags      = floor(vPack.w * 255.0 + 0.5);

  float isRoof = mod(flags, 2.0);
  float cls    = mod(floor(flags / 2.0), 4.0);
  float orient = floor(flags / 8.0) / 32.0;

  int paletteIdx = int(floor(packHash * 8.0 * 0.999));

  vec3 wallCol = uWallPalette[0];
  vec3 roofCol = uRoofPalette[0];
  for (int i = 1; i < 8; i++) {
    if (i == paletteIdx) { wallCol = uWallPalette[i]; roofCol = uRoofPalette[i]; }
  }

  vec3 baseCol = mix(wallCol, roofCol, isRoof);

  // Subtle deterministic tint jitter so neighbours differ without the city
  // turning into confetti. +/-4% only.
  float jitter = (lensHash(packHash * 71.3) - 0.5) * 0.08;
  baseCol *= (1.0 + jitter);

  // Taller buildings skew slightly cooler and cleaner; low-rise skews warmer and
  // more weathered. Reads as a real material gradient across the skyline.
  baseCol = mix(baseCol * vec3(1.03, 1.005, 0.96), baseCol * vec3(0.97, 0.99, 1.04), heightNorm);

  // --- Vertical weathering on walls -----------------------------------------
  // Grime accumulates near the ground; upper storeys stay cleaner.
  float storeyY = max(vWorldPos.y, 0.0);
  float grime = exp(-storeyY / 6.0) * 0.22 * (1.0 - isRoof);
  baseCol *= (1.0 - grime);

  // --- Facade banding --------------------------------------------------------
  // Floor lines at ~3.2 m, aligned to the building's own longest edge. Faded out
  // at city scale where it would alias, and never applied to roofs.
  float bandPhase = storeyY / 3.2 + lensHash(packHash * 13.7);
  float band = smoothstep(0.02, 0.10, abs(fract(bandPhase) - 0.5));
  float bandAmt = (1.0 - isRoof) * uDetail * 0.10;
  baseCol *= mix(1.0, 0.78 + 0.22 * band, bandAmt);

  // --- Baked ambient occlusion ----------------------------------------------
  // Ground contact and street-canyon darkening. Kept gentle so the city never
  // goes muddy; strengthened slightly as you descend. At night there is very
  // little indirect light to occlude in the first place, and a full-strength AO
  // term pushed facades to black, so it is dialled back.
  float aoStrength = mix(0.55 + 0.25 * uDetail, 0.10, uNight);
  baseCol *= mix(1.0, bakedAO, aoStrength);

  // Grime is a daylight read; at night it just removes what little value is left.
  baseCol = mix(baseCol, baseCol / max(1.0 - grime, 0.5), uNight * 0.3);

  diffuseColor.rgb *= baseCol;
`;

/**
 * Night windows + aerial perspective, applied after lighting so emissive windows
 * survive tone mapping and haze desaturates the far city as a whole.
 */
const FRAG_OUTPUT = /* glsl */ `
  float nFlags  = floor(vPack.w * 255.0 + 0.5);
  float nIsRoof = mod(nFlags, 2.0);
  float nCls    = mod(floor(nFlags / 2.0), 4.0);
  float nOrient = floor(nFlags / 8.0) / 32.0;
  float nHash   = vPack.x;

  float dist = length(vWorldPos - uCameraPos);

  // --- Aerial perspective ----------------------------------------------------
  // Distance haze that desaturates toward the horizon colour. This is what makes
  // the city read as enormous; FogExp2 alone only darkens.
  // Applied to the SURFACE only. City lights are added afterwards, because light
  // emitted toward the camera is exactly what stays visible through haze — folding
  // them in before this mix pushed the whole night skyline to black.
  // Aerial perspective haze removed entirely per user request.
  float haze = 0.0;

  // --- Night city lights -----------------------------------------------------
  if (uNight > 0.01) {
    // Haze still dims lights, just far less aggressively than it dims surfaces.
    float lightHaze = 1.0 - haze * 0.45;

    // Per-building state. Constant over the whole building, so nothing derived
    // from it can shimmer when the camera moves.
    float litBldg    = step(0.42, lensHash(nHash * 17.3 + 4.1));
    float commercial = nCls > 0.5 ? 1.45 : 1.0;

    // ONE light colour for the whole night model, and a desaturated one.
    //
    // The old far term used saturated sodium (1.0, 0.74, 0.44). At range it was
    // driven so hard that it clipped to white, which is the only reason the city
    // ever looked white from altitude. As soon as the exposure came down through
    // the mid distances that same value stopped clipping and showed its real hue,
    // so the city passed through a gold band on every zoom. A single desaturated
    // lamp colour holds one hue at every distance, and never needs to clip to
    // look right.
    vec3 lampWarm = mix(vec3(1.0, 0.94, 0.84), vec3(1.0, 0.88, 0.72), lensHash(nHash * 37.0));
    lampWarm = mix(lampWarm, mix(vec3(0.30, 0.97, 1.0), vec3(1.0, 0.38, 0.92),
                                 step(0.5, lensHash(nHash * 5.7))), uCyber);

    // --- Windows ---------------------------------------------------------------
    // No distance fade. The grid is filtered analytically instead: once a window
    // cell shrinks below a pixel the pattern collapses to its own average rather
    // than being point-sampled. Point-sampling a sub-pixel grid is exactly what
    // made the zoomed-out city crawl and flicker while the camera moved and sit
    // still when it stopped, and fading it out was what forced a second lighting
    // model to exist at all.
    if (nIsRoof < 0.5) {
      float ang = nOrient * 6.2831853;
      vec2 dir = vec2(cos(ang), sin(ang));
      float u = dot(vWorldPos.xz, dir) / 3.6;
      float v = vWorldPos.y / 3.2;

      // Screen-space footprint of one cell, in cells.
      float foot = max(fwidth(u), fwidth(v));
      float blur = smoothstep(0.30, 1.10, foot);

      // Most windows stay dark. Commercial stock keeps more lights on, which is
      // what builds the district-level brightness hierarchy.
      float litChance  = nCls > 0.5 ? 0.70 : 0.40;
      float storeyMask = step(1.0, v) * (1.0 - step(vPack.y * 80.0 / 3.2 - 1.0, v));

      vec2  cell = vec2(floor(u), floor(v));
      float lit  = lensHash2(cell + nHash * 91.0);
      float on   = step(1.0 - litChance, lit) * storeyMask;

      vec2  f = fract(vec2(u, v));
      float pane = smoothstep(0.26, 0.36, f.x) * (1.0 - smoothstep(0.64, 0.74, f.x))
                 * smoothstep(0.30, 0.40, f.y) * (1.0 - smoothstep(0.60, 0.70, f.y));

      // Converge to the analytic means of each factor.
      float onF   = mix(on,   litChance * storeyMask, blur);
      float paneF = mix(pane, PANE_MEAN,              blur);

      gl_FragColor.rgb += lampWarm * onF * paneF * uNight * lightHaze * 2.9;
    }

    // Street-level bounce. Up close the window grid is the only thing emitting,
    // which left facades reading as black cutouts with floating panes. Real
    // streets are lit from below by spill off the carriageway, so lower storeys
    // pick up a warm wash that decays with height.
    float nearness = 1.0 - smoothstep(300.0, 1400.0, dist);
    float bounce = (1.0 - nIsRoof) * nearness * exp(-max(vWorldPos.y, 0.0) / 16.0);
    gl_FragColor.rgb += vec3(0.13, 0.11, 0.085) * bounce * uNight;

    // --- Ambient block spill ---------------------------------------------------
    // From the air you are looking at roofs and at the light standing over each
    // block, not at facades. A per-building constant ramped purely by distance:
    // it cannot alias, and weighting it toward roofs keeps it from washing walls
    // warm at mid range, which is what produced the gold band.
    // The ramp is deliberately long and starts late. smoothstep is very flat near
    // its lower edge, so neighbourhood range stays as dark as street range — the
    // two now differ in window density rather than in overall brightness, which is
    // what removes the visible "stage" between them — and the city only lifts to
    // its full lit-from-altitude value once buildings are genuinely small.
    float spill     = smoothstep(800.0, 5000.0, dist);
    float spillSurf = mix(0.35, 1.0, nIsRoof);
    gl_FragColor.rgb += lampWarm * litBldg * commercial * spill * spillSurf
                      * uNight * lightHaze * 1.3;
  }
`;


export interface BuildingMaterialUniforms {
  uNight: { value: number };
  uHorizonColor: { value: THREE.Color };
  uAerialStrength: { value: number };
  uDetail: { value: number };
  uCameraPos: { value: THREE.Vector3 };
  uCyber: { value: number };
  uWallPalette: { value: THREE.Vector3[] };
  uRoofPalette: { value: THREE.Vector3[] };
}

export class BuildingMaterialSystem {
  /** Full-detail material for the streamed tiles. */
  public readonly solid: THREE.MeshStandardMaterial;
  /**
   * Full-detail material for the HLOD relief stream.
   *
   * A SEPARATE instance from `solid`, and that separation is the whole point.
   * Relief and the streamed tiles extrude the same buildings from the same
   * source, so inside the streamed radius the two draw identical geometry at
   * identical depth. Sharing one material meant identical fragments with
   * identical depth values, which z-fights: stable while the camera is still,
   * and shimmering the moment it moves.
   *
   * The fix is a depth bias, not a cull. Pushing relief fractionally behind the
   * tiles makes the tiles win that depth test everywhere the two coincide, which
   * settles the fight deterministically and needs no knowledge of what the
   * streamer has loaded. Discarding relief inside a "covered" disc was tried and
   * reverted: coverage is genuinely hard to know (in-frustum tiles, tiles with no
   * buildings, tiles mid-load), and a fragment discard does not affect the shadow
   * pass, so culled buildings kept casting shadows onto ground that no longer had
   * anything standing on it.
   */
  public readonly hlodSolid: THREE.MeshStandardMaterial;
  /** Flat roof-cap material for the city-scale fabric layer — cheaper lighting. */
  public readonly fabric: THREE.MeshStandardMaterial;

  private uniforms: BuildingMaterialUniforms;
  private isNight = true;

  private style: SkylineStyle = 'warm';

  private clearWall = paletteToVec3Array(WALL_PALETTE_CLEAR);
  private clearRoof = paletteToVec3Array(ROOF_PALETTE_CLEAR);
  private cyberWall = paletteToVec3Array(WALL_PALETTE_CYBER);
  private cyberRoof = paletteToVec3Array(ROOF_PALETTE_CYBER);
  private cyberDayWall = paletteToVec3Array(WALL_PALETTE_CYBER_DAY);

  private dayWall = paletteToVec3Array(WALL_PALETTE_DAY);
  private dayRoof = paletteToVec3Array(ROOF_PALETTE_DAY);
  private nightWall = paletteToVec3Array(WALL_PALETTE_NIGHT);
  private nightRoof = paletteToVec3Array(ROOF_PALETTE_NIGHT);

  constructor() {
    this.uniforms = {
      uNight: { value: 1 },
      uHorizonColor: { value: new THREE.Color(0x0c1628).convertSRGBToLinear() },
      uAerialStrength: { value: 0.000045 },
      uDetail: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uCyber: { value: 0 },
      uWallPalette: { value: this.nightWall },
      uRoofPalette: { value: this.nightRoof },
    };

    this.solid = this.build({ roughness: 0.82, metalness: 0.02 });
    // Same look, pushed fractionally away from the eye so the streamed tiles win
    // wherever both extrude the same building.
    this.hlodSolid = this.build({
      roughness: 0.82,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    // The fabric layer is viewed from far above and almost edge-on to the sun;
    // flat shading with a touch more roughness keeps it calm and alias-free.
    // Polygon offset pushes it fractionally behind the relief stream so the two
    // can be drawn together without z-fighting on shared roof caps.
    this.fabric = this.build({
      roughness: 0.95,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 4,
    });
  }

  private build(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      // Buildings are hard-edged, so normals come from screen-space derivatives via
      // three's own FLAT_SHADED path. That means the geometry carries no normal
      // attribute at all — half the vertex bandwidth, and it sidesteps the smoothed
      // normals that computeVertexNormals() produced on merged extrusions.
      flatShading: true,
      ...params,
    });

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <project_vertex>', `${VERT_MAIN}\n#include <project_vertex>`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace('#include <fog_fragment>', `${FRAG_OUTPUT}\n#include <fog_fragment>`);
    };

    // Force a distinct program per material instance so the two variants don't
    // collide in three's shader cache.
    mat.customProgramCacheKey = () => `lens-bldg-${params.roughness}`;
    return mat;
  }

  /** Per-frame: camera position drives aerial perspective. */
  public updateCamera(pos: THREE.Vector3): void {
    this.uniforms.uCameraPos.value.copy(pos);
  }

  /** 0 at full-city scale, 1 at street scale. Fades detail that would alias. */
  public setDetail(t: number): void {
    this.uniforms.uDetail.value = THREE.MathUtils.clamp(t, 0, 1);
  }

  /** Keep haze matched to whatever the sky is currently showing at the horizon. */
  public setHorizon(color: THREE.Color, strength: number): void {
    this.uniforms.uHorizonColor.value.copy(color).convertSRGBToLinear();
    this.uniforms.uAerialStrength.value = strength;
  }

  public setNightMode(night: boolean): void {
    this.isNight = night;
    this.uniforms.uNight.value = night ? 1 : 0;
    this.applyPalette();
  }

  /** Switch the skyline look. Purely a palette + light-colour swap, no rebuild. */
  public setSkylineStyle(style: SkylineStyle): void {
    this.style = style;
    this.uniforms.uCyber.value = style === 'cyberpunk' ? 1 : 0;
    this.applyPalette();
  }

  public getSkylineStyle(): SkylineStyle { return this.style; }

  private applyPalette(): void {
    const night = this.isNight;
    let wall: THREE.Vector3[];
    let roof: THREE.Vector3[];
    if (this.style === 'cyberpunk') {
      wall = night ? this.cyberWall : this.cyberDayWall;
      roof = night ? this.cyberRoof : this.cyberRoof;
    } else if (this.style === 'clear') {
      wall = night ? this.nightWall : this.clearWall;
      roof = night ? this.nightRoof : this.clearRoof;
    } else {
      wall = night ? this.nightWall : this.dayWall;
      roof = night ? this.nightRoof : this.dayRoof;
    }
    this.uniforms.uWallPalette.value = wall;
    this.uniforms.uRoofPalette.value = roof;
  }

  public dispose(): void {
    this.solid.dispose();
    this.fabric.dispose();
  }
}
