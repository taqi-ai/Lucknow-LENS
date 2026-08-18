import * as THREE from 'three';
import { SeededRNG } from './rng';

/**
 * Encapsulates the visual realism parameters for Phase 1.
 * Provides deterministic shared materials for buildings to prevent 
 * identical cubes and keep draw calls to a minimum.
 */

interface PaletteColors {
  wall: number;
  roof: number;
}

// 5 core urban tones found in Lucknow
const DAY_PALETTE: PaletteColors[] = [
  { wall: 0xf8fafc, roof: 0xe2e8f0 }, // Clean white, light concrete roof
  { wall: 0xf5f5f4, roof: 0xd6d3d1 }, // Beige, dusty roof
  { wall: 0xfefce8, roof: 0xd1d5db }, // Cream, standard grey roof
  { wall: 0xe2e8f0, roof: 0x94a3b8 }, // Pale grey, darker concrete roof
  { wall: 0xe7e5e4, roof: 0x78716c }, // Warm sandstone, dark waterproofing roof
];

// Darker, cooler tones for night
const NIGHT_PALETTE: PaletteColors[] = [
  { wall: 0x475569, roof: 0x334155 },
  { wall: 0x3f3f46, roof: 0x27272a },
  { wall: 0x52525b, roof: 0x3f3f46 },
  { wall: 0x4b5563, roof: 0x374151 },
  { wall: 0x334155, roof: 0x1e293b },
];

export class BuildingVisuals {
  public wallMaterials: THREE.MeshStandardMaterial[] = [];
  public roofMaterials: THREE.MeshStandardMaterial[] = [];
  
  private isNight: boolean = true; // Match initial state in renderer

  constructor() {
    this.initMaterials();
  }

  private initMaterials() {
    for (let i = 0; i < DAY_PALETTE.length; i++) {
      // MeshStandardMaterial gives much better depth shading than Lambert
      // Variations in roughness/metalness create more realistic neighborhoods
      const roughnessVar = 0.75 + (i * 0.05); // e.g. 0.75 to 0.95
      const metalnessVar = 0.02 + (i * 0.02); // e.g. 0.02 to 0.10

      this.wallMaterials.push(new THREE.MeshStandardMaterial({
        color: NIGHT_PALETTE[i].wall,
        roughness: roughnessVar,
        metalness: metalnessVar,
      }));

      this.roofMaterials.push(new THREE.MeshStandardMaterial({
        color: NIGHT_PALETTE[i].roof,
        roughness: 0.95,
        metalness: 0.0,
      }));
    }
  }

  public setNightMode(night: boolean) {
    if (this.isNight === night) return;
    this.isNight = night;

    const targetPalette = night ? NIGHT_PALETTE : DAY_PALETTE;

    for (let i = 0; i < targetPalette.length; i++) {
      this.wallMaterials[i].color.setHex(targetPalette[i].wall);
      this.roofMaterials[i].color.setHex(targetPalette[i].roof);
    }
  }

  /**
   * Returns a deterministic material index (0 to 4) based on a string ID.
   * This ensures buildings never randomly change color when streaming in/out.
   */
  public getMaterialIndexForId(id: string): number {
    if (!id) return 0;
    const hash = SeededRNG.hashString(id);
    return hash % this.wallMaterials.length;
  }
}
