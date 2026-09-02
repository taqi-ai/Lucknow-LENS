import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';
import { LODLevel } from '../types';
import { LANDMARKS } from './landmarkRegistry';

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

/**
 * Label budgets are deliberately tight. The previous values (25/40/50 places plus
 * 15/30/40 roads) filled the viewport with competing pills and buried the city
 * underneath its own annotation. A readable map shows a handful of anchors at each
 * scale and lets the geometry carry the rest.
 */
const LOD_CONFIG: Record<LODLevel, LODConfig> = {
  // FULL CITY — only city-defining anchors: airport, Charbagh, major monuments
  0: { placeMinImp: 9, placeMax: 7,  roadMinImp: 10, roadMax: 3,  visRadius: 50000, baseScale: 1.0, labelHeight: 500 },
  // DISTRICT — landmarks, government, transport
  1: { placeMinImp: 8, placeMax: 11, roadMinImp: 9,  roadMax: 5,  visRadius: 15000, baseScale: 1.0, labelHeight: 200 },
  // NEIGHBORHOOD — notable local POIs
  2: { placeMinImp: 6, placeMax: 12, roadMinImp: 7,  roadMax: 7,  visRadius: 4000,  baseScale: 1.0, labelHeight: 80  },
  // STREET — what is actually within walking distance
  3: { placeMinImp: 5, placeMax: 12, roadMinImp: 6,  roadMax: 8,  visRadius: 900,   baseScale: 1.0, labelHeight: 30  },
};

/** Curated landmarks always outrank generic place records of the same importance. */
const LANDMARK_NAMES = new Set(LANDMARKS.map((l) => l.name.toLowerCase()));

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

  // Text with drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = textColor;
  ctx.fillText(text, paddingH, canvas.height / 2 + 1);
  
  // Reset shadow for next draw
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

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
      // Shared cache: SearchIndex wants the same two files, and StrictMode
      // mounts this twice. Four fetches and four parses of a 2 MB file is what
      // stalled startup.
      const [places, roads] = await Promise.all([
        loadJSON<PlaceLabel[]>('/overture_tiles_full/places_labels.json'),
        loadJSON<RoadLabel[]>('/overture_tiles_full/road_labels.json'),
      ]);

      // The registry is the authority on where a landmark actually sits — the
      // raw Overture record it started from can be stale (Clock Tower's
      // "Ghanta Ghar" record is 90 m from the curated position) or simply
      // absent (Bara/Chota Imambara, University of Lucknow have none at all,
      // so without this they'd render with no label whatsoever). Drop any
      // raw place that shares a landmark's name and replace it with a label
      // pinned to the registry's own x/z, so the label always sits on the
      // building that's actually drawn there.
      const landmarkNameSet = new Set(LANDMARKS.map((l) => l.name.toLowerCase()));
      const landmarkLabels: PlaceLabel[] = LANDMARKS.map((l) => ({
        id: `landmark:${l.id}`,
        name: l.name,
        x: l.x,
        z: l.z,
        type: 'landmark',
        importance: l.importance,
      }));
      const filteredPlaces = places.filter((p) => !landmarkNameSet.has(p.name.toLowerCase()));

      this.allPlaces = [...landmarkLabels, ...filteredPlaces].sort((a, b) => b.importance - a.importance);
      this.allRoads = roads;
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
    const PADDING = 20; // Screen pixels padding between labels

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

    // Rank: curated landmarks first, then importance, then proximity. Without the
    // proximity tiebreak the same distant label wins every frame and nearby context
    // never gets a slot.
    const rank = (c: Candidate): number => {
      const isLandmark = LANDMARK_NAMES.has(c.name.toLowerCase()) ? 40 : 0;
      const dist = Math.hypot(c.x - camX, c.z - camZ);
      return isLandmark + c.importance * 3 - (dist / cfg.visRadius) * 4;
    };
    candidates.sort((a, b) => rank(b) - rank(a));

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
      // Fade with distance so the far field recedes instead of competing.
      const dist = Math.hypot(c.x - camX, c.z - camZ);
      const fade = 1 - Math.min(1, Math.max(0, (dist / cfg.visRadius - 0.45) / 0.55)) * 0.45;
      (sprite.material as THREE.SpriteMaterial).opacity = fade;
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

    // Only top-tier landmarks get a filled pill. Everything else is quiet text on a
    // near-transparent scrim, so the hierarchy is obvious at a glance.
    const bgColor = this.isNight
      ? (highImp ? 'rgba(255,210,140,0.92)' : midImp ? 'rgba(15,20,30,0.85)' : 'rgba(10,14,22,0.72)')
      : (highImp ? 'rgba(186,104,36,0.95)'  : midImp ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.8)');

    const textColor = this.isNight
      ? (highImp ? '#0a0d14' : midImp ? '#f0f5fa' : '#d6dee8')
      : (highImp ? '#ffffff' : midImp ? '#1e293b' : '#334155');

    const fontSize = highImp ? 16 : midImp ? 13 : 11;
    const bold     = highImp;

    const sprite = createTextSprite({ text: p.name, textColor, bgColor, fontSize, bold, paddingH: 10, paddingV: 5 });
    sprite.renderOrder = 999;
    return sprite;
  }

  private makeRoadSprite(r: Candidate, cfg: LODConfig): THREE.Sprite {
    const highImp = r.importance >= 8;

    // Roads read as unobtrusive route markers, never as chips competing with places.
    const bgColor = this.isNight
      ? 'rgba(15,20,30,0.55)'
      : 'rgba(255,255,255,0.6)';

    const textColor = this.isNight
      ? (highImp ? '#b3d9ff' : '#90a4ba')
      : (highImp ? '#1c425c' : '#3d5263');
    const fontSize = highImp ? 13 : 11;

    const sprite = createTextSprite({ text: r.name, textColor, bgColor, fontSize, bold: highImp, paddingH: 8, paddingV: 3 });
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
