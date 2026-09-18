import React, { useState } from 'react';
import { 
  Sparkles, CheckCircle2, AlertTriangle, ArrowRight, 
  ChevronDown, ChevronUp, BookOpen
} from 'lucide-react';
import type { AIRecommendation } from '../types';

interface DefenseArchitectProps {
  aiData: AIRecommendation | null;
  onRunReplayNav: () => void;
}

export const DefenseArchitect: React.FC<DefenseArchitectProps> = ({
  aiData,
  onRunReplayNav
}) => {
  const [isNistOpen, setIsNistOpen] = useState(true);
  const [isExplanationOpen, setIsExplanationOpen] = useState(true);

  if (!aiData) return <div className="p-6 text-slate-400">Synthesizing AI defense recommendation...</div>;

  const ctrl = aiData.recommended_control;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-mono text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-indigo-400" /> AI DEFENSE ARCHITECT
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">DEFENSIVE CONTROL RECOMMENDATION ENGINE</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Generates targeted defensive control recommendations constrained by the deterministic evidence gap engine. AI never invents metrics.
          </p>
        </div>

        <button
          onClick={onRunReplayNav}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:scale-105"
        >
          <span>Validate Control via Replay</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Evidence Gap Alert Card */}
      <div className="p-5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-bold text-rose-300 text-sm">EVIDENCE GAP DETECTED: Endpoint Telemetry Unavailable</h3>
          <p className="text-xs text-slate-300">
            Host process execution and parent-child command logs are absent for Workstation-14. As a result, Execution (61%) and Lateral Movement (48%) stages lack forensic auditability.
          </p>
        </div>
      </div>

      {/* Main Grid: Control Card & NIST Mapping */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recommended Control Card (2 Columns) */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1e293b] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
            <div>
              <span className="text-[10px] font-mono text-indigo-400 uppercase font-bold tracking-wider">RECOMMENDED CONTROL</span>
              <h2 className="text-lg font-bold text-slate-100 mt-0.5">{ctrl.name}</h2>
            </div>
            <span className="px-3 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold">
              PRIORITY: {aiData.priority}
            </span>
          </div>

          {/* Rationale & Expected Visibility Gains */}
          <div className="space-y-4 text-xs text-slate-300">
            <div>
              <h4 className="font-semibold text-slate-200 mb-1">Control Description</h4>
              <p className="text-slate-400 leading-relaxed">{ctrl.description}</p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-200 mb-2">Expected Forensic Visibility Gains</h4>
              <div className="space-y-2">
                {aiData.expected_visibility_gains.map((gain, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center gap-2.5 font-mono text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{gain}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Collapsible "Why This Recommendation?" Explanation */}
          <div className="border border-[#1e293b] rounded-xl overflow-hidden bg-[#161b22]">
            <button
              onClick={() => setIsExplanationOpen(!isExplanationOpen)}
              className="w-full p-4 flex items-center justify-between text-left text-xs font-bold text-slate-200 hover:bg-[#1a2332]"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Why this recommendation? (AI Rationale)
              </span>
              {isExplanationOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {isExplanationOpen && (
              <div className="p-4 border-t border-[#1e293b] text-xs text-slate-300 leading-relaxed font-sans bg-[#111827]">
                {aiData.why_this_recommendation}
              </div>
            )}
          </div>
        </div>

        {/* NIST CSF 2.0 Mapping & Quick Actions (1 Column) */}
        <div className="space-y-6">
          {/* NIST CSF Collapsible Card */}
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <h3 className="font-bold text-slate-100 text-sm font-sans flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" /> NIST CSF 2.0 MAPPING
              </h3>
              <button onClick={() => setIsNistOpen(!isNistOpen)} className="text-slate-400 hover:text-slate-200">
                {isNistOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {isNistOpen && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Framework</span>
                  <span className="text-slate-200 font-bold">{aiData.nist_mapping.framework}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Core Function</span>
                  <span className="text-indigo-400 font-bold">{aiData.nist_mapping.function}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Category</span>
                  <span className="text-slate-300">{aiData.nist_mapping.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Control Reference</span>
                  <span className="text-emerald-400 font-bold">{aiData.nist_mapping.control}</span>
                </div>
              </div>
            )}
          </div>

          {/* Call-to-action box */}
          <div className="bg-[#111827] border border-indigo-500/30 rounded-xl p-5 space-y-3 text-center">
            <h4 className="font-bold text-slate-100 text-sm">Ready to retarget the attack?</h4>
            <p className="text-xs text-slate-400">
              Execute controlled attack replay under Endpoint Monitoring to measure FEC improvement.
            </p>
            <button
              onClick={onRunReplayNav}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
            >
              RUN CONTROLLED REPLAY →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
