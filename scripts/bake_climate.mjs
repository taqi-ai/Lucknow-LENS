// Bakes ten years of real daily weather for Lucknow (Open-Meteo historical archive, ERA5)
// into monthly normals for the Geography page: public/geo/lucknow_climate.json
import { writeFile } from 'node:fs/promises';
const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=26.85&longitude=80.95&start_date=2015-01-01&end_date=2024-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FKolkata';
const r = await fetch(url);
if (!r.ok) throw new Error('archive ' + r.status);
const d = (await r.json()).daily;
const m = Array.from({ length: 12 }, () => ({ hi: 0, lo: 0, rain: 0, n: 0 }));
const years = new Set();
d.time.forEach((t, i) => {
  const mo = Number(t.slice(5, 7)) - 1; years.add(t.slice(0, 4));
  if (d.temperature_2m_max[i] == null) return;
  m[mo].hi += d.temperature_2m_max[i]; m[mo].lo += d.temperature_2m_min[i]; m[mo].rain += d.precipitation_sum[i] ?? 0; m[mo].n++;
});
const out = m.map((x) => ({ hi: +(x.hi / x.n).toFixed(1), lo: +(x.lo / x.n).toFixed(1), rain: +(x.rain / years.size).toFixed(0) }));
await writeFile('public/geo/lucknow_climate.json', JSON.stringify({ source: 'Open-Meteo historical weather archive (ERA5), daily data 2015-2024, averaged by month', months: out }));
console.log(out.map((x, i) => `${i + 1}: ${x.lo}-${x.hi}C ${x.rain}mm`).join('\n'));
