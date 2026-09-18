import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, LockKeyhole } from 'lucide-react';

interface SecureNavbarProps {
  onUnauthorizedClick?: () => void;
}

export const SecureNavbar: React.FC<SecureNavbarProps> = ({ onUnauthorizedClick }) => {
  const navLinks = ['SECURITY', 'INVESTIGATION', 'EVIDENCE', 'VALIDATION'];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-20 px-3 py-4 sm:px-6 sm:py-6 w-full"
    >
      <div className="liquid-glass rounded-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between max-w-6xl mx-auto border border-white/10 shadow-2xl">
        {/* Left Side: Brand Logo */}
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-white/10 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white font-semibold tracking-wide text-xs sm:text-sm md:text-base font-sans">
                HEALTHSHIELD-X
              </span>
              <span className="text-[9px] sm:text-[10px] text-white/60 font-mono font-bold bg-white/10 px-1.5 py-0.5 rounded">
                2.0
              </span>
            </div>
          </div>

          {/* Nav Links (Desktop) */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={onUnauthorizedClick}
                className="text-white/60 hover:text-white transition-colors duration-300 text-xs font-medium tracking-widest uppercase cursor-pointer"
              >
                {link}
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: System Status & Security Pill */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold tracking-wider">SYSTEM OPERATIONAL</span>
          </div>

          <div className="glass-pill px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-medium text-white/90 border border-white/10 flex items-center gap-1.5">
            <LockKeyhole className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
            <span className="tracking-wide hidden xs:inline">AUTHORIZED</span>
            <span className="tracking-wide xs:hidden">AUTH</span>
          </div>
        </div>
      </div>
    </motion.nav>
  );
};
