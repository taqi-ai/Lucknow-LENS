/**
 * All words on the portfolio live here so they can be reviewed in one place.
 * Rule for this file: a number or a date goes in only if it is widely documented
 * (Wikipedia / ASI / the issuing department). Anything uncertain is phrased as
 * "about" or left out. Helpline numbers carry the department that issues them.
 */
import type { CameraPreset } from '../types';
import credits from './credits.json';

export type Credit = { title: string; author: string; licence: string; page: string };
export const CREDITS = credits as Record<string, Credit>;

/**
 * Illustrations made for this site with Google Flow, each generated from the real
 * photograph of the place as a reference, in one consistent style. Where one
 * exists it replaces the photo; the original photo stays credited on the About page.
 */
export const ART = new Set<string>(['kosala', 'nawabs', 'kakori-train', 'pact', 'kaiserbagh', 'chhatar-manzil', 'dilkusha', 'vidhan-sabha', 'ekana', 'gomti-riverfront', 'hazratganj', 'metro', 'rumi-darwaza', 'bara-imambara', 'chota-imambara', 'clock-tower', 'residency', 'la-martiniere', 'charbagh', 'satkhanda', 'jama-masjid', 'ambedkar-park']);
export const ART_FOOD = new Set<string>(['tunday', 'biryani', 'nihari', 'sheermal', 'makhan-malai', 'chaat', 'kulfi', 'kakori']);

/** Image URLs: a large and a 640px WebP for each slug (illustration if there is one, otherwise the photo). */
export const photo = (slug: string) => (ART.has(slug) || ART_FOOD.has(slug) ? `/lucknow/art/${slug}.webp` : `/lucknow/${slug}.webp`);
export const photoSm = (slug: string) => (ART.has(slug) || ART_FOOD.has(slug) ? `/lucknow/art/${slug}-sm.webp` : `/lucknow/${slug}-sm.webp`);

export interface Tab { id: string; label: string; hi: string; blurb: string }
export const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', hi: 'मुख्य', blurb: 'The city at a glance' },
  { id: 'heritage', label: 'Heritage', hi: 'विरासत', blurb: 'Monuments and architecture' },
  { id: 'history', label: 'History', hi: 'इतिहास', blurb: 'From Kosala to the metro' },
  { id: 'food', label: 'Food', hi: 'ज़ायका', blurb: 'A UNESCO city of gastronomy' },
  { id: 'travel', label: 'Travel', hi: 'सफ़र', blurb: 'Plan a visit' },
  { id: 'geography', label: 'Geography', hi: 'भूगोल', blurb: 'River, plain and relief' },
  { id: 'government', label: 'Government', hi: 'शासन', blurb: 'Services and helplines' },
  { id: 'platform', label: 'Platform', hi: 'मंच', blurb: 'What Terralyt is' },
  { id: 'about', label: 'About', hi: 'हमारे बारे में', blurb: 'Team and credits' },
];

