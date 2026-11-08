import { project } from '../geo/projection';
import { SpatialHazardZone } from './types';

function createZonePolygon(
  coords: Array<[number, number]>
): Array<{ lat: number; lon: number; x: number; z: number }> {
  return coords.map(([lat, lon]) => {
    const { x, z } = project(lat, lon);
    return { lat, lon, x, z };
  });
}

function computeCentroid(points: Array<{ lat: number; lon: number; x: number; z: number }>) {
  let sLat = 0, sLon = 0, sX = 0, sZ = 0;
  for (const p of points) {
    sLat += p.lat;
    sLon += p.lon;
    sX += p.x;
    sZ += p.z;
  }
  const n = points.length || 1;
  return { lat: sLat / n, lon: sLon / n, x: sX / n, z: sZ / n };
}

// ─────────────────────────────────────────────────────────────────────────────
// LUCKNOW DEFENSIVE HAZARD DATASETS
// Based on UP State Disaster Management Authority (UPSDMA) & BIS IS:1893 studies
// ─────────────────────────────────────────────────────────────────────────────

const rawFloodBasin: Array<[number, number]> = [
  [26.8740, 80.9120],
  [26.8710, 80.9250],
  [26.8650, 80.9380],
  [26.8580, 80.9490],
  [26.8520, 80.9620],
  [26.8430, 80.9850],
  [26.8360, 81.0020],
  [26.8400, 81.0050],
  [26.8480, 80.9890],
  [26.8570, 80.9660],
  [26.8630, 80.9520],
  [26.8700, 80.9390],
  [26.8780, 80.9240],
  [26.8790, 80.9130],
];

const rawWaterloggingGomtiNagar: Array<[number, number]> = [
  [26.8530, 80.9820],
  [26.8610, 80.9980],
  [26.8550, 81.0120],
  [26.8450, 81.0050],
  [26.8420, 80.9870],
];

const rawWaterloggingAlambagh: Array<[number, number]> = [
  [26.8180, 80.9020],
  [26.8250, 80.9140],
  [26.8190, 80.9260],
  [26.8100, 80.9200],
  [26.8080, 80.9060],
];

const rawEarthquakeZoneIII: Array<[number, number]> = [
  [26.8900, 80.8900],
  [26.8950, 81.0200],
  [26.7900, 81.0300],
  [26.7850, 80.8900],
];

const rawHeatwaveOldCity: Array<[number, number]> = [
  [26.8720, 80.9050],
  [26.8680, 80.9250],
  [26.8550, 80.9280],
  [26.8480, 80.9150],
  [26.8580, 80.8980],
];

const rawHeavyRainfallBelt: Array<[number, number]> = [
  [26.8850, 80.9600],
  [26.8900, 81.0300],
  [26.8350, 81.0400],
  [26.8300, 80.9700],
];

const geomFlood = createZonePolygon(rawFloodBasin);
const geomWaterlog1 = createZonePolygon(rawWaterloggingGomtiNagar);
const geomWaterlog2 = createZonePolygon(rawWaterloggingAlambagh);
const geomQuake = createZonePolygon(rawEarthquakeZoneIII);
const geomHeat = createZonePolygon(rawHeatwaveOldCity);
const geomRain = createZonePolygon(rawHeavyRainfallBelt);

