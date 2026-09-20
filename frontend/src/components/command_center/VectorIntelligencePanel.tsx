import React from 'react';
import { Crosshair, ChevronRight, Eye, ShieldAlert, Cpu, Layers } from 'lucide-react';

interface VectorIntelligencePanelProps {
  selectedEventId: string | null;
  selectedPatientId: string | null;
  vectorData: any | null;
  similarityData: any | null;
  loading: boolean;
  onOpenDrawer: () => void;
  onSelectEvent?: (evtId: string, pid: string) => void;
  onSelectPatient?: (pid: string) => void;
}

const SHORT_DIM_NAMES = [
  'D1: failed_login_rate',
  'D2: request_rate',
  'D3: total_records_accessed',
  'D4: unique_endpoints',
  'D5: endpoint_discovery_count',
  'D6: suspicious_download_count',
  'D7: data_export_count',
  'D8: privilege_escalation_count',
  'D9: device_change_count',
  'D10: night_activity_count',
  'D11: error_rate',
  'D12: anomalous_event_count',
  'D13: unique_sessions',
  'D14: unique_devices',
  'D15: average_response_time_ms'
];

export const VectorIntelligencePanel: React.FC<VectorIntelligencePanelProps> = ({
  selectedEventId,
  selectedPatientId,
  vectorData,
  similarityData,
  loading,
  onOpenDrawer,
  onSelectEvent,
  onSelectPatient
}) => {
  const embedding: number[] = vectorData?.embedding_vector || similarityData?.embedding_vector || [];
  const nearestAttacks = similarityData?.nearest_attacks || [];
  const currentScenario = similarityData?.query_scenario || vectorData?.scenario || 'SECURITY_EVENT';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 flex flex-col justify-between shadow-xl">
      <div className="space-y-4">
        
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Crosshair className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Vector Intelligence</h3>
              <p className="text-[11px] text-slate-400 font-mono">15-D L2 Unit Normalized Behavioral Engine</p>
            </div>
          </div>

          <button
            onClick={onOpenDrawer}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center space-x-1 transition-colors"
          >
            <span>FULL 15-D MATRIX</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Current Focus Event Summary */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Target Security Event:</span>
            <span className="text-cyan-400 font-bold">{selectedEventId || 'EVT-SIM-LIVE'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Patient & Scenario:</span>
            <span className="text-white font-bold">
              {selectedPatientId || 'P001'} • <span className="text-amber-400">{currentScenario}</span>
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-900">
            <span className="text-slate-400">Embedding Store:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Layers className="w-3 h-3" /> 15-D L2 Normalized
            </span>
          </div>
        </div>

        {/* 15-D Behavioral Vector Visualizer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              15-D Behavioral Vector Breakdown
            </span>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold">L2 UNIT ||v||₂ = 1.0</span>
          </div>

          {loading ? (
            <div className="p-6 text-center text-slate-500 text-xs font-mono">
              Fetching 15-D behavioral embedding...
            </div>
          ) : embedding.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
              Select a security event to inspect its 15-D behavioral vector.
            </div>
          ) : (
            <div className="space-y-1.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800 max-h-48 overflow-y-auto font-mono text-[11px]">
              {embedding.map((val, idx) => {
                const dimLabel = SHORT_DIM_NAMES[idx] || `D${idx + 1}`;
                const barWidthPct = Math.min(100, Math.max(2, val * 100));
                
                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 truncate max-w-[190px]">{dimLabel}</span>
                      <span className="text-emerald-400 font-bold">{val.toFixed(4)}</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Raw Vector Array Display */}
          {embedding.length > 0 && (
            <div className="p-2.5 bg-slate-950 rounded-lg text-[10px] font-mono text-slate-400 break-all leading-snug border border-slate-900">
              <span className="text-slate-500 block text-[9px] uppercase font-bold">Raw 15-D Vector Array:</span>
              [{embedding.map(v => v.toFixed(3)).join(', ')}]
            </div>
          )}
        </div>

        {/* Nearest Historical Attack Matches */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
              Nearest Historical Attacks
            </span>
            <span className="text-[10px] font-mono text-cyan-400">{nearestAttacks.length} Neighbors</span>
          </div>

          {nearestAttacks.length === 0 ? (
            <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 text-center font-mono">
              No sufficiently similar historical attacks found.
            </div>
          ) : (
            <div className="space-y-2">
              {nearestAttacks.slice(0, 3).map((match: any) => {
                const matchPct = match.similarity_percent ?? (match.similarity_score * 100).toFixed(1);
                
                return (
                  <div
                    key={match.event_id}
                    onClick={() => onSelectEvent?.(match.event_id, match.patient_id)}
                    className="p-2.5 bg-slate-950/90 hover:bg-slate-800/50 border border-slate-800/80 hover:border-cyan-500/40 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-all group"
                  >
                    <div className="space-y-0.5 font-mono">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-cyan-400 group-hover:text-cyan-300">{match.event_id}</span>
                        <span className="text-[10px] text-slate-400">Patient {match.patient_id}</span>
                      </div>
                      <div className="text-[11px] text-amber-300 font-sans">
                        {match.scenario || match.event_type}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold block">
                        {matchPct}%
                      </span>
                      <span className="text-[9px] text-slate-500 uppercase">Similarity</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Footer Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-3">
        <button
          onClick={onOpenDrawer}
          className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
        >
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span>VIEW VECTOR</span>
        </button>

        <button
          onClick={() => selectedPatientId && onSelectPatient?.(selectedPatientId)}
          className="py-2 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          <span>VIEW PATIENT</span>
        </button>
      </div>
    </div>
  );
};
