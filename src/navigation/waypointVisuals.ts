import * as THREE from 'three';
import { GPSTheme, NavigationRoute, RouteWaypoint } from './types';

const THEME_COLORS: Record<GPSTheme, { primary: number; secondary: number; beam: number }> = {
  cyan: {
    primary: 0x00f0ff,
    secondary: 0x0284c7,
    beam: 0x38bdf8,
  },
  neon: {
    primary: 0xf43f5e,
    secondary: 0xc026d3,
    beam: 0xe879f9,
  },
  amber: {
    primary: 0xfbbf24,
    secondary: 0xea580c,
    beam: 0xfde047,
  },
};

/**
 * Creates custom chevron GPS ribbon shader.
 * Includes three.js logarithmic depth buffer chunks for seamless z-rendering.
 */
function createRibbonShaderMaterial(theme: GPSTheme): THREE.ShaderMaterial {
  const colors = THEME_COLORS[theme];

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(colors.primary) },
      uColor2: { value: new THREE.Color(colors.secondary) },
      uOpacity: { value: 0.95 },
    },
    vertexShader: `
      varying vec2 vUv;
      #include <logdepthbuf_pars_vertex>

      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform float uOpacity;
      varying vec2 vUv;
      #include <logdepthbuf_pars_fragment>

      void main() {
        #include <logdepthbuf_fragment>

        // Forward flowing animated arrows (chevrons)
        float speed = 3.5;
        float repeatV = 0.5; // chevron density along road length
        float v = fract(vUv.y * repeatV - uTime * speed);

        // Chevron V-shape logic
        float uCentered = abs(vUv.x - 0.5) * 2.0; // 0 in center, 1 at edges
        float chevron = 1.0 - smoothstep(0.0, 0.45, abs(v - uCentered * 0.45));

        // Lateral edge fade
        float edgeFade = 1.0 - pow(uCentered, 4.0);

        // Center spine glow
        float centerGlow = 1.0 - smoothstep(0.0, 0.35, uCentered);

        // Blend gradient
        vec3 finalColor = mix(uColor2, uColor1, chevron * 0.7 + centerGlow * 0.4);
        float alpha = (chevron * 0.75 + centerGlow * 0.35 + 0.25) * edgeFade * uOpacity;

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Creates vertical GTA beam shader
 */
function createBeamShaderMaterial(theme: GPSTheme): THREE.ShaderMaterial {
  const colors = THEME_COLORS[theme];

  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colors.beam) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vAltitude;
      #include <logdepthbuf_pars_vertex>

      void main() {
        vUv = uv;
        vAltitude = position.y;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying float vAltitude;
      #include <logdepthbuf_pars_fragment>

      void main() {
        #include <logdepthbuf_fragment>

        // Vertical fade (strong at ground, fades into clouds at ~500m)
        float vertFade = clamp(1.0 - (vAltitude / 480.0), 0.0, 1.0);
        vertFade = pow(vertFade, 1.8);

        // Radial cylinder edge fade
        float radialFade = sin(vUv.x * 3.141592);

        // Pulsing shimmer
        float pulse = 0.85 + 0.15 * sin(uTime * 4.0 + vAltitude * 0.05);

        float alpha = vertFade * radialFade * pulse * 0.65;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export class WaypointVisuals {
  public group: THREE.Group;
  private ribbonMesh: THREE.Mesh | null = null;
  private ribbonMaterial: THREE.ShaderMaterial;
  private beamMaterial: THREE.ShaderMaterial;

  // Waypoint Beacon Objects
  private beaconGroup: THREE.Group;
  private beamMesh: THREE.Mesh;
  private markerMesh: THREE.Mesh;
  private pulseRings: THREE.Mesh[] = [];

  // Navigator Vehicle / Indicator Arrow
  private navigatorMesh: THREE.Group;
  private currentTheme: GPSTheme = 'cyan';

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'NavigationWaypointSystem';

    this.ribbonMaterial = createRibbonShaderMaterial(this.currentTheme);
    this.beamMaterial = createBeamShaderMaterial(this.currentTheme);

    // Build Waypoint Beacon
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.visible = false;
    this.group.add(this.beaconGroup);

    // 1. Vertical Light Column (480m tall cylinder)
    const beamGeo = new THREE.CylinderGeometry(4.5, 4.5, 480, 24, 1, true);
    beamGeo.translate(0, 240, 0); // Base at y = 0
    this.beamMesh = new THREE.Mesh(beamGeo, this.beamMaterial);
    this.beaconGroup.add(this.beamMesh);

    // 2. Hovering Diamond / Marker
    const markerGeo = new THREE.OctahedronGeometry(6.5, 0);
    markerGeo.scale(1.0, 1.8, 1.0);
    const markerMat = new THREE.MeshStandardMaterial({
      color: THEME_COLORS[this.currentTheme].primary,
      emissive: THEME_COLORS[this.currentTheme].primary,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.markerMesh = new THREE.Mesh(markerGeo, markerMat);
    this.markerMesh.position.y = 28;
    this.beaconGroup.add(this.markerMesh);

    // 3. Ground Ripple Rings
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(1.5, 22, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: THEME_COLORS[this.currentTheme].primary,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.4 + i * 0.05;
      this.pulseRings.push(ring);
      this.beaconGroup.add(ring);
    }

    // 4. Navigator Vehicle / Directional 3D Arrow
    this.navigatorMesh = this.buildNavigatorVehicle();
    this.navigatorMesh.visible = false;
    this.group.add(this.navigatorMesh);
  }

  private buildNavigatorVehicle(): THREE.Group {
    const nav = new THREE.Group();

    // Arrow / Car Body
    const bodyGeo = new THREE.ConeGeometry(3.5, 9, 4);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(1.0, 0.4, 1.0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: THEME_COLORS[this.currentTheme].primary,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.2,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    nav.add(bodyMesh);

    // Headlight cones
    const lightGeo = new THREE.ConeGeometry(5, 18, 12, 1, true);
    lightGeo.rotateX(-Math.PI / 2);
    lightGeo.translate(0, 0, 9);
    const lightMat = new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const headlights = new THREE.Mesh(lightGeo, lightMat);
    nav.add(headlights);

    nav.position.y = 1.0;
    return nav;
  }

  public setTheme(theme: GPSTheme): void {
    this.currentTheme = theme;
    const colors = THEME_COLORS[theme];

    this.ribbonMaterial.uniforms.uColor1.value.setHex(colors.primary);
    this.ribbonMaterial.uniforms.uColor2.value.setHex(colors.secondary);
    this.beamMaterial.uniforms.uColor.value.setHex(colors.beam);

    (this.markerMesh.material as THREE.MeshStandardMaterial).color.setHex(colors.primary);
    (this.markerMesh.material as THREE.MeshStandardMaterial).emissive.setHex(colors.primary);

    this.pulseRings.forEach((ring) => {
      (ring.material as THREE.MeshBasicMaterial).color.setHex(colors.primary);
    });
  }

  /**
   * Set Destination Waypoint Beacon in world coordinates
   */
  public setWaypoint(waypoint: RouteWaypoint | null): void {
    if (!waypoint) {
      this.beaconGroup.visible = false;
      return;
    }

    this.beaconGroup.position.set(waypoint.x, waypoint.y ?? 0, waypoint.z);
    this.beaconGroup.visible = true;
  }

  /**
   * Update or clear the 3D GPS route ribbon along path points
   */
  public setRoute(route: NavigationRoute | null): void {
    if (this.ribbonMesh) {
      this.group.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      this.ribbonMesh = null;
    }

    if (!route || route.points.length < 2) return;

    const geometry = this.buildRibbonGeometry(route.points, 4.0);
    this.ribbonMesh = new THREE.Mesh(geometry, this.ribbonMaterial);
    this.ribbonMesh.frustumCulled = false;
    this.group.add(this.ribbonMesh);
  }

  /**
   * Generates a 3D strip/ribbon along 3D polyline points with UVs for texture flow
   */
  private buildRibbonGeometry(
    points: Array<{ x: number; y: number; z: number }>,
    width: number
  ): THREE.BufferGeometry {
    const halfW = width * 0.5;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let totalDist = 0;
    const dists: number[] = [0];

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      totalDist += d;
      dists.push(totalDist);
    }

    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      let dirX = 0;
      let dirZ = 1;

      if (i < points.length - 1) {
        const next = points[i + 1];
        dirX = next.x - cur.x;
        dirZ = next.z - cur.z;
      } else if (i > 0) {
        const prev = points[i - 1];
        dirX = cur.x - prev.x;
        dirZ = cur.z - prev.z;
      }

      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;

      // Normal vector perpendicular to road direction (rotated 90 deg in XZ plane)
      const normX = -dirZ;
      const normZ = dirX;

      // Left vertex
      vertices.push(cur.x - normX * halfW, cur.y, cur.z - normZ * halfW);
      // Right vertex
      vertices.push(cur.x + normX * halfW, cur.y, cur.z + normZ * halfW);

      // UV coordinates (x: 0..1 across road, y: distance in meters / road width)
      const vCoord = dists[i] / width;
      uvs.push(0, vCoord);
      uvs.push(1, vCoord);

      if (i < points.length - 1) {
        const base = i * 2;
        // Two triangles for quad segment
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Position and orient the 3D Navigator arrow
   */
  public updateNavigator(
    pos: { x: number; y: number; z: number } | null,
    heading = 0,
    visible = true
  ): void {
    if (!pos || !visible) {
      this.navigatorMesh.visible = false;
      return;
    }

    this.navigatorMesh.visible = true;
    this.navigatorMesh.position.set(pos.x, pos.y + 1.2, pos.z);
    this.navigatorMesh.rotation.y = heading;
  }

  /**
   * Per-frame animation loop update for shaders and beacon pulsing
   */
  public update(timeMs: number): void {
    const sec = timeMs * 0.001;

    // 1. Advance GPS ribbon flow uniform
    this.ribbonMaterial.uniforms.uTime.value = sec;

    // 2. Advance beam shimmer
    this.beamMaterial.uniforms.uTime.value = sec;

    // 3. Hover and spin waypoint marker
    if (this.beaconGroup.visible) {
      this.markerMesh.rotation.y = sec * 1.8;
      this.markerMesh.position.y = 28 + Math.sin(sec * 3.0) * 4.5;

      // Pulse ground rings
      for (let i = 0; i < this.pulseRings.length; i++) {
        const ring = this.pulseRings[i];
        const ringTime = (sec * 1.2 + i * 0.4) % 1.0; // 0..1
        const scale = 0.5 + ringTime * 2.2;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - ringTime) * 0.85);
      }
    }
  }

  public dispose(): void {
    if (this.ribbonMesh) {
      this.ribbonMesh.geometry.dispose();
    }
    this.ribbonMaterial.dispose();
    this.beamMaterial.dispose();
    (this.markerMesh.material as THREE.Material).dispose();
    this.markerMesh.geometry.dispose();
    this.beamMesh.geometry.dispose();
    this.pulseRings.forEach((r) => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
  }
}
