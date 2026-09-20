import React from 'react';
import { X, Crosshair, ShieldAlert, Cpu, CheckCircle2, Layers } from 'lucide-react';

interface VectorDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEventId: string | null;
  selectedPatientId: string | null;
  vectorData: any | null;
  similarityData: any | null;
  loading: boolean;
}

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  failed_login_rate: 'Failed Authentication Attempt Frequency',
  request_rate: 'API Call Velocity per Minute',
  total_records_accessed: 'Cumulative Patient Medical Records Accessed',
  unique_endpoints: 'Distinct API Endpoint Diversity Index',
  endpoint_discovery_count: 'Reconnaissance & Enumeration Signal',
  suspicious_download_count: 'Bulk File Download Anomaly Indicator',
  data_export_count: 'Exfiltration & Export Operation Count',
  privilege_escalation_count: 'Administrative Privilege Escalation Attempts',
  device_change_count: 'Device Fingerprint Switching Count',
  night_activity_count: 'Off-Hours / Night Shift Operation Flag',
  error_rate: 'HTTP Error & 4xx/5xx Failure Ratio',
  anomalous_event_count: 'Baseline Anomaly Deviation Flag',
  unique_sessions: 'Concurrent Active Session Count',
  unique_devices: 'Associated Physical MedIoT Devices',
  average_response_time_ms: 'Mean Endpoint Response Latency'
};

export const VectorDrawerModal: React.FC<VectorDrawerModalProps> = ({
  isOpen,
  onClose,
  selectedEventId,
  selectedPatientId,
  vectorData,
  similarityData,
  loading
}) => {
  if (!isOpen) return null;

  const embedding: number[] = vectorData?.embedding_vector || similarityData?.embedding_vector || [];
  const featureCols: string[] = vectorData?.feature_columns || [
    'failed_login_rate', 'request_rate', 'total_records_accessed', 'unique_endpoints',
    'endpoint_discovery_count', 'suspicious_download_count', 'data_export_count',
    'privilege_escalation_count', 'device_change_count', 'night_activity_count',
    'error_rate', 'anomalous_event_count', 'unique_sessions', 'unique_devices',
    'average_response_time_ms'
  ];
  const rawFeatures = vectorData?.raw_features || {};

  // Compute exact L2 norm for proof
  const l2Norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  const nearestAttacks = similarityData?.nearest_attacks || [];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex justify-end transition-all">
      <div className="bg-[#090d16] border-l border-slate-800 w-full max-w-3xl h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Crosshair className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  BEHAVIORAL VECTOR ENGINE
                </span>
                <span className="text-xs text-slate-400 font-mono">15-DIMENSIONAL SPACE</span>
              </div>
              <h2 className="text-xl font-bold font-mono text-white mt-1">
                Vector Embedding Inspector
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono">Computing 15-D Behavioral Embedding...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Event Metadata Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Event ID</span>
                <span className="font-mono font-bold text-cyan-400">{selectedEventId || 'N/A'}</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Patient Focus</span>
                <span className="font-mono font-bold text-white">{selectedPatientId || 'N/A'}</span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Normalization</span>
                <span className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> L2 UNIT NORM
                </span>
              </div>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">Computed Magnitude ||v||₂</span>
                <span className="font-mono font-bold text-cyan-300">{l2Norm.toFixed(6)}</span>
              </div>
            </div>

            {/* Raw JSON Array View */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400 font-semibold uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" /> 15-D L2 Normalized Floating Point Vector
                </span>
                <span className="text-[10px] font-mono text-emerald-400">15 Values</span>
              </div>
              <div className="p-3 bg-[#05080f] rounded-lg text-xs font-mono text-cyan-300 break-all leading-relaxed border border-slate-900">
                [{embedding.map((val) => val.toFixed(6)).join(', ')}]
              </div>
            </div>

            {/* Detailed 15-Dimension Feature Breakdown Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                15-Dimension Feature Matrix Breakdown
              </h3>

              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-[10px] uppercase font-mono text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Dim</th>
                      <th className="p-3">Feature Metric</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Raw Value</th>
                      <th className="p-3 text-right">Normalized Unit (x_i / ||x||₂)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {featureCols.map((col, idx) => {
                      const unitVal = embedding[idx] !== undefined ? embedding[idx] : 0;
                      const rawVal = rawFeatures[col] !== undefined ? rawFeatures[col] : 'N/A';
                      const pct = Math.min(100, Math.max(0, unitVal * 100));

                      return (
                        <tr key={col} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-bold text-cyan-400">D{idx + 1}</td>
                          <td className="p-3 text-white font-semibold">{col}</td>
                          <td className="p-3 text-slate-400 text-[10px] font-sans">
                            {FEATURE_DESCRIPTIONS[col] || col}
                          </td>
                          <td className="p-3 text-right text-slate-300">{typeof rawVal === 'number' ? rawVal.toFixed(2) : rawVal}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <span className="text-emerald-400 font-bold">{unitVal.toFixed(6)}</span>
                              <div className="w-16 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                <div
                                  className="bg-emerald-400 h-full rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Nearest Attack Neighbors */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                Nearest Historical Attack Neighbors (Cosine Similarity Search)
              </h3>

              {nearestAttacks.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-xs text-center">
                  No historical attack neighbors returned.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {nearestAttacks.map((match: any) => (
                    <div key={match.event_id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-cyan-400">{match.event_id}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          {match.similarity_percent ?? (match.similarity_score * 100).toFixed(1)}% Match
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Patient: <strong className="text-slate-200">{match.patient_id}</strong></span>
                        <span className="font-mono text-amber-400">{match.scenario || match.event_type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
