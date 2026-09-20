import React, { useState, useEffect } from 'react';
import { Shield, Eye, AlertTriangle, Zap, Server, Database, Cpu, CheckCircle2, Play } from 'lucide-react';
import { api } from '../../api/client';
import type { DecoyAsset, DeceptionTriggerResult } from '../../types';

interface DeceptionCenterProps {
  onNavigateTab?: (tab: string) => void;
}

export const DeceptionCenter: React.FC<DeceptionCenterProps> = ({ onNavigateTab }) => {
  const [viewMode, setViewMode] = useState<'defender' | 'attacker'>('defender');
  const [decoys, setDecoys] = useState<DecoyAsset[]>([
    { id: 'DEC-PHARM-01', name: 'Fake Pharmacy Server', asset_type: 'Pharmacy Dispenser', department: 'Pharmacy', is_decoy: true, clinical_criticality: 'HIGH', risk_score: 98.5, status: 'ARMED', ip_address: '10.10.5.99', interaction_count: 0 },
    { id: 'DEC-PATIENT-DB', name: 'Synthetic Patient Database', asset_type: 'EHR Database', department: 'Records & Admin', is_decoy: true, clinical_criticality: 'CRITICAL', risk_score: 99.2, status: 'ARMED', ip_address: '10.10.5.150', interaction_count: 0 },
    { id: 'DEC-ADMIN-07', name: 'Fake Admin Workstation', asset_type: 'Admin Workstation', department: 'IT Operations', is_decoy: true, clinical_criticality: 'MEDIUM', risk_score: 85.0, status: 'ARMED', ip_address: '10.10.2.77', interaction_count: 0 },
    { id: 'DEC-PUMP-04', name: 'Decoy Infusion Pump', asset_type: 'Infusion Pump', department: 'ICU Ward 3B', is_decoy: true, clinical_criticality: 'HIGH', risk_score: 91.4, status: 'ARMED', ip_address: '10.10.3.99', interaction_count: 0 }
  ]);

  const [triggerAlert, setTriggerAlert] = useState<DeceptionTriggerResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState<string>('');

  useEffect(() => {
    async function loadDecoys() {
      try {
        const data = await api.getDecoys(viewMode);
        setDecoys(data);
      } catch (err) {
        console.warn('Using seed decoys fallback', err);
      }
    }
    loadDecoys();
  }, [viewMode]);

  const handleSimulateDecoyTrigger = async () => {
    setIsSimulating(true);
    setSimStep('1. Staff-PC-07 compromised via credential anomaly...');
    
    setTimeout(() => {
      setSimStep('2. Attacker performing lateral network scanning...');
    }, 1000);

    setTimeout(() => {
      setSimStep('3. Attacker targeting Pharmacy Network...');
    }, 2000);

    setTimeout(async () => {
      setSimStep('4. Attacker touched 🍯 Fake Pharmacy Server (10.10.5.99)!');
      try {
        const res = await api.triggerDecoy('DEC-PHARM-01', 'Staff-PC-07', 'HSX-042');
        setTriggerAlert(res);
        setDecoys((prev) =>
          prev.map((d) =>
            d.id === 'DEC-PHARM-01'
              ? { ...d, status: 'TRIGGERED', interaction_count: d.interaction_count + 1, last_interaction: res.timestamp }
              : d
          )
        );
      } catch (err) {
        console.error('Trigger API error:', err);
      } finally {
        setIsSimulating(false);
      }
    }, 3200);
  };

  return (
    <div className="min-h-full w-full p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-amber-500/30 rounded-xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            HOSPITAL ADAPTIVE DECEPTION CENTER 🍯
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">AI Deception & Honeypot Command</h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Isolated synthetic decoy layer. Zero real patient or hospital system exposure.
          </p>
        </div>

        {/* Defender vs Attacker View Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-[#161b22] p-1.5 rounded-lg border border-[#1e293b] w-full md:w-auto">
          <button
            onClick={() => setViewMode('defender')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-none ${
              viewMode === 'defender'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>🏥 DEFENDER VIEW</span>
          </button>
          <button
            onClick={() => setViewMode('attacker')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-none ${
              viewMode === 'attacker'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>👁️ ATTACKER VIEW</span>
          </button>
        </div>
      </div>

      {/* Trigger Simulation Controls */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs shadow-xl">
        <div className="space-y-1">
          <div className="text-slate-200 font-bold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>SIMULATE ATTACK & TEST DECEPTION TRAP</span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Executes simulated Staff-PC-07 lateral traversal into synthetic Pharmacy Network.
          </p>
          {isSimulating && (
            <div className="text-amber-400 font-bold animate-pulse pt-1">
              {simStep}
            </div>
          )}
        </div>

        <button
          onClick={handleSimulateDecoyTrigger}
          disabled={isSimulating}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold font-mono text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-900/30 uppercase disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          <span>▶ SIMULATE ATTACK (TRIGGER HONEYPOT)</span>
        </button>
      </div>

      {/* Decoy Trigger Alert Modal / Banner */}
      {triggerAlert && (
        <div className="bg-rose-950/80 border-2 border-rose-500 rounded-xl p-5 space-y-4 shadow-2xl animate-none">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-rose-800 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
              <div>
                <h2 className="font-bold text-rose-100 text-base tracking-wide font-mono">
                  {triggerAlert.alert_banner.title}
                </h2>
                <div className="text-xs text-rose-300 font-mono">
                  {triggerAlert.alert_banner.subtitle}
                </div>
              </div>
            </div>
            <span className="px-3 py-1 bg-rose-500 text-slate-950 font-bold font-mono text-xs rounded-full uppercase">
              {triggerAlert.alert_banner.confidence_badge}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="bg-[#111827]/90 p-3 rounded-lg border border-rose-800/60">
              <span className="text-slate-400 block text-[10px] uppercase">Real Critical Assets</span>
              <span className="text-emerald-400 font-bold text-sm">100% SAFE</span>
            </div>
            <div className="bg-[#111827]/90 p-3 rounded-lg border border-rose-800/60">
              <span className="text-slate-400 block text-[10px] uppercase">Decoy Asset Status</span>
              <span className="text-rose-400 font-bold text-sm">TRIGGERED (INTERCEPTED)</span>
            </div>
            <div className="bg-[#111827]/90 p-3 rounded-lg border border-rose-800/60">
              <span className="text-slate-400 block text-[10px] uppercase">Attack Diverted</span>
              <span className="text-cyan-400 font-bold text-sm">YES (INCIDENT HSX-042)</span>
            </div>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <span className="text-slate-300 font-bold block">Evidence Signatures Captured:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 text-[11px]">
              {triggerAlert.evidence_signatures.map((sig, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[#161b22] px-3 py-1.5 rounded border border-rose-900/50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{sig}</span>
                </div>
              ))}
            </div>
          </div>

          {onNavigateTab && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => onNavigateTab('investigation')}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold uppercase cursor-pointer"
              >
                OPEN INCIDENT INVESTIGATION →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid of Decoy Assets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between font-mono text-xs">
          <h2 className="font-bold text-slate-200 uppercase tracking-wider">
            SYNTHETIC HOSPITAL DECOY ASSETS ({decoys.length})
          </h2>
          <span className="text-slate-400 text-[11px]">
            {viewMode === 'defender' ? '🏥 DEFENDER VIEW: Honeypot badges visible' : '👁️ ATTACKER VIEW: Disguised as standard assets'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {decoys.map((decoy) => (
            <div
              key={decoy.id}
              className={`bg-[#111827] border rounded-xl p-4 space-y-3 shadow-xl transition-none ${
                decoy.status === 'TRIGGERED'
                  ? 'border-rose-500/80 bg-rose-950/20'
                  : decoy.is_decoy
                  ? 'border-amber-500/40 hover:border-amber-500/70'
                  : 'border-[#1e293b]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-[#161b22] text-amber-400 border border-[#1e293b]">
                  {decoy.asset_type.includes('Database') ? (
                    <Database className="w-5 h-5" />
                  ) : decoy.asset_type.includes('Dispenser') || decoy.asset_type.includes('Pharmacy') ? (
                    <Server className="w-5 h-5" />
                  ) : (
                    <Cpu className="w-5 h-5" />
                  )}
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  {decoy.is_decoy && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                      🍯 DECOY
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded font-bold uppercase ${
                      decoy.status === 'TRIGGERED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {decoy.status}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-100 text-sm">{decoy.name}</h3>
                <div className="font-mono text-xs text-slate-400 font-semibold">{decoy.id}</div>
              </div>

              <div className="space-y-1.5 font-mono text-xs border-t border-[#1e293b] pt-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Department:</span>
                  <span className="font-semibold text-slate-200">{decoy.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IP Address:</span>
                  <span className="text-cyan-400 font-semibold">{decoy.ip_address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Criticality:</span>
                  <span className="text-rose-400 font-bold">{decoy.clinical_criticality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Interactions:</span>
                  <span className="text-amber-400 font-bold">{decoy.interaction_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Adaptive Deception Deployment Recommendation */}
      <div className="bg-[#111827] border border-cyan-500/30 rounded-xl p-5 space-y-4 font-mono text-xs shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold">🧠 ADAPTIVE AI DECEPTION ENGINE</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
            CONFIDENCE: 94%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-slate-500 block uppercase">Current Attacker Behavior</span>
            <div className="p-3 bg-[#161b22] rounded-lg border border-[#1e293b] text-slate-200">
              Lateral movement targeting Pharmacy Infrastructure (Server-02 → Pharmacy Subnet)
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-slate-500 block uppercase">Recommended Deception Deployment</span>
            <div className="p-3 bg-[#161b22] rounded-lg border border-[#1e293b] text-amber-300 font-bold">
              Deploy 🍯 Fake Pharmacy Server (DEC-PHARM-01) on 10.10.5.99
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-[11px] leading-relaxed">
          Reasoning: Attacker path predicts lateral traversal into Pharmacy infrastructure. Deploying Fake Pharmacy Server intercepts access before reaching real medication dispenser. Zero operational risk.
        </p>
      </div>
    </div>
  );
};
