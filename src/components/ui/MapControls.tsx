import React, { useEffect, useRef, useState } from 'react';
import { Compass, Layers, Tag, Palette, Sparkles, MoreHorizontal, X, FileText, Presentation, Maximize2, RotateCcw, ArrowRight, Video } from 'lucide-react';
import type { CameraPreset, AIAction } from '../../types';
import { DESTINATIONS, HIGHLIGHT_TOUR, destinationById, type DestCategory } from '../../city/destinations';
import type { LabelSettings } from '../../city/labelManager';
import { DEFAULT_LABEL_SETTINGS } from '../../city/labelManager';
import { LayerControl, Switch, type LayerState } from '../features/LayerControl';
import { AnalystPanel } from '../features/AnalystPanel';
import { THEMES, type ThemeId } from './themes';

export type PanelId = 'explore' | 'layers' | 'labels' | 'look' | 'camera' | 'ask' | 'more';

const DOCK: { id: PanelId; label: string; Icon: React.ElementType }[] = [
  { id: 'explore', label: 'Explore', Icon: Compass },
  { id: 'layers', label: 'Layers', Icon: Layers },
  { id: 'labels', label: 'Labels', Icon: Tag },
  { id: 'look', label: 'Look', Icon: Palette },
  { id: 'camera', label: 'Camera', Icon: Video },
  { id: 'ask', label: 'Ask', Icon: Sparkles },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
];

const TITLES: Record<PanelId, string> = {
  explore: 'Explore Lucknow', layers: 'Layers', labels: 'Labels', look: 'Look and feel', camera: 'Camera', ask: 'Ask the city', more: 'Tools',
};

const CAT_TITLE: Record<DestCategory, string> = { heritage: 'Heritage', parks: 'Parks', transport: 'Transport', popular: 'Popular destinations' };
const CATS: DestCategory[] = ['heritage', 'parks', 'transport', 'popular'];
const TOUR_DWELL_MS = 9000;

