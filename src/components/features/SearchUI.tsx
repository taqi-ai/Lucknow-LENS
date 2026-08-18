import React, { useState, useEffect, useRef } from 'react';
import { SearchResult, OSMMapData } from '../../types';
import { SearchIndex } from '../../search/SearchIndex';
import { Search, MapPin, Hospital, Utensils, Hotel, ShoppingBag, Landmark, Navigation, Plane, TreePine, Building2, X } from 'lucide-react';

interface SearchUIProps {
  mapData: OSMMapData;
  onSelectResult: (result: SearchResult) => void;
}

const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase();
  if (cat.includes('hospital') || cat.includes('medical') || cat.includes('health')) return <Hospital className="w-4 h-4 text-emerald-400" />;
  if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe') || cat.includes('bakery')) return <Utensils className="w-4 h-4 text-orange-400" />;
  if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('resort')) return <Hotel className="w-4 h-4 text-indigo-400" />;
  if (cat.includes('shopping') || cat.includes('mall') || cat.includes('store') || cat.includes('retail')) return <ShoppingBag className="w-4 h-4 text-amber-400" />;
  if (cat.includes('landmark') || cat.includes('historic') || cat.includes('monument') || cat.includes('museum')) return <Landmark className="w-4 h-4 text-yellow-400" />;
  if (cat.includes('station') || cat.includes('bus') || cat.includes('railway') || cat.includes('train')) return <Navigation className="w-4 h-4 text-sky-400" rotate={45} />;
  if (cat.includes('airport') || cat.includes('flight')) return <Plane className="w-4 h-4 text-cyan-400" />;
  if (cat.includes('park') || cat.includes('green') || cat.includes('garden') || cat.includes('forest')) return <TreePine className="w-4 h-4 text-green-400" />;
  if (cat.includes('government') || cat.includes('political') || cat.includes('office') || cat.includes('university') || cat.includes('school')) return <Building2 className="w-4 h-4 text-rose-400" />;
  return <MapPin className="w-4 h-4 text-slate-400" />;
};

export const SearchUI: React.FC<SearchUIProps> = ({ mapData, onSelectResult }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchIndexRef = useRef<SearchIndex | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize SearchIndex
  useEffect(() => {
    const index = new SearchIndex();
    index.initialize();
    searchIndexRef.current = index;
  }, []);

  // Handle Search Input Change
  useEffect(() => {
    if (!searchIndexRef.current || !query.trim()) {
      setResults([]);
      return;
    }
    const found = searchIndexRef.current.search(query, mapData);
    setResults(found);
  }, [query, mapData]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: SearchResult) => {
    onSelectResult(result);
    setQuery(result.name);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  return (
    <div className="relative w-full z-30" ref={dropdownRef}>
      {/* Search Input Box */}
      <div className="flex items-center gap-2.5 bg-slate-900/80 border border-slate-700/60 backdrop-blur-xl rounded-2xl p-2.5 shadow-2xl transition-all duration-300 focus-within:border-amber-500/50 focus-within:shadow-[0_0_20px_rgba(245,158,11,0.15)]">
        <Search className="w-4 h-4 text-slate-400 ml-1 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search Lucknow..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="w-full bg-transparent border-none outline-none text-white text-xs font-medium placeholder-slate-500"
        />
        {query && (
          <button
            onClick={handleClear}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown List */}
      {showDropdown && results.length > 0 && (
        <div className="absolute top-[105%] left-0 w-full bg-slate-900/95 border border-slate-700/60 backdrop-blur-2xl rounded-2xl shadow-3xl overflow-hidden mt-1 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-1.5 space-y-0.5">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-800/80 transition-all duration-200 group"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-700 transition-colors">
                  {getCategoryIcon(result.category)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {result.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/30">
                      {result.category}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      Lat {result.latitude.toFixed(4)}° • Lon {result.longitude.toFixed(4)}°
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
