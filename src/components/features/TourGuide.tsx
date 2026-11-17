/**
 * TourGuide (round 3): "Lucknow, guided". A narrated cinematic flight through the city's
 * monuments with a short description for each stop, a stop on the elevated metro while a train
 * runs, a switch to night mode, and a closing pull-back to the whole city. Camera moves reuse
 * CameraController.transitionTo, so nothing here touches the renderer.
 *
 * Descriptions are short and limited to well-established facts. Framings use the destination
 * registry (src/city/destinations.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CameraController } from '../../city/cameraController';
import { destinationById } from '../../city/destinations';

interface Stop {
  id: string;
  title: string;
  kicker: string;
  text: string;
  /** Registry id for x/z, or 'metro' to resolve a point on the elevated line at run time. */
  dest: string;
  az: number; pitch: number; dist: number;
  /** Azimuth swing across the dwell, and the closing-in factor on distance. */
  orbit: number; closeIn: number;
  night?: boolean;
  dwell?: number;
}

const STOPS: Stop[] = [
  { id: 'rumi', title: 'Rumi Darwaza', kicker: 'Husainabad · 1784', dest: 'rumi_darwaza', az: 1.3, pitch: 0.3, dist: 330, orbit: 0.7, closeIn: 0.8,
    text: 'A monumental gateway about sixty feet high, built under Nawab Asaf-ud-Daula. Often called the Turkish Gate, it is the entrance to old Lucknow.' },
  { id: 'bara', title: 'Bara Imambara', kicker: 'Husainabad · 1784', dest: 'husainabad', az: 2.4, pitch: 0.42, dist: 900, orbit: 0.6, closeIn: 0.7,
    text: 'Raised by Asaf-ud-Daula during a famine to give people work. Its central hall is one of the largest arched halls built without beams; the complex also holds the Asafi Masjid and the Shahi Baoli.' },
  { id: 'chhota', title: 'Chhota Imambara', kicker: 'Husainabad · 1838', dest: 'chhota_imambara', az: 0.8, pitch: 0.4, dist: 380, orbit: 0.8, closeIn: 0.8,
    text: 'Built by Muhammad Ali Shah and known as the Palace of Lights for the way it is illuminated during Muharram. Long water channels run through its garden.' },
  { id: 'clock', title: 'Husainabad Clock Tower', kicker: 'Husainabad · 1880s', dest: 'clock_tower', az: 0.8, pitch: 0.28, dist: 330, orbit: 0.8, closeIn: 0.8,
    text: 'One of the tallest clock towers in India, rising about 67 metres beside the Picture Gallery and the old Husainabad tank.' },
  { id: 'residency', title: 'The Residency', kicker: 'Siege of 1857', dest: 'residency', az: 0.9, pitch: 0.4, dist: 480, orbit: 0.6, closeIn: 0.8,
    text: 'The ruins of the British Residency, scarred by the siege of 1857. The broken walls and lawns are kept as a memorial.' },
  { id: 'hazratganj', title: 'Hazratganj', kicker: 'The heart of the city', dest: 'hazratganj', az: 0.6, pitch: 0.3, dist: 700, orbit: 0.5, closeIn: 0.7,
    text: 'The colonial-era promenade of arcaded shopfronts, cafes and old cinemas: Lucknow’s favourite evening walk for generations.' },
  { id: 'charbagh', title: 'Charbagh Railway Station', kicker: 'Early 20th century', dest: 'charbagh', az: 0.35, pitch: 0.4, dist: 700, orbit: 0.7, closeIn: 0.8,
    text: 'A red-brick station of arches, chhatris and domes. From above, its roofline is known for a chessboard pattern of domes and turrets.' },
  { id: 'metro', title: 'Lucknow Metro', kicker: 'Elevated line · opened 2017', dest: 'metro', az: 0.4, pitch: 0.3, dist: 260, orbit: 0.9, closeIn: 0.9, dwell: 11000,
    text: 'The metro runs on an elevated viaduct across the city and goes underground beneath the old centre. Watch a train glide along the line.' },
  { id: 'ambedkar', title: 'Dr. Ambedkar Memorial Park', kicker: 'Gomti Nagar', dest: 'ambedkar_park', az: 1.75, pitch: 0.42, dist: 1100, orbit: 0.7, closeIn: 0.7,
    text: 'A vast sandstone memorial with a stupa, an avenue of 62 elephants and a great amphitheatre.' },
  { id: 'janeshwar', title: 'Janeshwar Mishra Park', kicker: 'Gomti Nagar · 376 acres', dest: 'janeshwar_park', az: 0.3, pitch: 0.75, dist: 1500, orbit: 0.8, closeIn: 0.8,
    text: 'One of the largest urban parks in the country, with two lakes, wide lawns and long walking and cycling tracks.' },
  { id: 'ekana', title: 'Ekana Cricket Stadium', kicker: 'Shaheed Path', dest: 'ekana', az: 1.15, pitch: 0.5, dist: 800, orbit: 0.9, closeIn: 0.8,
    text: 'Lucknow’s international cricket ground, a bowl for roughly fifty thousand spectators.' },
  { id: 'night-old', title: 'Husainabad by night', kicker: 'After dark', dest: 'husainabad', az: 2.4, pitch: 0.4, dist: 800, orbit: 0.7, closeIn: 0.8, night: true,
    text: 'After dark the old city’s monuments are floodlit in warm amber while the lanes around them fall quiet.' },
  { id: 'night-gomti', title: 'The Gomti at night', kicker: 'After dark', dest: 'taj_gomti', az: 1.9, pitch: 0.34, dist: 1000, orbit: 0.7, closeIn: 0.8, night: true,
    text: 'Bridges and riverfront lamps trace the curve of the Gomti through the modern city.' },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  controller: CameraController | null;
  night: boolean;
  onNight: (n: boolean) => void;
  hidden?: boolean;
}

