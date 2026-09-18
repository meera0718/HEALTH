import React from 'react';
import { X, Calculator, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { FECResult } from '../../types';

interface ScoreExplainModalProps {
  isOpen: boolean;
  onClose: () => void;
  fecData: FECResult | null;
}

export const ScoreExplainModal: React.FC<ScoreExplainModalProps> = ({
  isOpen,
  onClose,
  fecData
}) => {
  if (!isOpen || !fecData) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-[#1e293b] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1e293b] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-slate-100 text-sm">FEC Score Calculation & Deterministic Proof</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-xs text-slate-300 max-h-[80vh] overflow-y-auto">
          {/* Formula Box */}
          <div className="p-4 rounded-xl bg-[#0b0f19] border border-indigo-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-indigo-400 font-semibold text-xs">FEC MATHEMATICAL FORMULA</span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono">
                100% DETERMINISTIC (NO AI)
              </span>
            </div>
            <div className="font-mono text-slate-200 bg-[#161b22] p-3 rounded-lg border border-[#1e293b] text-center text-xs">
              FEC = ( Σ (Weight_i × Available_i) / Σ (RequiredWeight_i) ) × 100
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Each required evidence domain is assigned a deterministic weight based on its critical contribution to forensic reconstruction.
            </p>
          </div>

          {/* Breakdown Table */}
          <div>
            <h4 className="font-semibold text-slate-200 mb-2.5">Evidence Domain Weighting & Status Breakdown</h4>
            <div className="border border-[#1e293b] rounded-lg overflow-hidden font-mono text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#161b22] text-slate-400 text-[11px] border-b border-[#1e293b]">
                  <tr>
                    <th className="p-2.5">Domain</th>
                    <th className="p-2.5">Weight</th>
                    <th className="p-2.5">Required</th>
                    <th className="p-2.5">Available</th>
                    <th className="p-2.5 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {Object.entries(fecData.domain_status).map(([domain, status]) => (
                    <tr key={domain} className={!status.available ? 'bg-rose-500/5' : ''}>
                      <td className="p-2.5 font-semibold text-slate-200">{domain}</td>
                      <td className="p-2.5 text-slate-400">{(status.weight * 100).toFixed(0)}%</td>
                      <td className="p-2.5 text-slate-300">✓ Yes</td>
                      <td className="p-2.5">
                        {status.available ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Available
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Missing Gap
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right font-bold">
                        {status.available ? `${(status.weight * 100).toFixed(0)}%` : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Current Score Summary */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#1e293b] flex items-center justify-between">
            <div>
              <span className="text-slate-400 text-xs">Calculated Baseline FEC:</span>
              <div className="text-xl font-bold font-mono text-amber-400">{fecData.overall_fec}%</div>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              Missing Endpoint Domain Weight: <span className="text-rose-400 font-bold font-mono">28.0%</span>
              <br />
              Total Available Sum: <span className="text-slate-200 font-bold font-mono">72.0%</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#161b22] border-t border-[#1e293b] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
          >
            Close Proof
          </button>
        </div>
      </div>
    </div>
  );
};
