import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, RefreshCw, Terminal, ShieldCheck, 
  Network, Boxes, AlertTriangle, ArrowRight, Search, ShieldAlert
} from 'lucide-react';
import { useCommandCenterData } from '../hooks/useCommandCenterData';
import { 
  resolveWhySentence,
  resolveDeviceLabel
} from '../components/common/PatientSafetyImpactCard';

interface CommandCenterProps {
  onSelectTab?: (tab: string, eventId?: string, patientId?: string) => void;
  onSelectEvent?: (eventId: string, patientId?: string) => void;
  incidents?: any[];
  onSelectIncident?: (id: string) => void;
  activityLogs?: any[];
}

// Attack type normalization
function normalizeAttackType(scenario?: string, eventType?: string): string {
  const str = `${scenario || ''} ${eventType || ''}`.toUpperCase().replace(/[-_]/g, ' ');
  if (str.includes('EXFIL') || str.includes('EXPORT') || str.includes('DATA DUMP')) return 'DATA_EXFILTRATION';
  if (str.includes('BRUTE') || str.includes('PASSWORD') || str.includes('CREDENTIAL')) return 'BRUTE_FORCE';
  if (str.includes('RECON') || str.includes('DISCOVERY') || str.includes('PORT SCAN') || str.includes('ENUMERATION')) return 'RECONNAISSANCE';
  if (str.includes('PRIVILEGE') || str.includes('ELEVAT') || str.includes('ADMIN ACCESS') || str.includes('ABUSE')) return 'PRIVILEGE_ABUSE';
  if (str.includes('SUSPICIOUS DATA') || str.includes('UNAUTHORIZED ACCESS') || str.includes('RECORD ACCESS')) return 'SUSPICIOUS_DATA_ACCESS';
  return (scenario || eventType || 'BRUTE_FORCE').toUpperCase().replace(/ /g, '_');
}

function formatAttackTypeLabel(attackType: string): string {
  switch (attackType) {
    case 'DATA_EXFILTRATION': return 'DATA EXFILTRATION';
    case 'BRUTE_FORCE': return 'BRUTE FORCE';
    case 'RECONNAISSANCE': return 'RECONNAISSANCE';
    case 'PRIVILEGE_ABUSE': return 'PRIVILEGE ABUSE';
    case 'SUSPICIOUS_DATA_ACCESS': return 'SUSPICIOUS DATA ACCESS';
    default: return attackType.replace(/_/g, ' ');
  }
}

// Dynamically attack-aware WHY generator
function getDynamicWhySentence(attackType: string, endpoint?: string, deviceLabel?: string, whySentenceFallback?: string): string {
  switch (attackType) {
    case 'BRUTE_FORCE':
      return 'Unusual authentication activity detected on a clinically critical device.';
    case 'DATA_EXFILTRATION':
      return 'Abnormally high volume of outbound record transfers exceeding baseline telemetry.';
    case 'RECONNAISSANCE':
      return 'Systematic API endpoint enumeration and port discovery scanning internal hospital infrastructure.';
    case 'PRIVILEGE_ABUSE':
      return 'Unauthorized administrative elevation and role escalation attempt bypassing access control.';
    case 'SUSPICIOUS_DATA_ACCESS':
      return 'Anomalous query pattern accessing protected patient electronic records outside clinical hours.';
    default:
      return whySentenceFallback || `Anomalous activity detected targeting ${endpoint || 'clinical endpoint'} on ${deviceLabel || 'monitored asset'}.`;
  }
}

// Dynamically clinical-aware IMPACT generator
function getDynamicImpactSentence(patientImpact: any, incidentContext: any, deviceLabel: string): string {
  const dCrit = (patientImpact?.device_criticality || 'LOW').toUpperCase();
  const pDep = (patientImpact?.patient_dependency || 'LOW').toUpperCase();
  const zone = incidentContext?.hospital_zone || '';
  const isIcu = zone === 'ZONE-ICU' || dCrit === 'CRITICAL';

  if (isIcu) {
    return 'ICU monitoring device with critical patient dependency.';
  }
  if (dCrit === 'HIGH' || pDep === 'HIGH') {
    return 'Bedside clinical telemetry unit with direct inpatient dependency.';
  }
  if (dCrit === 'MODERATE') {
    return `Diagnostic support terminal (${deviceLabel}) with clinical workflow queuing dependency.`;
  }
  return 'Administrative endpoint with zero direct patient care dependency.';
}

