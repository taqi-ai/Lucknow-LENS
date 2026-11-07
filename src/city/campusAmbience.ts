/**
 * Collegiate Campus & Landscaped Ambience System for Lucknow LENS
 *
 * Implements decorative landscaped campus grounds, collegiate green quads,
 * courtyard plazas, and decorative garden pathways for Lucknow's renowned
 * educational, medical, and collegiate estates:
 *  - King George's Medical University (KGMU Heritage Campus & Riverfront Quads)
 *  - University of Lucknow (Badshah Bagh Historic Campus)
 *  - La Martiniere College (200-Acre Constantia Heritage Estate & Grounds)
 *  - Sanjay Gandhi Postgraduate Institute (SGPGI 550-Acre Lush Campus)
 *  - Indian Institute of Management Lucknow (IIM-L Prabandh Nagar Green Estate)
 *  - Colvin Taluqdars' College (Historic Lawns & Sports Ovals)
 */

import * as THREE from 'three';

export interface CampusQuad {
  offsetX: number;
  offsetZ: number;
  width: number;
  length: number;
  type: 'lawn' | 'courtyard' | 'sports-field' | 'plaza';
}

export interface CollegiateCampus {
  id: string;
  name: string;
  category: 'university' | 'medical-college' | 'heritage-school' | 'institute';
  x: number;
  z: number;
  radiusMeters: number;
  founded: string;
  acreage: string;
  highlights: string;
  flora: string;
  quads: CampusQuad[];
}

export const LUCKNOW_COLLEGIATE_CAMPUSES: CollegiateCampus[] = [
  {
    id: 'campus-kgmu',
    name: "KGMU Medical University Heritage Campus",
    category: 'medical-college',
    x: -3320,
    z: -1280,
    radiusMeters: 480,
    founded: '1905',
    acreage: '88 Acres Heritage Medical Estate',
    highlights: 'Red-brick Mughal-Gothic Quad, Centenary Lawns, Riverbank Terraces',
    flora: 'Royal Palms, Gulmohar, Bougainvillea, Manicured Lawns',
    quads: [
      { offsetX: -30, offsetZ: -20, width: 140, length: 110, type: 'lawn' },
      { offsetX: 80, offsetZ: 40, width: 90, length: 80, type: 'courtyard' },
      { offsetX: -110, offsetZ: 70, width: 120, length: 85, type: 'lawn' },
      { offsetX: 40, offsetZ: -90, width: 100, length: 70, type: 'plaza' },
    ],
  },
  {
    id: 'campus-lucknow-univ',
    name: 'University of Lucknow (Badshah Bagh)',
    category: 'university',
    x: -1840,
    z: -1050,
    radiusMeters: 620,
    founded: '1920',
    acreage: '90 Acres Badshah Bagh Heritage Campus',
    highlights: 'Canning College Quadrangle, Tagore Library Lawns, Gomti Riverside Walk',
    flora: 'Ancient Banyan, Neems, Ashoka Avenues, Decorative Rose Gardens',
    quads: [
      { offsetX: 0, offsetZ: 0, width: 180, length: 140, type: 'lawn' },
      { offsetX: -120, offsetZ: 60, width: 110, length: 90, type: 'sports-field' },
      { offsetX: 110, offsetZ: -70, width: 130, length: 95, type: 'lawn' },
      { offsetX: -60, offsetZ: -120, width: 100, length: 80, type: 'plaza' },
    ],
  },
  {
    id: 'campus-la-martiniere',
    name: 'La Martiniere College (Constantia Estate)',
    category: 'heritage-school',
    x: 820,
    z: 1420,
    radiusMeters: 750,
    founded: '1845',
    acreage: '200 Acres Sprawling Heritage Parklands',
    highlights: 'Constantia Palace Forecourt, Historic Polo Grounds, Lat Lake Gardens',
    flora: 'Historic Wooded Groves, Pine Rows, Decorative Topiary, Expansive Turf',
    quads: [
      { offsetX: 0, offsetZ: -40, width: 220, length: 170, type: 'lawn' },
      { offsetX: -140, offsetZ: 80, width: 160, length: 130, type: 'sports-field' },
      { offsetX: 130, offsetZ: 60, width: 150, length: 110, type: 'lawn' },
      { offsetX: 0, offsetZ: 140, width: 180, length: 90, type: 'plaza' },
    ],
  },
  {
    id: 'campus-sgpgi',
    name: 'SGPGI Medical Research Institute Campus',
    category: 'medical-college',
    x: -315,
    z: 11420,
    radiusMeters: 700,
    founded: '1983',
    acreage: '550 Acres Self-Contained Woodland Campus',
    highlights: 'Academic Quadrangle, Faculty Grove, Healing Gardens & Water Bodies',
    flora: 'Extensive Forest Canopy, Eucalyptus Belts, Landscaped Internal Parks',
    quads: [
      { offsetX: 20, offsetZ: -30, width: 190, length: 150, type: 'lawn' },
      { offsetX: -130, offsetZ: 50, width: 140, length: 120, type: 'lawn' },
      { offsetX: 110, offsetZ: 80, width: 130, length: 100, type: 'courtyard' },
    ],
  },
  {
    id: 'campus-iim',
    name: 'Indian Institute of Management (IIM-L)',
    category: 'institute',
    x: 2100,
    z: -6800,
    radiusMeters: 780,
    founded: '1984',
    acreage: '200 Acres Brick-Built Green Oasis',
    highlights: 'Exposed Red-Brick Corridors, Central Amphitheatre Lawns, Lotus Quads',
    flora: 'Flowering Amaltas, Bougainvillea Trellises, Manicured Bermuda Grass',
    quads: [
      { offsetX: 0, offsetZ: 0, width: 170, length: 130, type: 'lawn' },
      { offsetX: -110, offsetZ: -60, width: 120, length: 100, type: 'courtyard' },
      { offsetX: 90, offsetZ: 70, width: 130, length: 90, type: 'plaza' },
      { offsetX: -80, offsetZ: 100, width: 140, length: 110, type: 'sports-field' },
    ],
  },
  {
    id: 'campus-colvin',
    name: "Colvin Taluqdars' College Grounds",
    category: 'heritage-school',
    x: -1100,
    z: -850,
    radiusMeters: 420,
    founded: '1889',
    acreage: '75 Acres Heritage Collegiate Grounds',
    highlights: 'Baronial Main Hall Lawns, Cricket Ovals, Ornamental Entrance Avenues',
    flora: 'Old Mango Orchards, Jacaranda, Trimmed Hedges, Cricket Turf',
    quads: [
      { offsetX: -20, offsetZ: 0, width: 160, length: 130, type: 'sports-field' },
      { offsetX: 90, offsetZ: -30, width: 110, length: 90, type: 'lawn' },
    ],
  },
];

