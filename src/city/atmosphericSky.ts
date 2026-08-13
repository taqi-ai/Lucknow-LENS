import * as THREE from 'three';

/**
 * AtmosphericSky — camera-following sky dome with procedural clouds, stars, and smooth transitions.
 *
 * Architecture:
 *  - Large inverted sphere centered on camera each frame
 *  - Procedural FBM noise for volumetric clouds
 *  - Procedural hash for twinkling stars
 *  - Smooth linear interpolation between DAY and NIGHT palettes over time
 *
 * Performance: 1 draw call, zero textures.
 */

// ─── Vertex Shader ─────────────────────────────────────────────────────────────
const SKY_VERT = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ─── Fragment Shader ───────────────────────────────────────────────────────────
const SKY_FRAG = /* glsl */ `
uniform vec3 uDayZenithColor;
uniform vec3 uDayHorizonColor;
uniform vec3 uNightZenithColor;
uniform vec3 uNightHorizonColor;
uniform float uNightBlend; // 0.0 = day, 1.0 = night
uniform float uTime;

varying vec3 vDirection;

// --- Noise Functions ---
// Hash function for stars
float hash(vec3 p) {
    p  = fract( p * 0.3183099 + .1 );
    p *= 17.0;
    return fract( p.x * p.y * p.z * (p.x + p.y + p.z) );
}

// 3D Simplex Noise for clouds (Ashima Arts)
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

// Fractal Brownian Motion for volumetric clouds
float fbm(vec3 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 4; i++) {
        f += w * snoise(p);
        p *= 2.0;
        w *= 0.5;
    }
    return f;
}

void main() {
  vec3 dir = normalize(vDirection);
  float elevation = dir.y; // -1 nadir, 0 horizon, +1 zenith

  // Interpolate day/night colors
  vec3 horizonColor = mix(uDayHorizonColor, uNightHorizonColor, uNightBlend);
  vec3 zenithColor = mix(uDayZenithColor, uNightZenithColor, uNightBlend);

  vec3 baseColor;
  if (elevation > 0.0) {
    // Smooth power-curve blend from horizon → zenith
    float t = pow(elevation, 0.4);
    baseColor = mix(horizonColor, zenithColor, t);
    
    // --- Stars ---
    // Generate stars only in the night sky (above horizon)
    // High-frequency hash for star positions
    float starHash = hash(dir * 200.0);
    // Threshold to make stars sparse (increased from 0.99 to 0.997 to reduce star count)
    float starIntensity = smoothstep(0.997, 1.0, starHash);
    starIntensity *= uNightBlend; // Only visible at night
    
    // Star color is slightly warm/blue
    vec3 starColor = vec3(0.9, 0.95, 1.0) * starIntensity * 2.0;

    // --- Clouds ---
    // Use the spherical direction vector directly to avoid infinite stretching at the horizon.
    // Squashing the Y-axis slightly makes the clouds look flatter and more like a real atmospheric layer.
    vec3 cloudPos = vec3(dir.x, dir.y * 1.5, dir.z);
    
    // Very slow cloud movement (significantly slowed down so they don't appear to dissolve quickly)
    cloudPos.z += uTime * 0.002;
    cloudPos.x += uTime * 0.001;
    
    // Cloud FBM scale: smaller multiplier = larger clouds.
    // Using 4.0 creates large, distinct formations.
    float cloudNoise = fbm(cloudPos * 4.0);
    
    // Threshold and smooth the noise to create fluffy shapes.
    // Adjusting these values increases the visible cloud coverage (around 25% of sky).
    float cloudCoverage = smoothstep(0.1, 0.6, cloudNoise);
    
    // Fade out clouds near horizon to blend seamlessly with fog
    float horizonFade = smoothstep(0.05, 0.25, elevation);
    cloudCoverage *= horizonFade;

    // Day clouds are white/bright, Night clouds are dark silhouettes but slightly illuminated by moonlight
    vec3 dayCloudColor = vec3(1.0, 1.0, 1.0);
    vec3 nightCloudColor = vec3(0.12, 0.16, 0.25); // Lighter blue so they are visible against the night sky
    vec3 targetCloudColor = mix(dayCloudColor, nightCloudColor, uNightBlend);

    // Apply Stars (occluded by clouds)
    baseColor += starColor * (1.0 - cloudCoverage);

    // Apply Clouds (blended over sky + stars)
    // At night, clouds are more translucent
    float cloudAlpha = cloudCoverage * mix(0.8, 0.4, uNightBlend);
    baseColor = mix(baseColor, targetCloudColor, cloudAlpha);

  } else {
    // Below horizon: purely horizon color. 
    // This perfectly matches the scene fog color, ensuring seamless ground blending.
    baseColor = horizonColor;
  }

  gl_FragColor = vec4(baseColor, 1.0);
}
`;

// ─── Color Palettes ────────────────────────────────────────────────────────────

interface SkyPalette {
  zenith: number;
  horizon: number;
  fog: number;
  fogDensity: number;
}

