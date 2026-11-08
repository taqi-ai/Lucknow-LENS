import * as THREE from 'three';
import { SpatialIncident, IncidentSeverity, IncidentCategory } from './types';
import { LUCKNOW_INCIDENTS } from './incidentData';

const SEVERITY_COLORS: Record<IncidentSeverity, { hex: number; str: string }> = {
  critical: { hex: 0xef4444, str: '#ef4444' }, // Red
  major: { hex: 0xf97316, str: '#f97316' },    // Orange
  moderate: { hex: 0xfacc15, str: '#facc15' }, // Yellow
  info: { hex: 0x06b6d4, str: '#06b6d4' },     // Cyan
};

function createIncidentBadgeTexture(incident: SpatialIncident): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const colors = SEVERITY_COLORS[incident.severity];

  // Glowing circle base
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = colors.str;
  ctx.stroke();

  // Incident Emoji / Icon Symbol
  let icon = '⚠️';
  if (incident.type === 'accident') icon = '💥';
  if (incident.type === 'fire') icon = '🔥';
  if (incident.type === 'waterlogging') icon = '🌊';
  if (incident.type === 'road-closure') icon = '⛔';
  if (incident.type === 'infrastructure') icon = '🚧';
  if (incident.type === 'emergency') icon = '🚨';

  ctx.font = '54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 64, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export class IncidentVisualManager {
  public group = new THREE.Group();
  private scene: THREE.Scene;
  private activeCategories: Set<IncidentCategory> = new Set([
    'accident',
    'fire',
    'waterlogging',
    'road-closure',
    'infrastructure',
    'emergency',
  ]);

  private spriteNodes: Map<string, THREE.Sprite> = new Map();
  private pillarNodes: Map<string, THREE.Mesh> = new Map();
  private ringNodes: Map<string, THREE.Mesh> = new Map();
  private interactiveObjects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'LiveIncidentVisuals';
    this.buildIncidents();
    this.scene.add(this.group);
  }

  private buildIncidents(): void {
    for (const inc of LUCKNOW_INCIDENTS) {
      const colors = SEVERITY_COLORS[inc.severity];
      const tex = createIncidentBadgeTexture(inc);

      // 1. Floating 3D Badge Sprite
      const spriteMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(inc.x, 32, inc.z);
      sprite.scale.set(36, 36, 1);
      sprite.userData = {
        type: 'incident',
        incident: inc,
        baseY: 32,
        phase: Math.random() * Math.PI * 2,
      };

      // 2. Vertical Light Column Pillar
      const pillarGeo = new THREE.CylinderGeometry(0.8, 1.2, 32, 8);
      pillarGeo.translate(0, 16, 0);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: colors.hex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(inc.x, 0, inc.z);

      // 3. Ground Warning Ripple Ring
      const ringGeo = new THREE.RingGeometry(1.5, 18, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colors.hex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(inc.x, 0.6, inc.z);

      this.spriteNodes.set(inc.id, sprite);
      this.pillarNodes.set(inc.id, pillar);
      this.ringNodes.set(inc.id, ring);

      this.interactiveObjects.push(sprite);
      this.group.add(sprite, pillar, ring);
    }
  }

  public setVisibleCategories(cats: Set<IncidentCategory>): void {
    this.activeCategories = cats;
    for (const inc of LUCKNOW_INCIDENTS) {
      const vis = this.activeCategories.has(inc.type);
      const s = this.spriteNodes.get(inc.id);
      const p = this.pillarNodes.get(inc.id);
      const r = this.ringNodes.get(inc.id);
      if (s) s.visible = vis;
      if (p) p.visible = vis;
      if (r) r.visible = vis;
    }
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public updateFilters(filters: Record<string, boolean>): void {
    const active = new Set<IncidentCategory>();
    if (filters.accidents) active.add('accident');
    if (filters.fire || filters.fires) active.add('fire');
    if (filters.waterlogging) active.add('waterlogging');
    if (filters.closures) active.add('road-closure');
    if (filters.infrastructure) active.add('infrastructure');
    if (filters.emergency) active.add('emergency');
    this.setVisibleCategories(active);
    const anyActive = Array.from(active).length > 0;
    this.setVisible(anyActive);
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    return this.interactiveObjects.filter((o) => o.visible);
  }

  public update(timeSec: number, cameraPos: THREE.Vector3): void {
    if (!this.group.visible) return;

    const altitude = cameraPos.y;
    // Scale sprites adaptively with altitude
    const baseScale = Math.max(24, Math.min(85, altitude * 0.05));

    for (const inc of LUCKNOW_INCIDENTS) {
      const sprite = this.spriteNodes.get(inc.id);
      const ring = this.ringNodes.get(inc.id);

      if (sprite && sprite.visible) {
        const data = sprite.userData;
        const bob = Math.sin(timeSec * 3.0 + data.phase) * 3.5;
        sprite.position.y = data.baseY + bob;
        sprite.scale.set(baseScale, baseScale, 1);
      }

      if (ring && ring.visible) {
        const ringTime = (timeSec * 1.5 + (inc.x % 1.0)) % 1.0;
        const scale = 0.4 + ringTime * 2.2;
        ring.scale.set(scale, scale, 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - ringTime) * 0.85);
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const s of this.spriteNodes.values()) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    for (const p of this.pillarNodes.values()) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    for (const r of this.ringNodes.values()) {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    this.spriteNodes.clear();
    this.pillarNodes.clear();
    this.ringNodes.clear();
    this.interactiveObjects = [];
  }
}
