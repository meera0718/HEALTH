import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, Radio, RefreshCw, Terminal, ChevronRight, ChevronDown, Search, ShieldCheck, 
  TrendingUp, Users, Network
} from 'lucide-react';
import { useCommandCenterData } from '../hooks/useCommandCenterData';
import { 
  PatientSafetyImpactCard,
  impactLevelColors,
  resolveAffectedService,
  resolveWhySentence,
  resolveResponseSentence,
  resolveDeviceLabel
} from '../components/common/PatientSafetyImpactCard';

interface CommandCenterProps {
  onSelectTab?: (tab: string, eventId?: string, patientId?: string) => void;
  onSelectEvent?: (eventId: string, patientId?: string) => void;
  incidents?: any[];
  onSelectIncident?: (id: string) => void;
  activityLogs?: any[];
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ onSelectTab, onSelectEvent, onSelectIncident }) => {
  const { 
    health, reporting, detections, events, decoys, devices, 
    telemetryStatus, loading, refreshNow, lastSync 
  } = useCommandCenterData(5000);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetailData, setPatientDetailData] = useState<any | null>(null);
  const [patientFecData, setPatientFecData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [forensicError, setForensicError] = useState<string | null>(null);
  const [isForensicDrawerOpen, setIsForensicDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Collapsible Secondary Investigation Details (collapsed by default for 5-10s glanceability)
  const [showAttackPathDetails, setShowAttackPathDetails] = useState<boolean>(false);
  const [showBlastRadiusDetails, setShowBlastRadiusDetails] = useState<boolean>(false);

  // Vector Intelligence State for Compact Card
  const [vectorData, setVectorData] = useState<any | null>(null);
  const [similarityData, setSimilarityData] = useState<any | null>(null);

  // Async Race Protection Refs
  const latestRequestedEventIdRef = useRef<string | null>(null);
  const latestInspectedEventIdRef = useRef<string | null>(null);

  // Load Event Pipeline & Vector Intelligence for Selected Event
  const loadEventDetails = async (evtId: string, patientId?: string) => {
    latestInspectedEventIdRef.current = evtId;
    setLoadingDetail(true);
    setForensicError(null);

    loadVectorSummary(evtId);

    // Bounded retry logic for fresh Honeypot events (up to 3 attempts with 300ms delay)
    let pipe = null;
    let vec = null;
    let lastStatus = 200;
    let lastErrDetail = '';

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
        } else {
          lastStatus = pipeRes.status;
          lastErrDetail = await pipeRes.text().catch(() => pipeRes.statusText);
        }

        if (vecRes.ok) {
          vec = await vecRes.json();
        }

        if (pipe) break;
      } catch (err: any) {
        lastErrDetail = err?.message || 'Network failure';
      }

      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    if (latestInspectedEventIdRef.current !== evtId) return;

    if (pipe) {
      setPatientDetailData({ pipeline: pipe, vector: vec });
      setForensicError(null);

      // Fetch FEC breakdown for the patient
      const targetPatient = pipe.patient_id || patientId;
      if (targetPatient) {
        try {
          const fecRes = await fetch(`/api/v1/fec/patients/${targetPatient}`);
          if (fecRes.ok) {
            setPatientFecData(await fecRes.json());
          }
        } catch {
          // ignore FEC fetch failure
        }
      }
    } else {
      setPatientDetailData(null);
      setForensicError(`No forensic record found for ${evtId} (HTTP ${lastStatus}${lastErrDetail ? `: ${lastErrDetail}` : ''}).`);
    }
    setLoadingDetail(false);
  };

  // Helper to exclude INC0421 (Suspicious Database Access), INC0420, and INC0439 from Command Centre UI ONLY
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

  // Auto-initialize selected event to latest event when data loads
  useEffect(() => {
    const validEvents = events.filter(e => !isExcludedIncident(e.event_id, e.event_type, e.endpoint));
    if (!selectedEventId && validEvents.length > 0) {
      const initialEvt = validEvents[0];
      setSelectedEventId(initialEvt.event_id);
      setSelectedPatientId(initialEvt.patient_id);
      loadEventDetails(initialEvt.event_id, initialEvt.patient_id);
    }
  }, [events, selectedEventId]);

  // Load Compact Vector Summary for Hero Event
  const loadVectorSummary = async (evtId: string) => {
    latestRequestedEventIdRef.current = evtId;
    try {
      const [embRes, simRes] = await Promise.all([
        fetch(`/api/v1/vector/embedding/${evtId}`),
        fetch(`/api/v1/vector/similarity/${evtId}?limit=5`)
      ]);

      if (latestRequestedEventIdRef.current !== evtId) return;

      if (embRes.ok) setVectorData(await embRes.json());
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

  const validEvents = events.filter(e => !isExcludedIncident(e.event_id, e.event_type, e.endpoint));

  const filteredEvents = validEvents.filter(e => 
    e.event_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.patient_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.event_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Selected or Latest Event Focus
  const focusedEvent = validEvents.find(e => e.event_id === selectedEventId) || validEvents[0] || null;
  const systemStatus = health?.status?.toUpperCase() || (loading ? 'INITIALIZING' : 'HEALTHY');
  const nearestMatch = similarityData?.nearest_attacks?.[0];

  // Active Incident Data Resolution
  const activeEventId = patientDetailData?.pipeline?.event_id || focusedEvent?.event_id || selectedEventId || 'None Selected';
  const activePatientId = patientDetailData?.pipeline?.patient_id || focusedEvent?.patient_id || selectedPatientId || 'N/A';
  const activeScenario = patientDetailData?.pipeline?.scenario || patientDetailData?.pipeline?.event_type || focusedEvent?.event_type || 'SECURITY_EVENT';
  const activeEndpoint = patientDetailData?.pipeline?.endpoint || focusedEvent?.endpoint || 'N/A';
  const activeTimestamp = patientDetailData?.pipeline?.timestamp 
    ? new Date(patientDetailData.pipeline.timestamp).toLocaleTimeString()
    : focusedEvent?.timestamp 
    ? new Date(focusedEvent.timestamp).toLocaleTimeString() 
    : 'N/A';
  const rawSeverity = (patientDetailData?.pipeline?.severity || focusedEvent?.severity || 'HIGH').toUpperCase();
  const threatIndex = patientDetailData?.pipeline?.threat_assessment?.threat_index !== undefined 
    ? Number(patientDetailData.pipeline.threat_assessment.threat_index).toFixed(1)
    : patientDetailData?.pipeline?.fusion?.threat_index !== undefined 
    ? Number(patientDetailData.pipeline.fusion.threat_index).toFixed(1)
    : typeof reporting?.overview?.average_detection_score === 'number' 
    ? reporting.overview.average_detection_score.toFixed(1) 
    : 'N/A';

  const severityThemes: Record<string, { badge: string; text: string }> = {
    CRITICAL: {
      badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      text: 'text-rose-400'
    },
    HIGH: {
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      text: 'text-amber-400'
    },
    MODERATE: {
      badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
      text: 'text-yellow-400'
    },
    MEDIUM: {
      badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
      text: 'text-yellow-400'
    },
    LOW: {
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
      text: 'text-emerald-400'
    },
    INFO: {
      badge: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
      text: 'text-slate-400'
    }
  };
  const threatTheme = severityThemes[rawSeverity] || severityThemes.HIGH;

  // Patient / Service Impact Resolution
  const patientImpact = patientDetailData?.pipeline?.intelligence?.patient_impact || null;
  const incidentContext = patientDetailData?.pipeline?.intelligence?.incident_context || null;
  const impactLevel = patientImpact?.impact_level || 'LOW';
  const impactTheme = impactLevelColors[impactLevel.toUpperCase()] || impactLevelColors.LOW;
  const affectedService = resolveAffectedService(patientImpact, incidentContext);
  const whySentence = resolveWhySentence(patientImpact, incidentContext);
  const responseSentence = resolveResponseSentence(patientImpact);
  const deviceLabel = resolveDeviceLabel(patientImpact, incidentContext);

  // Potential Attack Path & Blast Radius Event Freshness Guard
  const isPipelineFresh = patientDetailData?.pipeline?.event_id === activeEventId;

  // Potential Attack Path Resolution
  const attackPath = isPipelineFresh ? (patientDetailData?.pipeline?.intelligence?.attack_path || null) : null;

  // Potential Blast Radius Resolution
  const blastRadius = isPipelineFresh ? (patientDetailData?.pipeline?.intelligence?.blast_radius || null) : null;

  // Operational Intelligence Priority Resolution
  const intelligencePriority = patientDetailData?.pipeline?.intelligence?.priority || null;

  // Priority Reason resolution explaining runtime priority, especially when Patient Impact is CRITICAL/HIGH but priority is P2
  const resolvedPriorityReason = (() => {
    if (!intelligencePriority) return null;
    const impactLvl = (patientImpact?.impact_level || '').toUpperCase();
    if (intelligencePriority.priority === 'P2' && (impactLvl === 'CRITICAL' || impactLvl === 'HIGH')) {
      const constrainingDriver = intelligencePriority.drivers?.find((d: string) => 
        d.toLowerCase().includes('constrained')
      );
      if (constrainingDriver) {
        return 'Critical clinical exposure identified; P1 escalation constrained by evidence strength.';
      }
    }
    return intelligencePriority.reason || null;
  })();

  // Compact Secondary Summaries
  const attackPathSummary = attackPath?.status === 'AVAILABLE' && attackPath.path_nodes?.length > 0
    ? `${attackPath.path_nodes.length} nodes · Potential reachability`
    : attackPath?.status === 'RESTRICTED'
    ? 'Traversal restricted · Active quarantine'
    : attackPath?.reason || 'Insufficient topology data';

  const blastRadiusSummary = blastRadius?.status === 'AVAILABLE' && !blastRadius.restricted
    ? `${blastRadius.potentially_exposed_count ?? 0} potentially exposed assets · ${blastRadius.critical_assets_count ?? 0} critical`
    : blastRadius?.restricted
    ? 'Traversal restricted · Host isolated'
    : blastRadius?.reason || 'Insufficient topology data';

  const priorityThemes: Record<string, { badge: string; text: string }> = {
    P1: {
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      text: 'text-rose-400'
    },
    P2: {
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      text: 'text-amber-400'
    },
    P3: {
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      text: 'text-cyan-400'
    },
    P4: {
      badge: 'bg-slate-800 text-slate-400 border-slate-700',
      text: 'text-slate-400'
    }
  };

  // Device isolation dynamic calculation
  const isolatedDevicesCount = devices.filter(
    d => d.status?.toUpperCase() === 'ISOLATED' || d.status?.toUpperCase() === 'QUARANTINED'
  ).length;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-200 font-sans p-4 sm:p-6 space-y-6 select-none">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER (CLEAN SOC COMMAND HEADER)                                   */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                HEALTHX <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">v3.2 SOC</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono">Healthcare Security Operations Center</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {/* System Status Pills */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-emerald-400">SYSTEM {systemStatus}</span>
            </div>

            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span className="text-slate-300">Telemetry:</span>
              <span className="font-bold text-cyan-400">{telemetryStatus}</span>
            </div>

            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-slate-300">Detection & Vector:</span>
              <span className="font-bold text-cyan-400">ONLINE</span>
            </div>

            <button 
              onClick={refreshNow}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>REALTIME THREAT ASSESSMENT ENGINE</span>
          <span>Last sync: {lastSync ? new Date(lastSync).toLocaleTimeString() : 'Syncing...'}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SELECTED INCIDENT RECORD (ONE UNIFIED RECORD · CLEAR HIERARCHY)         */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              SELECTED INCIDENT
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-cyan-400 font-bold">
              {activeEventId}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                if (activeEventId && activeEventId !== 'None Selected') localStorage.setItem('healthx_latest_sim_event_id', activeEventId);
                if (activePatientId && activePatientId !== 'N/A') localStorage.setItem('healthx_selected_patient_id', activePatientId);
                onSelectTab?.('pipeline', activeEventId, activePatientId);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer hover:border-cyan-500/40"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Open Detection Pipeline</span>
            </button>
          </div>
        </div>

        {/* 1. THREAT & OPERATIONAL PRIORITY */}
        <div className="space-y-2">
          {/* Main Threat & Priority Header Line (Compact, no empty horizontal gap) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold border tracking-tight ${threatTheme.badge}`}>
              {rawSeverity} · THREAT
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Threat Index:{' '}
              <strong className="text-white text-xs font-mono">
                {threatIndex !== 'N/A' ? `${threatIndex}/100` : 'N/A'}
              </strong>
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              (Security Threat Assessment)
            </span>

            {intelligencePriority && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold border tracking-tight font-mono ${priorityThemes[intelligencePriority.priority]?.badge || priorityThemes.P3.badge}`}>
                {intelligencePriority.priority} · {intelligencePriority.label}
              </span>
            )}
          </div>

          {/* Priority Reason visually close directly under Priority Badge / Threat Header */}
          {resolvedPriorityReason && (
            <p className="text-xs text-slate-300 font-sans leading-snug">
              {resolvedPriorityReason}
            </p>
          )}

          {/* Incident Type & Target Details */}
          <div>
            <h2 className="text-base font-bold text-white tracking-tight font-sans uppercase">
              {activeScenario}
            </h2>
            <div className="text-xs text-slate-300 font-mono flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
              <span className="text-white font-semibold">{activePatientId}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300">{activeEndpoint}</span>
              {activeTimestamp !== 'N/A' && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-500">{activeTimestamp}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SUBTLE HORIZONTAL SEPARATOR */}
        <div className="border-t border-slate-800/80 my-2" />

        {/* 2. PATIENT / SERVICE IMPACT: What could it affect? */}
        {loadingDetail ? (
          <div className="py-6 text-center text-slate-400 text-xs font-mono animate-pulse flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Evaluating Patient & Service Impact Context...</span>
          </div>
        ) : patientImpact ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  PATIENT / SERVICE IMPACT
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Potential Clinical & Operational Exposure
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className={`font-extrabold text-base uppercase tracking-tight ${impactTheme.text}`}>
                  {impactLevel}
                </span>
                <span className="text-slate-500 font-bold">·</span>
                <span className="font-extrabold text-white text-base tracking-tight font-mono">
                  {typeof patientImpact.impact_score === 'number' ? patientImpact.impact_score.toFixed(1) : patientImpact.impact_score}/100
                </span>
              </div>

              <div className="text-sm font-bold text-cyan-300 font-sans">
                {affectedService}
              </div>

              <div className="text-xs text-slate-300 space-y-0.5 pt-0.5">
                <div>
                  <span className="text-white font-medium">{deviceLabel}</span>
                  <span className="text-slate-500 mx-1.5">·</span>
                  <span className="capitalize text-slate-300 font-semibold">{patientImpact.device_criticality?.toLowerCase() || 'low'}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Patient dependency:{' '}
                  <span className="text-slate-200 font-medium capitalize">
                    {patientImpact.patient_dependency?.toLowerCase() || 'low'}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. WHY: Why does it matter? */}
            <div className="space-y-1 pt-2 border-t border-slate-800/60">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                WHY
              </span>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                {whySentence}
              </p>
            </div>

            {/* 4. RESPONSE: What should the operator consider doing? */}
            <div className="space-y-1 pt-2 border-t border-slate-800/60">
              <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider block">
                RESPONSE
              </span>
              <p className="text-xs text-slate-200 font-sans leading-relaxed">
                {responseSentence}
              </p>
            </div>

            {/* 5. POTENTIAL ATTACK PATH (Compact collapsible / secondary section) */}
            <div className="pt-2 border-t border-slate-800/60">
              <button 
                type="button"
                onClick={() => setShowAttackPathDetails(prev => !prev)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors text-left group"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-cyan-400 font-bold text-xs">
                    {showAttackPathDetails ? '▾' : '▸'}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    POTENTIAL ATTACK PATH
                  </span>
                  <span className="text-slate-600 text-xs">·</span>
                  <span className="text-xs text-slate-300 font-mono truncate">
                    {attackPathSummary}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-cyan-400 group-hover:text-cyan-300 font-mono shrink-0 ml-2">
                  <span>{showAttackPathDetails ? 'Hide' : 'Expand'}</span>
                  {showAttackPathDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </div>
              </button>

              {showAttackPathDetails && (
                <div className="mt-2 pt-2 border-t border-slate-800/40 space-y-2">
                  {attackPath?.status === 'AVAILABLE' && attackPath.path_nodes.length > 0 ? (
                    <div className="space-y-2 pt-0.5">
                      <div className="flex flex-col space-y-1 font-mono text-xs">
                        {attackPath.path_nodes.map((node: any, idx: number) => (
                          <React.Fragment key={node.id || idx}>
                            <div className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[9px] text-slate-400 flex items-center justify-center shrink-0 mt-0.5 font-mono">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span className="font-bold text-white tracking-tight">{node.id}</span>
                                  <span className="text-slate-500 text-[10px]">·</span>
                                  <span className="text-slate-300 text-xs font-sans font-medium">{node.label}</span>
                                </div>
                                {node.detail && (
                                  <div className="text-[10px] text-slate-500 truncate">{node.detail}</div>
                                )}
                              </div>
                            </div>

                            {idx < attackPath.path_nodes.length - 1 && (
                              <div className="pl-1.5 py-0.5 text-slate-600 text-[11px] leading-none select-none">
                                ↓
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {attackPath.explanation && (
                        <p className="text-[11px] text-slate-400 font-sans italic pt-1">
                          {attackPath.explanation}
                        </p>
                      )}

                      <p className="text-[10px] text-slate-500 font-sans italic pt-0.5">
                        Potential network reachability does not indicate confirmed compromise.
                      </p>
                    </div>
                  ) : attackPath?.status === 'RESTRICTED' ? (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                      <span className="font-bold">TRAVERSAL RESTRICTED: </span>
                      {attackPath.reason || 'Potential lateral movement restricted by active host quarantine.'}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-mono italic py-1">
                      {attackPath?.reason || 'Insufficient topology data for path reconstruction.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. POTENTIAL BLAST RADIUS (Compact collapsible / secondary section) */}
            <div className="pt-2 border-t border-slate-800/60">
              <button 
                type="button"
                onClick={() => setShowBlastRadiusDetails(prev => !prev)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors text-left group"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-cyan-400 font-bold text-xs">
                    {showBlastRadiusDetails ? '▾' : '▸'}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    POTENTIAL BLAST RADIUS
                  </span>
                  <span className="text-slate-600 text-xs">·</span>
                  <span className="text-xs text-slate-300 font-mono truncate">
                    {blastRadiusSummary}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-cyan-400 group-hover:text-cyan-300 font-mono shrink-0 ml-2">
                  <span>{showBlastRadiusDetails ? 'Hide' : 'Expand'}</span>
                  {showBlastRadiusDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </div>
              </button>

              {showBlastRadiusDetails && (
                <div className="mt-2 pt-2 border-t border-slate-800/40 space-y-2">
                  {blastRadius?.status === 'AVAILABLE' && !blastRadius.restricted ? (
                    <div className="space-y-2 text-xs font-mono">
                      {/* Summary metrics row */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
                        <span>
                          Potentially Exposed:{' '}
                          <strong className="text-white">{blastRadius.potentially_exposed_count} assets</strong>
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>
                          Clinical Assets:{' '}
                          <strong className={blastRadius.clinical_assets_count > 0 ? "text-amber-400" : "text-white"}>
                            {blastRadius.clinical_assets_count}
                          </strong>
                        </span>
                        <span className="text-slate-600">·</span>
                        <span>
                          Critical Assets:{' '}
                          <strong className={blastRadius.critical_assets_count > 0 ? "text-rose-400" : "text-white"}>
                            {blastRadius.critical_assets_count}
                          </strong>
                        </span>
                      </div>

                      {/* Zones list */}
                      {blastRadius.affected_zones && blastRadius.affected_zones.length > 0 && (
                        <div className="text-[11px] text-slate-400">
                          Zones:{' '}
                          <span className="text-slate-200 font-semibold">
                            {blastRadius.affected_zones.map((z: string) => z.replace('ZONE-', '')).join(' · ')}
                          </span>
                        </div>
                      )}

                      {/* Potential exposure preview (compact operational list) */}
                      {blastRadius.potentially_exposed_assets && blastRadius.potentially_exposed_assets.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-slate-800/40">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">
                            Potential exposure:
                          </span>
                          <div className="space-y-0.5 text-[11px] text-slate-300">
                            {blastRadius.potentially_exposed_assets.slice(0, 3).map((asset: any) => (
                              <div key={asset.device_id} className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-white tracking-tight">{asset.device_id}</span>
                                <span className="text-slate-600">·</span>
                                <span className="text-slate-300 font-sans truncate">{asset.device_name}</span>
                              </div>
                            ))}
                            {blastRadius.potentially_exposed_assets.length > 3 && (
                              <div className="text-[10px] text-slate-500 italic pt-0.5">
                                +{blastRadius.potentially_exposed_assets.length - 3} additional assets (Inspect Forensics for complete inventory)
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-slate-500 font-sans italic pt-1">
                        Potential exposure reflects modeled network reachability; it does not indicate confirmed compromise.
                      </p>
                    </div>
                  ) : blastRadius?.restricted ? (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                      <span className="font-bold">TRAVERSAL RESTRICTED: </span>
                      {blastRadius.reason || 'Traversal restricted by active host isolation.'}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 font-mono italic py-1">
                      {blastRadius?.reason || 'Insufficient topology data for blast radius assessment.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ACTION & PROGRESSIVE DISCLOSURE TRIGGER */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[10px] text-slate-500 italic">
                Operational exposure assessment · Not a medical harm probability
              </span>

              <button 
                onClick={() => handleInspectEvent(activeEventId, activePatientId)}
                className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer self-end sm:self-auto"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Inspect Forensics</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="py-3 text-xs text-slate-400 font-mono space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">PATIENT / SERVICE IMPACT</span>
              <p className="text-slate-400">Select an incident from the stream to evaluate operational impact.</p>
            </div>
            <div className="pt-1 flex justify-end">
              <button 
                onClick={() => handleInspectEvent(activeEventId, activePatientId)}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Inspect Forensics</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. STREAMLINED LIVE SECURITY EVENT STREAM & COMPACT ANALYTICS CARDS        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column: Simplified Live Security Event Stream Table */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center space-x-2 font-mono">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>Live Security Event Stream</span>
              </h3>
              <p className="text-xs text-slate-400">Click a row to select incident · Click Inspect for deep forensic evidence</p>
            </div>

            <div className="relative font-mono">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input 
                type="text"
                placeholder="Filter Event ID / Patient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-full sm:w-56"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-mono">
              <thead className="bg-slate-950/80 uppercase text-[10px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Time</th>
                  <th className="p-2.5">Event ID</th>
                  <th className="p-2.5">Scenario</th>
                  <th className="p-2.5">Patient</th>
                  <th className="p-2.5">Severity</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredEvents.slice(0, 8).map(evt => {
                  const isSelected = selectedEventId === evt.event_id;
                  const isHigh = evt.severity === 'CRITICAL' || evt.severity === 'HIGH';

                  return (
                    <tr 
                      key={evt.event_id} 
                      onClick={() => handleSelectEvent(evt.event_id, evt.patient_id)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400' : ''
                      }`}
                    >
                      <td className="p-2.5 text-slate-400 text-[11px]">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'N/A'}
                      </td>
                      <td className="p-2.5 font-bold text-cyan-400">{evt.event_id}</td>
                      <td className="p-2.5 text-slate-200">{evt.event_type || 'SECURITY_EVENT'}</td>
                      <td className="p-2.5 text-white font-bold">{evt.patient_id}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isHigh
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {evt.severity || 'INFO'}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectEvent(evt.event_id, evt.patient_id);
                          }}
                          className="text-cyan-400 hover:text-cyan-300 font-bold text-[11px] inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Secondary Column: Cohort Threat Ranking & Evidence Coverage */}
        <div className="space-y-6">
          
          {/* Cohort Threat Ranking */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-white uppercase tracking-wider text-xs">Cohort Threat Ranking</h3>
              </div>
              <span className="text-[10px] text-slate-400">
                Avg: {typeof reporting?.overview?.average_detection_score === 'number' ? `${reporting.overview.average_detection_score.toFixed(1)}/100` : 'N/A'}
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {detections.length > 0 ? (
                detections.slice(0, 4).map((d) => (
                  <div key={d.patient_id} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300 font-bold">
                        {d.patient_id}{' '}
                        <span className="text-slate-500 font-normal font-sans text-[10px]">
                          · {d.detection_status}
                        </span>
                      </span>
                      <span className="text-cyan-400 font-bold">
                        {d.detection_score !== undefined ? d.detection_score.toFixed(1) : 'N/A'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-rose-500 h-full rounded-full" 
                        style={{ width: `${Math.min(100, Math.max(0, d.detection_score || 0))}%` }} 
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-[11px] py-2">
                  No cohort detections recorded.
                </div>
              )}
            </div>
          </div>

          {/* Evidence Coverage (FEC Indicator) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-xl font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white uppercase text-xs">EVIDENCE COVERAGE (FEC)</span>
              <span className="text-emerald-400 font-bold">
                {patientFecData?.fec_score !== undefined
                  ? `${patientFecData.fec_score.toFixed(1)}% PATIENT`
                  : typeof reporting?.overview?.average_fec_score === 'number'
                  ? `${reporting.overview.average_fec_score.toFixed(1)}% COHORT AVG`
                  : 'N/A'}
              </span>
            </div>

            <div className="space-y-1.5 text-[11px] pt-1">
              {patientFecData?.components && Object.keys(patientFecData.components).length > 0 ? (
                Object.entries(patientFecData.components as Record<string, number>).slice(0, 6).map(([compName, score]) => (
                  <div key={compName} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 truncate max-w-[140px]">{compName}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-mono text-[10px]">
                        {'█'.repeat(Math.max(1, Math.min(5, Math.round((Number(score) / 100) * 5))))}
                      </span>
                      <span className={`font-bold font-mono ${Number(score) >= 70 ? 'text-amber-400' : Number(score) >= 40 ? 'text-cyan-300' : 'text-slate-300'}`}>
                        {Number(score).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-1 text-slate-400 text-[11px]">
                  <div className="flex justify-between">
                    <span>Cohort Average:</span>
                    <span className="text-emerald-400 font-bold">
                      {typeof reporting?.overview?.average_fec_score === 'number' ? `${reporting.overview.average_fec_score.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 pt-1 italic">
                    Select an incident to view patient feature evidence breakdown.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. COMPACT VECTOR INTELLIGENCE CARD                                          */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white uppercase tracking-wider flex items-center gap-2">
                <span>VECTOR INTELLIGENCE</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">15-D L2 NORMALIZED</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">Behavioral Feature Matrix & Nearest Historical Attack Match</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Event Vector</span>
            <span className="font-bold text-cyan-400 block">{selectedEventId || focusedEvent?.event_id || 'N/A'}</span>
            <span className="text-[10px] text-slate-500 block">{vectorData?.dimension ?? 15}-D L2 Unit Normalized (||v||₂ = 1.0000)</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Nearest Historical Attack</span>
            <span className="font-bold text-white block">{nearestMatch?.event_id ?? 'No match found'}</span>
            <span className="text-[10px] text-slate-500 block">{nearestMatch?.scenario ?? 'N/A'}</span>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Cosine Similarity Match</span>
            <span className="font-bold text-emerald-400 text-lg block">
              {typeof nearestMatch?.similarity_percent === 'number'
                ? `${nearestMatch.similarity_percent.toFixed(1)}%`
                : nearestMatch?.similarity_percent ?? 'N/A'}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {nearestMatch?.similarity_score !== undefined ? `Correlation Score: ${nearestMatch.similarity_score}` : 'Behavioral Correlation'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. OPERATIONAL STATUS CARDS: PATIENTS, DEVICES, HONEYPOT                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
        
        {/* Patients Summary */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white uppercase tracking-wider text-xs">Patients Cohort</span>
              <span className="text-[10px] text-cyan-400">
                {reporting?.overview?.total_patients ?? detections.length} Monitored
              </span>
            </div>
            <p className="text-slate-400">Critical Risk: <span className="text-rose-400 font-bold">{reporting?.overview?.critical_patients ?? 0}</span></p>
            <p className="text-slate-400">Normal Baseline: <span className="text-emerald-400 font-bold">{reporting?.overview?.normal_patients ?? 0}</span></p>
          </div>
          <button 
            onClick={() => onSelectTab?.('patients')}
            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-cyan-400" />
            <span>VIEW PATIENTS</span>
          </button>
        </div>

        {/* MedIoT Devices */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white uppercase tracking-wider text-xs">MedIoT Devices</span>
              <span className="text-[10px] text-cyan-400">{devices.length} Monitored</span>
            </div>
            <p className="text-slate-400">Isolated Devices: <span className="text-amber-400 font-bold">{isolatedDevicesCount} Quarantined</span></p>
            <p className="text-slate-400">
              Telemetry Stream:{' '}
              <span className="text-emerald-400 font-bold">
                {telemetryStatus === 'CONNECTED' ? 'Active (3s Loop)' : telemetryStatus}
              </span>
            </p>
          </div>
          <button 
            onClick={() => onSelectTab?.('patients')}
            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-cyan-400" />
            <span>INSPECT PATIENT COHORT</span>
          </button>
        </div>

        {/* Deception & Honeypot */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white uppercase tracking-wider text-xs">Deception & Honeypot</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ONLINE</span>
            </div>
            <p className="text-slate-400">Active Decoys: <span className="text-white font-bold">{decoys.length} Sensors Armed</span></p>
            <p className="text-slate-400">
              Latest Attack:{' '}
              <span className="text-cyan-400 font-bold">
                {events[0]?.event_id || focusedEvent?.event_id || 'None Recorded'}
              </span>
            </p>
          </div>
          <button 
            onClick={() => onSelectTab?.('honeypot')}
            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>OPEN HONEYPOT</span>
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 6. INSPECTION DRAWER MODAL (REAL FORENSIC EVENT DETAILS)                 */}
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
                
                {/* 1. WHAT HAPPENED: THREAT & PRIORITY HEADER */}
                <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold border tracking-tight ${threatTheme.badge}`}>
                      {rawSeverity} · THREAT
                    </span>
                    <span className="text-xs text-slate-400">
                      Threat Index: <strong className="text-rose-400">{threatIndex !== 'N/A' ? `${threatIndex}/100` : 'N/A'}</strong>
                    </span>
                  </div>

                  {intelligencePriority && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border tracking-tight font-mono ${priorityThemes[intelligencePriority.priority]?.badge || priorityThemes.P3.badge}`}>
                        INTELLIGENCE PRIORITY: {intelligencePriority.priority} · {intelligencePriority.label}
                      </span>
                    </div>
                  )}

                  <h4 className="text-sm font-bold text-white font-sans uppercase">
                    {patientDetailData.pipeline.scenario || patientDetailData.pipeline.event_type}
                  </h4>

                  {resolvedPriorityReason && (
                    <p className="text-xs text-slate-300 font-sans italic">
                      {resolvedPriorityReason}
                    </p>
                  )}

                  {intelligencePriority?.drivers && intelligencePriority.drivers.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                        PRIORITY DRIVERS
                      </span>
                      <ul className="space-y-0.5 text-xs text-slate-300">
                        {intelligencePriority.drivers.map((d: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                    <div>Event ID: <span className="text-cyan-400 font-bold">{activeEventId}</span></div>
                    <div>Target Asset: <span className="text-white font-bold">{activePatientId}</span></div>
                    <div>Endpoint: <span className="text-slate-300">{patientDetailData.pipeline.endpoint || activeEndpoint}</span></div>
                    <div>Timestamp: <span className="text-slate-300">{activeTimestamp}</span></div>
                  </div>
                </div>

                {/* 2. WHAT COULD IT AFFECT, WHY, RESPONSE: PATIENT / SERVICE IMPACT */}
                {patientDetailData.pipeline?.intelligence?.patient_impact && (
                  <PatientSafetyImpactCard 
                    patientImpact={patientDetailData.pipeline.intelligence.patient_impact}
                    incidentContext={patientDetailData.pipeline.intelligence.incident_context}
                  />
                )}

                {/* POTENTIAL ATTACK PATH IN DRAWER */}
                {attackPath && (
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="font-bold text-white text-xs uppercase">Potential Attack Path Topology</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        attackPath.status === 'AVAILABLE' 
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                          : attackPath.status === 'RESTRICTED'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {attackPath.status}
                      </span>
                    </div>

                    {attackPath.status === 'AVAILABLE' && attackPath.path_nodes.length > 0 ? (
                      <div className="space-y-2">
                        {attackPath.path_nodes.map((node: any, idx: number) => (
                          <div key={node.id || idx} className="flex items-start gap-2.5 text-xs">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 border border-slate-700">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{node.id}</span>
                                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                                  {node.type}
                                </span>
                              </div>
                              <div className="text-slate-300 font-sans">{node.label}</div>
                              {node.detail && <div className="text-[11px] text-slate-500">{node.detail}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        {attackPath.reason || 'Insufficient topology data for path reconstruction.'}
                      </div>
                    )}
                  </div>
                )}

                {/* POTENTIAL BLAST RADIUS IN DRAWER */}
                {blastRadius && (
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3 font-mono">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                      <span className="font-bold text-white text-xs uppercase">Potential Blast Radius Exposure</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        blastRadius.status === 'AVAILABLE' && !blastRadius.restricted
                          ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                          : blastRadius.restricted
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {blastRadius.restricted ? 'RESTRICTED' : blastRadius.status}
                      </span>
                    </div>

                    {blastRadius.status === 'AVAILABLE' && !blastRadius.restricted && blastRadius.potentially_exposed_assets.length > 0 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Exposed Assets</span>
                            <span className="font-bold text-white">{blastRadius.potentially_exposed_count}</span>
                          </div>
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Clinical Assets</span>
                            <span className="font-bold text-amber-400">{blastRadius.clinical_assets_count}</span>
                          </div>
                          <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-500 block">Critical Assets</span>
                            <span className="font-bold text-rose-400">{blastRadius.critical_assets_count}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Potentially Reachable Assets
                          </span>
                          <div className="divide-y divide-slate-800/50">
                            {blastRadius.potentially_exposed_assets.map((asset: any) => (
                              <div key={asset.device_id} className="py-1.5 flex justify-between items-center text-xs">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-white">{asset.device_id}</span>
                                    <span className="text-slate-500 text-[10px]">·</span>
                                    <span className="text-slate-300 font-sans">{asset.device_name}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {asset.zone} · {asset.vlan} · {asset.asset_category}
                                  </div>
                                </div>
                                <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold">
                                  {asset.reachability}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {blastRadius.services_at_exposure && blastRadius.services_at_exposure.length > 0 && (
                          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                            <span className="font-bold text-slate-300">Services at Potential Exposure: </span>
                            {blastRadius.services_at_exposure.join(', ')}
                          </div>
                        )}
                      </div>
                    ) : blastRadius.restricted ? (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                        <span className="font-bold">TRAVERSAL RESTRICTED: </span>
                        {blastRadius.reason || 'Traversal restricted by active host isolation.'}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">
                        {blastRadius.reason || 'Insufficient topology data for blast radius assessment.'}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. SUPPORTING TECHNICAL EVIDENCE (PROGRESSIVE DISCLOSURE) */}
                <div className="space-y-4 pt-2 border-t border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Supporting Technical Evidence & Signals
                  </div>

                  {/* ML Detection Models & Fusion Agreement */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-xs uppercase">ML Detection Models & Fusion</span>
                      <span className="text-[10px] text-cyan-300">
                        Agreement: {patientDetailData.pipeline.fusion?.model_agreement || 'N/A'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">OCSVM</span>
                        <span className="font-bold text-amber-400">
                          {patientDetailData.pipeline.ocsvm?.classification || patientDetailData.pipeline.ocsvm?.prediction || 'N/A'}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Iso Forest</span>
                        <span className="font-bold text-rose-400">
                          {patientDetailData.pipeline.isolation_forest?.classification || patientDetailData.pipeline.isolation_forest?.prediction || 'N/A'}
                        </span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">XGBoost</span>
                        <span className="font-bold text-cyan-400">
                          {patientDetailData.pipeline.xgboost?.classification || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Forensic Telemetry Context */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Forensic Telemetry Context</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div>FEC Score: <strong className="text-amber-400">{patientDetailData.pipeline.fec?.fec_score !== undefined ? `${patientDetailData.pipeline.fec.fec_score}%` : 'N/A'}</strong></div>
                      <div>Source IP: <strong className="text-cyan-300">{patientDetailData.pipeline.source_ip || 'N/A'}</strong></div>
                      <div>Fusion Result: <strong className="text-rose-400">{patientDetailData.pipeline.fusion?.result || 'N/A'}</strong></div>
                      <div>Evidence Strength: <strong className="text-emerald-400">{patientDetailData.pipeline.threat_assessment?.evidence_strength || 'N/A'}</strong></div>
                    </div>
                  </div>

                  {/* 15-D Behavioral Vector Embedding */}
                  {patientDetailData.vector && (
                    <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
                      <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                        15-D L2 Behavioral Vector Embedding
                      </h4>
                      <div className="p-3 bg-slate-950 rounded-lg text-[11px] text-cyan-300 break-all leading-relaxed border border-slate-900 font-mono">
                        [{patientDetailData.vector.embedding_vector?.map((v: number) => v.toFixed(4)).join(', ')}]
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="p-8 text-center text-rose-400 text-xs bg-slate-950/80 rounded-xl border border-slate-800 font-mono">
                {forensicError || `No forensic record found for ${selectedEventId}.`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
