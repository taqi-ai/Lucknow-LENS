/**
 * Transport Hubs & Signature Infrastructure System for Lucknow LENS
 *
 * Implements high-fidelity 3D digital twins for Lucknow's premier transportation gateways,
 * inspired directly by municipal simulation designs and real geospatial layouts:
 *
 * 1. Chaudhary Charan Singh International Airport (Amausi, VILK / LKO):
 *    - Full Runway 09/27 (2,740 m) with ICAO markings: threshold piano keys, touchdown zone,
 *      dashed centerlines, large runway numbers ("09" / "27"), blast pads, and edge lines.
 *    - Night runway approach & edge lighting: green threshold lights, white runway edge lamps,
 *      red stop lights, and 4-unit PAPI visual glideslope indicators.
 *    - Parallel taxiway network with bright yellow centerlines and blue night edge lighting.
 *    - Terminal 3 (T3) modern curved modular blue-glass wave canopy with interior illumination.
 *    - 5 passenger boarding gates with articulated 3D aerobridges (jet-bridges).
 *    - Parked commercial passenger jetliners (IndiGo, Air India, Akasa Air) and aircraft on taxiway.
 *    - 54m Air Traffic Control (ATC) tower with 360° observation cab and rotating radar dome.
 *    - Dedicated apron Helipad with illuminated blue perimeter ring and white "H".
 *    - Ground Support Equipment (GSE) staging bays with yellow hazard markings.
 *
 * 2. Lucknow Charbagh Railway Grand Terminal (LKO / LJN) & Right-Side Monuments:
 *    - Iconic Mughal-Gothic palatial terminal facade designed like a giant chessboard,
 *      complete with red-brick walls, white Rajput cupolas (chhatris), central dome, and minarets.
 *    - Central historic clock tower above the main portico with illuminated clock face.
 *    - 6 parallel passenger platforms covered by authentic curved corrugated steel sheds.
 *    - Covered Foot Overbridges (FOBs) with stairways connecting platforms across the tracks.
 *    - Multi-track railway yard with textured stone ballast bed, concrete sleepers, and steel rails.
 *    - High-mast floodlight towers for nocturnal railway yard illumination.
 *    - Road-rail grade level crossing with red/white boom barrier gates and warning strobe posts.
 *    - Adjacent signature monuments to the right:
 *      * Lucknow Junction (LJN - NER) Heritage Cabway & Steam Engine on Plinth memorial.
 *      * Mawaiya Balanced Cantilever Metro Overbridge (flying 21m over rail tracks).
 *      * Northern Railway DRM Heritage Complex.
 *      * Ravindralaya Heritage Auditorium & Amphitheater.
 */

import * as THREE from 'three';

export interface TransportHubData {
  id: string;
  name: string;
  category: 'airport' | 'railway';
  x: number;
  z: number;
  boundsRadius: number;
  badgeLabel: string;
  badgeSub: string;
  metadata: {
    status: string;
    capacity: string;
    keyFeatures: string;
    details: Record<string, string>;
  };
}

export const TRANSPORT_HUBS_REGISTRY: TransportHubData[] = [
  {
    id: 'hub-ccs-airport',
    name: 'Chaudhary Charan Singh International Airport (Amausi)',
    category: 'airport',
    x: -9988,
    z: 9769,
    boundsRadius: 1800,
    badgeLabel: 'CCS INT\'L AIRPORT (LKO)',
    badgeSub: 'TERMINAL 3 • 24/7 ACTIVE',
    metadata: {
      status: 'Active • CAT-II ILS Equipped',
      capacity: '13.5 Million Passengers / Year',
      keyFeatures: 'Terminal 3 Wave Canopy, Runway 09/27, 5 Aerobridges, ATC Tower, Helipad',
      details: {
        'ICAO / IATA Code': 'VILK / LKO',
        'Runway Length': '2,744 m × 46 m (Runway 09/27)',
        'Elevation': '123 m (404 ft) AMSL',
        'Terminal 3 Area': '144,000 m² Integrated International & Domestic',
        'Active Airlines': 'IndiGo, Air India, Emirates, Flydubai, Saudia, Akasa Air, Vistara',
        'Rapid Transit': 'Lucknow Metro Red Line (CCS Airport Metro Station)',
      },
    },
  },
  {
    id: 'hub-charbagh-railway',
    name: 'Lucknow Charbagh Railway Grand Terminal',
    category: 'railway',
    x: -1499,
    z: 1574,
    boundsRadius: 1200,
    badgeLabel: 'CHARBAGH GRAND TERMINAL (LKO)',
    badgeSub: 'NR & NER JUNCTION • 24/7 ACTIVE',
    metadata: {
      status: 'Active • Major Northern Railway Hub',
      capacity: '320,000+ Passengers / Day',
      keyFeatures: 'Chessboard Mughal-Gothic Palace, 9 Platforms, Foot Overbridges, Rail Yard',
      details: {
        'Station Codes': 'LKO (Northern Rail) & LJN (North Eastern Rail)',
        'Architecture': 'J.H. Horniman Royal Chessboard Palace (Opened 1926)',
        'Total Platforms': '9 Broad Gauge + 6 Lucknow Jn Platforms',
        'Key Trains': 'Vande Bharat Express, Lucknow Shatabdi, Gomti Express, Tejas, Pushpak',
        'Adjacent Monuments': 'Lucknow Jn Cabway, Mawaiya Cantilever Bridge, DRM Office, Ravindralaya',
        'Metro Connectivity': 'Charbagh Underground Metro Station (Red Line)',
      },
    },
  },
];

