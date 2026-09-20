import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, ShieldAlert, Shield, SlidersHorizontal, History, Cpu, Activity } from 'lucide-react';
import { sanitizeHoneypotLimit } from '../services/api';

interface PatientFEC {
  patient_id: string;
  display_name: string;
  fec_score: number;
  authentication_component: number;
  request_access_component: number;
  record_exposure_component: number;
  endpoint_anomaly_component: number;
  data_movement_component: number;
  device_anomaly_component: number;
  time_anomaly_component: number;
  general_anomaly_component: number;
  fec_version: string;
  calculated_at: string;
}

interface SecurityEventItem {
  event_id: string;
  patient_id: string;
  scenario: string;
  event_type: string;
  severity: string;
  timestamp: string;
  formatted_timestamp: string;
  endpoint: string;
  records_accessed: number;
  failed_login_attempts: number;
}

interface EventMlData {
  event_id: string;
  patient_id: string;
  scenario: string;
  event_type: string;
  severity: string;
  timestamp: string;
  endpoint: string;
  features?: Record<string, any>;
  feature_vector: number[];
  event_fec?: {
    fec_score: number;
    baseline_fec: number;
    event_adjustment: number;
    scope: string;
  };
  ocsvm: {
    model: string;
    prediction: string;
    score: number;
  };
  isolation_forest: {
    model: string;
    prediction: string;
    score: number;
  };
  xgboost: {
    model: string;
    classification: string;
    probability: number;
  };
}

