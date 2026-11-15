import { flushSync } from 'react-dom';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Length of the circular day/night reveal on the site, in ms. */
export const REVEAL_MS = 950;

/**
 * Day/night as a circle that grows out of the switch and swallows the page.
 * The new look is revealed inside the circle (View Transitions where the
 * browser has them), and a soft gold rim rides the edge of the circle so the
 * change has a visible front. Falls back to an instant change.
 */
export function runDayNight(apply: () => void, origin?: { x: number; y: number }) {
  document.documentElement.classList.add('dn-running');
  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 40;
  const root = document.documentElement;
  root.style.setProperty('--dn-x', `${x}px`);
  root.style.setProperty('--dn-y', `${y}px`);
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty('--dn-r', `${r}px`);

  const doc = document as Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> } };
  if (reduced() || !doc.startViewTransition) { document.documentElement.classList.remove('dn-running'); apply(); return; }

  // the rim: a ring that grows with the reveal
  const ring = document.createElement('div');
  ring.className = 'dn-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.setProperty('--dn-size', `${r * 2}px`);
  document.body.appendChild(ring);

  // Apply, then wait two frames so canvases (the 3D map) have drawn the new look before it is captured.
  // Frames can stall when the page is busy or hidden; never wait more than ~120 ms, or the browser aborts the transition.
  const raf = () => new Promise<void>((r) => { const t = window.setTimeout(r, 60); requestAnimationFrame(() => { window.clearTimeout(t); r(); }); });
  const hasCanvas = !!document.querySelector('.map-scope canvas');
  let t: { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
  t = doc.startViewTransition(hasCanvas ? async () => { flushSync(apply); await raf(); await raf(); } : () => flushSync(apply));
  // a skipped or aborted transition is harmless: the new look is already applied
  t.ready?.catch(() => undefined);
  t.updateCallbackDone?.catch(() => undefined);
  t.finished.catch(() => undefined).finally(() => { root.classList.remove('dn-running'); ring.remove(); });
}