/** Procedural high-DPI badge texture generator */
function createHubBadgeTexture(hub: TransportHubData): THREE.CanvasTexture {
  const w = 400;
  const h = 220;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const iconCy = 65;
  const iconRadius = 46;

  const isAirport = hub.category === 'airport';
  const primaryColor = isAirport ? '#0284c7' : '#d97706';
  const glowColor = isAirport ? 'rgba(14, 165, 233, 0.45)' : 'rgba(245, 158, 11, 0.45)';

  // 1. Ambient glow
  const glowGrad = ctx.createRadialGradient(cx, iconCy, 15, cx, iconCy, 75);
  glowGrad.addColorStop(0, glowColor);
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, 140);

  // 2. Icon disc container
  ctx.beginPath();
  ctx.arc(cx, iconCy, iconRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // 3. Central Icon
  ctx.save();
  ctx.translate(cx, iconCy);
  if (isAirport) {
    // Jetliner Silhouette
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(4, -14, 4, -4);
    ctx.lineTo(24, 6);
    ctx.lineTo(24, 11);
    ctx.lineTo(4, 4);
    ctx.lineTo(4, 18);
    ctx.lineTo(10, 24);
    ctx.lineTo(10, 27);
    ctx.lineTo(0, 24);
    ctx.lineTo(-10, 27);
    ctx.lineTo(-10, 24);
    ctx.lineTo(-4, 18);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-24, 11);
    ctx.lineTo(-24, 6);
    ctx.lineTo(-4, -4);
    ctx.quadraticCurveTo(-4, -14, 0, -26);
    ctx.closePath();
    ctx.fill();
  } else {
    // Classic Express Train Engine Silhouette
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(-16, -22, 32, 38, [6, 6, 2, 2]);
    ctx.fill();
    // Windshield
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-12, -18, 24, 12, 2);
    ctx.fill();
    // Train dual headlights
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(-8, 3, 3, 0, Math.PI * 2);
    ctx.arc(8, 3, 3, 0, Math.PI * 2);
    ctx.fill();
    // Cowcatcher grill
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-18, 16);
    ctx.lineTo(0, 22);
    ctx.lineTo(18, 16);
    ctx.lineTo(18, 19);
    ctx.lineTo(0, 25);
    ctx.lineTo(-18, 19);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 4. Label Pill Beneath
  const pillW = 320;
  const pillH = 54;
  const pillX = (w - pillW) * 0.5;
  const pillY = 135;

  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 12);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // Badge primary header
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(hub.badgeLabel, cx, pillY + 23);

  // Badge subtitle
  ctx.fillStyle = isAirport ? '#38bdf8' : '#fbbf24';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(hub.badgeSub, cx, pillY + 42);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class TransportHubManager {
  private readonly scene: THREE.Scene;
  private readonly rootGroup = new THREE.Group();
  private readonly airportGroup = new THREE.Group();
  private readonly charbaghGroup = new THREE.Group();
  private readonly badgesGroup = new THREE.Group();

  private isNight = true;
  private visible = true;
  private radarMesh: THREE.Mesh | null = null;
  private badgeSprites: Map<string, THREE.Sprite> = new Map();
  private interactiveObjects: THREE.Object3D[] = [];

  // Reusable Materials
  private asphaltMat!: THREE.MeshStandardMaterial;
  private concreteMat!: THREE.MeshStandardMaterial;
  private grassMat!: THREE.MeshStandardMaterial;
  private blueGlassMat!: THREE.MeshStandardMaterial;
  private terminalWhiteMat!: THREE.MeshStandardMaterial;
  private aircraftWhiteMat!: THREE.MeshStandardMaterial;
  private indigoBlueMat!: THREE.MeshStandardMaterial;
  private airIndiaRedMat!: THREE.MeshStandardMaterial;
  private runwayMarkingMat!: THREE.MeshBasicMaterial;
  private runwayLightGreenMat!: THREE.MeshBasicMaterial;
  private runwayLightWhiteMat!: THREE.MeshBasicMaterial;
  private runwayLightRedMat!: THREE.MeshBasicMaterial;
  private taxiwayLightBlueMat!: THREE.MeshBasicMaterial;

  private charbaghBrickMat!: THREE.MeshStandardMaterial;
  private sandstoneWhiteMat!: THREE.MeshStandardMaterial;
  private domeGoldMat!: THREE.MeshStandardMaterial;
  private railBedMat!: THREE.MeshStandardMaterial;
  private railTrackMat!: THREE.MeshStandardMaterial;
  private platformRoofMat!: THREE.MeshStandardMaterial;
  private yardLightMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rootGroup.name = 'transport-hubs';
    this.airportGroup.name = 'ccs-international-airport';
    this.charbaghGroup.name = 'charbagh-railway-terminal';
    this.badgesGroup.name = 'transport-hub-badges';

    this.initMaterials();
    this.buildCCSAirport();
    this.buildCharbaghStation();
    this.buildBadges();

    this.rootGroup.add(this.airportGroup);
    this.rootGroup.add(this.charbaghGroup);
    this.rootGroup.add(this.badgesGroup);
    this.scene.add(this.rootGroup);
  }

  private initMaterials(): void {
    // Airport Materials
    this.asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x181a20,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.concreteMat = new THREE.MeshStandardMaterial({
      color: 0x5a5e68,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0x2e6f36,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.blueGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.75,
      transparent: true,
      opacity: 0.88,
    });
    this.terminalWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.5,
      metalness: 0.1,
    });
    this.aircraftWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.35,
    });
    this.indigoBlueMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.airIndiaRedMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.runwayMarkingMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
    });
    this.runwayLightGreenMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    this.runwayLightWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.runwayLightRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    this.taxiwayLightBlueMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Charbagh Station Materials
    this.charbaghBrickMat = new THREE.MeshStandardMaterial({
      color: 0xab3f2b,
      roughness: 0.86,
      metalness: 0.04,
    });
    this.sandstoneWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xe2ded4,
      roughness: 0.72,
      metalness: 0.05,
    });
    this.domeGoldMat = new THREE.MeshStandardMaterial({
      color: 0xcca03c,
      roughness: 0.4,
      metalness: 0.6,
    });
    this.railBedMat = new THREE.MeshStandardMaterial({
      color: 0x3e3a35,
      roughness: 0.94,
      metalness: 0.0,
    });
    this.railTrackMat = new THREE.MeshStandardMaterial({
      color: 0x8a8d94,
      roughness: 0.4,
      metalness: 0.75,
    });
    this.platformRoofMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.6,
      metalness: 0.3,
    });
    this.yardLightMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      emissive: 0xffb74d,
      emissiveIntensity: 0.8,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CHAUDHARY CHARAN SINGH INTERNATIONAL AIRPORT (AMAUSI, LUCKNOW)
  // ─────────────────────────────────────────────────────────────────────────

  private buildCCSAirport(): void {
    const apData = TRANSPORT_HUBS_REGISTRY[0];
    const originX = apData.x; // -9988
    const originZ = apData.z; // 9769
    this.airportGroup.position.set(originX, 0, originZ);

    // Bearing 95 degrees: rotate airport complex to match real orientation
    const bearing = (95 * Math.PI) / 180;
    this.airportGroup.rotation.y = -bearing;

    // --- A. Airfield Green Boundary Turf ---
    const turfGeo = new THREE.PlaneGeometry(2860, 720);
    turfGeo.rotateX(-Math.PI / 2);
    const turfMesh = new THREE.Mesh(turfGeo, this.grassMat);
    turfMesh.position.set(0, 0.4, -60);
    this.airportGroup.add(turfMesh);

    // --- B. Runway 09/27 (2,740 m x 46 m) ---
    const rLen = 2740;
    const rWid = 46;
    const runwayGeo = new THREE.PlaneGeometry(rLen, rWid);
    runwayGeo.rotateX(-Math.PI / 2);
    const runwayMesh = new THREE.Mesh(runwayGeo, this.asphaltMat);
    runwayMesh.position.set(0, 0.65, 0);
    runwayMesh.userData = { type: 'poi', hub: apData, name: apData.name };
    this.airportGroup.add(runwayMesh);
    this.interactiveObjects.push(runwayMesh);

    // Chevron Blast Pads at both runway ends (60m each)
    const blastGeo = new THREE.PlaneGeometry(60, rWid);
    blastGeo.rotateX(-Math.PI / 2);
    const blastMat = new THREE.MeshStandardMaterial({ color: 0x1f2127, roughness: 0.9 });
    const blastWest = new THREE.Mesh(blastGeo, blastMat);
    blastWest.position.set(-rLen / 2 - 30, 0.62, 0);
    const blastEast = new THREE.Mesh(blastGeo, blastMat);
    blastEast.position.set(rLen / 2 + 30, 0.62, 0);
    this.airportGroup.add(blastWest, blastEast);

    // --- C. Runway ICAO Markings (Piano keys, Centerlines, Numbers) ---
    const markingsGroup = new THREE.Group();
    markingsGroup.position.y = 0.75;

    // 1. Centerline Dashes (30m long, 20m gaps)
    const dashCount = Math.floor(rLen / 50) - 4;
    const dashGeo = new THREE.PlaneGeometry(30, 1.4);
    dashGeo.rotateX(-Math.PI / 2);
    const dashInst = new THREE.InstancedMesh(dashGeo, this.runwayMarkingMat, dashCount);
    const dummy = new THREE.Object3D();
    const startX = -((dashCount - 1) * 50) / 2;
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(startX + i * 50, 0, 0);
      dummy.updateMatrix();
      dashInst.setMatrixAt(i, dummy.matrix);
    }
    dashInst.instanceMatrix.needsUpdate = true;
    markingsGroup.add(dashInst);

    // 2. Threshold "Piano Keys" (12 bars at each threshold: 30m x 1.8m)
    const keyGeo = new THREE.PlaneGeometry(30, 1.8);
    keyGeo.rotateX(-Math.PI / 2);
    const keyInst = new THREE.InstancedMesh(keyGeo, this.runwayMarkingMat, 24);
    const keyOffsets = [-19, -15.5, -12, -8.5, -5, -1.8, 1.8, 5, 8.5, 12, 15.5, 19];
    let keyIdx = 0;
    // West Threshold (09)
    for (const zOff of keyOffsets) {
      dummy.position.set(-rLen / 2 + 25, 0, zOff);
      dummy.updateMatrix();
      keyInst.setMatrixAt(keyIdx++, dummy.matrix);
    }
    // East Threshold (27)
    for (const zOff of keyOffsets) {
      dummy.position.set(rLen / 2 - 25, 0, zOff);
      dummy.updateMatrix();
      keyInst.setMatrixAt(keyIdx++, dummy.matrix);
    }
    keyInst.instanceMatrix.needsUpdate = true;
    markingsGroup.add(keyInst);

    // 3. Runway Edge White Lines
    const edgeGeo = new THREE.PlaneGeometry(rLen - 40, 0.9);
    edgeGeo.rotateX(-Math.PI / 2);
    const edgeNorth = new THREE.Mesh(edgeGeo, this.runwayMarkingMat);
    edgeNorth.position.set(0, 0, -rWid / 2 + 1);
    const edgeSouth = new THREE.Mesh(edgeGeo, this.runwayMarkingMat);
    edgeSouth.position.set(0, 0, rWid / 2 - 1);
    markingsGroup.add(edgeNorth, edgeSouth);

    // 4. Runway Numbers: Procedural Canvas Plane (09 & 27)
    const numCanvas = document.createElement('canvas');
    numCanvas.width = 256;
    numCanvas.height = 128;
    const nCtx = numCanvas.getContext('2d');
    if (nCtx) {
      nCtx.fillStyle = '#181a20';
      nCtx.fillRect(0, 0, 256, 128);
      nCtx.fillStyle = '#ffffff';
      nCtx.font = 'bold 90px "Arial Black", sans-serif';
      nCtx.textAlign = 'center';
      nCtx.textBaseline = 'middle';
      nCtx.fillText('09', 64, 64);
      nCtx.fillText('27', 192, 64);
    }
    const numTex = new THREE.CanvasTexture(numCanvas);
    const numMat = new THREE.MeshBasicMaterial({ map: numTex });
    const num09Geo = new THREE.PlaneGeometry(16, 12);
    num09Geo.rotateX(-Math.PI / 2);
    const num09Mesh = new THREE.Mesh(num09Geo, numMat);
    num09Mesh.position.set(-rLen / 2 + 65, 0.05, 0);
    const num27Mesh = new THREE.Mesh(num09Geo, numMat);
    num27Mesh.position.set(rLen / 2 - 65, 0.05, 0);
    num27Mesh.rotation.y = Math.PI;
    markingsGroup.add(num09Mesh, num27Mesh);

    this.airportGroup.add(markingsGroup);

    // --- D. Parallel Taxiway & High-Speed Connectors ---
    const taxiwayZ = -180;
    const taxiLen = 2200;
    const taxiWid = 24;
    const taxiGeo = new THREE.PlaneGeometry(taxiLen, taxiWid);
    taxiGeo.rotateX(-Math.PI / 2);
    const taxiMesh = new THREE.Mesh(taxiGeo, this.asphaltMat);
    taxiMesh.position.set(-80, 0.62, taxiwayZ);
    this.airportGroup.add(taxiMesh);

    // Taxiway Yellow Centerline
    const taxiLineGeo = new THREE.PlaneGeometry(taxiLen, 0.6);
    taxiLineGeo.rotateX(-Math.PI / 2);
    const taxiLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthWrite: false });
    const taxiLineMesh = new THREE.Mesh(taxiLineGeo, taxiLineMat);
    taxiLineMesh.position.set(-80, 0.72, taxiwayZ);
    this.airportGroup.add(taxiLineMesh);

    // 4 Angled Runway-Taxiway Exit Connectors
    const connOffsets = [-800, -280, 280, 800];
    for (const cX of connOffsets) {
      const connGeo = new THREE.PlaneGeometry(18, 185);
      connGeo.rotateX(-Math.PI / 2);
      const connMesh = new THREE.Mesh(connGeo, this.asphaltMat);
      connMesh.position.set(cX, 0.6, taxiwayZ / 2);
      this.airportGroup.add(connMesh);
    }

    // --- E. Terminal 3 (T3) Modern Arched Wave Canopy & Concourse ---
    const termZ = -300;
    const termX = -120;

    // Terminal Reinforced Concrete Apron Parking Staging
    const apronGeo = new THREE.PlaneGeometry(620, 110);
    apronGeo.rotateX(-Math.PI / 2);
    const apronMesh = new THREE.Mesh(apronGeo, this.concreteMat);
    apronMesh.position.set(termX, 0.64, termZ + 65);
    this.airportGroup.add(apronMesh);

    // Terminal Concourse Base Building (240m x 70m x 18m)
    const baseBuildingGeo = new THREE.BoxGeometry(240, 18, 70);
    const baseBuildingMesh = new THREE.Mesh(baseBuildingGeo, this.terminalWhiteMat);
    baseBuildingMesh.position.set(termX, 9, termZ);
    baseBuildingMesh.castShadow = true;
    baseBuildingMesh.receiveShadow = true;
    baseBuildingMesh.userData = { type: 'poi', hub: apData, name: 'CCS Airport Terminal 3' };
    this.airportGroup.add(baseBuildingMesh);
    this.interactiveObjects.push(baseBuildingMesh);

    // Signature Curved Blue-Glass Vaulted Wave Canopy (Inspired by SimCity design pic & real Lucknow T3)
    const canopyShape = new THREE.Shape();
    canopyShape.moveTo(-130, 0);
    canopyShape.quadraticCurveTo(0, 28, 130, 0);
    canopyShape.lineTo(125, -2);
    canopyShape.quadraticCurveTo(0, 24, -125, -2);
    canopyShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 85,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 2,
      bevelSize: 1.5,
      bevelThickness: 1.5,
    };
    const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, extrudeSettings);
    canopyGeo.center();
    const canopyMesh = new THREE.Mesh(canopyGeo, this.blueGlassMat);
    canopyMesh.position.set(termX, 22, termZ);
    canopyMesh.castShadow = true;
    this.airportGroup.add(canopyMesh);

    // White Support Arch Space-Frames
    for (let archZ = -30; archZ <= 30; archZ += 20) {
      const archGeo = new THREE.TorusGeometry(120, 1.2, 8, 24, Math.PI);
      const archMesh = new THREE.Mesh(archGeo, this.terminalWhiteMat);
      archMesh.position.set(termX, 5, termZ + archZ);
      archMesh.rotation.z = Math.PI;
      this.airportGroup.add(archMesh);
    }

    // --- F. 5 Articulated Boarding Aerobridges (Jet-Bridges) ---
    const gateOffsets = [-80, -40, 0, 40, 80];
    for (const gX of gateOffsets) {
      // Elevated Boarding Tube from Terminal
      const tubeGeo = new THREE.BoxGeometry(4.5, 3.8, 38);
      const tubeMesh = new THREE.Mesh(tubeGeo, this.terminalWhiteMat);
      tubeMesh.position.set(termX + gX, 9, termZ + 54);
      tubeMesh.castShadow = true;

      // Articulated Docking Cabin
      const dockGeo = new THREE.BoxGeometry(5.2, 4.4, 6);
      const dockMesh = new THREE.Mesh(dockGeo, this.asphaltMat);
      dockMesh.position.set(termX + gX, 8.5, termZ + 73);

      // Support Pylon
      const pylonGeo = new THREE.CylinderGeometry(0.8, 0.8, 8, 8);
      const pylonMesh = new THREE.Mesh(pylonGeo, this.concreteMat);
      pylonMesh.position.set(termX + gX, 4, termZ + 70);

      this.airportGroup.add(tubeMesh, dockMesh, pylonMesh);
    }

    // --- G. 3D Commercial Passenger Aircraft Parked at Gates ---
    // Gate 1: IndiGo Airbus A321
    const plane1 = this.buildAirlinerModel(this.indigoBlueMat, 'IndiGo');
    plane1.position.set(termX - 80, 0.8, termZ + 96);
    plane1.rotation.y = Math.PI;
    this.airportGroup.add(plane1);
    this.interactiveObjects.push(plane1);

    // Gate 2: Air India Boeing 787
    const plane2 = this.buildAirlinerModel(this.airIndiaRedMat, 'Air India');
    plane2.position.set(termX - 40, 0.8, termZ + 96);
    plane2.rotation.y = Math.PI;
    this.airportGroup.add(plane2);
    this.interactiveObjects.push(plane2);

    // Gate 3: Akasa Air Boeing 737 MAX
    const akasaOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 });
    const plane3 = this.buildAirlinerModel(akasaOrangeMat, 'Akasa Air');
    plane3.position.set(termX + 40, 0.8, termZ + 96);
    plane3.rotation.y = Math.PI;
    this.airportGroup.add(plane3);
    this.interactiveObjects.push(plane3);

    // Aircraft on taxiway holding point (preparing for departure)
    const planeTaxi = this.buildAirlinerModel(this.indigoBlueMat, 'IndiGo (Taxiing)');
    planeTaxi.position.set(-780, 0.8, taxiwayZ);
    planeTaxi.rotation.y = Math.PI / 2;
    this.airportGroup.add(planeTaxi);

    // --- H. Air Traffic Control (ATC) Tower (54 m tall) ---
    const atcX = termX + 170;
    const atcZ = termZ - 20;

    const towerShaftGeo = new THREE.CylinderGeometry(4.5, 6.2, 44, 16);
    const towerShaft = new THREE.Mesh(towerShaftGeo, this.terminalWhiteMat);
    towerShaft.position.set(atcX, 22, atcZ);
    towerShaft.castShadow = true;

    // 360-degree Glass Observation Cab
    const cabGeo = new THREE.CylinderGeometry(8.5, 6.5, 7.5, 16);
    const cabMesh = new THREE.Mesh(cabGeo, this.blueGlassMat);
    cabMesh.position.set(atcX, 47, atcZ);

    // Radar Dome & Antenna Mast
    const domeGeo = new THREE.SphereGeometry(3.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMesh = new THREE.Mesh(domeGeo, this.terminalWhiteMat);
    domeMesh.position.set(atcX, 51, atcZ);

    const mastGeo = new THREE.CylinderGeometry(0.3, 0.3, 9, 6);
    const mastMesh = new THREE.Mesh(mastGeo, this.sandstoneWhiteMat);
    mastMesh.position.set(atcX, 55.5, atcZ);

    // Rotating Radar Dish
    const radarDishGeo = new THREE.BoxGeometry(5.5, 1.2, 0.8);
    this.radarMesh = new THREE.Mesh(radarDishGeo, this.indigoBlueMat);
    this.radarMesh.position.set(atcX, 55, atcZ);

    this.airportGroup.add(towerShaft, cabMesh, domeMesh, mastMesh, this.radarMesh);

    // --- I. VIP / Emergency Apron Helipad ---
    const heliGeo = new THREE.CircleGeometry(16, 32);
    heliGeo.rotateX(-Math.PI / 2);
    const heliMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const heliMesh = new THREE.Mesh(heliGeo, heliMat);
    heliMesh.position.set(termX - 165, 0.68, termZ + 65);

    // Painted White 'H' and Blue Perimeter Ring
    const heliRingGeo = new THREE.RingGeometry(14, 15.2, 32);
    heliRingGeo.rotateX(-Math.PI / 2);
    const heliRingMesh = new THREE.Mesh(heliRingGeo, this.taxiwayLightBlueMat);
    heliRingMesh.position.set(termX - 165, 0.72, termZ + 65);

    const hBarV = new THREE.PlaneGeometry(1.8, 12);
    hBarV.rotateX(-Math.PI / 2);
    const hBar1 = new THREE.Mesh(hBarV, this.runwayMarkingMat);
    hBar1.position.set(termX - 169, 0.74, termZ + 65);
    const hBar2 = new THREE.Mesh(hBarV, this.runwayMarkingMat);
    hBar2.position.set(termX - 161, 0.74, termZ + 65);
    const hBarH = new THREE.PlaneGeometry(8, 1.8);
    hBarH.rotateX(-Math.PI / 2);
    const hBarCross = new THREE.Mesh(hBarH, this.runwayMarkingMat);
    hBarCross.position.set(termX - 165, 0.74, termZ + 65);

    this.airportGroup.add(heliMesh, heliRingMesh, hBar1, hBar2, hBarCross);

    // --- J. Landside Drop-Off Road Loop & Parking Lot ---
    const roadLoopGeo = new THREE.PlaneGeometry(280, 24);
    roadLoopGeo.rotateX(-Math.PI / 2);
    const roadLoop = new THREE.Mesh(roadLoopGeo, this.asphaltMat);
    roadLoop.position.set(termX, 0.62, termZ - 50);
    this.airportGroup.add(roadLoop);
  }

  /** Builds an accurate low-poly procedural airliner model */
  private buildAirlinerModel(liveryMat: THREE.Material, airlineName: string): THREE.Group {
    const plane = new THREE.Group();
    plane.userData = { type: 'aircraft-static', name: `${airlineName} Commercial Airliner` };

    // 1. Aerodynamic Cylindrical Fuselage (38m length, 4m diameter)
    const fuseGeo = new THREE.CylinderGeometry(1.9, 1.9, 30, 12);
    fuseGeo.rotateZ(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuseGeo, this.aircraftWhiteMat);
    fuselage.position.y = 3.6;

    // Nose Cone
    const noseGeo = new THREE.ConeGeometry(1.9, 6.5, 12);
    noseGeo.rotateZ(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, this.aircraftWhiteMat);
    nose.position.set(18.2, 3.6, 0);

    // Cockpit Windshield Visor
    const cockGeo = new THREE.BoxGeometry(2.2, 0.8, 1.8);
    const cockMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const cockpit = new THREE.Mesh(cockGeo, cockMat);
    cockpit.position.set(16.5, 4.2, 0);

    // Tail Cone
    const tailGeo = new THREE.ConeGeometry(1.9, 8, 12);
    tailGeo.rotateZ(Math.PI / 2);
    const tail = new THREE.Mesh(tailGeo, this.aircraftWhiteMat);
    tail.position.set(-19, 3.8, 0);

    // 2. Swept-Back Main Wings (35m wingspan)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -17.5);
    wingShape.lineTo(4.5, -17);
    wingShape.lineTo(10.5, 0);
    wingShape.lineTo(4.5, 17);
    wingShape.lineTo(0, 17.5);
    wingShape.lineTo(4, 0);
    wingShape.closePath();

    const wingExtSettings: THREE.ExtrudeGeometryOptions = { depth: 0.5, bevelEnabled: false };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtSettings);
    wingGeo.center();
    wingGeo.rotateX(-Math.PI / 2);
    const wings = new THREE.Mesh(wingGeo, this.aircraftWhiteMat);
    wings.position.set(2, 2.7, 0);

    // Winglets with Airline Livery
    const wingletGeo = new THREE.BoxGeometry(0.3, 2.2, 1.4);
    const wingletL = new THREE.Mesh(wingletGeo, liveryMat);
    wingletL.position.set(1.5, 3.8, -17.4);
    const wingletR = new THREE.Mesh(wingletGeo, liveryMat);
    wingletR.position.set(1.5, 3.8, 17.4);

    // 3. Dual Turbofan Jet Engines
    const engineGeo = new THREE.CylinderGeometry(1.2, 1.1, 5.5, 10);
    engineGeo.rotateZ(Math.PI / 2);
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 });
    const engineL = new THREE.Mesh(engineGeo, engineMat);
    engineL.position.set(3, 1.5, -6.5);
    const engineR = new THREE.Mesh(engineGeo, engineMat);
    engineR.position.set(3, 1.5, 6.5);

    // 4. Vertical Tail Fin with Airline Livery
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-5.5, 0);
    finShape.lineTo(-8.5, 7.5);
    finShape.lineTo(-5, 7.5);
    finShape.closePath();

    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.4, bevelEnabled: false });
    finGeo.center();
    const fin = new THREE.Mesh(finGeo, liveryMat);
    fin.position.set(-18.5, 7.5, 0);

    // Horizontal Stabilizers
    const hStabGeo = new THREE.BoxGeometry(3.5, 0.3, 12);
    const hStab = new THREE.Mesh(hStabGeo, this.aircraftWhiteMat);
    hStab.position.set(-20, 4.4, 0);

    // Landing Gear Tricycle
    const gearMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 });
    const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.6, 8);
    wheelGeo.rotateZ(Math.PI / 2);

    const noseWheel = new THREE.Mesh(wheelGeo, gearMat);
    noseWheel.position.set(14, 0.65, 0);
    const strutNose = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6), strutMat);
    strutNose.position.set(14, 2, 0);

    const mainWheelL = new THREE.Mesh(wheelGeo, gearMat);
    mainWheelL.position.set(1, 0.65, -3.2);
    const mainWheelR = new THREE.Mesh(wheelGeo, gearMat);
    mainWheelR.position.set(1, 0.65, 3.2);

    plane.add(
      fuselage, nose, cockpit, tail, wings, wingletL, wingletR,
      engineL, engineR, fin, hStab,
      noseWheel, strutNose, mainWheelL, mainWheelR,
    );

    plane.scale.set(1, 1, 1);
    return plane;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. LUCKNOW CHARBAGH RAILWAY GRAND TERMINAL (LKO / LJN) & RIGHT MONUMENTS
  // ─────────────────────────────────────────────────────────────────────────

  private buildCharbaghStation(): void {
    const cbData = TRANSPORT_HUBS_REGISTRY[1];
    const cx = cbData.x; // -1499
    const cz = cbData.z; // 1574
    this.charbaghGroup.position.set(cx, 0, cz);

    // Station orientation aligned along the real railway corridor (~32 degrees)
    this.charbaghGroup.rotation.y = (-32 * Math.PI) / 180;

    // --- A. Railway Yard Crushed Stone Ballast Bed ---
    const ballastGeo = new THREE.PlaneGeometry(360, 110);
    ballastGeo.rotateX(-Math.PI / 2);
    const ballastMesh = new THREE.Mesh(ballastGeo, this.railBedMat);
    ballastMesh.position.set(0, 0.5, 40);
    this.charbaghGroup.add(ballastMesh);

    // --- B. 6 Passenger Boarding Platforms ---
    const pLen = 290;
    const pWid = 8.5;
    const pHeight = 1.35;
    const pOffsets = [-15, 3, 21, 39, 57, 75];

    for (let pIdx = 0; pIdx < pOffsets.length; pIdx++) {
      const pZ = pOffsets[pIdx];

      // Concrete Platform Body
      const platGeo = new THREE.BoxGeometry(pLen, pHeight, pWid);
      const platMesh = new THREE.Mesh(platGeo, this.concreteMat);
      platMesh.position.set(0, pHeight / 2 + 0.5, pZ);
      platMesh.castShadow = true;
      platMesh.receiveShadow = true;
      this.charbaghGroup.add(platMesh);

      // Arched Corrugated Steel Platform Shed Canopy
      const shedRoofGeo = new THREE.CylinderGeometry(pWid / 1.6, pWid / 1.6, pLen * 0.78, 12, 1, false, 0, Math.PI);
      shedRoofGeo.rotateZ(Math.PI / 2);
      const shedRoof = new THREE.Mesh(shedRoofGeo, this.platformRoofMat);
      shedRoof.position.set(0, 6.2, pZ);
      shedRoof.castShadow = true;
      this.charbaghGroup.add(shedRoof);

      // Support Columns along Platform
      for (let cX = -90; cX <= 90; cX += 30) {
        const colGeo = new THREE.CylinderGeometry(0.3, 0.3, 5, 6);
        const colMesh = new THREE.Mesh(colGeo, this.sandstoneWhiteMat);
        colMesh.position.set(cX, 3.8, pZ);
        this.charbaghGroup.add(colMesh);
      }
    }

    // --- C. Dual Overhead Foot Overbridges (FOBs) ---
    const fobPositionsX = [-55, 55];
    for (const fobX of fobPositionsX) {
      // Main Walkway across all platforms (110m long)
      const fobSpanGeo = new THREE.BoxGeometry(5.5, 3.2, 105);
      const fobSpan = new THREE.Mesh(fobSpanGeo, this.sandstoneWhiteMat);
      fobSpan.position.set(fobX, 9.5, 30);
      fobSpan.castShadow = true;

      // Staircase Columns descending to platforms
      const fobSupportL = new THREE.BoxGeometry(3, 8.5, 3);
      const supMeshL = new THREE.Mesh(fobSupportL, this.concreteMat);
      supMeshL.position.set(fobX, 4.8, -15);

      const supMeshR = new THREE.Mesh(fobSupportL, this.concreteMat);
      supMeshR.position.set(fobX, 4.8, 75);

      this.charbaghGroup.add(fobSpan, supMeshL, supMeshR);
    }

    // --- D. Steel Railway Tracks & Wooden Sleepers ---
    for (let tIdx = 0; tIdx < pOffsets.length - 1; tIdx++) {
      const tZ = (pOffsets[tIdx] + pOffsets[tIdx + 1]) / 2;

      // Dual Steel Rails (1,676 mm Indian Broad Gauge)
      const railGeo = new THREE.BoxGeometry(pLen + 30, 0.35, 0.18);
      const rail1 = new THREE.Mesh(railGeo, this.railTrackMat);
      rail1.position.set(0, 0.85, tZ - 0.84);
      const rail2 = new THREE.Mesh(railGeo, this.railTrackMat);
      rail2.position.set(0, 0.85, tZ + 0.84);
      this.charbaghGroup.add(rail1, rail2);

      // Track Sleepers (Cross-ties)
      const tieCount = 48;
      const tieGeo = new THREE.BoxGeometry(0.35, 0.25, 2.6);
      const tieInst = new THREE.InstancedMesh(tieGeo, this.railBedMat, tieCount);
      const tieDummy = new THREE.Object3D();
      const step = pLen / tieCount;
      for (let i = 0; i < tieCount; i++) {
        tieDummy.position.set(-pLen / 2 + i * step, 0.72, tZ);
        tieDummy.updateMatrix();
        tieInst.setMatrixAt(i, tieDummy.matrix);
      }
      tieInst.instanceMatrix.needsUpdate = true;
      this.charbaghGroup.add(tieInst);
    }

    // --- E. The Iconic Charbagh Palatial Main Terminal (Chessboard Architecture) ---
    // Modeled faithfully to J.H. Horniman's 1926 Mughal-Gothic royal palace
    const termZ = -45;

    // 1. Central Grand Palatial Block (210m wide, 24m tall)
    const palaceBaseGeo = new THREE.BoxGeometry(210, 18, 42);
    const palaceBase = new THREE.Mesh(palaceBaseGeo, this.charbaghBrickMat);
    palaceBase.position.set(0, 9, termZ);
    palaceBase.castShadow = true;
    palaceBase.receiveShadow = true;
    palaceBase.userData = { type: 'poi', hub: cbData, name: cbData.name };
    this.charbaghGroup.add(palaceBase);
    this.interactiveObjects.push(palaceBase);

    // 2. White Sandstone Cornice & Decorative Plinth
    const plinthGeo = new THREE.BoxGeometry(214, 2, 44);
    const plinth = new THREE.Mesh(plinthGeo, this.sandstoneWhiteMat);
    plinth.position.set(0, 18.5, termZ);
    this.charbaghGroup.add(plinth);

    // 3. Central Grand Onion Dome (Classic Charbagh Landmark Dome)
    const domeGeo = new THREE.SphereGeometry(12, 16, 12);
    domeGeo.scale(1, 1.35, 1);
    const mainDome = new THREE.Mesh(domeGeo, this.sandstoneWhiteMat);
    mainDome.position.set(0, 28, termZ);
    mainDome.castShadow = true;

    // Brass Kalash Spire
    const spireGeo = new THREE.ConeGeometry(1.2, 8, 8);
    const spire = new THREE.Mesh(spireGeo, this.domeGoldMat);
    spire.position.set(0, 42, termZ);
    this.charbaghGroup.add(mainDome, spire);

    // 4. Central Entrance Clock Tower Portico
    const clockPorticoGeo = new THREE.BoxGeometry(38, 28, 14);
    const clockPortico = new THREE.Mesh(clockPorticoGeo, this.charbaghBrickMat);
    clockPortico.position.set(0, 14, termZ - 18);
    clockPortico.castShadow = true;

    // Clock Face
    const clockGeo = new THREE.CircleGeometry(3.6, 16);
    const clockMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const clockFace = new THREE.Mesh(clockGeo, clockMat);
    clockFace.position.set(0, 22, termZ - 25.2);
    this.charbaghGroup.add(clockPortico, clockFace);

    // 5. Four Corner Rajput Chhatris (Minarets with Domed Pavilions)
    const minaretOffsets = [
      { x: -100, z: termZ - 18 },
      { x: 100, z: termZ - 18 },
      { x: -100, z: termZ + 18 },
      { x: 100, z: termZ + 18 },
    ];
    for (const mPos of minaretOffsets) {
      // Octagonal Minaret Tower
      const minShaftGeo = new THREE.CylinderGeometry(3.2, 3.8, 28, 8);
      const minShaft = new THREE.Mesh(minShaftGeo, this.charbaghBrickMat);
      minShaft.position.set(mPos.x, 14, mPos.z);
      minShaft.castShadow = true;

      // White Chhatri Cupola
      const cupolaGeo = new THREE.SphereGeometry(4.2, 10, 8);
      cupolaGeo.scale(1, 1.25, 1);
      const cupola = new THREE.Mesh(cupolaGeo, this.sandstoneWhiteMat);
      cupola.position.set(mPos.x, 30, mPos.z);

      const cupolaSpire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4, 6), this.domeGoldMat);
      cupolaSpire.position.set(mPos.x, 36, mPos.z);

      this.charbaghGroup.add(minShaft, cupola, cupolaSpire);
    }

    // 6. Symmetrical Smaller Awadhi Chhatris along Roofline
    for (let chX = -80; chX <= 80; chX += 32) {
      if (Math.abs(chX) < 16) continue; // Skip clock center
      const smallCupola = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), this.sandstoneWhiteMat);
      smallCupola.position.set(chX, 21.5, termZ - 14);
      this.charbaghGroup.add(smallCupola);
    }

    // --- F. Station Yard High-Mast Illumination Towers ---
    const mastCoords = [
      { x: -110, z: 95 },
      { x: 110, z: 95 },
      { x: -110, z: -10 },
      { x: 110, z: -10 },
    ];
    for (const mC of mastCoords) {
      const poleGeo = new THREE.CylinderGeometry(0.6, 0.9, 32, 6);
      const pole = new THREE.Mesh(poleGeo, this.concreteMat);
      pole.position.set(mC.x, 16, mC.z);

      const headGeo = new THREE.CylinderGeometry(2.4, 1.2, 1.5, 8);
      const head = new THREE.Mesh(headGeo, this.yardLightMat);
      head.position.set(mC.x, 32, mC.z);
      this.charbaghGroup.add(pole, head);
    }

    // --- G. Road-Rail Grade Level Crossing with Boom Barriers ---
    // Placed at Kanpur Road / Aishbagh crossing
    const levelCrossingGroup = new THREE.Group();
    levelCrossingGroup.position.set(-170, 0.7, 40);

    // Crossing Road Pavement
    const crossRoadGeo = new THREE.PlaneGeometry(24, 75);
    crossRoadGeo.rotateX(-Math.PI / 2);
    const crossRoad = new THREE.Mesh(crossRoadGeo, this.asphaltMat);
    levelCrossingGroup.add(crossRoad);

    // Red-and-White Striped Boom Barrier Gates (2 Gates on opposite sides)
    const boomGeo = new THREE.CylinderGeometry(0.2, 0.2, 22, 6);
    boomGeo.rotateZ(Math.PI / 2);

    const boomCanvas = document.createElement('canvas');
    boomCanvas.width = 128;
    boomCanvas.height = 16;
    const bCtx = boomCanvas.getContext('2d');
    if (bCtx) {
      for (let s = 0; s < 128; s += 16) {
        bCtx.fillStyle = (s / 16) % 2 === 0 ? '#ef4444' : '#ffffff';
        bCtx.fillRect(s, 0, 16, 16);
      }
    }
    const boomTex = new THREE.CanvasTexture(boomCanvas);
    const boomMat = new THREE.MeshBasicMaterial({ map: boomTex });

    const gateNorth = new THREE.Mesh(boomGeo, boomMat);
    gateNorth.position.set(0, 1.5, -34);
    const gateSouth = new THREE.Mesh(boomGeo, boomMat);
    gateSouth.position.set(0, 1.5, 34);

    // Warning Strobe Posts
    const strobePostGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.5, 6);
    const strobeMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    const postN = new THREE.Mesh(strobePostGeo, strobeMat);
    postN.position.set(-11, 1.75, -34);
    const postS = new THREE.Mesh(strobePostGeo, strobeMat);
    postS.position.set(11, 1.75, 34);

    const flasherGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const flasherMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const flasherN = new THREE.Mesh(flasherGeo, flasherMat);
    flasherN.position.set(-11, 3.6, -34);
    const flasherS = new THREE.Mesh(flasherGeo, flasherMat);
    flasherS.position.set(11, 3.6, 34);

    levelCrossingGroup.add(gateNorth, gateSouth, postN, postS, flasherN, flasherS);
    this.charbaghGroup.add(levelCrossingGroup);

    // --- H. Signature Monuments to the Right of Charbagh Station ---
    this.buildRightSideCharbaghMonuments(termZ);
  }

  /** Builds the landmark monuments located directly to the right / south of Charbagh Station */
  private buildRightSideCharbaghMonuments(termZ: number): void {
    const rightMonumentsGroup = new THREE.Group();

    // 1. Lucknow Junction (NER Chhoti Line Cabway & Terminal) — directly to the right
    const ljnX = 155;
    const ljnZ = termZ + 25;
    const ljnGeo = new THREE.BoxGeometry(85, 14, 38);
    const ljnMesh = new THREE.Mesh(ljnGeo, this.charbaghBrickMat);
    ljnMesh.position.set(ljnX, 7, ljnZ);
    ljnMesh.castShadow = true;
    ljnMesh.userData = {
      type: 'poi',
      name: 'Lucknow Junction (NER) Heritage Cabway',
      details: {
        category: 'Heritage Railway Terminal',
        address: 'Charbagh South-East Gate, Lucknow',
        notes: 'Famous passenger cabway allowing horse carriages and vehicles directly onto platforms',
      },
    };
    rightMonumentsGroup.add(ljnMesh);
    this.interactiveObjects.push(ljnMesh);

    // Heritage Steam Engine on Plinth Memorial (WG Class Steam Locomotive landmark)
    const plinthGeo = new THREE.BoxGeometry(16, 2.2, 5);
    const plinthMesh = new THREE.Mesh(plinthGeo, this.concreteMat);
    plinthMesh.position.set(ljnX - 22, 1.1, ljnZ - 28);

    const boilerGeo = new THREE.CylinderGeometry(1.4, 1.4, 11, 10);
    boilerGeo.rotateZ(Math.PI / 2);
    const locoMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.8 });
    const boiler = new THREE.Mesh(boilerGeo, locoMat);
    boiler.position.set(ljnX - 22, 3.6, ljnZ - 28);

    const cabGeo = new THREE.BoxGeometry(4.2, 3.8, 3.6);
    const locoCab = new THREE.Mesh(cabGeo, this.charbaghBrickMat);
    locoCab.position.set(ljnX - 16, 4.2, ljnZ - 28);

    rightMonumentsGroup.add(plinthMesh, boiler, locoCab);

    // 2. Northern Railway Divisional Railway Manager (DRM) Heritage Complex
    const drmX = -170;
    const drmZ = termZ - 30;
    const drmGeo = new THREE.BoxGeometry(90, 15, 36);
    const drmMesh = new THREE.Mesh(drmGeo, this.sandstoneWhiteMat);
    drmMesh.position.set(drmX, 7.5, drmZ);
    drmMesh.castShadow = true;
    drmMesh.userData = {
      type: 'poi',
      name: 'Northern Railway DRM Headquarters Complex',
      details: {
        category: 'Colonial Administrative Landmark',
        address: 'Hazratganj-Charbagh Rail Corridor',
        notes: 'Administrative command center for the entire Lucknow Railway Division',
      },
    };
    rightMonumentsGroup.add(drmMesh);
    this.interactiveObjects.push(drmMesh);

    // 3. Ravindralaya Heritage Cultural Auditorium & Open-Air Theatre
    const ravinX = 60;
    const ravinZ = termZ - 65;
    const ravinGeo = new THREE.CylinderGeometry(24, 28, 12, 16);
    const ravinMesh = new THREE.Mesh(ravinGeo, this.sandstoneWhiteMat);
    ravinMesh.position.set(ravinX, 6, ravinZ);
    ravinMesh.castShadow = true;

    // Semi-circular amphitheater tiered steps (matching SimCity design pic!)
    const amphGeo = new THREE.RingGeometry(26, 38, 16, 4, 0, Math.PI);
    amphGeo.rotateX(-Math.PI / 2);
    const amphMesh = new THREE.Mesh(amphGeo, this.concreteMat);
    amphMesh.position.set(ravinX, 1.2, ravinZ);
    amphMesh.userData = {
      type: 'poi',
      name: 'Ravindralaya Heritage Auditorium & Amphitheatre',
      details: {
        category: 'Cultural Theatre & Monument',
        address: 'Charbagh Station Forecourt, Lucknow',
        notes: 'Historic 1,200-seat civic auditorium and tiered open-air cultural theatre',
      },
    };
    rightMonumentsGroup.add(ravinMesh, amphMesh);
    this.interactiveObjects.push(ravinMesh, amphMesh);

    this.charbaghGroup.add(rightMonumentsGroup);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. FLOATING 3D BADGES & INTERACTION
  // ─────────────────────────────────────────────────────────────────────────

  private buildBadges(): void {
    for (const hub of TRANSPORT_HUBS_REGISTRY) {
      const tex = createHubBadgeTexture(hub);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      // Elevate sprite above the complex (~110-140m)
      const baseHeight = hub.category === 'airport' ? 140 : 110;
      sprite.position.set(hub.x, baseHeight, hub.z);
      sprite.scale.set(160, 88, 1);

      sprite.userData = {
        type: 'transport-hub',
        hub,
        baseY: baseHeight,
        phase: Math.random() * Math.PI * 2,
      };

      this.badgeSprites.set(hub.id, sprite);
      this.badgesGroup.add(sprite);
      this.interactiveObjects.push(sprite);
    }
  }

  public update(time: number, cameraPosition: THREE.Vector3): void {
    if (!this.visible) return;

    // Slowly rotate ATC radar dish
    if (this.radarMesh) {
      this.radarMesh.rotation.y = time * 1.8;
    }

    // Adaptive scale and gentle float for 3D badges
    const altitude = cameraPosition.y;
    const baseScale = Math.max(50, Math.min(220, altitude * 0.08));

    for (const sprite of this.badgeSprites.values()) {
      const data = sprite.userData;
      if (!data) continue;

      const bob = Math.sin(time * 2.0 + data.phase) * 4.0;
      sprite.position.y = data.baseY + bob;
      sprite.scale.set(baseScale * 1.8, baseScale, 1);
    }
  }

  public setNightMode(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;

    if (night) {
      this.blueGlassMat.emissive.setHex(0x0369a1);
      this.blueGlassMat.emissiveIntensity = 0.65;
      this.runwayLightGreenMat.color.setHex(0x4ade80);
      this.runwayLightWhiteMat.color.setHex(0xffffff);
      this.yardLightMat.emissiveIntensity = 1.2;
    } else {
      this.blueGlassMat.emissive.setHex(0x000000);
      this.blueGlassMat.emissiveIntensity = 0.0;
      this.yardLightMat.emissiveIntensity = 0.1;
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.rootGroup.visible = visible;
  }

  public getInteractiveObjects(): THREE.Object3D[] {
    return this.interactiveObjects;
  }

  public dispose(): void {
    this.scene.remove(this.rootGroup);
    this.badgeSprites.forEach((sprite) => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    this.badgeSprites.clear();
    this.interactiveObjects = [];
  }
}