const DAY_PALETTE: SkyPalette = {
  zenith:   0x5ba3d9,  // Clear sky blue
  horizon:  0xc8dae8,  // Warm atmospheric haze
  fog:      0xc8dae8,  // Match horizon for seamless blending
  fogDensity: 0.000018,
};

const NIGHT_PALETTE: SkyPalette = {
  zenith:   0x050c1a,  // Deep starfield navy
  horizon:  0x0c1628,  // Dark blue atmospheric band (matched to fog)
  fog:      0x0c1628,  // Match horizon
  fogDensity: 0.000022,
};

// ─── AtmosphericSky Class ──────────────────────────────────────────────────────

export class AtmosphericSky {
  private skyMesh: THREE.Mesh | null = null;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private scene: THREE.Scene | null = null;
  
  private targetNightBlend = 1.0; // Assume start in night mode
  private currentNightBlend = 1.0;
  private lastTime = 0;
  
  // Need to track the current fog density for smooth interpolation
  private currentFogDensity = NIGHT_PALETTE.fogDensity;

  /**
   * Build the sky dome and add it to the scene.
   */
  public build(scene: THREE.Scene): void {
    this.scene = scene;
    this.dispose();

    // ── Sky Dome ──────────────────────────────────────────────────────────────
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uDayZenithColor:    { value: new THREE.Color(DAY_PALETTE.zenith) },
        uDayHorizonColor:   { value: new THREE.Color(DAY_PALETTE.horizon) },
        uNightZenithColor:  { value: new THREE.Color(NIGHT_PALETTE.zenith) },
        uNightHorizonColor: { value: new THREE.Color(NIGHT_PALETTE.horizon) },
        uNightBlend:        { value: this.currentNightBlend },
        uTime:              { value: 0.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    // Large sphere — must be smaller than camera far plane (150,000)
    // but large enough to always surround the scene
    const skyGeo = new THREE.SphereGeometry(80000, 48, 32);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.skyMesh.renderOrder = -1000; // Always render first (behind everything)
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);

    // Disable flat background — sky dome IS the background
    scene.background = null;

    // Initialize fog
    this.updateFog(this.currentNightBlend);
  }

  /**
   * Call every frame to keep the sky dome centered and animate shaders.
   * @param camera The active camera
   * @param timeMs Absolute time in milliseconds
   */
  public update(camera: THREE.Camera, timeMs: number = 0): void {
    if (this.skyMesh) {
      this.skyMesh.position.copy(camera.position);
    }
    
    if (this.skyMaterial) {
      const delta = (timeMs - this.lastTime) / 1000.0;
      this.lastTime = timeMs;
      
      // Advance time for clouds and stars (guard against huge deltas on resume)
      const safeDelta = Math.min(delta, 0.1); 
      this.skyMaterial.uniforms.uTime.value += safeDelta;
      
      // Smoothly interpolate day/night transition (~2 seconds to complete)
      if (Math.abs(this.currentNightBlend - this.targetNightBlend) > 0.001) {
        const speed = 0.5; // units per second
        const sign = Math.sign(this.targetNightBlend - this.currentNightBlend);
        this.currentNightBlend += sign * speed * safeDelta;
        
        // Clamp
        if (sign > 0 && this.currentNightBlend > this.targetNightBlend) this.currentNightBlend = this.targetNightBlend;
        if (sign < 0 && this.currentNightBlend < this.targetNightBlend) this.currentNightBlend = this.targetNightBlend;
        
        this.skyMaterial.uniforms.uNightBlend.value = this.currentNightBlend;
        
        // Also smoothly interpolate the fog
        this.updateFog(this.currentNightBlend);
      }
    }
  }

  /**
   * Trigger smooth transition between day and night palettes.
   */
  public setNightMode(night: boolean): void {
    this.targetNightBlend = night ? 1.0 : 0.0;
  }

  /**
   * Interpolate fog color and density smoothly.
   */
  private updateFog(blend: number): void {
    if (!this.scene) return;

    // Lerp color
    const dayColor = new THREE.Color(DAY_PALETTE.fog);
    const nightColor = new THREE.Color(NIGHT_PALETTE.fog);
    const currentColor = dayColor.clone().lerp(nightColor, blend);
    
    // Lerp density
    this.currentFogDensity = DAY_PALETTE.fogDensity + (NIGHT_PALETTE.fogDensity - DAY_PALETTE.fogDensity) * blend;

    if (this.scene.fog && (this.scene.fog as THREE.FogExp2).isFogExp2) {
      (this.scene.fog as THREE.FogExp2).color.copy(currentColor);
      (this.scene.fog as THREE.FogExp2).density = this.currentFogDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(currentColor, this.currentFogDensity);
    }
  }

  public dispose(): void {
    if (this.skyMesh) {
      if (this.skyMesh.parent) this.skyMesh.parent.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      this.skyMesh = null;
    }
    if (this.skyMaterial) {
      this.skyMaterial.dispose();
      this.skyMaterial = null;
    }
  }
}
