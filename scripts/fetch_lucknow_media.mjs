// Fetches openly licensed photographs of Lucknow from Wikimedia Commons into public/lucknow/
// and writes src/landing/credits.json (author + licence + source page) so every image is attributed.
// Usage: node scripts/fetch_lucknow_media.mjs [--candidates]
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('public/lucknow');
const CREDITS = path.resolve('src/landing/credits.json');
const UA = 'TerralytLanding/1.0 (open-media fetch; contact via repository)';
const WIDTH = 1400;

// slug -> search query (+ optional exact file title to pin the choice)
const TOPICS = {
  'bara-gate': 'File:The Entrance Gate to Bara Imamabara Lucknow Uttar Pradesh.jpg',
  'satkhanda': 'File:Satkhand Lucknow at night.jpg',
  'rumi-darwaza': 'File:Rumi Darwaza - DSC2797-01.jpg',
  'bara-imambara': 'File:Outer premises of Bara Imambara (Imambara of Asaf-ud-daula in Lucknow) on a summer afternoon.jpg',
  'chota-imambara': 'File:Chota Imambara 2.jpg',
  'clock-tower': 'Hussainabad Clock Tower Lucknow',
  'residency': 'British Residency Lucknow ruins',
  'la-martiniere': 'La Martiniere College Lucknow',
  'charbagh': 'Charbagh railway station Lucknow',
  'ambedkar-park': 'Ambedkar Memorial Park Lucknow',
  'janeshwar-park': 'Janeshwar Mishra Park Lucknow',
  'gomti-riverfront': 'Gomti River Front Lucknow',
  'hazratganj': 'Hazratganj Lucknow',
  'vidhan-sabha': 'File:Vidhan Bhawan Lucknow.jpg',
  'chhatar-manzil': 'Chhatar Manzil Lucknow',
  'picture-gallery': 'Picture Gallery Lucknow Qaiserbagh',
  'jama-masjid': 'Jama Masjid Lucknow',
  'moti-mahal': 'Moti Mahal Lucknow',
  'ekana': 'Ekana Cricket Stadium Lucknow',
  'skyline': 'Lucknow skyline Gomti',
  'metro': 'Lucknow Metro train',
  'sikandar-bagh': 'Sikandar Bagh Lucknow',
  'shaheed-smarak': 'Shaheed Smarak Lucknow',
  'dilkusha': 'Dilkusha Kothi Lucknow',
  'kaiserbagh': 'Qaiserbagh Lucknow',
  'bhulbhulaiya': 'Bhool Bhulaiya Bara Imambara',
  'tunday': 'Tunday Kababi Lucknow',
  'galouti': 'Galouti kebab',
  'biryani': 'Awadhi biryani Lucknow',
  'nihari': 'File:Nihari and roti.jpg',
  'makhan-malai': 'Makhan malai Lucknow',
  'kulfi': 'Kulfi falooda',
  'chaat': 'Basket chaat Lucknow',
  'sheermal': 'Sheermal bread',
  'paan': 'Paan Lucknow',
  'chikankari': 'Chikankari embroidery Lucknow',
  'kakori': 'Kakori kebab',
  'amausi': 'Chaudhary Charan Singh International Airport Lucknow',
  'lohia-path': 'Lucknow Gomti Nagar night',
};

const api = async (params) => {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ format: 'json', ...params })) u.searchParams.set(k, v);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 4000 * (i + 1))); continue; }
    return r.json();
  }
  throw new Error('commons api failed');
};

const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const OK_LICENCE = /^(cc[- ]by|cc[- ]by-sa|cc0|public domain|pd|gfdl)/i;

async function candidates(query) {
  // A value starting with "File:" pins one exact Commons file instead of taking the top search hit.
  const titles = query.startsWith('File:')
    ? [query]
    : ((await api({ action: 'query', list: 'search', srnamespace: 6, srlimit: 12, srsearch: query })).query?.search ?? []).map((x) => x.title);
  if (!titles.length) return [];
  const info = await api({
    action: 'query', prop: 'imageinfo', titles: titles.join('|'),
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: WIDTH,
  });
  const pages = Object.values(info.query?.pages ?? {});
  const out = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg' || ii.width < 1400) continue;
    const m = ii.extmetadata ?? {};
    const licence = strip(m.LicenseShortName?.value);
    if (!OK_LICENCE.test(licence)) continue; // Commons only hosts free licences; this just skips odd labels
    out.push({
      title: p.title, thumb: ii.thumburl, page: ii.descriptionurl, w: ii.width, h: ii.height,
      author: strip(m.Artist?.value) || 'Unknown', licence,
      order: titles.indexOf(p.title),
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

await mkdir(OUT, { recursive: true });
const credits = {};
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [slug, q] of Object.entries(TOPICS)) {
  if (only.length && !only.includes(slug)) continue;
  const file = path.join(OUT, `${slug}.jpg`);
  try {
    const c = await candidates(q);
    if (!c.length) { console.log(`✗ ${slug}: no usable candidate`); continue; }
    const pick = c[0];
    const r = await fetch(pick.thumb, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.log(`✗ ${slug}: download ${r.status}`); continue; }
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    credits[slug] = { title: pick.title.replace(/^File:/, ''), author: pick.author, licence: pick.licence, page: pick.page };
    console.log(`✓ ${slug}  ← ${pick.title}  (${pick.licence})`);
  } catch (e) { console.log(`✗ ${slug}: ${e.message}`); }
  await new Promise((s) => setTimeout(s, 2500));
}
let prev = {};
try { prev = JSON.parse((await import('node:fs')).readFileSync(CREDITS, 'utf8')); } catch {}
await writeFile(CREDITS, JSON.stringify({ ...prev, ...credits }, null, 2));
