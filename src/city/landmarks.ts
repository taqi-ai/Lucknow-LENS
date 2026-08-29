import * as THREE from 'three';
import { LANDMARKS, type LandmarkArchetype, type LandmarkDef } from './landmarkRegistry';

/**
 * LandmarkSystem — dedicated procedural geometry for Lucknow's recognisable
 * buildings.
 *
 * The strategy the brief asks for: ~960,000 believable bulk buildings plus a small
 * number of unmistakable landmarks. A generic Overture extrusion of Ekana Stadium is
 * a box; here it is a bowl with stands and a roof ring.
 *
 * Budget discipline:
 *  - three LOD levels per landmark, swapped by camera distance
 *  - LOD 2 (far) is a silhouette-only mass, a few dozen triangles
 *  - the whole system is ~15 objects, so even hero detail costs almost nothing
 *    against a city of two million triangles
 *  - bulk extrusions inside each footprint are suppressed at bake time and in the
 *    tile worker, so nothing pokes through
 */

const LOD_NEAR = 900;   // below this: hero detail
const LOD_MID = 3500;   // below this: architectural form

interface LandmarkEntry {
  def: LandmarkDef;
  lod: THREE.LOD;
}

/** Shared material set — landmarks read as stone/plaster, distinct from bulk stock. */
interface LandmarkMaterials {
  stone: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  dome: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  turf: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  tarmac: THREE.MeshStandardMaterial;
  marking: THREE.MeshStandardMaterial;
  aircraft: THREE.MeshStandardMaterial;
}

export class LandmarkSystem {
  private group = new THREE.Group();
  private entries: LandmarkEntry[] = [];
  private mats: LandmarkMaterials;
  private isNight = true;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Landmarks';
    scene.add(this.group);