export const TourGuide: React.FC<Props> = ({ controller, night, onNight, hidden }) => {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [card, setCard] = useState<{ kicker: string; title: string; text: string } | null>(null);
  const token = useRef(0);
  const pausedRef = useRef(false);
  const nightRef = useRef(night);
  const startNight = useRef(night);
  const metroPoint = useRef<{ x: number; z: number; az: number } | null>(null);
  nightRef.current = night;
  pausedRef.current = paused;

  const stop = useCallback(() => {
    token.current++;
    setRunning(false); setPaused(false); setCard(null); setIdx(-1);
    if (nightRef.current !== startNight.current) onNight(startNight.current);
  }, [onNight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && running) stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, stop]);

  useEffect(() => () => { token.current++; }, []);

  const findMetro = async (): Promise<{ x: number; z: number; az: number } | null> => {
    if (metroPoint.current) return metroPoint.current;
    try {
      const d = await (await fetch('/landmarks/metro.json')).json() as { lines: Array<{ kind: string; pts: number[][] }> };
      const v = d.lines.filter((l) => l.kind === 'viaduct').sort((a, b) => b.pts.length - a.pts.length)[0];
      const k = Math.floor(v.pts.length * 0.45);
      const m = v.pts[k], n = v.pts[k + 1] ?? m;
      // Look across the viaduct: camera azimuth perpendicular to the line.
      metroPoint.current = { x: m[0], z: m[2], az: Math.atan2(n[0] - m[0], n[2] - m[2]) + Math.PI / 2 };
    } catch { metroPoint.current = null; }
    return metroPoint.current;
  };

  const run = useCallback(async () => {
    if (!controller) return;
    const my = ++token.current;
    const alive = () => token.current === my;
    const wait = async (ms: number) => {
      let left = ms;
      while (left > 0 && alive()) { await sleep(100); if (!pausedRef.current) left -= 100; }
    };
    startNight.current = nightRef.current;
    setRunning(true); setPaused(false); setIdx(-1);
    if (nightRef.current) onNight(false);

    // Opening: a high, wide establishing view of the whole city.
    setCard({ kicker: 'Lucknow Lens', title: 'Lucknow, guided', text: 'A flight across the City of Nawabs, from old Husainabad to the Gomti, by day and by night.' });
    controller.transitionTo(new THREE.Vector3(-1500, 0, 300), 0.6, 0.85, 16000, 3000);
    await wait(4200);

    for (let i = 0; i < STOPS.length && alive(); i++) {
      const s = STOPS[i];
      let x: number | undefined, z: number | undefined, az = s.az;
      if (s.dest === 'metro') {
        const m = await findMetro();
        if (!m) continue;
        x = m.x; z = m.z; az = m.az;
      } else {
        const d = destinationById(s.dest);
        x = d?.x; z = d?.z;
      }
      if (x === undefined || z === undefined) continue;
      setIdx(i);
      if (s.night && !nightRef.current) { onNight(true); await wait(1400); }
      setCard({ kicker: s.kicker, title: s.title, text: s.text });
      const tgt = new THREE.Vector3(x, 0, z);
      // Approach: swing in and settle on the framing.
      controller.transitionTo(tgt, az - s.orbit * 0.5, s.pitch, s.dist, 4200);
      await wait(4400);
      if (!alive()) break;
      // Dwell: a slow orbit while easing closer.
      const dwell = s.dwell ?? 7500;
      controller.transitionTo(tgt, az + s.orbit * 0.5, Math.max(0.2, s.pitch - 0.04), s.dist * s.closeIn, dwell);
      await wait(dwell);
    }

    if (alive()) {
      // Finale: pull back to the whole city.
      setIdx(STOPS.length);
      setCard({ kicker: 'Lucknow', title: 'The City of Nawabs', text: 'Old gateways, river parks and a metro running above the streets. Thank you for flying with us.' });
      controller.transitionTo(new THREE.Vector3(-600, 0, 400), 0.9, 0.62, 24000, 7000);
      await wait(8500);
    }
    if (alive()) stop();
  }, [controller, onNight, stop]);

  if (hidden) return null;
  const total = STOPS.length;

  return (
    <>
      {!running && (
        <button
          onClick={run}
          disabled={!controller}
          className="absolute bottom-6 left-1/2 z-[22] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#2b1b16]/90 px-5 py-2.5 text-[13px] font-semibold text-[#f3e3c3] shadow-[0_10px_30px_-8px_rgba(0,0,0,.6)] backdrop-blur hover:bg-[#3a2620] disabled:opacity-50 max-sm:bottom-4"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>
          Guided tour of Lucknow
        </button>
      )}
      {running && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[21] h-[7vh] bg-black/80" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[21] h-[7vh] bg-black/80" />
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-[9vh] left-1/2 z-[22] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-[#1d1411]/80 p-4 text-[#f6ead2] shadow-[0_18px_50px_-16px_rgba(0,0,0,.7)] backdrop-blur-md"
          >
            {card && (
              <div key={card.title} className="animate-[fadeIn_.6s_ease-out]">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#d8b66a]">{card.kicker}</p>
                <h2 className="mt-0.5 text-[20px] leading-tight" style={{ fontFamily: '"Rozha One", Georgia, serif' }}>{card.title}</h2>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#f6ead2]/85">{card.text}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 gap-1" aria-label={`Stop ${Math.max(0, Math.min(idx + 1, total))} of ${total}`}>
                {STOPS.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i < idx ? 'bg-[#d8b66a]' : i === idx ? 'bg-[#f6ead2]' : 'bg-white/20'}`} />)}
              </div>
              <button onClick={() => setPaused((p) => !p)} className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/20">{paused ? 'Resume' : 'Pause'}</button>
              <button onClick={stop} className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-semibold hover:bg-white/20">End</button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