const VIEWS: { id: CameraPreset; name: string }[] = [
  { id: 'hero', name: 'Skyline' },
  { id: 'overview', name: 'District' },
  { id: 'neighborhood', name: 'Local' },
  { id: 'street', name: 'Street' },
  { id: 'top', name: 'Top' },
];

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; name: string }[]; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-white/[0.06] p-1">
    {options.map((o) => (
      <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
        className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors ${value === o.id ? 'bg-sand text-terrain' : 'text-paper/65 hover:text-paper'}`}>{o.name}</button>
    ))}
  </div>
);

const Field: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div>
    <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sand/70">{title}</p>
    {children}
    {hint && <p className="mt-2 px-0.5 text-[11.5px] leading-[1.5] text-paper/45">{hint}</p>}
  </div>
);

const ToggleRow: React.FC<{ name: string; note?: string; on: boolean; onChange: () => void; disabled?: boolean }> = ({ name, note, on, onChange, disabled }) => (
  <div className={`flex items-center gap-3 rounded-xl px-2 py-2.5 ${disabled ? 'opacity-40' : 'hover:bg-white/5'}`}>
    <div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-paper/90">{name}</p>{note && <p className="text-[11px] text-paper/45">{note}</p>}</div>
    <Switch on={on} onChange={disabled ? () => undefined : onChange} label={name} />
  </div>
);

export interface MapControlsProps {
  compact: boolean;
  layers: LayerState;
  onToggleLayer: (category: 'base' | 'live', layer: string) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  labelSettings: LabelSettings;
  onLabelSettings: (s: LabelSettings) => void;
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  night: boolean;
  cameraPanel: React.ReactNode;
  windowView: boolean;
  onWindowView: (v: boolean) => void;
  onCameraSignal: (p: CameraPreset) => void;
  onExecuteAction: (a: AIAction) => void;
  onReport: () => void;
  onPresent: () => void;
  onMapOnly: () => void;
  /** Live data detail popups, shown at the bottom of the Layers tab. */
  liveDetails: React.ReactNode;
  openRequest?: PanelId | null;
}

export const MapControls: React.FC<MapControlsProps> = (p) => {
  const [open, setOpen] = useState<PanelId | null>(null);
  useEffect(() => { if (p.openRequest) setOpen(p.openRequest); }, [p.openRequest]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const set = (patch: Partial<LabelSettings>) => p.onLabelSettings({ ...p.labelSettings, ...patch });
  const fly = (id: CameraPreset) => { p.onCameraSignal(id); if (p.compact) setOpen(null); };

  // Highlights tour: registry scenes in order, one flight per dwell. Replayable.
  const [tour, setTour] = useState<number | null>(null);
  const tourTimer = useRef<number | null>(null);
  const stopTour = () => { if (tourTimer.current) window.clearTimeout(tourTimer.current); tourTimer.current = null; setTour(null); };
  const startTour = (i: number) => {
    if (tourTimer.current) window.clearTimeout(tourTimer.current);
    setTour(i);
    p.onCameraSignal(`dest:${HIGHLIGHT_TOUR[i]}` as CameraPreset);
    tourTimer.current = window.setTimeout(() => {
      if (i + 1 < HIGHLIGHT_TOUR.length) startTour(i + 1); else { tourTimer.current = null; setTour(null); }
    }, TOUR_DWELL_MS);
  };
  useEffect(() => () => { if (tourTimer.current) window.clearTimeout(tourTimer.current); }, []);

  const body = (() => {
    switch (open) {
      case 'explore': return (
        <div className="space-y-6">
          <Field title="View"><Seg label="Camera view" value={'' as CameraPreset} options={VIEWS} onChange={fly} /></Field>
          <Field title="Explore Lucknow: Highlights" hint="A guided flight through the finest-modelled places. Pause at any time; the camera is yours again.">
            <div className="flex items-center gap-2">
              <button onClick={() => (tour === null ? startTour(0) : stopTour())}
                className="flex-1 rounded-xl bg-sand px-3 py-2.5 text-[13px] font-semibold text-terrain hover:opacity-90">
                {tour === null ? 'Play highlights' : `Stop (${tour + 1} of ${HIGHLIGHT_TOUR.length})`}
              </button>
              {tour !== null && (
                <button onClick={() => startTour((tour + 1) % HIGHLIGHT_TOUR.length)} className="rounded-xl bg-white/[0.08] px-3 py-2.5 text-[13px] font-semibold text-paper/80 hover:bg-white/[0.14]">Next</button>
              )}
            </div>
            {tour !== null && <p className="mt-2 px-0.5 text-[12px] text-paper/60">Now: {destinationById(HIGHLIGHT_TOUR[tour])?.name}</p>}
          </Field>
          {CATS.map((cat) => (
            <Field key={cat} title={CAT_TITLE[cat]}>
              <ul className="-mx-1">
                {DESTINATIONS.filter((d) => d.category === cat).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => { stopTour(); fly(`dest:${x.id}` as CameraPreset); }} title={x.status} className="group flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left hover:bg-white/5">
                      <span><span className="block text-[13.5px] font-medium text-paper/90">{x.name}</span><span className="block text-[11.5px] text-paper/45">{x.note}</span></span>
                      <ArrowRight className="h-4 w-4 text-sand/0 transition-all group-hover:translate-x-0.5 group-hover:text-sand" />
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
          ))}
        </div>
      );
      case 'layers': return (<div className="space-y-6"><LayerControl layers={p.layers} onToggleLayer={p.onToggleLayer} />{p.liveDetails}</div>);
      case 'labels': return (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white/[0.05] px-2">
            <ToggleRow name="Show labels" note="Names of places and roads on the map" on={p.showLabels} onChange={p.onToggleLabels} />
          </div>
          <div className={p.showLabels ? '' : 'pointer-events-none opacity-40'} aria-disabled={!p.showLabels}>
            <div className="space-y-6">
              <Field title="What to name">
                <div className="rounded-2xl bg-white/[0.05] px-2">
                  <ToggleRow name="Places" note="Landmarks, institutions, areas" on={p.labelSettings.places} onChange={() => set({ places: !p.labelSettings.places })} />
                  <ToggleRow name="Roads" note="Major road names" on={p.labelSettings.roads} onChange={() => set({ roads: !p.labelSettings.roads })} />
                  <ToggleRow name="Landmarks only" note="Monuments and major sights" on={p.labelSettings.landmarksOnly} onChange={() => set({ landmarksOnly: !p.labelSettings.landmarksOnly })} disabled={!p.labelSettings.places} />
                </div>
              </Field>
              <Field title="How many" hint="Fewer labels keep the city readable. Labels never overlap, so zooming in always reveals more.">
                <Seg label="Label density" value={p.labelSettings.density} options={[{ id: 'minimal', name: 'Few' }, { id: 'balanced', name: 'Balanced' }, { id: 'rich', name: 'Many' }]} onChange={(density) => set({ density })} />
              </Field>
              <Field title="Text size">
                <Seg label="Label size" value={p.labelSettings.size} options={[{ id: 'small', name: 'Small' }, { id: 'medium', name: 'Medium' }, { id: 'large', name: 'Large' }]} onChange={(size) => set({ size })} />
              </Field>
              <button onClick={() => p.onLabelSettings(DEFAULT_LABEL_SETTINGS)} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-paper/55 hover:text-paper"><RotateCcw className="h-3.5 w-3.5" />Reset labels</button>
            </div>
          </div>
        </div>
      );
      case 'look': return (
        <div className="space-y-6">
          <Field title="Style" hint="Day and night are switched separately, with the sun and moon button above the controls.">
            <div className="grid grid-cols-1 gap-2.5">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => p.onTheme(t.id)} aria-pressed={p.theme === t.id}
                  className={`overflow-hidden rounded-2xl border text-left transition-all ${p.theme === t.id ? 'border-sand ring-1 ring-sand/60' : 'border-white/10 hover:border-white/30'}`}>
                  <span className="flex items-stretch">
                    <span className="relative block w-24 flex-shrink-0"><span className="absolute inset-0 transition-opacity duration-700" style={{ background: t.swatch[0], opacity: p.night ? 0 : 1 }} /><span className="absolute inset-0 transition-opacity duration-700" style={{ background: t.swatch[1], opacity: p.night ? 1 : 0 }} /></span>
                    <span className="block px-3.5 py-3"><span className="block text-[13.5px] font-semibold text-paper">{t.name}</span><span className="block text-[11.5px] leading-[1.4] text-paper/55">{p.night ? t.night : t.day}</span></span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
          <div className="rounded-2xl bg-white/[0.05] px-2">
            <ToggleRow name="Airplane-window view" note="Soft glass, vignette and grain over the map (W)" on={p.windowView} onChange={() => p.onWindowView(!p.windowView)} />
          </div>
          <button onClick={() => { p.onTheme('warm'); p.onWindowView(true); }} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-paper/55 hover:text-paper"><RotateCcw className="h-3.5 w-3.5" />Back to Natural warm</button>
        </div>
      );
      case 'camera': return <div className="pt-1">{p.cameraPanel}</div>;
      case 'ask': return <AnalystPanel onExecuteAction={p.onExecuteAction} />;
      case 'more': return (
        <div className="space-y-2">
          {[
            { Icon: FileText, name: 'City report', note: 'Counts and statistics for the map', run: p.onReport },
            { Icon: Presentation, name: 'Presentation mode', note: 'Hide most controls for a demo (Esc to exit)', run: p.onPresent },
            { Icon: Maximize2, name: 'Map only', note: 'Hide every panel (M, or Esc to return)', run: p.onMapOnly },
          ].map(({ Icon, name, note, run }) => (
            <button key={name} onClick={() => { setOpen(null); run(); }} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3.5 text-left hover:bg-white/[0.09]">
              <Icon className="h-4 w-4 text-sand" strokeWidth={1.7} /><span><span className="block text-[13.5px] font-medium text-paper">{name}</span><span className="block text-[11.5px] text-paper/45">{note}</span></span>
            </button>
          ))}
          <p className="px-1 pt-3 text-[11.5px] leading-[1.6] text-paper/40">Shortcuts: M map only · W window view · Esc back out.</p>
        </div>
      );
      default: return null;
    }
  })();

  return (
    <>
      {/* dock */}
      <nav
        aria-label="Map controls"
        className={`pointer-events-auto z-30 ${p.compact
          ? 'fixed inset-x-3 bottom-3 flex justify-around rounded-2xl p-1.5'
          : 'absolute right-3 top-[64px] flex flex-col gap-1 rounded-2xl p-1.5'} glass-panel`}
      >
        {DOCK.map(({ id, label, Icon }) => {
          const active = open === id;
          return (
            <button key={id} onClick={() => setOpen(active ? null : id)} aria-pressed={active} aria-label={label} title={label}
              className={`group relative flex items-center justify-center rounded-xl transition-colors ${p.compact ? 'h-12 min-w-0 flex-1 flex-col gap-0.5' : 'h-11 w-11'} ${active ? 'bg-sand text-terrain' : 'text-paper/75 hover:bg-white/10 hover:text-paper'}`}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {p.compact && <span className="text-[10px] font-medium">{label}</span>}
              {!p.compact && <span className="pointer-events-none absolute right-[calc(100%+10px)] whitespace-nowrap rounded-lg bg-cabin/95 px-2.5 py-1 text-[11.5px] font-medium text-paper opacity-0 transition-opacity group-hover:opacity-100">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* drawer */}
      {open && (
        <section
          role="dialog" aria-label={TITLES[open]}
          className={`pointer-events-auto z-30 glass-panel flex flex-col overflow-hidden ${p.compact
            ? 'fixed inset-x-3 bottom-[84px] max-h-[62vh] rounded-3xl'
            : 'absolute right-[68px] top-3 max-h-[calc(100vh-1.5rem)] w-[340px] rounded-3xl'}`}
          data-lenis-prevent
        >
          <header className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="font-display text-[1.25rem] font-light text-paper">{TITLES[open]}</h2>
            <button onClick={() => setOpen(null)} aria-label="Close panel" className="grid h-8 w-8 place-items-center rounded-full text-paper/60 hover:bg-white/10 hover:text-paper"><X className="h-4 w-4" /></button>
          </header>
          <div className="no-scrollbar overflow-y-auto px-4 pb-5 pt-2" data-lenis-prevent>{body}</div>
        </section>
      )}
    </>
  );
};