/* ───────────────────────── Heritage ───────────────────────── */
export interface Monument {
  slug: string; en: string; hi: string; ur?: string; year: string; style: string;
  body: string; preset?: CameraPreset; lat?: number; lon?: number;
}
export const MONUMENTS: Monument[] = [
  { slug: 'rumi-darwaza', en: 'Rumi Darwaza', hi: 'रूमी दरवाज़ा', ur: 'رومی دروازہ', year: '1784', style: 'Awadhi gateway',
    body: 'A gateway about sixty feet tall, commissioned by Nawab Asaf-ud-Daula and said to echo the Sublime Porte in Istanbul. It once marked the western entrance to old Lucknow, and it is the arch inside the Terralyt logo.', preset: 'rumi' },
  { slug: 'bara-imambara', en: 'Bara Imambara', hi: 'बड़ा इमामबाड़ा', ur: 'بڑا امام باڑہ', year: '1784', style: 'Awadhi, vaulted',
    body: 'Also called the Asafi Imambara. Built under Asaf-ud-Daula and cared for today by the Archaeological Survey of India. Its great central hall is roofed by vaults, with no iron beams or pillars holding it up.', preset: 'oldlucknow' },
  { slug: 'chota-imambara', en: 'Chota Imambara', hi: 'छोटा इमामबाड़ा', ur: 'چھوٹا امام باڑہ', year: '1838', style: 'Awadhi, gilded dome',
    body: 'Raised by Muhammad Ali Shah, the third Nawab-king of Awadh, and nicknamed the Palace of Lights for its chandeliers and the strings of lamps lit in the month of Muharram.', preset: 'oldlucknow' },
  { slug: 'clock-tower', en: 'Hussainabad Clock Tower', hi: 'घंटाघर', ur: 'گھنٹہ گھر', year: '1881', style: 'Victorian Gothic',
    body: 'A tall brick-red clock tower beside the Hussainabad ponds, usually described as the tallest clock tower in India. It faces the Picture Gallery across the water.', preset: 'clocktower' },
  { slug: 'residency', en: 'The Residency', hi: 'रेज़ीडेंसी', ur: 'ریزیڈنسی', year: '1780s–1850s', style: 'Colonial ruins',
    body: 'The compound of the British Resident at the Awadh court. It was the centre of the 1857 siege, and its shelled walls are preserved as they were left.' },
  { slug: 'la-martiniere', en: 'La Martinière', hi: 'ला मार्टिनियर', year: '1840s', style: 'Indo-European fantasy',
    body: 'A school built from the estate of Major-General Claude Martin, with towers, lions and a mix of Gothic, Mughal and Classical ideas, all in one facade.' },
  { slug: 'charbagh', en: 'Charbagh Station', hi: 'चारबाग़', ur: 'چار باغ', year: '1923', style: 'Awadhi–Rajput revival',
    body: 'A railway station designed like a palace, with domes and chhatris that make it one of the most photographed stations in the country.', preset: 'charbagh' },
  { slug: 'chhatar-manzil', en: 'Chhatar Manzil', hi: 'छतर मंज़िल', ur: 'چھتر منزل', year: '1780s–1810s', style: 'Nawabi palace',
    body: 'The "umbrella palace" on the Gomti, crowned with a gilded umbrella-shaped dome. This 1858 photograph by Felice Beato shows the palace and the royal fish-shaped boat.' },
  { slug: 'kaiserbagh', en: 'Qaiserbagh', hi: 'क़ैसरबाग़', ur: 'قیصر باغ', year: '1850s', style: 'Nawabi palace complex',
    body: 'The last great palace complex of the Nawabs, built for Wajid Ali Shah. Gateways like this one, with mermaid motifs, are what survives of it.' },
  { slug: 'dilkusha', en: 'Dilkusha Kothi', hi: 'दिलकुशा कोठी', year: '1800s', style: 'English Baroque',
    body: 'A hunting lodge modelled on an English country house. Ruined in 1857, it now sits as a quiet roofless shell in a garden by the Gomti.' },
  { slug: 'satkhanda', en: 'Satkhanda', hi: 'सतखंडा', year: '1840s', style: 'Unfinished tower',
    body: 'A watchtower planned with seven storeys by Muhammad Ali Shah and left unfinished at four. Its name means "seven floors".' },
  { slug: 'jama-masjid', en: 'Jama Masjid', hi: 'जामा मस्जिद', ur: 'جامع مسجد', year: '1840s', style: 'Awadhi mosque',
    body: 'Begun by Muhammad Ali Shah and completed after his reign, it is among the largest mosques in the city, with tall minarets and a pale plastered dome.' },
  { slug: 'ambedkar-park', en: 'Ambedkar Memorial Park', hi: 'अम्बेडकर स्मारक', year: '2000s', style: 'Sandstone memorial',
    body: 'A modern memorial and park in sandstone, known for its pavilions and the long rows of elephant sculptures. At night the whole complex is lit.', preset: 'ambedkar' },
  { slug: 'vidhan-sabha', en: 'Vidhan Bhavan', hi: 'विधान भवन', year: '1928', style: 'Colonial-Indo-Saracenic',
    body: 'The home of the Uttar Pradesh Legislative Assembly, a domed building in the heart of the administrative district.', preset: 'vidhansabha' },
  { slug: 'ekana', en: 'Ekana Stadium', hi: 'एकाना स्टेडियम', year: '2017', style: 'Modern sports',
    body: 'An international cricket stadium in Gomti Nagar Extension, opened in 2017.', preset: 'ekana' },
];

