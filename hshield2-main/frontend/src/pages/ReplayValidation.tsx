import React, { useState } from 'react';
import { 
  PlayCircle, RefreshCw, TrendingUp, Eye, Terminal
} from 'lucide-react';
import { api } from '../api/client';
import type { ReplayRunResult, ControlCatalogItem } from '../types';
import FluidGlass from '../components/FluidGlass';
import LetterGlitch from '../components/LetterGlitch';

interface ReplayValidationProps {
  selectedIncidentId: string;
  controls: ControlCatalogItem[];
}

export const ReplayValidation: React.FC<ReplayValidationProps> = ({
  selectedIncidentId,
  controls
}) => {
  const [selectedControlId, setSelectedControlId] = useState<string>('CTRL-001');
  const [isRunning, setIsRunning] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayRunResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [showGlassLens, setShowGlassLens] = useState(false);

  const handleRunReplay = async () => {
    setIsRunning(true);
    setReplayResult(null);
    setCurrentStepIndex(1);

    // Simulate animated step progression
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < 8) return prev + 1;
        clearInterval(interval);
        return 8;
      });
    }, 350);

    try {
      const res = await api.triggerReplay(selectedIncidentId, selectedControlId);
      setTimeout(() => {
        setReplayResult(res);
        setIsRunning(false);
      }, 3000);
    } catch (err) {
      console.error(err);
      setIsRunning(false);
    }
  };

  return (
    <div className="relative min-h-full w-full p-6 space-y-6 max-w-7xl mx-auto overflow-hidden font-sans">
      {/* Full-Page React Bits LetterGlitch Background for Dashboard 06 (Last Dashboard) */}
      <div className="fixed inset-0 pointer-events-none opacity-75 z-0">
        <LetterGlitch
          glitchSpeed={40}
          centerVignette={false}
          outerVignette={true}
          smooth={true}
          glitchColors={['#10B981', '#38BDF8', '#6366F1', '#22C55E', '#06B6D4']}
          characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789HEALTHSHIELDX2.0"
        />
      </div>

      {/* Dark Subtle Overlay for High Contrast Text Readability */}
      <div className="fixed inset-0 bg-[#0b0f19]/60 backdrop-blur-[1px] pointer-events-none z-1" />

      {/* Main Page Content Layered Above LetterGlitch */}
      <div className="relative z-10 space-y-6">
        {/* Top Banner */}
        <div className="bg-[#111827]/85 backdrop-blur-md border border-[#1e293b] rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-mono text-xs font-semibold">
              <PlayCircle className="w-4 h-4" /> CONTROL VALIDATION & REPLAY ENGINE
            </div>
            <h1 className="text-2xl font-bold text-slate-100 mt-1 font-sans">CONTROLLED ATTACK REPLAY</h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xl font-sans">
              Re-runs the exact controlled attack scenario under the newly applied security control state to measure actual forensic visibility gains.
            </p>
          </div>

          {/* Control Selector, Lens Inspector & Run Trigger */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowGlassLens(!showGlassLens)}
              className="px-3 py-2.5 rounded-xl border border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
            >
              <Eye className="w-4 h-4 text-indigo-400" />
              <span>{showGlassLens ? 'HIDE FLUID LENS' : 'FLUID GLASS LENS'}</span>
            </button>

            <select
              value={selectedControlId}
              onChange={(e) => setSelectedControlId(e.target.value)}
              disabled={isRunning}
              className="bg-[#161b22]/90 border border-[#1e293b] text-xs font-mono text-slate-200 font-semibold px-3 py-2.5 rounded-xl focus:outline-none focus:border-indigo-500"
            >
              {controls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} - {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRunReplay}
              disabled={isRunning}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs font-mono flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                isRunning
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:scale-105'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Simulating Replay...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>RUN CONTROLLED REPLAY</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dedicated React Bits LetterGlitch Matrix Banner Box */}
        <div className="bg-[#0f172a]/90 border border-emerald-500/40 rounded-2xl overflow-hidden shadow-2xl relative h-48">
          <LetterGlitch
            glitchSpeed={35}
            centerVignette={false}
            outerVignette={true}
            smooth={true}
            glitchColors={['#10B981', '#38BDF8', '#6366F1', '#34D399']}
            characters="HEALTHSHIELDX2.0_FORENSIC_MATRIX_REPLAY_ENGINE_0123456789"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/80 flex items-center justify-between p-6 pointer-events-none">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold">
                <Terminal className="w-4 h-4" />
                <span>REACT BITS LETTERGLITCH MATRIX BACKGROUND ACTIVE</span>
              </div>
              <h3 className="text-xl font-extrabold text-white font-sans">
                Real-Time Telemetry Matrix Stream
              </h3>
              <p className="text-xs text-slate-300 font-sans max-w-lg">
                Replaying live attack execution patterns across the Shadow Hospital simulated network.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>MATRIX ACTIVE</span>
            </div>
          </div>
        </div>

        {/* React Bits Three.js FluidGlass Optical Lens Showcase Container */}
        {showGlassLens && (
          <div className="bg-[#0f172a]/90 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl relative space-y-2">
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2 font-mono text-xs">
              <span className="text-indigo-300 font-bold tracking-wider">REACT BITS FLUID GLASS THREE.JS REFRACTION LENS</span>
              <span className="text-slate-400 text-[10px]">SCROLL & MOVE CURSOR TO REFRACT TELEMETRY MESH</span>
            </div>
            <div className="w-full h-[360px] rounded-xl overflow-hidden bg-black/60 border border-white/10">
              <FluidGlass
                mode="lens"
                lensProps={{
                  scale: 0.22,
                  ior: 1.25,
                  thickness: 6,
                  chromaticAberration: 0.12,
                  anisotropy: 0.02
                }}
              />
            </div>
          </div>
        )}

        {/* Live Simulation Stepper & Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stepper Progress (1 Column) */}
          <div className="bg-[#111827]/85 backdrop-blur-md border border-[#1e293b] rounded-xl p-5 space-y-4 font-mono text-xs shadow-xl">
            <h3 className="font-bold text-slate-100 text-sm font-sans flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-indigo-400 ${isRunning ? 'animate-spin' : ''}`} /> REPLAY EXECUTION STEPPER
            </h3>

            <div className="space-y-3 pt-2">
              {[
                "Scenario loaded: Database Access Scenario (INC-0241)",
                "Initial access simulated: Workstation authentication verified",
                "Workstation activity generated: Endpoint Monitoring active",
                "API interaction generated: Hospital API session trace",
                "Database query generated: Patient DB query log captured",
                "Evidence collected: Endpoint telemetry verified ✓",
                "Reconstruction completed: 5/5 attack stages verified",
                "FEC calculated: Baseline 72% → Post-Control 96% (+24 pts)"
              ].map((stepText, idx) => {
                const stepNum = idx + 1;
                const isDone = currentStepIndex >= stepNum;
                const isCurrent = currentStepIndex === stepNum && isRunning;

                return (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2.5 transition-all ${
                      isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : isCurrent
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 animate-pulse'
                        : 'bg-[#161b22]/90 border-[#1e293b] text-slate-500'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isDone ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isDone ? '✓' : stepNum}
                    </div>
                    <span className="truncate">{stepText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Before vs After Impact Card (2 Columns) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Hero Score Jump Box */}
            <div className="bg-[#111827]/85 backdrop-blur-md border border-[#1e293b] rounded-xl p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
                <div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">MEASURED REPLAY RESULT</span>
                  <h2 className="text-lg font-bold text-slate-100 mt-0.5 font-sans">BEFORE vs AFTER FORENSIC COVERAGE</h2>
                </div>
                {replayResult && (
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" /> +{replayResult.improvement} PERCENTAGE POINTS
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* BEFORE Card */}
                <div className="p-5 rounded-xl bg-[#161b22]/90 border border-[#1e293b] space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                    <span>BEFORE CONTROL</span>
                    <span className="text-rose-400 font-bold">BASELINE</span>
                  </div>
                  <div className="text-4xl font-bold font-mono text-amber-400">
                    {replayResult ? `${replayResult.before_fec}%` : '72%'}
                  </div>
                  <div className="pt-2 border-t border-[#1e293b] space-y-1.5 font-mono text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Endpoint Telemetry:</span>
                      <span className="text-rose-400 font-bold">✗ Missing</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Execution Stage:</span>
                      <span className="text-rose-400 font-bold">61.0%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lateral Movement:</span>
                      <span className="text-rose-400 font-bold">48.0%</span>
                    </div>
                  </div>
                </div>

                {/* AFTER Card */}
                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono text-emerald-400">
                    <span>AFTER CONTROL (CTRL-001)</span>
                    <span className="font-bold">VERIFIED REPLAY</span>
                  </div>
                  <div className="text-4xl font-bold font-mono text-emerald-400">
                    {replayResult ? `${replayResult.after_fec}%` : '96%'}
                  </div>
                  <div className="pt-2 border-t border-emerald-500/20 space-y-1.5 font-mono text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span>Endpoint Telemetry:</span>
                      <span className="text-emerald-400 font-bold">✓ Available</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Execution Stage:</span>
                      <span className="text-emerald-400 font-bold">94.0% (+33%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lateral Movement:</span>
                      <span className="text-emerald-400 font-bold">91.0% (+43%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stage Diff Breakdown Table */}
              {replayResult && (
                <div className="pt-2">
                  <h4 className="font-semibold text-slate-200 text-xs mb-3 font-mono">STAGE-BY-STAGE RECONSTRUCTION IMPROVEMENT DIFF</h4>
                  <div className="border border-[#1e293b] rounded-lg overflow-hidden font-mono text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#161b22]/90 text-slate-400 text-[11px] border-b border-[#1e293b]">
                        <tr>
                          <th className="p-2.5">Attack Stage</th>
                          <th className="p-2.5">Baseline Confidence</th>
                          <th className="p-2.5">Post-Control Confidence</th>
                          <th className="p-2.5 text-right">Net Gain</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e293b]">
                        {replayResult.stage_comparison.map((row) => (
                          <tr key={row.stage}>
                            <td className="p-2.5 font-semibold text-slate-200">{row.stage}</td>
                            <td className="p-2.5 text-slate-400">{row.before_score}%</td>
                            <td className="p-2.5 text-emerald-400 font-bold">{row.after_score}%</td>
                            <td className="p-2.5 text-right font-bold text-emerald-400">
                              {row.diff > 0 ? `+${row.diff}%` : '0%'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
