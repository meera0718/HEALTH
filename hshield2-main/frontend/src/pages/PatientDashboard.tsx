import React, { useState, useEffect } from 'react';
import { Search, Eye, Database } from 'lucide-react';

export interface SyntheticPatient {
  patient_id: string;
  synthetic: boolean;
  display_name: string;
  age: number;
  sex: string;
  city: string;
  occupation: string;
  organization: string;
  primary_diagnosis: string;
  security_profile: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  digital_environment: {
    device_count: number;
    device_type: string;
    operating_system: string;
    browser_type: string;
    network_type: string;
    account_age_days: number;
    mfa_enabled: boolean;
    last_login_days_ago: number;
    last_successful_login_formatted?: string;
  };
  security_features: {
    failed_login_attempts: number;
    successful_login_attempts: number;
    requests_per_minute: number;
    session_duration_minutes: number;
    records_accessed: number;
    unique_records_accessed: number;
    unique_endpoints: number;
    api_calls: number;
    error_rate: number;
    device_changes: number;
    password_reset_count: number;
    unusual_access_time: boolean;
    endpoint_enumeration: boolean;
    privilege_escalation_attempts: number;
    data_export_events: number;
    suspicious_downloads: number;
    geographic_anomaly: boolean;
    session_anomaly: boolean;
  };
  created_at?: string;
  latest_security_event?: {
    event_id: string;
    timestamp: string;
    formatted_timestamp?: string;
    scenario?: string;
    event_type: string;
    severity: string;
    endpoint: string;
    records_accessed: number;
    failed_login_attempts: number;
  };
}

export interface ValidationMetrics {
  total_records: number;
  unique_ids: number;
  missing_fields: number;
  duplicate_ids: number;
  synthetic_records: number;
  status: string;
  is_valid: boolean;
}