export const ARCH_STYLES = [
  { name: 'Awadhi', note: 'Lime-plastered brick and arches, scalloped openings, fish motifs and domes. The signature of the Nawabs, 18th to mid-19th century.' },
  { name: 'Indo-Saracenic', note: 'Colonial architects borrowing arches, chhatris and domes. You see it at the High Court, the railway stations and Vidhan Bhavan.' },
  { name: 'European eclectic', note: 'Gothic towers, Classical porticos and Baroque lodges brought by European adventurers and the Nawabs\' own taste for novelty.' },
  { name: 'Modern memorial', note: 'Large sandstone and marble complexes of the 2000s that reuse older forms at a new scale.' },
];

/* ───────────────────────── History ───────────────────────── */
export interface Era { year: string; title: string; body: string; slug?: string }
export const ERAS: Era[] = [
  { year: '6th c. BCE', title: 'Kosala', body: 'The Lucknow region sits in Kosala, one of the sixteen Mahajanapadas of early India.', slug: 'kosala' },
  { year: '1722', title: 'The Nawabs of Awadh', body: 'Saadat Khan is appointed governor of Awadh. His successors build a court that becomes the centre of North Indian culture.', slug: 'nawabs' },
  { year: '1775', title: 'Lucknow becomes the capital', body: 'Asaf-ud-Daula moves the Awadh court from Faizabad to Lucknow and begins the city of gateways and imambaras.', slug: 'bara-imambara' },
  { year: '1856', title: 'Annexation', body: 'The East India Company annexes Awadh and exiles the last Nawab, Wajid Ali Shah.', slug: 'kaiserbagh' },
  { year: '1857', title: 'The Siege of Lucknow', body: 'The Residency is besieged for months in the Rebellion of 1857. Its ruins are kept as they were left.', slug: 'residency' },
  { year: '1916', title: 'The Lucknow Pact', body: 'The Indian National Congress and the Muslim League meet in Lucknow and agree a joint demand.', slug: 'pact' },
  { year: '1925', title: 'Kakori', body: 'Revolutionaries stop a train near Kakori on the Lucknow route. The event becomes part of the freedom movement.', slug: 'kakori-train' },
  { year: '1920s', title: 'The modern capital', body: 'Lucknow becomes the capital of the United Provinces, now Uttar Pradesh, and gets its great public buildings.', slug: 'vidhan-sabha' },
  { year: '2017', title: 'The Lucknow Metro', body: 'The first stretch of the Red Line opens on 5 September 2017. The airport line follows in 2019.', slug: 'metro' },
];

/* ───────────────────────── Food ───────────────────────── */
export interface Dish { slug: string; name: string; hi: string; kind: string; note: string; where?: string }
export const DISHES: Dish[] = [
  { slug: 'tunday', name: 'Galouti Kebab', hi: 'गलौटी कबाब', kind: 'Kebab', note: 'So soft it barely needs chewing; legend says it was made for a Nawab who had lost his teeth. Tunday Kababi in Aminabad and Chowk is the famous name', where: 'Aminabad, Chowk' },
  { slug: 'biryani', name: 'Awadhi Biryani', hi: 'अवधी बिरयानी', kind: 'Rice', note: 'Cooked dum pukht style, sealed and steamed in its own juices. Lighter and more fragrant than its southern cousins.', where: 'Chowk' },
  { slug: 'nihari', name: 'Nihari Kulcha', hi: 'निहारी कुलचा', kind: 'Breakfast', note: 'Meat stewed overnight and eaten with soft kulcha at dawn.', where: 'Chowk' },
  { slug: 'sheermal', name: 'Sheermal', hi: 'शीरमाल', kind: 'Bread', note: 'A saffron-scented, mildly sweet flatbread, the usual companion to rich curries and kebabs.' },
  { slug: 'makhan-malai', name: 'Makhan Malai', hi: 'मक्खन मलाई', kind: 'Winter sweet', note: 'A foam of milk and morning dew, sold on winter mornings and gone by noon.', where: 'Winter only' },
  { slug: 'chaat', name: 'Basket Chaat', hi: 'बास्केट चाट', kind: 'Chaat', note: 'A crisp potato basket filled with chickpeas, yoghurt and chutneys. A Hazratganj classic.', where: 'Hazratganj' },
  { slug: 'kulfi', name: 'Kulfi Falooda', hi: 'कुल्फी फ़ालूदा', kind: 'Dessert', note: 'Dense, slow-frozen kulfi on rose-scented falooda noodles.', where: 'Aminabad' },
  { slug: 'kakori', name: 'Kakori Kebab', hi: 'काकोरी कबाब', kind: 'Kebab', note: 'Long, silky skewered kebabs named after Kakori, a town just outside Lucknow.', where: 'Old city' },
];

