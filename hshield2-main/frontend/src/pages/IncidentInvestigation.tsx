import React, { useState } from 'react';
import { ChevronRight, Terminal } from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { GradientBlinds } from '../components/GradientBlinds';
import { AttackDNABadge } from '../components/AttackDNABadge';
import type { Incident, SecurityEvent } from '../types';

import { JudgeWowStoryModal } from '../components/judge_wow/JudgeWowStoryModal';

interface IncidentInvestigationProps {
  incident: Incident | null;
  events: SecurityEvent[];
  onNavigateTab: (tab: string) => void;
}

export const IncidentInvestigation: React.FC<IncidentInvestigationProps> = ({
  incident,
  events,
  onNavigateTab
}) => {
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);

  if (!incident) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono">
        Select an active incident from the Command Center to begin investigation.
      </div>
    );
  }

  return (
    <div className="relative min-h-full w-full p-4 sm:p-6 space-y-6 max-w-7xl mx-auto overflow-hidden font-sans">
      {/* Full Page React Bits GradientBlinds Background for Dashboard 02 */}
      <div className="fixed inset-0 pointer-events-none opacity-25 z-0">
        <GradientBlinds
          gradientColors={['#6366F1', '#38BDF8', '#0F172A']}
          angle={45}
          noise={0.15}
          blindCount={16}
          blindMinWidth={60}
          spotlightRadius={0.8}
          spotlightSoftness={1}
          spotlightOpacity={0.8}
          mouseDampening={0.15}
          distortAmount={0}
          shineDirection="left"
          mixBlendMode="lighten"
        />
      </div>

      {/* Full Page Dark Overlay */}
      <div className="fixed inset-0 bg-[#0b0f19]/75 backdrop-blur-[1px] pointer-events-none z-1" />

      {/* Main Page Content */}
      <div className="relative z-10 space-y-6">
        {/* Incident Investigation Header */}
        <div className="bg-[#111827]/80 backdrop-blur-md border border-[#1e293b] rounded-xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                <span>INCIDENT INVESTIGATION</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-indigo-400 font-bold">{incident.id}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-sans">{incident.title}</h1>
            </div>

            <div className="flex items-center gap-3">
              <Badge text={incident.severity} variant={incident.severity.toLowerCase() as any} />
              <Badge text={incident.status} variant={incident.status.toLowerCase() as any} />
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 font-sans max-w-3xl leading-relaxed">{incident.summary}</p>

          <div className="pt-2 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-4 text-slate-400">
              <span>Start: <strong className="text-slate-200">{incident.start_time}</strong></span>
              <span>End: <strong className="text-slate-200">{incident.end_time}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigateTab('deception')}
                className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer uppercase"
              >
                <span>🍯 DECEPTION CENTER →</span>
              </button>
              <button
                onClick={() => onNavigateTab('graph')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer uppercase"
              >
                <span>VIEW ATTACK GRAPH →</span>
              </button>
            </div>
          </div>
        </div>

        {/* Embedded Judge-Wow Incident Story Controller */}
        <JudgeWowStoryModal incidentId={incident.id} />

        {/* Timeline & Summary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline (2 Columns) */}
          <div className="lg:col-span-2 bg-[#111827]/80 backdrop-blur-md border border-[#1e293b] rounded-xl p-4 sm:p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-4">
              <div>
                <h2 className="font-bold text-slate-100 text-sm tracking-wide font-sans">CHRONOLOGICAL ATTACK TIMELINE</h2>
                <p className="text-xs text-slate-400 font-sans">Reconstructed telemetry event flow across attack stages.</p>
              </div>
              <span className="font-mono text-xs text-slate-400 bg-[#161b22]/90 px-3 py-1 rounded border border-[#1e293b]">
                WINDOW: {incident.start_time} - {incident.end_time}
              </span>
            </div>

            {/* Timeline Events List */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1e293b]">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => setSelectedEvent(evt)}
                  className="relative bg-[#161b22]/90 border border-[#1e293b] hover:border-indigo-500/50 rounded-xl p-4 cursor-pointer transition-all hover:bg-[#1a2332]"
                >
                  {/* Node indicator */}
                  <div className="absolute -left-8 top-4 w-4 h-4 rounded-full bg-[#111827] border-2 border-indigo-500 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b]/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-indigo-400">{evt.timestamp}</span>
                      <span className="font-mono text-xs font-semibold text-slate-200 uppercase">{evt.attack_stage}</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {evt.event_type}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Source</span>
                      <span className="text-slate-200 truncate block">{evt.source_entity}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Destination</span>
                      <span className="text-slate-200 truncate block">{evt.destination_entity}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Domain</span>
                      <span className="text-slate-300 truncate block">{evt.evidence_domain}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Confidence</span>
                      <span className="text-emerald-400 font-bold">{(evt.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Incident Metadata & Attack DNA Sidebar (1 Column) */}
          <div className="space-y-6">
            {/* Attack DNA Badge */}
            <AttackDNABadge incidentId={incident.id} />

            <div className="bg-[#111827]/80 backdrop-blur-md border border-[#1e293b] rounded-xl p-5 space-y-4 font-mono text-xs shadow-xl">
              <h3 className="font-bold text-slate-100 text-sm tracking-wide font-sans">INCIDENT SUMMARY</h3>
              
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Attack Origin</span>
                  <span className="text-rose-400 font-bold text-sm">198.51.100.42 (EXTERNAL_NET)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Primary Target</span>
                  <span className="text-slate-200 font-bold">Patient DB (10.10.5.100)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Intermediate Hop</span>
                  <span className="text-amber-400 font-bold">WORKSTATION-14 (10.10.2.14)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Duration</span>
                  <span className="text-slate-300">15 Minutes</span>
                </div>
              </div>
            </div>

            <div className="bg-[#111827]/80 backdrop-blur-md border border-[#1e293b] rounded-xl p-5 space-y-3 shadow-xl">
              <h3 className="font-bold text-slate-100 text-sm tracking-wide font-sans">EVIDENCE COVERAGE</h3>
              <div className="text-3xl font-bold font-mono text-amber-400">72%</div>
              <p className="text-xs text-slate-400 font-sans">
                Endpoint telemetry is unavailable for Workstation-14. Process creation & execution trace cannot be confirmed.
              </p>
              <button
                onClick={() => onNavigateTab('evidence')}
                className="w-full mt-2 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-semibold hover:bg-indigo-600/30 transition-colors cursor-pointer uppercase"
              >
                Inspect Evidence Forensics
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Modal Inspector */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm font-mono">EVENT #{selectedEvent.id}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <div><span className="text-slate-500">Timestamp:</span> <span className="text-slate-200">{selectedEvent.timestamp}</span></div>
                <div><span className="text-slate-500">Protocol:</span> <span className="text-slate-200">{selectedEvent.protocol}</span></div>
                <div><span className="text-slate-500">Source:</span> <span className="text-slate-200">{selectedEvent.source_ip}:{selectedEvent.source_port}</span></div>
                <div><span className="text-slate-500">Destination:</span> <span className="text-slate-200">{selectedEvent.destination_ip}:{selectedEvent.destination_port}</span></div>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Raw Telemetry Reference</span>
                <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b] text-slate-300 font-mono text-[11px]">
                  {selectedEvent.raw_reference}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-slate-500">Domain:</span> <span className="text-indigo-400 font-bold">{selectedEvent.evidence_domain}</span></div>
                <div><span className="text-slate-500">Confidence:</span> <span className="text-emerald-400 font-bold">{(selectedEvent.confidence * 100).toFixed(0)}%</span></div>
              </div>
            </div>

            <button
              onClick={() => setSelectedEvent(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-semibold"
            >
              Close Event Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
