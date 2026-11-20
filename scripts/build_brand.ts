/** Writes public/brand/* from src/components/brand/brand.ts (SVG directly, PNG via headless Chrome). */
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { markSvgBody, BRAND, markSvg, logoSvg } from '../src/components/brand/brand';
const D = 'public/brand';
const C = BRAND.colors;
const files: Record<string, string> = {
  'lucknow-lens-mark.svg': markSvg(C.ivory, C.charcoal),
  'lucknow-lens-logo.svg': logoSvg(C.ivory, C.charcoal),
  'lucknow-lens-logo-dark.svg': logoSvg(C.ivory, C.charcoal),
  'lucknow-lens-logo-light.svg': logoSvg(C.charcoal, C.ivory),
  // Transparent cut-out favicon: the blades/gateway are real holes (mask), and the ink follows the browser theme.
  'favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.i{fill:#16130f}@media (prefers-color-scheme:dark){.i{fill:#f3ead8}}</style><mask id="m">${markSvgBody('#fff', '#000')}</mask><rect class="i" width="100" height="100" mask="url(#m)"/></svg>`,
};
for (const [f, s] of Object.entries(files)) fs.writeFileSync(`${D}/${f}`, s);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const shot = async (html: string, w: number, h: number, out: string) => {
  await page.setViewport({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
};
for (const n of [32, 180, 192, 512]) await shot(markSvg(C.ivory, C.charcoal, C.charcoal).replace('<svg ', `<svg width="${n}" height="${n}" `), n, n, `${D}/lucknow-lens-${n}.png`);
await shot(`<div style="width:1200px;height:630px;background:${C.charcoal};display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Montserrat,'Segoe UI',sans-serif">
  ${markSvg(C.ivory, C.charcoal).replace('<svg ', '<svg width="260" height="260" ')}
  <div style="color:${C.ivory};font-size:54px;letter-spacing:16px;margin-top:22px">LUCKNOW LENS</div>
  <div style="color:${C.gold};font-size:22px;letter-spacing:6px;margin-top:14px">THE CITY OF NAWABS, IN 3D</div></div>`, 1200, 630, `${D}/lucknow-lens-og.png`);
await browser.close();
fs.writeFileSync('public/manifest.webmanifest', JSON.stringify({ name: BRAND.name, short_name: BRAND.name, start_url: '/', display: 'standalone', background_color: C.charcoal, theme_color: C.charcoal,
  icons: [{ src: '/brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/brand/lucknow-lens-192.png', sizes: '192x192', type: 'image/png' }, { src: '/brand/lucknow-lens-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }, null, 1));
console.log('brand assets written');
