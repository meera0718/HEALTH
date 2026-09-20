import React from 'react';
import { motion } from 'motion/react';
import { LockKeyhole, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';

export type GatewayState = 'LOCKED' | 'AUTHENTICATING' | 'AUTHORIZED';

interface AccessButtonProps {
  state: GatewayState;
  onClick: () => void;
}

export const AccessButton: React.FC<AccessButtonProps> = ({ state, onClick }) => {
  return (
    <motion.button
      onClick={onClick}
      disabled={state === 'AUTHENTICATING'}
      whileHover={state !== 'AUTHENTICATING' ? { scale: 1.03 } : undefined}
      whileTap={state !== 'AUTHENTICATING' ? { scale: 0.98 } : undefined}
      className={`liquid-glass rounded-full px-8 py-3.5 flex items-center justify-center gap-3 text-sm font-semibold tracking-wider transition-all duration-300 shadow-2xl border border-white/20 cursor-pointer ${
        state === 'AUTHORIZED'
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
          : state === 'AUTHENTICATING'
          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 cursor-wait'
          : 'text-white hover:border-white/40 hover:bg-white/[0.04]'
      }`}
    >
      {state === 'LOCKED' && (
        <>
          <LockKeyhole className="w-4 h-4 text-indigo-400" />
          <span>AUTHENTICATE & ENTER</span>
          <ArrowRight className="w-4 h-4 text-white/70" />
        </>
      )}

      {state === 'AUTHENTICATING' && (
        <>
          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
          <span className="font-mono text-xs tracking-widest uppercase">VERIFYING CREDENTIALS...</span>
        </>
      )}

      {state === 'AUTHORIZED' && (
        <>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-xs tracking-widest text-emerald-300">ACCESS GRANTED — ENTERING CONSOLE</span>
          <ArrowRight className="w-4 h-4 text-emerald-400" />
        </>
      )}
    </motion.button>
  );
};
