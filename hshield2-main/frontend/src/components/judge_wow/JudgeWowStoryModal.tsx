import React, { useState, useEffect } from 'react';
import { 
  Shield, Clock, AlertTriangle, Scale, 
  HelpCircle, ChevronRight, Cpu
} from 'lucide-react';
import { api } from '../../api/client';
import type { JudgeWowData } from '../../types';

interface JudgeWowStoryModalProps {
  incidentId: string;
}

export const JudgeWowStoryModal: React.FC<JudgeWowStoryModalProps> = ({ incidentId }) => {
  const [data, setData] = useState<JudgeWowData | null>(null);
  const [activeTimeIndex, setActiveTimeIndex] = useState<number>(0);
  const [selectedHypothesis, setSelectedHypothesis] = useState<string | null>(null);
  const [hypothesisResult, setHypothesisResult] = useState<any | null>(null);
  const [selectedCounterfactual, setSelectedCounterfactual] = useState<string>('B');
  const [containmentResult, setContainmentResult] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'time-machine' | 'courtroom' | 'investigator' | 'counterfactual' | 'xray'>('time-machine');

  useEffect(() => {
    async function loadData() {
      try {
        const res = await api.getJudgeWowData(incidentId);
        setData(res);
        if (res.time_machine_states) {
          setActiveTimeIndex(res.time_machine_states.length - 1);
        }
      } catch (err) {
        console.warn('Failed loading judge wow data', err);
      }
    }
    loadData();
  }, [incidentId]);

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono">
        Loading HealthShield-X Cyber Command Story...
      </div>
    );
  }

  const currentTimeState = data.time_machine_states[activeTimeIndex] || data.time_machine_states[0];

  const handleEvaluateHypothesis = async (optionId: string) => {
    setSelectedHypothesis(optionId);
    try {
      const res = await api.submitInvestigatorHypothesis(incidentId, optionId);
      setHypothesisResult(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSimulateContainment = async (actionType: string) => {
    setSelectedCounterfactual(actionType);
    const actionKey = actionType === 'A' ? 'DO_NOTHING' : actionType === 'B' ? 'ISOLATE_WORKSTATION' : 'BLOCK_DATABASE';
    try {
      const res = await api.simulateContainment(incidentId, actionKey, 'Staff-PC-07');
      setContainmentResult(res);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Incident Header & Threat DNA Fingerprint */}
      <div className="bg-[#111827] border border-cyan-500/30 rounded-xl p-5 space-y-4 shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 font-bold uppercase tracking-wider">
              <span>JUDGE-WOW CYBER COMMAND STORY</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-amber-400">{data.incident_id}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mt-1">
              Compromised Staff Workstation Forensic Investigation
            </h1>
          </div>

          {/* DNA Signature Chip */}
          <div className="bg-[#161b22] px-4 py-2 rounded-lg border border-cyan-500/40 text-right font-mono">
            <span className="text-[10px] text-slate-400 block uppercase">THREAT DNA FINGERPRINT</span>
            <div className="text-cyan-300 font-extrabold text-sm tracking-wider">
              {data.threat_dna.signature_flow}
            </div>
            <div className="text-[10px] text-emerald-400">
              {data.threat_dna.similarity_match.similarity_percent}% SIMILARITY TO {data.threat_dna.similarity_match.target_incident}
            </div>
          </div>
        </div>

        {/* Threat DNA Category Bars */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="bg-[#161b22] p-2.5 rounded border border-[#1e293b]">
            <div className="flex justify-between text-slate-400 text-[10px] mb-1">
              <span>CREDENTIAL ACCESS</span>
              <span className="text-cyan-400 font-bold">{data.threat_dna.breakdown.credential_access}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400" style={{ width: `${data.threat_dna.breakdown.credential_access}%` }}></div>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded border border-[#1e293b]">
            <div className="flex justify-between text-slate-400 text-[10px] mb-1">
              <span>PRIVILEGE ESCALATION</span>
              <span className="text-amber-400 font-bold">{data.threat_dna.breakdown.privilege_escalation}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${data.threat_dna.breakdown.privilege_escalation}%` }}></div>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded border border-[#1e293b]">
            <div className="flex justify-between text-slate-400 text-[10px] mb-1">
              <span>LATERAL MOVEMENT</span>
              <span className="text-indigo-400 font-bold">{data.threat_dna.breakdown.lateral_movement}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-400" style={{ width: `${data.threat_dna.breakdown.lateral_movement}%` }}></div>
            </div>
          </div>

          <div className="bg-[#161b22] p-2.5 rounded border border-[#1e293b]">
            <div className="flex justify-between text-slate-400 text-[10px] mb-1">
              <span>DATABASE ACCESS</span>
              <span className="text-rose-400 font-bold">{data.threat_dna.breakdown.database_access}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-400" style={{ width: `${data.threat_dna.breakdown.database_access}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1e293b] pb-2 font-mono text-xs">
        <button
          onClick={() => setActiveTab('time-machine')}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-none ${
            activeTab === 'time-machine' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>🕰️ SECURITY TIME MACHINE & REPLAY</span>
        </button>

        <button
          onClick={() => setActiveTab('courtroom')}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-none ${
            activeTab === 'courtroom' ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>⚖️ AI SECURITY COURTROOM</span>
        </button>

        <button
          onClick={() => setActiveTab('investigator')}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-none ${
            activeTab === 'investigator' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>🕵️ INVESTIGATOR MODE</span>
        </button>

        <button
          onClick={() => setActiveTab('counterfactual')}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-none ${
            activeTab === 'counterfactual' ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>🧠 COUNTERFACTUAL & BLAST RADIUS</span>
        </button>

        <button
          onClick={() => setActiveTab('xray')}
          className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-none ${
            activeTab === 'xray' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>👁️ SECURITY X-RAY SCAN</span>
        </button>
      </div>

      {/* TAB 1: 🕰️ SECURITY TIME MACHINE & EVIDENCE EVOLUTION */}
      {activeTab === 'time-machine' && (
        <div className="space-y-6">
          {/* Time Machine Selector */}
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-slate-200 uppercase">SELECT INCIDENT TIMESTAMP</span>
              <span className="text-cyan-400">WHAT WOULD HEALTHSHIELD-X HAVE KNOWN AT THIS MOMENT?</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {data.time_machine_states.map((st, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTimeIndex(idx)}
                  className={`p-3 rounded-lg border font-mono text-xs text-left cursor-pointer transition-none ${
                    activeTimeIndex === idx
                      ? 'bg-cyan-600/20 border-cyan-400 text-cyan-200 font-bold shadow-lg shadow-cyan-900/30'
                      : 'bg-[#161b22] border-[#1e293b] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[10px] text-slate-500">{st.timestamp}</div>
                  <div className="text-base font-bold mt-1" style={{ color: st.risk_score > 80 ? '#f43f5e' : st.risk_score > 50 ? '#f59e0b' : '#38bdf8' }}>
                    {st.risk_score}% RISK
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">{st.risk_change}</div>
                </button>
              ))}
            </div>

            {/* Known Evidence at Selected Moment */}
            <div className="bg-[#161b22] p-4 rounded-lg border border-[#1e293b] space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                <span className="text-slate-300 font-bold">EVIDENCE KNOWN AT {currentTimeState.timestamp}:</span>
                <span className="text-emerald-400 font-bold">MOST INFLUENTIAL: {currentTimeState.most_influential_evidence}</span>
              </div>

              <div className="space-y-1.5">
                {currentTimeState.known_evidence.map((ev, i) => (
                  <div key={i} className="text-slate-200 bg-[#111827] px-3 py-1.5 rounded border border-[#1e293b]">
                    {ev}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Invisible Attack Detector & Clinical Impact Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 🫥 Invisible Attack Detector */}
            <div className="bg-[#111827] border border-amber-500/40 rounded-xl p-5 space-y-3 font-mono text-xs shadow-xl">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{data.invisible_attack_detection.alert_title}</span>
              </div>

              <div className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b] space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Missing Event:</span>
                  <span className="text-rose-400 font-bold">{data.invisible_attack_detection.missing_event}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk Contribution:</span>
                  <span className="text-amber-400 font-bold">+{data.invisible_attack_detection.risk_contribution}%</span>
                </div>
              </div>

              <p className="text-slate-300 text-[11px] leading-relaxed">
                {data.invisible_attack_detection.explanation}
              </p>
            </div>

            {/* 🏥 Clinical Service Impact Analysis */}
            <div className="bg-[#111827] border border-cyan-500/40 rounded-xl p-5 space-y-3 font-mono text-xs shadow-xl">
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                <span className="font-bold text-slate-100 text-sm">{data.clinical_service_impact.title}</span>
                <span className="text-[10px] text-slate-500">CYBER ASSET → SYSTEM → WORKFLOW</span>
              </div>

              <div className="space-y-2">
                {data.clinical_service_impact.services.map((srv, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#161b22] p-2.5 rounded border border-[#1e293b]">
                    <span className="text-slate-200 font-bold">{srv.service}</span>
                    <span className={`px-2.5 py-0.5 rounded font-bold uppercase ${
                      srv.impact_level === 'HIGH' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                      srv.impact_level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {srv.impact_level} IMPACT
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-500 italic">
                {data.clinical_service_impact.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ⚖️ AI SECURITY COURTROOM */}
      {activeTab === 'courtroom' && (
        <div className="bg-[#111827] border border-indigo-500/40 rounded-xl p-6 space-y-6 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-6 h-6 text-indigo-400" />
              <h2 className="text-lg font-bold text-slate-100">{data.security_courtroom.title}</h2>
            </div>
            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded font-bold">
              VERDICT: {data.security_courtroom.verdict.assessment}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PROSECUTOR AI */}
            <div className="bg-[#161b22] border border-rose-500/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-900/60 pb-2">
                <span className="font-bold text-rose-300">{data.security_courtroom.prosecutor_ai.name}</span>
                <span className="text-rose-400 font-extrabold text-sm">
                  {data.security_courtroom.prosecutor_ai.threat_confidence}% THREAT
                </span>
              </div>
              <div className="space-y-2 text-slate-200">
                {data.security_courtroom.prosecutor_ai.arguments.map((arg, i) => (
                  <div key={i} className="bg-[#111827] p-2.5 rounded border border-rose-950">
                    {arg}
                  </div>
                ))}
              </div>
            </div>

            {/* DEFENDER AI */}
            <div className="bg-[#161b22] border border-emerald-500/40 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-900/60 pb-2">
                <span className="font-bold text-emerald-300">{data.security_courtroom.defender_ai.name}</span>
                <span className="text-emerald-400 font-extrabold text-sm">
                  {data.security_courtroom.defender_ai.legitimate_confidence}% BENIGN
                </span>
              </div>
              <div className="space-y-2 text-slate-200">
                {data.security_courtroom.defender_ai.arguments.map((arg, i) => (
                  <div key={i} className="bg-[#111827] p-2.5 rounded border border-emerald-950">
                    {arg}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 bg-indigo-950/40 border border-indigo-800 rounded-lg text-slate-200 flex items-center justify-between">
            <div>
              <span className="text-indigo-400 font-bold block">FINAL AI EVIDENCE VERDICT</span>
              <span>{data.security_courtroom.verdict.recommendation}</span>
            </div>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded uppercase">
              CONFIRM HUMAN REVIEW
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: 🕵️ INVESTIGATOR MODE */}
      {activeTab === 'investigator' && (
        <div className="bg-[#111827] border border-amber-500/40 rounded-xl p-6 space-y-6 font-mono text-xs shadow-2xl">
          <div className="border-b border-[#1e293b] pb-3">
            <h2 className="text-lg font-bold text-amber-400">{data.investigator_mode.title}</h2>
            <p className="text-slate-400 text-xs font-sans">
              Test your incident responder hypothesis against HealthShield-X AI compatibility models.
            </p>
          </div>

          <div className="space-y-3">
            <span className="text-slate-300 font-bold block">{data.investigator_mode.question}</span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.investigator_mode.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleEvaluateHypothesis(opt.id)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-none ${
                    selectedHypothesis === opt.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                      : 'bg-[#161b22] border-[#1e293b] text-slate-300 hover:border-amber-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-amber-400">OPTION {opt.id}</span>
                    {selectedHypothesis === opt.id && <span className="text-xs text-amber-300">SELECTED</span>}
                  </div>
                  <div className="text-sm font-semibold">{opt.text}</div>
                </button>
              ))}
            </div>
          </div>

          {hypothesisResult && (
            <div className="p-5 bg-amber-950/40 border border-amber-500/60 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">YOUR HYPOTHESIS</span>
                  <span className="text-slate-100 font-bold text-base">{hypothesisResult.selected_hypothesis}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] uppercase block">AI COMPATIBILITY</span>
                  <span className="text-emerald-400 font-extrabold text-lg">{hypothesisResult.compatibility_score}%</span>
                </div>
              </div>

              <div className="border-t border-amber-900/60 pt-3">
                <span className="text-slate-300 font-bold block mb-2">🔎 RECONSTRUCTED ATTACK CHAIN:</span>
                <div className="space-y-1 text-slate-200">
                  {hypothesisResult.reconstructed_attack_chain.map((chainStep: string, idx: number) => (
                    <div key={idx} className="bg-[#111827] px-3 py-1.5 rounded border border-[#1e293b]">
                      {chainStep}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: 🧠 COUNTERFACTUAL & BLAST RADIUS */}
      {activeTab === 'counterfactual' && (
        <div className="bg-[#111827] border border-rose-500/40 rounded-xl p-6 space-y-6 font-mono text-xs shadow-2xl">
          <div className="border-b border-[#1e293b] pb-3">
            <h2 className="text-lg font-bold text-rose-400">{data.counterfactual.title}</h2>
            <p className="text-slate-400 text-xs font-sans">
              Evaluate potential exposure reduction vs containment blast radius before taking defensive action.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.counterfactual.options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSimulateContainment(opt.id)}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-none ${
                  selectedCounterfactual === opt.id
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200 font-bold shadow-lg shadow-rose-900/30'
                    : 'bg-[#161b22] border-[#1e293b] text-slate-300 hover:border-rose-500/40'
                }`}
              >
                <div className="font-bold text-rose-300 text-sm mb-2">{opt.title}</div>
                <div className="space-y-1 text-xs text-slate-400">
                  <div>Reachable Assets: <strong className="text-slate-200">{opt.potential_reachable_assets}</strong></div>
                  <div>Exposure Reduced: <strong className="text-emerald-400">+{opt.exposure_reduced} Assets</strong></div>
                  <div>Blast Radius: <strong className="text-amber-400">{opt.blast_radius}</strong></div>
                </div>
              </button>
            ))}
          </div>

          {containmentResult && (
            <div className="p-5 bg-rose-950/40 border border-rose-500/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-200 text-sm uppercase">CONTAINMENT SIMULATION EXECUTED</span>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-bold">
                  {containmentResult.status}
                </span>
              </div>
              <p className="text-slate-200">{containmentResult.message}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                {containmentResult.verification.map((v: string, i: number) => (
                  <div key={i} className="bg-[#111827] px-3 py-1.5 rounded border border-[#1e293b]">
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: 👁️ SECURITY X-RAY SCAN */}
      {activeTab === 'xray' && (
        <div className="bg-[#111827] border border-emerald-500/40 rounded-xl p-6 space-y-6 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-6 h-6 text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-100">{data.security_xray.scan_title}</h2>
            </div>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-bold uppercase">
              TARGET: {data.security_xray.asset_id}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(data.security_xray.dimensions).map(([key, val]) => (
              <div key={key} className="bg-[#161b22] p-3 rounded-lg border border-[#1e293b]">
                <span className="text-[10px] text-slate-400 uppercase block">{key}</span>
                <span className="text-lg font-extrabold text-emerald-400">{val}%</span>
                <div className="w-full h-1 bg-slate-800 rounded mt-1 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${val}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-rose-950/40 border border-rose-500/60 rounded-xl space-y-2">
            <span className="text-rose-400 font-bold text-sm block">{data.security_xray.hidden_anomaly.title}</span>
            <div className="text-slate-200 bg-[#111827] p-2.5 rounded border border-rose-900/60">
              {data.security_xray.hidden_anomaly.chain}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
