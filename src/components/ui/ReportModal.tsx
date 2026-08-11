import React from 'react';
import { OSMMapData, RenderStats } from '../../types';
import { X, Cpu, Layers, MapPin, Zap, ShieldCheck } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  mapData: OSMMapData;
  renderStats: RenderStats;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, mapData, renderStats }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Real Lucknow GIS Overture Maps Evaluation</h2>
            <p className="text-xs text-slate-400">Parsed from public/overture/ • Hazratganj Lucknow Bounding Box</p>
          </div>
        </div>

        {/* Quick Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Overture Buildings</div>
            <div className="text-lg font-bold text-amber-400">{mapData.stats.buildingsCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Overture Roads</div>
            <div className="text-lg font-bold text-sky-400">{mapData.stats.roadsCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Water & Parks</div>
            <div className="text-lg font-bold text-emerald-400">{mapData.stats.waterwaysCount + mapData.stats.greenAreasCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Frame Rate</div>
            <div className="text-lg font-bold text-indigo-400">{renderStats.fps} FPS</div>
          </div>
        </div>

        {/* Technical Explanations */}
        <div className="space-y-6 text-sm leading-relaxed text-slate-300">
          {/* Section 1 */}
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-amber-400" /> 1. Real OpenStreetMap Parsing & Projection
            </h3>
            <p className="text-xs text-slate-300 mb-2">
              The application reads directly from <code className="text-amber-300">public/map.osm</code> using an XML DOM parser and projects real geographic coordinates into local 3D Cartesian space:
            </p>
            <ul className="list-disc list-inside text-xs space-y-1 text-slate-400 pl-2">
              <li>
                <strong className="text-slate-200">Origin / Center:</strong> Latitude {mapData.bounds.centerLat.toFixed(5)}°, Longitude {mapData.bounds.centerLon.toFixed(5)}° (Central Lucknow).
              </li>
              <li>
                <strong className="text-slate-200">Dataset Extent:</strong> ~{mapData.stats.widthMeters}m wide × ~{mapData.stats.heightMeters}m high.
              </li>
              <li>
                <strong className="text-slate-200">Projection Formulas:</strong> Latitude/Longitude converted to X/Z meters using spherical equirectangular meter scaling based on center latitude.
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-sky-400" /> 2. Real Footprint Extrusion & Highway Network
            </h3>
            <p className="text-xs text-slate-300 mb-2">
              Every building geometry is created directly from its actual OpenStreetMap polygon footprint:
            </p>
            <ul className="list-disc list-inside text-xs space-y-1 text-slate-400 pl-2">
              <li>
                <strong className="text-slate-200">Actual Footprints:</strong> Polygons extracted from OSM way nodes and extruded with clean architectural white materials.
              </li>
              <li>
                <strong className="text-slate-200">Road Hierarchy:</strong> Primary/Trunk highways rendered in wide dark slate, secondary & residential roads in slate grey.
              </li>
              <li>
                <strong className="text-slate-200">Gomti River Waterway:</strong> Rendered with real riverbank polygons and blue water shader materials.
              </li>
            </ul>
          </div>

          {/* Section 3 */}
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-emerald-400" /> 3. Performance & Framing
            </h3>
            <p className="text-xs text-slate-300 mb-2">
              The camera automatically calculates bounding dimensions to fit the full dataset seamlessly. Press <strong className="text-amber-300">[FRAME CITY]</strong> at any time to reset focus.
            </p>
          </div>
        </div>

        {/* Footer Close */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            Close & Explore Real Map
          </button>
        </div>
      </div>
    </div>
  );
};
