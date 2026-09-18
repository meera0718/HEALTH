import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldAlert, Activity } from 'lucide-react';
import type { PatientImpactContext, IntelligenceIncidentContext } from '../../types';

// Level color palette for professional SOC view
export const impactLevelColors: Record<string, { text: string; badge: string; border: string }> = {
  CRITICAL: {
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    border: 'border-rose-500/30'
  },
  HIGH: {
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    border: 'border-amber-500/30'
  },
  MODERATE: {
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    border: 'border-yellow-500/20'
  },
  LOW: {
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    border: 'border-emerald-500/20'
  }
};

// Resolve human-readable affected service
export function resolveAffectedService(
  patientImpact?: PatientImpactContext | null,
  incidentContext?: IntelligenceIncidentContext | null
): string {
  const zone = incidentContext?.hospital_zone;
  if (zone === 'ZONE-ICU') return 'ICU Monitoring & Life Support';
  if (zone === 'ZONE-WARD') return 'Inpatient Ward Telemetry';
  if (zone === 'ZONE-NURSE') return 'Nurse Station & Clinical Triage';
  if (zone === 'ZONE-CORE') return 'Hospital Core Datacenter';
  if (zone) return `${zone.replace('ZONE-', '')} Service`;
  return patientImpact?.service_criticality ? `Clinical Service (${patientImpact.service_criticality})` : 'Hospital Ward Service';
}

// Synthesize ONE short, operational "Why" sentence
export function resolveWhySentence(
  patientImpact?: PatientImpactContext | null,
  incidentContext?: IntelligenceIncidentContext | null
): string {
  const devType = incidentContext?.device_type || 'Device';
  const zone = incidentContext?.hospital_zone || '';
  const dCrit = (patientImpact?.device_criticality || 'LOW').toUpperCase();
  const pDep = (patientImpact?.patient_dependency || 'LOW').toUpperCase();
  const isIcu = zone === 'ZONE-ICU';

  if (dCrit === 'CRITICAL' && isIcu) {
    return 'Critical clinical device with direct patient dependency and ICU service exposure.';
  }
  if (dCrit === 'HIGH' || pDep === 'HIGH') {
    return 'Active bedside clinical device actively streaming inpatient telemetry within hospital ward.';
  }
  if (dCrit === 'MODERATE') {
    return `Diagnostic support terminal (${devType}) with potential clinical workflow queuing delay.`;
  }
  if (dCrit === 'LOW' && (zone === 'ZONE-NURSE' || patientImpact?.service_criticality === 'HIGH')) {
    return 'Administrative workstation in triage zone with zero direct patient dependency.';
  }
  if (dCrit === 'LOW') {
    return 'Non-clinical administrative endpoint with no direct patient care dependency.';
  }
  return 'Operational healthcare asset evaluated under conservative baseline exposure controls.';
}

// Synthesize ONE concise "Response" sentence
export function resolveResponseSentence(
  patientImpact?: PatientImpactContext | null
): string {
  const rationale = patientImpact?.rationale || [];
  const notice = rationale.find(
    (r) => r.toLowerCase().includes('clinical preservation notice') || r.toLowerCase().includes('restrict or isolate')
  );
  if (notice) {
    return 'Restrict suspicious network communication while preserving clinical operation where appropriate.';
  }
  const dCrit = (patientImpact?.device_criticality || 'LOW').toUpperCase();
  if (dCrit === 'CRITICAL' || dCrit === 'HIGH' || dCrit === 'MODERATE') {
    return 'Restrict suspicious network communication while preserving clinical operation where appropriate.';
  }
  return 'Quarantine host from network perimeter without clinical disruption.';
}

export function resolveDeviceLabel(
  patientImpact?: PatientImpactContext | null,
  incidentContext?: IntelligenceIncidentContext | null
): string {
  if (incidentContext?.device_type) return incidentContext.device_type;
  const devId = incidentContext?.device_id || '';
  if (devId.startsWith('VU') || devId.startsWith('VENT')) return 'Ventilator';
  if (devId.startsWith('PM')) return 'Patient Monitor';
  if (devId.startsWith('AW')) return 'Admin Workstation';
  const dCrit = (patientImpact?.device_criticality || 'LOW').toUpperCase();
  if (dCrit === 'CRITICAL') return 'Ventilator';
  if (dCrit === 'HIGH') return 'Patient Monitor';
  return 'Workstation';
}

