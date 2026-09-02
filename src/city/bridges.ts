import * as THREE from 'three';


/**
 * BridgeSystem — river crossings for roads that are *not* tagged elevated.
 *
 * PROVENANCE. This used to carry the whole burden of vertical separation,
 * because the tiles had no level/layer attribute and the Overture transportation
 * extract was an unfetched Git LFS pointer. That is no longer true: real
 * `level` / `isElevated` now come from data/lucknow_transportation_extracted.json
 * and drive genuine per-vertex elevation profiles in ribbon.ts, covering all
 * 1,375 elevated features including road-over-road flyovers and metro viaducts.
 *
 * What remains here is the residue that real data does *not* cover: a road at
 * level 0 that nonetheless crosses the Gomti. Overture does not tag every river
 * bridge as elevated, but a road of tertiary class or above physically must
 * bridge the river — there is no ford on the Gomti inside Lucknow. Those
 * crossings are still derived geometrically, by intersecting a real road
 * centreline with a real waterway centreline; only the elevation is inferred.
 *
 * Features that already carry a real elevation profile are excluded from that
 * search (see overlayGeometry.findCrossings), so nothing gets two decks.
 */

export class BridgeSystem {
  private group = new THREE.Group();
  private deckMat: THREE.MeshStandardMaterial;
  private pierMat: THREE.MeshStandardMaterial;
  private railMat: THREE.MeshStandardMaterial;
  private isNight = true;

  public crossingCount = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Bridges';
    scene.add(this.group);

    this.deckMat = new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.7 });
    this.pierMat = new THREE.MeshStandardMaterial({ color: 0x6d6659, roughness: 0.9, flatShading: true });
    this.railMat = new THREE.MeshStandardMaterial({
      color: 0x8b8578, roughness: 0.6, emissive: 0x000000,
    });
  }

  /**
   * Attach one baked bridge buffer. Crossing detection and geometry generation now
   * happen offline in scripts/bake_hlod.ts via src/city/overlayGeometry.ts — the
   * in-browser version was an unindexed road-vs-river scan that cost tens of
   * seconds of main-thread time on every load.
   */
  public addSection(pos: Float32Array, kind: 'deck' | 'pier' | 'rail'): void {
    if (pos.length === 0) return;
    const mat = kind === 'deck' ? this.deckMat : kind === 'pier' ? this.pierMat : this.railMat;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'bridges';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    if (night) {
      this.deckMat.color.setHex(0x24262b);
      this.pierMat.color.setHex(0x2c2a26);
      this.railMat.color.setHex(0x3a3733);
      // Bridge parapets are lit in Lucknow — makes river crossings read at night.
      this.railMat.emissive.setHex(0x4a3a1c);
    } else {
      this.deckMat.color.setHex(0x4a4b50);
      this.pierMat.color.setHex(0x8d8678);
      this.railMat.color.setHex(0xa9a294);
      this.railMat.emissive.setHex(0x000000);
    }
  }

  public setVisible(v: boolean): void { this.group.visible = v; }

  public dispose(): void {
    this.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.deckMat.dispose();
    this.pierMat.dispose();
    this.railMat.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
