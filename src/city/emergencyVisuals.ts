/**
 * Emergency Services Visuals & Coverage Overlay
 *
 * Implements:
 * 1. Floating 3D animated status badges (Hospital red cross, Police shield, Fire flame)
 *    inspired by SimCity BuildIt municipal visual indicators.
 * 2. High-performance dynamic scaling that maintains readability from street to aerial views.
 * 3. Interactive green translucent coverage radius shader overlay matching the SimCity
 *    BuildIt municipal coverage zone (concentric pulse rings, grid, and perimeter border).
 */

import * as THREE from 'three';
import { EmergencyFacility, EmergencyFacilityType } from './emergencyServices';

/** Generates high-DPI procedural canvas texture for emergency badges with facility name beneath sign */
function createBadgeTexture(type: EmergencyFacilityType, name: string): THREE.CanvasTexture {
  const w = 384;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5; // 192
  const iconCy = 78;
  const iconRadius = 54;

  // Background glow
  const glowGrad = ctx.createRadialGradient(cx, iconCy, 20, cx, iconCy, 75);
  if (type === 'hospital') {
    glowGrad.addColorStop(0, 'rgba(239, 68, 68, 0.40)');
    glowGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
  } else if (type === 'police') {
    glowGrad.addColorStop(0, 'rgba(59, 130, 246, 0.40)');
    glowGrad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
  } else {
    glowGrad.addColorStop(0, 'rgba(249, 115, 22, 0.45)');
    glowGrad.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
  }
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, 150);

  // Outer circle container with dark glass
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, iconCy, iconRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.lineWidth = 5;
  if (type === 'hospital') {
    ctx.strokeStyle = '#ef4444';
  } else if (type === 'police') {
    ctx.strokeStyle = '#3b82f6';
  } else {
    ctx.strokeStyle = '#f97316';
  }
  ctx.stroke();

  // Inner icon
  if (type === 'hospital') {
    // Red Medical Cross (+)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(cx - 10, iconCy - 34, 20, 68, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 34, iconCy - 10, 68, 20, 4);
    ctx.fill();

    // White inner core cross for pop
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cx - 6, iconCy - 28, 12, 56, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx - 28, iconCy - 6, 56, 12, 3);
    ctx.fill();
  } else if (type === 'police') {
    // Blue Police Shield
    ctx.beginPath();
    ctx.moveTo(cx, iconCy - 34);
    ctx.lineTo(cx + 30, iconCy - 22);
    ctx.lineTo(cx + 30, iconCy + 10);
    ctx.bezierCurveTo(cx + 30, iconCy + 30, cx, iconCy + 40, cx, iconCy + 40);
    ctx.bezierCurveTo(cx, iconCy + 40, cx - 30, iconCy + 30, cx - 30, iconCy + 10);
    ctx.lineTo(cx - 30, iconCy - 22);
    ctx.closePath();
    ctx.fillStyle = '#1d4ed8';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#60a5fa';
    ctx.stroke();

    // Gold 5-point Star
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    const spikes = 5, outerRadius = 16, innerRadius = 8;
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / spikes;
    ctx.moveTo(cx, iconCy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = iconCy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerRadius;
      y = iconCy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, iconCy - outerRadius);
    ctx.closePath();
    ctx.fill();
  } else {
    // Fire Flame Symbol
    ctx.beginPath();
    ctx.moveTo(cx, iconCy - 36);
    ctx.bezierCurveTo(cx + 14, iconCy - 16, cx + 32, iconCy - 2, cx + 32, iconCy + 18);
    ctx.bezierCurveTo(cx + 32, iconCy + 36, cx + 16, iconCy + 42, cx, iconCy + 42);
    ctx.bezierCurveTo(cx - 16, iconCy + 42, cx - 32, iconCy + 36, cx - 32, iconCy + 18);
    ctx.bezierCurveTo(cx - 32, iconCy - 2, cx - 14, iconCy - 16, cx, iconCy - 36);
    ctx.closePath();
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fdba74';
    ctx.stroke();

    // Inner bright yellow flame
    ctx.beginPath();
    ctx.moveTo(cx, iconCy - 6);
    ctx.bezierCurveTo(cx + 8, iconCy + 4, cx + 16, iconCy + 14, cx + 16, iconCy + 24);
    ctx.bezierCurveTo(cx + 16, iconCy + 36, cx + 8, iconCy + 38, cx, iconCy + 38);
    ctx.bezierCurveTo(cx - 8, iconCy + 38, cx - 16, iconCy + 36, cx - 16, iconCy + 24);
    ctx.bezierCurveTo(cx - 16, iconCy + 14, cx - 8, iconCy + 4, cx, iconCy - 6);
    ctx.closePath();
    ctx.fillStyle = '#fde047';
    ctx.fill();
  }
  ctx.restore();

  // Bottom Facility Name Pill
  const pillW = 344;
  const pillH = 76;
  const pillX = (w - pillW) * 0.5; // 20
  const pillY = 152;

  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 16);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = type === 'hospital' ? 'rgba(239, 68, 68, 0.85)' : type === 'police' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(249, 115, 22, 0.85)';
  ctx.stroke();

  // Facility Category Subtitle
  ctx.fillStyle = type === 'hospital' ? '#f87171' : type === 'police' ? '#60a5fa' : '#fb923c';
  ctx.font = '900 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tagText = type === 'hospital' ? 'HOSPITAL / HEALTH CLINIC' : type === 'police' ? 'POLICE STATION' : 'FIRE & RESCUE';
  ctx.fillText(tagText, cx, pillY + 22);

  // Facility Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
  let displayName = name;
  if (displayName.length > 25) {
    displayName = displayName.slice(0, 23) + '...';
  }
  ctx.fillText(displayName, cx, pillY + 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/** SimCity BuildIt-inspired animated coverage zone shader material */
function createCoverageShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x22c55e) }, // Vibrant emerald/lime-green
      uRadius: { value: 1800.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uRadius;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        // Distance from center of disc (0.0 at center, 1.0 at outer edge)
        float d = length(vUv - vec2(0.5)) * 2.0;
        if (d > 1.0) discard;

        // Concentric scanning radar waves moving outward
        float wave = sin(d * 32.0 - uTime * 2.5) * 0.5 + 0.5;
        wave = pow(wave, 4.0) * 0.32;

        // Subtle urban grid overlay
        vec2 gridUv = vUv * 48.0;
        float grid = (sin(gridUv.x) * sin(gridUv.y) > 0.94) ? 0.12 : 0.0;

        // Crisp perimeter boundary ring
        float edge = smoothstep(0.92, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d)) * 0.95;

        // Soft interior radial wash
        float interior = (1.0 - d * 0.55) * 0.28;

        float alpha = clamp(interior + wave + grid + edge, 0.0, 0.82);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

