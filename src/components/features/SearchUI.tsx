import React, { useState, useEffect, useRef, useId } from 'react';
import { SearchResult, OSMMapData } from '../../types';
import { SearchIndex } from '../../search/SearchIndex';
import { Search, MapPin, Hospital, Utensils, Hotel, ShoppingBag, Landmark, Train, Plane, TreePine, Building2, GraduationCap, X, Navigation, Loader2 } from 'lucide-react';

interface SearchUIProps {
  mapData: OSMMapData;
  onSelectResult: (result: SearchResult) => void;
  onSetDestinationWaypoint?: (dest: { x: number; z: number; name: string }) => void;
}

/**
 * Overture place types are noisy (Charbagh station is tagged `beauty_salon`), so
 * raw categories are never shown. Each type is folded into a plain-English kind,
 * and anything unrecognised is just "Place".
 */
const KINDS: [RegExp, string, React.ElementType][] = [
  [/hospital|clinic|medical|health|doctor|pharma/, 'Health', Hospital],
  [/restaurant|food|cafe|bakery|sweet|dhaba|eat/, 'Food', Utensils],
  [/hotel|lodg|resort|guest/, 'Stay', Hotel],
  [/mall|shop|store|market|retail/, 'Shopping', ShoppingBag],
  [/landmark|historic|monument|museum|memorial|mosque|temple|church|imambara/, 'Landmark', Landmark],
  [/station|railway|train|bus|metro/, 'Transport', Train],
  [/airport/, 'Airport', Plane],
  [/park|garden|green|forest|zoo/, 'Park', TreePine],
  [/school|college|university|institute/, 'Education', GraduationCap],
  [/government|office|court|assembly|police|fire/, 'Civic', Building2],
  [/^road$/, 'Road', Navigation],
];
const kindOf = (category: string, name: string): [string, React.ElementType] => {
  const n = name.toLowerCase();
  // the name is often more reliable than the type
  if (/station|junction/.test(n)) return ['Transport', Train];
  if (/airport/.test(n)) return ['Airport', Plane];
  if (/hospital|medical/.test(n)) return ['Health', Hospital];
  const c = category.toLowerCase();
  for (const [re, label, Icon] of KINDS) if (re.test(c)) return [label, Icon];
  return ['Place', MapPin];
};

export const SearchUI: React.FC<SearchUIProps> = ({ mapData, onSelectResult, onSetDestinationWaypoint }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const indexRef = useRef<SearchIndex | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // The index parses a 7 MB file; results wait for it instead of silently coming back empty.
  useEffect(() => {
    let live = true;
    const index = new SearchIndex();
    indexRef.current = index;
    index.initialize().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!indexRef.current || !q || !ready) { setResults([]); return; }
    const t = window.setTimeout(() => { setResults(indexRef.current!.search(q, mapData)); setActive(0); }, 90);
    return () => window.clearTimeout(t);
  }, [query, mapData, ready]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (r: SearchResult) => { onSelectResult(r); setQuery(r.name); setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); };

  const showList = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="w-full">
      <div className="glass-panel flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 transition-shadow focus-within:shadow-[0_0_0_1px_rgba(216,182,106,.55),0_18px_50px_-18px_rgba(0,0,0,.65)]">
        <Search className="h-4 w-4 flex-shrink-0 text-paper/50" />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Search places, roads, landmarks"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || results.length === 0) { if (e.key === 'Escape') setOpen(false); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          className="w-full min-w-0 border-none bg-transparent text-[13px] font-medium text-paper outline-none placeholder:text-paper/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} aria-label="Clear search" className="flex-shrink-0 rounded-lg p-1 text-paper/50 hover:bg-white/10 hover:text-paper">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* In normal flow, not absolutely positioned: the left column scrolls, and an absolute list was being clipped out of sight. */}
      {showList && (
        <div className="glass-panel mt-2 overflow-hidden rounded-2xl">
          {!ready ? (
            <p className="flex items-center gap-2 px-4 py-3.5 text-[12.5px] text-paper/60"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading 48,000 places…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3.5 text-[12.5px] leading-[1.5] text-paper/60">Nothing called “{query.trim()}”. Try a landmark like Rumi Darwaza, or a road like Shaheed Path.</p>
          ) : (
            <ul id={listId} role="listbox" className="max-h-[320px] overflow-y-auto p-1.5 no-scrollbar">
              {results.map((r, i) => {
                const [kind, Icon] = kindOf(r.category, r.name);
                return (
                  <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}
                    className={`group flex items-center gap-1 rounded-xl ${i === active ? 'bg-white/[0.08]' : ''}`}>
                    <button onClick={() => pick(r)} className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left">
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/[0.07]"><Icon className="h-4 w-4 text-[#e0a55a]" strokeWidth={1.7} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-paper">{r.name}</span>
                        <span className="block text-[11px] text-paper/45">{kind}</span>
                      </span>
                    </button>
                    {onSetDestinationWaypoint && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetDestinationWaypoint({ x: r.x, z: r.z, name: r.name }); setOpen(false); }}
                        title={`Route to ${r.name}`} aria-label={`Route to ${r.name}`}
                        className="mr-1.5 flex-shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-paper/55 opacity-0 transition-opacity hover:bg-white/10 hover:text-paper group-hover:opacity-100 focus:opacity-100"
                      >
                        Route
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