    this.mats = {
      // Lakhauri brick and lime plaster — the Awadhi monument palette.
      stone: new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.85, flatShading: true }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x2e2e2c, roughness: 0.9, flatShading: true }),
      dome: new THREE.MeshStandardMaterial({ color: 0x424240, roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.8, metalness: 0.25, flatShading: true }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.7, flatShading: true }),
      turf: new THREE.MeshStandardMaterial({ color: 0x1c2c1e, roughness: 1.0 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x1a2430, roughness: 0.18, metalness: 0.5,
        emissive: 0x101820, emissiveIntensity: 1,
      }),
      tarmac: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.92 }),
      // Runway markings stay emissive at night so the airport reads as lit.
      marking: new THREE.MeshStandardMaterial({
        color: 0xdedad0, roughness: 0.7, emissive: 0x3a3020, emissiveIntensity: 1,
      }),
      aircraft: new THREE.MeshStandardMaterial({
        color: 0xdfe6ee, roughness: 0.42, metalness: 0.35, flatShading: true,
      }),
    };

    for (const def of LANDMARKS) {
      const lod = new THREE.LOD();
      lod.name = 'landmark';
      lod.position.set(def.x, 0, def.z);
      lod.rotation.y = def.rotation ?? 0;
      lod.userData = { type: 'landmark', id: def.id, name: def.name, def };

      lod.addLevel(this.buildDetail(def, 0), 0);
      lod.addLevel(this.buildDetail(def, 1), LOD_NEAR);
      lod.addLevel(this.buildDetail(def, 2), LOD_MID);

      lod.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });

      this.group.add(lod);
      this.entries.push({ def, lod });
    }
  }

  /** Call each frame; THREE.LOD picks the level from camera distance. */
  public update(camera: THREE.Camera): void {
    for (const e of this.entries) e.lod.update(camera);
  }

  public setVisible(v: boolean): void { this.group.visible = v; }

  public getLandmarks(): LandmarkDef[] { return LANDMARKS; }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    if (night) {
      // Monuments are floodlit at night in Lucknow — this is what makes them stay
      // recognisable when the surrounding bulk city goes dark.
      this.mats.stone.color.setHex(0x6a6154);
      this.mats.stone.emissive.setHex(0x241d12);
      this.mats.stoneDark.color.setHex(0x554e44);
      this.mats.stoneDark.emissive.setHex(0x1b160e);
      this.mats.dome.color.setHex(0x746a5b);
      this.mats.dome.emissive.setHex(0x2a2115);
      this.mats.roof.color.setHex(0x24242a);
      this.mats.metal.color.setHex(0x33373f);
      this.mats.turf.color.setHex(0x16241a);
      this.mats.glass.emissive.setHex(0x2a3444);
      this.mats.tarmac.color.setHex(0x1b1d21);
      this.mats.marking.emissiveIntensity = 1.4;
      this.mats.aircraft.color.setHex(0x5d6874);
    } else {
      this.mats.stone.color.setHex(0xcfc0a6);
      this.mats.stone.emissive.setHex(0x000000);
      this.mats.stoneDark.color.setHex(0xb3a189);
      this.mats.stoneDark.emissive.setHex(0x000000);
      this.mats.dome.color.setHex(0xdcd0b8);
      this.mats.dome.emissive.setHex(0x000000);
      this.mats.roof.color.setHex(0x6b6259);
      this.mats.metal.color.setHex(0x8d949c);
      this.mats.turf.color.setHex(0x4e7040);
      this.mats.glass.emissive.setHex(0x000000);
      this.mats.tarmac.color.setHex(0x3d4046);
      this.mats.marking.emissiveIntensity = 0.0;
      this.mats.aircraft.color.setHex(0xdfe6ee);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ARCHETYPE BUILDERS
  // detail: 0 = hero, 1 = architectural form, 2 = far silhouette

  private buildDetail(def: LandmarkDef, detail: number): THREE.Group {
    switch (def.archetype) {
      case 'stadium': return this.buildStadium(def, detail);
      case 'imambara': return this.buildImambara(def, detail);
      case 'gateway': return this.buildGateway(def, detail);
      case 'station': return this.buildStation(def, detail);
      case 'memorial': return this.buildMemorial(def, detail);
      case 'assembly': return this.buildAssembly(def, detail);
      case 'terminal': return this.buildTerminal(def, detail);
      case 'tower': return this.buildTower(def, detail);
      case 'mall': return this.buildMall(def, detail);
      case 'campus': return this.buildCampus(def, detail);
    }
  }

  /** Bowl + raked stands + roof ring + pitch. Reads as a stadium from the air. */
  private buildStadium(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 48 : detail === 1 ? 28 : 16;

    // Outer bowl wall, slightly flared.
    const bowl = new THREE.CylinderGeometry(r, r * 0.9, h * 0.72, seg, 1, true);
    bowl.translate(0, h * 0.36, 0);
    g.add(new THREE.Mesh(bowl, this.mats.stone));

    // Inner raked seating, inverted cone opening toward the pitch.
    const stands = new THREE.CylinderGeometry(r * 0.92, r * 0.52, h * 0.6, seg, 1, true);
    stands.translate(0, h * 0.3, 0);
    const standsMesh = new THREE.Mesh(stands, this.mats.stoneDark);
    standsMesh.material.side = THREE.DoubleSide;
    g.add(standsMesh);

    // Pitch.
    const pitch = new THREE.CircleGeometry(r * 0.5, seg);
    pitch.rotateX(-Math.PI / 2);
    pitch.translate(0, 0.4, 0);
    g.add(new THREE.Mesh(pitch, this.mats.turf));

    // Cantilever roof ring — the strongest silhouette cue at distance.
    const roof = new THREE.RingGeometry(r * 0.6, r * 1.06, seg);
    roof.rotateX(-Math.PI / 2);
    roof.translate(0, h, 0);
    const roofMesh = new THREE.Mesh(roof, this.mats.roof);
    roofMesh.material.side = THREE.DoubleSide;
    g.add(roofMesh);

    if (detail <= 1) {
      // Floodlight masts.
      const mastGeo = new THREE.CylinderGeometry(0.7, 0.9, h * 0.42, 5);
      mastGeo.translate(0, h + h * 0.21, 0);
      const masts = new THREE.InstancedMesh(mastGeo, this.mats.metal, 6);
      const d = new THREE.Object3D();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        d.position.set(Math.cos(a) * r * 0.98, 0, Math.sin(a) * r * 0.98);
        d.updateMatrix();
        masts.setMatrixAt(i, d.matrix);
      }
      masts.instanceMatrix.needsUpdate = true;
      g.add(masts);
    }

    if (detail === 0) {
      // Facade pilasters around the bowl.
      const pil = new THREE.BoxGeometry(2.2, h * 0.72, 1.6);
      pil.translate(0, h * 0.36, 0);
      const count = 32;
      const inst = new THREE.InstancedMesh(pil, this.mats.stoneDark, count);
      const d = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        d.position.set(Math.cos(a) * r * 1.01, 0, Math.sin(a) * r * 1.01);
        d.rotation.set(0, -a, 0);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    return g;
  }

  /**
   * Awadhi imambara: walled courtyard, central hall with a large central dome
   * flanked by smaller ones, corner minarets, arcaded facade.
   */
  private buildImambara(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 24 : detail === 1 ? 14 : 8;

    // Courtyard platform.
    const plinth = new THREE.BoxGeometry(r * 1.9, 2.5, r * 1.5);
    plinth.translate(0, 1.25, 0);
    g.add(new THREE.Mesh(plinth, this.mats.stoneDark));

    // Main hall.
    const hallW = r * 1.15;
    const hallD = r * 0.62;
    const hall = new THREE.BoxGeometry(hallW, h * 0.62, hallD);
    hall.translate(0, 2.5 + h * 0.31, 0);
    g.add(new THREE.Mesh(hall, this.mats.stone));

    // Central bulbous dome on a drum.
    const drum = new THREE.CylinderGeometry(r * 0.24, r * 0.26, h * 0.14, seg);
    drum.translate(0, 2.5 + h * 0.62 + h * 0.07, 0);
    g.add(new THREE.Mesh(drum, this.mats.stone));

    const domeGeo = new THREE.SphereGeometry(r * 0.25, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.62);
    domeGeo.scale(1, 1.22, 1);
    domeGeo.translate(0, 2.5 + h * 0.76, 0);
    g.add(new THREE.Mesh(domeGeo, this.mats.dome));

    // Finial.
    const finial = new THREE.ConeGeometry(r * 0.035, h * 0.16, 6);
    finial.translate(0, 2.5 + h * 0.76 + r * 0.28, 0);
    g.add(new THREE.Mesh(finial, this.mats.dome));

    if (detail <= 1) {
      // Flanking half-domes.
      for (const sx of [-1, 1]) {
        const sd = new THREE.SphereGeometry(r * 0.13, seg, Math.max(5, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.6);
        sd.scale(1, 1.15, 1);
        sd.translate(sx * hallW * 0.34, 2.5 + h * 0.62, 0);
        g.add(new THREE.Mesh(sd, this.mats.dome));
      }

      // Corner minarets.
      const minH = h * 0.86;
      const minGeo = new THREE.CylinderGeometry(r * 0.045, r * 0.055, minH, Math.max(6, seg / 2));
      minGeo.translate(0, 2.5 + minH / 2, 0);
      const capGeo = new THREE.SphereGeometry(r * 0.06, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.6);
      capGeo.translate(0, 2.5 + minH, 0);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx * hallW * 0.56;
          const pz = sz * hallD * 0.62;
          const m = new THREE.Mesh(minGeo, this.mats.stone);
          m.position.set(px, 0, pz);
          g.add(m);
          const c = new THREE.Mesh(capGeo, this.mats.dome);
          c.position.set(px, 0, pz);
          g.add(c);
        }
      }
    }

    if (detail === 0) {
      // Arcaded facade — recessed arch bays along the long elevation.
      const bay = new THREE.BoxGeometry(hallW / 13, h * 0.38, 1.4);
      const inst = new THREE.InstancedMesh(bay, this.mats.stoneDark, 22);
      const d = new THREE.Object3D();
      let i = 0;
      for (const sz of [-1, 1]) {
        for (let k = 0; k < 11; k++) {
          d.position.set(-hallW * 0.45 + (k / 10) * hallW * 0.9, 2.5 + h * 0.2, sz * (hallD / 2 + 0.6));
          d.updateMatrix();
          inst.setMatrixAt(i++, d.matrix);
        }
      }
      inst.count = i;
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);

      // Perimeter courtyard wall.
      const wallH = 6;
      for (const [w, dp, ox, oz] of [
        [r * 1.9, 1.2, 0, -r * 0.75], [r * 1.9, 1.2, 0, r * 0.75],
        [1.2, r * 1.5, -r * 0.95, 0], [1.2, r * 1.5, r * 0.95, 0],
      ] as number[][]) {
        const wg = new THREE.BoxGeometry(w, wallH, dp);
        wg.translate(ox, wallH / 2, oz);
        g.add(new THREE.Mesh(wg, this.mats.stoneDark));
      }
    }

    return g;
  }

  /** Rumi Darwaza: monumental arched gateway with a domed lantern on top. */
  private buildGateway(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const w = def.radius * 1.5;
    const h = def.height;
    const d = def.radius * 0.55;
    const seg = detail === 0 ? 20 : detail === 1 ? 12 : 7;

    // Two piers with the archway void between them.
    const pierW = w * 0.3;
    for (const sx of [-1, 1]) {
      const pier = new THREE.BoxGeometry(pierW, h * 0.78, d);
      pier.translate(sx * (w / 2 - pierW / 2), h * 0.39, 0);
      g.add(new THREE.Mesh(pier, this.mats.stone));
    }

    // Spandrel above the arch.
    const spandrel = new THREE.BoxGeometry(w, h * 0.22, d);
    spandrel.translate(0, h * 0.89, 0);
    g.add(new THREE.Mesh(spandrel, this.mats.stone));

    // Arch soffit — a half cylinder closing the top of the opening.
    const arch = new THREE.CylinderGeometry(w * 0.2, w * 0.2, d, seg, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateY(Math.PI / 2);
    arch.translate(0, h * 0.78, 0);
    g.add(new THREE.Mesh(arch, this.mats.stoneDark));

    // Octagonal lantern + dome — the unmistakable crown.
    const lantern = new THREE.CylinderGeometry(w * 0.13, w * 0.15, h * 0.24, 8);
    lantern.translate(0, h * 1.12, 0);
    g.add(new THREE.Mesh(lantern, this.mats.stone));

    const chhatri = new THREE.SphereGeometry(w * 0.14, seg, Math.max(5, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.58);
    chhatri.scale(1, 1.2, 1);
    chhatri.translate(0, h * 1.24, 0);
    g.add(new THREE.Mesh(chhatri, this.mats.dome));

    if (detail <= 1) {
      // Flanking turrets.
      for (const sx of [-1, 1]) {
        const t = new THREE.CylinderGeometry(w * 0.055, w * 0.065, h * 0.3, 8);
        t.translate(sx * w * 0.42, h * 1.0, 0);
        g.add(new THREE.Mesh(t, this.mats.stone));
      }
    }

    return g;
  }

  /** Charbagh: long platform shed with domed corner pavilions and a central block. */
  private buildStation(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 18 : detail === 1 ? 11 : 7;
    const bodyW = r * 1.8;
    const bodyD = r * 0.5;

    const body = new THREE.BoxGeometry(bodyW, h * 0.5, bodyD);
    body.translate(0, h * 0.25, 0);
    g.add(new THREE.Mesh(body, this.mats.stone));

    // Central entrance block, taller.
    const centre = new THREE.BoxGeometry(bodyW * 0.26, h * 0.72, bodyD * 1.35);
    centre.translate(0, h * 0.36, 0);
    g.add(new THREE.Mesh(centre, this.mats.stone));

    // Central dome.
    const cd = new THREE.SphereGeometry(r * 0.19, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.6);
    cd.scale(1, 1.15, 1);
    cd.translate(0, h * 0.72, 0);
    g.add(new THREE.Mesh(cd, this.mats.dome));

    // Corner domed pavilions.
    for (const sx of [-1, 1]) {
      const drum = new THREE.CylinderGeometry(r * 0.12, r * 0.13, h * 0.34, 8);
      drum.translate(sx * bodyW * 0.42, h * 0.5, 0);
      g.add(new THREE.Mesh(drum, this.mats.stone));
      const dm = new THREE.SphereGeometry(r * 0.125, seg, Math.max(5, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.6);
      dm.scale(1, 1.15, 1);
      dm.translate(sx * bodyW * 0.42, h * 0.67, 0);
      g.add(new THREE.Mesh(dm, this.mats.dome));
    }

    if (detail <= 1) {
      // Platform train sheds behind the head house.
      for (let i = 0; i < 3; i++) {
        const shed = new THREE.CylinderGeometry(r * 0.16, r * 0.16, bodyW * 0.85, seg, 1, true, 0, Math.PI);
        shed.rotateZ(Math.PI / 2);
        shed.translate(0, h * 0.3, bodyD * 0.9 + i * r * 0.34);
        const m = new THREE.Mesh(shed, this.mats.roof);
        m.material.side = THREE.DoubleSide;
        g.add(m);
      }
    }

    // Add railway tracks and trains at ALL detail levels so they are always visible
    for (let i = 0; i < 3; i++) {
        // Add railway tracks
        const trackGeo = new THREE.BoxGeometry(bodyW * 2.5, 0.2, 2.5);
        const track1 = new THREE.Mesh(trackGeo, this.mats.tarmac);
        track1.position.set(0, 0.1, bodyD * 0.9 + i * r * 0.34 - 5);
        const track2 = new THREE.Mesh(trackGeo, this.mats.tarmac);
        track2.position.set(0, 0.1, bodyD * 0.9 + i * r * 0.34 + 5);
        g.add(track1, track2);
        
        // Add parked static trains
        if (i < 2) {
            const trainGeo = new THREE.BoxGeometry(bodyW * 0.8, 3.5, 2.8);
            const train = new THREE.Mesh(trainGeo, this.mats.roof); 
            train.position.set(i === 0 ? -bodyW * 0.2 : bodyW * 0.3, 2, bodyD * 0.9 + i * r * 0.34 - 5);
            
            // Glowing windows
            const trainWindows = new THREE.BoxGeometry(bodyW * 0.78, 1.2, 3.0);
            const emissiveMat = new THREE.MeshBasicMaterial({ color: 0xffddaa });
            const windows = new THREE.Mesh(trainWindows, emissiveMat);
            windows.position.set(i === 0 ? -bodyW * 0.2 : bodyW * 0.3, 2.2, bodyD * 0.9 + i * r * 0.34 - 5);
            g.add(train, windows);
        }

        // Add a moving train on the last track
        if (i === 2) {
          const movingTrainGeo = new THREE.BoxGeometry(bodyW * 2.5, 3.5, 3.0);
          const movingTrainMat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
              varying vec2 vUv;
              void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: `
              uniform float uTime;
              varying vec2 vUv;
              void main() {
                float speed = 0.15;
                float t = fract(uTime * speed);
                float dist = abs(vUv.x - t);
                // Train length is 15% of track
                float train = step(dist, 0.075);
                if (train < 0.5) discard;
                
                // Windows dash pattern
                float windows = step(0.3, fract(vUv.x * 150.0));
                // Add a bright headlamp at the front (t + 0.075)
                float headlamp = step(0.072, dist) * step(vUv.x, t + 0.08) * step(t, vUv.x);
                vec3 color = mix(vec3(1.0, 0.8, 0.5) * windows, vec3(1.0, 1.0, 1.0), headlamp * 2.0);
                
                gl_FragColor = vec4(color, 1.0);
              }
            `,
            transparent: true,
            side: THREE.DoubleSide
          });
          const movingTrain = new THREE.Mesh(movingTrainGeo, movingTrainMat);
          movingTrain.position.set(0, 2, bodyD * 0.9 + i * r * 0.34 + 5);
          g.add(movingTrain);
          
          const animateTrain = () => {
             movingTrainMat.uniforms.uTime.value = performance.now() / 1000;
             requestAnimationFrame(animateTrain);
          };
          animateTrain();
        }
    }

    return g;
  }

  /** Ambedkar Memorial: domed stupa on a plinth ringed by a colonnade. */
  private buildMemorial(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 32 : detail === 1 ? 18 : 10;

    const plinth = new THREE.CylinderGeometry(r * 0.62, r * 0.66, h * 0.16, seg);
    plinth.translate(0, h * 0.08, 0);
    g.add(new THREE.Mesh(plinth, this.mats.stoneDark));

    const drum = new THREE.CylinderGeometry(r * 0.34, r * 0.38, h * 0.42, seg);
    drum.translate(0, h * 0.37, 0);
    g.add(new THREE.Mesh(drum, this.mats.stone));

    const dome = new THREE.SphereGeometry(r * 0.35, seg, Math.max(7, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.55);
    dome.scale(1, 0.95, 1);
    dome.translate(0, h * 0.58, 0);
    g.add(new THREE.Mesh(dome, this.mats.dome));

    const finial = new THREE.ConeGeometry(r * 0.04, h * 0.2, 6);
    finial.translate(0, h * 0.92, 0);
    g.add(new THREE.Mesh(finial, this.mats.dome));

    if (detail <= 1) {
      // Perimeter colonnade — the memorial's defining feature from above.
      const colH = h * 0.44;
      const col = new THREE.CylinderGeometry(r * 0.028, r * 0.032, colH, 8);
      col.translate(0, colH / 2, 0);
      const count = detail === 0 ? 36 : 20;
      const inst = new THREE.InstancedMesh(col, this.mats.stone, count);
      const d = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        d.position.set(Math.cos(a) * r * 0.86, 0, Math.sin(a) * r * 0.86);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    return g;
  }

  /** Vidhan Bhawan: symmetrical wings with a tall central dome. */
  private buildAssembly(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 24 : detail === 1 ? 14 : 8;

    const wings = new THREE.BoxGeometry(r * 2.0, h * 0.5, r * 0.62);
    wings.translate(0, h * 0.25, 0);
    g.add(new THREE.Mesh(wings, this.mats.stone));

    const centre = new THREE.BoxGeometry(r * 0.66, h * 0.68, r * 0.8);
    centre.translate(0, h * 0.34, 0);
    g.add(new THREE.Mesh(centre, this.mats.stone));

    const drum = new THREE.CylinderGeometry(r * 0.24, r * 0.27, h * 0.16, seg);
    drum.translate(0, h * 0.74, 0);
    g.add(new THREE.Mesh(drum, this.mats.stone));

    const dome = new THREE.SphereGeometry(r * 0.25, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.6);
    dome.scale(1, 1.1, 1);
    dome.translate(0, h * 0.82, 0);
    g.add(new THREE.Mesh(dome, this.mats.dome));

    if (detail <= 1) {
      for (const sx of [-1, 1]) {
        const t = new THREE.CylinderGeometry(r * 0.08, r * 0.09, h * 0.28, 8);
        t.translate(sx * r * 0.85, h * 0.5, 0);
        g.add(new THREE.Mesh(t, this.mats.stone));
        const c = new THREE.SphereGeometry(r * 0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
        c.translate(sx * r * 0.85, h * 0.64, 0);
        g.add(new THREE.Mesh(c, this.mats.dome));
      }
    }

    if (detail === 0) {
      // Portico columns.
      const colH = h * 0.42;
      const col = new THREE.CylinderGeometry(r * 0.03, r * 0.035, colH, 8);
      col.translate(0, colH / 2, 0);
      const inst = new THREE.InstancedMesh(col, this.mats.stone, 12);
      const d = new THREE.Object3D();
      for (let i = 0; i < 12; i++) {
        d.position.set(-r * 0.33 + (i / 11) * r * 0.66, 0, r * 0.44);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    return g;
  }

  /** Airport: long low terminal with a curved roof, plus an apron and control tower. */
  private buildTerminal(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 0 ? 20 : detail === 1 ? 12 : 6;

    const apron = new THREE.BoxGeometry(r * 2.6, 0.6, r * 1.5);
    apron.translate(0, 0.3, r * 0.55);
    g.add(new THREE.Mesh(apron, this.mats.stoneDark));

    const body = new THREE.BoxGeometry(r * 2.1, h * 0.62, r * 0.55);
    body.translate(0, h * 0.31, -r * 0.3);
    g.add(new THREE.Mesh(body, this.mats.glass));

    // Curved standing-seam roof — the read at distance.
    const roof = new THREE.CylinderGeometry(r * 0.34, r * 0.34, r * 2.2, seg, 1, true, 0, Math.PI);
    roof.rotateZ(Math.PI / 2);
    roof.translate(0, h * 0.6, -r * 0.3);
    const roofMesh = new THREE.Mesh(roof, this.mats.roof);
    roofMesh.material.side = THREE.DoubleSide;
    g.add(roofMesh);

    // Control tower.
    const twr = new THREE.CylinderGeometry(r * 0.045, r * 0.06, h * 1.9, 8);
    twr.translate(r * 0.95, h * 0.95, -r * 0.55);
    g.add(new THREE.Mesh(twr, this.mats.stone));
    const cab = new THREE.CylinderGeometry(r * 0.085, r * 0.07, h * 0.24, 8);
    cab.translate(r * 0.95, h * 1.95, -r * 0.55);
    g.add(new THREE.Mesh(cab, this.mats.glass));

    // ── Airside ──────────────────────────────────────────────────────────────
    // Without a runway the terminal just reads as a warehouse. Amausi has a single
    // ~2.7 km runway running roughly NE-SW; the landmark's own rotation carries
    // the real orientation, so this is laid out along the local X axis.
    const runwayLen = 2700;
    const runway = new THREE.BoxGeometry(runwayLen, 0.5, 60);
    runway.translate(0, 0.25, r * 2.3);
    g.add(new THREE.Mesh(runway, this.mats.tarmac));

    // Centreline dashes — the strongest "this is a runway" cue from the air.
    const dash = new THREE.BoxGeometry(48, 0.2, 2.4);
    const dashCount = detail === 2 ? 14 : 30;
    const dashes = new THREE.InstancedMesh(dash, this.mats.marking, dashCount);
    const dm = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      dm.position.set(-runwayLen / 2 + (i + 0.5) * (runwayLen / dashCount), 0.62, r * 2.3);
      dm.updateMatrix();
      dashes.setMatrixAt(i, dm.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    g.add(dashes);

    // Threshold bars at both ends.
    for (const sx of [-1, 1]) {
      const thr = new THREE.BoxGeometry(26, 0.2, 44);
      thr.translate(sx * (runwayLen / 2 - 40), 0.62, r * 2.3);
      g.add(new THREE.Mesh(thr, this.mats.marking));
    }

    // Parallel taxiway linking runway to apron.
    const taxi = new THREE.BoxGeometry(runwayLen * 0.72, 0.4, 24);
    taxi.translate(0, 0.2, r * 1.55);
    g.add(new THREE.Mesh(taxi, this.mats.tarmac));
    for (const sx of [-1, 0, 1]) {
      const link = new THREE.BoxGeometry(24, 0.4, r * 0.75);
      link.translate(sx * runwayLen * 0.3, 0.2, r * 1.92);
      g.add(new THREE.Mesh(link, this.mats.tarmac));
    }

    if (detail <= 1) {
      const stands = detail === 0 ? 6 : 4;
      for (let i = 0; i < stands; i++) {
        const px = -r * 0.85 + (i / Math.max(1, stands - 1)) * r * 1.7;
        g.add(this.buildParkedAircraft(px, r * 0.55, detail === 0));
      }
    }

    return g;
  }

  /** Simple narrow-body silhouette for apron stands. */
  private buildParkedAircraft(x: number, z: number, detailed: boolean): THREE.Group {
    const a = new THREE.Group();
    const seg = detailed ? 10 : 6;

    const fuse = new THREE.CylinderGeometry(1.9, 1.5, 34, seg);
    fuse.rotateZ(Math.PI / 2);
    fuse.translate(0, 3.4, 0);
    a.add(new THREE.Mesh(fuse, this.mats.aircraft));

    const wing = new THREE.BoxGeometry(9, 0.6, 32);
    wing.translate(1, 2.7, 0);
    a.add(new THREE.Mesh(wing, this.mats.aircraft));

    const tail = new THREE.BoxGeometry(5, 0.5, 12);
    tail.translate(-14, 3.6, 0);
    a.add(new THREE.Mesh(tail, this.mats.aircraft));

    const fin = new THREE.BoxGeometry(5.5, 9, 0.6);
    fin.translate(-14.5, 7.5, 0);
    a.add(new THREE.Mesh(fin, this.mats.aircraft));

    a.position.set(x, 0, z);
    a.rotation.y = Math.PI / 2;
    return a;
  }

  /** Hussainabad Clock Tower: tapering Gothic-Revival shaft with a clock stage. */
  private buildTower(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;
    const seg = detail === 2 ? 6 : 8;

    const base = new THREE.BoxGeometry(r * 1.5, h * 0.12, r * 1.5);
    base.translate(0, h * 0.06, 0);
    g.add(new THREE.Mesh(base, this.mats.stoneDark));

    const shaft = new THREE.CylinderGeometry(r * 0.42, r * 0.6, h * 0.62, seg);
    shaft.translate(0, h * 0.43, 0);
    g.add(new THREE.Mesh(shaft, this.mats.stone));

    const stage = new THREE.CylinderGeometry(r * 0.55, r * 0.5, h * 0.13, seg);
    stage.translate(0, h * 0.8, 0);
    g.add(new THREE.Mesh(stage, this.mats.stoneDark));

    const spire = new THREE.ConeGeometry(r * 0.5, h * 0.24, seg);
    spire.translate(0, h * 0.98, 0);
    g.add(new THREE.Mesh(spire, this.mats.dome));

    if (detail === 0) {
      // Clock faces on the four cardinal sides.
      const face = new THREE.CircleGeometry(r * 0.3, 14);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const f = face.clone();
        f.rotateY(a + Math.PI / 2);
        f.translate(Math.cos(a) * r * 0.56, h * 0.8, Math.sin(a) * r * 0.56);
        g.add(new THREE.Mesh(f, this.mats.dome));
      }
    }

    return g;
  }

  /** Contemporary retail block: glazed mass, parapet band, rooftop plant. */
  private buildMall(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;

    const body = new THREE.BoxGeometry(r * 1.7, h * 0.85, r * 1.15);
    body.translate(0, h * 0.425, 0);
    g.add(new THREE.Mesh(body, this.mats.glass));

    const band = new THREE.BoxGeometry(r * 1.78, h * 0.12, r * 1.22);
    band.translate(0, h * 0.9, 0);
    g.add(new THREE.Mesh(band, this.mats.stone));

    if (detail <= 1) {
      const drum = new THREE.CylinderGeometry(r * 0.3, r * 0.3, h * 0.22, detail === 0 ? 20 : 10);
      drum.translate(0, h * 1.0, 0);
      g.add(new THREE.Mesh(drum, this.mats.glass));

      const plant = new THREE.BoxGeometry(r * 0.5, h * 0.1, r * 0.4);
      plant.translate(-r * 0.45, h * 0.95, r * 0.3);
      g.add(new THREE.Mesh(plant, this.mats.metal));
    }

    return g;
  }

  /** Institutional campus: quadrangle of wings around a court, central block. */
  private buildCampus(def: LandmarkDef, detail: number): THREE.Group {
    const g = new THREE.Group();
    const r = def.radius;
    const h = def.height;

    const wingH = h * 0.72;
    const specs: number[][] = [
      [r * 1.7, r * 0.34, 0, -r * 0.7],
      [r * 1.7, r * 0.34, 0, r * 0.7],
      [r * 0.34, r * 1.06, -r * 0.68, 0],
      [r * 0.34, r * 1.06, r * 0.68, 0],
    ];
    for (const [w, d, ox, oz] of specs) {
      const b = new THREE.BoxGeometry(w, wingH, d);
      b.translate(ox, wingH / 2, oz);
      g.add(new THREE.Mesh(b, this.mats.stone));
    }

    const centre = new THREE.BoxGeometry(r * 0.5, h, r * 0.5);
    centre.translate(0, h / 2, 0);
    g.add(new THREE.Mesh(centre, this.mats.stone));

    if (detail <= 1) {
      const seg = detail === 0 ? 18 : 10;
      const dome = new THREE.SphereGeometry(r * 0.26, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.6);
      dome.scale(1, 1.05, 1);
      dome.translate(0, h, 0);
      g.add(new THREE.Mesh(dome, this.mats.dome));

      const court = new THREE.PlaneGeometry(r * 0.95, r * 0.95);
      court.rotateX(-Math.PI / 2);
      court.translate(0, 0.3, 0);
      g.add(new THREE.Mesh(court, this.mats.turf));
    }

    return g;
  }

  public dispose(): void {
    this.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of Object.values(this.mats)) m.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