export const UNESCO_GASTRONOMY = {
  text: 'In October 2025 UNESCO named Lucknow a Creative City of Gastronomy, for its centuries-old Awadhi cuisine.',
  url: 'https://www.unesco.org/en/creative-cities/lucknow',
};

export const FOOD_NOTES = [
  'Mango season brings Malihabad\'s Dussehri to the markets from about May to July.',
  'The old city (Chowk) is for kebabs, biryani and breakfast. Hazratganj is for chaat and cafés.',
  'Listings are editorial, not endorsements. Hygiene and opening hours change, so check before you go.',
];

/* ───────────────────────── Travel ───────────────────────── */
export const SEASONS = [
  { name: 'October to March', note: 'The best time. Mild days and cool evenings. Winter mornings can be foggy.', score: 5 },
  { name: 'April to June', note: 'Hot and dry, with peak temperatures often above 40°C. Plan for early starts. Mango season.', score: 2 },
  { name: 'July to September', note: 'Monsoon. Green and humid, with heavy showers. The Gomti runs high.', score: 3 },
];

export const REACH = [
  { mode: 'By air', head: 'Chaudhary Charan Singh International Airport (LKO)', body: 'In Amausi on the southern edge of the city, with flights to the major Indian metros and some international routes. The metro Red Line runs from the airport.' },
  { mode: 'By rail', head: 'Lucknow Charbagh (LKO) and Lucknow Junction', body: 'One of the busiest stations on the Northern Railway network. Charbagh is the main station and has its own metro stop.' },
  { mode: 'By road', head: 'Expressways and highways', body: 'The Lucknow–Agra Expressway and the Purvanchal Expressway link the city to Agra, Delhi and eastern Uttar Pradesh.' },
  { mode: 'In the city', head: 'Metro, e-rickshaws, app cabs', body: 'The Red Line (North–South) is the quickest way to cross town. Use app cabs or autos for the old city lanes.' },
];

export const ITINERARY = [
  { day: 'Day 1', title: 'The Nawabi old city', stops: ['Rumi Darwaza at sunrise', 'Bara Imambara and its labyrinth', 'Chota Imambara and Satkhanda', 'Kebabs in Chowk for lunch', 'Hussainabad Clock Tower at dusk'] },
  { day: 'Day 2', title: 'Colonial Lucknow and the river', stops: ['The Residency ruins', 'La Martinière', 'Hazratganj for chaat and chikan shopping', 'Gomti Riverfront walk', 'Ambedkar Memorial Park at night'] },
  { day: 'Day 3', title: 'Slow Lucknow', stops: ['Breakfast of nihari and kulcha', 'Dilkusha Kothi', 'Qaiserbagh gateways', 'Makhan malai (winter) or kulfi falooda', 'Charbagh station before you leave'] },
];

