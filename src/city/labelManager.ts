import * as THREE from 'three';
import { loadJSON } from '../data/resourceCache';
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

export interface LabelSettings {
  places: boolean;
  roads: boolean;
  /** Only monuments and major landmarks. */
  landmarksOnly: boolean;
  density: 'minimal' | 'balanced' | 'rich';
  size: 'small' | 'medium' | 'large';
}

/** Calm by default: a few place anchors, no road names until asked for. */
export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  places: true, roads: false, landmarksOnly: false, density: 'balanced', size: 'medium',
};

const DENSITY = { minimal: { count: 0.5, imp: 1 }, balanced: { count: 1, imp: 0 }, rich: { count: 1.8, imp: -1 } } as const;
const SIZE = { small: 0.82, medium: 0.95, large: 1.15 } as const;
const LANDMARK_TYPES = new Set(['landmark', 'monument', 'landmark_and_historical_building']);

// ─── Canvas sprite factory ────────────────────────────────────────────────────

interface SpriteStyle {
  text: string;
  textColor: string;
  bgColor: string;
  borderColor?: string;
  badgeColor?: string;
  fontSize: number;
  bold: boolean;
  paddingH: number;
  paddingV: number;
}

function createTextSprite(style: SpriteStyle): THREE.Sprite {
  const { text, textColor, bgColor, borderColor, badgeColor, fontSize, bold, paddingH, paddingV } = style;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const dpr = 2; // Crisp 2x backing store for ultra-sharp typography
  const fontStr = `${bold ? '600' : '500'} ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.font = fontStr;
  const measured = ctx.measureText(text);
  const textW = measured.width;

  const badgeOffset = badgeColor ? 14 : 0;
  const logicalW = Math.ceil(textW + paddingH * 2 + badgeOffset);
  const logicalH = Math.ceil(fontSize + paddingV * 2 + 4);

  canvas.width = Math.ceil(logicalW * dpr);
  canvas.height = Math.ceil(logicalH * dpr);

  ctx.scale(dpr, dpr);
  ctx.font = fontStr;
  ctx.textBaseline = 'middle';

  const r = Math.min(logicalH / 2, 7);

  // Pill background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, logicalW - 1, logicalH - 1, r);
  ctx.fill();

  // Subtle border
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Accent dot badge
  if (badgeColor) {
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(paddingH + 4, logicalH / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Text with drop shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = textColor;
  ctx.fillText(text, paddingH + badgeOffset, logicalH / 2 + 0.5);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
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
  (sprite as any).__canvasW = logicalW;
  (sprite as any).__canvasH = logicalH;

  return sprite;
}

// ─── Lucknow label style ──────────────────────────────────────────────────────
//
// Landmarks get a small plaque: a cusped Awadhi arch glyph in zardozi gold and
// the name set in Rozha One. Everything else is bare type on a soft halo, the
// way good printed maps do it, so the city is not buried under pills.

export const LABEL_FONTS = { display: '"Rozha One", Georgia, serif', text: 'Mukta, "Hanken Grotesk", system-ui, sans-serif' };

type LabelKind = 'landmark' | 'major' | 'place' | 'road' | 'roadMajor';

function drawArch(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  // a three-lobed (cusped) arch on two slim piers
  const w = h * 0.72, r = w / 2;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r, y + h / 2);
  ctx.lineTo(x - r, y - h * 0.02);
  ctx.quadraticCurveTo(x - r, y - h * 0.32, x - r * 0.42, y - h * 0.3);
  ctx.quadraticCurveTo(x - r * 0.38, y - h * 0.52, x, y - h / 2);
  ctx.quadraticCurveTo(x + r * 0.38, y - h * 0.52, x + r * 0.42, y - h * 0.3);
  ctx.quadraticCurveTo(x + r, y - h * 0.32, x + r, y - h * 0.02);
  ctx.lineTo(x + r, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

function createLabelSprite(text: string, kind: LabelKind, night: boolean): THREE.Sprite {
  const dpr = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const plaque = kind === 'landmark';
  const size = plaque ? 15 : kind === 'major' ? 13 : kind === 'place' ? 12 : kind === 'roadMajor' ? 11 : 10;
  const font = plaque ? `400 ${size}px ${LABEL_FONTS.display}` : kind.startsWith('road') ? `500 ${size}px ${LABEL_FONTS.text}` : `${kind === 'major' ? 700 : 600} ${size}px ${LABEL_FONTS.text}`;
  const label = kind.startsWith('road') ? text.toUpperCase() : text;
  const tracking = kind.startsWith('road') ? 1.2 : 0;
  ctx.font = font;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${tracking}px`;
  const tw = ctx.measureText(label).width;

  const padH = plaque ? 11 : 6, padV = plaque ? 7 : 5;
  const glyph = plaque ? 16 : kind === 'major' ? 9 : 0;
  const W = Math.ceil(tw + padH * 2 + glyph + 2), H = Math.ceil(size * 1.25 + padV * 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${tracking}px`;
  ctx.textBaseline = 'middle';

  const gold = night ? '#e2c27a' : '#a87b24';
  const ink = night ? '#f4efe4' : '#1d2a26';
  const halo = night ? 'rgba(8,12,18,0.92)' : 'rgba(250,247,240,0.95)';

  if (plaque) {
    const r = H / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = night ? 'rgba(18,24,22,0.94)' : 'rgba(252,249,242,0.97)';
    ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, r); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = night ? 'rgba(226,194,122,0.55)' : 'rgba(168,123,36,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(3.5, 3.5, W - 7, H - 7, r - 2.5); ctx.stroke();
    drawArch(ctx, padH + 5, H / 2 + 0.5, H * 0.5, gold);
    ctx.fillStyle = ink;
    ctx.fillText(label, padH + glyph, H / 2 + 1);
  } else {
    const x = 2 + padH + glyph;
    if (kind === 'major') {
      // a small gold lozenge marks institutions and districts
      ctx.save(); ctx.translate(padH + 3, H / 2); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gold; ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.restore();
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = halo; ctx.lineWidth = kind.startsWith('road') ? 3 : 3.6;
    ctx.strokeText(label, x, H / 2 + 1);
    ctx.fillStyle = kind.startsWith('road') ? (night ? 'rgba(214,222,234,0.78)' : 'rgba(58,70,66,0.82)') : kind === 'place' ? (night ? 'rgba(244,239,228,0.86)' : 'rgba(29,42,38,0.86)') : ink;
    ctx.fillText(label, x, H / 2 + 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  (sprite as any).__canvasW = W;
  (sprite as any).__canvasH = H;
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
  private _enabled = true;
  public get enabled(): boolean { return this._enabled; }
  public set enabled(v: boolean) {
    if (v && !this._enabled) this.lastCamPos.set(1e9, 0, 0); // re-enabled: rebuild even if the camera has not moved
    this._enabled = v;
  }
  private settings: LabelSettings = DEFAULT_LABEL_SETTINGS;

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

      // Canvas text uses whatever font is loaded at draw time, so wait for the label faces (briefly).
      if (typeof document !== 'undefined' && document.fonts?.load) {
        await Promise.race([
          Promise.all([document.fonts.load(`15px ${LABEL_FONTS.display}`), document.fonts.load(`600 12px ${LABEL_FONTS.text}`), document.fonts.load(`700 13px ${LABEL_FONTS.text}`)]),
          new Promise((r) => setTimeout(r, 2500)),
        ]).catch(() => undefined);
        this.clearCache();
      }
      this.allPlaces = places.slice().sort((a, b) => b.importance - a.importance);
      this.allRoads = roads;
      this.loaded = true;
      console.log(`[LabelManager] ${this.allPlaces.length} places, ${this.allRoads.length} roads loaded.`);
    } catch (e) {
      console.warn('[LabelManager] Failed to load label data:', e);
    }
  }

  public setCamera(cam: THREE.Camera): void { this.camera = cam; }

  public setSettings(next: LabelSettings): void {
    this.settings = next;
    this.lastCamPos.set(1e9, 0, 0); // force a rebuild on the next frame
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.clearCache();
    this.lastCamPos.set(1e9, 0, 0); // redraw in the new palette without waiting for the camera to move
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
    const base = LOD_CONFIG[lod];
    const dens = DENSITY[this.settings.density];
    const cfg: LODConfig = {
      ...base,
      placeMinImp: base.placeMinImp + dens.imp,
      roadMinImp: base.roadMinImp + dens.imp,
      placeMax: Math.max(1, Math.round(base.placeMax * dens.count)),
      roadMax: Math.max(1, Math.round(base.roadMax * dens.count)),
      baseScale: base.baseScale * SIZE[this.settings.size],
    };
    const camX = camPos.x, camZ = camPos.z;

    // ── Screen-space occupancy grid (pixel rects) ──────────────────────────────
    const occupied: { cx: number; cy: number; hw: number; hh: number }[] = [];
    const PADDING = 28; // Screen pixels padding between labels

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
    for (const p of (this.settings.places ? this.allPlaces : [])) {
      if (p.importance < cfg.placeMinImp) break;
      if (this.settings.landmarksOnly && !(LANDMARK_TYPES.has(p.type) || p.importance >= 9)) continue; // Array is sorted by importance desc
      // Filter out ordinary businesses at high LODs
      if (lod <= 1 && (p.type === 'shop' || p.type === 'business' || p.type === 'restaurant' || p.importance < 6)) {
         continue;
      }
      const dist = Math.hypot(p.x - camX, p.z - camZ);
      if (dist > cfg.visRadius) continue;
      candidates.push({ ...p, kind: 'place' });
    }

    // Filter roads
    for (const r of (this.settings.roads ? this.allRoads : [])) {
      if (r.importance < cfg.roadMinImp) break;
      const dist = Math.hypot(r.x - camX, r.z - camZ);
      if (dist > cfg.visRadius) continue;
      candidates.push({ ...r, kind: 'road' });
    }

    // Rank: landmark place types first, then importance, then proximity. Without the
    // proximity tiebreak the same distant label wins every frame and nearby context
    // never gets a slot.
    const rank = (c: Candidate): number => {
      const isLandmark = (c.kind === 'place' && (c as PlaceLabel).type === 'landmark') ? 20 : 0;
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

  private makePlaceSprite(p: Candidate, _cfg: LODConfig): THREE.Sprite {
    const isLandmark = LANDMARK_TYPES.has((p as PlaceLabel).type) || (p.importance >= 10 && !/mall|palassio|plaza|hotel|bus|terminal/i.test(p.name));
    const kind: LabelKind = isLandmark ? 'landmark' : p.importance >= 7 ? 'major' : 'place';
    const sprite = createLabelSprite(p.name, kind, this.isNight);
    sprite.renderOrder = isLandmark ? 1000 : 999;
    return sprite;
  }

  private makeRoadSprite(r: Candidate, _cfg: LODConfig): THREE.Sprite {
    const sprite = createLabelSprite(r.name, r.importance >= 8 ? 'roadMajor' : 'road', this.isNight);
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
