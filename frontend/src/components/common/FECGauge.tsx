import React from 'react';

interface FECGaugeProps {
  score: number;
  size?: number;
  label?: string;
}

export const FECGauge: React.FC<FECGaugeProps> = ({
  score,
  size = 140,
  label = "Forensic Evidence Coverage"
}) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono tracking-tight" style={{ color }}>
            {score}%
          </span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">FEC</span>
        </div>
      </div>
      {label && <span className="text-xs text-slate-300 font-medium mt-3 text-center">{label}</span>}
    </div>
  );
};