/* ───────────────────────── Geography ───────────────────────── */
export const GEO_FACTS = [
  { value: 123, suffix: ' m', label: 'Mean elevation above sea level', note: 'Lucknow sits on the flat Gangetic plain, so slopes are almost entirely gentle.' },
  { value: 2.8, suffix: ' million', decimals: 1, label: 'People in the city, 2011 census', note: 'The metropolitan region is larger.' },
  { value: 30, suffix: ' km', label: 'Length of the Gomti within the city', note: 'The river meanders through Lucknow before it joins the Ganges downstream.' },
  { value: 26.85, suffix: '° N', decimals: 2, label: 'Latitude', note: 'Longitude about 80.95° E.' },
];

export const GEO_TEXT = [
  'Lucknow lies on the Gangetic plain in central Uttar Pradesh, on the banks of the Gomti, a tributary of the Ganges. The land is an alluvial plain with a gentle fall from north-west to south-east, so what looks like flat ground is a very slow slope to the river.',
  'The Gomti rises in Pilibhit district and flows through Lucknow in a series of loops. Old Lucknow sits on its south-western bank. The newer districts of Gomti Nagar and the riverfront parks spread across the north-eastern side.',
  'The climate is humid subtropical, with a hot dry summer, a monsoon from late June, and a cool, foggy winter.',
];

/* ───────────────────────── Government ───────────────────────── */
export interface Helpline { number: string; name: string; issuer: string; note?: string; kind: 'emergency' | 'safety' | 'civic' | 'travel' | 'health' }
export const HELPLINES: Helpline[] = [
  { number: '112', name: 'Emergency response', issuer: 'ERSS India (all-in-one emergency number)', kind: 'emergency', note: 'Police, fire and ambulance from one number.' },
  { number: '100', name: 'Police', issuer: 'Uttar Pradesh Police', kind: 'emergency' },
  { number: '101', name: 'Fire', issuer: 'Fire and Emergency Services', kind: 'emergency' },
  { number: '102', name: 'Ambulance (maternal and child)', issuer: 'National Health Mission', kind: 'health' },
  { number: '108', name: 'Ambulance (emergency)', issuer: 'State emergency medical service', kind: 'health' },
  { number: '1098', name: 'Child helpline', issuer: 'CHILDLINE India', kind: 'safety' },
  { number: '181', name: 'Women\'s helpline', issuer: 'Ministry of Women and Child Development', kind: 'safety' },
  { number: '1930', name: 'Cyber crime', issuer: 'National Cyber Crime Reporting Portal', kind: 'safety', note: 'Report online fraud at cybercrime.gov.in.' },
  { number: '14567', name: 'Senior citizens (Elderline)', issuer: 'Ministry of Social Justice and Empowerment', kind: 'safety' },
  { number: '14416', name: 'Mental health (Tele-MANAS)', issuer: 'Ministry of Health and Family Welfare', kind: 'health' },
  { number: '15100', name: 'Free legal aid', issuer: 'National Legal Services Authority', kind: 'civic' },
  { number: '1076', name: 'Chief Minister\'s helpline (Jansunwai)', issuer: 'Government of Uttar Pradesh', kind: 'civic', note: 'Citizen grievances and complaints.' },
  { number: '1912', name: 'Electricity complaints', issuer: 'Uttar Pradesh Power Corporation', kind: 'civic' },
  { number: '139', name: 'Railway enquiry', issuer: 'Indian Railways', kind: 'travel' },
  { number: '1033', name: 'Highway assistance', issuer: 'National Highways Authority of India', kind: 'travel' },
  { number: '1950', name: 'Voter helpline', issuer: 'Election Commission of India', kind: 'civic' },
];

export const GOV_BODIES = [
  { name: 'Lucknow Municipal Corporation', hi: 'लखनऊ नगर निगम', body: 'The city\'s civic body: sanitation, local roads, street lighting, parks, birth and death registration.' },
  { name: 'Lucknow Development Authority', hi: 'लखनऊ विकास प्राधिकरण', body: 'Plans and approves land use, housing schemes and new neighbourhoods.' },
  { name: 'Uttar Pradesh Metro Rail Corporation', hi: 'यूपी मेट्रो रेल कॉर्पोरेशन', body: 'Builds and runs the Lucknow Metro.' },
  { name: 'District administration', hi: 'ज़िला प्रशासन', body: 'The District Magistrate\'s office coordinates revenue, law and order, and disaster response across the district.' },
  { name: 'Uttar Pradesh Police', hi: 'उत्तर प्रदेश पुलिस', body: 'The state police, whose headquarters are in Lucknow, runs the 112 emergency response.' },
  { name: 'Uttar Pradesh Legislative Assembly', hi: 'उत्तर प्रदेश विधान सभा', body: 'The state\'s legislature, which meets at Vidhan Bhavan.' },
];

