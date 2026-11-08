import React, { useState } from 'react';
import { AIAction, AIResponse, SelectedEntity } from '../../types';
import { Sparkles, ArrowRight, CornerDownRight, Newspaper, Loader, Navigation, ShieldCheck } from 'lucide-react';

interface AnalystPanelProps {
  onExecuteAction: (action: AIAction) => void;
  selectedEntity?: SelectedEntity | null;
  cameraCoordinates?: { lat: number; lon: number };
}

const PRESETS = [
  "What's happening around Charbagh?",
  "Is there any reported waterlogging around Gomti Nagar?",
  "Find a route to Lucknow Airport avoiding reported road closures.",
  "Which areas have higher flood susceptibility?",
  "Summarize today's verified city updates.",
  "Why is traffic bad in Hazratganj?",
];

export const AnalystPanel: React.FC<AnalystPanelProps> = ({
  onExecuteAction,
  selectedEntity,
  cameraCoordinates,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);

  const handleAsk = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setResponse(null);

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          context: {
            selectedEntity: selectedEntity?.name,
            selectedType: selectedEntity?.type,
            coordinates: cameraCoordinates,
          },
        }),
      });

      if (res.ok) {
        const data: AIResponse = await res.json();
        setResponse(data);
        if (data.action && data.action.type !== 'NONE') {
          onExecuteAction(data.action);
        }
      } else {
        setResponse({
          answer: "Sorry, I couldn't reach the city intelligence service. Please try again later.",
          sources: ["System Network Diagnostic"],
        });
      }
    } catch (e) {
      setResponse({
        answer: "Network error occurred when querying the AI City Analyst.",
        sources: ["Connection Timeout"],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(question);
  };

  return (
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/90 shadow-2xl border border-amber-500/30">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>ASK LUCKNOW LENS (SPATIAL AI ANALYST)</span>
        </h3>
        <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
          SIL CONNECTED
        </span>
      </div>

      {/* Preset Questions list */}
      <div className="space-y-1.5 mb-3">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
          SUGGESTED GEOSPATIAL QUERIES:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((q, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => {
                setQuestion(q);
                handleAsk(q);
              }}
              className="text-[10px] bg-slate-900/70 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl border border-slate-800 hover:border-amber-500/40 transition-colors text-left font-medium"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Question Form */}
      <form onSubmit={handleFormSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          disabled={loading}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about traffic, floods, waterlogging, routes, news..."
          className="flex-1 bg-slate-950/80 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 rounded-xl transition-all disabled:opacity-50 font-black text-xs flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20"
        >
          {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        </button>
      </form>

      {/* Response Display */}
      {response && (
        <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2 animate-in fade-in duration-200">
          <p className="text-xs text-slate-200 leading-relaxed">
            {response.answer}
          </p>

          {response.sources && response.sources.length > 0 && (
            <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500">
              <span className="font-bold uppercase tracking-wider text-slate-400">Sources:</span>
              {response.sources.map((src, i) => (
                <span key={i} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                  {src}
                </span>
              ))}
            </div>
          )}

          {response.action && response.action.type !== 'NONE' && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
              <CornerDownRight className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span>
                {response.action.type === 'CALCULATE_ROUTE'
                  ? `Triggered road route to ${response.action.destination?.name || 'Destination'}`
                  : `Navigated camera to ${response.action.layer || 'target'} layer`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