export const LUCKNOW_HAZARDS: SpatialHazardZone[] = [
  {
    id: 'hazard-flood-gomti-basin',
    hazardType: 'flood',
    name: 'Gomti River 100-Year Inundation Corridor',
    affectedAreaName: 'Gomti River Lowlands & Kudia Ghat - Barrage Floodplain',
    riskLevel: 'very-high',
    geometry: geomFlood,
    centroid: computeCentroid(geomFlood),
    description: 'Riparian floodplain zone directly adjacent to the meandering Gomti river channel. Vulnerable to inundation when discharge upstream exceeds 45,000 cusecs.',
    historicalContext: 'Significant historical floods recorded in 1960 and 2008 when water overtopped embankment levels between Daliganj and Hanuman Setu.',
    defensibleParameters: {
      'Warning Level': '109.5 m above MSL',
      'Danger Level': '111.0 m above MSL',
      'Current Basin Status': 'Normal Flow (108.4 m)',
      'Hydrological Source': 'Central Water Commission (CWC)',
    },
    dataSource: 'Uttar Pradesh State Disaster Management Authority (UPSDMA) Flood Mapping Atlas',
    lastUpdated: 'Monsoon Preparedness Cycle 2025-2026',
    isSimulated: false,
  },
  {
    id: 'hazard-waterlog-polytechnic',
    hazardType: 'waterlogging',
    name: 'Trans-Gomti Depression & Polytechnic Waterlogging Hotspot',
    affectedAreaName: 'Polytechnic Chauraha & Gomti Nagar Phase-1 Low Drainage Basin',
    riskLevel: 'high',
    geometry: geomWaterlog1,
    centroid: computeCentroid(geomWaterlog1),
    description: 'Natural localized topographic depression where storm-water convergence exceeds gravity drainage during rainfall bursts exceeding 40 mm/hr.',
    historicalContext: 'Documented water stagnation up to 0.75m during intense monsoon cloudburst events, impacting movement along Faizabad Road arterial corridor.',
    defensibleParameters: {
      'Drainage Infrastructure': 'Kukrail Nala Outfall Tributary',
      'Pumping Capacity': '4 Heavy-duty Municipal Dewatering Stations',
      'Inundation Threshold': '> 35 mm / 2 hr rainfall',
    },
    dataSource: 'Lucknow Municipal Corporation (LMC) Urban Drainage Review',
    lastUpdated: 'Pre-Monsoon Inspection 2025',
    isSimulated: false,
  },
  {
    id: 'hazard-waterlog-alambagh',
    hazardType: 'waterlogging',
    name: 'Alambagh Railway Colony Low-Lying Silt Basin',
    affectedAreaName: 'Alambagh & Old Kanpur Road Underpass Corridor',
    riskLevel: 'high',
    geometry: geomWaterlog2,
    centroid: computeCentroid(geomWaterlog2),
    description: 'Rail embankment underpass basin susceptible to localized storm runoff pooling when railway storm sluice valves are throttled.',
    historicalContext: 'Frequent commuter diversions recorded during heavy rainfall spells under Alambagh and Mawaiya underpasses.',
    defensibleParameters: {
      'Sump Pumps': '3 Active Municipal Extraction Units',
      'Average Clearance Time': '45 to 90 minutes post-precipitation',
    },
    dataSource: 'Northern Railway Lucknow Division Civic Engineering Cell',
    lastUpdated: 'Seasonal Drainage Report 2025',
    isSimulated: false,
  },
  {
    id: 'hazard-seismic-zone-iii',
    hazardType: 'earthquake',
    name: 'Lucknow Gangetic Alluvial Basin Seismic Zone III',
    affectedAreaName: 'Metropolitan Lucknow Deep Deep-Alluvium Belt',
    riskLevel: 'moderate',
    geometry: geomQuake,
    centroid: computeCentroid(geomQuake),
    description: 'Classified under Seismic Zone III (Moderate Damage Risk, Peak Ground Acceleration Zone Factor Z = 0.16) per Bureau of Indian Standards IS 1893:2016.',
    historicalContext: 'No active surface fault within city boundaries, but deep alluvium soil columns can amplify low-frequency seismic waves originating from the Himalayan Seismic Belt.',
    defensibleParameters: {
      'Seismic Zone Factor (Z)': 0.16,
      'Soil Foundation Class': 'Type III (Soft/Medium Deep Alluvium)',
      'Code Compliance': 'IS 1893 & NBC 2016 Mandated for Multi-storey Buildings',
    },
    dataSource: 'Bureau of Indian Standards (BIS) & Geological Survey of India (GSI)',
    lastUpdated: 'National Building Code Reference 2024',
    isSimulated: false,
  },
  {
    id: 'hazard-heatwave-old-lucknow',
    hazardType: 'heatwave',
    name: 'Old Lucknow High-Density Urban Heat Island (UHI)',
    affectedAreaName: 'Chowk, Aminabad & Naka Hindola Dense Fabric',
    riskLevel: 'high',
    geometry: geomHeat,
    centroid: computeCentroid(geomHeat),
    description: 'High thermal retention zone where impervious brick and concrete massing, narrow street canyons, and low tree canopy cover elevate surface temperatures by 3.5°C to 5.2°C above suburban baselines during summer months (May–June).',
    historicalContext: 'Summer afternoon temperatures consistently reach 44°C to 46.5°C, requiring community cool roofs and misting shelters.',
    defensibleParameters: {
      'Impervious Surface Fraction': '84%',
      'Vegetation Canopy Cover': '< 6%',
      'UHI Temperature Differential': '+4.2°C Baseline Offset',
    },
    dataSource: 'State Climate Change Action Plan (UP-SAPCC) & Remote Sensing Applications Centre (RSAC)',
    lastUpdated: 'Summer Heat Action Plan (HAP) 2025',
    isSimulated: false,
  },
  {
    id: 'hazard-heavy-rainfall-east',
    hazardType: 'rainfall',
    name: 'Eastern Sub-Basin Heavy Rainfall Flash Exposure',
    affectedAreaName: 'Shaheed Path & Sultanpur Road Catchment Area',
    riskLevel: 'moderate',
    geometry: geomRain,
    centroid: computeCentroid(geomRain),
    description: 'Expansive catchment experiencing sudden convective thunderstorm cells driven by easterly monsoon troughs from the Bay of Bengal.',
    historicalContext: 'Monsoon convective squalls occasionally deliver 50–70 mm of precipitation within 90 minutes.',
    defensibleParameters: {
      'Seasonal Normal Rainfall': '896.2 mm',
      'Peak 24-hr Historical Record': '177.0 mm (September 1970)',
      'Real-time Doppler Radar': 'IMD Lucknow Doppler Radar (Amausi)',
    },
    dataSource: 'India Meteorological Department (IMD) Meteorological Centre Lucknow',
    lastUpdated: 'Annual Weather Summary 2025',
    isSimulated: false,
  },
];
