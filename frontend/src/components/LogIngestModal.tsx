import React, { useState } from 'react';
import { Database, FileCode, CheckCircle2, RefreshCw, X } from 'lucide-react';

interface LogIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidentId: string;
  onIngestSuccess: () => void;
}

export const LogIngestModal: React.FC<LogIngestModalProps> = ({
  isOpen,
  onClose,
  incidentId,
  onIngestSuccess
}) => {
  const [sourceType, setSourceType] = useState('EDR');
  const [rawLogs, setRawLogs] = useState(`[
  {
    "timestamp": "10:36:12",
    "event_type": "process_creation",
    "source_entity": "WORKSTATION-14",
    "destination_entity": "cmd.exe",
    "user": "dr_smith",
    "raw_reference": "Process Create: cmd.exe /c powershell.exe -Enc..."
  }
]`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleIngest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const parsedLogs = JSON.parse(rawLogs);
      const res = await fetch('/api/v1/incidents/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident_id: incidentId,
          source_type: sourceType,
          raw_logs: parsedLogs
        })
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        onIngestSuccess();
      } else {
        setResult({ status: 'ERROR', message: 'Failed to normalize ingested logs' });
      }
    } catch (err: any) {
      setResult({ status: 'ERROR', message: err.message || 'Invalid JSON log format' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#0f172a] border border-indigo-500/30 rounded-2xl w-[95%] sm:w-full max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200 font-sans">
        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
          <div className="flex items-center gap-2.5 text-indigo-300 font-mono text-xs font-bold tracking-wider">
            <Database className="w-5 h-5 text-indigo-400" />
            <span>MULTI-SOURCE LOG INGESTION & NORMALIZER</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Select Telemetry Source:
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2 font-mono text-xs">
              {['FIREWALL', 'AD', 'EDR', 'APP', 'DATABASE'].map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceType(src)}
                  className={`py-2 rounded-lg border text-[10px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                    sourceType === src
                      ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
                      : 'bg-[#161b22] border-[#1e293b] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Raw Telemetry Logs (JSON):
            </label>
            <textarea
              rows={6}
              value={rawLogs}
              onChange={(e) => setRawLogs(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#0b0f19] border border-[#1e293b] text-indigo-300 font-mono text-xs focus:outline-none focus:border-indigo-400"
            />
          </div>

          {result && (
            <div className={`p-3 rounded-xl border font-mono text-xs ${result.status === 'SUCCESS' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
              {result.status === 'SUCCESS' ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Successfully normalized {result.normalized_count} raw logs from source {result.source_type}!</span>
                </div>
              ) : (
                <div>Error: {result.message}</div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-mono text-xs hover:bg-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleIngest}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : <FileCode className="w-4 h-4" />}
            <span>NORMALIZE & INGEST LOGS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