/** Procedural high-DPI canvas texture for campus badges */
function createCampusBadgeTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 384, 128);

    // Rounded badge glass background
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(12, 16, 360, 96, 24);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#22c55e';
    ctx.stroke();

    // Academic Cap / Tree Icon
    ctx.font = '36px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', 54, 64);

    // Title & Subtitle
    ctx.fillStyle = '#4ade80';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CAMPUS & GREEN AMBIENCE', 94, 46);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const shortName = name.length > 22 ? name.slice(0, 20) + '...' : name;
    ctx.fillText(shortName, 94, 76);

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

export class CampusAmbienceManager {
  public group = new THREE.Group();
  private lawnMesh: THREE.Mesh;
  private curbMesh: THREE.Mesh;
  private badgeSprites: THREE.Sprite[] = [];
  private lawnMaterial: THREE.MeshStandardMaterial;
  private curbMaterial: THREE.MeshStandardMaterial;
  private visible = true;

  constructor() {
    this.group.name = 'CampusAmbienceSystem';

    // 1. Manicured Emerald Lawn Material
    this.lawnMaterial = new THREE.MeshStandardMaterial({
      color: 0x3da344, // Lush collegiate manicured grass
      roughness: 0.82,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });

    // 2. Sandstone / Stone Curb & Pavement Border
    this.curbMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6cebe, // Sandstone curb trim
      roughness: 0.75,
      metalness: 0.05,
    });

    // Build merged quads for all curated campuses
    const { lawnGeo, curbGeo } = this.buildCampusGeometries();
    this.lawnMesh = new THREE.Mesh(lawnGeo, this.lawnMaterial);
    this.curbMesh = new THREE.Mesh(curbGeo, this.curbMaterial);
    this.group.add(this.lawnMesh);
    this.group.add(this.curbMesh);

    // Build floating campus badges
    this.buildCampusBadges();
  }

  private buildCampusGeometries(): { lawnGeo: THREE.BufferGeometry; curbGeo: THREE.BufferGeometry } {
    const lawnPositions: number[] = [];
    const lawnNormals: number[] = [];
    const curbPositions: number[] = [];
    const curbNormals: number[] = [];

    for (const campus of LUCKNOW_COLLEGIATE_CAMPUSES) {
      for (const quad of campus.quads) {
        const qx = campus.x + quad.offsetX;
        const qz = campus.z + quad.offsetZ;
        const hw = quad.width * 0.5;
        const hl = quad.length * 0.5;
        const y = 0.35; // slightly above base ground plane

        // Lawn Quad (2 triangles)
        // Vertices: (x-hw, z-hl), (x+hw, z-hl), (x+hw, z+hl), (x-hw, z+hl)
        lawnPositions.push(
          qx - hw, y, qz - hl,
          qx + hw, y, qz - hl,
          qx + hw, y, qz + hl,

          qx - hw, y, qz - hl,
          qx + hw, y, qz + hl,
          qx - hw, y, qz + hl
        );
        for (let i = 0; i < 6; i++) {
          lawnNormals.push(0, 1, 0);
        }

        // Stone Curb Perimeter (thin 1.2m sandstone border framing the lawn)
        const curbW = 1.2;
        const curbY = 0.45;
        // Top edge
        this.addBoxQuad(curbPositions, curbNormals, qx, qz - hl, quad.width + curbW * 2, curbW, curbY);
        // Bottom edge
        this.addBoxQuad(curbPositions, curbNormals, qx, qz + hl, quad.width + curbW * 2, curbW, curbY);
        // Left edge
        this.addBoxQuad(curbPositions, curbNormals, qx - hw, qz, curbW, quad.length, curbY);
        // Right edge
        this.addBoxQuad(curbPositions, curbNormals, qx + hw, qz, curbW, quad.length, curbY);
      }
    }

    const lawnGeo = new THREE.BufferGeometry();
    lawnGeo.setAttribute('position', new THREE.Float32BufferAttribute(lawnPositions, 3));
    lawnGeo.setAttribute('normal', new THREE.Float32BufferAttribute(lawnNormals, 3));

    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeo.setAttribute('normal', new THREE.Float32BufferAttribute(curbNormals, 3));

    return { lawnGeo, curbGeo };
  }

  private addBoxQuad(
    positions: number[],
    normals: number[],
    cx: number,
    cz: number,
    w: number,
    l: number,
    y: number
  ): void {
    const hw = w * 0.5;
    const hl = l * 0.5;
    positions.push(
      cx - hw, y, cz - hl,
      cx + hw, y, cz - hl,
      cx + hw, y, cz + hl,

      cx - hw, y, cz - hl,
      cx + hw, y, cz + hl,
      cx - hw, y, cz + hl
    );
    for (let i = 0; i < 6; i++) {
      normals.push(0, 1, 0);
    }
  }

  private buildCampusBadges(): void {
    for (const campus of LUCKNOW_COLLEGIATE_CAMPUSES) {
      const tex = createCampusBadgeTexture(campus.name);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.position.set(campus.x, 70, campus.z);
      sprite.scale.set(110, 38, 1);
      sprite.userData = {
        type: 'campus',
        campus,
        baseY: 70,
        phase: Math.random() * Math.PI * 2,
      };

      this.badgeSprites.push(sprite);
      this.group.add(sprite);
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }

  public update(time: number, cameraPosition: THREE.Vector3): void {
    if (!this.visible) return;

    const altitude = cameraPosition.y;
    // Scale badge with altitude so it's always legible without ballooning
    const scaleFactor = Math.max(0.65, Math.min(2.5, altitude / 1200));

    for (const sprite of this.badgeSprites) {
      const data = sprite.userData;
      if (!data) continue;

      const bob = Math.sin(time * 1.8 + data.phase) * 3.0;
      sprite.position.y = data.baseY + bob;
      sprite.scale.set(110 * scaleFactor, 38 * scaleFactor, 1);
    }
  }

  public setNightMode(night: boolean): void {
    if (night) {
      this.lawnMaterial.color.setHex(0x132a17); // rich deep nocturnal lawn
      this.curbMaterial.color.setHex(0x42464e);
    } else {
      this.lawnMaterial.color.setHex(0x3da344); // lush emerald daylight lawn
      this.curbMaterial.color.setHex(0xd6cebe);
    }
  }

  public dispose(): void {
    this.lawnMesh.geometry.dispose();
    this.curbMesh.geometry.dispose();
    this.lawnMaterial.dispose();
    this.curbMaterial.dispose();
    for (const sprite of this.badgeSprites) {
      sprite.material.dispose();
      sprite.material.map?.dispose();
    }
    this.badgeSprites = [];
  }
}
