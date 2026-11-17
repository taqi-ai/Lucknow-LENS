import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';

/**
 * GroundSurface — one continuous ground for the whole city.
 *
 * The map used to float over a single dark disc. This draws the baked ground raster
 * (scripts/py/build_ground.py: ESA WorldCover 10 m + Overture land use and water +
 * smoothed Copernicus DEM shading, 11 m/px over 45 km) as one textured plane, plus a
 * wide apron beyond the data edge that fades into the haze.
 *
 * Up close the 11 m pixels are broken up procedurally per surface class (from
 * ground_class.png): grass speckle on lawns and fields, compacted soil and gravel grain
 * on built ground, paving joints on plazas, crop rows on farmland, ripples of silt on
 * sand banks. At night the albedo drops and a warm glow rises from the district light
 * density, which is what makes the city read as lit from the air.
 *
 * The ground stays at the Y = 0 datum (just below it, under parks, water and roads).
 * Lucknow's relief is ~25 m over 40 km and GLO-30 is a surface model including
 * buildings and canopy, so elevation is used only for baked shading — see the report.
 */

export interface GroundMeta {
  size: number; cell: number; originX: number; originZ: number;
}

const GROUND_Y = -0.45;

export class GroundSurface {
  private regionMat: THREE.MeshLambertMaterial | null = null;
  public readonly group = new THREE.Group();
  public readonly material: THREE.MeshStandardMaterial;
  private apronMat: THREE.MeshStandardMaterial;
  private uniforms = {
    uGroundNight: { value: 1 },
    uGroundCam: { value: new THREE.Vector3() },
    uClassMap: { value: null as THREE.Texture | null },
    uGroundXform: { value: new THREE.Vector4(-22528, -22528, 1 / 45056, 0) },
    uDistrictG: { value: null as THREE.Texture | null },
    uDistrictXformG: { value: new THREE.Vector4(-22528, -22528, 1 / 45056, 0) },
  };

  constructor(districtTex: { value: THREE.Texture }, districtXform: { value: THREE.Vector4 }) {
    this.group.name = 'GroundSurface';
    this.uniforms.uDistrictG = districtTex as { value: THREE.Texture | null };
    this.uniforms.uDistrictXformG = districtXform;
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0 });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
        .replace('#include <project_vertex>', 'vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vGW;
uniform float uGroundNight;
uniform vec3 uGroundCam;
uniform sampler2D uClassMap;
uniform vec4 uGroundXform;
uniform sampler2D uDistrictG;
uniform vec4 uDistrictXformG;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }
`)
        .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
  {
    vec2 wp = vGW.xz;
    float dist = length(vGW - uGroundCam);
    float near = 1.0 - smoothstep(250.0, 2200.0, dist);
    // Dither the class lookup by a few metres so 11 m cells do not read as squares.
    vec2 j = (vec2(gn(wp * 0.11), gn(wp * 0.11 + 17.0)) - 0.5) * 9.0;
    vec2 cuv = (wp + j - uGroundXform.xy) * uGroundXform.z;
    cuv.y = 1.0 - cuv.y; // PNG loaded with flipY: image row 0 (north, min z) is v = 1
    float cls = floor(texture2D(uClassMap, cuv).r * 255.0 + 0.5);
    float g1 = gn(wp * 1.3), g2 = gn(wp * 0.21), g3 = gn(wp * 4.7);
    vec3 c = diffuseColor.rgb;
    float d = 0.0;
    if (cls == 4.0 || cls == 8.0 || cls == 11.0 || cls == 3.0 || cls == 7.0) {
      // grass / lawn / scrub: blade speckle and dry patches
      d = (g3 - 0.5) * 0.22 + (g1 - 0.5) * 0.12;
      c = mix(c, c * vec3(1.12, 1.04, 0.86), smoothstep(0.62, 0.8, g2) * 0.6);
    } else if (cls == 5.0 || cls == 14.0) {
      // crop rows along a field-specific direction
      float ang = gh(floor(wp / 120.0)) * 3.14159;
      float rows = sin(dot(wp, vec2(cos(ang), sin(ang))) * 2.4);
      d = rows * 0.06 + (g1 - 0.5) * 0.14;
    } else if (cls == 1.0 || cls == 12.0 || cls == 0.0 || cls == 15.0) {
      // compacted earth, gravel, worn paths between houses
      d = (g3 - 0.5) * 0.16 + (g1 - 0.5) * 0.10;
      c = mix(c, vec3(0.42, 0.38, 0.32), smoothstep(0.55, 0.75, gn(wp * 0.06)) * 0.25);
    } else if (cls == 9.0 || cls == 10.0) {
      // paving / yard concrete with joints
      vec2 t = fract(wp / 3.0);
      float joint = step(0.96, max(t.x, t.y));
      d = (g3 - 0.5) * 0.08 - joint * 0.12;
    } else if (cls == 13.0) {
      d = sin(wp.x * 0.7 + gn(wp * 0.05) * 6.0) * 0.05 + (g3 - 0.5) * 0.08;
    } else if (cls == 2.0) {
      d = (g1 - 0.5) * 0.25; // canopy shadow mottling
    }
    c *= 1.0 + d * near;
    // Desaturate slightly with distance (aerial perspective is handled by fog).
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l), 0.12);
    // Night: surfaces fall away; the light comes from the city glow below.
    c *= mix(1.0, 0.30, uGroundNight);
    diffuseColor.rgb = c;
  }
`)
        .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
  {
    // Manual bilinear: the district map is nearest-filtered (its R channel is a
    // palette index), but the glow must be smooth or the 176 m cells show as blocks.
    vec2 duv = (vGW.xz - uDistrictXformG.xy) * uDistrictXformG.z * 256.0 - 0.5;
    vec2 i0 = floor(duv), fr = duv - i0;
    vec4 d00 = texture2D(uDistrictG, (i0 + vec2(0.5, 0.5)) / 256.0);
    vec4 d10 = texture2D(uDistrictG, (i0 + vec2(1.5, 0.5)) / 256.0);
    vec4 d01 = texture2D(uDistrictG, (i0 + vec2(0.5, 1.5)) / 256.0);
    vec4 d11 = texture2D(uDistrictG, (i0 + vec2(1.5, 1.5)) / 256.0);
    vec4 dm = mix(mix(d00, d10, fr.x), mix(d01, d11, fr.x), fr.y);
    float glow = dm.g * (0.65 + 0.35 * dm.b);
    // The glow is light scattered over whole districts: invisible underfoot, it
    // only builds up when seen from altitude.
    float far = smoothstep(700.0, 7000.0, length(vGW - uGroundCam));
    totalEmissiveRadiance += vec3(1.0, 0.58, 0.26) * glow * glow * uGroundNight * (0.01 + 0.09 * far);
  }
