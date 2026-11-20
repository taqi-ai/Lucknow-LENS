// Bakes a coarse real elevation grid for Lucknow from the Open-Meteo elevation API (Copernicus DEM, ~90 m)
// into public/geo/lucknow_dem.json. Run once; the Geography page reads the file, no runtime API calls.
import { mkdir, writeFile } from 'node:fs/promises';
const B = { latMin: 26.70, latMax: 27.00, lonMin: 80.80, lonMax: 81.10 };
const N = 31;
const pts = [];
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  pts.push([B.latMax - (r / (N - 1)) * (B.latMax - B.latMin), B.lonMin + (c / (N - 1)) * (B.lonMax - B.lonMin)]);
}
const out = [];
for (let i = 0; i < pts.length; i += 100) {
  const chunk = pts.slice(i, i + 100);
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p[0].toFixed(4)).join(',')}&longitude=${chunk.map((p) => p[1].toFixed(4)).join(',')}`;
  for (let t = 0; ; t++) {
    const r = await fetch(url);
    if (r.ok) { out.push(...(await r.json()).elevation); break; }
    if (t > 4) throw new Error('elevation api ' + r.status);
    await new Promise((s) => setTimeout(s, 3000 * (t + 1)));
  }
  await new Promise((s) => setTimeout(s, 800));
}
await mkdir('public/geo', { recursive: true });
const min = Math.min(...out), max = Math.max(...out);
await writeFile('public/geo/lucknow_dem.json', JSON.stringify({
  source: 'Open-Meteo elevation API (Copernicus DEM GLO-90)', bounds: B, cols: N, rows: N, min, max, elevation: out.map((v) => Math.round(v * 10) / 10),
}));
console.log('cells', out.length, 'min', min, 'max', max);
