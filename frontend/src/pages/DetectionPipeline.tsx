import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, AlertTriangle, ArrowDown, ShieldAlert } from 'lucide-react';
import { PatientSafetyImpactCard } from '../components/common/PatientSafetyImpactCard';

interface DetectionPipelineProps {
  selectedEventId?: string;
  selectedPatientId?: string;
}

export const DetectionPipeline: React.FC<DetectionPipelineProps> = ({
  selectedEventId,
  selectedPatientId
}) => {
  const [activePatientId, setActivePatientId] = useState<string>(() => {
    return selectedPatientId || localStorage.getItem('healthx_selected_patient_id') || 'P003';
  });
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [loadingPipeline, setLoadingPipeline] = useState<boolean>(false);
  const latestRequestedEventIdRef = useRef<string | null>(null);
  const activePatientIdRef = useRef<string>(activePatientId);

  useEffect(() => {
    activePatientIdRef.current = activePatientId;
  }, [activePatientId]);

  // Load pipeline data for active patient or specific event
  const fetchPipeline = async (pid: string, targetEventId?: string) => {
    setLoadingPipeline(true);
    if (targetEventId) {
      latestRequestedEventIdRef.current = targetEventId;
    }
    try {
      const url = targetEventId
        ? `/api/v1/detection-pipeline/event/${targetEventId}`
        : `/api/v1/detection-pipeline/latest?patient_id=${pid}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Guard: Check requested event_id
        if (targetEventId && latestRequestedEventIdRef.current && latestRequestedEventIdRef.current !== targetEventId) {
          return; // Ignore stale async event response
        }

        if (data.status === 'none') {
          setPipelineData(null);
        } else {
          setPipelineData(data);
          if (data.patient_id && data.patient_id !== activePatientIdRef.current) {
            setActivePatientId(data.patient_id);
            activePatientIdRef.current = data.patient_id;
            localStorage.setItem('healthx_selected_patient_id', data.patient_id);
          }
          if (data.event_id) {
            localStorage.setItem('healthx_latest_sim_event_id', data.event_id);
          }
          console.log('[HEALTHX] Detection pipeline loaded: event_id=' + data.event_id);
        }
      } else {
        if (pid.toUpperCase() === activePatientIdRef.current.toUpperCase()) setPipelineData(null);
      }
    } catch (err: any) {
      if (pid.toUpperCase() === activePatientIdRef.current.toUpperCase()) setPipelineData(null);
    } finally {
      if (pid.toUpperCase() === activePatientIdRef.current.toUpperCase()) setLoadingPipeline(false);
    }
  };

  const handleSelectPatient = (pid: string) => {
    setActivePatientId(pid);
    localStorage.setItem('healthx_selected_patient_id', pid);
    latestRequestedEventIdRef.current = null;
    window.dispatchEvent(new CustomEvent('patient-selected', { detail: { patient_id: pid } }));
    fetchPipeline(pid);
  };

  useEffect(() => {
    const targetEvtId = selectedEventId || localStorage.getItem('healthx_latest_sim_event_id') || undefined;
    const targetPid = selectedPatientId || activePatientId;

    if (targetEvtId) {
      fetchPipeline(targetPid, targetEvtId);
    } else {
      fetchPipeline(targetPid);
    }

    const handlePatientSelected = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.patient_id) {
        const newPid = customEvt.detail.patient_id;
        setActivePatientId(newPid);
        latestRequestedEventIdRef.current = null;
        fetchPipeline(newPid);
      }
    };

    const handleSimulationSuccess = (e: Event) => {
      const customEvt = e as CustomEvent;
      const targetPid = customEvt.detail?.patient_id || activePatientId;
      const eventId = customEvt.detail?.event_id;
      if (eventId) {
        console.log('[HEALTHX] Detection event received: event_id=' + eventId);
        latestRequestedEventIdRef.current = eventId;
      }
      if (targetPid) {
        setActivePatientId(targetPid);
        fetchPipeline(targetPid, eventId);
      }
    };

    window.addEventListener('patient-selected', handlePatientSelected);
    window.addEventListener('honeypot-simulation-success', handleSimulationSuccess);

    return () => {
      window.removeEventListener('patient-selected', handlePatientSelected);
      window.removeEventListener('honeypot-simulation-success', handleSimulationSuccess);
    };
  }, [selectedEventId, selectedPatientId]);

  const hasNoData = !pipelineData || pipelineData.status === 'none';
  const eventId = pipelineData?.event_id || 'N/A';

  return (
    <div className="relative w-full p-4 sm:p-8 space-y-6 max-w-5xl mx-auto font-mono text-slate-200">
      
      {/* BREADCRUMB CONTEXT HEADER */}
      <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 pb-1">
        <span className="text-cyan-400 font-bold uppercase">COMMAND CENTER</span>
        <span>/</span>
        <span className="text-slate-300 font-bold uppercase">DETECTION PIPELINE</span>
        {pipelineData?.event_id && (
          <>
            <span>/</span>
            <span className="text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">
              {pipelineData.event_id}
            </span>
          </>
        )}
      </div>
      
      {/* HEADER SECTION */}
      <div className="border-b border-[#1e293b] pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-cyan-400" />
            <span>DETECTION PIPELINE</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Event-driven security engine observability & flow visualization
          </p>
        </div>
        
        {/* Patient selector & Refresh button */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="flex items-center gap-2 bg-[#161b22] border border-[#1e293b] px-3 py-1.5 rounded-lg text-xs">
            <span className="text-slate-400 font-bold text-[10px] uppercase">Select Patient:</span>
            <select
              value={activePatientId}
              onChange={(e) => handleSelectPatient(e.target.value)}
              className="bg-transparent text-cyan-400 font-bold outline-none cursor-pointer text-xs"
            >
              {Array.from({ length: 30 }, (_, i) => {
                const pid = `P${String(i + 1).padStart(3, '0')}`;
                return <option key={pid} value={pid} className="bg-[#0d1117] text-slate-200">{pid}</option>;
              })}
            </select>
          </div>

          <button 
            onClick={() => fetchPipeline(activePatientId)}
            disabled={loadingPipeline}
            className="px-3 py-1.5 bg-[#161b22] hover:bg-slate-800 border border-[#1e293b] rounded-lg text-slate-300 hover:text-white flex items-center gap-1.5 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPipeline ? 'animate-spin' : ''}`} />
            <span>REFRESH PIPELINE</span>
          </button>
        </div>
      </div>

      {/* LATEST DETECTION SUMMARY BANNER */}
      <div className="bg-[#0d1117] border border-cyan-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-3">
          <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">LATEST DETECTION</span>
          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
            hasNoData
              ? 'bg-slate-800 text-slate-400 border border-slate-700'
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
          }`}>
            {hasNoData ? 'NO EVENT' : 'SIMULATION ATTACK EVENT'}
          </span>
        </div>

        {hasNoData ? (
          <div className="text-slate-400 text-xs py-4 text-center bg-[#161b22] border border-[#1e293b] rounded-xl space-y-2 p-4">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
            <div className="font-bold text-slate-200 uppercase tracking-wider">NO ACTIVE DETECTION</div>
            <p className="text-[11px] text-slate-400">
              Waiting for Honeypot Simulator...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">PATIENT:</span>
              <span className="text-cyan-300 font-extrabold text-sm">{pipelineData.patient_id}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">DETECTION ID:</span>
              <span className="text-cyan-400 font-extrabold text-sm">{pipelineData.event_id}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">SCENARIO:</span>
              <span className="text-amber-400 font-bold uppercase">{pipelineData.scenario}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">EVENT TYPE:</span>
              <span className="text-cyan-300 font-semibold">{pipelineData.event_type}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">SEVERITY:</span>
              <span className="text-rose-400 font-bold uppercase">{pipelineData.severity}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TIMESTAMP:</span>
              <span className="text-slate-200 text-[11px]">{pipelineData.timestamp}</span>
            </div>
          </div>
        )}
      </div>

      {/* SEQUENTIAL PIPELINE FLOW VISUALIZATION */}
      <div className="space-y-3">
        
        {/* STAGE 1: HONEYPOT SIMULATOR */}
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-2xl p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-slate-200 text-xs">HONEYPOT SIMULATOR</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>EVENT ID: <span className="text-cyan-300 font-bold">{eventId}</span></div>
            <div>SCENARIO: <span className="text-amber-400">{pipelineData?.scenario || 'N/A'}</span></div>
            <div>ENDPOINT: <span className="text-slate-400 text-[11px]">{pipelineData?.endpoint || 'N/A'}</span></div>
          </div>
        </div>

        {/* FLOW ARROW */}
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
        </div>

        {/* STAGE 2: FEATURE ENGINE */}
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-2xl p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-slate-200 text-xs">FEATURE ENGINE</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div>EVENT ID: <span className="text-cyan-300 font-bold">{eventId}</span></div>
            <div className="text-[11px] text-slate-400">
              Feature Vector (11-D):
              <div className="font-mono text-cyan-300 text-[10px] break-all bg-[#161b22] p-2 rounded border border-[#1e293b] mt-1">
                {pipelineData?.feature_vector ? JSON.stringify(pipelineData.feature_vector) : '[ Waiting for event... ]'}
              </div>
            </div>
          </div>
        </div>

        {/* FLOW ARROW */}
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
        </div>

        {/* STAGE 3: FEC ENGINE */}
        <div className="bg-[#0d1117] border border-[#1e293b] rounded-2xl p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-slate-200 text-xs">FEC ENGINE (EVENT-LEVEL)</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between items-center">
              <div>EVENT ID: <span className="text-cyan-300 font-bold">{eventId}</span></div>
              <div className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded bg-cyan-500/10 font-mono">SCOPE: EVENT</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 bg-[#161b22] p-2 rounded-xl border border-[#1e293b]">
              <div>EVENT FEC SCORE: <span className="text-emerald-400 font-bold">{pipelineData?.fec?.fec_score ?? 'N/A'}</span></div>
              <div>BASELINE FEC: <span className="text-slate-300">{pipelineData?.fec?.baseline_fec ?? 'N/A'}</span></div>
              <div>EVENT ADJUSTMENT: <span className="text-amber-400 font-bold">+{pipelineData?.fec?.event_adjustment ?? 0}</span></div>
            </div>
          </div>
        </div>

        {/* FLOW ARROW */}
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
        </div>

        {/* STAGE 4: ML DETECTION (OCSVM, ISOLATION FOREST, XGBOOST) */}
        <div className="bg-[#0d1117] border border-cyan-500/30 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-cyan-400 text-xs">ML DETECTION ENSEMBLE</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            
            {/* OCSVM */}
            <div className="bg-[#161b22] border border-[#1e293b] rounded-xl p-3 space-y-2">
              <div className="font-bold text-slate-200 border-b border-[#1e293b] pb-1">OCSVM</div>
              <div>EVENT ID: <span className="text-cyan-300 font-bold text-[10px]">{eventId}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">CLASSIFICATION:</span>
                <span className={`font-bold ${pipelineData?.ocsvm?.classification === 'ANOMALOUS' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {pipelineData?.ocsvm?.classification || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">SCORE:</span>
                <span className="text-cyan-300">{pipelineData?.ocsvm?.score !== undefined ? pipelineData.ocsvm.score : 'N/A'}</span>
              </div>
            </div>

            {/* ISOLATION FOREST */}
            <div className="bg-[#161b22] border border-[#1e293b] rounded-xl p-3 space-y-2">
              <div className="font-bold text-slate-200 border-b border-[#1e293b] pb-1">ISOLATION FOREST</div>
              <div>EVENT ID: <span className="text-cyan-300 font-bold text-[10px]">{eventId}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">CLASSIFICATION:</span>
                <span className={`font-bold ${pipelineData?.isolation_forest?.classification === 'OUTLIER' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {pipelineData?.isolation_forest?.classification || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">SCORE:</span>
                <span className="text-cyan-300">{pipelineData?.isolation_forest?.score !== undefined ? pipelineData.isolation_forest.score : 'N/A'}</span>
              </div>
            </div>

            {/* XGBOOST */}
            <div className="bg-[#161b22] border border-[#1e293b] rounded-xl p-3 space-y-2">
              <div className="font-bold text-slate-200 border-b border-[#1e293b] pb-1">XGBOOST CLASSIFIER</div>
              <div>EVENT ID: <span className="text-cyan-300 font-bold text-[10px]">{eventId}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">CLASSIFICATION:</span>
                <span className="text-amber-400 font-bold uppercase">{pipelineData?.xgboost?.classification || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">PROBABILITY:</span>
                <span className="text-cyan-300">{pipelineData?.xgboost?.probability !== undefined ? pipelineData.xgboost.probability : 'N/A'}</span>
              </div>
            </div>

          </div>
        </div>

        {/* FLOW ARROW */}
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
        </div>

        {/* STAGE 5: FUSION ENGINE */}
        <div className="bg-[#0d1117] border border-cyan-500/30 rounded-2xl p-4 shadow-lg space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-bold text-cyan-400 text-xs">FUSION ENGINE</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>EVENT ID: <span className="text-cyan-300 font-bold">{eventId}</span></div>
            <div>MODEL AGREEMENT: <span className="text-cyan-300 font-bold">{pipelineData?.fusion?.model_agreement || 'N/A'}</span></div>
            <div>FUSION RESULT: <span className="text-rose-400 font-extrabold">{pipelineData?.fusion?.result || 'N/A'}</span></div>
          </div>
        </div>

        {/* FLOW ARROW */}
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
        </div>

        {/* STAGE 6: THREAT ASSESSMENT */}
        <div className="bg-[#0d1117] border border-rose-500/40 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <span className="font-extrabold text-rose-400 text-xs tracking-wider uppercase">THREAT ASSESSMENT</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              hasNoData ? 'bg-slate-800 text-slate-500' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              {hasNoData ? '● WAITING' : '● COMPLETE'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">EVENT ID:</span>
              <span className="text-cyan-300 font-bold text-[11px]">{eventId}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">THREAT INDEX:</span>
              <span className="text-rose-400 font-extrabold text-base">
                {pipelineData?.threat_assessment?.threat_index !== undefined ? `${pipelineData.threat_assessment.threat_index} / 100` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">EVIDENCE STRENGTH:</span>
              <span className="text-cyan-300 font-bold">{pipelineData?.threat_assessment?.evidence_strength || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">FINAL ASSESSMENT:</span>
              <span className="text-rose-400 font-black text-sm uppercase">{pipelineData?.threat_assessment?.assessment || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* STAGE 7: PATIENT & SERVICE IMPACT (INTELLIGENCE LAYER) */}
        {pipelineData?.intelligence?.patient_impact && (
          <>
            <div className="flex justify-center">
              <ArrowDown className="w-5 h-5 text-cyan-500/60 animate-bounce" />
            </div>
            <PatientSafetyImpactCard
              patientImpact={pipelineData.intelligence.patient_impact}
              incidentContext={pipelineData.intelligence.incident_context}
            />
          </>
        )}
      </div>

    </div>
  );
};
