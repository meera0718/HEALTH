import { useState, useEffect } from 'react';
import { 
  FileText, Download, Shield, Database, AlertCircle, 
  Cpu, LayoutGrid, CheckCircle, RefreshCw, BarChart2
} from 'lucide-react';

interface OverviewStats {
  total_patients: number;
  total_security_events: number;
  normal_patients: number;
  suspicious_patients: number;
  high_risk_patients: number;
  critical_patients: number;
  total_detected_incidents: number;
  average_fec_score: number;
  average_detection_score: number;
}

interface PatientRiskItem {
  patient_id: string;
  diagnosis: string;
  fec_score: number;
  ocsvm_is_anomalous: boolean;
  isolation_forest_is_anomalous: boolean;
  xgboost_predicted_class: string;
  detection_score: number;
  detection_status: string;
  model_agreement_count: number;
  evidence_strength: string;
}

interface SecurityEventItem {
  event_id: string;
  timestamp: string;
  patient_id: string;
  event_type: string;
  severity: string;
  source_ip: string;
  endpoint: string;
  session_id: string;
}

type SortKey = 'patient_id' | 'detection_score' | 'detection_status' | 'evidence_strength';
type SortOrder = 'asc' | 'desc';

export function SecurityReport() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Active Patient for Patient-Scoped Exports
  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    return localStorage.getItem('healthx_selected_patient_id') || 'P003';
  });

  // Export Loading & Locks
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);
  const [exportingCSV, setExportingCSV] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [patients, setPatients] = useState<PatientRiskItem[]>([]);
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [models, setModels] = useState<any>(null);
  const [threats, setThreats] = useState<any>(null);

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('detection_score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Fetch report data on mount
  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/reporting/summary');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json();
      setOverview(data.summary.overview);
      setModels(data.summary.models);
      setThreats(data.summary.threat_distribution);
      setPatients(data.patients);
      setEvents(data.events);
    } catch (err: any) {
      setError(err.message || 'Failed to load report summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleExportPDF = async (targetPatientId?: string) => {
    if (exportingPDF || loading) return;
    setExportingPDF(true);
    setExportError(null);
    try {
      const activePid = (targetPatientId || selectedPatientId || 'P003').trim().toUpperCase();
      const url = `/api/v1/reporting/export/pdf?patient_id=${encodeURIComponent(activePid)}`;
      const res = await fetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}: Failed to generate PDF`;
        try {
          const jsonErr = await res.json();
          if (jsonErr.detail) msg = jsonErr.detail;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Generated PDF file is empty.');
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `HEALTHX_Security_Report_${activePid}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      setExportError(err.message || 'Unable to generate security report PDF. Please try again.');
    } finally {
      setExportingPDF(false);
    }
  };

  const handleExportCSV = async (targetPatientId?: string) => {
    if (exportingCSV || loading) return;
    setExportingCSV(true);
    setExportError(null);
    try {
      const activePid = (targetPatientId || selectedPatientId || 'P003').trim().toUpperCase();
      const url = `/api/v1/reporting/export/csv?patient_id=${encodeURIComponent(activePid)}`;
      const res = await fetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}: Failed to generate CSV`;
        try {
          const jsonErr = await res.json();
          if (jsonErr.detail) msg = jsonErr.detail;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Generated CSV file is empty.');
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `HEALTHX_Security_Report_${activePid}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      setExportError(err.message || 'Unable to generate security report CSV. Please try again.');
    } finally {
      setExportingCSV(false);
    }
  };

  // Handle sorting logic
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc'); // Default to desc for new keys
    }
  };

  const getSortedPatients = () => {
    const sorted = [...patients];
    sorted.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (typeof valA === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }
      
      return sortOrder === 'asc' 
        ? (valA || 0) - (valB || 0)
        : (valB || 0) - (valA || 0);
    });
    return sorted;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CRITICAL':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'HIGH CONCERN':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'LOW CONCERN':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      default:
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  const getStrengthColor = (str: string) => {
    if (str === 'STRONG') return 'text-rose-400 font-bold';
    if (str === 'MODERATE') return 'text-amber-400';
    return 'text-slate-500';
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 pt-4 font-sans select-none pb-24">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/10 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-wider flex items-center gap-2.5 font-mono">
            <FileText className="w-5 h-5 text-cyan-400" />
            SECURITY INVESTIGATION REPORT
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Dynamic security evaluation summaries, machine learning model classifications, and synthetic audit trail details.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Patient Selector for Patient-Scoped Reports */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-mono">
            <span className="text-slate-400 font-bold text-[10px] uppercase">Active Patient:</span>
            <select
              value={selectedPatientId}
              onChange={(e) => {
                const pid = e.target.value;
                setSelectedPatientId(pid);
                localStorage.setItem('healthx_selected_patient_id', pid);
              }}
              className="bg-transparent text-cyan-400 font-bold outline-none cursor-pointer text-xs"
            >
              {Array.from({ length: 30 }, (_, i) => {
                const pid = `P${String(i + 1).padStart(3, '0')}`;
                return <option key={pid} value={pid} className="bg-[#0d1117] text-slate-200">{pid}</option>;
              })}
            </select>
          </div>

          <button 
            onClick={fetchReport}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => handleExportCSV()}
            disabled={exportingCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-cyan-300 transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>{exportingCSV ? 'PREPARING CSV...' : 'EXPORT CSV'}</span>
          </button>

          <button
            onClick={() => handleExportPDF()}
            disabled={exportingPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 border border-cyan-500 text-xs font-mono font-bold text-white transition cursor-pointer shadow-sm shadow-cyan-500/20 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>{exportingPDF ? 'PREPARING PDF...' : 'EXPORT PDF'}</span>
          </button>
        </div>
      </div>

      {exportError && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-mono text-rose-300 flex items-center justify-between">
          <span>{exportError}</span>
          <button onClick={() => setExportError(null)} className="text-slate-400 hover:text-white font-bold ml-2">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 text-slate-500 text-sm font-mono gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Compiling Live Report Data...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-center font-mono max-w-md mx-auto my-12">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-rose-300 uppercase tracking-widest">Report Error</h4>
          <p className="text-xs text-rose-400 mt-2">{error}</p>
          <button 
            onClick={fetchReport}
            className="mt-4 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs transition cursor-pointer"
          >
            Retry Fetch
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Executive Stats Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1e293b]/20 border border-white/5 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block mb-1">TOTAL COHORT PATIENTS</span>
              <div className="text-2xl font-extrabold text-slate-200 font-mono tracking-tight">{overview?.total_patients}</div>
              <div className="text-[9px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                Active Database Rows
              </div>
            </div>

            <div className="bg-[#1e293b]/20 border border-white/5 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block mb-1">TOTAL CAPTURED EVENTS</span>
              <div className="text-2xl font-extrabold text-slate-200 font-mono tracking-tight">{overview?.total_security_events}</div>
              <div className="text-[9px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-400" />
                Honeypot Logs Recorded
              </div>
            </div>

            <div className="bg-[#1e293b]/20 border border-white/5 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block mb-1">DETECTION INCIDENTS</span>
              <div className="text-2xl font-extrabold text-rose-400 font-mono tracking-tight">{overview?.total_detected_incidents}</div>
              <div className="text-[9px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-400" />
                Risk Score &gt;= 25.0
              </div>
            </div>

            <div className="bg-[#1e293b]/20 border border-white/5 p-4 rounded-2xl backdrop-blur-sm relative overflow-hidden">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block mb-1">AVERAGE SCORES</span>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-2xl font-extrabold text-slate-200 tracking-tight">{overview?.average_detection_score}</span>
                <span className="text-xs text-slate-500">Risk</span>
                <span className="text-base font-extrabold text-cyan-400 ml-1">/ {overview?.average_fec_score}%</span>
                <span className="text-xs text-slate-500">FEC</span>
              </div>
              <div className="text-[9px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-400" />
                System-wide Baseline Averages
              </div>
            </div>
          </div>

          {/* Patient Risk Summary Table */}
          <div className="bg-[#0f172a]/40 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-4 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-cyan-400" />
              PATIENT COHORT RISK SUMMARY
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] text-slate-500 uppercase font-bold select-none">
                    <th 
                      onClick={() => handleSort('patient_id')} 
                      className="pb-2.5 cursor-pointer hover:text-white transition"
                    >
                      Patient ID {sortKey === 'patient_id' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="pb-2.5">Diagnosis</th>
                    <th className="pb-2.5">FEC Score</th>
                    <th className="pb-2.5">SVM</th>
                    <th className="pb-2.5">iForest</th>
                    <th className="pb-2.5">XGBoost Class</th>
                    <th 
                      onClick={() => handleSort('detection_score')} 
                      className="pb-2.5 cursor-pointer hover:text-white transition"
                    >
                      Risk Score {sortKey === 'detection_score' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th 
                      onClick={() => handleSort('detection_status')} 
                      className="pb-2.5 cursor-pointer hover:text-white transition"
                    >
                      Status {sortKey === 'detection_status' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="pb-2.5">Agreement</th>
                    <th 
                      onClick={() => handleSort('evidence_strength')} 
                      className="pb-2.5 cursor-pointer hover:text-white transition"
                    >
                      Strength {sortKey === 'evidence_strength' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th className="pb-2.5 text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                  {getSortedPatients().map((p) => {
                    const isSelected = p.patient_id === selectedPatientId;
                    return (
                      <tr 
                        key={p.patient_id} 
                        onClick={() => {
                          setSelectedPatientId(p.patient_id);
                          localStorage.setItem('healthx_selected_patient_id', p.patient_id);
                        }}
                        className={`hover:bg-white/5 transition-colors cursor-pointer ${isSelected ? 'bg-cyan-500/10' : ''}`}
                      >
                        <td className="py-2.5 font-bold text-slate-200">
                          <span className={isSelected ? 'text-cyan-400 font-extrabold' : ''}>{p.patient_id}</span>
                        </td>
                        <td className="py-2.5 text-slate-400 max-w-[150px] truncate" title={p.diagnosis}>{p.diagnosis}</td>
                        <td className="py-2.5">{p.fec_score}%</td>
                        <td className="py-2.5">
                          <span className={p.ocsvm_is_anomalous ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                            {p.ocsvm_is_anomalous ? 'ANOM' : 'NORM'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={p.isolation_forest_is_anomalous ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                            {p.isolation_forest_is_anomalous ? 'ANOM' : 'NORM'}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-400">{p.xgboost_predicted_class}</td>
                        <td className="py-2.5 font-bold text-slate-200">{p.detection_score}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(p.detection_status)}`}>
                            {p.detection_status}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-400">{p.model_agreement_count}/2</td>
                        <td className={`py-2.5 ${getStrengthColor(p.evidence_strength)}`}>{p.evidence_strength}</td>
                        <td className="py-2.5 text-right pr-2 font-mono" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedPatientId(p.patient_id);
                                localStorage.setItem('healthx_selected_patient_id', p.patient_id);
                                handleExportPDF(p.patient_id);
                              }}
                              className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/50 text-[10px] font-bold text-cyan-300 transition flex items-center gap-1 cursor-pointer"
                              title={`Export ${p.patient_id} PDF Report`}
                            >
                              <FileText className="w-3 h-3 text-cyan-400" />
                              <span>PDF</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedPatientId(p.patient_id);
                                localStorage.setItem('healthx_selected_patient_id', p.patient_id);
                                handleExportCSV(p.patient_id);
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-slate-300 transition flex items-center gap-1 cursor-pointer"
                              title={`Export ${p.patient_id} CSV Report`}
                            >
                              <Download className="w-3 h-3 text-cyan-400" />
                              <span>CSV</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Model & Threat Summary Details (5 columns) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Models Summary */}
              <div className="bg-[#0f172a]/40 border border-white/5 rounded-2xl p-4 backdrop-blur-md space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  DETECTION MODEL AGGREGATES
                </h3>

                <div className="space-y-3 font-mono text-xs text-slate-300">
                  {/* SVM */}
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="font-bold text-cyan-400 text-xs mb-1">ONE-CLASS SVM</div>
                    <div className="flex justify-between mt-1 text-[11px]">
                      <span className="text-slate-500">Flagged Anomalous:</span>
                      <span className="text-rose-400 font-bold">{models?.ocsvm.anomalous} patients</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Normal Behavior:</span>
                      <span>{models?.ocsvm.normal} patients</span>
                    </div>
                  </div>

                  {/* iForest */}
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="font-bold text-cyan-400 text-xs mb-1">ISOLATION FOREST</div>
                    <div className="flex justify-between mt-1 text-[11px]">
                      <span className="text-slate-500">Flagged Anomalous:</span>
                      <span className="text-rose-400 font-bold">{models?.isolation_forest.anomalous} patients</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Normal Behavior:</span>
                      <span>{models?.isolation_forest.normal} patients</span>
                    </div>
                  </div>

                  {/* XGBoost class distribution */}
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="font-bold text-cyan-400 text-xs mb-2">XGBOOST CLASSIFICATIONS</div>
                    <div className="space-y-1 text-[11px]">
                      {models && Object.entries(models.xgboost).map(([cls, cnt]: any) => (
                        <div key={cls} className="flex justify-between">
                          <span className="text-slate-500">{cls}:</span>
                          <span className={cls !== 'NORMAL' ? 'text-rose-300 font-semibold' : ''}>{cnt} patients</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Model Agreement */}
                  <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="font-bold text-cyan-400 text-xs mb-2">DETECTOR MODEL AGREEMENT</div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Full Agreement (2/2):</span>
                        <span>{models?.model_agreement["2/2"]} patients</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Partial Agreement (1/2):</span>
                        <span>{models?.model_agreement["1/2"]} patients</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Zero Agreement (0/2):</span>
                        <span>{models?.model_agreement["0/2"]} patients</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Threat Distribution Summary */}
              <div className="bg-[#0f172a]/40 border border-white/5 rounded-2xl p-4 backdrop-blur-md space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  THREAT LEVEL DISTRIBUTION
                </h3>
                <div className="space-y-3 font-mono text-xs">
                  {threats && Object.entries(threats).map(([lvl, cnt]: any) => {
                    const max = 30;
                    const pct = (cnt / max) * 100;
                    const progressColor = 
                      lvl === 'CRITICAL' ? 'bg-rose-500' :
                      lvl === 'HIGH' ? 'bg-amber-500' :
                      lvl === 'LOW' ? 'bg-yellow-500' : 'bg-emerald-500';

                    return (
                      <div key={lvl} className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                        <div className="flex justify-between items-center text-[10px] mb-1 text-slate-300">
                          <span className="font-bold uppercase tracking-wider">{lvl}</span>
                          <span>{cnt} patients ({Math.round(pct)}%)</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Security Events Audit Log Summary (7 columns) */}
            <div className="lg:col-span-7">
              <div className="bg-[#0f172a]/40 border border-white/5 rounded-2xl p-4 backdrop-blur-md space-y-4 h-full flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-4 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    SECURITY EVENTS AUDIT LOG SUMMARY
                  </h3>

                  <div className="space-y-2.5 max-h-[560px] overflow-y-auto font-mono text-[10px] border border-white/5 bg-black/20 p-3 rounded-xl pr-1.5">
                    {events.length === 0 ? (
                      <div className="text-center text-slate-500 py-10">No events captured in database</div>
                    ) : (
                      events.map((evt) => (
                        <div 
                          key={evt.event_id}
                          className={`p-2.5 rounded-lg border transition-all ${
                            evt.severity === 'HIGH' || evt.event_type.includes('ANOMALY') || evt.event_type.includes('ATTEMPT')
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' 
                              : 'bg-[#1e293b]/10 border-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-slate-500 font-bold">{evt.event_id}</span>
                            <span>{evt.timestamp}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400 mt-1.5 border-t border-white/5 pt-1.5">
                            <div>Patient: <span className="text-slate-200 font-semibold">{evt.patient_id}</span></div>
                            <div>Type: <span className="text-slate-200">{evt.event_type}</span></div>
                            <div>Source IP: <span className="text-slate-300">{evt.source_ip}</span></div>
                            <div className="truncate" title={evt.endpoint}>Endpoint: <span className="text-slate-300">{evt.endpoint}</span></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 font-mono text-center border-t border-white/5 pt-3.5 mt-4 flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Audit Logs reflect synthetic project data. Patient records remain separated.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
