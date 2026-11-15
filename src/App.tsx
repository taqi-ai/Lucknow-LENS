import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CameraPreset } from './types';
import type { LoadProgress } from './MapApp';
import { Landing } from './landing/Landing';
import { TerralytMark } from './components/ui/TerralytMark';

const loadMap = () => import('./MapApp');
const MapApp = lazy(loadMap);

type Stage = 'landing' | 'descending' | 'map';

/** Warm the HTTP cache for the big city files so Enter does not wait on the network. */
const DATA_FILES = ['/overture/lucknow_buildings.geojson', '/overture/lucknow_roads.geojson', '/overture/lucknow_places.geojson', '/hlod/hlod_manifest.json'];
let warmed = false;
function warmMap() {
  if (warmed) return;
  warmed = true;
  loadMap().catch(() => { warmed = false; });
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
  idle(() => DATA_FILES.forEach((u) => fetch(u, { priority: 'low' } as RequestInit).catch(() => undefined)));
}

export default function App() {
  const [stage, setStage] = useState<Stage>('landing');
  const [preset, setPreset] = useState<CameraPreset>('hero');
  const [progress, setProgress] = useState<LoadProgress>({ value: 0, stage: 'Boarding', ready: false, error: null });
  const [attempt, setAttempt] = useState(0);
  const savedScroll = useRef(0);

  const enter = useCallback((p?: CameraPreset) => {
    savedScroll.current = window.scrollY;
    setPreset(p ?? 'hero');
    setProgress({ value: 0.02, stage: 'Boarding', ready: false, error: null });
    setStage('descending');
    window.scrollTo(0, 0);
  }, []);

  const leave = useCallback(() => {
    setStage('landing');
    requestAnimationFrame(() => window.scrollTo(0, savedScroll.current));
  }, []);

  const onProgress = useCallback((p: LoadProgress) => {
    setProgress(p);
    if (p.ready) setStage((s) => (s === 'descending' ? 'map' : s));
  }, []);

  // The map locks page scroll; the landing needs it.
  useEffect(() => {
    document.documentElement.style.overflow = stage === 'landing' ? '' : 'hidden';
    document.body.style.overflow = stage === 'landing' ? '' : 'hidden';
  }, [stage]);

  return (
    <>
      {stage === 'landing' && <Landing onEnter={enter} onPrefetch={warmMap} />}

      {stage !== 'landing' && (
        <div className="fixed inset-0 bg-cabin">
          <Suspense fallback={null}>
            <MapApp key={attempt} entryPreset={preset} onProgress={onProgress} onRetry={() => setAttempt((n) => n + 1)} />
          </Suspense>
          {stage === 'map' && (
            <button
              onClick={leave}
              className="fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-sand/20 bg-cabin/80 px-4 py-2 text-[12px] font-semibold text-paper/85 backdrop-blur-xl transition-colors hover:bg-cabin hover:text-paper"
              aria-label="Back to the Terralyt overview"
            >
              <TerralytMark className="h-4 w-4 object-contain" /> Overview
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {stage === 'descending' && (
          <motion.div
            key="descent"
            className="fixed inset-0 z-[100] overflow-hidden bg-cabin text-paper"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            role="status" aria-live="polite"
          >
            <img src="/brand/hero-aerial.webp" alt="" className="descent-zoom absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_55%,rgba(12,22,29,.25),#0c161d_85%)]" />
            <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[560px] flex-col items-center px-6 pb-[12vh] text-center">
              <TerralytMark className="mb-6 h-14 w-14 object-contain" />
              <p className="font-display text-[clamp(1.6rem,4vw,2.4rem)] font-light">Descending into Lucknow</p>
              <p className="mt-3 font-mono text-[12px] text-sand/75">{progress.error ? progress.error : progress.stage}</p>
              <div className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-sand/15" aria-hidden>
                <motion.div className="h-full rounded-full bg-gradient-to-r from-sage via-sand to-amber" animate={{ width: `${Math.round(progress.value * 100)}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
              </div>
              <p className="mt-3 font-mono text-[11px] tabular text-paper/45">{Math.round(progress.value * 100)}%</p>
              {progress.error && (
                <button onClick={() => setAttempt((n) => n + 1)} className="mt-5 rounded-full bg-sand px-6 py-2.5 text-[13px] font-semibold text-terrain">Try again</button>
              )}
              <button onClick={leave} className="mt-5 text-[12px] text-paper/50 underline-offset-4 hover:text-paper hover:underline">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
