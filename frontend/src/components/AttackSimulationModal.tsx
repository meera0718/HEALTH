import React, { useState, useEffect } from 'react';
import { Zap, CheckCircle2, X, Activity, ArrowRight, Database, Server } from 'lucide-react';
import type { AttackSimulationStep } from '../types';

interface AttackSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulationComplete: () => void;
}

export const AttackSimulationModal: React.FC<AttackSimulationModalProps> = ({
  isOpen,
  onClose,
  onSimulationComplete
}) => {
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  const phases: AttackSimulationStep[] = [
    { phase: 1, title: 'MONITORING HOSPITAL NETWORK...', status: 'RUNNING', timestamp: '10:42:30', details: 'Scanning 247 monitored medical IoT nodes, workstations, and microservice APIs.' },
    { phase: 2, title: 'ABNORMAL BEHAVIOR DETECTED', status: 'WARNING', timestamp: '10:42:31', details: 'Unusual login pattern and privilege escalation registered on ADMIN-PC-07.' },
    { phase: 3, title: 'AI ANALYSIS IN PROGRESS...', status: 'ANALYZING', timestamp: '10:42:33', details: 'HealthShield AI correlation engine analyzing packet signatures & baseline deviation.' },
    { phase: 4, title: 'ANOMALY SCORE: 94% (CRITICAL)', status: 'CRITICAL', timestamp: '10:42:35', details: 'High-risk anomaly threshold exceeded. Lateral movement pattern confirmed.' },
    { phase: 5, title: 'LATERAL MOVEMENT SUSPECTED', status: 'ALERT', timestamp: '10:42:37', details: 'ADMIN-PC-07 → Hospital Core Network → EHR-SERVER-01 connection attempt.' },
    { phase: 6, title: 'EHR INFRASTRUCTURE AT RISK', status: 'THREAT', timestamp: '10:42:38', details: 'Target: PostgreSQL Patient Database storing sensitive EHR records.' },
    { phase: 7, title: 'AUTOMATED RESPONSE INITIATED', status: 'RESPONDING', timestamp: '10:42:40', details: 'Dispatched automated network quarantine protocol to core switch gateway.' },
    { phase: 8, title: 'ADMIN-PC-07 ISOLATED', status: 'ISOLATED', timestamp: '10:42:42', details: 'Device port blocked. Outbound network traffic severed successfully.' },
    { phase: 9, title: 'FORENSIC EVIDENCE PRESERVED', status: 'COMPLETE', timestamp: '10:42:45', details: '5 forensic audit artifacts hashed and immutably locked in evidence ledger.' }
  ];

  useEffect(() => {
    if (isOpen) {
      setCurrentPhase(1);
      setIsFinished(false);

      const interval = setInterval(() => {
        setCurrentPhase((prev) => {
          if (prev < 9) {
            return prev + 1;
          } else {
            clearInterval(interval);
            setIsFinished(true);
            onSimulationComplete();
            return 9;
          }
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStep = phases.find((p) => p.phase === currentPhase) || phases[0];
  const progressPercent = Math.round((currentPhase / 9) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4">
      <div className="relative max-w-2xl w-[95%] sm:w-full max-h-[90vh] overflow-y-auto bg-[#0d1117] border-2 border-cyan-500/60 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl space-y-5 sm:space-y-6 font-mono text-xs">
        {/* Alarm Glow background */}
        <div className={`absolute -top-32 -left-32 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-500 ${
          isFinished ? 'bg-emerald-500/20' : currentPhase >= 4 ? 'bg-rose-600/20 animate-pulse' : 'bg-cyan-500/20'
        }`} />

        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800/80 border border-slate-700 cursor-pointer"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-2 pt-2 sm:pt-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 font-bold uppercase tracking-wider text-[10px] sm:text-[11px]">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
            <span>CYBER ATTACK SIMULATION ENGINE</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-extrabold text-white font-sans tracking-tight">
            {isFinished ? 'THREAT CONTAINED SUCCESSFULLY' : `SIMULATING PHASE 0${currentPhase}: ${currentStep.title}`}
          </h2>
          <p className="text-slate-300 font-sans text-xs max-w-lg mx-auto">
            Simulating live hospital network breach, autonomous AI risk scoring, lateral movement tracking, and automated device isolation.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">SIMULATION PROGRESS</span>
            <span className="text-cyan-400 font-bold">{progressPercent}% COMPLETE</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isFinished ? 'bg-emerald-400' : currentPhase >= 4 ? 'bg-rose-500' : 'bg-cyan-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Network Lateral Movement Attack Graph Diagram */}
        <div className="bg-[#161b22] border border-[#1e293b] rounded-2xl p-3 sm:p-4 space-y-3 shadow-inner">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center sm:text-left">
            ATTACK VECTOR & LATERAL MOVEMENT VISUALIZATION
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-2 py-2 font-sans text-xs">
            {/* Node 1: ADMIN-PC-07 */}
            <div className={`w-full sm:w-auto p-2.5 sm:p-3 rounded-xl border text-center space-y-1 transition-all ${
              currentPhase >= 2
                ? currentPhase >= 8
                  ? 'bg-rose-950/40 border-rose-500 text-rose-300 shadow-lg shadow-rose-900/40'
                  : 'bg-amber-950/40 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}>
              <Server className="w-5 h-5 sm:w-6 sm:h-6 mx-auto text-amber-400" />
              <div className="font-mono font-bold text-[11px]">ADMIN-PC-07</div>
              <div className="text-[9px] font-mono">
                {currentPhase >= 8 ? 'STATUS: ISOLATED' : currentPhase >= 2 ? 'ATTACK SOURCE' : 'SECURE'}
              </div>
            </div>

            <ArrowRight className={`w-5 h-5 rotate-90 sm:rotate-0 transition-colors ${currentPhase >= 5 ? 'text-rose-500 animate-pulse' : 'text-slate-600'}`} />

            {/* Node 2: Hospital Network */}
            <div className={`w-full sm:w-auto p-2.5 sm:p-3 rounded-xl border text-center space-y-1 transition-all ${
              currentPhase >= 5 ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300' : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}>
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 mx-auto text-cyan-400" />
              <div className="font-mono font-bold text-[11px]">CORE NETWORK</div>
              <div className="text-[9px] font-mono">VLAN TRAVERSAL</div>
            </div>

            <ArrowRight className={`w-5 h-5 rotate-90 sm:rotate-0 transition-colors ${currentPhase >= 6 ? 'text-rose-500 animate-pulse' : 'text-slate-600'}`} />

            {/* Node 3: EHR Server */}
            <div className={`w-full sm:w-auto p-2.5 sm:p-3 rounded-xl border text-center space-y-1 transition-all ${
              currentPhase >= 6 ? 'bg-rose-950/40 border-rose-500 text-rose-300' : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}>
              <Database className="w-5 h-5 sm:w-6 sm:h-6 mx-auto text-rose-400" />
              <div className="font-mono font-bold text-[11px]">EHR-SERVER-01</div>
              <div className="text-[9px] font-mono">{currentPhase >= 8 ? 'PROTECTED' : 'TARGET'}</div>
            </div>
          </div>
        </div>

        {/* Current Active Phase Box */}
        <div className={`p-4 rounded-xl border space-y-2 transition-all ${
          isFinished
            ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-300'
            : 'bg-[#161b22] border-cyan-500/40 text-slate-200'
        }`}>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400">Timestamp: {currentStep.timestamp}</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40">
              {currentStep.status}
            </span>
          </div>
          <div className="text-sm font-bold text-white font-sans">{currentStep.title}</div>
          <p className="text-xs text-slate-300 font-sans">{currentStep.details}</p>
        </div>

        {/* Completion Action */}
        {isFinished && (
          <div className="space-y-3 pt-2 text-center animate-in fade-in zoom-in-95">
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold font-sans text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>HEALTHSHIELD-X RESPONSE SUCCESSFUL · ALL THREATS CONTAINED</span>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg shadow-cyan-500/40"
            >
              <span>RETURN TO SECURITY COMMAND CENTER →</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
