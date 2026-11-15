import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';

/**
 * Day / night switch. Deliberately quiet: one round button whose icon turns
 * over. The change itself is the scene (the map eases its lights and sky over
 * DAY_NIGHT_SECONDS; the site cross-fades).
 */
export const DayNightToggle: React.FC<{
  night: boolean;
  onChange: (night: boolean, origin?: { x: number; y: number }) => void;
  compact?: boolean;
  /** Kept for compatibility; the switch no longer draws an overlay. */
  sweep?: boolean;
  className?: string;
}> = ({ night, onChange, className }) => {
  const btn = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    onChange(!night, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
  };
  return (
    <button
      ref={btn}
      onClick={toggle}
      role="switch"
      aria-checked={night}
      aria-label={night ? 'Switch to day' : 'Switch to night'}
      title={night ? 'Day' : 'Night'}
      className={`${className ?? ''} pointer-events-auto relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-current/15 text-current transition-colors hover:bg-current/10`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={night ? 'moon' : 'sun'}
          initial={{ opacity: 0, rotate: -40, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 40, scale: 0.7 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="grid place-items-center"
        >
          {night ? <Moon className="h-[18px] w-[18px]" strokeWidth={1.6} /> : <Sun className="h-[18px] w-[18px]" strokeWidth={1.6} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
};
