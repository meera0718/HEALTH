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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="w-full shrink-0 py-2 sm:py-2.5 px-4 relative z-10 flex items-center justify-center select-none"
    >
      {/* Compact Horizontal Status Row */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3 gap-y-1 text-[10px] sm:text-[11px] font-mono text-white/50 tracking-wider">
        {telemetryItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={item.label}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${item.color}`} />
                <span className="text-white/40">{item.label}</span>
                <span className="font-semibold text-white/80">{item.status}</span>
              </span>
              {idx < telemetryItems.length - 1 && (
                <span className="text-white/20 select-none">·</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
};
