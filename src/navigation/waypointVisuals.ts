import * as THREE from 'three';
import { GPSTheme, NavigationRoute, RouteWaypoint } from './types';

const THEME_COLORS: Record<GPSTheme, { primary: number; secondary: number; beam: number }> = {
  purple: {
    primary: 0xc084fc, // vibrant glowing GTA purple
    secondary: 0x9333ea, // deep royal purple
    beam: 0xd946ef, // bright purple-magenta laser
  },
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
function createRibbonShaderMaterial(theme: GPSTheme, isAlternative = false): THREE.ShaderMaterial {
  const colors = THEME_COLORS[theme];
  const col1 = isAlternative ? 0x38bdf8 : colors.primary;
  const col2 = isAlternative ? 0x0369a1 : colors.secondary;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(col1) },
      uColor2: { value: new THREE.Color(col2) },
      uOpacity: { value: isAlternative ? 0.55 : 0.95 },
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
        float speed = 2.8;
        float repeatV = 0.40; // chevron density along road length
        float v = fract(vUv.y * repeatV - uTime * speed);

        // Chevron V-shape logic
        float uCentered = abs(vUv.x - 0.5) * 2.0; // 0 in center, 1 at edges
        float chevron = 1.0 - smoothstep(0.0, 0.45, abs(v - uCentered * 0.45));

        // Lateral edge fade and crisp highlighted track borders
        float edgeFade = 1.0 - pow(uCentered, 4.0);
        float edgeBorder = smoothstep(0.70, 0.95, uCentered) * 0.6;

        // Center spine glow
        float centerGlow = 1.0 - smoothstep(0.0, 0.35, uCentered);

        // Blend gradient
        vec3 finalColor = mix(uColor2, uColor1, chevron * 0.65 + centerGlow * 0.45);
        float alpha = (chevron * 0.65 + centerGlow * 0.45 + edgeBorder + 0.35) * edgeFade * uOpacity;

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
  private altRibbonMeshes: THREE.Mesh[] = [];

  private ribbonMaterial: THREE.ShaderMaterial;
  private altRibbonMaterial: THREE.ShaderMaterial;
  private beamMaterial: THREE.ShaderMaterial;

  // Origin Marker Objects (Cyan Highlight per Phase 3 specifications)
  private originGroup: THREE.Group;
  private originMarker: THREE.Mesh;
  private originRings: THREE.Mesh[] = [];

  // Destination Waypoint Beacon Objects (GTA Purple Pillar/Laser Beam)
  private beaconGroup: THREE.Group;
  private beamMesh: THREE.Mesh;
  private markerMesh: THREE.Mesh;
  private pulseRings: THREE.Mesh[] = [];

  // Navigator Vehicle
  private navigatorMesh: THREE.Group;
  private currentTheme: GPSTheme = 'purple';

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'NavigationWaypointSystem';

    this.ribbonMaterial = createRibbonShaderMaterial(this.currentTheme, false);
    this.altRibbonMaterial = createRibbonShaderMaterial(this.currentTheme, true);
    this.beamMaterial = createBeamShaderMaterial(this.currentTheme);

    // ─────────────────────────────────────────────────────────────────────────
    // ORIGIN CYAN MARKER
    // ─────────────────────────────────────────────────────────────────────────
    this.originGroup = new THREE.Group();
    this.originGroup.visible = false;
    this.group.add(this.originGroup);

    const origMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    const origGeo = new THREE.OctahedronGeometry(5.0, 0);
    origGeo.scale(1.0, 1.6, 1.0);
    this.originMarker = new THREE.Mesh(origGeo, origMat);
    this.originMarker.position.y = 22;
    this.originGroup.add(this.originMarker);

    for (let i = 0; i < 2; i++) {
      const ringGeo = new THREE.RingGeometry(1.2, 16, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.4 + i * 0.05;
      this.originRings.push(ring);
      this.originGroup.add(ring);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DESTINATION WAYPOINT BEACON (PURPLE GTA LASER & PILLAR)
    // ─────────────────────────────────────────────────────────────────────────
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

    // 4. Navigator Indicator
    this.navigatorMesh = new THREE.Group();
    this.navigatorMesh.visible = false;
    this.group.add(this.navigatorMesh);
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
   * Set Origin Cyan Waypoint Marker in world coordinates
   */
  public setOriginWaypoint(origin: RouteWaypoint | null): void {
    if (!origin) {
      this.originGroup.visible = false;
      return;
    }
    this.originGroup.position.set(origin.x, origin.y ?? 0, origin.z);
    this.originGroup.visible = true;
  }

  /**
   * Update or clear the 3D GPS route ribbons (Primary + Alternative routes)
   */
  public setRoute(route: NavigationRoute | null): void {
    // Clear existing primary ribbon
    if (this.ribbonMesh) {
      this.group.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      this.ribbonMesh = null;
    }

    // Clear existing alternative ribbons
    for (const alt of this.altRibbonMeshes) {
      this.group.remove(alt);
      alt.geometry.dispose();
    }
    this.altRibbonMeshes = [];

    if (!route || route.points.length < 2) {
      this.originGroup.visible = false;
      this.beaconGroup.visible = false;
      return;
    }

    // 1. Origin Cyan Marker
    this.setOriginWaypoint(route.start);

    // 2. Destination Purple Marker
    this.setWaypoint(route.destination);

    // 3. Render Alternative Routes (Subdued cyan ribbon, 4.8m wide)
    if (route.alternativeRoutes && route.alternativeRoutes.length > 0) {
      for (const altRoute of route.alternativeRoutes) {
        if (altRoute.points.length >= 2) {
          const altGeo = this.buildRibbonGeometry(altRoute.points, 4.8);
          const altMesh = new THREE.Mesh(altGeo, this.altRibbonMaterial);
          altMesh.frustumCulled = false;
          this.altRibbonMeshes.push(altMesh);
          this.group.add(altMesh);
        }
      }
    }

    // 4. Primary Route Ribbon (Bold 6.8m highlighted glowing purple GTA track)
    const geometry = this.buildRibbonGeometry(route.points, 6.8);
    this.ribbonMesh = new THREE.Mesh(geometry, this.ribbonMaterial);
    this.ribbonMesh.frustumCulled = false;
    this.group.add(this.ribbonMesh);
  }

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

      const normX = -dirZ;
      const normZ = dirX;

      vertices.push(cur.x - normX * halfW, cur.y, cur.z - normZ * halfW);
      vertices.push(cur.x + normX * halfW, cur.y, cur.z + normZ * halfW);

      const vCoord = dists[i] / width;
      uvs.push(0, vCoord);
      uvs.push(1, vCoord);

      if (i < points.length - 1) {
        const base = i * 2;
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

  public updateNavigator(
    _pos: { x: number; y: number; z: number } | null,
    _heading = 0,
    _visible = true
  ): void {
    this.navigatorMesh.visible = false;
  }

  public update(timeMs: number): void {
    const sec = timeMs * 0.001;

    this.ribbonMaterial.uniforms.uTime.value = sec;
    this.altRibbonMaterial.uniforms.uTime.value = sec * 0.7;
    this.beamMaterial.uniforms.uTime.value = sec;

    // Origin Cyan Marker Animation
    if (this.originGroup.visible) {
      this.originMarker.rotation.y = -sec * 1.6;
      this.originMarker.position.y = 20 + Math.sin(sec * 2.8) * 3.5;

      for (let i = 0; i < this.originRings.length; i++) {
        const ring = this.originRings[i];
        const ringTime = (sec * 1.0 + i * 0.5) % 1.0;
        const scale = 0.5 + ringTime * 2.0;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - ringTime) * 0.8);
      }
    }

    // Destination Purple Waypoint Animation
    if (this.beaconGroup.visible) {
      this.markerMesh.rotation.y = sec * 1.8;
      this.markerMesh.position.y = 28 + Math.sin(sec * 3.0) * 4.5;

      for (let i = 0; i < this.pulseRings.length; i++) {
        const ring = this.pulseRings[i];
        const ringTime = (sec * 1.2 + i * 0.4) % 1.0;
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
    for (const alt of this.altRibbonMeshes) {
      alt.geometry.dispose();
    }
    this.ribbonMaterial.dispose();
    this.altRibbonMaterial.dispose();
    this.beamMaterial.dispose();
    (this.markerMesh.material as THREE.Material).dispose();
    this.markerMesh.geometry.dispose();
    this.beamMesh.geometry.dispose();
    this.pulseRings.forEach((r) => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
    this.originRings.forEach((r) => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
  }
}
