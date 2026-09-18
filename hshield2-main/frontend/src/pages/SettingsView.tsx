import React, { useState } from 'react';
import { Settings, Shield, Zap, RefreshCw, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

interface SettingsViewProps {
  onSimulateAttack: () => void;
  onResetDemo: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onSimulateAttack,
  onResetDemo
}) => {
  const [monitoring, setMonitoring] = useState(true);
  const [aiDetection, setAiDetection] = useState(true);
  const [autoResponse, setAutoResponse] = useState(true);
  const [evidencePreservation, setEvidencePreservation] = useState(true);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(null), 3000);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto font-sans">
      {/* Top Banner */}
      <div className="bg-[#111827]/90 border border-[#1e293b] rounded-xl p-6 shadow-2xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold uppercase">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span>PLATFORM CONFIGURATION & DEMO CONTROLS</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-1">SETTINGS & DEMO CONTROLS</h1>
          <p className="text-xs text-slate-300 mt-1">
            Manage autonomous SOC engine parameters, real-time threat response toggles, and trigger live attack simulations.
          </p>
        </div>
      </div>

      {notificationMsg && (
        <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/50 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Section 1: Security Monitoring Toggles */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6 space-y-4 shadow-2xl font-mono">
        <h3 className="font-bold text-slate-100 font-sans flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" /> SECURITY MONITORING & ENGINE CONFIGURATION
        </h3>

        <div className="space-y-3 pt-2">
          {/* Toggle 1 */}
          <div className="flex items-center justify-between p-3 bg-[#161b22] border border-[#1e293b] rounded-lg">
            <div>
              <div className="text-xs font-bold text-white font-sans">Continuous Telemetry Monitoring</div>
              <div className="text-[11px] text-slate-400">Real-time packet inspection and medical IoT health checks</div>
            </div>
            <button
              onClick={() => { setMonitoring(!monitoring); showNotification('Telemetry Monitoring updated'); }}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                monitoring ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {monitoring ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Toggle 2 */}
          <div className="flex items-center justify-between p-3 bg-[#161b22] border border-[#1e293b] rounded-lg">
            <div>
              <div className="text-xs font-bold text-white font-sans">AI Behavioral Anomaly Detection</div>
              <div className="text-[11px] text-slate-400">Autonomous machine learning risk scoring engine</div>
            </div>
            <button
              onClick={() => { setAiDetection(!aiDetection); showNotification('AI Anomaly Detection updated'); }}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                aiDetection ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {aiDetection ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Toggle 3 */}
          <div className="flex items-center justify-between p-3 bg-[#161b22] border border-[#1e293b] rounded-lg">
            <div>
              <div className="text-xs font-bold text-white font-sans">Automated Containment Response</div>
              <div className="text-[11px] text-slate-400">Automatic device isolation upon &ge;90% risk score threshold</div>
            </div>
            <button
              onClick={() => { setAutoResponse(!autoResponse); showNotification('Automated Response updated'); }}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                autoResponse ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {autoResponse ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Toggle 4 */}
          <div className="flex items-center justify-between p-3 bg-[#161b22] border border-[#1e293b] rounded-lg">
            <div>
              <div className="text-xs font-bold text-white font-sans">Cryptographic Evidence Preservation</div>
              <div className="text-[11px] text-slate-400">Immutable hashing & forensic artifact logging</div>
            </div>
            <button
              onClick={() => { setEvidencePreservation(!evidencePreservation); showNotification('Evidence Preservation updated'); }}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                evidencePreservation ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {evidencePreservation ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Interactive Demo Controls */}
      <div className="bg-[#111827] border border-cyan-500/40 rounded-xl p-6 space-y-4 shadow-2xl font-mono">
        <h3 className="font-bold text-cyan-400 font-sans flex items-center gap-2">
          <Zap className="w-4 h-4 text-cyan-400" /> INTERACTIVE DEMO CONTROLS
        </h3>
        <p className="text-xs text-slate-300 font-sans">
          Simulate live cyber attack scenarios across the hospital network to demonstrate automated containment and evidence preservation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => {
              onSimulateAttack();
              showNotification('⚡ SIMULATED ATTACK LAUNCHED');
            }}
            className="p-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>⚡ SIMULATE CYBER ATTACK</span>
          </button>

          <button
            onClick={() => {
              onSimulateAttack();
              showNotification('ANOMALY DETECTED ON ADMIN-PC-07');
            }}
            className="p-4 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Zap className="w-4 h-4" />
            <span>GENERATE BEHAVIORAL ANOMALY</span>
          </button>

          <button
            onClick={() => {
              onResetDemo();
              showNotification('DEMO ENVIRONMENT RESET TO BASELINE SECURE STATE');
            }}
            className="p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESET DEMO ENVIRONMENT</span>
          </button>

          <button
            onClick={() => {
              showNotification('ALL ACTIVE ALERTS CLEARED');
            }}
            className="p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>CLEAR ALERTS & NOTIFICATIONS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
