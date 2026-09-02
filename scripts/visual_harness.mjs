// Headless-Chrome visual + perf harness for Lucknow LENS.
// Usage: node shoot.mjs <outDir> [shotsJson]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2] || './shots';
const SHOTS_FILE = process.argv[3] || null;

fs.mkdirSync(OUT, { recursive: true });

// name, target(x,z), azimuth, pitch, distance, night
const DEFAULT_SHOTS = [
  { n: 'fullcity_day',   t: [0, 0],        az: 0.78, pi: 0.98, d: 22000, night: false },
  { n: 'district_day',   t: [-400, 400],   az: 0.6,  pi: 0.85, d: 3000,  night: false },
  { n: 'neigh_day',      t: [-382, 372],   az: 0.6,  pi: 0.75, d: 1100,  night: false },
  { n: 'street_day',     t: [-382, 372],   az: 0.6,  pi: 0.22, d: 260,   night: false },
  { n: 'gomti_day',      t: [0, 0],        az: 0.3,  pi: 0.55, d: 2200,  night: false },
  { n: 'charbagh_day',   t: [-1499, 1574], az: 0.5,  pi: 0.6,  d: 900,   night: false },
  { n: 'fullcity_night', t: [0, 0],        az: 0.78, pi: 0.98, d: 22000, night: true },
  { n: 'district_night', t: [-400, 400],   az: 0.6,  pi: 0.85, d: 3000,  night: true },
  { n: 'neigh_night',    t: [-382, 372],   az: 0.6,  pi: 0.75, d: 1100,  night: true },
  { n: 'street_night',   t: [-382, 372],   az: 0.6,  pi: 0.22, d: 260,   night: true },
];
const SHOTS = SHOTS_FILE ? JSON.parse(fs.readFileSync(SHOTS_FILE, 'utf8')) : DEFAULT_SHOTS;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--use-angle=d3d11', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--window-size=1600,900', '--hide-scrollbars',
  ],
  defaultViewport: { width: 1600, height: 900 },
});

const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 300)));

// The app streams tiles forever, so `networkidle` never fires — wait for DOM only.
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('canvas', { timeout: 180000 });

// Expose debug handles from the app
await page.waitForFunction(() => !!window.__LENS, { timeout: 180000 }).catch(() => {
  console.error('WARN: window.__LENS debug hook not present — falling back to blind screenshots');
});

const glInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a', ver: gl.getParameter(gl.VERSION) };
});

const results = [];
for (const s of SHOTS) {
  await page.evaluate((s) => window.__LENS && window.__LENS.setShot(s), s);
  // let tiles stream in
  await page.evaluate(() => window.__LENS && window.__LENS.waitSettled ? window.__LENS.waitSettled(20000) : new Promise(r => setTimeout(r, 8000)));
  const m = await page.evaluate(() => window.__LENS ? window.__LENS.measure(2000) : null);
  await page.screenshot({ path: path.join(OUT, s.n + '.png') });
  results.push({ shot: s.n, ...m });
  console.log(s.n, JSON.stringify(m));
}

fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ glInfo, results, errors: errors.slice(0, 30) }, null, 2));
console.log('GL:', JSON.stringify(glInfo));
if (errors.length) console.log('ERRORS:', errors.slice(0, 10).join('\n'));
await browser.close();
