import React, { useState } from 'react';
import { motion } from 'motion/react';
import { prefersReducedMotion } from './bits';

/**
 * The way into the map is a boarding pass for the window seat. Tearing the stub
 * boards you. "Pehle aap" (after you) is the Lucknow courtesy of letting the other
 * person go first.
 */
export const BoardingPass: React.FC<{ onBoard: () => void; weather?: string | null }> = ({ onBoard, weather }) => {
  const [torn, setTorn] = useState(false);
  const board = () => {
    if (torn) return;
    setTorn(true);
    window.setTimeout(onBoard, prefersReducedMotion() ? 0 : 520);
  };

  const Field = ({ k, v, wide }: { k: string; v: string; wide?: boolean }) => (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[11px] font-medium text-paper/50">{k}</p>
      <p className="text-[15px] font-semibold leading-tight text-paper">{v}</p>
    </div>
  );

  return (
    <div data-enter className="relative flex w-full max-w-[560px] flex-col drop-shadow-[0_24px_40px_rgba(30,36,40,.18)] sm:flex-row">
      {/* main part */}
      <div className="pass-edge relative flex-1 rounded-t-[22px] bg-terrain p-6 sm:rounded-l-[22px] sm:rounded-tr-none">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-display text-[2.6rem] leading-none text-paper">LKO</p>
          <svg aria-hidden width="70" height="18" viewBox="0 0 70 18" className="text-amber"><path d="M2 12 C 20 2, 50 2, 68 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" /><path d="M60 5 l8 7 -9 2" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          <p className="text-right text-[12px] leading-tight text-paper/55">Lucknow<br />Uttar Pradesh</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3.5 min-[460px]:grid-cols-3">
          <Field k="Passenger" v="You" />
          <Field k="Flight" v="TL 1784" />
          <Field k="Seat" v="26A, window" />
          <Field k="Gate" v="Rumi Darwaza" wide />
          <Field k="Outside" v={weather ?? 'Clear view'} />
        </div>
        {/* jali-like barcode */}
        <div aria-hidden className="mt-5 h-7 w-full opacity-70" style={{ background: 'repeating-linear-gradient(90deg, #fff4e6 0 1px, transparent 1px 3px, #fff4e6 3px 5px, transparent 5px 6px, #fff4e6 6px 7px, transparent 7px 10px)' }} />
      </div>

      {/* perforation */}
      <div aria-hidden className="relative h-0 border-t-2 border-dashed border-paper/20 sm:h-auto sm:w-0 sm:border-l-2 sm:border-t-0">
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-cabin sm:-left-3 sm:-top-3" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-cabin sm:-bottom-3 sm:left-[-12px] sm:right-auto sm:top-auto" />
      </div>

      {/* stub */}
      <motion.div
        className="flex flex-col items-center justify-center gap-3 rounded-b-[22px] bg-terrain p-6 sm:w-[170px] sm:rounded-r-[22px] sm:rounded-bl-none"
        animate={torn && !prefersReducedMotion() ? { rotate: 9, x: 40, y: 26, opacity: 0 } : { rotate: 0, x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.5, 0, 0.75, 0] }}
        style={{ transformOrigin: '0% 0%' }}
      >
        <p className="font-deva text-[1.35rem] leading-none text-sand" lang="hi">पहले आप</p>
        <p className="-mt-1 text-[11.5px] text-paper/50">after you</p>
        <button
          onClick={board}
          className="w-full rounded-full bg-sand py-3 text-[15px] font-semibold text-terrain shadow-[0_10px_24px_-10px_rgba(142,44,66,.8)] transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          Board the map
        </button>
      </motion.div>
    </div>
  );
};

export default BoardingPass;