export const PatientDashboard: React.FC = () => {
  const [patients, setPatients] = useState<SyntheticPatient[]>([]);
  const [validation, setValidation] = useState<ValidationMetrics>({
    total_records: 30,
    unique_ids: 30,
    missing_fields: 0,
    duplicate_ids: 0,
    synthetic_records: 30,
    status: 'VALID',
    is_valid: true
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string>('ALL');
  const [activePatientId, setActivePatientId] = useState<string>(() => {
    return localStorage.getItem('healthx_selected_patient_id') || 'P001';
  });
  const [selectedPatient, setSelectedPatient] = useState<SyntheticPatient | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [patientVectorSimilarity, setPatientVectorSimilarity] = useState<any | null>(null);

  useEffect(() => {
    if (!selectedPatient?.latest_security_event?.event_id) {
      setPatientVectorSimilarity(null);
      return;
    }
    const evtId = selectedPatient.latest_security_event.event_id;
    fetch(`/api/v1/vector/similarity/${evtId}?limit=5`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setPatientVectorSimilarity(data))
      .catch(() => setPatientVectorSimilarity(null));
  }, [selectedPatient]);

  const handleSelectPatient = (p: SyntheticPatient, openModal = true) => {
    setSelectedPatient(p);
    setActivePatientId(p.patient_id);
    localStorage.setItem('healthx_selected_patient_id', p.patient_id);
    window.dispatchEvent(new CustomEvent('patient-selected', {
      detail: { patient_id: p.patient_id, patient: p }
    }));
    if (openModal) {
      setIsDetailOpen(true);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        // Execute patient records and dataset validation metrics concurrently
        const [res, valRes] = await Promise.all([
          fetch('/api/v1/patients'),
          fetch('/api/v1/patients/validate')
        ]);

        if (res.ok) {
          const data = await res.json();
          if (data.patients && Array.isArray(data.patients)) {
            setPatients(data.patients);
            const savedId = localStorage.getItem('healthx_selected_patient_id') || 'P001';
            const matched = data.patients.find((p: SyntheticPatient) => p.patient_id === savedId) || data.patients[0];
            if (matched) {
              setSelectedPatient(matched);
              setActivePatientId(matched.patient_id);
              localStorage.setItem('healthx_selected_patient_id', matched.patient_id);
            }
          }
        }

        if (valRes.ok) {
          const valData = await valRes.json();
          setValidation(valData);
        }
      } catch (err) {
        console.warn("Failed to fetch patient data from API", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();

    const handleSimulationSuccess = () => {
      loadData();
    };
    window.addEventListener('honeypot-simulation-success', handleSimulationSuccess);
    return () => {
      window.removeEventListener('honeypot-simulation-success', handleSimulationSuccess);
    };
  }, []);

  // Filter patients locally by search query (Patient ID, diagnosis, display_name, city) & security_profile
  const filteredPatients = patients.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.patient_id.toLowerCase().includes(query) ||
      p.display_name.toLowerCase().includes(query) ||
      p.primary_diagnosis.toLowerCase().includes(query) ||
      p.city.toLowerCase().includes(query) ||
      p.occupation.toLowerCase().includes(query);

    const matchesProfile =
      selectedProfile === 'ALL' ||
      p.security_profile === selectedProfile;

    return matchesSearch && matchesProfile;
  });

  const getProfileBadgeStyle = (profile: string) => {
    switch (profile) {
      case 'LOW':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400';
      case 'MODERATE':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-400';
      case 'HIGH':
        return 'bg-orange-500/15 border-orange-500/40 text-orange-400';
      case 'CRITICAL':
        return 'bg-rose-500/15 border-rose-500/40 text-rose-400';
      default:
        return 'bg-slate-500/15 border-slate-500/40 text-slate-400';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100">
      {/* Page Header */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
            HEALTHTECH SHIELD
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5">
            Synthetic Patient Cohort
          </h1>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Active Selected Patient Indicator */}
          <div className="px-3.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold flex items-center gap-2">
            <span className="text-slate-400 text-[10px] uppercase">SELECTED CONTEXT:</span>
            <span className="text-cyan-400 font-extrabold">{activePatientId}</span>
            {selectedPatient && (
              <span className="text-slate-300 text-[11px] font-normal hidden lg:inline">
                ({selectedPatient.display_name})
              </span>
            )}
          </div>

          {/* Dynamic count from backend */}
          <div className="px-3.5 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-cyan-300 font-bold">
            {patients.length} / 30 PATIENTS
          </div>

          {/* Dynamic validation badge */}
          {validation.is_valid ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>● DATASET VALID</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>● DATASET VALIDATION ERROR</span>
            </div>
          )}
        </div>
      </div>

      {/* Dataset Status Section */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4 space-y-2 shadow-md font-mono text-xs">
        <div className="flex items-center gap-2 text-slate-400 font-semibold border-b border-[#1e293b] pb-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <span>DATASET VERIFICATION STATUS</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
          <div>
            <span className="text-slate-500 block text-[10px]">Total records:</span>
            <span className="font-bold text-slate-200 text-sm">{validation.total_records}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Unique IDs:</span>
            <span className="font-bold text-slate-200 text-sm">{validation.unique_ids}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Missing required fields:</span>
            <span className="font-bold text-emerald-400 text-sm">{validation.missing_fields}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Duplicate IDs:</span>
            <span className="font-bold text-emerald-400 text-sm">{validation.duplicate_ids}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Synthetic records:</span>
            <span className="font-bold text-cyan-400 text-sm">{validation.synthetic_records}</span>
          </div>
        </div>
      </div>

      {/* Controls: Search and Security-Profile Filter */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-md">
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient ID..."
            className="w-full bg-[#161b22] border border-[#1e293b] text-xs text-slate-100 pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 placeholder-slate-500 font-mono"
          />
        </div>

        {/* Security Profile Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto font-mono text-[11px]">
          <span className="text-slate-500 mr-1 hidden sm:inline">PROFILE:</span>
          {['ALL', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((profile) => (
            <button
              key={profile}
              onClick={() => setSelectedProfile(profile)}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer font-bold whitespace-nowrap ${
                selectedProfile === profile
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                  : 'bg-[#161b22] border-[#1e293b] text-slate-400 hover:text-slate-200'
              }`}
            >
              {profile}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Table (Primary Visual Element) */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-[#161b22] text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-[#1e293b]">
              <tr>
                <th className="px-4 py-3">Patient ID</th>
                <th className="px-4 py-3">Diagnosis</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Security Profile</th>
                <th className="px-4 py-3">Latest Security Activity</th>
                <th className="px-4 py-3">MFA</th>
                <th className="px-4 py-3">Devices</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1e293b] text-slate-200 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-mono text-xs">
                    Loading patient records from database...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-mono text-xs">
                    No matching patient records found for query "{searchQuery}".
                  </td>
                </tr>
              ) : (
                filteredPatients.map((p) => {
                  const isSelected = p.patient_id === activePatientId;
                  return (
                    <tr
                      key={p.patient_id}
                      onClick={() => handleSelectPatient(p, true)}
                      className={`transition-colors cursor-pointer group ${
                        isSelected
                          ? 'bg-cyan-950/40 hover:bg-cyan-950/60 border-l-2 border-l-cyan-400'
                          : 'hover:bg-[#161b22]/90'
                      }`}
                    >
                      <td className="px-4 py-3.5 font-mono font-bold text-cyan-400 group-hover:underline flex items-center gap-1.5">
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
                        <span>{p.patient_id}</span>
                      </td>

                    <td className="px-4 py-3.5 font-semibold text-slate-100">
                      {p.primary_diagnosis}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      {p.age}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-bold border ${getProfileBadgeStyle(p.security_profile)}`}>
                        {p.security_profile}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-xs">
                      {p.latest_security_event ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-rose-400">
                            ● {p.latest_security_event.scenario || p.latest_security_event.event_type}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {p.latest_security_event.formatted_timestamp || p.latest_security_event.timestamp}
                          </span>
                        </div>
                      ) : (
                        <span className="text-emerald-400 text-[10px] font-bold">● Normal / Baseline</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-[11px]">
                      {p.digital_environment?.mfa_enabled ? (
                        <span className="text-emerald-400 font-semibold">ENABLED</span>
                      ) : (
                        <span className="text-rose-400 font-semibold">DISABLED</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      {p.digital_environment?.device_count} ({p.digital_environment?.device_type})
                    </td>

                    <td className="px-4 py-3.5 font-mono text-slate-400">
                      {p.digital_environment?.last_login_days_ago} day{p.digital_environment?.last_login_days_ago === 1 ? '' : 's'} ago
                    </td>

                    <td className="px-4 py-3.5 font-mono">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold">
                        SYNTHETIC
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPatient(p, true);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-[#1e293b] text-slate-300 font-mono text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span>DETAILS</span>
                      </button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Stored Details Center Modal Overlay */}
      {isDetailOpen && selectedPatient && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setIsDetailOpen(false)}
        >
          <div 
            className="w-full max-w-3xl bg-[#0d1117] border border-[#1e293b] rounded-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-400">{selectedPatient.patient_id}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    SYNTHETIC
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getProfileBadgeStyle(selectedPatient.security_profile)}`}>
                    {selectedPatient.security_profile} PROFILE
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-100 mt-1">{selectedPatient.display_name}</h2>
                <p className="text-xs text-slate-400 font-mono">Primary Diagnosis: {selectedPatient.primary_diagnosis}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    localStorage.setItem('healthx_selected_patient_id', selectedPatient.patient_id);
                    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'honeypot' } }));
                    setIsDetailOpen(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold cursor-pointer transition-all border border-indigo-400/40 flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
                >
                  <span>🎯 LAUNCH HONEYPOT ATTACK</span>
                </button>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-slate-400 hover:text-white font-mono text-xs cursor-pointer"
                >
                  CLOSE [×]
                </button>
              </div>
            </div>

            {/* Demographics & Digital Environment Information */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                Patient Stored Information
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#161b22] p-4 rounded-xl border border-[#1e293b] text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">PATIENT ID</span>
                  <span className="font-semibold text-cyan-400">{selectedPatient.patient_id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">SYNTHETIC STATUS</span>
                  <span className="font-semibold text-emerald-400">TRUE (SYNTHETIC)</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">AGE / SEX</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.age} / {selectedPatient.sex}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CITY</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.city}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">OCCUPATION</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.occupation}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ORGANIZATION</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.organization}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block text-[10px]">PRIMARY DIAGNOSIS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.primary_diagnosis}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">SECURITY PROFILE</span>
                  <span className="font-semibold text-amber-300">{selectedPatient.security_profile}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">DEVICE INFO</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.digital_environment?.device_count} ({selectedPatient.digital_environment?.device_type})</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">OPERATING SYSTEM</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.digital_environment?.operating_system}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">NETWORK TYPE</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.digital_environment?.network_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">MFA STATUS</span>
                  <span className={`font-semibold ${selectedPatient.digital_environment?.mfa_enabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedPatient.digital_environment?.mfa_enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ACCOUNT AGE</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.digital_environment?.account_age_days} days</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">LAST LOGIN</span>
                  <span className="font-semibold text-slate-200">
                    {selectedPatient.digital_environment?.last_successful_login_formatted || 'Not available'}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-slate-500 block text-[10px]">LAST SECURITY ACTIVITY</span>
                  <span className="font-semibold text-rose-400">
                    {selectedPatient.latest_security_event?.formatted_timestamp || 'No Attacks Detected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Latest Security Activity Panel */}
            {selectedPatient.latest_security_event && (
              <div className="space-y-2">
                <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                  Latest Security Activity
                </h3>
                <div className="bg-[#161b22] p-4 rounded-xl border border-rose-500/30 text-xs font-mono grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-500 block text-[10px]">SCENARIO</span>
                    <span className="font-bold text-rose-400 text-sm">
                      {selectedPatient.latest_security_event.scenario || selectedPatient.latest_security_event.event_type}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">EVENT TYPE</span>
                    <span className="font-semibold text-slate-200">{selectedPatient.latest_security_event.event_type}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">SEVERITY</span>
                    <span className="font-semibold text-amber-400">{selectedPatient.latest_security_event.severity}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">EVENT ID</span>
                    <span className="font-semibold text-cyan-400">{selectedPatient.latest_security_event.event_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">TIMESTAMP</span>
                    <span className="font-semibold text-slate-200">
                      {selectedPatient.latest_security_event.formatted_timestamp || selectedPatient.latest_security_event.timestamp}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ENDPOINT</span>
                    <span className="font-semibold text-slate-200">{selectedPatient.latest_security_event.endpoint}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Behavioral Vector Relationships Panel */}
            {selectedPatient.latest_security_event && (
              <div className="space-y-2">
                <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center justify-between">
                  <span>Behavioral Vector Relationships</span>
                  <span className="text-[10px] text-slate-400 font-normal">15-D Vector Cosine Matches</span>
                </h3>
                <div className="bg-[#161b22] p-4 rounded-xl border border-cyan-500/30 text-xs font-mono space-y-2">
                  {patientVectorSimilarity?.nearest_attacks && patientVectorSimilarity.nearest_attacks.length > 0 ? (
                    patientVectorSimilarity.nearest_attacks.map((match: any) => (
                      <div key={match.event_id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-cyan-400 font-bold">{selectedPatient.patient_id} ({selectedPatient.latest_security_event?.event_type})</span>
                          <span className="text-slate-500">↔</span>
                          <span className="text-amber-400 font-bold">{match.patient_id} ({match.scenario || match.event_type})</span>
                        </div>
                        <div className="flex items-center space-x-3 text-[11px]">
                          <span className="text-slate-400 font-mono">Event: {match.event_id}</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            {match.similarity_percent || `${(match.similarity_score * 100).toFixed(1)}%`} Similarity
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-[11px]">No qualifying cross-patient behavioral relationships above threshold.</p>
                  )}
                </div>
              </div>
            )}

            {/* Cybersecurity Behavior Stored Feature Values */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold">
                Stored Cybersecurity Behavior Features
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#161b22] p-4 rounded-xl border border-[#1e293b] text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">FAILED LOGINS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.failed_login_attempts}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">SUCCESSFUL LOGINS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.successful_login_attempts}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">REQUESTS / MIN</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.requests_per_minute}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">SESSION DURATION</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.session_duration_minutes} min</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">RECORDS ACCESSED</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.records_accessed}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">UNIQUE RECORDS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.unique_records_accessed}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">UNIQUE ENDPOINTS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.unique_endpoints}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">API CALLS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.api_calls}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ERROR RATE</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.error_rate}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">DEVICE CHANGES</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.device_changes}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">PASSWORD RESETS</span>
                  <span className="font-semibold text-slate-200">{selectedPatient.security_features?.password_reset_count}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
