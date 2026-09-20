import React, { useEffect, useState } from 'react';
import { X, User, Heart, ShieldCheck, FileText, Activity, Clock, AlertCircle } from 'lucide-react';
import type { Patient, ClinicalActivity, RecordAccessLog } from '../types';

interface PatientProfileModalProps {
  isOpen: boolean;
  patient: Patient | null;
  onClose: () => void;
  currentUserEmail?: string;
}

export const PatientProfileModal: React.FC<PatientProfileModalProps> = ({
  isOpen,
  patient,
  onClose,
  currentUserEmail = 'doctor_demo'
}) => {
  const [accessHistory, setAccessHistory] = useState<RecordAccessLog[]>([]);

  useEffect(() => {
    if (isOpen && patient) {
      setAccessHistory(patient.access_history || []);

      // Trigger automatic audit event for accessing this patient record
      async function auditAccess() {
        try {
          const res = await fetch(`/api/v1/patients/${patient!.id}/access-audit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user: currentUserEmail,
              action: 'VIEW_PATIENT_RECORD',
              status: 'Authorized'
            })
          });
          if (res.ok) {
            const data = await res.json();
            const newLog: RecordAccessLog = {
              timestamp: data.timestamp || new Date().toLocaleTimeString('en-US', { hour12: false }),
              user: currentUserEmail,
              action: 'VIEW_PATIENT_RECORD',
              status: 'Authorized'
            };
            setAccessHistory((prev) => [newLog, ...prev]);
          }
        } catch {
          // Offline fallback
          const newLog: RecordAccessLog = {
            timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
            user: currentUserEmail,
            action: 'VIEW_PATIENT_RECORD',
            status: 'Authorized'
          };
          setAccessHistory((prev) => [newLog, ...prev]);
        }
      }
      auditAccess();
    }
  }, [isOpen, patient, currentUserEmail]);

  if (!isOpen || !patient) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4">
      <div className="relative max-w-3xl w-[95%] sm:w-full bg-[#0d1117] border border-indigo-500/40 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6 font-sans max-h-[90vh] overflow-y-auto">
        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800/80 border border-slate-700 cursor-pointer"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Header Profile Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1e293b] pb-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xl shrink-0">
              <User className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white font-sans">{patient.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono text-xs font-bold">
                  {patient.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {patient.age} YRS · {patient.gender} · BLOOD: <span className="text-rose-400 font-bold">{patient.blood_group}</span> · DOB: {patient.dob}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
              patient.status.includes('Critical')
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : patient.status.includes('Admitted')
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
            }`}>
              ● {patient.status}
            </span>
          </div>
        </div>

        {/* Core Clinical Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Diagnosis & Room */}
          <div className="bg-[#161b22] border border-[#1e293b] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-bold">
              <Heart className="w-4 h-4" /> CLINICAL DIAGNOSIS
            </div>
            <p className="text-xs font-semibold text-slate-200">{patient.diagnosis}</p>
            <div className="pt-2 border-t border-[#1e293b] text-[11px] font-mono text-slate-400">
              Location: <span className="text-slate-200 font-bold">{patient.room}</span>
            </div>
          </div>

          {/* Card 2: Allergies & Meds */}
          <div className="bg-[#161b22] border border-[#1e293b] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-mono font-bold">
              <AlertCircle className="w-4 h-4" /> ALLERGIES & MEDS
            </div>
            <div className="flex flex-wrap gap-1">
              {patient.allergies.map((a: string, idx: number) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono font-bold border border-rose-500/30">
                  {a}
                </span>
              ))}
            </div>
            <div className="pt-2 border-t border-[#1e293b] text-[11px] font-mono text-slate-300 space-y-1">
              {patient.medications.map((m: string, idx: number) => (
                <div key={idx} className="truncate">• {m}</div>
              ))}
            </div>
          </div>

          {/* Card 3: Physician & Dept */}
          <div className="bg-[#161b22] border border-[#1e293b] rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold">
              <FileText className="w-4 h-4" /> ATTENDING PHYSICIAN
            </div>
            <p className="text-xs font-bold text-slate-200">{patient.doctor}</p>
            <p className="text-[11px] font-mono text-slate-400">Dept: {patient.department}</p>
            <div className="pt-2 border-t border-[#1e293b] text-[11px] font-mono text-slate-400">
              Admitted: <span className="text-slate-200">{patient.admission_date}</span>
            </div>
          </div>
        </div>

        {/* Recent Clinical Activity Timeline */}
        <div className="bg-[#161b22] border border-[#1e293b] rounded-2xl p-4 sm:p-5 space-y-3 font-mono text-xs">
          <h3 className="font-bold text-slate-100 flex items-center gap-2 font-sans">
            <Activity className="w-4 h-4 text-indigo-400" /> RECENT CLINICAL ACTIVITY & LAB RESULTS
          </h3>
          <div className="space-y-2.5">
            {patient.recent_clinical_activity.map((act: ClinicalActivity, idx: number) => (
              <div key={idx} className="p-2.5 rounded-lg bg-[#0d1117] border border-[#1e293b] flex items-center justify-between text-[11px]">
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-200">{act.activity}</div>
                  <div className="text-slate-400 text-[10px]">Clinician: {act.clinician}</div>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold text-[10px]">
                    {act.status}
                  </span>
                  <div className="text-slate-500 text-[9px] mt-0.5">{act.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Audit Access History */}
        <div className="bg-[#161b22] border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <h3 className="font-bold text-emerald-400 flex items-center gap-2 font-sans">
              <ShieldCheck className="w-4 h-4" /> RECORD ACCESS MONITORING AUDIT TRAIL
            </h3>
            <span className="text-[10px] text-slate-400 hidden sm:inline">AUTOMATIC LOGGING ACTIVE</span>
          </div>

          <div className="space-y-2">
            {accessHistory.map((log: RecordAccessLog, idx: number) => (
              <div key={idx} className="p-2 rounded-lg bg-[#0d1117] border border-[#1e293b] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400">{log.timestamp}</span>
                  <span className="text-indigo-300 font-bold">{log.user}</span>
                  <span className="text-slate-400">• {log.action}</span>
                </div>
                <span className="self-start sm:self-auto px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                  {log.status} ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
