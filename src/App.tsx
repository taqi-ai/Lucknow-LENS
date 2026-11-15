import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';
import type { CameraPreset } from './types';
import type { LoadProgress } from './MapApp';
import { Landing } from './landing/Landing';
import { TerralytMark } from './components/ui/TerralytMark';
import { AircraftWindow, PANE } from './landing/AircraftWindow';

const loadMap = () => import('./MapApp');
const MapApp = lazy(loadMap);

/**
 * landing → boarding (map loads behind a closed cabin window; the shade lifts as it loads)
 *         → ready (shade up, the real map is visible through the glass; nothing moves until you choose)
 *         → diving (the camera pushes through the window) → map
 */
type Stage = 'landing' | 'boarding' | 'ready' | 'diving' | 'map';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Called only when someone shows intent to enter (hover, focus, touch on an Enter control). */
const DATA_FILES = ['/overture/lucknow_buildings.geojson', '/overture/lucknow_roads.geojson', '/overture/lucknow_places.geojson', '/hlod/hlod_manifest.json'];
let warmed = false;
function warmMap() {
  if (warmed) return;
  warmed = true;
  loadMap().catch(() => { warmed = false; });
  DATA_FILES.forEach((u) => fetch(u, { priority: 'low' } as RequestInit).catch(() => undefined));
}

