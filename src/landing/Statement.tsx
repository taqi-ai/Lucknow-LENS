import React, { useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from './bits';

/* ---------- the statement, set with pictures in the line ---------- */
type Piece = string | { img: string; label: string };
const STATEMENT: Piece[] = [
  'For two centuries', { img: '/lucknow/art/rumi-darwaza-sm.webp', label: 'Rumi Darwaza' }, 'Lucknow was the capital of the Nawabs of Awadh.',
  'They raised gateways', { img: '/lucknow/art/bara-imambara-sm.webp', label: 'Bara Imambara' }, 'and imambaras', { img: '/lucknow/art/chota-imambara-sm.webp', label: 'Chota Imambara' },
  'and cooked over slow fires', { img: '/lucknow/art/biryani-sm.webp', label: 'Awadhi biryani' }, 'until the city became a cuisine of its own.',
  'Read it here.', 'Then see it from the air', { img: '/lucknow/art/clock-tower-sm.webp', label: 'Hussainabad Clock Tower' },
];

const Pill: React.FC<{ img: string; label: string; i: number; show: boolean }> = ({ img, label, i, show }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative mx-[0.18em] inline-block align-[-0.12em]" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <motion.img src={img} alt={label} loading="lazy"
        className="inline-block h-[0.95em] w-[1.9em] rounded-full object-cover shadow-[0_6px_18px_-8px_rgba(0,0,0,.5)] ring-2 ring-terrain"
        initial={prefersReducedMotion() ? false : { scale: 0, rotate: -12 }} animate={show ? { scale: 1, rotate: 0 } : undefined}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.25 + i * 0.12 }} />
      {open && (
        <motion.span initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}
          className="pointer-events-none absolute bottom-[115%] left-1/2 z-20 w-[220px] -translate-x-1/2 overflow-hidden rounded-2xl bg-terrain shadow-[0_24px_50px_-18px_rgba(0,0,0,.55)]">
          <img src={img.replace('-sm.webp', '.webp')} alt="" className="h-[150px] w-full object-cover" />
          <span className="block px-3 py-2 font-sans text-[13px] font-semibold text-paper">{label}</span>
        </motion.span>
      )}
    </span>
  );
};

export const Statement: React.FC = () => {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 40%'] });
  let pic = 0;
  type Tok = { w: string } | { pill: { img: string; label: string } };
  const words: Tok[] = STATEMENT.flatMap((p): Tok[] => (typeof p === 'string' ? p.split(' ').map((w) => ({ w })) : [{ pill: p }]));
  return (
    <section className="relative overflow-hidden py-32 sm:py-44">
      <div aria-hidden className="jali absolute inset-0" />
      <div className="relative mx-auto max-w-[1180px] px-5 sm:px-8">
        <p ref={ref} className="font-display text-[clamp(2rem,4.6vw,4.2rem)] leading-[1.16] tracking-[-0.01em] text-paper">
          {words.map((x, i) => {
            if ('pill' in x) return <Pill key={i} img={x.pill.img} label={x.pill.label} i={pic++} show={inView} />;
            const start = i / words.length, end = start + 0.18;
            return <Word key={i} p={scrollYProgress} range={[start * 0.82, end * 0.82]} text={x.w} />;
          })}
        </p>
      </div>
    </section>
  );
};

const Word: React.FC<{ p: ReturnType<typeof useScroll>['scrollYProgress']; range: [number, number]; text: string }> = ({ p, range, text }) => {
  const reduce = prefersReducedMotion();
  const o = useTransform(p, range, [reduce ? 1 : 0.14, 1]);
  return <motion.span style={{ opacity: o }} className="inline">{text} </motion.span>;
};


export default Statement;
