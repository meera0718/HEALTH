import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

interface SecureNavbarProps {
  onUnauthorizedClick?: () => void;
}

export const SecureNavbar: React.FC<SecureNavbarProps> = () => {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-20 px-3 py-2 sm:px-6 sm:py-3 w-full shrink-0"
    >
      <div className="liquid-glass rounded-full px-4 sm:px-6 py-2 flex items-center justify-between max-w-6xl mx-auto border border-white/10 shadow-2xl">
        {/* Left Side: Brand Logo */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-white/10 text-white flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white font-semibold tracking-wide text-xs sm:text-sm font-sans">
              HEALTHSHIELD-X
            </span>
            <span className="text-[9px] sm:text-[10px] text-white/60 font-mono font-bold bg-white/10 px-1.5 py-0.5 rounded">
              2.0
            </span>
          </div>
        </div>

        {/* Right Side: System Operational Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold tracking-wider">SYSTEM OPERATIONAL</span>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};
