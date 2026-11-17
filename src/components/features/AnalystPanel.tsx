import React, { useState } from 'react';
import { AIAction, AIResponse } from '../../types';
import { Sparkles, ArrowRight, CornerDownRight, Newspaper, Loader, Navigation } from 'lucide-react';

interface AnalystPanelProps {
  onExecuteAction: (action: AIAction) => void;
}

const PRESETS = [
  "Why is traffic bad in Hazratganj?",
  "What's the AQI around Gomti Nagar?",
  "Which flights are currently over Lucknow?",
  "What's happening around Charbagh?"
];

export const AnalystPanel: React.FC<AnalystPanelProps> = ({ onExecuteAction }) => {
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
        body: JSON.stringify({ question: text })
      });

      if (res.ok) {
        const data: AIResponse = await res.json();
        setResponse(data);
      } else {
        setResponse({
          answer: "Sorry, I couldn't reach the city intelligence service. Please try again later.",
          sources: ["System Network Diagnostic"]
        });
      }
    } catch (e) {
      setResponse({
        answer: "Network error occurred when querying the AI City Analyst.",
        sources: ["Connection Timeout"]
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
    <div className="glass-panel rounded-2xl p-4 w-full transition-all hover:bg-slate-900/80">
      {/* Title */}
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-400 mb-3.5 flex items-center gap-1.5 border-b border-slate-800 pb-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>ASK LUCKNOW LENS (AI CITY ANALYST)</span>
      </h3>

      {/* Preset Questions list */}
      <div className="space-y-1.5 mb-3.5">
        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
          SUGGESTED QUERIES:
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
              className="text-[10px] bg-slate-800/40 hover:bg-slate-800 text-slate-300 px-2.5 py-1 rounded-xl border border-slate-700/30 transition-colors text-left font-medium"
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
          placeholder="Ask about traffic, AQI, news, flights..."
          className="flex-1 bg-slate-900/70 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/50"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-amber-500 flex items-center justify-center flex-shrink-0"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
        </button>
      </form>

      {/* Answer & Response Box */}
      {response && (
        <div className="mt-4 bg-slate-950/40 border border-slate-800/50 rounded-xl p-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Answer text */}
          <p className="text-slate-200 leading-relaxed font-sans mb-3 text-[11px]">
            {response.answer}
          </p>

          {/* Sources and Action */}
          <div className="flex flex-col gap-2 pt-2.5 border-t border-slate-800/50">
            {/* Sources list */}
            {response.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Newspaper className="w-3 h-3 text-slate-500 flex-shrink-0" />
                <span className="text-[9px] text-slate-500 font-extrabold uppercase mr-1">Sources:</span>
                {response.sources.map((src, i) => (
                  <span
                    key={i}
                    className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/30 truncate max-w-[150px]"
                    title={src}
                  >
                    {src}
                  </span>
                ))}
              </div>
            )}

            {/* Map Action Button */}
            {response.action && response.action.type !== 'NONE' && (
              <button
                onClick={() => response.action && onExecuteAction(response.action)}
                className="mt-1 flex items-center justify-center gap-1.5 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-2 rounded-xl border border-indigo-500 text-[10px] uppercase tracking-wider transition-all shadow-md shadow-indigo-600/20"
              >
                <Navigation className="w-3.5 h-3.5 rotate-45" />
                <span>VIEW ON MAP</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
