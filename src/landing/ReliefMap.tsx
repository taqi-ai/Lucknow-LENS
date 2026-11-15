import React, { useEffect, useRef, useState } from 'react';

interface Dem { source: string; bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }; cols: number; rows: number; min: number; max: number; elevation: number[] }

const PLACES = [
  { n: 'Rumi Darwaza', lat: 26.8697, lon: 80.9131 },
  { n: 'Charbagh', lat: 26.8322, lon: 80.9221 },
  { n: 'Hazratganj', lat: 26.8467, lon: 80.9461 },
  { n: 'Gomti Nagar', lat: 26.8570, lon: 80.9990 },
  { n: 'Amausi airport', lat: 26.7606, lon: 80.8893 },
];

// low to high: river-green, sand, ochre, amber
const STOPS: [number, [number, number, number]][] = [
  [0, [38, 66, 70]], [0.3, [84, 118, 104]], [0.55, [196, 184, 146]], [0.8, [198, 139, 84]], [1, [240, 201, 160]],
];
const ramp = (t: number): [number, number, number] => {
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
    const [t0, c0] = STOPS[i - 1]; const [t1, c1] = STOPS[i]; const k = (t - t0) / (t1 - t0);
    return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
  }
  return STOPS[STOPS.length - 1][1];
};

/** Real Copernicus-DEM elevation for a 30 km box around Lucknow, drawn as tinted relief with contour lines. */
export const ReliefMap: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dem, setDem] = useState<Dem | null>(null);
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/geo/lucknow_dem.json').then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => live && setDem(d)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, []);

  const sample = (d: Dem, u: number, v: number) => {
    const x = Math.min(d.cols - 1.001, Math.max(0, u * (d.cols - 1))), y = Math.min(d.rows - 1.001, Math.max(0, v * (d.rows - 1)));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const e = (c: number, r: number) => d.elevation[r * d.cols + c];
    return (e(x0, y0) * (1 - fx) + e(x0 + 1, y0) * fx) * (1 - fy) + (e(x0, y0 + 1) * (1 - fx) + e(x0 + 1, y0 + 1) * fx) * fy;
  };

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !dem) return;
    const W = 640, H = Math.round(W * ((dem.bounds.latMax - dem.bounds.latMin) / ((dem.bounds.lonMax - dem.bounds.lonMin) * Math.cos(26.85 * Math.PI / 180))));
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const range = dem.max - dem.min || 1;
    const z = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) z[y * W + x] = sample(dem, x / (W - 1), y / (H - 1));
    // Smooth the 90 m DEM noise (buildings and trees leak into it) so the plain reads as terrain.
    const tmp = new Float32Array(W * H), R = 9;
    for (const [src, dst, horiz] of [[z, tmp, true], [tmp, z, false]] as const) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let acc = 0, n = 0;
        for (let k = -R; k <= R; k++) { const xx = horiz ? x + k : x, yy = horiz ? y : y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; acc += src[yy * W + xx]; n++; }
        dst[y * W + x] = acc / n;
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, e = z[i];
      const [r, g, b] = ramp((e - dem.min) / range);
      // hillshade from the north-west, strongly exaggerated because the plain is nearly flat
      const dzx = (z[y * W + Math.min(W - 1, x + 1)] - z[y * W + Math.max(0, x - 1)]);
      const dzy = (z[Math.min(H - 1, y + 1) * W + x] - z[Math.max(0, y - 1) * W + x]);
      const shade = 1 + Math.max(-0.35, Math.min(0.35, (-dzx - dzy) * 0.55));
      const j = i * 4;
      img.data[j] = Math.min(255, r * shade); img.data[j + 1] = Math.min(255, g * shade); img.data[j + 2] = Math.min(255, b * shade); img.data[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // contour lines every 2 m (heavier every 10 m) by marking cells where the integer band changes
    for (const [step, alpha, w] of [[2, 0.28, 1], [10, 0.6, 1.6]] as const) {
      ctx.fillStyle = `rgba(12,22,29,${alpha})`;
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const a = Math.floor(z[y * W + x] / step), b = Math.floor(z[y * W + x + 1] / step), c = Math.floor(z[(y + 1) * W + x] / step);
        if (a !== b || a !== c) ctx.fillRect(x, y, w, w);
      }
    }
    // places
    ctx.font = '600 12px Manrope, sans-serif'; ctx.textBaseline = 'middle';
    for (const p of PLACES) {
      const x = ((p.lon - dem.bounds.lonMin) / (dem.bounds.lonMax - dem.bounds.lonMin)) * W;
      const y = ((dem.bounds.latMax - p.lat) / (dem.bounds.latMax - dem.bounds.latMin)) * H;
      ctx.fillStyle = '#0c161d'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#eae9df'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(12,22,29,.85)'; const tw = ctx.measureText(p.n).width; ctx.fillRect(x + 9, y - 9, tw + 10, 18);
      ctx.fillStyle = '#eae9df'; ctx.fillText(p.n, x + 14, y);
    }
  }, [dem]);

  if (err) return <p className="rounded-2xl border border-sand/12 p-8 text-[14px] text-paper/60">The elevation data could not be loaded.</p>;

  return (
    <figure className="relative">
      <div className="relative overflow-hidden rounded-[28px] border border-sand/15 bg-terrain/60 shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)]">
        <canvas
          ref={ref} className="block h-auto w-full touch-pan-y" role="img"
          aria-label="Shaded relief map of the 30 kilometre area around Lucknow, with contour lines and five marked places"
          onPointerMove={(e) => {
            if (!dem) return;
            const r = e.currentTarget.getBoundingClientRect();
            const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
            setHover({ x: e.clientX - r.left, y: e.clientY - r.top, z: sample(dem, u, v) });
          }}
          onPointerLeave={() => setHover(null)}
        />
        {!dem && <div className="absolute inset-0 grid place-items-center font-mono text-[12px] text-sand/60">Loading elevation…</div>}
        {hover && (
          <div className="pointer-events-none absolute rounded-lg bg-cabin/90 px-2.5 py-1.5 font-mono text-[11px] text-sand" style={{ left: Math.min(hover.x + 12, 9999), top: hover.y + 12 }}>{hover.z.toFixed(0)} m</div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-paper/55">
        <span className="inline-flex items-center gap-3">
          <span className="font-mono text-sand/80">{dem ? Math.round(dem.min) : '—'} m</span>
          <span className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg,#264246,#547668,#c4b892,#c68b54,#f0c9a0)' }} />
          <span className="font-mono text-sand/80">{dem ? Math.round(dem.max) : '—'} m</span>
        </span>
        <span>Shading is exaggerated to make a very flat plain readable. Contours every 2 m, heavier every 10 m.</span>
      </div>
      <figcaption className="mt-2 text-[11px] text-paper/40">Elevation: Copernicus DEM (90 m) via the Open-Meteo elevation API, sampled on a 31 × 31 grid, so fine detail such as the river bed is smoothed away.</figcaption>
    </figure>
  );
};

export default ReliefMap;
