import React from 'react';
import { motion } from 'motion/react';

export const SecurityStatus: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.6 }}
      className="flex items-center gap-2 mb-4"
    >
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/10 backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="text-white/70 text-[10px] md:text-[11px] font-mono font-medium tracking-[0.2em] uppercase">
          HEALTHCARE CYBERSECURITY // SECURE ENVIRONMENT ONLINE
        </span>
      </div>
    </motion.div>
  );
};