export class EmergencyVisualManager {
  private readonly scene: THREE.Scene;
  private readonly badgeGroup = new THREE.Group();
  private readonly coverageGroup = new THREE.Group();
  private readonly coverageMesh: THREE.Mesh;
  private readonly coverageMaterial: THREE.ShaderMaterial;

  private facilities: EmergencyFacility[] = [];
  private badgeSprites: Map<string, THREE.Sprite> = new Map();
  private textureCache: Map<string, THREE.CanvasTexture> = new Map();
  private selectedFacility: EmergencyFacility | null = null;
  private visible = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.badgeGroup.name = 'emergency-badges';
    this.coverageGroup.name = 'emergency-coverage';

    // Single reusable coverage disc (flat plane at ground level y = 1.8)
    const discGeom = new THREE.PlaneGeometry(1, 1, 64, 64);
    discGeom.rotateX(-Math.PI / 2); // Lay flat on XZ plane
    this.coverageMaterial = createCoverageShaderMaterial();
    this.coverageMesh = new THREE.Mesh(discGeom, this.coverageMaterial);
    this.coverageMesh.position.y = 1.8;
    this.coverageMesh.visible = false;
    this.coverageGroup.add(this.coverageMesh);

    this.scene.add(this.coverageGroup);
    this.scene.add(this.badgeGroup);
  }

  private getTexture(type: EmergencyFacilityType, name: string): THREE.CanvasTexture {
    const key = `${type}-${name}`;
    let tex = this.textureCache.get(key);
    if (!tex) {
      tex = createBadgeTexture(type, name);
      this.textureCache.set(key, tex);
    }
    return tex;
  }

  public setFacilities(facilities: EmergencyFacility[]): void {
    this.facilities = facilities;
    this.rebuildBadges();
  }

  private rebuildBadges(): void {
    // Clear existing badges
    while (this.badgeGroup.children.length > 0) {
      const child = this.badgeGroup.children[0];
      this.badgeGroup.remove(child);
    }
    this.badgeSprites.clear();

    for (const fac of this.facilities) {
      const tex = this.getTexture(fac.type, fac.name);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      // Elevate sprite above rooftops (~50-70m)
      const baseHeight = fac.type === 'hospital' ? 70 : 50;
      sprite.position.set(fac.x, baseHeight, fac.z);
      sprite.scale.set(84, 56, 1);

      sprite.userData = {
        type: 'emergency',
        facility: fac,
        baseY: baseHeight,
        phase: Math.random() * Math.PI * 2,
      };

      this.badgeSprites.set(fac.id, sprite);
      this.badgeGroup.add(sprite);
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.badgeGroup.visible = visible;
    this.coverageGroup.visible = visible && !!this.selectedFacility;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setSelectedFacility(facility: EmergencyFacility | null): void {
    this.selectedFacility = facility;

    if (!facility || !this.visible) {
      this.coverageMesh.visible = false;
      return;
    }

    // Position and scale the coverage overlay around the selected facility
    const diameter = facility.coverageRadiusMeters * 2;
    this.coverageMesh.position.set(facility.x, 2.0, facility.z);
    this.coverageMesh.scale.set(diameter, 1, diameter);
    this.coverageMaterial.uniforms.uRadius.value = facility.coverageRadiusMeters;

    // Set theme color depending on facility type
    if (facility.type === 'hospital') {
      this.coverageMaterial.uniforms.uColor.value.setHex(0x22c55e); // Emerald Green medical zone
    } else if (facility.type === 'police') {
      this.coverageMaterial.uniforms.uColor.value.setHex(0x38bdf8); // Cyan-Blue patrol sector
    } else {
      this.coverageMaterial.uniforms.uColor.value.setHex(0xf97316); // Amber-Orange fire zone
    }

    this.coverageMesh.visible = true;
  }

  public getSelectedFacility(): EmergencyFacility | null {
    return this.selectedFacility;
  }

  /** Update animations and camera-adaptive badge scaling */
  public update(time: number, cameraPosition: THREE.Vector3): void {
    if (!this.visible) return;

    // Animate coverage radar shader
    if (this.coverageMesh.visible) {
      this.coverageMaterial.uniforms.uTime.value = time;
    }

    // Adaptive scale: as camera zooms higher, badges scale up slightly to remain legible
    // and don't shrink into invisible dots, but remain proportional at street level
    const altitude = cameraPosition.y;
    const isMacroScale = altitude > 2400;
    const baseScale = Math.max(38, Math.min(190, altitude * 0.075));

    for (const sprite of this.badgeSprites.values()) {
      const data = sprite.userData;
      if (!data) continue;

      const fac = data.facility;
      const isSelected = this.selectedFacility && this.selectedFacility.id === fac.id;
      const isCuratedHub = !fac.id.startsWith('emg-');

      // Density culling: at high altitude (Full City / District macro), display premier
      // regional emergency hubs and selected facility to prevent screen clutter.
      // At neighborhood and street scale, reveal all community facilities and clinics.
      const shouldShow = !isMacroScale || isCuratedHub || isSelected;
      sprite.visible = shouldShow;
      if (!shouldShow) continue;

      // Gentle floating bob
      const bob = Math.sin(time * 2.2 + data.phase) * 3.5;
      sprite.position.y = data.baseY + bob;

      // Highlight selected facility
      const targetScale = isSelected ? baseScale * 1.35 : baseScale;
      sprite.scale.set(targetScale * 1.5, targetScale, 1);
    }
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    return Array.from(this.badgeSprites.values()).filter((s) => s.visible);
  }

  public dispose(): void {
    this.scene.remove(this.badgeGroup);
    this.scene.remove(this.coverageGroup);

    this.coverageMesh.geometry.dispose();
    this.coverageMaterial.dispose();

    for (const sprite of this.badgeSprites.values()) {
      sprite.material.dispose();
    }
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.badgeSprites.clear();
    this.textureCache.clear();
  }
}
