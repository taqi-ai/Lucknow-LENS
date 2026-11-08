import { project } from '../geo/projection';
import { CityPulseItem } from './types';

function createPulseItem(
  raw: Omit<CityPulseItem, 'x' | 'z'>
): CityPulseItem {
  const { x, z } = project(raw.latitude, raw.longitude);
  return { ...raw, x, z };
}

export const LUCKNOW_CITY_PULSE: CityPulseItem[] = [
  createPulseItem({
    id: 'pulse-charbagh-vande-bharat',
    headline: 'Charbagh Railway Terminal Prepares for Second High-Speed Vande Bharat Service',
    summary: 'Northern Railway Lucknow Division has initiated platform electrification and track gauge stabilization at Charbagh Platform 1 to support high-speed daily round trips between Lucknow and New Delhi, reducing transit times to under 6 hours.',
    category: 'transport',
    latitude: 26.8322,
    longitude: 80.9221,
    affectedArea: 'Charbagh Railway Grand Terminal',
    source: 'Northern Railway Public Information Bureau (Lucknow)',
    publishedAt: '25 mins ago',
    verificationStatus: 'simulated',
    isSimulated: true,
    relatedEntityId: 'hub-charbagh-railway',
  }),
  createPulseItem({
    id: 'pulse-airport-t3-operations',
    headline: 'Chaudhary Charan Singh Airport Terminal 3 Crosses 35,000 Daily Passenger Milestone',
    summary: 'The new integrated Terminal 3 at Amausi has reported seamless flight movements across domestic and Gulf corridors. Enhanced DigiYatra biometric boarding gates and upgraded baggage handling systems have reduced average check-in queuing times by 40 percent.',
    category: 'transport',
    latitude: 26.7606,
    longitude: 80.8893,
    affectedArea: 'Chaudhary Charan Singh Int\'l Airport (T3)',
    source: 'Airport Authority of India & Adani Airports Media Desk',
    publishedAt: '1 hr ago',
    verificationStatus: 'simulated',
    isSimulated: true,
    relatedEntityId: 'hub-ccs-airport',
  }),
  createPulseItem({
    id: 'pulse-hazratganj-smart-signals',
    headline: 'Adaptive AI Traffic Signal Phasing Commissioned along Mahatma Gandhi Marg',
    summary: 'Lucknow Smart City Command Centre has fully activated real-time queue length sensors across Hazratganj, Janpath, and Ashok Marg intersections. Automated green wave coordination is projected to reduce peak-hour congestion delays by 22 percent.',
    category: 'traffic',
    latitude: 26.8488,
    longitude: 80.9442,
    affectedArea: 'Hazratganj Central Commercial District',
    source: 'Lucknow Smart City Project Management Unit',
    publishedAt: '2 hrs ago',
    verificationStatus: 'simulated',
    isSimulated: true,
  }),
  createPulseItem({
    id: 'pulse-gomti-riverfront-water',
    headline: 'UP Irrigation Department Reports Stable Water Flow at Gomti Barrage',
    summary: 'Continuous acoustic sensor telemetry confirms Gomti River level currently stands at 108.4 meters above sea level, comfortably beneath the seasonal warning mark. Local ecological teams completed aquatic weed clearance along the 12-kilometer riverfront promenade.',
    category: 'weather',
    latitude: 26.8525,
    longitude: 80.9545,
    affectedArea: 'Gomti Riverfront & Barrage Basin',
    source: 'UP State Irrigation & Water Resources Directorate',
    publishedAt: '3 hrs ago',
    verificationStatus: 'simulated',
    isSimulated: true,
  }),
  createPulseItem({
    id: 'pulse-chowk-rumi-darwaza',
    headline: 'Archaeological Survey Completes Architectural Laser Restoration at Rumi Darwaza',
    summary: 'The 60-foot iconic Awadhi gateway in Old Lucknow has undergone comprehensive lime plaster preservation and stone stabilization. Illuminated night facade LED lighting now highlights the intricate Mughal-Gothic archway silhouettes without emitting damaging ultraviolet wavelengths.',
    category: 'infrastructure',
    latitude: 26.8698,
    longitude: 80.9135,
    affectedArea: 'Hussainabad & Chowk Heritage District',
    source: 'Archaeological Survey of India (Lucknow Circle)',
    publishedAt: '4 hrs ago',
    verificationStatus: 'simulated',
    isSimulated: true,
  }),
  createPulseItem({
    id: 'pulse-alambagh-electric-buses',
    headline: '40 New Zero-Emission Electric City Buses Rolled Out from Alambagh Transit Depot',
    summary: 'Lucknow City Transport Services has inducted air-conditioned electric buses operating on feeder routes linking Charbagh, Alambagh Metro Interchange, and Amausi Airport. The move is expected to curb localized vehicular carbon emissions significantly.',
    category: 'transport',
    latitude: 26.8150,
    longitude: 80.9100,
    affectedArea: 'Alambagh City Bus Terminal & Depot',
    source: 'UP State Road Transport Corporation (UPSRTC)',
    publishedAt: '5 hrs ago',
    verificationStatus: 'simulated',
    isSimulated: true,
  }),
];
