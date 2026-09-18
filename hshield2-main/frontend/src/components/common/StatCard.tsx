import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  variant?: 'default' | 'danger' | 'warning' | 'success';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = 'default'
}) => {
  const variantStyles = {
    default: 'border-[#1e293b] text-slate-100',
    danger: 'border-rose-500/30 text-rose-400 bg-rose-500/5',
    warning: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    success: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
  };

  return (
    <div className={`p-4 rounded-xl border bg-[#111827] ${variantStyles[variant]} flex items-center justify-between`}>
      <div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">{label}</span>
        <span className="text-2xl font-bold font-mono tracking-tight mt-1 block">{value}</span>
        {subtext && <span className="text-[11px] text-slate-500 mt-1 block">{subtext}</span>}
      </div>
      {Icon && (
        <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-slate-400">
          <Icon className="w-5 h-5" />
        </div>
      )}
    </div>
  );
};