interface PatientSafetyImpactCardProps {
  patientImpact?: PatientImpactContext | null;
  incidentContext?: IntelligenceIncidentContext | null;
  className?: string;
}

export const PatientSafetyImpactCard: React.FC<PatientSafetyImpactCardProps> = ({
  patientImpact,
  incidentContext,
  className = ''
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  if (!patientImpact) {
    return (
      <div className={`p-3 rounded-xl border border-slate-800 bg-[#0d1424] text-slate-400 text-xs font-mono ${className}`}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">PATIENT / SERVICE IMPACT</span>
        <p className="text-xs text-slate-400 mt-1">No patient impact context available for this event.</p>
      </div>
    );
  }

  const {
    impact_level = 'LOW',
    impact_score = 0,
    device_criticality = 'LOW',
    patient_dependency = 'LOW',
    rationale = []
  } = patientImpact;

  const levelTheme = impactLevelColors[impact_level.toUpperCase()] || impactLevelColors.LOW;
  const affectedService = resolveAffectedService(patientImpact, incidentContext);
  const whySentence = resolveWhySentence(patientImpact, incidentContext);
  const responseSentence = resolveResponseSentence(patientImpact);
  const deviceLabel = resolveDeviceLabel(patientImpact, incidentContext);

  // Filter raw factor rationale lines for progressive disclosure
  const detailedFactors = rationale.filter(
    (item) =>
      !item.toLowerCase().startsWith('clinical preservation notice') &&
      !item.toLowerCase().startsWith('assessment scope')
  );

  return (
    <div
      className={`rounded-xl border ${levelTheme.border} bg-[#0c1322] p-4 font-mono text-slate-200 space-y-3 shadow-md ${className}`}
      data-testid="patient-service-impact-card"
    >
      {/* 1. HEADER */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PATIENT / SERVICE IMPACT</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Operational Exposure</span>
      </div>

      {/* 2. IMPACT LEVEL & SCORE */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className={`font-extrabold text-base uppercase tracking-tight ${levelTheme.text}`}>
            {impact_level}
          </span>
          <span className="text-slate-500 font-bold">·</span>
          <span className="font-extrabold text-white text-base tracking-tight">
            {typeof impact_score === 'number' ? impact_score.toFixed(1) : impact_score}/100
          </span>
        </div>

        {/* 3. AFFECTED SERVICE */}
        <div className="text-xs font-bold text-cyan-300 mt-1 font-sans">
          {affectedService}
        </div>

        {/* 4. ASSET CRITICALITY & PATIENT DEPENDENCY */}
        <div className="mt-2 text-xs text-slate-300 space-y-0.5">
          <div>
            <span className="text-white font-medium">{deviceLabel}</span>
            <span className="text-slate-500 mx-1.5">·</span>
            <span className="capitalize text-slate-300 font-semibold">{device_criticality.toLowerCase()}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Patient dependency:{' '}
            <span className="text-slate-200 font-medium capitalize">
              {patient_dependency.toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 5. WHY (ONE SHORT SENTENCE) */}
      <div className="pt-2.5 border-t border-slate-800/80 space-y-1">
        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Why</span>
        <p className="text-xs text-slate-300 font-sans leading-relaxed">
          {whySentence}
        </p>
      </div>

      {/* 6. RESPONSE (ONE CONCISE SENTENCE) */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider">Response</span>
        </div>
        <p className="text-xs text-slate-200 font-sans leading-relaxed">
          {responseSentence}
        </p>
      </div>

      {/* 7. PROGRESSIVE DISCLOSURE (COLLAPSED BY DEFAULT) */}
      {detailedFactors.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
          >
            {showTechnicalDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{showTechnicalDetails ? 'Hide technical factor breakdown' : 'Show technical factor breakdown'}</span>
          </button>

          {showTechnicalDetails && (
            <ul className="mt-2 space-y-1 text-[10px] text-slate-400 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/60 font-mono">
              {detailedFactors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-1.5 leading-relaxed">
                  <span className="text-cyan-400">•</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 8. SUBTLE DISCLAIMER */}
      <div className="text-[9px] text-slate-500 italic pt-1 border-t border-slate-800/40">
        Operational exposure assessment · Not a medical harm probability
      </div>
    </div>
  );
};