/* ───────────────────────── Platform ───────────────────────── */
export const PLATFORM_STATS = [
  { value: 959, suffix: 'k', label: 'map features in the live city', note: 'Buildings, roads, places and more, streamed in tiles.' },
  { value: 6900, suffix: '+', label: 'streaming tiles', note: 'Only what is near the camera is loaded.' },
  { value: 6, suffix: '', label: 'live data feeds', note: 'Weather, air, aircraft, trains, traffic, news. Each says when it is down.' },
  { value: 1, suffix: '', label: 'city so far', note: 'Lucknow first. The pipeline is built to take any Indian city.' },
];

export const GOV_USES = [
  { title: 'One shared picture', body: 'Departments see the same map of streets, buildings and services instead of passing around separate files.', status: 'live' },
  { title: 'Emergency coverage', body: 'Hospitals, fire and police stations on the map with coverage radii, so gaps in cover are visible.', status: 'live' },
  { title: 'Route and access checks', body: 'Pick two places and see the route over the real road network.', status: 'live' },
  { title: 'Air and weather watch', body: 'Live temperature and air quality for the city, with the data age shown.', status: 'live' },
  { title: 'Ward-level dashboards', body: 'Population, services and complaints rolled up per ward from official data.', status: 'roadmap' },
  { title: 'Construction and permits', body: 'Overlay approved plans on the 3D city to check height, setbacks and heritage zones.', status: 'roadmap' },
  { title: 'Flood and heat planning', body: 'Terrain and drainage layers for monsoon planning around the Gomti.', status: 'roadmap' },
  { title: 'Citizen reporting', body: 'Residents drop a pin for a pothole, light or leak, and the report lands on the map.', status: 'roadmap' },
] as const;

export const PIPELINE = [
  { t: 'Overture Maps and OpenStreetMap', d: 'Open building footprints, roads and places for Lucknow.' },
  { t: 'Tile baking', d: 'The city is cut into thousands of tiles and a coarse overview layer, built ahead of time.' },
  { t: 'Streaming renderer', d: 'WebGL draws only what is near the camera, with level-of-detail from whole city to street.' },
  { t: 'Live feeds', d: 'A small server caches public feeds and reports honestly when one is down.' },
  { t: 'Analyst', d: 'Questions are answered from the live layers, and the map flies to the answer.' },
];

/* ───────────────────────── About ───────────────────────── */
export interface Member { name: string; role: string; lead?: boolean }
/** Edit this list to change the team shown on the About page. */
export const TEAM: Member[] = [
  { name: 'Mohd Taqi Abbas Haideri', role: 'Project lead', lead: true },
  { name: 'Ashmit Tiwari', role: 'Collaborator' },
  { name: 'Ujjwal Gupta', role: 'Collaborator' },
];
export const TEAM_AFFILIATION = 'CUUP, second-year students';

export const DATA_CREDITS = [
  { name: 'Overture Maps Foundation', use: 'Buildings, roads and places', url: 'https://overturemaps.org' },
  { name: 'OpenStreetMap contributors', use: 'Map data (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'Open-Meteo', use: 'Weather, air quality and elevation', url: 'https://open-meteo.com' },
  { name: 'OpenSky Network', use: 'Aircraft near Lucknow', url: 'https://opensky-network.org' },
  { name: 'Wikimedia Commons', use: 'Photographs (see below)', url: 'https://commons.wikimedia.org' },
  { name: 'React Bits', use: 'Animated interface components', url: 'https://reactbits.dev' },
];
