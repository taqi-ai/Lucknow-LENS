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
  private trainBodyMat!: THREE.MeshStandardMaterial;
  private trainWindowMat!: THREE.MeshStandardMaterial;
  private trainYellowMat!: THREE.MeshStandardMaterial;
  private stationSignMat!: THREE.MeshStandardMaterial;
  private stationWarmWindowMat!: THREE.MeshStandardMaterial;
  private waterMat!: THREE.MeshStandardMaterial;
  private plinthGraniteMat!: THREE.MeshStandardMaterial;

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
    this.trainBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.25,
    });
    this.trainWindowMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.trainYellowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.stationSignMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.stationWarmWindowMat = new THREE.MeshStandardMaterial({
      color: 0x241d13,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.8,
      roughness: 0.5,
    });
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
    });
    this.plinthGraniteMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.3,
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

    // --- B. 6 Passenger Boarding Platforms with Defined Gabled Roof Canopies ---
    // (Replaced generic half-cylinder AI slopes with sharp pitched double-slope canopies)
    const pLen = 290;
    const pWid = 8.5;
    const pHeight = 1.35;
    const pOffsets = [-15, 3, 21, 39, 57, 75];
    const roofLen = pLen * 0.82; // 238m
    const pitch = (15 * Math.PI) / 180; // 15-degree crisp pitch
    const halfSlopeW = (pWid * 0.6) / Math.cos(pitch); // ~5.3m

    for (let pIdx = 0; pIdx < pOffsets.length; pIdx++) {
      const pZ = pOffsets[pIdx];

      // 1. Concrete Platform Body
      const platGeo = new THREE.BoxGeometry(pLen, pHeight, pWid);
      const platMesh = new THREE.Mesh(platGeo, this.concreteMat);
      platMesh.position.set(0, pHeight / 2 + 0.5, pZ);
      platMesh.castShadow = true;
      platMesh.receiveShadow = true;
      this.charbaghGroup.add(platMesh);

      // 2. Yellow Tactile Platform Edge Safety Lines (both sides)
      const edgeY = pHeight + 0.51;
      const stripeGeo = new THREE.PlaneGeometry(pLen, 0.38);
      stripeGeo.rotateX(-Math.PI / 2);
      const stripeNorth = new THREE.Mesh(stripeGeo, this.trainYellowMat);
      stripeNorth.position.set(0, edgeY, pZ - pWid * 0.5 + 0.3);
      const stripeSouth = new THREE.Mesh(stripeGeo, this.trainYellowMat);
      stripeSouth.position.set(0, edgeY, pZ + pWid * 0.5 - 0.3);
      this.charbaghGroup.add(stripeNorth, stripeSouth);

      // 3. Crisp Gabled / Pitched Double-Slope Canopy Roof (/\)
      const slopeGeo = new THREE.BoxGeometry(roofLen, 0.16, halfSlopeW);

      // North Roof Slope
      const slopeN = new THREE.Mesh(slopeGeo, this.platformRoofMat);
      slopeN.position.set(0, 6.15, pZ - halfSlopeW * Math.cos(pitch) * 0.5);
      slopeN.rotation.x = pitch;
      slopeN.castShadow = true;

      // South Roof Slope
      const slopeS = new THREE.Mesh(slopeGeo, this.platformRoofMat);
      slopeS.position.set(0, 6.15, pZ + halfSlopeW * Math.cos(pitch) * 0.5);
      slopeS.rotation.x = -pitch;
      slopeS.castShadow = true;

      // White Ridge Cap along Apex
      const ridgeGeo = new THREE.BoxGeometry(roofLen + 0.6, 0.22, 0.45);
      const ridgeCap = new THREE.Mesh(ridgeGeo, this.sandstoneWhiteMat);
      ridgeCap.position.set(0, 6.84, pZ);

      // White Fascia Trim Boards along both eaves
      const fasciaGeo = new THREE.BoxGeometry(roofLen + 0.6, 0.42, 0.14);
      const fasciaN = new THREE.Mesh(fasciaGeo, this.sandstoneWhiteMat);
      fasciaN.position.set(0, 5.46, pZ - pWid * 0.58);
      const fasciaS = new THREE.Mesh(fasciaGeo, this.sandstoneWhiteMat);
      fasciaS.position.set(0, 5.46, pZ + pWid * 0.58);

      this.charbaghGroup.add(slopeN, slopeS, ridgeCap, fasciaN, fasciaS);

      // 4. Triangular Gable End Walls
      for (const endX of [-roofLen / 2, roofLen / 2]) {
        const gableShape = new THREE.Shape();
        gableShape.moveTo(-pWid * 0.58, 5.46);
        gableShape.lineTo(0, 6.84);
        gableShape.lineTo(pWid * 0.58, 5.46);
        gableShape.closePath();
        const gableGeo = new THREE.ShapeGeometry(gableShape);
        gableGeo.rotateY(Math.PI / 2);
        const gableMesh = new THREE.Mesh(gableGeo, this.sandstoneWhiteMat);
        gableMesh.position.set(endX, 0, pZ);
        this.charbaghGroup.add(gableMesh);
      }

      // 5. Cast-Iron Lattice Bracket Columns along Platform
      for (let cX = -90; cX <= 90; cX += 30) {
        // Vertical Mast
        const colGeo = new THREE.CylinderGeometry(0.22, 0.24, 4.4, 6);
        const colMesh = new THREE.Mesh(colGeo, this.sandstoneWhiteMat);
        colMesh.position.set(cX, 3.2, pZ);

        // Angled Bracket Struts (\ /) supporting rafters
        const strutGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
        const strutL = new THREE.Mesh(strutGeo, this.platformRoofMat);
        strutL.position.set(cX, 4.9, pZ - 1.1);
        strutL.rotation.x = Math.PI / 4;

        const strutR = new THREE.Mesh(strutGeo, this.platformRoofMat);
        strutR.position.set(cX, 4.9, pZ + 1.1);
        strutR.rotation.x = -Math.PI / 4;

        // Cross-tie header beam
        const tieBeamGeo = new THREE.BoxGeometry(0.18, 0.18, 3.2);
        const tieBeam = new THREE.Mesh(tieBeamGeo, this.sandstoneWhiteMat);
        tieBeam.position.set(cX, 5.3, pZ);

        this.charbaghGroup.add(colMesh, strutL, strutR, tieBeam);
      }

      // 6. Suspended Station Signs ("LUCKNOW CHARBAGH / चारबाग")
      for (const sX of [-45, 45]) {
        const signGeo = new THREE.BoxGeometry(5.6, 0.9, 0.12);
        const signMesh = new THREE.Mesh(signGeo, this.stationSignMat);
        signMesh.position.set(sX, 4.75, pZ);
        this.charbaghGroup.add(signMesh);
      }
    }

    // --- C. Docked Indian Railways Passenger Train (Vande Bharat / Express Rake) on Platform 1 ---
    const trainGroup = new THREE.Group();
    const trainTrackZ = -6; // Rail track between Platform 1 (-15) and Platform 2 (3)

    // 1. Aerodynamic Electric Locomotive (WAP-7 / Vande Bharat Pilot)
    const locoGroup = new THREE.Group();
    locoGroup.position.set(85, 0, trainTrackZ);

    const locoBodyGeo = new THREE.BoxGeometry(22, 3.8, 3.1);
    const locoBody = new THREE.Mesh(locoBodyGeo, this.trainBodyMat);
    locoBody.position.set(0, 2.7, 0);

    // Aerodynamic Streamlined Nose Wedge
    const noseShape = new THREE.Shape();
    noseShape.moveTo(0, 0);
    noseShape.lineTo(4.5, 0.6);
    noseShape.lineTo(4.5, 2.8);
    noseShape.lineTo(1.8, 3.8);
    noseShape.lineTo(0, 3.8);
    noseShape.closePath();
    const noseExt = new THREE.ExtrudeGeometry(noseShape, { depth: 3.08, bevelEnabled: false });
    noseExt.center();
    const locoNose = new THREE.Mesh(noseExt, this.trainBodyMat);
    locoNose.position.set(12.5, 2.7, 0);

    // Cockpit Panoramic Windshield
    const windGeo = new THREE.BoxGeometry(2.4, 1.1, 2.6);
    const windshield = new THREE.Mesh(windGeo, this.trainWindowMat);
    windshield.position.set(13.2, 3.5, 0);

    // Dual High-Intensity LED Headlights
    const hlGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const hlLeft = new THREE.Mesh(hlGeo, hlMat);
    hlLeft.position.set(14.8, 1.8, -0.9);
    const hlRight = new THREE.Mesh(hlGeo, hlMat);
    hlRight.position.set(14.8, 1.8, 0.9);

    // Yellow High-Speed Hazard Stripe along Locomotive
    const locoStripeGeo = new THREE.BoxGeometry(22.2, 0.35, 3.14);
    const locoStripe = new THREE.Mesh(locoStripeGeo, this.trainYellowMat);
    locoStripe.position.set(0, 2.4, 0);

    // Rooftop Pantograph Assembly (Overhead Catenary Current Collector)
    const pantoBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 2.2), this.railTrackMat);
    pantoBase.position.set(-4, 4.75, 0);
    const pantoArmGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 4);
    const pantoArm1 = new THREE.Mesh(pantoArmGeo, this.railTrackMat);
    pantoArm1.position.set(-5, 5.8, 0);
    pantoArm1.rotation.z = Math.PI / 4;
    const pantoArm2 = new THREE.Mesh(pantoArmGeo, this.railTrackMat);
    pantoArm2.position.set(-3, 5.8, 0);
    pantoArm2.rotation.z = -Math.PI / 4;
    const pantoHead = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 2.6), this.railTrackMat);
    pantoHead.position.set(-4, 6.6, 0);

    locoGroup.add(
      locoBody, locoNose, windshield, hlLeft, hlRight,
      locoStripe, pantoBase, pantoArm1, pantoArm2, pantoHead,
    );
    trainGroup.add(locoGroup);

    // 2. Four Passenger Coaches (Rake Composition)
    const coachOffsetsX = [60, 32, 4, -24];
    for (const cX of coachOffsetsX) {
      const coach = new THREE.Group();
      coach.position.set(cX, 0, trainTrackZ);

      // Main Coach Body (25m long)
      const cBodyGeo = new THREE.BoxGeometry(25.5, 3.6, 3.1);
      const cBody = new THREE.Mesh(cBodyGeo, this.trainBodyMat);
      cBody.position.set(0, 2.65, 0);

      // Continuous Panoramic Window Band
      const winGeo = new THREE.BoxGeometry(23.5, 0.95, 3.14);
      const winMesh = new THREE.Mesh(winGeo, this.trainWindowMat);
      winMesh.position.set(0, 3.15, 0);

      // White Aerodynamic Roof Cap
      const cRoofGeo = new THREE.BoxGeometry(25.6, 0.35, 2.9);
      const cRoof = new THREE.Mesh(cRoofGeo, this.sandstoneWhiteMat);
      cRoof.position.set(0, 4.6, 0);

      // Yellow Emergency Exit Door Badges
      const doorGeo = new THREE.BoxGeometry(0.85, 2.1, 3.16);
      const doorL = new THREE.Mesh(doorGeo, this.trainYellowMat);
      doorL.position.set(-11.2, 2.3, 0);
      const doorR = new THREE.Mesh(doorGeo, this.trainYellowMat);
      doorR.position.set(11.2, 2.3, 0);

      // Articulated Gangway Bellows between Coaches
      const bellowGeo = new THREE.BoxGeometry(1.4, 3.1, 2.4);
      const bellowMesh = new THREE.Mesh(bellowGeo, this.plinthGraniteMat);
      bellowMesh.position.set(13.4, 2.4, 0);

      // Dual 2-Axle Undercarriage Bogies with Wheelsets
      const bogieMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      for (const bX of [-8.5, 8.5]) {
        const bogieFrame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 2.6), bogieMat);
        bogieFrame.position.set(bX, 1.05, 0);
        coach.add(bogieFrame);
      }

      coach.add(cBody, winMesh, cRoof, doorL, doorR, bellowMesh);
      trainGroup.add(coach);
    }

    trainGroup.userData = {
      type: 'poi',
      name: 'Vande Bharat Express (Train No. 22435 / 22436)',
      details: {
        category: 'Semi-High Speed Passenger Train',
        route: 'Lucknow Charbagh ⇄ New Delhi',
        speed: '160 km/h Service Speed',
        composition: '16 AC Chair Car Coaches + Aerodynamic Driver Trailers',
      },
    };
    this.charbaghGroup.add(trainGroup);
    this.interactiveObjects.push(trainGroup);

    // --- D. Dual Overhead Foot Overbridges (FOBs) with Glass Enclosure ---
    const fobPositionsX = [-55, 38];
    for (const fobX of fobPositionsX) {
      // Main Enclosed Walkway across all 6 platforms (110m long)
      const fobSpanGeo = new THREE.BoxGeometry(6.2, 3.4, 105);
      const fobSpan = new THREE.Mesh(fobSpanGeo, this.sandstoneWhiteMat);
      fobSpan.position.set(fobX, 9.8, 30);
      fobSpan.castShadow = true;

      // Blue Tinted Glass Window Strips on both sides of FOB
      const glassGeo = new THREE.BoxGeometry(6.24, 1.4, 103);
      const fobGlass = new THREE.Mesh(glassGeo, this.blueGlassMat);
      fobGlass.position.set(fobX, 10.1, 30);

      // Staircase Columns descending to platforms
      const fobSupportL = new THREE.BoxGeometry(3.2, 8.8, 3.2);
      const supMeshL = new THREE.Mesh(fobSupportL, this.concreteMat);
      supMeshL.position.set(fobX, 4.9, -15);

      const supMeshR = new THREE.BoxGeometry(3.2, 8.8, 3.2);
      const supMeshRMesh = new THREE.Mesh(supMeshR, this.concreteMat);
      supMeshRMesh.position.set(fobX, 4.9, 75);

      this.charbaghGroup.add(fobSpan, fobGlass, supMeshL, supMeshRMesh);
    }

    // --- E. Steel Railway Tracks & Wooden Sleepers ---
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

    // --- F. The Iconic Charbagh Palatial Main Terminal (Chessboard Architecture) ---
    // Modeled faithfully to J.H. Horniman's 1926 Mughal-Gothic royal palace
    // (As inspired by "Lucknow Charbagh Railway Station Digital Twin.png")
    const termZ = -45;

    // 1. Central Grand Entrance Portico Pavilion (3-Storey Terracotta Massing)
    const centralPorticoGeo = new THREE.BoxGeometry(42, 24, 22);
    const centralPortico = new THREE.Mesh(centralPorticoGeo, this.charbaghBrickMat);
    centralPortico.position.set(0, 12, termZ - 16);
    centralPortico.castShadow = true;
    centralPortico.receiveShadow = true;
    centralPortico.userData = { type: 'poi', hub: cbData, name: cbData.name };
    this.charbaghGroup.add(centralPortico);
    this.interactiveObjects.push(centralPortico);

    // Decorative Sandstone Plinth & Cornice
    const cPlinthGeo = new THREE.BoxGeometry(44, 1.4, 23);
    const cPlinth = new THREE.Mesh(cPlinthGeo, this.sandstoneWhiteMat);
    cPlinth.position.set(0, 24.2, termZ - 16);
    this.charbaghGroup.add(cPlinth);

    // Triple Scalloped Mughal Grand Archways on Central Facade
    for (const aX of [-12, 0, 12]) {
      // White sandstone arch portal frame
      const archFrameGeo = new THREE.BoxGeometry(6.4, 10.5, 1.2);
      const archFrame = new THREE.Mesh(archFrameGeo, this.sandstoneWhiteMat);
      archFrame.position.set(aX, 5.25, termZ - 27.2);

      // Recessed arched entrance opening with warm interior illumination
      const recessGeo = new THREE.BoxGeometry(5.2, 9.2, 0.6);
      const recessMesh = new THREE.Mesh(recessGeo, this.stationWarmWindowMat);
      recessMesh.position.set(aX, 4.6, termZ - 27.4);

      this.charbaghGroup.add(archFrame, recessMesh);
    }

    // Authentic Indian Railways Station Signboard ("लखनऊ चारबाग रेलवे स्टेशन / LUCKNOW CHARBAGH")
    const signBoardGeo = new THREE.BoxGeometry(28, 3.4, 0.35);
    const signBoard = new THREE.Mesh(signBoardGeo, this.stationSignMat);
    signBoard.position.set(0, 15.6, termZ - 27.2);

    const signGoldBorderGeo = new THREE.BoxGeometry(28.6, 3.8, 0.25);
    const signGoldBorder = new THREE.Mesh(signGoldBorderGeo, this.domeGoldMat);
    signGoldBorder.position.set(0, 15.6, termZ - 27.15);

    // Procedural High-Res Bilingual Station Inscription
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 96;
    const sCtx = signCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#1e3a8a';
      sCtx.fillRect(0, 0, 512, 96);
      sCtx.strokeStyle = '#d97706';
      sCtx.lineWidth = 4;
      sCtx.strokeRect(4, 4, 504, 88);
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 30px "Arial", sans-serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillText('लखनऊ चारबाग रेलवे स्टेशन', 256, 32);
      sCtx.font = 'bold 24px "Arial Black", sans-serif';
      sCtx.fillText('LUCKNOW CHARBAGH', 256, 68);
    }
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signFaceMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(27.8, 3.2),
      new THREE.MeshBasicMaterial({ map: signTex }),
    );
    signFaceMesh.position.set(0, 15.6, termZ - 27.42);
    signFaceMesh.rotation.y = Math.PI;
    this.charbaghGroup.add(signBoard, signGoldBorder, signFaceMesh);

    // Central Square Clock Tower Chamber
    const clockChamberGeo = new THREE.BoxGeometry(18, 9, 18);
    const clockChamber = new THREE.Mesh(clockChamberGeo, this.charbaghBrickMat);
    clockChamber.position.set(0, 29, termZ - 16);

    // Circular Illuminated Clock Face (Facing Forecourt)
    const clockGeo = new THREE.CircleGeometry(3.6, 24);
    const clockFace = new THREE.Mesh(clockGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    clockFace.position.set(0, 29, termZ - 25.1);
    this.charbaghGroup.add(clockChamber, clockFace);

    // Grand Ribbed Central Mughal Onion Dome
    const drumGeo = new THREE.CylinderGeometry(7.2, 7.6, 3.5, 8);
    const drum = new THREE.Mesh(drumGeo, this.sandstoneWhiteMat);
    drum.position.set(0, 35, termZ - 16);

    const domeGeo = new THREE.SphereGeometry(7.4, 16, 12);
    domeGeo.scale(1, 1.36, 1);
    const mainDome = new THREE.Mesh(domeGeo, this.sandstoneWhiteMat);
    mainDome.position.set(0, 40, termZ - 16);
    mainDome.castShadow = true;

    // Brass Kalash Spire on Grand Dome
    const spireGeo = new THREE.ConeGeometry(0.9, 7.5, 8);
    const spire = new THREE.Mesh(spireGeo, this.domeGoldMat);
    spire.position.set(0, 52, termZ - 16);
    this.charbaghGroup.add(drum, mainDome, spire);

    // 2. Symmetrical 2-Storey Wings (East & West Wings with Colonnaded Arcades)
    const wingLength = 76;
    const wingWidth = 34;
    const wingHeight = 16;
    const wingOffsetsX = [-59, 59];

    for (const wX of wingOffsetsX) {
      // Main Brick Wing Massing
      const wingGeo = new THREE.BoxGeometry(wingLength, wingHeight, wingWidth);
      const wingMesh = new THREE.Mesh(wingGeo, this.charbaghBrickMat);
      wingMesh.position.set(wX, wingHeight / 2, termZ - 10);
      wingMesh.castShadow = true;
      wingMesh.receiveShadow = true;
      this.charbaghGroup.add(wingMesh);

      // White Sandstone Cornice along Wing Roofline
      const wCorniceGeo = new THREE.BoxGeometry(wingLength + 2, 1.2, wingWidth + 2);
      const wCornice = new THREE.Mesh(wCorniceGeo, this.sandstoneWhiteMat);
      wCornice.position.set(wX, wingHeight + 0.6, termZ - 10);
      this.charbaghGroup.add(wCornice);

      // Stepped Chessboard Battlements / Crenellations along Wing Roof
      const merlonStep = 6;
      const merlonCount = Math.floor(wingLength / merlonStep);
      const merlonGeo = new THREE.BoxGeometry(2.4, 1.4, 1.2);
      for (let m = 0; m < merlonCount; m++) {
        const mX = wX - wingLength / 2 + m * merlonStep + 3;
        const merlon = new THREE.Mesh(merlonGeo, this.sandstoneWhiteMat);
        merlon.position.set(mX, wingHeight + 1.8, termZ - 10 - wingWidth / 2);
        this.charbaghGroup.add(merlon);
      }

      // Ground Floor Scalloped Arched Colonnade Loggia
      const archStep = 11;
      const archCount = Math.floor(wingLength / archStep);
      for (let a = 0; a < archCount; a++) {
        const archX = wX - wingLength / 2 + a * archStep + 5.5;
        // White arch frame
        const afMesh = new THREE.Mesh(new THREE.BoxGeometry(4.8, 7.5, 0.8), this.sandstoneWhiteMat);
        afMesh.position.set(archX, 3.8, termZ - 10 - wingWidth / 2 - 0.4);

        // Warm window opening
        const awMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 6.2, 0.4), this.stationWarmWindowMat);
        awMesh.position.set(archX, 3.4, termZ - 10 - wingWidth / 2 - 0.6);

        this.charbaghGroup.add(afMesh, awMesh);
      }

      // Miniature Awadhi Chhatris along Wing Roof
      for (let ch = 0; ch < 3; ch++) {
        const chX = wX - wingLength / 3 + ch * (wingLength / 3);
        const chCupola = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 6), this.sandstoneWhiteMat);
        chCupola.position.set(chX, wingHeight + 2.8, termZ - 10 - wingWidth / 2 + 3);
        const chSpire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 6), this.domeGoldMat);
        chSpire.position.set(chX, wingHeight + 5.2, termZ - 10 - wingWidth / 2 + 3);
        this.charbaghGroup.add(chCupola, chSpire);
      }
    }

    // 3. Intermediate 3-Storey Pavilion Towers (East & West Turrets)
    for (const tX of [-50, 50]) {
      const turretGeo = new THREE.BoxGeometry(16, 21, 20);
      const turretMesh = new THREE.Mesh(turretGeo, this.charbaghBrickMat);
      turretMesh.position.set(tX, 10.5, termZ - 16);
      turretMesh.castShadow = true;

      const tDome = new THREE.Mesh(new THREE.SphereGeometry(4.4, 10, 8), this.sandstoneWhiteMat);
      tDome.scale.set(1, 1.25, 1);
      tDome.position.set(tX, 23.5, termZ - 16);

      const tSpire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4.2, 6), this.domeGoldMat);
      tSpire.position.set(tX, 29.5, termZ - 16);
      this.charbaghGroup.add(turretMesh, tDome, tSpire);
    }

    // 4. End Corner Terminal Bastions with Open-Air Rajput Chhatris
    const bastionOffsets = [
      { x: -108, z: termZ - 10 },
      { x: 108, z: termZ - 10 },
    ];
    for (const bPos of bastionOffsets) {
      // 2-Storey End Bastion
      const bGeo = new THREE.BoxGeometry(26, 17, 32);
      const bMesh = new THREE.Mesh(bGeo, this.charbaghBrickMat);
      bMesh.position.set(bPos.x, 8.5, bPos.z);
      bMesh.castShadow = true;

      // Sandstone Parapet
      const bPlinth = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 34), this.sandstoneWhiteMat);
      bPlinth.position.set(bPos.x, 17.6, bPos.z);

      // Open Rajput Chhatri (4 Slender Pillars with Open Air Under Domed Cupola)
      const chhatriBase = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 8), this.sandstoneWhiteMat);
      chhatriBase.position.set(bPos.x, 18.6, bPos.z);

      const pilOffsets = [-2.8, 2.8];
      for (const px of pilOffsets) {
        for (const pz of pilOffsets) {
          const pilGeo = new THREE.CylinderGeometry(0.24, 0.24, 5.2, 6);
          const pillar = new THREE.Mesh(pilGeo, this.sandstoneWhiteMat);
          pillar.position.set(bPos.x + px, 21.6, bPos.z + pz);
          this.charbaghGroup.add(pillar);
        }
      }

      // White Chhatri Cupola on Pillars
      const cupolaGeo = new THREE.SphereGeometry(4.2, 12, 8);
      cupolaGeo.scale(1, 1.22, 1);
      const cupola = new THREE.Mesh(cupolaGeo, this.sandstoneWhiteMat);
      cupola.position.set(bPos.x, 25.8, bPos.z);

      const cupolaSpire = new THREE.Mesh(new THREE.ConeGeometry(0.65, 4.5, 6), this.domeGoldMat);
      cupolaSpire.position.set(bPos.x, 31.5, bPos.z);

      this.charbaghGroup.add(bMesh, bPlinth, chhatriBase, cupola, cupolaSpire);
    }

    // --- G. Station Yard High-Mast Illumination Towers ---
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

    // --- H. Road-Rail Grade Level Crossing with Boom Barriers ---
    const levelCrossingGroup = new THREE.Group();
    levelCrossingGroup.position.set(-170, 0.7, 40);

    const crossRoadGeo = new THREE.PlaneGeometry(24, 75);
    crossRoadGeo.rotateX(-Math.PI / 2);
    const crossRoad = new THREE.Mesh(crossRoadGeo, this.asphaltMat);
    levelCrossingGroup.add(crossRoad);

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

    // --- I. Signature Monuments Shifted Towards Station Forecourt ---
    this.buildRightSideCharbaghMonuments(termZ);
  }

  /**
   * Builds the signature landmark monuments directly integrated with Charbagh Station:
   * 1. Ravindralaya Heritage Cultural Auditorium & Stepped Amphitheatre (Shifted right to the east plaza)
   * 2. Grand Station Forecourt Garden Roundabout with Central Victory Obelisk
   * 3. Historic "Black Beauty" WG Class Steam Engine on Plinth Memorial
   * 4. Northern Railway DRM Headquarters Heritage Complex
   * 5. Lucknow Junction (NER) Cabway Terminal
   */
  private buildRightSideCharbaghMonuments(termZ: number): void {
    const rightMonumentsGroup = new THREE.Group();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. FORECOURT ROUNDABOUT & "BLACK BEAUTY" STEAM LOCOMOTIVE ON PLINTH
    // ─────────────────────────────────────────────────────────────────────────
    // Positioned in the grand forecourt garden island facing Charbagh main portico
    const forecourtZ = termZ - 48;

    // A. Grand Circular Traffic Roundabout & Landscaped Garden Island
    const islandRadius = 26;
    const islandGroup = new THREE.Group();
    islandGroup.position.set(0, 0.55, forecourtZ);

    // Concrete outer curb
    const curbGeo = new THREE.RingGeometry(islandRadius - 1.2, islandRadius, 32);
    curbGeo.rotateX(-Math.PI / 2);
    const curbMesh = new THREE.Mesh(curbGeo, this.concreteMat);

    // Lush green lawn bedding
    const lawnGeo = new THREE.CircleGeometry(islandRadius - 1.2, 32);
    lawnGeo.rotateX(-Math.PI / 2);
    const lawnMesh = new THREE.Mesh(lawnGeo, this.grassMat);

    // Concentric floral terracotta ring
    const flowerRingGeo = new THREE.RingGeometry(14, 18, 24);
    flowerRingGeo.rotateX(-Math.PI / 2);
    const flowerRing = new THREE.Mesh(flowerRingGeo, this.charbaghBrickMat);
    flowerRing.position.y = 0.05;

    // Central Sandstone Victory Obelisk / Column
    const obeliskGeo = new THREE.CylinderGeometry(0.8, 1.4, 22, 8);
    const obelisk = new THREE.Mesh(obeliskGeo, this.sandstoneWhiteMat);
    obelisk.position.set(0, 11, 0);

    const obeliskCap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.5, 8), this.domeGoldMat);
    obeliskCap.position.set(0, 23.5, 0);

    islandGroup.add(curbMesh, lawnMesh, flowerRing, obelisk, obeliskCap);
    rightMonumentsGroup.add(islandGroup);

    // B. Historic "Black Beauty" WG Class Steam Locomotive on Granite Plinth
    // (A signature real-world landmark stationed in the Charbagh entrance garden)
    const locoPlinthX = 24;
    const locoPlinthZ = forecourtZ + 4;
    const plinthGeo = new THREE.BoxGeometry(16, 2.2, 4.8);
    const plinthMesh = new THREE.Mesh(plinthGeo, this.plinthGraniteMat);
    plinthMesh.position.set(locoPlinthX, 1.1, locoPlinthZ);

    // Brass Dedication Plaque on Plinth
    const plaqueGeo = new THREE.PlaneGeometry(2.4, 1.0);
    const plaque = new THREE.Mesh(plaqueGeo, this.domeGoldMat);
    plaque.position.set(locoPlinthX, 1.2, locoPlinthZ - 2.45);
    plaque.rotation.y = Math.PI;

    // Steam Locomotive Body (Black boiler, cab, stack, dome)
    const steamGroup = new THREE.Group();
    steamGroup.position.set(locoPlinthX, 2.2, locoPlinthZ);

    // Main Cylindrical Boiler
    const boilerGeo = new THREE.CylinderGeometry(1.35, 1.35, 10.5, 12);
    boilerGeo.rotateZ(Math.PI / 2);
    const locoSteelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.85 });
    const boiler = new THREE.Mesh(boilerGeo, locoSteelMat);
    boiler.position.set(-1.5, 1.8, 0);

    // Smoke Chimney Stack
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.6, 8), locoSteelMat);
    chimney.position.set(2.8, 3.6, 0);

    // Steam Dome
    const sDome = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6), this.domeGoldMat);
    sDome.position.set(0.5, 3.5, 0);

    // Driver Cab (Cabin)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.4, 3.4), locoSteelMat);
    cabin.position.set(-6.5, 2.4, 0);

    // Coal Tender Car
    const tender = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.6, 3.2), locoSteelMat);
    tender.position.set(-11, 2.0, 0);

    // Driving Wheels (3 Large pairs)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.6 });
    for (const wX of [-3.5, -1.5, 0.5]) {
      const wL = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 10), wheelMat);
      wL.rotateX(Math.PI / 2);
      wL.position.set(wX, 0.9, -1.5);
      const wR = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 10), wheelMat);
      wR.rotateX(Math.PI / 2);
      wR.position.set(wX, 0.9, 1.5);
      steamGroup.add(wL, wR);
    }

    steamGroup.add(boiler, chimney, sDome, cabin, tender);

    plinthMesh.userData = {
      type: 'poi',
      name: 'WG Class "Black Beauty" Steam Engine Memorial',
      details: {
        category: 'Heritage Railway Monument on Plinth',
        location: 'Charbagh Station Forecourt Gardens',
        built: 'Broad Gauge 2-8-2 WG Class Heavy Freight Engine',
        significance: 'Preserved tribute to the golden age of Indian steam railways',
      },
    };
    rightMonumentsGroup.add(plinthMesh, plaque, steamGroup);
    this.interactiveObjects.push(plinthMesh);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RAVINDRALAYA HERITAGE CAMPUS & TIERED AMPHITHEATRE (SHIFTED TOWARDS STATION)
    // ─────────────────────────────────────────────────────────────────────────
    // Shifted directly adjacent to Charbagh's east bastion to form a stylish civic campus
    // (Matching "WhatsApp Image 2026-11-06 at 16.28.48 (1).jpeg")
    const campusX = 138;
    const campusZ = termZ - 10;

    // A. Sandstone Pedestrian Promenade connecting Station East Wing to Ravindralaya
    const promGeo = new THREE.PlaneGeometry(38, 46);
    promGeo.rotateX(-Math.PI / 2);
    const promenade = new THREE.Mesh(promGeo, this.sandstoneWhiteMat);
    promenade.position.set(campusX - 16, 0.52, campusZ);
    rightMonumentsGroup.add(promenade);

    // Tiered Circular Water Fountain Basin in Promenade
    const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.8, 16), this.concreteMat);
    fountainBase.position.set(campusX - 16, 0.9, campusZ);

    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(5.0, 16), this.waterMat);
    waterDisc.rotateX(-Math.PI / 2);
    waterDisc.position.set(campusX - 16, 1.32, campusZ);

    const fountainTier = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.2, 1.8, 12), this.sandstoneWhiteMat);
    fountainTier.position.set(campusX - 16, 1.8, campusZ);
    rightMonumentsGroup.add(fountainBase, waterDisc, fountainTier);

    // B. Ravindralaya Heritage Cultural Civic Auditorium Building
    const audiX = campusX + 26;
    const audiZ = campusZ - 10;
    const audiGeo = new THREE.BoxGeometry(36, 15, 34);
    const audiMesh = new THREE.Mesh(audiGeo, this.charbaghBrickMat);
    audiMesh.position.set(audiX, 7.5, audiZ);
    audiMesh.castShadow = true;

    // Classical Arched Glass Portico Entrance
    const porticoGeo = new THREE.BoxGeometry(16, 11, 4);
    const porticoMesh = new THREE.Mesh(porticoGeo, this.sandstoneWhiteMat);
    porticoMesh.position.set(audiX - 18, 5.5, audiZ);

    const porticoGlass = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 0.6), this.blueGlassMat);
    porticoGlass.position.set(audiX - 19.8, 5.5, audiZ);

    // Civic Auditorium Sandstone Dome
    const audiDome = new THREE.Mesh(new THREE.SphereGeometry(7.2, 12, 8), this.sandstoneWhiteMat);
    audiDome.scale.set(1, 1.15, 1);
    audiDome.position.set(audiX, 17, audiZ);

    const audiSpire = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.5, 6), this.domeGoldMat);
    audiSpire.position.set(audiX, 23.5, audiZ);

    audiMesh.userData = {
      type: 'poi',
      name: 'Ravindralaya Heritage Cultural Auditorium & Theater',
      details: {
        category: 'Civic Cultural Landmark & Auditorium',
        address: 'Charbagh Station Civic Campus, Lucknow',
        capacity: '1,200 Seats Civic Auditorium • Historic Convention Hall',
        heritage: 'Constructed in 1961 in honour of Rabindranath Tagore centenary',
      },
    };
    rightMonumentsGroup.add(audiMesh, porticoMesh, porticoGlass, audiDome, audiSpire);
    this.interactiveObjects.push(audiMesh);

    // C. Semi-Circular Tiered Open-Air Amphitheatre (Stylish Stepped Seated Bowl)
    // Modeled faithfully to the SimCity design reference pic
    const amphX = campusX + 18;
    const amphZ = campusZ + 24;

    // Circular Performance Stage / Dais
    const stageGeo = new THREE.CylinderGeometry(8.2, 8.2, 0.6, 24);
    const stageMesh = new THREE.Mesh(stageGeo, this.sandstoneWhiteMat);
    stageMesh.position.set(amphX, 0.6, amphZ);
    rightMonumentsGroup.add(stageMesh);

    // 5 Concentric Stepped Seating Terraces
    const tierRadii = [11, 14.5, 18, 21.5, 25];
    for (let t = 0; t < tierRadii.length; t++) {
      const rInner = tierRadii[t];
      const rOuter = rInner + 2.8;
      const tHeight = 0.8 + t * 0.55;

      // Sandstone seating tread ring
      const treadGeo = new THREE.RingGeometry(rInner, rOuter, 24, 1, -Math.PI * 0.15, Math.PI * 1.3);
      treadGeo.rotateX(-Math.PI / 2);
      const treadMesh = new THREE.Mesh(treadGeo, this.sandstoneWhiteMat);
      treadMesh.position.set(amphX, tHeight, amphZ);

      // Grass turf riser
      const riserGeo = new THREE.RingGeometry(rInner - 0.4, rInner, 24, 1, -Math.PI * 0.15, Math.PI * 1.3);
      riserGeo.rotateX(-Math.PI / 2);
      const riserMesh = new THREE.Mesh(riserGeo, this.grassMat);
      riserMesh.position.set(amphX, tHeight - 0.25, amphZ);

      rightMonumentsGroup.add(treadMesh, riserMesh);
    }

    // Outer Perimeter Sandstone Balustrade Wall
    const balGeo = new THREE.RingGeometry(28, 29.2, 24, 1, -Math.PI * 0.15, Math.PI * 1.3);
    balGeo.rotateX(-Math.PI / 2);
    const balMesh = new THREE.Mesh(balGeo, this.concreteMat);
    balMesh.position.set(amphX, 3.8, amphZ);
    balMesh.userData = {
      type: 'poi',
      name: 'Ravindralaya Open-Air Tiered Amphitheatre',
      details: {
        category: 'Open-Air Cultural Amphitheatre',
        design: 'Tiered semi-circular sandstone terraces with landscaped turf risers',
        capacity: '800 Spectators for classical drama, musical baithaks & mushairas',
      },
    };
    rightMonumentsGroup.add(balMesh);
    this.interactiveObjects.push(balMesh);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. NORTHERN RAILWAY DIVISIONAL RAILWAY MANAGER (DRM) HEADQUARTERS
    // ─────────────────────────────────────────────────────────────────────────
    const drmX = -170;
    const drmZ = termZ - 30;
    const drmGeo = new THREE.BoxGeometry(90, 15, 36);
    const drmMesh = new THREE.Mesh(drmGeo, this.sandstoneWhiteMat);
    drmMesh.position.set(drmX, 7.5, drmZ);
    drmMesh.castShadow = true;

    // Colonial Colonnaded Portico with Clock Pediment
    const drmPediment = new THREE.Mesh(new THREE.BoxGeometry(28, 6, 8), this.charbaghBrickMat);
    drmPediment.position.set(drmX, 17, drmZ - 14);

    const drmClock = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    drmClock.position.set(drmX, 17, drmZ - 18.1);

    drmMesh.userData = {
      type: 'poi',
      name: 'Northern Railway DRM Headquarters Complex',
      details: {
        category: 'Colonial Administrative Landmark',
        address: 'Hazratganj-Charbagh Rail Corridor',
        notes: 'Administrative command center for the entire Lucknow Railway Division',
      },
    };
    rightMonumentsGroup.add(drmMesh, drmPediment, drmClock);
    this.interactiveObjects.push(drmMesh);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. LUCKNOW JUNCTION (NER) CABWAY & PASSENGER TERMINAL
    // ─────────────────────────────────────────────────────────────────────────
    const ljnX = 165;
    const ljnZ = termZ + 45;
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
      this.stationWarmWindowMat.emissiveIntensity = 0.85;
    } else {
      this.blueGlassMat.emissive.setHex(0x000000);
      this.blueGlassMat.emissiveIntensity = 0.0;
      this.yardLightMat.emissiveIntensity = 0.1;
      this.stationWarmWindowMat.emissiveIntensity = 0.08;
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
