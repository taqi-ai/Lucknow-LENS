/**
 * PinTool: a LOCAL-ONLY annotation tool. Drop numbered pins on the map; each shows its latitude,
 * longitude and the scene x/z (metres), can carry a note, and the whole list can be copied as
 * JSON to send back as "put it here / change this" instructions.
 *
 * It only renders on localhost / 127.0.0.1 and is never shown on the deployed site.
 * Ground position comes from a ray against the y = 0 plane, so a pin on a rooftop is the point
 * where the ray meets the ground, not the roof: drop pins from a high, near-vertical view for
 * the best accuracy.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CameraController } from '../../city/cameraController';
import { unproject } from '../../geo/projection';

interface Pin { id: number; x: number; z: number; lat: number; lon: number; note: string }
type Hooks = { __lensPick?: (cx: number, cy: number) => { x: number; z: number } | null; __lensProject?: (x: number, y: number, z: number) => { sx: number; sy: number; visible: boolean } };

const KEY = 'lens.pins.v1';
const isLocal = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

const load = (): Pin[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const fmt = (n: number, d = 6) => n.toFixed(d);

export const PinTool: React.FC<{ controller: CameraController | null; hidden?: boolean }> = ({ controller, hidden }) => {
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState(false);
  const [pins, setPins] = useState<Pin[]>(load);
  const [cursor, setCursor] = useState<{ lat: number; lon: number; x: number; z: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const markerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(pins)); } catch { /* storage blocked */ } }, [pins]);

  // Keep the DOM markers glued to their ground positions.
  useEffect(() => {
    if (!isLocal) return;
    let raf = 0;
    const tick = () => {
      const h = window as unknown as Hooks;
      for (const p of pinsRef.current) {
        const el = markerRefs.current[p.id];
        if (!el || !h.__lensProject) continue;
        const q = h.__lensProject(p.x, 0, p.z);
        el.style.transform = `translate(${q.sx}px, ${q.sy}px)`;
        el.style.display = q.visible ? 'block' : 'none';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Drop mode: a click that was not a drag, on the map canvas, adds a pin.
  useEffect(() => {
    if (!isLocal || !drop) return;
    let down: { x: number; y: number } | null = null;
    let last = 0;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      const t = e.target as HTMLElement;
      if (t.tagName !== 'CANVAS') return;
      const g = (window as unknown as Hooks).__lensPick?.(e.clientX, e.clientY);
      if (g) { const ll = unproject(g.x, g.z); setCursor({ lat: ll.lat, lon: ll.lon, x: g.x, z: g.z }); }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName !== 'CANVAS' || !down) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const g = (window as unknown as Hooks).__lensPick?.(e.clientX, e.clientY);
      if (!g) return;
      e.stopPropagation(); e.preventDefault();
      const ll = unproject(g.x, g.z);
      setPins((ps) => [...ps, { id: (ps.reduce((m, p) => Math.max(m, p.id), 0)) + 1, x: Math.round(g.x * 10) / 10, z: Math.round(g.z * 10) / 10, lat: ll.lat, lon: ll.lon, note: '' }]);
      setOpen(true);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [drop]);

  useEffect(() => {
    if (!isLocal) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && drop) setDrop(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [drop]);

  const copy = useCallback(async () => {
    const out = pins.map((p) => ({ pin: p.id, lat: +fmt(p.lat), lon: +fmt(p.lon), x: p.x, z: p.z, note: p.note }));
    try { await navigator.clipboard.writeText(JSON.stringify(out, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }, [pins]);

  if (!isLocal || hidden) return null;

  return (
    <>
      {pins.map((p) => (
        <div key={p.id} ref={(el) => { markerRefs.current[p.id] = el; }} className="pointer-events-none fixed left-0 top-0 z-[30]" style={{ willChange: 'transform' }}>
          <div className="absolute -translate-x-1/2 -translate-y-full">
            <div className="grid h-7 min-w-7 place-items-center rounded-full border-2 border-white bg-[#c4262e] px-1.5 text-[12px] font-bold text-white shadow-lg">{p.id}</div>
            <div className="mx-auto h-2 w-0.5 bg-white" />
          </div>
        </div>
      ))}

      <div className="fixed bottom-4 right-4 z-[40] flex flex-col items-end gap-2 max-sm:bottom-20">
        {open && (
          <div className="w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-[#1d1411]/92 p-3 text-[12px] text-[#f6ead2] shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#d8b66a]">Pins (local only)</p>
              <div className="flex gap-1.5">
                <button onClick={copy} disabled={!pins.length} className="rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20 disabled:opacity-40">{copied ? 'Copied' : 'Copy JSON'}</button>
                <button onClick={() => { if (pins.length && confirm('Remove all pins?')) setPins([]); }} disabled={!pins.length} className="rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20 disabled:opacity-40">Clear</button>
              </div>
            </div>
            {drop && cursor && (
              <p className="mt-2 rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-[11px]">Cursor {fmt(cursor.lat, 5)}, {fmt(cursor.lon, 5)}</p>
            )}
            <ul className="mt-2 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
              {pins.length === 0 && <li className="text-[#f6ead2]/60">No pins yet. Turn on Drop pins, then click the map.</li>}
              {pins.map((p) => (
                <li key={p.id} className="rounded-xl bg-white/[0.06] p-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#c4262e] px-1 text-[11px] font-bold text-white">{p.id}</span>
                    <span className="font-mono text-[11px] select-all">{fmt(p.lat)}, {fmt(p.lon)}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10.5px] text-[#f6ead2]/55 select-all">x {p.x} · z {p.z}</p>
                  <input
                    value={p.note}
                    onChange={(e) => setPins((ps) => ps.map((q) => (q.id === p.id ? { ...q, note: e.target.value } : q)))}
                    placeholder="Note (e.g. Teele Wali Masjid centre)"
                    className="mt-1.5 w-full rounded-lg bg-black/30 px-2 py-1 text-[12px] outline-none placeholder:text-white/30"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button onClick={() => controller?.transitionTo(new THREE.Vector3(p.x, 0, p.z), 0.6, 0.9, 260, 1600)} className="rounded-lg bg-white/10 px-2 py-0.5 font-semibold hover:bg-white/20">Fly to</button>
                    <button onClick={() => setPins((ps) => ps.filter((q) => q.id !== p.id))} className="rounded-lg bg-white/10 px-2 py-0.5 font-semibold hover:bg-white/20">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => { setDrop((d) => !d); setOpen(true); }}
            aria-pressed={drop}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold shadow-lg ${drop ? 'bg-[#c4262e] text-white' : 'bg-[#2b1b16]/90 text-[#f3e3c3] hover:bg-[#3a2620]'}`}
          >
            {drop ? 'Dropping pins: click map (Esc to stop)' : 'Drop pins'}
          </button>
          <button onClick={() => setOpen((o) => !o)} className="rounded-full bg-[#2b1b16]/90 px-3.5 py-2 text-[12.5px] font-semibold text-[#f3e3c3] shadow-lg hover:bg-[#3a2620]">
            Pins {pins.length ? `(${pins.length})` : ''}
          </button>
        </div>
      </div>
      {drop && <style>{'canvas { cursor: crosshair !important; }'}</style>}
    </>
  );
};
