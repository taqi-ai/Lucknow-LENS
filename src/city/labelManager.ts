import * as THREE from 'three';
import { LODLevel } from '../types';

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface PlaceLabel {
  id: string;
  name: string;
  x: number;
  z: number;
  type: string;
  importance: number; // 3–10
}

export interface RoadLabel {
  id: string;
  name: string;
  x: number;
  z: number;
  type: string;
  importance: number; // 5–10
}

interface Candidate {
  id: string;
  name: string;
  x: number;
  z: number;
  importance: number;
  type: string;
  kind: 'place' | 'road';
}

// ─── Per-LOD configuration ────────────────────────────────────────────────────

interface LODConfig {
  placeMinImp: number;
  placeMax: number;
  roadMinImp: number;
  roadMax: number;
  visRadius: number;
  baseScale: number;    // Multiplier for screen space size
  labelHeight: number;  // y offset above ground
}

const LOD_CONFIG: Record<LODLevel, LODConfig> = {
  // FULL CITY — only the very biggest Lucknow landmarks, airports, train stations
  0: { placeMinImp: 9, placeMax: 12, roadMinImp: 10, roadMax: 8,  visRadius: 50000, baseScale: 1.0, labelHeight: 500 },
  // DISTRICT — landmark + government + hospital + transport
  1: { placeMinImp: 7, placeMax: 25, roadMinImp: 8,  roadMax: 15, visRadius: 15000, baseScale: 1.0, labelHeight: 200 },
  // NEIGHBORHOOD — local POIs
  2: { placeMinImp: 5, placeMax: 40, roadMinImp: 6,  roadMax: 30, visRadius: 6000,  baseScale: 1.0, labelHeight: 80  },
  // STREET — nearby POIs only
  3: { placeMinImp: 4, placeMax: 50, roadMinImp: 5,  roadMax: 40, visRadius: 1200,  baseScale: 1.0, labelHeight: 30  },
};

// ─── Canvas sprite factory ────────────────────────────────────────────────────

interface SpriteStyle {
  text: string;
  textColor: string;
  bgColor: string;
  fontSize: number;
  bold: boolean;
  paddingH: number;
  paddingV: number;
}

