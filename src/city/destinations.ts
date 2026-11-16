/**
 * Destination registry (round 3). One stable record per featured place. Camera
 * targets are derived from the generated landmark sites or from projected
 * coordinates, never typed in by hand, so a refined site moves its framing too.
 *
 * tier A = hero landmark with a dedicated model and verified site.
 * tier B = important destination, procedural model on a verified footprint.
 * tier C = position and footprint only. Tier C is never put in the highlights tour.
 * `status` is a plain statement of what exists, so the UI and report cannot overclaim.
 */
import { LANDMARK_SITES } from './landmarkSites';
import { project } from '../geo/projection';

export type DestCategory = 'heritage' | 'parks' | 'transport' | 'popular';

export interface Destination {
  id: string;
  name: string;
  aliases: string[];
  category: DestCategory;
  note: string;
  x: number; z: number;
  azimuth: number; pitch: number; distance: number;
  tier: 'A' | 'B' | 'C';
  status: string;
  tour: boolean;
  /** Where x/z came from. */
  source: string;
}

type Spec = Omit<Destination, 'x' | 'z' | 'source'> & { key?: string; ll?: [number, number]; dx?: number; dz?: number };

const D = (spec: Spec): Destination => {
  const { key, ll, dx = 0, dz = 0, ...rest } = spec;
  const s = key ? LANDMARK_SITES.find((q) => q.key === key) : undefined;
  if (s) return { ...rest, x: s.c[0] + dx, z: s.c[1] + dz, source: `landmark site ${key} (Overture footprint)` };
  const p = project((ll ?? [26.85, 80.95])[0], (ll ?? [26.85, 80.95])[1]);
  return { ...rest, x: p.x + dx, z: p.z + dz, source: 'projected lat/lon' };
};

