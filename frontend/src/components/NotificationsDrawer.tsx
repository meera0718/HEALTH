import React from 'react';
import { X, Bell, ShieldAlert, CheckCircle2, FileCheck, Info } from 'lucide-react';
import type { SOCNotification } from '../types';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: SOCNotification[];
  onClearNotifications: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onClearNotifications
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-end">
      <div className="w-full sm:max-w-md bg-[#0d1117] border-l border-[#1e293b] h-full p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-2xl flex flex-col font-sans animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4 font-mono">
          <div className="flex items-center gap-2 text-white font-bold">
            <Bell className="w-5 h-5 text-cyan-400" />
            <span>SECURITY NOTIFICATIONS ({notifications.length})</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/80 border border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto space-y-3 font-mono text-xs">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No active security notifications.
            </div>
          ) : (
            notifications.map((notif) => {
              const isCritical = notif.type === 'CRITICAL';
              const isResponse = notif.type === 'AUTOMATED_RESPONSE';
              const isForensic = notif.type === 'FORENSIC_EVENT';

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl border space-y-1 shadow-md ${
                    isCritical
                      ? 'bg-rose-950/20 border-rose-500/50 text-rose-200'
                      : isResponse
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                      : isForensic
                      ? 'bg-sky-950/20 border-sky-500/40 text-sky-200'
                      : 'bg-[#161b22] border-[#1e293b] text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="flex items-center gap-1.5 uppercase">
                      {isCritical && <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
                      {isResponse && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {isForensic && <FileCheck className="w-3.5 h-3.5 text-sky-400" />}
                      {!isCritical && !isResponse && !isForensic && <Info className="w-3.5 h-3.5 text-cyan-400" />}
                      {notif.type}
                    </span>
                    <span className="text-slate-400">{notif.timestamp}</span>
                  </div>

                  <div className="font-bold text-sm font-sans text-white">{notif.title}</div>
                  <p className="text-xs text-slate-300 font-sans">{notif.description}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Clear Notifications Footer */}
        {notifications.length > 0 && (
          <button
            onClick={onClearNotifications}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono text-xs cursor-pointer transition-colors"
          >
            Clear All Notifications
          </button>
        )}
      </div>
    </div>
  );
};