function createTextSprite(style: SpriteStyle): THREE.Sprite {
  const { text, textColor, bgColor, fontSize, bold, paddingH, paddingV } = style;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const fontStr = `${bold ? 'bold' : '500'} ${fontSize}px Inter, ui-sans-serif, sans-serif`;
  ctx.font = fontStr;
  const measured = ctx.measureText(text);
  const textW = measured.width;

  canvas.width  = Math.ceil(textW + paddingH * 2);
  canvas.height = Math.ceil(fontSize + paddingV * 2 + 2);

  // Re-apply font after resize
  ctx.font = fontStr;
  ctx.textBaseline = 'middle';

  // Pill background
  const r = Math.min(canvas.height / 2, 10);
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();

  // Text
  ctx.fillStyle = textColor;
  ctx.fillText(text, paddingH, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  // sizeAttenuation: false ensures scale is evaluated in clip/viewport space.
  const mat = new THREE.SpriteMaterial({ 
    map: tex, 
    transparent: true, 
    depthTest: false, 
    depthWrite: false, 
    sizeAttenuation: false 
  });
  
  const sprite = new THREE.Sprite(mat);

  // Store original canvas size so we can project scale correctly based on viewport
  (sprite as any).__canvasW = canvas.width;
  (sprite as any).__canvasH = canvas.height;

  return sprite;
}

// ─── LabelManager ─────────────────────────────────────────────────────────────

export class LabelManager {
  private scene: THREE.Scene;
  private group: THREE.Group;

  private allPlaces: PlaceLabel[] = [];
  private allRoads: RoadLabel[] = [];
  private loaded = false;

  private activeSprites = new Set<THREE.Sprite>();
  // Caching to prevent recreating canvas textures
  private spriteCache = new Map<string, THREE.Sprite>();

  private currentLOD: LODLevel = 0;
  private isNight = true;
  public enabled = true;

  // Track camera movement to trigger rebuilds
  private lastCamPos = new THREE.Vector3();
  private lastCamRot = new THREE.Quaternion();

  private camera: THREE.Camera | null = null;
  private viewport = new THREE.Vector2(1920, 1080);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'LabelGroup';
    this.group.renderOrder = 999;
    this.scene.add(this.group);
  }

  public async loadData(): Promise<void> {
    try {
      const [pr, rr] = await Promise.all([
        fetch('/overture_tiles_full/places_labels.json'),
        fetch('/overture_tiles_full/road_labels.json'),
      ]);
      if (pr.ok) this.allPlaces = await pr.json() as PlaceLabel[];
      if (rr.ok) this.allRoads  = await rr.json()  as RoadLabel[];
      this.loaded = true;
      console.log(`[LabelManager] ${this.allPlaces.length} places, ${this.allRoads.length} roads loaded.`);
    } catch (e) {
      console.warn('[LabelManager] Failed to load label data:', e);
    }
  }

  public setCamera(cam: THREE.Camera): void { this.camera = cam; }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.clearCache();
  }

  public setViewport(w: number, h: number): void {
    if (w === this.viewport.x && h === this.viewport.y) return;
    this.viewport.set(w, h);
    // Force rebuild on resize
    this.lastCamPos.set(0, 0, 0); 
  }

  public update(cameraPos: THREE.Vector3, lod: LODLevel): void {
    if (!this.loaded || !this.enabled || !this.camera) {
      if (!this.enabled && this.activeSprites.size > 0) this.hideAll();
      return;
    }

    const posMoved = this.lastCamPos.distanceToSquared(cameraPos) > 400; // ~20 units
    const rotMoved = this.lastCamRot.angleTo(this.camera.quaternion) > 0.02;
    const lodChanged = lod !== this.currentLOD;

    if (!posMoved && !rotMoved && !lodChanged) return;

    this.currentLOD = lod;
    this.lastCamPos.copy(cameraPos);
    this.lastCamRot.copy(this.camera.quaternion);

    this.rebuild(cameraPos, lod);
  }

  private hideAll(): void {
    for (const sprite of this.activeSprites) {
      sprite.visible = false;
    }
    this.activeSprites.clear();
  }

  private rebuild(camPos: THREE.Vector3, lod: LODLevel): void {
    this.hideAll();
    const cfg = LOD_CONFIG[lod];
    const camX = camPos.x, camZ = camPos.z;

    // ── Screen-space occupancy grid (pixel rects) ──────────────────────────────
    const occupied: { cx: number; cy: number; hw: number; hh: number }[] = [];
    const PADDING = 8; // Screen pixels padding between labels

    const ndcOf = (wx: number, wz: number, wy: number): THREE.Vector3 | null => {
      if (!this.camera) return null;
      const v = new THREE.Vector3(wx, wy, wz);
      v.project(this.camera);
      // Strictly clip points behind the camera or outside the screen frustum
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return v;
    };

    const overlaps = (px: number, py: number, hw: number, hh: number): boolean => {
      for (const r of occupied) {
        if (
          Math.abs(px - r.cx) < (hw + r.hw + PADDING) &&
          Math.abs(py - r.cy) < (hh + r.hh + PADDING)
        ) return true;
      }
      return false;
    };

    // Filter and combine candidates
    let candidates: Candidate[] = [];

    // Filter places
    for (const p of this.allPlaces) {
      if (p.importance < cfg.placeMinImp) break; // Array is sorted by importance desc
      // Filter out ordinary businesses at high LODs
      if (lod <= 1 && (p.type === 'shop' || p.type === 'business' || p.type === 'restaurant' || p.importance < 6)) {
         continue;
      }
      const dist = Math.hypot(p.x - camX, p.z - camZ);
      if (dist > cfg.visRadius) continue;
      candidates.push({ ...p, kind: 'place' });
    }

    // Filter roads
    for (const r of this.allRoads) {
      if (r.importance < cfg.roadMinImp) break;
      const dist = Math.hypot(r.x - camX, r.z - camZ);
      if (dist > cfg.visRadius) continue;
      candidates.push({ ...r, kind: 'road' });
    }

    // Sort all candidates by importance (highest first) to guarantee priority
    candidates.sort((a, b) => b.importance - a.importance);

    let placesAdded = 0;
    let roadsAdded = 0;

    for (const c of candidates) {
      if (c.kind === 'place' && placesAdded >= cfg.placeMax) continue;
      if (c.kind === 'road' && roadsAdded >= cfg.roadMax) continue;

      const wy = c.kind === 'place' ? this.labelHeightAt(c.importance, cfg) : cfg.labelHeight * 0.6;
      const ndc = ndcOf(c.x, c.z, wy);
      if (!ndc) continue;

      // Get or create sprite to get exact canvas bounds
      const sprite = this.getOrCreateSprite(c, cfg);
      const cw = (sprite as any).__canvasW as number;
      const ch = (sprite as any).__canvasH as number;

      const hw = cw / 2;
      const hh = ch / 2;

      // Convert NDC [-1,1] to pixel space for overlap check
      const px = (ndc.x * 0.5 + 0.5) * this.viewport.x;
      const py = (1 - (ndc.y * 0.5 + 0.5)) * this.viewport.y;

      if (overlaps(px, py, hw, hh)) continue;

      // Register occupancy
      occupied.push({ cx: px, cy: py, hw, hh });

      // Calculate sprite scale.
      // For sizeAttenuation: false, scale.x = 1 means 100% of viewport height?
      // Actually, in Three.js, when sizeAttenuation is false, a sprite scale of 1 matches the height of the viewport.
      // So if we want the sprite to be exactly 'cw' pixels wide, we scale it by cw / viewport.y.
      const scaleX = (cw / this.viewport.y) * cfg.baseScale;
      const scaleY = (ch / this.viewport.y) * cfg.baseScale;
      sprite.scale.set(scaleX, scaleY, 1);

      sprite.position.set(c.x, wy, c.z);
      sprite.visible = true;
      this.activeSprites.add(sprite);

      if (c.kind === 'place') placesAdded++;
      else roadsAdded++;
    }
  }

  private labelHeightAt(imp: number, cfg: LODConfig): number {
    const factor = imp >= 9 ? 1.5 : imp >= 7 ? 1.1 : imp >= 5 ? 0.8 : 0.5;
    return cfg.labelHeight * factor;
  }

  private getOrCreateSprite(c: Candidate, cfg: LODConfig): THREE.Sprite {
    const key = c.id;
    if (this.spriteCache.has(key)) {
      return this.spriteCache.get(key)!;
    }

    const sprite = c.kind === 'place' 
      ? this.makePlaceSprite(c, cfg) 
      : this.makeRoadSprite(c, cfg);
    
    sprite.visible = false;
    this.group.add(sprite);
    this.spriteCache.set(key, sprite);
    return sprite;
  }

  private makePlaceSprite(p: Candidate, cfg: LODConfig): THREE.Sprite {
    const highImp = p.importance >= 8;
    const midImp  = p.importance >= 6;

    // Reduced opacity for less visual clutter
    const bgColor = this.isNight
      ? (highImp ? 'rgba(251,191,36,0.65)' : midImp ? 'rgba(15,23,42,0.60)' : 'rgba(15,23,42,0.50)')
      : (highImp ? 'rgba(180,83,9,0.70)'   : midImp ? 'rgba(255,255,255,0.75)' : 'rgba(241,245,249,0.65)');

    const textColor = this.isNight
      ? (highImp ? '#0f172a' : '#e2e8f0')
      : (highImp ? '#ffffff' : '#1e293b');

    const fontSize = highImp ? 16 : midImp ? 13 : 11;
    const bold     = highImp || midImp;

    const sprite = createTextSprite({ text: p.name, textColor, bgColor, fontSize, bold, paddingH: 8, paddingV: 3 });
    sprite.renderOrder = 999;
    return sprite;
  }

  private makeRoadSprite(r: Candidate, cfg: LODConfig): THREE.Sprite {
    const highImp = r.importance >= 8;

    const bgColor = this.isNight
      ? (highImp ? 'rgba(14,165,233,0.65)' : 'rgba(30,41,59,0.55)')
      : (highImp ? 'rgba(2,132,199,0.70)'  : 'rgba(226,232,240,0.60)');

    const textColor = this.isNight ? '#ffffff' : (highImp ? '#ffffff' : '#334155');
    const fontSize = highImp ? 13 : 11;

    const sprite = createTextSprite({ text: r.name, textColor, bgColor, fontSize, bold: highImp, paddingH: 6, paddingV: 2 });
    sprite.renderOrder = 998;
    return sprite;
  }

  private clearCache(): void {
    this.hideAll();
    for (const sprite of this.spriteCache.values()) {
      this.group.remove(sprite);
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.spriteCache.clear();
  }

  public dispose(): void {
    this.clearCache();
    this.scene.remove(this.group);
  }

  public getActiveCount(): number { return this.activeSprites.size; }
}