`);
    };
    this.material.customProgramCacheKey = () => 'lens-ground-v1';
    (this.material as unknown as { uniforms: unknown }).uniforms = this.uniforms;

    // Apron: the land beyond the data extent, same average colour, fading into haze.
    this.apronMat = new THREE.MeshStandardMaterial({ color: 0x8e8f6c, roughness: 1, metalness: 0 });
  }

  public async init(): Promise<void> {
    let meta: GroundMeta;
    try {
      meta = await loadJSON<GroundMeta>('/ground/ground_meta.json');
    } catch (e) {
      console.warn('[Ground] ground_meta.json missing; run `npm run data:ground`', e);
      return;
    }
    const size = meta.size * meta.cell;
    this.uniforms.uGroundXform.value.set(meta.originX, meta.originZ, 1 / size, 0);

    const loader = new THREE.TextureLoader();
    const [albedo, cls] = await Promise.all([
      loader.loadAsync('/ground/ground_albedo.jpg'),
      loader.loadAsync('/ground/ground_class.png'),
    ]);
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.anisotropy = 8;
    albedo.wrapS = albedo.wrapT = THREE.ClampToEdgeWrapping;
    cls.magFilter = THREE.NearestFilter;
    cls.minFilter = THREE.NearestFilter;
    cls.generateMipmaps = false;
    cls.colorSpace = THREE.NoColorSpace;
    this.uniforms.uClassMap.value = cls;
    this.material.map = albedo;
    this.material.needsUpdate = true;

    // Plane: uv (0,0) at (originX, originZ). Row 0 of the raster is north (min z);
    // three's TextureLoader flips Y, so v increases northward in texture space.
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // After rotation the plane spans x [-s/2, s/2], z [-s/2, s/2] with uv.v = 1 at z = -s/2 (north).
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(meta.originX + size / 2, GROUND_Y, meta.originZ + size / 2);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);

    // Regional context (map refinement): a 264 km low-detail WorldCover ground under the detailed
    // 45 km city ground, so full zoom-out shows real countryside, towns and rivers, not a square.
    let apronInner = size * 0.7;
    try {
      const rm = await (await fetch('/ground/region_meta.json')).json() as { size: number; cell: number; originX: number; originZ: number };
      const rsize = rm.size * rm.cell;
      const rtex = await new THREE.TextureLoader().loadAsync('/ground/region_albedo.jpg');
      rtex.colorSpace = THREE.SRGBColorSpace; rtex.anisotropy = 4;
      this.regionMat = new THREE.MeshLambertMaterial({ map: rtex });
      this.regionMat.color.setRGB(1.22, 1.16, 1.06);   // match the brighter, slightly hazed detailed ground at the seam
      const rgeo = new THREE.PlaneGeometry(rsize, rsize, 1, 1); rgeo.rotateX(-Math.PI / 2);
      const region = new THREE.Mesh(rgeo, this.regionMat);
      region.position.set(rm.originX + rsize / 2, GROUND_Y - 0.6, rm.originZ + rsize / 2);
      region.name = 'groundRegion'; region.matrixAutoUpdate = false; region.updateMatrix();
      this.group.add(region);
      apronInner = rsize * 0.5;
    } catch { /* regional layer optional */ }

    // Apron ring out to the horizon so the data edge never shows as a cliff.
    const apronGeo = new THREE.RingGeometry(apronInner, 260000, 64, 1);
    apronGeo.rotateX(-Math.PI / 2);
    const apron = new THREE.Mesh(apronGeo, this.apronMat);
    apron.position.set(meta.originX + size / 2, GROUND_Y - 0.3, meta.originZ + size / 2);
    apron.name = 'groundApron';
    apron.matrixAutoUpdate = false;
    apron.updateMatrix();
    this.group.add(apron);
  }

  public update(camPos: THREE.Vector3): void {
    this.uniforms.uGroundCam.value.copy(camPos);
  }

  public setNightMode(night: boolean, cyber: boolean): void {
    this.uniforms.uGroundNight.value = night ? 1 : 0;
    this.apronMat.color.setHex(night ? 0x14161a : cyber ? 0x2b3247 : 0x8a8b6c);
    if (this.regionMat) { if (night) this.regionMat.color.setHex(0x2a2c30); else this.regionMat.color.setRGB(1.22, 1.16, 1.06); }
  }

  public setVisible(v: boolean): void { this.group.visible = v; }

  public dispose(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.material.map?.dispose();
    this.uniforms.uClassMap.value?.dispose();
    this.material.dispose();
    this.apronMat.dispose();
  }
}
