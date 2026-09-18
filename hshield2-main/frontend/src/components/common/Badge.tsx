import React from 'react';

interface BadgeProps {
  text: string;
  variant?: 'high' | 'medium' | 'low' | 'investigating' | 'resolved' | 'gap' | 'verified' | 'missing';
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'low' }) => {
  const styles: Record<string, string> = {
    high: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-slate-800 text-slate-300 border-slate-700',
    investigating: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    gap: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    missing: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded text-[11px] font-medium font-mono border inline-block ${styles[variant]}`}>
      {text}
    </span>
  );
};