export default function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [preset, setPreset] = useState<CameraPreset>('hero');
  const [progress, setProgress] = useState<LoadProgress>({ value: 0, stage: 'Boarding', ready: false, error: null });
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(0); // eased progress that drives the shade
  const savedScroll = useRef(0);
  const scale = useMotionValue(1);
  const fade = useMotionValue(1);

  const enter = useCallback((p?: CameraPreset) => {
    savedScroll.current = window.scrollY;
    setPreset(p ?? 'hero');
    setProgress({ value: 0.02, stage: 'Boarding', ready: false, error: null });
    setShown(0);
    scale.set(1); fade.set(0);
    animate(fade, 1, { duration: 0.6 });
    setStage('boarding');
    window.scrollTo(0, 0);
  }, [scale, fade]);

  const leave = useCallback(() => {
    setStage('landing');
    requestAnimationFrame(() => window.scrollTo(0, savedScroll.current));
  }, []);

  const onProgress = useCallback((p: LoadProgress) => {
    setProgress(p);
    if (p.ready) setStage((s) => (s === 'boarding' ? 'ready' : s));
  }, []);

  // Real progress jumps in steps (and sits still while the first tiles load), so
  // the shade follows an eased value that keeps creeping, but never claims "done".
  useEffect(() => {
    if (stage !== 'boarding') return;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const creep = Math.min(0.88, ((performance.now() - t0) / 45000) * 0.88);
      const target = Math.max(progress.value, creep);
      setShown((v) => v + (Math.min(target, 0.92) - v) * 0.04);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, progress.value]);

  const dive = useCallback(async () => {
    if (stage !== 'ready') return;
    setStage('diving');
    if (reduced()) {
      await animate(fade, 0, { duration: 0.4 });
    } else {
      // scale so the pane (228 of 560 units tall window) overflows the screen
      const h = Math.min(window.innerHeight * 0.78, 720);
      const paneW = h * (PANE.w / 560), paneH = h * (PANE.h / 560);
      const target = Math.max(window.innerWidth / paneW, window.innerHeight / paneH) * 1.25;
      animate(fade, 0, { duration: 0.5, delay: 0.95 });
      await animate(scale, target, { duration: 1.45, ease: [0.7, 0, 0.2, 1] });
    }
    setStage('map');
  }, [stage, fade, scale]);

  // keyboard: Enter or Space dives once the map is ready
  useEffect(() => {
    if (stage !== 'ready') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dive(); } if (e.key === 'Escape') leave(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, dive, leave]);

  useEffect(() => {
    document.documentElement.style.overflow = stage === 'landing' ? '' : 'hidden';
    document.body.style.overflow = stage === 'landing' ? '' : 'hidden';
    document.documentElement.style.background = stage === 'landing' ? '' : '#07201b';
  }, [stage]);

  const shadeValue = stage === 'boarding' ? 1 - shown : 0;
  const inCabin = stage === 'boarding' || stage === 'ready' || stage === 'diving';

  return (
    <>
      {stage === 'landing' && <Landing onEnter={enter} onPrefetch={warmMap} />}

      {stage !== 'landing' && (
        <div className="map-scope fixed inset-0 bg-cabin">
          <Suspense fallback={null}>
            <MapApp key={attempt} entryPreset={preset} onProgress={onProgress} released={stage === 'diving' || stage === 'map'} onRetry={() => setAttempt((n) => n + 1)} />
          </Suspense>
          {stage === 'map' && (
            <button
              onClick={leave}
              className="fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-sand/25 bg-cabin/80 px-4 py-2 text-[12.5px] font-semibold text-paper/85 backdrop-blur-xl transition-colors hover:bg-cabin hover:text-paper max-sm:left-auto max-sm:right-3 max-sm:h-11 max-sm:w-11 max-sm:translate-x-0 max-sm:justify-center max-sm:px-0"
              aria-label="Back to the Terralyt overview"
            >
              <TerralytMark className="h-5 w-5" /> <span className="max-sm:hidden">Overview</span>
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {inCabin && (
          <motion.div
            key="cabin"
            className="fixed inset-0 z-[100] overflow-hidden"
            style={{ opacity: fade }}
          >
            <motion.div className="absolute inset-0 grid place-items-center" style={{ scale, transformOrigin: `50% ${50 + ((PANE.y + PANE.h / 2) / 560 - 0.5) * 78}%` }}>
              <button
                onClick={dive}
                disabled={stage !== 'ready'}
                aria-label={stage === 'ready' ? 'Dive into the map' : 'The map is loading behind the window'}
                className="relative cursor-default disabled:cursor-progress [&:not(:disabled)]:cursor-zoom-in"
              >
                <AircraftWindow view="hole" fullWall shade={shadeValue} className="block h-[min(78vh,720px)] w-auto" label="Cabin window. The live map of Lucknow is outside." />
              </button>
            </motion.div>

            {/* status, on the cabin wall under the window */}
            <AnimatePresence mode="wait">
              {stage !== 'diving' && (
                <motion.div key={stage} className="pointer-events-none absolute inset-x-0 bottom-[3vh] flex flex-col items-center px-6 text-center text-[#f6ead6]"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} role="status" aria-live="polite">
                  {stage === 'boarding' ? (
                    <>
                      <p className="font-display text-[clamp(1.3rem,2.6vw,1.8rem)] leading-tight">{progress.error ? 'The city did not load' : 'Raising the shade over Lucknow'}</p>
                      <p className="mt-1 text-[13px] text-[#f6ead6]/60">{progress.error ?? progress.stage}</p>
                      <div className="pointer-events-auto mt-3 flex gap-4">
                        {progress.error && <button onClick={() => setAttempt((n) => n + 1)} className="rounded-full bg-[#e0a55a] px-5 py-2 text-[13px] font-semibold text-[#2a1a10]">Try again</button>}
                        <button onClick={leave} className="text-[13px] font-medium text-[#f6ead6]/55 underline-offset-4 hover:text-[#f6ead6] hover:underline">Back to the overview</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight">The map is ready.</p>
                      <div className="pointer-events-auto mt-3 flex items-center gap-4">
                        <button onClick={dive} className="group relative overflow-hidden rounded-full bg-[#e0a55a] px-7 py-3 text-[15px] font-semibold text-[#2a1a10] shadow-[0_14px_36px_-12px_rgba(224,165,90,.7)] transition-transform active:scale-95">
                          <span className="relative z-10">Dive in</span>
                          <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                        </button>
                        <span className="text-[12.5px] text-[#f6ead6]/55">or press Enter</span>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