export const DESTINATIONS: Destination[] = [
  D({ id: 'husainabad', name: 'Husainabad Heritage District', aliases: ['hussainabad', 'old lucknow', 'bara imambara', 'bada imambara', 'rumi darwaza', 'rumi gate', 'asafi masjid'],
      category: 'heritage', note: 'Bara Imambara, Rumi Darwaza, Clock Tower', key: 'bara_imambara', dz: 150, dx: -200,
      azimuth: 2.4, pitch: 0.42, distance: 1500, tier: 'A', status: 'Bara Imambara, Asafi Masjid, Rumi Darwaza, Chhota Imambara and Clock Tower are procedural models on Overture footprints; layout approximate, plaster colour corrected in round 3.', tour: true }),
  D({ id: 'rumi_darwaza', name: 'Rumi Darwaza', aliases: ['rumi gate', 'turkish gate'], category: 'heritage', note: 'The 1784 gateway',
      key: 'rumi_darwaza', azimuth: 1.27, pitch: 0.25, distance: 320, tier: 'A', status: 'Existing model kept; pale plaster material.', tour: false }),
  D({ id: 'chhota_imambara', name: 'Chhota Imambara', aliases: ['chota imambara', 'imambara husainabad', 'hussainabad imambara'], category: 'heritage', note: 'Husainabad Imambara',
      key: 'chhota_imambara', azimuth: 0.8, pitch: 0.4, distance: 420, tier: 'B', status: 'Procedural complex on its Overture footprint.', tour: false }),
  D({ id: 'clock_tower', name: 'Husainabad Clock Tower', aliases: ['ghantaghar', 'ghanta ghar', 'clock tower'], category: 'heritage', note: 'Hussainabad',
      key: 'clock_tower', azimuth: 0.8, pitch: 0.28, distance: 380, tier: 'A', status: 'Existing model and colour kept.', tour: false }),
  D({ id: 'residency', name: 'The Residency', aliases: ['british residency', 'residency ruins'], category: 'heritage', note: 'Ruins of 1857',
      key: 'residency', azimuth: 0.9, pitch: 0.4, distance: 520, tier: 'B', status: 'Procedural ruin on footprint.', tour: false }),
  D({ id: 'safed_baradari', name: 'Safed Baradari', aliases: ['qaiserbagh', 'kaiserbagh'], category: 'heritage', note: 'Kaiserbagh',
      key: 'safed_baradari', azimuth: 0.7, pitch: 0.4, distance: 520, tier: 'B', status: 'Procedural model on footprint.', tour: false }),
  D({ id: 'jama_masjid', name: 'Jama Masjid', aliases: ['jami masjid'], category: 'heritage', note: 'Husainabad',
      key: 'jama_masjid', azimuth: 0.6, pitch: 0.4, distance: 520, tier: 'B', status: 'Procedural model on footprint.', tour: false }),
  D({ id: 'picture_gallery', name: 'Husainabad Picture Gallery', aliases: ['picture gallery'], category: 'heritage', note: 'Hussainabad',
      key: 'picture_gallery', azimuth: 0.6, pitch: 0.4, distance: 420, tier: 'B', status: 'Procedural model on footprint.', tour: false }),

  D({ id: 'charbagh', name: 'Charbagh Railway Station', aliases: ['charbagh', 'char bagh', 'lucknow charbagh', 'nr station', 'railway station'], category: 'transport',
      note: 'Red-and-white heritage station, rail hub', key: 'charbagh', azimuth: 0.35, pitch: 0.42, distance: 900, tier: 'B',
      status: 'Red-brick body on the Overture footprint with white cornice, arched verandah front and a turret/dome rhythm (stylised, not counted from a plan). Forecourt, platform canopies and a separate Lucknow Junction are NOT built.', tour: true }),
  D({ id: 'ccs_airport', name: 'CCS International Airport', aliases: ['airport', 'amausi', 'lucknow airport', 'ccsia'], category: 'transport', note: 'Amausi',
      ll: [26.7606, 80.8893], azimuth: 2.2, pitch: 0.38, distance: 3200, tier: 'B',
      status: 'Runway, taxiways and apron from Overture; markings and tower added. Terminal is generic.', tour: true }),

  D({ id: 'ambedkar_park', name: 'Dr. B.R. Ambedkar Memorial Park', aliases: ['ambedkar park', 'ambedkar memorial', 'ambedkar udyan', 'memorial park'], category: 'parks', note: 'Gomti Nagar',
      key: 'ambedkar_memorial', azimuth: 1.75, pitch: 0.4, distance: 1250, tier: 'A',
      status: 'Axial layout with stupa, 62 elephants and obelisks; schematic, not a surveyed plan.', tour: true }),
  D({ id: 'janeshwar_park', name: 'Janeshwar Mishra Park', aliases: ['jmp', 'janeshwar mishra', 'janeshwar park', 'janeswar mishra park'], category: 'parks', note: 'Gomti Nagar, 376 acres',
      ll: [26.83631, 80.99035], azimuth: 0.3, pitch: 0.9, distance: 1700, tier: 'B',
      status: 'The two lakes (16.0 and 12.6 acres in Overture, official 14 and 18) are drawn with their mapped shorelines, an island and stone banks. Lawns, tree cover, tracks, fountains and sports zones are generic; the park is still a dense tree carpet, unlike the real open lawns and palms.', tour: true }),


  D({ id: 'hazratganj', name: 'Hazratganj', aliases: ['hazrat ganj', 'ganj'], category: 'popular', note: 'Colonial-era promenade',
      ll: [26.8467, 80.9461], azimuth: 0.6, pitch: 0.3, distance: 900, tier: 'C',
      status: 'Overture footprints with procedural facades. Colonial arcades are NOT implemented. Excluded from the tour.', tour: false }),
  D({ id: 'ekana', name: 'Ekana Cricket Stadium', aliases: ['ekana', 'bharat ratna atal bihari vajpayee ekana', 'cricket stadium'], category: 'popular', note: 'Cricket ground',
      key: 'ekana', azimuth: 1.15, pitch: 0.5, distance: 900, tier: 'B', status: 'Procedural bowl on Overture footprint.', tour: true }),
  D({ id: 'taj_gomti', name: 'Gomti Riverfront and Taj Mahal Lucknow', aliases: ['taj hotel', 'taj mahal lucknow', 'gomti riverfront', 'gomti river', 'riverfront'], category: 'popular',
      note: 'Gomti Nagar riverfront', key: 'taj_hotel', azimuth: 1.9, pitch: 0.28, distance: 1100, tier: 'B',
      status: 'River at measured width with embankment; hotel massing from footprint with assumed height. Ghats and promenades are NOT built.', tour: true }),
  D({ id: 'vidhan_sabha', name: 'Vidhan Sabha Bhawan', aliases: ['vidhan sabha', 'legislative assembly'], category: 'popular', note: 'Legislative Assembly',
      key: 'vidhan_sabha', azimuth: 0.1, pitch: 0.32, distance: 680, tier: 'B', status: 'Procedural model on footprint.', tour: false }),
  D({ id: 'la_martiniere', name: 'La Martiniere College', aliases: ['la martiniere', 'constantia'], category: 'popular', note: 'Constantia',
      key: 'la_martiniere', azimuth: 0.7, pitch: 0.35, distance: 600, tier: 'B', status: 'Procedural model on footprint.', tour: false }),
  D({ id: 'dubagga_tv', name: 'Dubagga TV Tower', aliases: ['tv tower', 'doordarshan tower'], category: 'popular', note: 'Lattice transmission tower',
      key: 'dubagga_tv', azimuth: 0.8, pitch: 0.2, distance: 500, tier: 'B', status: 'Lattice model; height (150 m) is an estimate.', tour: false }),
];

/** Ordered highlights route. Only tier A/B scenes with a real model are eligible. */
export const HIGHLIGHT_TOUR: string[] = DESTINATIONS.filter((d) => d.tour && d.tier !== 'C').map((d) => d.id);

export const destinationById = (id: string): Destination | undefined => DESTINATIONS.find((d) => d.id === id);

/** Case-insensitive partial match over name and aliases, best matches first. */
export function searchDestinations(q: string): Destination[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return DESTINATIONS
    .map((d) => {
      const names = [d.name.toLowerCase(), ...d.aliases];
      const best = names.reduce((m, n) => Math.min(m, n === t ? 0 : n.startsWith(t) ? 1 : n.includes(t) ? 2 : 9), 9);
      return { d, best };
    })
    .filter((r) => r.best < 9)
    .sort((a, b) => a.best - b.best)
    .map((r) => r.d);
}
