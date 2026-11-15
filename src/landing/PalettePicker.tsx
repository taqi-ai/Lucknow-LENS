import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';

export type PaletteId = 'burgundy' | 'gulabi' | 'plaster' | 'indigo';

export const PALETTES: { id: PaletteId; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: 'burgundy', name: 'Burgundy and gold', note: 'The default', swatch: ['#f7efe4', '#7a1630', '#b8892e'] },
  { id: 'gulabi', name: 'Gulabi and plum', note: 'Rose-peach dusk', swatch: ['#fce9e1', '#2b1633', '#e9791c'] },
  { id: 'plaster', name: 'Plaster and ochre', note: 'Rumi Darwaza\'s stone', swatch: ['#f1e3cc', '#2a1a10', '#9a6428'] },
  { id: 'indigo', name: 'Indigo and saffron', note: 'Cool and bright', swatch: ['#eceef7', '#161a3a', '#d9651f'] },
];

const KEY = 'terralyt.site.palette';

export function readPalette(): PaletteId {
  try { const v = localStorage.getItem(KEY) as PaletteId | null; return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : 'burgundy'; } catch { return 'burgundy'; }
}

export function applyPalette(id: PaletteId) {
  const root = document.documentElement;
  if (id === 'burgundy') delete root.dataset.palette; else root.dataset.palette = id;
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
}

const Dot: React.FC<{ s: [string, string, string]; size?: number }> = ({ s, size = 22 }) => (
  <span className="relative inline-block overflow-hidden rounded-full ring-1 ring-black/10" style={{ width: size, height: size, background: s[0] }} aria-hidden>
    <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: s[1] }} />
    <span className="absolute bottom-0 left-1/2 h-1/2 w-1/2" style={{ background: s[2] }} />
  </span>
);

export const PalettePicker: React.FC<{ className?: string }> = ({ className }) => {
  const [id, setId] = useState<PaletteId>(readPalette);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { applyPalette(id); }, [id]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);
  const current = PALETTES.find((p) => p.id === id)!;
  return (
    <div ref={box} className={`relative ${className ?? ''}`}>
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Colours: ${current.name}`} title="Colours"
        className="grid h-10 w-10 place-items-center rounded-full border border-current/15 transition-colors hover:bg-current/10">
        <Dot s={current.swatch} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul role="listbox" aria-label="Colour theme"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-12 z-50 w-[240px] origin-top-right rounded-2xl border border-paper/10 bg-terrain p-1.5 text-paper shadow-[0_24px_60px_-20px_rgba(0,0,0,.45)]">
            {PALETTES.map((p) => (
              <li key={p.id}>
                <button role="option" aria-selected={p.id === id} onClick={() => { setId(p.id); setOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-paper/[0.06]">
                  <Dot s={p.swatch} size={26} />
                  <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{p.name}</span><span className="block text-[11.5px] text-paper/55">{p.note}</span></span>
                  {p.id === id && <Check className="h-4 w-4 text-sand" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};
