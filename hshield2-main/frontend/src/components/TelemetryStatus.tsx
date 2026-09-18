import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Activity, Database, PlayCircle } from 'lucide-react';

export const TelemetryStatus: React.FC = () => {
  const telemetryItems = [
    { label: 'AUTH', status: 'ONLINE', icon: ShieldCheck, color: 'text-emerald-400' },
    { label: 'AUDIT', status: 'ACTIVE', icon: Activity, color: 'text-emerald-400' },
    { label: 'REPLAY', status: 'READY', icon: PlayCircle, color: 'text-indigo-400' },
    { label: 'DATABASE', status: 'CONNECTED', icon: Database, color: 'text-emerald-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.7 }}
      className="w-full pb-6 px-6 relative z-10 flex flex-col items-center gap-3 select-none"
    >
      {/* Telemetry Signal Pills */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {telemetryItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="glass-pill px-3.5 py-1 flex items-center gap-2 border border-white/10 text-[11px] font-mono text-white/70 backdrop-blur-md"
            >
              <Icon className={`w-3.5 h-3.5 ${item.color}`} />
              <span className="text-white/40">{item.label}</span>
              <span className="font-semibold text-white/90">{item.status}</span>
            </div>
          );
        })}
      </div>

      {/* Bottom Status Bar */}
      <div className="text-[10px] font-mono text-white/30 tracking-[0.25em] uppercase text-center font-medium">
        HEALTHSHIELD-X 2.0 &nbsp;|&nbsp; SECURE INVESTIGATION ENVIRONMENT &nbsp;|&nbsp; CONTROLLED ACCESS
      </div>
    </motion.div>
  );
};
