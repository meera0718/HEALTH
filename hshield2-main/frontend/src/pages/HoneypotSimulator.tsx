import React, { useState, useEffect } from 'react';
import { Search, Eye, AlertCircle, RefreshCw, X } from 'lucide-react';
import { auth } from '../lib/auth';
import { sanitizeHoneypotLimit, sanitizeUrlLimit } from '../services/api';

export interface HoneypotEvent {
  event_id: string;
  patient_id: string;
  timestamp: string;
  event_type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: string;
  endpoint: string;
  session_id: string;
  device_id: string;
  request_count: number;
  records_accessed: number;
  failed_login_attempts: number;
  response_status: number;
  response_time_ms: number;
  user_agent: string;
  network_zone: string;
  is_anomalous_baseline: boolean;
  created_at?: string;
}

export interface HoneypotStats {
  total_events: number;
  patients_monitored: number;
  high_critical_events: number;
  anomalous_baseline_events: number;
}

export interface DevErrorInfo {
  status: number | string;
  endpoint: string;
  message: string;
}

export const HoneypotSimulator: React.FC = () => {
  const [events, setEvents] = useState<HoneypotEvent[]>([]);
  const [stats, setStats] = useState<HoneypotStats>({
    total_events: 0,
    patients_monitored: 30,
    high_critical_events: 0,
    anomalous_baseline_events: 0
  });
  const [isValidDataset, setIsValidDataset] = useState(true);

  // Reload trigger
  const [reloadKey, setReloadKey] = useState(0);

  // Simulation Modal states
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simPatientId, setSimPatientId] = useState(() => localStorage.getItem('healthx_selected_patient_id') || 'P001');
  const [simScenario, setSimScenario] = useState('BRUTE_FORCE');
  const [simFailedLogins, setSimFailedLogins] = useState(8);
  const [simRecordsAccessed, setSimRecordsAccessed] = useState(0);
  const [simRequestCount, setSimRequestCount] = useState(5);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simSuccessData, setSimSuccessData] = useState<any | null>(null);

  // Sync active patient context when simulation modal opens
  const openSimulationModal = () => {
    const activeId = localStorage.getItem('healthx_selected_patient_id') || 'P001';
    setSimPatientId(activeId);
    setSimError(null);
    setSimSuccessData(null);
    setIsSimulateOpen(true);
  };

  const handleScenarioSelect = (scenario: string) => {
    setSimScenario(scenario);
    if (scenario === 'BRUTE_FORCE') {
      setSimFailedLogins(8);
      setSimRecordsAccessed(0);
      setSimRequestCount(5);
    } else if (scenario === 'RECONNAISSANCE' || scenario === 'ENDPOINT_DISCOVERY') {
      setSimFailedLogins(0);
      setSimRecordsAccessed(0);
      setSimRequestCount(25);
    } else if (scenario === 'SUSPICIOUS_DATA_ACCESS') {
      setSimFailedLogins(0);
      setSimRecordsAccessed(250);
      setSimRequestCount(10);
    } else if (scenario === 'DATA_EXFILTRATION') {
      setSimFailedLogins(0);
      setSimRecordsAccessed(1000);
      setSimRequestCount(30);
    } else if (scenario === 'PRIVILEGE_ESCALATION') {
      setSimFailedLogins(0);
      setSimRecordsAccessed(0);
      setSimRequestCount(5);
    } else if (scenario === 'SUSPICIOUS_DOWNLOAD') {
      setSimFailedLogins(0);
      setSimRecordsAccessed(500);
      setSimRequestCount(15);
    }
  };

  const triggerSimulation = async () => {
    setSimulating(true);
    setSimError(null);
    setSimSuccessData(null);
    
    try {
      const headers = getHeaders();
      const payload = {
        patient_id: simPatientId,
        scenario: simScenario,
        failed_login_attempts: Number(simFailedLogins),
        records_accessed: Number(simRecordsAccessed),
        request_count: Number(simRequestCount)
      };

      let res = await fetch('/api/v1/honeypot/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch('/api/honeypot/simulate', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }
      
      if (!res.ok) {
        throw new Error('Simulation API request failed.');
      }
      
      const data = await res.json();
      if (!data.success) {
        throw new Error('Simulation execution failed.');
      }
      
      const createdEvent = data.event;
      const patientId = createdEvent.patient_id;
      const eventId = createdEvent.event_id;
      
      localStorage.setItem('healthx_selected_patient_id', patientId);
      setSimSuccessData(data);
      setReloadKey(prev => prev + 1);
      
      // Dispatch window event for CommandCenter auto-refresh
      window.dispatchEvent(new CustomEvent('honeypot-simulation-success', {
        detail: {
          patient_id: patientId,
          event_id: eventId,
          fusion: data.fusion_pipeline
        }
      }));
    } catch (err: any) {
      setSimError(err?.message || 'Unable to create simulation event.');
    } finally {
      setSimulating(false);
    }
  };

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('ALL');
  const [selectedEventType, setSelectedEventType] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');

  // Event Detail Modal (Centered Overlay)
  const [selectedEvent, setSelectedEvent] = useState<HoneypotEvent | null>(null);
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false);

  // Patient Event History Modal (Centered Overlay)
  const [historyPatientId, setHistoryPatientId] = useState<string | null>(null);
  const [historyEvents, setHistoryEvents] = useState<HoneypotEvent[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // UI States & Dev Diagnostics
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [devErrorInfo, setDevErrorInfo] = useState<DevErrorInfo | null>(null);

  // Helper for auth headers
  const getHeaders = () => {
    const token = auth.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Load honeypot data from backend API whenever filters or search query changes
  useEffect(() => {
    let isMounted = true;

    async function loadHoneypotData() {
      try {
        setIsLoading(true);
        setHasError(false);
        setDevErrorInfo(null);

        const headers = getHeaders();

        // 1. Fetch Summary Stats
        try {
          const statsRes = await fetch('/api/honeypot/stats', { headers });
          if (statsRes.ok && isMounted) {
            const statsData = await statsRes.json();
            setStats(statsData);
          } else {
            const fallbackStats = await fetch('/api/v1/honeypot/stats', { headers });
            if (fallbackStats.ok && isMounted) {
              setStats(await fallbackStats.json());
            }
          }
        } catch {
          // ignore minor stats error
        }

        // 2. Fetch Validation Status
        try {
          const valRes = await fetch('/api/honeypot/validate', { headers });
          if (valRes.ok && isMounted) {
            const valData = await valRes.json();
            setIsValidDataset(valData.is_valid);
          } else {
            const fallbackVal = await fetch('/api/v1/honeypot/validate', { headers });
            if (fallbackVal.ok && isMounted) {
              const valData = await fallbackVal.json();
              setIsValidDataset(valData.is_valid);
            }
          }
        } catch {
          // ignore minor validation status error
        }

        // 3. Fetch Honeypot Security Events with Query Parameters
        const params = new URLSearchParams();
        const normQuery = searchQuery.trim();
        if (normQuery) params.append('search', normQuery);
        if (selectedPatientId !== 'ALL') params.append('patient_id', selectedPatientId);
        if (selectedEventType !== 'ALL') params.append('event_type', selectedEventType);
        if (selectedSeverity !== 'ALL') params.append('severity', selectedSeverity);
        const safeLimit = sanitizeHoneypotLimit(500);
        params.append('limit', safeLimit.toString());

        const primaryEndpoint = sanitizeUrlLimit(`/api/honeypot/events?${params.toString()}`);
        console.log(`[DEV DEBUG] Requesting Honeypot API: ${primaryEndpoint} | Search: "${normQuery}" | Patient: "${selectedPatientId}"`);

        let eventsRes = await fetch(primaryEndpoint, { headers });

        // Fallback to /api/v1/honeypot/events if /api/honeypot/events returned 404
        if (!eventsRes.ok && eventsRes.status === 404) {
          const fallbackEndpoint = sanitizeUrlLimit(`/api/v1/honeypot/events?${params.toString()}`);
          console.log(`[DEV DEBUG] Retrying via fallback route: ${fallbackEndpoint}`);
          eventsRes = await fetch(fallbackEndpoint, { headers });
        }

        if (eventsRes.ok && isMounted) {
          const eventsData = await eventsRes.json();
          const loadedEvts = eventsData.events || [];
          setEvents(loadedEvts);
          console.log(`[DEV DEBUG] Events loaded: ${loadedEvts.length} | Total matching in DB: ${eventsData.total || eventsData.total_events}`);
        } else if (isMounted) {
          const errText = await eventsRes.text().catch(() => 'Failed to parse error response body');
          setHasError(true);
          setDevErrorInfo({
            status: eventsRes.status,
            endpoint: primaryEndpoint,
            message: errText || eventsRes.statusText || 'Backend returned non-200 HTTP status'
          });
          console.error(`[DEV DEBUG] HONEYPOT API ERROR - Status ${eventsRes.status}: ${errText}`);
        }
      } catch (err: any) {
        console.error("[DEV DEBUG] Unable to load honeypot events from API", err);
        if (isMounted) {
          setHasError(true);
          setDevErrorInfo({
            status: 'NETWORK_ERROR',
            endpoint: '/api/honeypot/events',
            message: err?.message || 'Failed to establish connection to backend API server.'
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadHoneypotData();

    return () => {
      isMounted = false;
    };
  }, [searchQuery, selectedPatientId, selectedEventType, selectedSeverity, reloadKey]);

  // Client-side safety normalization filter
  const filteredEvents = events.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (e.event_id && e.event_id.toLowerCase().includes(q)) ||
      (e.patient_id && e.patient_id.toLowerCase().includes(q)) ||
      (e.source && e.source.toLowerCase().includes(q)) ||
      (e.endpoint && e.endpoint.toLowerCase().includes(q)) ||
      (e.session_id && e.session_id.toLowerCase().includes(q))
    );
  });

  const getSeverityBadgeStyle = (severity: string) => {
    switch (severity) {
      case 'INFO':
        return 'bg-slate-500/15 border-slate-500/40 text-slate-400';
      case 'LOW':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400';
      case 'MEDIUM':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-400';
      case 'HIGH':
        return 'bg-orange-500/15 border-orange-500/40 text-orange-400';
      case 'CRITICAL':
        return 'bg-rose-500/15 border-rose-500/40 text-rose-400';
      default:
        return 'bg-slate-500/15 border-slate-500/40 text-slate-400';
    }
  };

  const handleOpenPatientHistory = async (patientId: string) => {
    const cleanId = patientId.trim().toUpperCase();
    console.log(`[DEV DEBUG] Requested patient history API: /api/honeypot/events/patient/${cleanId}`);
    setHistoryPatientId(cleanId);
    setIsHistoryOpen(true);
    try {
      const headers = getHeaders();
      let res = await fetch(`/api/honeypot/events/patient/${cleanId}`, { headers });
      if (!res.ok && res.status === 404) {
        res = await fetch(`/api/v1/honeypot/events/patient/${cleanId}`, { headers });
      }
      if (res.ok) {
        const data = await res.json();
        const evts = data.events || [];
        setHistoryEvents(evts);
        console.log(`[DEV DEBUG] Patient history returned ${evts.length} events for ${cleanId}`);
      }
    } catch (err) {
      console.warn("Failed to fetch patient history", err);
    }
  };

  const handleOpenEventDetail = (evt: HoneypotEvent) => {
    console.log(`[DEV DEBUG] Viewing event detail for ${evt.event_id}`);
    setSelectedEvent(evt);
    setIsEventDetailOpen(true);
  };

  const formatTimestamp = (tsStr: string) => {
    try {
      const d = new Date(tsStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + d.toLocaleDateString();
    } catch {
      return tsStr;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100">
      {/* Page Header */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
            HEALTHTECH SHIELD · RESEARCH PLATFORM
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5">
            Synthetic Honeypot Event Generator
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Controlled cybersecurity event simulator generating non-PHI synthetic telemetry associated with existing cohort patients.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            onClick={openSimulationModal}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer transition-all border border-indigo-400/40 shadow-md shadow-indigo-600/30"
          >
            SIMULATE ACTIVITY
          </button>
          
          {isValidDataset ? (
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

      {/* Honeypot Summary Stats (4 Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 font-mono">
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider">TOTAL EVENTS</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">{stats.total_events.toLocaleString()}</div>
          <span className="text-[10px] text-cyan-400">Target ≥ 3,000 Events</span>
        </div>

        <div className="bg-[#0d1117] border border-cyan-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-cyan-400 font-semibold tracking-wider">PATIENTS MONITORED</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-cyan-300">{stats.patients_monitored}</div>
          <span className="text-[10px] text-slate-400">P001 – P030</span>
        </div>

        <div className="bg-[#0d1117] border border-rose-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-rose-400 font-semibold tracking-wider">HIGH / CRITICAL</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-400">{stats.high_critical_events}</div>
          <span className="text-[10px] text-slate-400">Severe Activity</span>
        </div>

        <div className="bg-[#0d1117] border border-amber-500/30 rounded-xl p-4 space-y-1 shadow-lg">
          <span className="text-[10px] text-amber-400 font-semibold tracking-wider">ANOMALOUS BASELINE</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400">{stats.anomalous_baseline_events}</div>
          <span className="text-[10px] text-slate-400">Simulation Labels</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Field */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient ID (e.g. P001, P015, P030), event ID, source..."
              className="w-full bg-[#161b22] border border-[#1e293b] text-xs text-slate-100 pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:border-cyan-500 placeholder-slate-500 font-mono"
            />
          </div>

          {/* Patient Selector Filter */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500 text-[11px]">PATIENT:</span>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="bg-[#161b22] border border-[#1e293b] text-xs text-cyan-300 py-1.5 px-3 rounded-lg focus:outline-none focus:border-cyan-500 font-mono cursor-pointer"
            >
              <option value="ALL">ALL PATIENTS (30)</option>
              {Array.from({ length: 30 }, (_, idx) => {
                const id = `P${String(idx + 1).padStart(3, '0')}`;
                return <option key={id} value={id}>{id}</option>;
              })}
            </select>
          </div>

          {/* Event Type Filter */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500 text-[11px]">EVENT TYPE:</span>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="bg-[#161b22] border border-[#1e293b] text-xs text-cyan-300 py-1.5 px-3 rounded-lg focus:outline-none focus:border-cyan-500 font-mono cursor-pointer"
            >
              <option value="ALL">ALL TYPES</option>
              <option value="NORMAL_LOGIN">NORMAL_LOGIN</option>
              <option value="FAILED_LOGIN">FAILED_LOGIN</option>
              <option value="API_REQUEST">API_REQUEST</option>
              <option value="RECORD_ACCESS">RECORD_ACCESS</option>
              <option value="SESSION_START">SESSION_START</option>
              <option value="SESSION_END">SESSION_END</option>
              <option value="UNUSUAL_ACCESS_TIME">UNUSUAL_ACCESS_TIME</option>
              <option value="ENDPOINT_DISCOVERY">ENDPOINT_DISCOVERY</option>
              <option value="SUSPICIOUS_DOWNLOAD">SUSPICIOUS_DOWNLOAD</option>
              <option value="DEVICE_CHANGE">DEVICE_CHANGE</option>
              <option value="PRIVILEGE_ESCALATION_ATTEMPT">PRIVILEGE_ESCALATION_ATTEMPT</option>
              <option value="DATA_EXPORT">DATA_EXPORT</option>
            </select>
          </div>
        </div>

        {/* Severity Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto font-mono text-[11px] pt-1 border-t border-[#1e293b]/60">
          <span className="text-slate-500 mr-1">SEVERITY:</span>
          {['ALL', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-3 py-1 rounded-lg border transition-all cursor-pointer font-bold whitespace-nowrap ${
                selectedSeverity === sev
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-500/20'
                  : 'bg-[#161b22] border-[#1e293b] text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Honeypot Security Event Grid Table (Primary Visual Element) */}
      <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-[#161b22] text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-[#1e293b]">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Event ID</th>
                <th className="px-4 py-3">Patient ID</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Source IP</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1e293b] text-slate-200 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400 font-mono text-xs">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                      <span className="text-slate-300 font-semibold">Loading honeypot events...</span>
                    </div>
                  </td>
                </tr>
              ) : hasError ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-rose-400 font-mono text-xs">
                    <div className="max-w-xl mx-auto bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-left space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>HONEYPOT API ERROR</span>
                      </div>
                      <p className="text-slate-300 text-xs">Unable to load honeypot events.</p>
                      {devErrorInfo && (
                        <div className="bg-[#0d1117] p-3 rounded border border-rose-900/60 font-mono text-[11px] text-slate-400 space-y-1">
                          <div><span className="text-slate-500">Status:</span> <span className="text-rose-400 font-bold">{devErrorInfo.status}</span></div>
                          <div><span className="text-slate-500">Endpoint:</span> <span className="text-cyan-400">{devErrorInfo.endpoint}</span></div>
                          <div><span className="text-slate-500">Message:</span> <span className="text-slate-300">{devErrorInfo.message}</span></div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400 font-mono text-xs">
                    No honeypot events found.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt) => (
                  <tr
                    key={evt.event_id}
                    onClick={() => handleOpenEventDetail(evt)}
                    className="hover:bg-[#161b22]/90 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {formatTimestamp(evt.timestamp)}
                    </td>

                    <td className="px-4 py-3 font-bold text-cyan-400 group-hover:underline">
                      {evt.event_id}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPatientHistory(evt.patient_id);
                        }}
                        className="px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold cursor-pointer"
                        title={`Click to view patient ${evt.patient_id} event history`}
                      >
                        {evt.patient_id}
                      </button>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-300">
                      {evt.event_type}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${getSeverityBadgeStyle(evt.severity)}`}>
                        {evt.severity}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {evt.source}
                    </td>

                    <td className="px-4 py-3 text-slate-300 text-[11px] max-w-xs truncate">
                      {evt.endpoint}
                    </td>

                    <td className="px-4 py-3 text-slate-400 text-[11px]">
                      {evt.session_id}
                    </td>

                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEventDetail(evt);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-[#1e293b] text-slate-300 font-mono text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span>DETAILS</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPatientHistory(evt.patient_id);
                        }}
                        className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] font-bold cursor-pointer"
                      >
                        <span>HISTORY</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Details Centered Modal */}
      {isEventDetailOpen && selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setIsEventDetailOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-[#0d1117] border border-[#1e293b] rounded-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-sm font-bold text-cyan-400">{selectedEvent.event_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSeverityBadgeStyle(selectedEvent.severity)}`}>
                    {selectedEvent.severity}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    {selectedEvent.event_type}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-100 mt-1">Honeypot Security Event Details</h2>
              </div>

              <button
                onClick={() => setIsEventDetailOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-slate-400 hover:text-white font-mono text-xs cursor-pointer"
              >
                CLOSE [×]
              </button>
            </div>

            {/* 17 Stored Event Fields Display */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#161b22] p-4 rounded-xl border border-[#1e293b] text-xs font-mono">
              <div>
                <span className="text-slate-500 block text-[10px]">EVENT ID</span>
                <span className="font-semibold text-cyan-400">{selectedEvent.event_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">PATIENT ID</span>
                <span className="font-semibold text-slate-200">{selectedEvent.patient_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TIMESTAMP</span>
                <span className="font-semibold text-slate-200">{formatTimestamp(selectedEvent.timestamp)}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px]">EVENT TYPE</span>
                <span className="font-semibold text-slate-200">{selectedEvent.event_type}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">SEVERITY</span>
                <span className="font-semibold text-amber-400">{selectedEvent.severity}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">SOURCE IP</span>
                <span className="font-semibold text-slate-200">{selectedEvent.source}</span>
              </div>

              <div className="col-span-2">
                <span className="text-slate-500 block text-[10px]">ENDPOINT</span>
                <span className="font-semibold text-slate-200 truncate block">{selectedEvent.endpoint}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">SESSION ID</span>
                <span className="font-semibold text-slate-200">{selectedEvent.session_id}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px]">DEVICE ID</span>
                <span className="font-semibold text-slate-200">{selectedEvent.device_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">REQUEST COUNT</span>
                <span className="font-semibold text-slate-200">{selectedEvent.request_count}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">RECORDS ACCESSED</span>
                <span className="font-semibold text-slate-200">{selectedEvent.records_accessed}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px]">FAILED LOGINS</span>
                <span className="font-semibold text-slate-200">{selectedEvent.failed_login_attempts}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">RESPONSE STATUS</span>
                <span className="font-semibold text-slate-200">{selectedEvent.response_status}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">RESPONSE TIME</span>
                <span className="font-semibold text-slate-200">{selectedEvent.response_time_ms} ms</span>
              </div>

              <div className="col-span-2">
                <span className="text-slate-500 block text-[10px]">USER AGENT</span>
                <span className="font-semibold text-slate-300 text-[10px] truncate block">{selectedEvent.user_agent}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">NETWORK ZONE</span>
                <span className="font-semibold text-slate-200">{selectedEvent.network_zone}</span>
              </div>

              <div className="col-span-3 pt-2 border-t border-[#1e293b]/60 flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">SYNTHETIC ANOMALY BASELINE LABEL:</span>
                {selectedEvent.is_anomalous_baseline ? (
                  <span className="px-2.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[11px] font-bold">
                    ANOMALOUS (TRUE)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
                    NORMAL (FALSE)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Event History Centered Modal */}
      {isHistoryOpen && historyPatientId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
          onClick={() => setIsHistoryOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-[#0d1117] border border-[#1e293b] rounded-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5 shadow-2xl relative animate-in zoom-in-95 duration-200 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
              <div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-sm font-bold text-cyan-400">{historyPatientId}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    PATIENT EVENT HISTORY
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ({historyEvents.length} recorded synthetic events)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Chronological simulated telemetry generated by honeypot simulator for patient {historyPatientId}.
                </p>
              </div>

              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] text-slate-400 hover:text-white font-mono text-xs cursor-pointer"
              >
                CLOSE [×]
              </button>
            </div>

            {/* Patient Event History Table */}
            <div className="bg-[#161b22] border border-[#1e293b] rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0d1117] text-slate-400 text-[10px] uppercase tracking-wider border-b border-[#1e293b] sticky top-0">
                    <tr>
                      <th className="px-3 py-2.5">Timestamp</th>
                      <th className="px-3 py-2.5">Event Type</th>
                      <th className="px-3 py-2.5">Severity</th>
                      <th className="px-3 py-2.5">Session ID</th>
                      <th className="px-3 py-2.5">Req Count</th>
                      <th className="px-3 py-2.5">Records</th>
                      <th className="px-3 py-2.5">Failed Logins</th>
                      <th className="px-3 py-2.5">Anomaly Flag</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#1e293b]/60 text-slate-200">
                    {historyEvents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                          Loading events for {historyPatientId}...
                        </td>
                      </tr>
                    ) : (
                      historyEvents.map((h) => (
                        <tr key={h.event_id} className="hover:bg-[#1f293d]/50">
                          <td className="px-3 py-2 text-slate-400 text-[10px]">
                            {formatTimestamp(h.timestamp)}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-200">
                            {h.event_type}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold border ${getSeverityBadgeStyle(h.severity)}`}>
                              {h.severity}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-[10px]">
                            {h.session_id}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {h.request_count}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {h.records_accessed}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {h.failed_login_attempts}
                          </td>
                          <td className="px-3 py-2">
                            {h.is_anomalous_baseline ? (
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[9px] font-bold">
                                ANOMALOUS
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[9px] font-bold">
                                NORMAL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Modal Overlay */}
      {isSimulateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0d1117] border border-[#1e293b] rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl relative text-slate-200">
            
            <button 
              onClick={() => {
                setIsSimulateOpen(false);
                setSimError(null);
                setSimSuccessData(null);
              }}
              className="absolute right-4 top-4 p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-sm font-mono font-bold text-cyan-400 uppercase tracking-wider">
              Simulate Telemetry Event
            </h2>

            {/* Error State */}
            {simError && (
              <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-4 text-xs space-y-3 font-mono">
                <p className="text-rose-400 font-bold">{simError}</p>
                <div className="flex gap-2">
                  <button 
                    onClick={triggerSimulation}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    RETRY
                  </button>
                  <button 
                    onClick={() => {
                      setSimError(null);
                      setIsSimulateOpen(false);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {/* Success State */}
            {simSuccessData && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 text-xs space-y-3 font-mono">
                <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-emerald-500/30 pb-2">
                  <span>✓ REAL SECURITY EVENT CREATED</span>
                  <span className="text-[10px] text-cyan-300 font-extrabold">{simSuccessData.event?.event_id || simSuccessData.event_id}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
                  <div>Target Patient: <span className="text-white font-bold">{simSuccessData.event?.patient_id || simSuccessData.patient_id}</span></div>
                  <div>Scenario: <span className="text-white font-bold">{simScenario}</span></div>
                  <div>Event Type: <span className="text-white font-bold">{simSuccessData.event?.event_type || simSuccessData.event_type}</span></div>
                  <div>Severity: <span className="text-amber-400 font-bold">{simSuccessData.event?.severity || 'HIGH'}</span></div>
                  {simSuccessData.fusion_pipeline?.fusion_result && (
                    <>
                      <div>Threat Index: <span className="text-rose-400 font-extrabold">{simSuccessData.fusion_pipeline.fusion_result.threat_index}</span></div>
                      <div>Fusion Verdict: <span className="text-cyan-300 font-bold">{simSuccessData.fusion_pipeline.fusion_result.verdict}</span></div>
                    </>
                  )}
                </div>
                <div className="pt-2 border-t border-emerald-500/30 flex gap-2">
                  <button
                    onClick={() => {
                      setSimSuccessData(null);
                      setIsSimulateOpen(false);
                    }}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono font-bold text-[11px] cursor-pointer transition-colors"
                  >
                    CLOSE & VIEW IN PIPELINE
                  </button>
                </div>
              </div>
            )}

            {/* Input State */}
            {!simError && !simSuccessData && (
              <div className="space-y-4 font-mono text-xs">
                {/* Target Patient Selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-400 font-semibold uppercase">Target Patient</label>
                    <span className="text-[10px] text-cyan-400 font-bold">PRESERVED CONTEXT: {simPatientId}</span>
                  </div>
                  <select
                    value={simPatientId}
                    onChange={(e) => {
                      setSimPatientId(e.target.value);
                      localStorage.setItem('healthx_selected_patient_id', e.target.value);
                    }}
                    className="w-full bg-[#161b22] border border-[#1e293b] text-cyan-300 py-2 px-3 rounded-lg focus:outline-none focus:border-cyan-500 cursor-pointer font-bold"
                  >
                    {Array.from({ length: 30 }, (_, idx) => {
                      const id = `P${String(idx + 1).padStart(3, '0')}`;
                      return <option key={id} value={id}>Patient {id}</option>;
                    })}
                  </select>
                </div>

                {/* Attack Scenario Selector - All 7 Options */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold uppercase">Attack Scenario (7/7 Available)</label>
                  <select
                    value={simScenario}
                    onChange={(e) => handleScenarioSelect(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#1e293b] text-cyan-300 py-2 px-3 rounded-lg focus:outline-none focus:border-cyan-500 cursor-pointer font-bold"
                  >
                    <option value="BRUTE_FORCE">1. BRUTE_FORCE (Failed Login Flood)</option>
                    <option value="RECONNAISSANCE">2. RECONNAISSANCE (Admin Scanning)</option>
                    <option value="SUSPICIOUS_DATA_ACCESS">3. SUSPICIOUS_DATA_ACCESS (Off-Hours Access)</option>
                    <option value="DATA_EXFILTRATION">4. DATA_EXFILTRATION (Bulk DB Export)</option>
                    <option value="PRIVILEGE_ESCALATION">5. PRIVILEGE_ESCALATION (Role Escalation Probe)</option>
                    <option value="ENDPOINT_DISCOVERY">6. ENDPOINT_DISCOVERY (API Probing)</option>
                    <option value="SUSPICIOUS_DOWNLOAD">7. SUSPICIOUS_DOWNLOAD (Mass File Retrieval)</option>
                  </select>
                </div>

                {/* Attack Intensity Parameters */}
                <div className="p-3 bg-[#161b22] border border-[#1e293b] rounded-lg space-y-3">
                  <div className="text-[11px] font-bold text-slate-300 border-b border-[#1e293b] pb-1.5">
                    ATTACK INTENSITY CHARACTERISTICS
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">FAILED LOGINS</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={simFailedLogins}
                        onChange={(e) => setSimFailedLogins(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#0d1117] border border-[#1e293b] text-slate-200 text-xs px-2 py-1.5 rounded focus:border-cyan-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">RECORDS ACCESSED</label>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={simRecordsAccessed}
                        onChange={(e) => setSimRecordsAccessed(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-[#0d1117] border border-[#1e293b] text-slate-200 text-xs px-2 py-1.5 rounded focus:border-cyan-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">REQUEST COUNT</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={simRequestCount}
                        onChange={(e) => setSimRequestCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-[#0d1117] border border-[#1e293b] text-slate-200 text-xs px-2 py-1.5 rounded focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 font-mono text-xs pt-2">
                  <button
                    disabled={simulating}
                    onClick={triggerSimulation}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-md shadow-indigo-600/30"
                  >
                    {simulating ? 'EXECUTING PIPELINE...' : '🚀 EXECUTE ATTACK SIMULATION'}
                  </button>
                  <button
                    disabled={simulating}
                    onClick={() => setIsSimulateOpen(false)}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 rounded-lg font-bold disabled:opacity-40 cursor-pointer transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
