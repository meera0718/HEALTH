import React from 'react';
import { BarChart3, TrendingUp, ShieldCheck, Clock, Activity, Zap } from 'lucide-react';

export const AnalyticsDashboard: React.FC = () => {
  const anomalyDistribution = [
    { category: 'Authentication Anomaly', count: 18, risk: 'HIGH', color: 'bg-rose-500' },
    { category: 'Lateral Movement', count: 12, risk: 'CRITICAL', color: 'bg-rose-600' },
    { category: 'Database Query Frequency', count: 24, risk: 'MEDIUM', color: 'bg-amber-400' },
    { category: 'API Token Anomaly', count: 8, risk: 'LOW', color: 'bg-emerald-400' },
    { category: 'Outbound Data Transfer', count: 6, risk: 'HIGH', color: 'bg-cyan-400' }
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Banner */}
      <div className="bg-[#111827]/90 border border-[#1e293b] rounded-xl p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-semibold uppercase">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>CYBERSECURITY METRICS & THREAT ANALYTICS</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-1">SECURITY ANALYTICS CONSOLE</h1>
          <p className="text-xs text-slate-300 mt-1">
            Aggregated telemetry statistics, AI anomaly distribution, automated containment speed metrics, and device risk profiling.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
          <TrendingUp className="w-4 h-4" />
          <span>REAL-TIME AGGREGATION</span>
        </div>
      </div>

      {/* Analytics Metric Cards (4-Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-2 shadow-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>AVG RESPONSE TIME</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">4.2 SEC</div>
          <p className="text-[11px] text-slate-400">Automated Quarantine</p>
        </div>

        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-2 shadow-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>AI ANOMALIES FLAGGED</span>
            <Zap className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">18 FLAGGED</div>
          <p className="text-[11px] text-slate-400">Behavioral Deviation</p>
        </div>

        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-2 shadow-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>THREATS CONTAINED</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">12 RESOLVED</div>
          <p className="text-[11px] text-slate-400">Zero Patient Data Loss</p>
        </div>

        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-2 shadow-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs">
            <span>SECURITY SCORE</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">94% HEALTHY</div>
          <p className="text-[11px] text-slate-400">Infrastructure Rating</p>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Anomaly Distribution */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6 space-y-4 shadow-2xl font-mono">
          <h3 className="font-bold text-slate-100 font-sans flex items-center justify-between">
            <span>ANOMALY DISTRIBUTION BY CATEGORY</span>
            <span className="text-xs text-cyan-400">TOTAL: 68 EVENTS</span>
          </h3>

          <div className="space-y-3 pt-2">
            {anomalyDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-sans">
                  <span className="text-slate-200 font-semibold">{item.category}</span>
                  <span className="text-slate-400 font-mono">{item.count} events</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color}`}
                    style={{ width: `${(item.count / 30) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Response Performance & Threat Activity */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-6 space-y-4 shadow-2xl font-mono">
          <h3 className="font-bold text-slate-100 font-sans">RESPONSE PERFORMANCE BENCHMARK</h3>
          <p className="text-xs text-slate-400 font-sans">
            Comparison between manual SOC triage speed vs. HealthShield-X automated containment.
          </p>

          <div className="space-y-4 pt-3 text-xs">
            <div className="p-3 bg-[#161b22] border border-[#1e293b] rounded-lg space-y-1">
              <div className="flex justify-between font-sans font-bold text-slate-200">
                <span>HealthShield-X Automated Isolation</span>
                <span className="text-emerald-400 font-mono">4.2 SECONDS</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 w-[12%]" />
              </div>
            </div>

            <div className="p-3 bg-[#161b22] border border-[#1e293b] rounded-lg space-y-1">
              <div className="flex justify-between font-sans font-bold text-slate-200">
                <span>Traditional Hospital SOC Triage</span>
                <span className="text-rose-400 font-mono">28.5 MINUTES</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 w-[85%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