// Dynamically attack-aware & clinical-preservation-aware RESPONSE generator
function getDynamicResponseSentence(attackType: string, patientImpact: any): string {
  const dCrit = (patientImpact?.device_criticality || 'LOW').toUpperCase();
  const isClinical = dCrit === 'CRITICAL' || dCrit === 'HIGH' || dCrit === 'MODERATE';

  switch (attackType) {
    case 'BRUTE_FORCE':
      return isClinical
        ? 'Restrict suspicious network communication while preserving clinical operation.'
        : 'Quarantine host from network perimeter and revoke compromised authentication tokens.';
    case 'DATA_EXFILTRATION':
      return isClinical
        ? 'Throttle egress data transfer channel while preserving real-time bedside telemetry.'
        : 'Block outbound data export gateway and enforce forensic packet capture.';
    case 'RECONNAISSANCE':
      return isClinical
        ? 'Apply microsegmentation firewall rules while preserving diagnostic telemetry routes.'
        : 'Isolate scanning IP and terminate unauthorized port probe sessions.';
    case 'PRIVILEGE_ABUSE':
      return isClinical
        ? 'Revoke administrative session privileges while maintaining baseline clinical software execution.'
        : 'Revoke elevated tokens immediately and isolate user account from administrative domain.';
    case 'SUSPICIOUS_DATA_ACCESS':
      return isClinical
        ? 'Restrict record access permissions while preserving emergency clinical chart viewing.'
        : 'Suspend unauthorized database query session and preserve immutable audit logs.';
    default:
      return isClinical
        ? 'Restrict suspicious network communication while preserving clinical operation.'
        : 'Quarantine host and preserve digital evidence for forensic review.';
  }
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ 
  onSelectTab, 
  onSelectEvent, 
  onSelectIncident 
}) => {
  const { 
    health, reporting, detections, events, devices, 
    loading, refreshNow, lastSync 
  } = useCommandCenterData(5000);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetailData, setPatientDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [isForensicDrawerOpen, setIsForensicDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Vector Intelligence State for Compact Card
  const [similarityData, setSimilarityData] = useState<any | null>(null);

  // Async Race Protection Refs
  const latestRequestedEventIdRef = useRef<string | null>(null);
  const latestInspectedEventIdRef = useRef<string | null>(null);

  // Load Event Pipeline & Vector Intelligence for Selected Event
  const loadEventDetails = async (evtId: string, patientId?: string) => {
    latestInspectedEventIdRef.current = evtId;
    setLoadingDetail(true);

    loadVectorSummary(evtId);

    // Bounded retry logic for fresh Honeypot events
    let pipe = null;
    let vec = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (latestInspectedEventIdRef.current !== evtId) return;

      try {
        const [pipeRes, vecRes] = await Promise.all([
          fetch(`/api/v1/detection-pipeline/event/${evtId}`),
          fetch(`/api/v1/vector/embedding/${evtId}`)
        ]);

        if (latestInspectedEventIdRef.current !== evtId) return;

        if (pipeRes.ok) {
          pipe = await pipeRes.json();
        }
        if (vecRes.ok) {
          vec = await vecRes.json();
        }

        if (pipe) break;
      } catch {
        // network retry
      }

      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    if (latestInspectedEventIdRef.current !== evtId) return;

    if (pipe) {
      setPatientDetailData({ pipeline: pipe, vector: vec });

      // Trigger FEC update for the target patient
      const targetPatient = pipe.patient_id || patientId;
      if (targetPatient) {
        try {
          await fetch(`/api/v1/fec/patients/${targetPatient}`);
        } catch {
          // ignore FEC fetch failure
        }
      }
    } else {
      setPatientDetailData(null);
    }
    setLoadingDetail(false);
  };

  // Helper to exclude mock incidents from UI if needed
  const isExcludedIncident = (id?: string, title?: string, type?: string) => {
    const sId = (id || '').toUpperCase();
    const sTitle = (title || '').toUpperCase();
    const sType = (type || '').toUpperCase();
    return (
      sId.includes('0421') || sId.includes('0241') ||
      sId.includes('0420') || sId.includes('0240') ||
      sId.includes('0439') || sId.includes('0239') ||
      sTitle.includes('SUSPICIOUS DATABASE ACCESS') ||
      sType.includes('SUSPICIOUS DATABASE ACCESS')
    );
  };

  const validEvents = events.filter(e => !isExcludedIncident(e.event_id, e.event_type, e.endpoint));

  // Filtered event list based on live search
  const filteredEvents = validEvents.filter(e => 
    e.event_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.patient_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.event_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto-initialize selected event to latest event when data loads
  useEffect(() => {
    if (!selectedEventId && validEvents.length > 0) {
      const initialEvt = validEvents[0];
      setSelectedEventId(initialEvt.event_id);
      setSelectedPatientId(initialEvt.patient_id);
      loadEventDetails(initialEvt.event_id, initialEvt.patient_id);
    }
  }, [validEvents, selectedEventId]);

  // Load Compact Vector Summary for Selected Event
  const loadVectorSummary = async (evtId: string) => {
    latestRequestedEventIdRef.current = evtId;
    try {
      const simRes = await fetch(`/api/v1/vector/similarity/${evtId}?limit=5`);

      if (latestRequestedEventIdRef.current !== evtId) return;

      if (simRes.ok) setSimilarityData(await simRes.json());
    } catch (err) {
      console.error('[CommandCenter] Vector summary load error:', err);
    }
  };

  // Select event to update operational console view
  const handleSelectEvent = (evtId: string, patientId: string) => {
    if (selectedEventId === evtId) return;
    if (onSelectEvent) onSelectEvent(evtId);
    if (onSelectIncident) onSelectIncident(evtId);
    setSelectedEventId(evtId);
    setSelectedPatientId(patientId);
    loadEventDetails(evtId, patientId);
  };

  // Inspect specific event from event stream table (opens drawer)
  const handleInspectEvent = async (evtId: string, patientId: string) => {
    if (onSelectEvent) onSelectEvent(evtId);
    if (onSelectIncident) onSelectIncident(evtId);
    setSelectedEventId(evtId);
    setSelectedPatientId(patientId);
    setIsForensicDrawerOpen(true);
    loadEventDetails(evtId, patientId);
  };

  // Focused Event
  const focusedEvent = validEvents.find(e => e.event_id === selectedEventId) || validEvents[0] || null;
  const systemStatusLabel = health?.status === 'degraded' ? 'DEGRADED' : 'HEALTHY';
  const nearestMatch = similarityData?.nearest_attacks?.[0];

  // Active Incident Data Resolution
  const activeEventId = patientDetailData?.pipeline?.event_id || focusedEvent?.event_id || selectedEventId || 'None Selected';
  const activePatientId = patientDetailData?.pipeline?.patient_id || focusedEvent?.patient_id || selectedPatientId || 'N/A';
  const rawScenario = patientDetailData?.pipeline?.scenario || patientDetailData?.pipeline?.event_type || (focusedEvent as any)?.scenario || focusedEvent?.event_type || 'BRUTE_FORCE';
  const attackType = normalizeAttackType(rawScenario, focusedEvent?.event_type);
  const formattedScenario = formatAttackTypeLabel(attackType);

  const activeEndpoint = patientDetailData?.pipeline?.endpoint || focusedEvent?.endpoint || '/api/v1/auth/login';
  const activeTimestamp = patientDetailData?.pipeline?.timestamp 
    ? new Date(patientDetailData.pipeline.timestamp).toLocaleTimeString()
    : focusedEvent?.timestamp 
    ? new Date(focusedEvent.timestamp).toLocaleTimeString() 
    : 'N/A';

  const rawSeverity = (patientDetailData?.pipeline?.severity || focusedEvent?.severity || 'HIGH').toUpperCase();
  const intelligencePriority = patientDetailData?.pipeline?.intelligence?.priority || null;
  const priorityBadge = intelligencePriority?.priority ? `${rawSeverity} · ${intelligencePriority.priority}` : `${rawSeverity} · P1`;

  // Patient / Service Impact Resolution
  const patientImpact = patientDetailData?.pipeline?.intelligence?.patient_impact || null;
  const incidentContext = patientDetailData?.pipeline?.intelligence?.incident_context || null;
  const impactLevel = (patientImpact?.impact_level || 'CRITICAL').toUpperCase();

  const deviceLabel = resolveDeviceLabel(patientImpact, incidentContext);
  const whySentenceFallback = resolveWhySentence(patientImpact, incidentContext);

  // Dynamic attack-aware explanations
  const whyText = getDynamicWhySentence(attackType, activeEndpoint, deviceLabel, whySentenceFallback);
  const impactText = getDynamicImpactSentence(patientImpact, incidentContext, deviceLabel);
  const responseText = getDynamicResponseSentence(attackType, patientImpact);

  // Dynamic Cohort Risk Top Patients
  const sortedDetections = [...detections].sort((a, b) => (b.detection_score || 0) - (a.detection_score || 0));
  const topRisks = sortedDetections.slice(0, 3);
  const avgCohortScore = typeof reporting?.overview?.average_detection_score === 'number'
    ? reporting.overview.average_detection_score.toFixed(1)
    : detections.length > 0
    ? (detections.reduce((acc, d) => acc + (d.detection_score || 0), 0) / detections.length).toFixed(1)
    : '27.2';

  const isolatedDevicesCount = devices.filter(
    d => d.status?.toUpperCase() === 'ISOLATED' || d.status?.toUpperCase() === 'QUARANTINED'
  ).length;

  const affectedDevicesCount = devices.filter(
    d => d.status?.toUpperCase() !== 'SECURE' || (d as any).attack_active
  ).length || (isolatedDevicesCount > 0 ? isolatedDevicesCount : 1);

  // Dynamic Hospital Status Zones
  const getZoneStatus = (zoneType: string) => {
    const zoneDevices = devices.filter(d => {
      const vlan = ((d as any).vlan || '').toUpperCase();
      const id = (d.device_id || '').toUpperCase();
      if (zoneType === 'ICU') return vlan.includes('ICU') || id.startsWith('PM') || id.startsWith('VU');
      if (zoneType === 'WARD') return vlan.includes('WARD') || vlan.includes('MEDIOT') || id.startsWith('IP') || id.startsWith('ECG');
      if (zoneType === 'NURSE') return vlan.includes('ADMIN') || vlan.includes('PHARM') || id.startsWith('AW') || id.startsWith('MD');
      if (zoneType === 'CORE') return vlan.includes('CORE') || vlan.includes('LAB') || vlan.includes('IMAGING') || id.startsWith('LA') || id.startsWith('IW');
      return false;
    });

    const isAlert = zoneDevices.some(d => d.status?.toUpperCase() === 'ISOLATED' || d.status?.toUpperCase() === 'CRITICAL' || (d as any).attack_active);
    const isDegraded = zoneDevices.some(d => d.status?.toUpperCase() === 'SUSPICIOUS' || (d.risk_score && d.risk_score > 40));

    if (isAlert) return { label: 'Alert', dotColor: 'bg-rose-400', textColor: 'text-rose-400' };
    if (isDegraded) return { label: 'Degraded', dotColor: 'bg-amber-400', textColor: 'text-amber-400' };
    return { label: 'Operational', dotColor: 'bg-emerald-400', textColor: 'text-emerald-400' };
  };

  const icuStatus = getZoneStatus('ICU');
  const wardStatus = getZoneStatus('WARD');
  const nurseStatus = getZoneStatus('NURSE');
  const coreStatus = getZoneStatus('CORE');

  // Navigate to detection pipeline with current event & patient
  const handleInvestigateIncident = () => {
    if (activeEventId && activeEventId !== 'None Selected') {
      localStorage.setItem('healthx_latest_sim_event_id', activeEventId);
    }
    if (activePatientId && activePatientId !== 'N/A') {
      localStorage.setItem('healthx_selected_patient_id', activePatientId);
    }
    onSelectTab?.('pipeline', activeEventId, activePatientId);
  };

  return (
    <div className="w-full text-slate-200 font-sans p-3 sm:p-5 space-y-4 select-none max-w-7xl mx-auto">
      
      {/* ========================================================================= */}
      {/* 1. CLEAN COMPACT HEADER                                                   */}
      {/* ========================================================================= */}
      <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl px-4 py-3 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-wide uppercase">
              SOC COMMAND CENTRE
            </h1>
            <p className="text-[11px] text-slate-400 font-sans">Healthcare Security Operations</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full animate-pulse ${
              systemStatusLabel === 'HEALTHY' ? 'bg-emerald-400' : 'bg-amber-400'
            }`} />
            <span className={`font-bold ${
              systemStatusLabel === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              ● SYSTEM {systemStatusLabel}
            </span>
          </div>

          <span className="text-slate-600">·</span>

          <div className="text-slate-400 text-[11px]">
            <span>Last updated: </span>
            <span className="text-slate-200 font-medium">
              {lastSync ? new Date(lastSync).toLocaleTimeString() : new Date().toLocaleTimeString()}
            </span>
          </div>

          <button 
            onClick={refreshNow}
            title="Sync latest telemetry"
            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ONLY FOUR TOP STATUS CARDS                                             */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        
        {/* CARD 1: THREAT */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            THREAT
          </div>
          <div className={`text-xl font-extrabold tracking-tight ${
            rawSeverity === 'CRITICAL' ? 'text-rose-400' : rawSeverity === 'HIGH' ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {rawSeverity}
          </div>
          <div className="text-[10px] text-slate-500 font-sans">Current threat level</div>
        </div>

        {/* CARD 2: ACTIVE INCIDENTS */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            ACTIVE INCIDENTS
          </div>
          <div className="text-xl font-extrabold text-cyan-400 tracking-tight">
            {String(validEvents.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length || 1).padStart(2, '0')}
          </div>
          <div className="text-[10px] text-slate-500 font-sans">Number of active incidents</div>
        </div>

        {/* CARD 3: AFFECTED DEVICES */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            AFFECTED DEVICES
          </div>
          <div className="text-xl font-extrabold text-amber-400 tracking-tight">
            {String(affectedDevicesCount).padStart(2, '0')}
          </div>
          <div className="text-[10px] text-slate-500 font-sans">Number currently affected</div>
        </div>

        {/* CARD 4: CLINICAL IMPACT */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-3.5 shadow-sm space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            CLINICAL IMPACT
          </div>
          <div className={`text-xl font-extrabold tracking-tight ${
            impactLevel === 'CRITICAL' ? 'text-rose-400' : impactLevel === 'HIGH' ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {impactLevel}
          </div>
          <div className="text-[10px] text-slate-500 font-sans">Current patient/service impact</div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 3. ACTIVE INCIDENT = MAIN FOCUS                                           */}
      {/* ========================================================================= */}
      <div className="bg-[#0c1322] border border-slate-800/90 rounded-xl p-4 sm:p-5 shadow-xl space-y-4 font-mono">
        {/* Incident Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              ACTIVE INCIDENT
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold border tracking-tight ${
              rawSeverity === 'CRITICAL' 
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' 
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              {priorityBadge}
            </span>
          </div>
        </div>

        {/* Incident Title & Meta */}
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-wide uppercase">
            {activePatientId} · {formattedScenario}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="text-cyan-400 font-medium">{activeEndpoint}</span>
            <span className="text-slate-600">·</span>
            <span>{activeTimestamp}</span>
          </div>
        </div>

        {/* Three Compact Information Blocks: WHY, IMPACT, RESPONSE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 font-sans">
          
          {/* WHY BLOCK */}
          <div className="bg-[#080d19] border border-slate-800/80 rounded-lg p-3 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              WHY
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {whyText}
            </p>
          </div>

          {/* IMPACT BLOCK */}
          <div className="bg-[#080d19] border border-slate-800/80 rounded-lg p-3 space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              IMPACT
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {impactText}
            </p>
          </div>

          {/* RESPONSE BLOCK */}
          <div className="bg-[#080d19] border border-slate-800/80 rounded-lg p-3 space-y-1">
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider font-mono">
              RESPONSE
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              {responseText}
            </p>
          </div>

        </div>

        {/* Footer Action */}
        <div className="pt-2 flex justify-end">
          <button 
            onClick={handleInvestigateIncident}
            className="px-4 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer hover:border-cyan-400 shadow-sm"
          >
            <span>INVESTIGATE INCIDENT</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. COHORT RISK + VECTOR INTELLIGENCE (TWO COMPACT CARDS)                  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        
        {/* COMPACT COHORT RISK CARD WITH HEAT-LINE VISUAL */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                <span>COHORT RISK</span>
              </span>
              <span className="text-[11px] text-cyan-400 font-bold font-mono">
                AVG {avgCohortScore}/100
              </span>
            </div>

            <div className="space-y-2">
              {topRisks.length > 0 ? (
                topRisks.map((d) => {
                  const scoreVal = d.detection_score !== undefined ? d.detection_score : 0;
                  const statusLabel = scoreVal >= 70 || d.detection_status === 'CRITICAL'
                    ? 'CRITICAL'
                    : scoreVal >= 50 || d.detection_status?.includes('HIGH')
                    ? 'HIGH CONCERN'
                    : 'LOW CONCERN';
                  const levelColor = statusLabel === 'CRITICAL' 
                    ? 'text-rose-400' 
                    : statusLabel === 'HIGH CONCERN' 
                    ? 'text-amber-400' 
                    : 'text-slate-400';

                  const barGradient = scoreVal >= 70
                    ? 'bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500'
                    : scoreVal >= 50
                    ? 'bg-gradient-to-r from-cyan-500 to-amber-500'
                    : 'bg-gradient-to-r from-cyan-600/60 to-cyan-400';

                  return (
                    <div key={d.patient_id} className="space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white tracking-wide">{d.patient_id}</span>
                          <span className={`text-[10px] font-bold ${levelColor}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <span className="font-mono text-cyan-300 font-bold text-xs">
                          {scoreVal.toFixed(1)}
                        </span>
                      </div>

                      {/* Horizontal Heat-Line / Risk-Bar */}
                      <div className="w-full bg-[#080d19] rounded-full h-1.5 overflow-hidden border border-slate-800/60">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${barGradient}`} 
                          style={{ width: `${Math.min(100, Math.max(5, scoreVal))}%` }} 
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 text-[11px] py-2">
                  Scanning cohort baseline...
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={() => onSelectTab?.('patients', activeEventId, activePatientId)}
            className="w-full py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer"
          >
            <span>VIEW COHORT</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

        {/* COMPACT VECTOR INTELLIGENCE CARD */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-cyan-400" />
                <span>VECTOR INTELLIGENCE</span>
              </span>
              <span className="text-[11px] text-cyan-400 font-medium">
                15-D Behavioral Analysis
              </span>
            </div>

            <div className="space-y-2 text-[11px] pt-0.5">
              <div className="flex justify-between items-baseline py-0.5 border-b border-slate-800/40">
                <span className="text-slate-400">Current Event:</span>
                <span className="text-cyan-400 font-bold font-mono">{activeEventId}</span>
              </div>

              <div className="flex justify-between items-baseline py-0.5 border-b border-slate-800/40">
                <span className="text-slate-400">Historical Match:</span>
                <span className="text-slate-200 font-medium truncate max-w-[180px]">
                  {nearestMatch ? (nearestMatch.scenario || nearestMatch.event_id) : 'No match found'}
                </span>
              </div>

              <div className="flex justify-between items-baseline py-0.5">
                <span className="text-slate-400">Similarity:</span>
                <span className={`font-bold ${nearestMatch ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {nearestMatch?.similarity !== undefined
                    ? `${(nearestMatch.similarity * 100).toFixed(1)}%`
                    : nearestMatch?.similarity_percent !== undefined
                    ? `${nearestMatch.similarity_percent}%`
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-sans pt-0.5">
              Structured vector representations correlated against verified healthcare attack signatures.
            </div>
          </div>

          <button 
            onClick={() => onSelectTab?.('pipeline', activeEventId, activePatientId)}
            className="w-full py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer"
          >
            <span>VIEW ANALYSIS</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 5. LIVE SECURITY EVENTS + HOSPITAL STATUS (TWO COMPACT CARDS)             */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        
        {/* LIVE SECURITY EVENT STREAM WITH INTERNAL SCROLLING */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 gap-2">
              <span className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-1.5 shrink-0">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>LIVE SECURITY EVENTS</span>
              </span>

              {/* Compact Search & Count */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1.5" />
                  <input 
                    type="text"
                    placeholder="Filter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-[#080d19] border border-slate-800 rounded px-1.5 py-0.5 pl-6 text-[10px] text-slate-200 focus:outline-none focus:border-cyan-500 w-24 sm:w-28"
                  />
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {validEvents.length} events
                </span>
              </div>
            </div>

            {/* Controlled Height Scrollable Container (Shows ~5-6 rows at once with scroll) */}
            <div className="max-h-[190px] overflow-y-auto pr-1">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="sticky top-0 bg-[#0c1322] border-b border-slate-800/90 z-10">
                  <tr className="text-[9px] uppercase text-slate-400">
                    <th className="pb-1.5">TIME</th>
                    <th className="pb-1.5">EVENT</th>
                    <th className="pb-1.5">PATIENT</th>
                    <th className="pb-1.5">SEVERITY</th>
                    <th className="pb-1.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredEvents.map(evt => {
                    const isSelected = selectedEventId === evt.event_id;
                    const isHigh = evt.severity === 'CRITICAL' || evt.severity === 'HIGH';
                    const timeStr = evt.timestamp 
                      ? new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      : 'N/A';

                    return (
                      <tr 
                        key={evt.event_id}
                        onClick={() => handleSelectEvent(evt.event_id, evt.patient_id)}
                        className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-500/10 text-cyan-200' : ''
                        }`}
                      >
                        <td className="py-1.5 text-slate-400">{timeStr}</td>
                        <td className="py-1.5 text-slate-200 font-medium truncate max-w-[110px]">
                          {(evt.event_type || 'EVENT').replace(/_ATTEMPT|_EVENT/g, '')}
                        </td>
                        <td className="py-1.5 font-bold text-white">{evt.patient_id}</td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            isHigh ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {evt.severity || 'INFO'}
                          </span>
                        </td>
                        <td className="py-1.5 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInspectEvent(evt.event_id, evt.patient_id);
                            }}
                            className="text-cyan-400 hover:text-cyan-300 font-bold text-[10px] cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <button 
            onClick={() => onSelectTab?.('honeypot')}
            className="w-full py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer mt-1"
          >
            <span>VIEW ALL EVENTS</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

        {/* HOSPITAL STATUS CARD */}
        <div className="bg-[#0c1322] border border-slate-800/80 rounded-xl p-4 shadow-md space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="font-bold text-white uppercase tracking-wider text-xs flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-cyan-400" />
                <span>HOSPITAL STATUS</span>
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Active Telemetry</span>
              </span>
            </div>

            <div className="space-y-2 text-[11px] pt-1">
              <div className="flex justify-between items-center py-1 px-2 rounded bg-[#080d19]/80 border border-slate-800/30">
                <span className="text-slate-300">ICU</span>
                <span className={`font-bold flex items-center gap-1.5 ${icuStatus.textColor}`}>
                  <span className={`w-2 h-2 rounded-full ${icuStatus.dotColor}`} />
                  <span>{icuStatus.label}</span>
                </span>
              </div>

              <div className="flex justify-between items-center py-1 px-2 rounded bg-[#080d19]/80 border border-slate-800/30">
                <span className="text-slate-300">WARD</span>
                <span className={`font-bold flex items-center gap-1.5 ${wardStatus.textColor}`}>
                  <span className={`w-2 h-2 rounded-full ${wardStatus.dotColor}`} />
                  <span>{wardStatus.label}</span>
                </span>
              </div>

              <div className="flex justify-between items-center py-1 px-2 rounded bg-[#080d19]/80 border border-slate-800/30">
                <span className="text-slate-300">NURSE STATION</span>
                <span className={`font-bold flex items-center gap-1.5 ${nurseStatus.textColor}`}>
                  <span className={`w-2 h-2 rounded-full ${nurseStatus.dotColor}`} />
                  <span>{nurseStatus.label}</span>
                </span>
              </div>

              <div className="flex justify-between items-center py-1 px-2 rounded bg-[#080d19]/80 border border-slate-800/30">
                <span className="text-slate-300">CORE NETWORK</span>
                <span className={`font-bold flex items-center gap-1.5 ${coreStatus.textColor}`}>
                  <span className={`w-2 h-2 rounded-full ${coreStatus.dotColor}`} />
                  <span>{coreStatus.label}</span>
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => onSelectTab?.('twin')}
            className="w-full py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center space-x-1 transition-all cursor-pointer mt-1"
          >
            <span>OPEN 3D TWIN</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 6. INSPECTION DRAWER MODAL (DEEP FORENSICS ON DEMAND VIA "INSPECT")        */}
      {/* ========================================================================= */}
      {isForensicDrawerOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex justify-end transition-opacity font-mono">
          <div className="bg-[#0b1220] border-l border-slate-800 w-full max-w-2xl h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-400 uppercase font-mono">Event Forensic Inspector</div>
                <h3 className="text-lg font-bold text-cyan-400 font-mono">{activeEventId}</h3>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    if (activeEventId && activeEventId !== 'None Selected') localStorage.setItem('healthx_latest_sim_event_id', activeEventId);
                    if (activePatientId && activePatientId !== 'N/A') localStorage.setItem('healthx_selected_patient_id', activePatientId);
                    setIsForensicDrawerOpen(false);
                    onSelectTab?.('pipeline', activeEventId, activePatientId);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>OPEN IN DETECTION PIPELINE</span>
                </button>
                <button 
                  onClick={() => setIsForensicDrawerOpen(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="p-12 text-center text-slate-400 space-y-3 font-mono">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-xs">Loading Event Forensic Intelligence...</p>
              </div>
            ) : patientDetailData?.pipeline ? (
              <div className="space-y-5 text-xs font-mono">
                {/* Threat & Priority Summary */}
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase">{rawSeverity} THREAT</span>
                    <span className="text-cyan-400 font-bold">{activePatientId}</span>
                  </div>
                  <div className="text-slate-300 text-xs font-sans">
                    {whyText}
                  </div>
                </div>

                {/* Pipeline Stage Details */}
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="font-bold text-white text-xs uppercase border-b border-slate-800 pb-2">
                    Detection Pipeline Verification
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">One-Class SVM</span>
                      <span className="text-amber-400 font-bold">
                        {patientDetailData.pipeline.ocsvm?.classification || 'NORMAL'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Isolation Forest</span>
                      <span className="text-amber-400 font-bold">
                        {patientDetailData.pipeline.isolation_forest?.classification || 'NORMAL'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">XGBoost Classification</span>
                      <span className="text-cyan-400 font-bold">
                        {patientDetailData.pipeline.xgboost?.classification || 'NORMAL'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px]">Fusion Consensus</span>
                      <span className="text-emerald-400 font-bold">
                        {patientDetailData.pipeline.fusion?.model_agreement || '3/3'} Agreement
                      </span>
                    </div>
                  </div>
                </div>

                {/* Patient Safety Rationale */}
                {patientImpact?.rationale && (
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="font-bold text-white text-xs uppercase border-b border-slate-800 pb-2">
                      Clinical Safety Rationale
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 font-sans">
                      {patientImpact.rationale.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-cyan-400 font-mono mt-0.5">▪</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                <p>No extended forensic record available for this event.</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
