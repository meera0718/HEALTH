import React from 'react';
import { X, Server, AlertTriangle, ShieldCheck, FileText } from 'lucide-react';
import type { AttackNodeData } from '../../types';

interface NodeDetailDrawerProps {
  selectedNode: AttackNodeData | null;
  onClose: () => void;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  selectedNode,
  onClose
}) => {
  if (!selectedNode) return null;

  return (
    <div className="w-80 bg-[#111827] border-l border-[#1e293b] p-5 flex flex-col justify-between h-full overflow-y-auto animate-in slide-in-from-right duration-200">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-slate-100 text-xs tracking-wide uppercase">Node Inspection</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Node Properties */}
        <div className="space-y-3 font-mono text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Identifier</span>
            <span className="text-slate-100 font-bold text-sm">{selectedNode.label}</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Type & IP</span>
            <span className="text-indigo-400">{selectedNode.node_type}</span> · <span className="text-slate-300">{selectedNode.ip}</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Forensic Risk State</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block mt-0.5 ${
              selectedNode.risk_state === 'compromised' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
              selectedNode.risk_state === 'suspicious' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}>
              {selectedNode.risk_state}
            </span>
          </div>
        </div>

        {/* Telemetry Availability */}
        <div className="p-3 rounded-lg bg-[#161b22] border border-[#1e293b] space-y-2">
          <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-indigo-400" /> Evidence Audit
          </h4>
          
          <div className="flex justify-between text-xs text-slate-300">
            <span>Supporting Events:</span>
            <span className="font-mono font-bold text-indigo-400">{selectedNode.evidence_count} verified</span>
          </div>

          {selectedNode.missing_evidence ? (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Evidence Visibility Gap</span>
                <span>Missing: {selectedNode.missing_evidence}. Local host process telemetry unavailable.</span>
              </div>
            </div>
          ) : (
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>All required telemetry domains verified for this node.</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-[#1e293b] text-[11px] text-slate-500 font-mono">
        HealthShield-X 2.0 · Attack Reconstruction Node # {selectedNode.id}
      </div>
    </div>
  );
};