type ExposureFilter = 'ALL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export const FecView: React.FC = () => {
  const [activePatientId, setActivePatientId] = useState<string>(() => {
    return localStorage.getItem('healthx_selected_patient_id') || 'P003';
  });
  const [fecRecords, setFecRecords] = useState<PatientFEC[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>('ALL');
  const [recalculating, setRecalculating] = useState(false);
  const [eventCategoryFilter, setEventCategoryFilter] = useState<'ATTACK' | 'BASELINE' | 'ALL'>('ATTACK');
  const [eventLimit, setEventLimit] = useState<number>(10);
  const [totalEventCount, setTotalEventCount] = useState<number>(0);
  const [patientEvents, setPatientEvents] = useState<SecurityEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventMlData, setEventMlData] = useState<EventMlData | null>(null);
  const [loadingMlData, setLoadingMlData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adversarial Guard Refs: Prevent out-of-order async responses and cross-patient leaks
  const latestRequestedEventIdRef = React.useRef<string | null>(null);
  const activePatientIdRef = React.useRef<string>(activePatientId);

  useEffect(() => {
    activePatientIdRef.current = activePatientId;
  }, [activePatientId]);

  // Fetch all FEC records
  const fetchData = async () => {
    setError(null);
    try {
      const fecRes = await fetch('/api/v1/fec/patients');
      if (!fecRes.ok) throw new Error('Failed to fetch patient FEC records');
      const fecData = await fecRes.json();

      const sortedData = [...fecData].sort((a, b) => {
        const numA = parseInt(a.patient_id.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.patient_id.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
      setFecRecords(sortedData);
    } catch (err: any) {
      setError(err.message || 'Unable to load FEC exposure records.');
    }
  };

  const fetchPatientEvents = async (
    pid: string, 
    targetEventId?: string, 
    cat: 'ATTACK' | 'BASELINE' | 'ALL' = eventCategoryFilter,
    limit: number = eventLimit
  ) => {
    setLoadingEvents(true);
    try {
      let queryCat = cat;
      if (targetEventId && targetEventId.startsWith('EVT-SIM-') && cat === 'BASELINE') {
        queryCat = 'ATTACK';
        setEventCategoryFilter('ATTACK');
      }

      const safeLimit = sanitizeHoneypotLimit(limit);
      const res = await fetch(`/api/v1/honeypot/events/patient/${pid}?category=${queryCat}&limit=${safeLimit}`);
      if (res.ok) {
        const data = await res.json();
        if (pid.toUpperCase() !== activePatientIdRef.current.toUpperCase()) return; // Discard stale patient response

        const evts: SecurityEventItem[] = data.events || [];
        setPatientEvents(evts);
        setTotalEventCount(data.total || evts.length);
        
        const storedSimId = localStorage.getItem('healthx_latest_sim_event_id');
        const latestSimEvt = evts.find(e => e.event_id.startsWith('EVT-SIM-'));
        const activeEvtId = targetEventId || (storedSimId && evts.some(e => e.event_id === storedSimId) ? storedSimId : (latestSimEvt ? latestSimEvt.event_id : (evts.length > 0 ? evts[0].event_id : null)));
        
        if (activeEvtId) {
          setSelectedEventId(activeEvtId);
          fetchEventMlData(activeEvtId, pid);
        } else {
          setSelectedEventId(null);
          setEventMlData(null);
        }
      } else {
        setPatientEvents([]);
        setTotalEventCount(0);
        setSelectedEventId(null);
        setEventMlData(null);
      }
    } catch {
      setPatientEvents([]);
      setTotalEventCount(0);
      setSelectedEventId(null);
      setEventMlData(null);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchEventMlData = async (eventId: string, expectedPatientId?: string) => {
    setLoadingMlData(true);
    latestRequestedEventIdRef.current = eventId;
    const reqPid = expectedPatientId || activePatientId;
    
    try {
      const res = await fetch(`/api/v1/fec/event_ml/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        // Guard: Discard response if requested event_id or patient_id changed in the meantime
        if (latestRequestedEventIdRef.current !== eventId) return;
        if (data.patient_id && data.patient_id.toUpperCase() !== reqPid.toUpperCase()) {
          console.warn(`[HEALTHX] Discarded cross-patient event ML response: event patient ${data.patient_id} != active patient ${reqPid}`);
          setEventMlData(null);
          return;
        }
        setEventMlData(data);
      } else {
        if (latestRequestedEventIdRef.current === eventId) setEventMlData(null);
      }
    } catch {
      if (latestRequestedEventIdRef.current === eventId) setEventMlData(null);
    } finally {
      if (latestRequestedEventIdRef.current === eventId) setLoadingMlData(false);
    }
  };

  useEffect(() => {
    fetchData();
    const storedSimId = localStorage.getItem('healthx_latest_sim_event_id');
    if (activePatientId) {
      // Validate storedSimId patient reference before fetching
      if (storedSimId) {
        fetch(`/api/v1/fec/event_ml/${storedSimId}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.patient_id === activePatientId) {
              fetchPatientEvents(activePatientId, storedSimId);
            } else {
              fetchPatientEvents(activePatientId);
            }
          })
          .catch(() => fetchPatientEvents(activePatientId));
      } else {
        fetchPatientEvents(activePatientId);
      }
    }

    const handlePatientSelected = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail && customEvt.detail.patient_id) {
        const newPid = customEvt.detail.patient_id;
        setActivePatientId(newPid);
        activePatientIdRef.current = newPid;
        setSelectedEventId(null);
        setEventMlData(null);
        setEventLimit(10);
        fetchPatientEvents(newPid, undefined, eventCategoryFilter, 10);
      }
    };

    const handleSimulationSuccess = (e: Event) => {
      const customEvt = e as CustomEvent;
      const targetPid = customEvt.detail?.patient_id || activePatientId;
      const eventId = customEvt.detail?.event_id;
      if (targetPid) {
        setActivePatientId(targetPid);
        activePatientIdRef.current = targetPid;
        setSelectedEventId(eventId || null);
        setEventMlData(null);
        setEventLimit(10);
        setEventCategoryFilter('ATTACK');
        fetchPatientEvents(targetPid, eventId, 'ATTACK', 10);
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
      const res = await fetch('/api/v1/fec/recalculate', { method: 'POST' });
      if (!res.ok) throw new Error('Recalculation failed');

      const fecRes = await fetch('/api/v1/fec/patients');
      if (fecRes.ok) {
        const fecData = await fecRes.json();
        const sortedData = [...fecData].sort((a, b) => {
          const numA = parseInt(a.patient_id.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.patient_id.replace(/\D/g, '')) || 0;
          return numA - numB;
        });
        setFecRecords(sortedData);
      }

      if (activePatientId) {
        await fetchPatientEvents(activePatientId);
      }
    } catch (err: any) {
      setError('Unable to recalculate FEC exposure records.');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSelectPatient = (pid: string) => {
    setActivePatientId(pid);
    activePatientIdRef.current = pid;
    setSelectedEventId(null);
    setEventMlData(null); // Clear stale event state
    localStorage.setItem('healthx_selected_patient_id', pid);
    window.dispatchEvent(new CustomEvent('patient-selected', { detail: { patient_id: pid } }));
    fetchPatientEvents(pid);
  };

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    fetchEventMlData(eventId, activePatientId);
  };

  const getExposureBand = (score: number): ExposureFilter => {
    if (score < 25.0) return 'LOW';
    if (score < 50.0) return 'MODERATE';
    if (score < 75.0) return 'HIGH';
    return 'CRITICAL';
  };

  const getExposureBadge = (score: number) => {
    if (score < 25.0) return { label: 'LOW EXPOSURE', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/35' };
    if (score < 50.0) return { label: 'MODERATE EXPOSURE', className: 'bg-amber-500/10 text-amber-400 border-amber-500/35' };
    if (score < 75.0) return { label: 'HIGH EXPOSURE', className: 'bg-orange-500/10 text-orange-400 border-orange-500/35' };
    return { label: 'CRITICAL EXPOSURE', className: 'bg-rose-500/10 text-rose-400 border-rose-500/35' };
  };

  const getTopContributorName = (rec: PatientFEC) => {
    const comps = [
      { name: 'Record Exposure', score: rec.record_exposure_component },
      { name: 'Endpoint Anomaly', score: rec.endpoint_anomaly_component },
      { name: 'Data Movement', score: rec.data_movement_component },
      { name: 'Authentication', score: rec.authentication_component },
      { name: 'Request/Access', score: rec.request_access_component },
      { name: 'Device Anomaly', score: rec.device_anomaly_component },
      { name: 'Time Anomaly', score: rec.time_anomaly_component },
      { name: 'General Anomaly', score: rec.general_anomaly_component }
    ];
    comps.sort((a, b) => b.score - a.score);
    return comps[0].name;
  };

  const filteredRecords = fecRecords.filter((f) => {
    const matchesSearch =
      f.patient_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.display_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBand = exposureFilter === 'ALL' || getExposureBand(f.fec_score) === exposureFilter;
    return matchesSearch && matchesBand;
  });

  const scoredCount = fecRecords.length;
  const avgFec = scoredCount > 0 ? (fecRecords.reduce((acc, curr) => acc + curr.fec_score, 0) / scoredCount) : 0;
  const highestFec = scoredCount > 0 ? Math.max(...fecRecords.map(f => f.fec_score)) : 0;
  const lowestFec = scoredCount > 0 ? Math.min(...fecRecords.map(f => f.fec_score)) : 0;

  return (
    <div className="space-y-6 text-slate-300 font-sans p-2 sm:p-4 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#1e293b] pb-5">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-widest font-semibold mb-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-500" />
            <span>FEC ENGINE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 font-mono tracking-tight">
            Feature Exposure Composite
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Event-aware exposure scoring & ML pipeline results linked strictly by unique security event_id.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Patient Selector Dropdown */}
          <div className="flex items-center gap-2 bg-[#0d1117] border border-[#1e293b] px-3 py-1.5 rounded-lg font-mono">
            <label className="text-xs text-slate-400 font-bold">Select Patient</label>
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

      {/* LATEST PROCESSED EVENT & ML RESULTS PANEL */}
      <div className="bg-[#0d1117] border border-cyan-500/40 rounded-xl p-5 shadow-xl font-mono text-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1e293b] pb-3 gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h2 className="text-xs font-extrabold text-cyan-400 uppercase tracking-wider">
              LATEST PROCESSED EVENT — ML DETECTION RESULTS
            </h2>
          </div>
          {eventMlData && (
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-400">PATIENT ID: <strong className="text-cyan-300 font-bold">{eventMlData.patient_id}</strong></span>
              <span className="text-slate-400">EVENT ID: <strong className="text-cyan-400 font-mono font-bold">{eventMlData.event_id}</strong></span>
            </div>
          )}
        </div>

        {loadingMlData ? (
          <div className="p-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Running Event-Aware ML Detection Pipeline for selected event...</span>
          </div>
        ) : !eventMlData ? (
          <div className="p-6 text-center text-slate-500 text-xs space-y-1">
            <div className="font-bold text-slate-400 uppercase">NO EVENT ML PIPELINE RESULTS</div>
            <p className="text-[11px] text-slate-600">Select a patient or simulate a Honeypot event to view ML pipeline outputs for that exact event.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Event Metadata Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#161b22] border border-[#1e293b] p-3 rounded-lg text-[11px]">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">SCENARIO</span>
                <span className="font-bold text-rose-400 text-xs">{eventMlData.scenario || 'Baseline / Not applicable'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">EVENT TYPE</span>
                <span className="font-bold text-cyan-300">{eventMlData.event_type}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">SEVERITY</span>
                <span className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded mt-0.5 ${
                  eventMlData.severity === 'HIGH' || eventMlData.severity === 'CRITICAL'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}>
                  {eventMlData.severity}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">ENDPOINT</span>
                <span className="font-bold text-slate-300 truncate block" title={eventMlData.endpoint}>{eventMlData.endpoint}</span>
              </div>
            </div>

            {/* FEATURE VECTOR */}
            <div className="bg-[#161b22] border border-[#1e293b] p-3.5 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  FEATURE VECTOR
                </span>
                <span className="text-[11px] font-mono text-cyan-300 font-bold bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded">
                  [{eventMlData.feature_vector.join(', ')}]
                </span>
              </div>
              <div className="text-[10px] text-slate-500 flex items-center justify-between border-t border-[#1e293b] pt-1.5">
                <span>Source Event ID: <strong className="text-cyan-400">{eventMlData.event_id}</strong></span>
                <span>Patient Reference: <strong className="text-slate-300">{eventMlData.patient_id}</strong></span>
              </div>
            </div>

            {/* EVENT-LEVEL FEC SCORE CARD */}
            {eventMlData.event_fec && (
              <div className="bg-[#161b22] border border-emerald-500/40 p-3.5 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    EVENT-LEVEL FEC SCORE
                  </span>
                  <span className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded bg-cyan-500/10 font-mono font-bold">
                    SCOPE: EVENT
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">EVENT FEC SCORE</span>
                    <span className="text-lg font-extrabold text-emerald-400 font-mono">{eventMlData.event_fec.fec_score.toFixed(1)}</span>
                  </div>
                  <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">PATIENT BASELINE FEC</span>
                    <span className="text-lg font-extrabold text-slate-300 font-mono">{eventMlData.event_fec.baseline_fec.toFixed(1)}</span>
                  </div>
                  <div className="bg-[#0d1117] p-2.5 rounded-lg border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">EVENT RISK ADJUSTMENT</span>
                    <span className="text-lg font-extrabold text-amber-400 font-mono">+{eventMlData.event_fec.event_adjustment.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ML MODEL RESULTS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* OCSVM CARD */}
              <div className="bg-[#161b22] border border-[#1e293b] p-4 rounded-lg space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">ONE-CLASS SVM</span>
                  <span className="text-[9px] bg-slate-800 text-cyan-400 font-mono px-2 py-0.5 rounded">{eventMlData.event_id}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">PREDICTION:</span>
                    <span className={`font-extrabold text-xs px-2 py-0.5 rounded ${
                      eventMlData.ocsvm.prediction === 'ANOMALOUS'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}>
                      {eventMlData.ocsvm.prediction}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">SCORE:</span>
                    <span className="font-extrabold text-cyan-300 font-mono">{eventMlData.ocsvm.score}</span>
                  </div>
                </div>
              </div>

              {/* ISOLATION FOREST CARD */}
              <div className="bg-[#161b22] border border-[#1e293b] p-4 rounded-lg space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">ISOLATION FOREST</span>
                  <span className="text-[9px] bg-slate-800 text-cyan-400 font-mono px-2 py-0.5 rounded">{eventMlData.event_id}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">PREDICTION:</span>
                    <span className={`font-extrabold text-xs px-2 py-0.5 rounded ${
                      eventMlData.isolation_forest.prediction === 'OUTLIER' || eventMlData.isolation_forest.prediction === 'ANOMALOUS'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    }`}>
                      {eventMlData.isolation_forest.prediction}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">SCORE:</span>
                    <span className="font-extrabold text-cyan-300 font-mono">{eventMlData.isolation_forest.score}</span>
                  </div>
                </div>
              </div>

              {/* XGBOOST CARD */}
              <div className="bg-[#161b22] border border-[#1e293b] p-4 rounded-lg space-y-2 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">XGBOOST CLASSIFIER</span>
                  <span className="text-[9px] bg-slate-800 text-cyan-400 font-mono px-2 py-0.5 rounded">{eventMlData.event_id}</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">CLASSIFICATION:</span>
                    <span className="font-extrabold text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      {eventMlData.xgboost.classification}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">PROBABILITY:</span>
                    <span className="font-extrabold text-cyan-300 font-mono">{eventMlData.xgboost.probability}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECURITY EVENT HISTORY SECTION (For Active Patient) */}
      <div className="bg-[#0d1117] border border-cyan-500/30 rounded-xl p-5 shadow-xl font-mono text-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#1e293b] pb-3 gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Security Event History — {activePatientId}
            </h2>
          </div>
          
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 bg-[#161b22] border border-[#1e293b] p-1 rounded-lg">
            <button
              onClick={() => {
                setEventCategoryFilter('ATTACK');
                setEventLimit(10);
                const targetId = selectedEventId && selectedEventId.startsWith('EVT-SIM-') ? selectedEventId : undefined;
                if (!targetId) {
                  setSelectedEventId(null);
                  setEventMlData(null);
                }
                fetchPatientEvents(activePatientId, targetId, 'ATTACK', 10);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                eventCategoryFilter === 'ATTACK'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Simulated Attacks
            </button>
            <button
              onClick={() => {
                setEventCategoryFilter('BASELINE');
                setEventLimit(10);
                const targetId = selectedEventId && selectedEventId.startsWith('EVT-DEV-') ? selectedEventId : undefined;
                if (!targetId) {
                  setSelectedEventId(null);
                  setEventMlData(null);
                }
                fetchPatientEvents(activePatientId, targetId, 'BASELINE', 10);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                eventCategoryFilter === 'BASELINE'
                  ? 'bg-slate-700 text-slate-200 border border-slate-600 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Baseline Events
            </button>
            <button
              onClick={() => {
                setEventCategoryFilter('ALL');
                setEventLimit(10);
                fetchPatientEvents(activePatientId, selectedEventId || undefined, 'ALL', 10);
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                eventCategoryFilter === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Events
            </button>
          </div>
        </div>

        {loadingEvents && patientEvents.length === 0 ? (
          <div className="p-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Loading security event history for {activePatientId}...</span>
          </div>
        ) : patientEvents.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs space-y-1">
            <div className="font-bold text-slate-400">NO {eventCategoryFilter === 'ATTACK' ? 'SIMULATED ATTACKS' : 'SECURITY EVENTS'} GENERATED</div>
            <p className="text-[11px] text-slate-600">No matching security events found for patient {activePatientId}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {patientEvents.map((evt) => {
                const isEvtSelected = selectedEventId === evt.event_id;
                return (
                  <div
                    key={evt.event_id}
                    onClick={() => handleSelectEvent(evt.event_id)}
                    className={`border p-3 rounded-lg space-y-2 relative transition-all cursor-pointer ${
                      isEvtSelected
                        ? 'bg-cyan-500/10 border-cyan-500/70 shadow-lg shadow-cyan-500/10'
                        : 'bg-[#161b22] border-[#1e293b] hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider ${
                        evt.event_id.startsWith('EVT-SIM-')
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {evt.event_id.startsWith('EVT-SIM-') ? 'ATTACK / SECURITY EVENT' : 'BACKGROUND TELEMETRY'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        evt.severity === 'HIGH' || evt.severity === 'CRITICAL' 
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {evt.severity}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase">SCENARIO:</span>
                        <span className="text-slate-100 font-bold text-xs">{evt.scenario || 'Baseline / Not applicable'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase">EVENT TYPE:</span>
                        <span className="text-cyan-300 font-semibold text-[10px]">{evt.event_type}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">EVENT ID:</span>
                        <span className="text-cyan-400 font-mono font-bold">{evt.event_id}</span>
                      </div>
                      <div className="text-slate-400 text-[10px] border-t border-[#1e293b] pt-1">
                        Timestamp: {evt.formatted_timestamp || evt.timestamp}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Show More Button */}
            {patientEvents.length < totalEventCount && (
              <div className="text-center border-t border-[#1e293b] pt-3">
                <button
                  onClick={() => {
                    const newLimit = eventLimit + 10;
                    setEventLimit(newLimit);
                    fetchPatientEvents(activePatientId, selectedEventId || undefined, eventCategoryFilter, newLimit);
                  }}
                  disabled={loadingEvents}
                  className="px-4 py-2 bg-[#161b22] hover:bg-[#1e293b] border border-cyan-500/40 text-cyan-400 font-bold rounded-lg text-xs uppercase tracking-wider transition-all"
                >
                  {loadingEvents ? 'Loading...' : `Show More (+10 Events) • Showing ${patientEvents.length} of ${totalEventCount}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Exposure Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider">PATIENTS SCORED</span>
          <div className="text-2xl font-extrabold text-slate-100">{scoredCount}</div>
        </div>
        <div className="bg-[#0d1117] border border-cyan-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-cyan-400 font-semibold tracking-wider">AVERAGE FEC</span>
          <div className="text-2xl font-extrabold text-cyan-300">{avgFec.toFixed(1)}</div>
        </div>
        <div className="bg-[#0d1117] border border-rose-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-rose-400 font-semibold tracking-wider">HIGHEST FEC</span>
          <div className="text-2xl font-extrabold text-rose-400">{highestFec.toFixed(1)}</div>
        </div>
        <div className="bg-[#0d1117] border border-emerald-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-emerald-400 font-semibold tracking-wider">LOWEST FEC</span>
          <div className="text-2xl font-extrabold text-emerald-400">{lowestFec.toFixed(1)}</div>
        </div>
      </div>

      {/* Main FEC Patients Table */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl font-mono text-xs">
        <div className="p-4 border-b border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by ID or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#161b22] border border-[#1e293b] rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            <SlidersHorizontal className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400 font-bold">BAND:</span>
            <div className="flex rounded-lg bg-[#161b22] p-0.5 border border-[#1e293b]">
              {(['ALL', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as ExposureFilter[]).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setExposureFilter(filter)}
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer font-bold ${
                    exposureFilter === filter ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#161b22] border-b border-[#1e293b] text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                <th className="p-3 pl-4">Patient</th>
                <th className="p-3 text-center">FEC Score</th>
                <th className="p-3 text-center">Auth</th>
                <th className="p-3 text-center">Access</th>
                <th className="p-3 text-center">Records</th>
                <th className="p-3 text-center">Endpoints</th>
                <th className="p-3 text-center">Data Movement</th>
                <th className="p-3 text-left pl-6">Top Contributor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b] text-slate-300">
              {filteredRecords.map((f) => {
                const isSelected = activePatientId === f.patient_id;
                const badge = getExposureBadge(f.fec_score);
                const topContributor = getTopContributorName(f);
                return (
                  <tr
                    key={f.patient_id}
                    onClick={() => handleSelectPatient(f.patient_id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-cyan-500/10 text-cyan-200 font-bold' : 'hover:bg-[#161b22]'
                    }`}
                  >
                    <td className="p-3 pl-4">
                      <div className="font-bold text-cyan-400">{f.patient_id}</div>
                      <div className="text-[10px] text-slate-400">{f.display_name}</div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="font-extrabold text-slate-100 text-sm mb-1">{f.fec_score.toFixed(1)}</div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-300">{f.authentication_component.toFixed(1)}</td>
                    <td className="p-3 text-center font-semibold text-slate-300">{f.request_access_component.toFixed(1)}</td>
                    <td className="p-3 text-center font-semibold text-slate-300">{f.record_exposure_component.toFixed(1)}</td>
                    <td className="p-3 text-center font-semibold text-slate-300">{f.endpoint_anomaly_component.toFixed(1)}</td>
                    <td className="p-3 text-center font-semibold text-slate-300">{f.data_movement_component.toFixed(1)}</td>
                    <td className="p-3 text-left pl-6">
                      <span className="px-2 py-0.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-slate-300 font-semibold text-[10px]">
                        {topContributor}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
