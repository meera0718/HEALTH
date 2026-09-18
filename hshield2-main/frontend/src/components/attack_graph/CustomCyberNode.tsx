import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { ShieldAlert, Monitor, Server, Database, HardDrive, AlertTriangle } from 'lucide-react';
import type { AttackNodeData } from '../../types';

const nodeIcons: Record<string, any> = {
  Attacker: ShieldAlert,
  Workstation: Monitor,
  API: Server,
  Database: Database,
  FileStore: HardDrive,
};

export const CustomCyberNode: React.FC<{ data: AttackNodeData }> = ({ data }) => {
  const Icon = nodeIcons[data.node_type] || Monitor;

  const riskColors = {
    normal: 'border-[#1e293b] text-slate-300 bg-[#111827]',
    suspicious: 'border-amber-500/50 text-amber-300 bg-amber-500/10 shadow-amber-500/10',
    compromised: 'border-rose-500/60 text-rose-300 bg-rose-500/10 shadow-rose-500/10',
    verified: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10',
  };

  return (
    <div className={`px-4 py-3 rounded-xl border-2 shadow-lg min-w-[180px] ${riskColors[data.risk_state]} transition-all hover:scale-105`}>
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900" />
      
      <div className="flex items-center gap-2.5 mb-2">
        <div className="p-1.5 rounded-md bg-[#161b22] border border-[#1e293b]">
          <Icon className="w-4 h-4 text-indigo-400" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-100">{data.label}</h4>
          <span className="text-[10px] font-mono text-slate-400 block">{data.ip}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#1e293b]/60 text-[10px] font-mono">
        <span className="text-slate-400">Events: {data.evidence_count}</span>
        <span className="uppercase font-bold tracking-wider">{data.risk_state}</span>
      </div>

      {data.missing_evidence && (
        <div className="mt-2 pt-1.5 border-t border-rose-500/30 text-[10px] text-rose-400 flex items-center gap-1 font-sans">
          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
          <span className="truncate">Missing: {data.missing_evidence}</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-indigo-500 border-2 border-slate-900" />
    </div>
  );
};
