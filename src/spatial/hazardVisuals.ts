import * as THREE from 'three';
import { SpatialHazardZone, HazardType, RiskLevel } from './types';
import { LUCKNOW_HAZARDS } from './hazardData';

const HAZARD_COLORS: Record<HazardType, { fill: number; border: number; opacity: number }> = {
  flood: {
    fill: 0x2563eb, // Royal blue flood expanse
    border: 0x60a5fa,
    opacity: 0.38,
  },
  waterlogging: {
    fill: 0x06b6d4, // Cyan-teal waterlogging
    border: 0x22d3ee,
    opacity: 0.42,
  },
  earthquake: {
    fill: 0xf97316, // Amber-orange seismic zone
    border: 0xfb923c,
    opacity: 0.22,
  },
  heatwave: {
    fill: 0xdc2626, // Crimson-red heat island
    border: 0xef4444,
    opacity: 0.35,
  },
  rainfall: {
    fill: 0x6366f1, // Indigo heavy precipitation
    border: 0x818cf8,
    opacity: 0.30,
  },
};

export class HazardVisualManager {
  public group = new THREE.Group();
  private scene: THREE.Scene;
  private activeTypes: Set<HazardType> = new Set(['flood', 'waterlogging', 'earthquake', 'heatwave', 'rainfall']);
  private interactiveMeshes: THREE.Mesh[] = [];
  private zoneMeshes: Map<string, THREE.Mesh> = new Map();
  private borderLines: Map<string, THREE.LineLoop> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'NaturalHazardVisuals';
    this.buildMeshes();
    this.scene.add(this.group);
  }

  private buildMeshes(): void {
    for (const zone of LUCKNOW_HAZARDS) {
      if (zone.geometry.length < 3) continue;

      const colors = HAZARD_COLORS[zone.hazardType];

      // Build 2D shape in XZ plane
      const shape = new THREE.Shape();
      const first = zone.geometry[0];
      shape.moveTo(first.x, -first.z); // Shape uses 2D coordinates (x, y) where y corresponds to -z

      for (let i = 1; i < zone.geometry.length; i++) {
        const pt = zone.geometry[i];
        shape.lineTo(pt.x, -pt.z);
      }
      shape.closePath();

      const shapeGeo = new THREE.ShapeGeometry(shape);
      shapeGeo.rotateX(-Math.PI / 2); // Lay flat on ground

      const mat = new THREE.MeshBasicMaterial({
        color: colors.fill,
        transparent: true,
        opacity: colors.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(shapeGeo, mat);
      // Slight height offset above ground to avoid z-fighting with terrain
      const yOffset = zone.hazardType === 'flood' ? 0.62 : zone.hazardType === 'waterlogging' ? 0.68 : 0.55;
      mesh.position.y = yOffset;
      mesh.userData = {
        type: 'hazard-zone',
        zone,
      };

      this.interactiveMeshes.push(mesh);
      this.zoneMeshes.set(zone.id, mesh);
      this.group.add(mesh);

      // Distinct contour line around polygon
      const linePoints: THREE.Vector3[] = zone.geometry.map(
        (p) => new THREE.Vector3(p.x, yOffset + 0.05, p.z)
      );
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: colors.border,
        linewidth: 2,
        transparent: true,
        opacity: 0.85,
      });
      const lineLoop = new THREE.LineLoop(lineGeo, lineMat);
      this.borderLines.set(zone.id, lineLoop);
      this.group.add(lineLoop);
    }
  }

  public setVisibleTypes(types: Set<HazardType>): void {
    this.activeTypes = types;
    for (const zone of LUCKNOW_HAZARDS) {
      const isVisible = this.activeTypes.has(zone.hazardType);
      const mesh = this.zoneMeshes.get(zone.id);
      const line = this.borderLines.get(zone.id);
      if (mesh) mesh.visible = isVisible;
      if (line) line.visible = isVisible;
    }
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public updateFilters(filters: Record<string, boolean>): void {
    const active = new Set<HazardType>();
    if (filters.flood) active.add('flood');
    if (filters.waterlogging) active.add('waterlogging');
    if (filters.earthquake) active.add('earthquake');
    if (filters.heatwave) active.add('heatwave');
    if (filters.rainfall) active.add('rainfall');
    this.setVisibleTypes(active);
    const anyActive = Array.from(active).length > 0;
    this.setVisible(anyActive);
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    return this.interactiveMeshes.filter((m) => m.visible);
  }

  public update(timeSec: number): void {
    if (!this.group.visible) return;

    // Gentle undulating shimmer for flood and waterlogging zones
    for (const zone of LUCKNOW_HAZARDS) {
      if (zone.hazardType === 'flood' || zone.hazardType === 'waterlogging') {
        const mesh = this.zoneMeshes.get(zone.id);
        if (mesh && mesh.visible) {
          const baseOpacity = HAZARD_COLORS[zone.hazardType].opacity;
          (mesh.material as THREE.MeshBasicMaterial).opacity =
            baseOpacity + Math.sin(timeSec * 2.2 + zone.centroid.x * 0.01) * 0.08;
        }
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const mesh of this.zoneMeshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    for (const line of this.borderLines.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.interactiveMeshes = [];
    this.zoneMeshes.clear();
    this.borderLines.clear();
  }
}
