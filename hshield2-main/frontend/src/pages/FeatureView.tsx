import React, { useState, useEffect } from 'react';
import { RefreshCw, ShieldAlert, Cpu, Activity, Database, CheckCircle2, Zap } from 'lucide-react';

interface LatestFeatureEvent {
  status: string;
  patient_id: string;
  event_id: string;
  scenario: string;
  event_type: string;
  severity: string;
  endpoint: string;
  timestamp: string;
  formatted_timestamp: string;
  features: {
    failed_logins: number;
    requests_per_min: number;
    records_accessed: number;
    unique_endpoints: number;
    api_calls: number;
    error_rate: number;
    device_changes: number;
    password_resets: number;
    endpoint_enumeration: boolean;
    data_export_events: number;
    privilege_escalation_attempts: number;
  };
  feature_vector?: number[];
}

export const FeatureView: React.FC = () => {
  const [activePatientId, setActivePatientId] = useState<string>(() => {
    return localStorage.getItem('healthx_selected_patient_id') || 'P003';
  });
  const [latestEvent, setLatestEvent] = useState<LatestFeatureEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the event-isolated features for an event_id or latest patient event
  const fetchFeatureEvent = async (patientId: string, eventId?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/features/latest?patient_id=${patientId}`;
      if (eventId) {
        url = `/api/v1/features/event/${eventId}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          setLatestEvent(null);
          return;
        }
        throw new Error('Failed to fetch event features');
      }
      const data = await res.json();
      setLatestEvent(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load feature engine processing result.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatureEvent(activePatientId);

    const handlePatientSelected = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail && customEvt.detail.patient_id) {
        const newPid = customEvt.detail.patient_id;
        setActivePatientId(newPid);
        setLatestEvent(null); // Clear stale event state
        fetchFeatureEvent(newPid);
      }
    };

    const handleSimulationSuccess = (e: Event) => {
      const customEvt = e as CustomEvent;
      const targetPid = customEvt.detail?.patient_id || activePatientId;
      const eventId = customEvt.detail?.event_id;
      if (targetPid) {
        setActivePatientId(targetPid);
        setLatestEvent(null); // Clear stale event state
        fetchFeatureEvent(targetPid, eventId);
      } else {
        fetchFeatureEvent(activePatientId);
      }
    };

    window.addEventListener('patient-selected', handlePatientSelected);
    window.addEventListener('honeypot-simulation-success', handleSimulationSuccess);

    return () => {
      window.removeEventListener('patient-selected', handlePatientSelected);
      window.removeEventListener('honeypot-simulation-success', handleSimulationSuccess);
    };
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/features/recalculate', { method: 'POST' });
      if (!res.ok) throw new Error('Recalculation failed');
      await fetchFeatureEvent(activePatientId);
    } catch (err: any) {
      setError('Unable to recalculate behavioural features.');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSelectPatient = (pid: string) => {
    setActivePatientId(pid);
    setLatestEvent(null); // Clear stale current-event state
    localStorage.setItem('healthx_selected_patient_id', pid);
    window.dispatchEvent(new CustomEvent('patient-selected', { detail: { patient_id: pid } }));
  };

  const featureVectorArray = latestEvent?.feature_vector || [
    latestEvent?.features.failed_logins || 0,
    latestEvent?.features.requests_per_min || 0,
    latestEvent?.features.records_accessed || 0,
    latestEvent?.features.unique_endpoints || 0,
    latestEvent?.features.api_calls || 0,
    latestEvent?.features.error_rate || 0,
    latestEvent?.features.device_changes || 0,
    latestEvent?.features.password_resets || 0,
    latestEvent?.features.endpoint_enumeration ? 1 : 0,
    latestEvent?.features.data_export_events || 0,
    latestEvent?.features.privilege_escalation_attempts || 0
  ];

  return (
    <div className="space-y-6 pb-12 font-mono text-slate-300">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e293b] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-cyan-400" />
            <h1 className="text-xl font-bold text-white tracking-wide font-mono">FEATURE ENGINE</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold">
              EVENT AWARE
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Isolated behavioural features extracted strictly from the selected security event.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Patient Selector Dropdown */}
          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1e293b] px-3 py-1.5 rounded-lg">
            <label className="text-xs font-mono text-slate-400 font-bold">Select Patient</label>
            <select
              value={activePatientId}
              onChange={(e) => handleSelectPatient(e.target.value)}
              className="bg-[#161b22] text-cyan-400 font-mono font-bold text-xs px-3 py-1 rounded border border-[#1e293b] focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              {Array.from({ length: 30 }, (_, idx) => {
                const id = `P${String(idx + 1).padStart(3, '0')}`;
                return (
                  <option key={id} value={id} className="bg-[#161b22] text-slate-200 font-mono font-bold">
                    {id}
                  </option>
                );
              })}
            </select>
          </div>

          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'RECALCULATING...' : 'RECALCULATE'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 text-xs font-mono text-rose-400 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !latestEvent ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 font-mono text-xs space-y-3 bg-[#0d1117] border border-[#1e293b] rounded-xl p-8">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Extracting event-aware features for patient {activePatientId}...</span>
        </div>
      ) : !latestEvent ? (
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-8 text-center text-slate-400 font-mono text-xs space-y-2">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <div className="font-bold text-slate-200 uppercase tracking-wider">NO HONEYPOT ATTACK GENERATED</div>
          <p className="text-slate-500 max-w-sm mx-auto">No honeypot simulation events found for patient {activePatientId}. Simulate an attack in Honeypot Simulator to generate events.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: LATEST PROCESSED EVENT */}
          <div className="bg-[#0d1117] border border-cyan-500/30 rounded-xl p-5 shadow-xl relative overflow-hidden space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                  LATEST PROCESSED EVENT
                </h2>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3" />
                <span>STATUS: {latestEvent.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">PATIENT ID</span>
                <span className="font-bold text-cyan-400 text-sm">{latestEvent.patient_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">EVENT ID</span>
                <span className="font-bold text-cyan-300 text-sm">{latestEvent.event_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">SCENARIO</span>
                <span className="font-bold text-rose-400 text-sm">{latestEvent.scenario || 'Baseline / Not applicable'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">EVENT TYPE</span>
                <span className="font-semibold text-slate-200">{latestEvent.event_type}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">SEVERITY</span>
                <span className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded ${
                  latestEvent.severity === 'HIGH' || latestEvent.severity === 'CRITICAL'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  {latestEvent.severity}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">TIMESTAMP</span>
                <span className="font-semibold text-slate-200">{latestEvent.formatted_timestamp || latestEvent.timestamp}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[10px] uppercase">ENDPOINT</span>
                <span className="font-semibold text-slate-300 truncate block" title={latestEvent.endpoint}>{latestEvent.endpoint}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: EXTRACTED BEHAVIOURAL FEATURES */}
          <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex items-center gap-2 border-b border-[#1e293b] pb-3">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                EXTRACTED BEHAVIOURAL FEATURES
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 font-mono text-xs">
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">FAILED LOGINS</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.failed_logins}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">REQUESTS / MIN</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.requests_per_min}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">RECORDS ACCESSED</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.records_accessed}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">UNIQUE ENDPOINTS</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.unique_endpoints}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">API CALLS</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.api_calls}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">ERROR RATE</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.error_rate}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">DEVICE CHANGES</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.device_changes}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">PASSWORD RESETS</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.password_resets}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">ENDPOINT ENUMERATION</span>
                <span className={`font-bold text-sm ${latestEvent.features.endpoint_enumeration ? 'text-amber-400' : 'text-slate-400'}`}>
                  {latestEvent.features.endpoint_enumeration ? 'TRUE' : 'FALSE'}
                </span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">DATA EXPORTS</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.data_export_events}</span>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-slate-500 block text-[10px]">PRIVILEGE ESCALATION</span>
                <span className="font-bold text-slate-100 text-sm">{latestEvent.features.privilege_escalation_attempts}</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: FEATURE VECTOR & SOURCE EVENT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-xs">
            <div className="lg:col-span-2 bg-[#0d1117] border border-[#1e293b] rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">FEATURE VECTOR</h3>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg text-cyan-300 font-mono text-[12px] font-bold overflow-x-auto border border-[#1e293b]">
                [ {featureVectorArray.join(', ')} ]
              </div>
            </div>

            <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-5 shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">SOURCE EVENT</h3>
              </div>
              <div className="bg-[#161b22] p-3 rounded-lg space-y-1.5 text-[11px]">
                <div className="text-slate-400">Security Event ID:</div>
                <div className="text-cyan-400 font-bold text-sm">{latestEvent.event_id}</div>
                <div className="text-slate-500 text-[10px]">Patient Reference: {latestEvent.patient_id}</div>
                <div className="text-slate-500 text-[10px]">Scenario: {latestEvent.scenario || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
