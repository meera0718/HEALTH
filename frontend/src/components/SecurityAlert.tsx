import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface SecurityAlertProps {
  isOpen: boolean;
  referenceId: string;
  onClose: () => void;
}

export const SecurityAlert: React.FC<SecurityAlertProps> = ({
  isOpen,
  referenceId,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#0b0f19] border border-rose-500/40 rounded-2xl w-[95%] sm:w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
          <div className="flex items-center gap-2.5 text-rose-400 font-mono text-xs font-bold tracking-wider">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>UNAUTHORIZED ACCESS DENIED</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <p className="leading-relaxed">
            Unauthorized entry attempt detected. This event has been recorded in the security audit system.
          </p>
          <div className="p-3 rounded-lg bg-[#111827] border border-[#1e293b] font-mono text-[11px] space-y-1">
            <div className="text-slate-400">AUDIT REFERENCE NUMBER:</div>
            <div className="text-rose-400 font-bold text-sm tracking-wider">{referenceId}</div>
            <div className="text-slate-500 text-[10px] mt-1">TIMESTAMP: {new Date().toISOString()}</div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs font-mono tracking-wider transition-colors border border-slate-700"
          >
            RETURN TO SECURE GATEWAY
          </button>
        </div>
      </div>
    </div>
  );
};
