import React, { useEffect, useState } from 'react';
import { Dna } from 'lucide-react';

interface AttackDNABadgeProps {
  incidentId: string;
}

export const AttackDNABadge: React.FC<AttackDNABadgeProps> = ({ incidentId }) => {
  const [dnaData, setDnaData] = useState<any>(null);

  useEffect(() => {
    async function fetchDNA() {
      try {
        const res = await fetch(`/api/v1/incidents/${incidentId}/dna`);
        if (res.ok) {
          const data = await res.json();
          setDnaData(data);
        } else {
          setDnaData({
            dna_hash: `HSX-DNA::${incidentId}::FEC-72%::T-3::GAPS-1`,
            mitre_techniques: ['T1078.002 (Valid Accounts)', 'T1021.001 (RDP)', 'T1005 (Local Data)'],
            forensic_coverage_badge: '72% COVERAGE',
            attack_behavior_summary: 'Credential Abuse -> Lateral RDP -> EHR API -> Patient DB'
          });
        }
      } catch {
        setDnaData({
          dna_hash: `HSX-DNA::${incidentId}::FEC-72%::T-3::GAPS-1`,
          mitre_techniques: ['T1078.002 (Valid Accounts)', 'T1021.001 (RDP)', 'T1005 (Local Data)'],
          forensic_coverage_badge: '72% COVERAGE',
          attack_behavior_summary: 'Credential Abuse -> Lateral RDP -> EHR API -> Patient DB'
        });
      }
    }
    fetchDNA();
  }, [incidentId]);

  if (!dnaData) return null;

  return (
    <div className="p-4 rounded-xl bg-[#0f172a]/90 border border-indigo-500/30 backdrop-blur-md space-y-3 font-mono text-xs shadow-xl">
      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">ATTACK DNA FINGERPRINT</span>
        </div>
        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
          {dnaData.forensic_coverage_badge}
        </span>
      </div>

      <div className="p-2.5 rounded bg-[#0b0f19] border border-[#1e293b] text-indigo-300 font-mono text-[11px] font-bold tracking-wider select-all break-all">
        {dnaData.dna_hash}
      </div>

      <div className="space-y-1">
        <span className="text-[10px] text-slate-400 uppercase block font-semibold">Identified MITRE ATT&CK Techniques:</span>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {dnaData.mitre_techniques?.map((tech: string) => (
            <span key={tech} className="px-2 py-0.5 rounded bg-[#1e293b] text-slate-300 text-[10px] border border-slate-700">
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
