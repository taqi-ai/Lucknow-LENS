import React, { useState, useEffect, useRef } from 'react';
import { SearchResult, OSMMapData } from '../../types';
import { SearchIndex } from '../../search/SearchIndex';
import {
  Search,
  MapPin,
  Hospital,
  Utensils,
  Hotel,
  ShoppingBag,
  Landmark,
  Navigation,
  Plane,
  TreePine,
  Building2,
  X,
  Compass,
} from 'lucide-react';

interface SearchUIProps {
  mapData: OSMMapData;
  onSelectResult: (result: SearchResult) => void;
  onSetDestinationWaypoint?: (dest: { x: number; z: number; name: string }) => void;
  isNavigationMode?: boolean;
  onToggleNavigationMode?: (active: boolean) => void;
}

const getCategoryIcon = (category: string) => {
  const cat = category.toLowerCase();
  if (cat.includes('hospital') || cat.includes('medical') || cat.includes('health')) return <Hospital className="w-4 h-4 text-emerald-400" />;
  if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe') || cat.includes('bakery')) return <Utensils className="w-4 h-4 text-orange-400" />;
  if (cat.includes('hotel') || cat.includes('lodging') || cat.includes('resort')) return <Hotel className="w-4 h-4 text-indigo-400" />;
  if (cat.includes('shopping') || cat.includes('mall') || cat.includes('store') || cat.includes('retail')) return <ShoppingBag className="w-4 h-4 text-amber-400" />;
  if (cat.includes('landmark') || cat.includes('historic') || cat.includes('monument') || cat.includes('museum')) return <Landmark className="w-4 h-4 text-yellow-400" />;
  if (cat.includes('station') || cat.includes('bus') || cat.includes('railway') || cat.includes('train')) return <Navigation className="w-4 h-4 text-sky-400" />;
  if (cat.includes('airport') || cat.includes('flight')) return <Plane className="w-4 h-4 text-cyan-400" />;
  if (cat.includes('park') || cat.includes('green') || cat.includes('garden') || cat.includes('forest')) return <TreePine className="w-4 h-4 text-green-400" />;
  if (cat.includes('government') || cat.includes('political') || cat.includes('office') || cat.includes('university') || cat.includes('school')) return <Building2 className="w-4 h-4 text-rose-400" />;
  return <MapPin className="w-4 h-4 text-slate-400" />;
};

export const SearchUI: React.FC<SearchUIProps> = ({
  mapData,
  onSelectResult,
  onSetDestinationWaypoint,
  isNavigationMode = false,
  onToggleNavigationMode,
}) => {
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
    <div className="relative w-full z-30 space-y-2" ref={dropdownRef}>
      {/* Dual Mode Switch: [ EXPLORE ] and [ NAVIGATE ] */}
      {onToggleNavigationMode && (
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 border border-slate-700/60 backdrop-blur-xl rounded-2xl shadow-xl">
          <button
            onClick={() => onToggleNavigationMode(false)}
            className={`py-1.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
              !isNavigationMode
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>EXPLORE</span>
          </button>

          <button
            onClick={() => onToggleNavigationMode(true)}
            className={`py-1.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
              isNavigationMode
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>NAVIGATE</span>
          </button>
        </div>
      )}

      {/* Search Input Box */}
      {!isNavigationMode && (
        <div className="flex items-center gap-2.5 bg-slate-900/80 border border-slate-700/60 backdrop-blur-xl rounded-2xl p-2.5 shadow-2xl transition-all duration-300 focus-within:border-amber-500/50 focus-within:shadow-[0_0_20px_rgba(245,158,11,0.15)]">
          <Search className="w-4 h-4 text-slate-400 ml-1 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search Lucknow landmarks, roads, places..."
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
      )}

      {/* Autocomplete Dropdown List */}
      {!isNavigationMode && showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-slate-700/80 backdrop-blur-2xl rounded-2xl shadow-2xl max-h-72 overflow-y-auto p-1.5 space-y-1">
          {results.slice(0, 10).map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item)}
              className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/80 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-slate-800 group-hover:bg-slate-700 text-slate-300">
                  {getCategoryIcon(item.category)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                    {item.name}
                  </h4>
                  <span className="text-[10px] text-slate-400 capitalize">
                    {item.category}
                  </span>
                </div>
              </div>

              {onSetDestinationWaypoint && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDestinationWaypoint({ x: item.x, z: item.z, name: item.name });
                    handleClear();
                  }}
                  className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/40 text-purple-300 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 flex-shrink-0 ml-2"
                  title="Navigate here"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Route</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
