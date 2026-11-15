import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import { prefersReducedMotion } from './bits';

/**
 * The hero is a window seat. A shade lifts to reveal Lucknow from above; clouds
 * drift at different depths and the whole scene leans with the cursor. The
 * shade can be dragged back down, which is the one thing people will try first.
 */
export const WindowHero: React.FC = () => {
  const reduce = prefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);

  // pointer parallax, -1..1
  const px = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const py = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const farX = useTransform(px, (v) => v * -10);
  const farY = useTransform(py, (v) => v * -6);
  const midX = useTransform(px, (v) => v * -22);
  const midY = useTransform(py, (v) => v * -12);
  const nearX = useTransform(px, (v) => v * -42);
  const nearY = useTransform(py, (v) => v * -20);
  const tiltX = useTransform(py, (v) => v * -3);
  const tiltY = useTransform(px, (v) => v * 4);

  // shade position as a percentage of window height (0 = fully closed)
  const shadePct = useMotionValue(reduce ? -74 : 0);
  const shadeY = useMotionTemplate`${shadePct}%`;
  useEffect(() => {
    if (reduce) return;
    const c = animate(shadePct, -74, { duration: 2.4, delay: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [reduce, shadePct]);

  const setShade = (v: number) => shadePct.set(Math.max(-90, Math.min(0, v)));
  const toggleShade = () => animate(shadePct, shadePct.get() > -40 ? -74 : -4, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto w-[min(88vw,470px)] select-none"
      style={{ perspective: 1400 }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType === 'touch') return;
        const r = wrapRef.current!.getBoundingClientRect();
        px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
        py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
      onPointerLeave={() => { px.set(0); py.set(0); }}
    >
      <motion.div style={{ rotateX: tiltX, rotateY: tiltY, transformStyle: 'preserve-3d' }}>
        {/* cabin wall + frame */}
        <div
          className="relative p-[14px] sm:p-[18px]"
          style={{
            borderRadius: '44% / 31%',
            background: 'linear-gradient(150deg,#2b3b44 0%,#16232b 45%,#0b141a 100%)',
            boxShadow: '0 60px 120px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(213,199,165,.08), inset 0 2px 1px rgba(255,255,255,.07), inset 0 -10px 30px rgba(0,0,0,.6)',
          }}
        >
          {/* glass */}
          <div
            className="relative isolate overflow-hidden"
            style={{ aspectRatio: '0.74', borderRadius: '43% / 30%', boxShadow: 'inset 0 0 40px rgba(0,0,0,.55), inset 0 0 0 2px rgba(0,0,0,.6)', background: '#10202a' }}
          >
            {/* sky */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,#44667f 0%,#7ea0b6 24%,#d9c2a0 55%,#f0c9a0 70%,#e6a96f 100%)' }} />
            <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 40% at 76% 52%, rgba(255,226,170,.85), rgba(255,200,130,.25) 45%, transparent 70%)' }} />

            {/* far clouds */}
            <motion.div className="absolute inset-0" style={{ x: farX, y: farY }}>
              <div className="cloud-drift absolute -left-[10%] top-[34%] h-[22%] w-[130%] opacity-70" style={{ animationDuration: '110s', background: 'radial-gradient(ellipse 20% 50% at 15% 55%, #fff6e8 0%, transparent 70%), radial-gradient(ellipse 26% 60% at 48% 45%, #ffffff 0%, transparent 70%), radial-gradient(ellipse 18% 46% at 82% 58%, #fff0dc 0%, transparent 72%)', filter: 'blur(14px)' }} />
            </motion.div>

            {/* the city */}
            <motion.div className="absolute inset-x-[-14%] bottom-0 h-[58%]" style={{ x: midX, y: midY }}>
              <img
                src="/brand/hero-aerial.webp"
                alt="Aerial view of Lucknow with the Rumi Darwaza in the foreground"
                className="city-pan h-full w-full object-cover object-[60%_30%]"
                style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, #000 34%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 34%)', filter: 'saturate(1.02) contrast(1.04)' }}
                draggable={false}
                fetchPriority="high"
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(240,201,160,.65) 0%, rgba(240,201,160,.12) 42%, transparent 70%)' }} />
            </motion.div>

            {/* near clouds, the ones that sweep past the wing */}
            <motion.div className="absolute inset-0" style={{ x: nearX, y: nearY }}>
              <div className="cloud-drift absolute -left-[20%] bottom-[8%] h-[26%] w-[150%]" style={{ animationDuration: '58s', animationDirection: 'reverse', background: 'radial-gradient(ellipse 22% 55% at 12% 60%, rgba(255,255,255,.95), transparent 70%), radial-gradient(ellipse 28% 62% at 44% 50%, rgba(255,246,232,.9), transparent 70%), radial-gradient(ellipse 20% 52% at 78% 62%, rgba(255,255,255,.92), transparent 72%)', filter: 'blur(10px)' }} />
              <div className="cloud-drift absolute -left-[10%] top-[8%] h-[16%] w-[130%] opacity-60" style={{ animationDuration: '80s', background: 'radial-gradient(ellipse 24% 50% at 30% 50%, rgba(255,255,255,.8), transparent 70%), radial-gradient(ellipse 20% 48% at 70% 50%, rgba(255,240,220,.8), transparent 72%)', filter: 'blur(16px)' }} />
            </motion.div>

            {/* glass: glare, vignette, grain */}
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 62%, rgba(255,255,255,.07) 74%, rgba(255,255,255,0) 86%)' }} />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(6,12,16,.55) 100%)' }} />
            <div className="grain pointer-events-none absolute inset-0 overflow-hidden" />

            {/* the shade */}
            <motion.div
              ref={shadeRef}
              className="absolute inset-x-0 top-0 h-full will-change-transform"
              style={{ y: shadeY, background: 'repeating-linear-gradient(180deg, rgba(0,0,0,.05) 0 2px, transparent 2px 9px), linear-gradient(180deg,#ebe6d8 0%,#d8d1bf 100%)', boxShadow: '0 20px 40px rgba(0,0,0,.45)' }}
            >
              <motion.button
                type="button"
                aria-label="Raise or lower the window shade"
                onClick={toggleShade}
                onPan={(_, info) => setShade(shadePct.get() + (info.delta.y / (shadeRef.current?.offsetHeight || 600)) * 100)}
                className="absolute bottom-0 left-1/2 flex h-12 w-24 -translate-x-1/2 cursor-grab items-start justify-center rounded-b-2xl bg-[#c9c1ad] pt-2 active:cursor-grabbing"
                style={{ touchAction: 'none', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.15)' }}
              >
                <span className="h-1.5 w-10 rounded-full bg-[#9d9580]" />
              </motion.button>
            </motion.div>
          </div>
        </div>
      </motion.div>
      <p className="mt-5 text-center font-mono text-[11px] tracking-wide text-sand/55">
        26.85° N, 80.95° E &nbsp;·&nbsp; pull the shade
      </p>
    </div>
  );
};
