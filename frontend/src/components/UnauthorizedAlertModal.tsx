import React from 'react';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';
import type { UnauthorizedErrorPayload } from '../lib/auth';

interface UnauthorizedAlertModalProps {
  isOpen: boolean;
  payload: UnauthorizedErrorPayload | null;
  onClose: () => void;
  onJumpToInvestigation: () => void;
}

export const UnauthorizedAlertModal: React.FC<UnauthorizedAlertModalProps> = ({
  isOpen,
  payload,
  onClose
}) => {
  if (!isOpen || !payload) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4">
      <div className="relative max-w-lg w-[95%] sm:w-full max-h-[90vh] overflow-y-auto bg-[#170c10] border-2 border-rose-600/70 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-rose-900/40 space-y-5 sm:space-y-6 text-center animate-in fade-in zoom-in-95 duration-200 font-sans">
        {/* Background Alarm Pulse Glow */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-rose-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-rose-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

        {/* Top Close Icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-full bg-slate-900/60 border border-rose-500/30 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Alert Shield Header */}
        <div className="mx-auto w-20 h-20 rounded-3xl bg-rose-600/20 border-2 border-rose-500 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-600/30 animate-bounce">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>CRITICAL SECURITY THREAT DETECTED</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight font-sans">
            UNAUTHORIZED ACCESS ATTEMPT DETECTED
          </h2>
          <p className="text-xs text-rose-200/80 max-w-md mx-auto font-sans">
            An unauthorized account attempted to breach the Healthcare Portal without valid cryptographic credentials. Access was immediately blocked.
          </p>
        </div>

        {/* Event Detail Matrix Box */}
        <div className="bg-[#0f090c]/90 border border-rose-500/40 rounded-2xl p-4 text-left font-mono text-xs space-y-2.5 shadow-inner">
          <div className="flex justify-between items-center pb-2 border-b border-rose-900/40">
            <span className="text-slate-400">Attempted Account:</span>
            <span className="text-rose-400 font-bold">{payload.account}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">System Status:</span>
            <span className="px-2 py-0.5 rounded bg-rose-600/30 text-rose-300 font-bold border border-rose-500/50">
              {payload.status}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Timestamp:</span>
            <span className="text-slate-200">{payload.timestamp}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Origin IP Source:</span>
            <span className="text-amber-400 font-bold">{payload.source}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-rose-900/40">
            <span className="text-slate-400">Audit Record:</span>
            <span className="text-emerald-400 font-bold">STRUCTURED EVENT LOGGED ✓</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-1">


          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs transition-colors cursor-pointer"
          >
            Acknowledge & Close Alert
          </button>
        </div>
      </div>
    </div>
  );
};
