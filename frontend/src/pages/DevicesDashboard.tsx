import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Server, Zap, Activity, Play, Square, Ban, RefreshCw, 
  Shield, AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  X, ArrowUpRight, Cpu
} from 'lucide-react';
import { 
  AreaChart, Area, Line, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import type { DeviceGridItem, DeviceDetailResponse, Device15DFeatures } from '../types';
import { api } from '../api/client';

export function DevicesDashboard() {
  // Device list and selection state
  const [devices, setDevices] = useState<DeviceGridItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('PM-04');
  const [deviceDetail, setDeviceDetail] = useState<DeviceDetailResponse | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Progressive disclosure toggles inside modal
  const [showFullVector, setShowFullVector] = useState<boolean>(false);
  const [showMLDetails, setShowMLDetails] = useState<boolean>(false);

  // Attack simulator state
  const [attackType, setAttackType] = useState<string>('DATA_EXFILTRATION');
  const [attackIntensity, setAttackIntensity] = useState<string>('HIGH');
  const [attackLoading, setAttackLoading] = useState<boolean>(false);

  // Quarantine modal state
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState<boolean>(false);
  const [quarantineReason, setQuarantineReason] = useState<string>('Suspicious behavioral anomaly flagged by SOC analyst');
  const [quarantineLoading, setQuarantineLoading] = useState<boolean>(false);

  // SOC Action Notification Toast
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showBanner = (type: 'success' | 'error' | 'info', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Selected behavioral metric for the main Live Security Activity graph
  const [selectedMetric, setSelectedMetric] = useState<string>('records');

  // SSE Stream status
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const sseRef = useRef<EventSource | null>(null);

  // Time-series history for charts (stored per device in memory)
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, any[]>>({});

  // 1. Initial Load of Devices
  const loadDevices = async () => {
    try {
      const data = await api.getDevices();
      setDevices(data);
      if (data.length > 0 && !data.some(d => d.device_id === selectedDeviceId)) {
        setSelectedDeviceId(data[0].device_id);
      }
    } catch (err) {
      console.error("Failed to load devices", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Single Device Detail
  const loadDeviceDetail = async (id: string) => {
    try {
      const data = await api.getDeviceDetail(id);
      setDeviceDetail(data);
      if (data.history && data.history.length > 0) {
        const h = data.history;
        setTelemetryHistory(prev => ({
          ...prev,
          [id]: h
        }));
      }
    } catch (err) {
      console.error("Failed to load device details", err);
    }
  };

  // 3. Connect Server-Sent Events (SSE) Stream
  useEffect(() => {
    loadDevices();

    const connectSSE = () => {
      const sse = new EventSource('/api/v1/devices/telemetry-stream');
      sseRef.current = sse;

      sse.onopen = () => {
        setSseConnected(true);
      };

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'DEVICES_UPDATE' && Array.isArray(payload.devices)) {
            setDevices(payload.devices);

            // Update telemetry chart history for all devices
            const nowTime = new Date().toLocaleTimeString().slice(0, 8);
            payload.devices.forEach((d: DeviceGridItem) => {
              setTelemetryHistory((prev) => {
                const curList = prev[d.device_id] || [];
                const feat = d.features_15d;
                const newPoint = {
                  time: nowTime,
                  risk: Math.round(d.risk_score),
                  fec: Math.round(d.fec_score),
                  ocsvm: Math.round(d.ocsvm_anomaly_score),
                  iforest: Math.round(d.isolation_forest_anomaly_score),
                  xgb: Math.round(d.xgboost_suspiciousness_score),
                  records: feat?.total_records_accessed || (d.last_event?.records_accessed || 0),
                  exports: feat?.data_export_count || 0,
                  failed_logins: feat?.failed_login_rate ? Math.round(feat.failed_login_rate * 10) : (d.last_event?.failed_login_attempts || 0),
                  request_rate: Math.round(feat?.request_rate || 1),
                  response_time: Math.round(feat?.average_response_time_ms || d.last_event?.response_time_ms || 50),
                  downloads: feat?.suspicious_download_count || 0
                };
                const updated = [...curList, newPoint];
                return {
                  ...prev,
                  [d.device_id]: updated.slice(-25) // Keep last 25 time slices
                };
              });
            });
          }
        } catch (e) {
          console.error("Error processing SSE message", e);
        }
      };

      sse.onerror = () => {
        setSseConnected(false);
        sse.close();
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // When selected device changes, reload detail
  useEffect(() => {
    if (selectedDeviceId) {
      loadDeviceDetail(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // Keep detail view in sync when devices SSE updates
  useEffect(() => {
    if (selectedDeviceId && devices.length > 0) {
      const activeDev = devices.find(d => d.device_id === selectedDeviceId);
      if (activeDev && deviceDetail) {
        setDeviceDetail(prev => prev ? {
          ...prev,
          device_info: {
            ...prev.device_info,
            status: activeDev.status,
            risk_score: activeDev.risk_score,
            attack_active: activeDev.attack_active,
            attack_type: activeDev.attack_type,
            attack_intensity: activeDev.attack_intensity,
            last_seen: activeDev.last_seen,
            isolation_reason: activeDev.isolation_reason,
            isolation_time: activeDev.isolation_time,
            previous_risk: activeDev.previous_risk
          },
          features: activeDev.features_15d ? {
            ...prev.features,
            ...activeDev.features_15d
          } : prev.features,
          ml_fuses: {
            ...prev.ml_fuses,
            detection_score: activeDev.risk_score,
            fec_score: activeDev.fec_score,
            ocsvm_anomaly_score: activeDev.ocsvm_anomaly_score,
            isolation_forest_anomaly_score: activeDev.isolation_forest_anomaly_score,
            xgboost_suspiciousness_score: activeDev.xgboost_suspiciousness_score,
            xgboost_predicted_class: activeDev.threat,
            evidence_strength: activeDev.evidence_strength || prev.ml_fuses.evidence_strength
          }
        } : null);
      }
    }
  }, [devices]);

  // Handle Attack Start
  const handleStartAttack = async () => {
    if (!selectedDeviceId) return;
    setAttackLoading(true);
    try {
      const res = await api.startAttack(selectedDeviceId, attackType, attackIntensity);
      showBanner('success', res.message || `Simulation started on ${selectedDevice?.device_name}`);
      await loadDevices();
      await loadDeviceDetail(selectedDeviceId);
    } catch (err: any) {
      showBanner('error', `Simulation error: ${err.message}`);
    } finally {
      setAttackLoading(false);
    }
  };

  // Handle Attack Stop
  const handleStopAttack = async (deviceId: string) => {
    setAttackLoading(true);
    try {
      const res = await api.stopAttack(deviceId);
      showBanner('info', res.message || 'Simulation stopped. Device returning to baseline.');
      await loadDevices();
      await loadDeviceDetail(deviceId);
    } catch (err: any) {
      showBanner('error', `Error stopping simulation: ${err.message}`);
    } finally {
      setAttackLoading(false);
    }
  };

  // Handle Quarantine Action
  const handleQuarantine = async () => {
    if (!selectedDeviceId) return;
    setQuarantineLoading(true);
    try {
      const res = await api.quarantineDevice(selectedDeviceId, quarantineReason);
      setIsQuarantineModalOpen(false);
      showBanner('info', res.message || `Device ${selectedDevice?.device_name} isolated into containment VLAN.`);
      await loadDevices();
      await loadDeviceDetail(selectedDeviceId);
    } catch (err: any) {
      showBanner('error', `Isolation error: ${err.message}`);
    } finally {
      setQuarantineLoading(false);
    }
  };

  // Handle Restore Action
  const handleRestore = async (deviceId: string) => {
    try {
      const res = await api.restoreDevice(deviceId);
      showBanner('success', res.message || 'Device restored to normal monitoring status.');
      await loadDevices();
      await loadDeviceDetail(deviceId);
    } catch (err: any) {
      showBanner('error', `Restoration error: ${err.message}`);
    }
  };

  // Active selected device object from devices array
  const selectedDevice = useMemo(() => {
    return devices.find(d => d.device_id === selectedDeviceId) || devices[0] || null;
  }, [devices, selectedDeviceId]);

  // Four Clean Summary KPI Metrics
  const onlineCount = devices.length;
  const activeThreatsCount = devices.filter(d => d.status === 'CRITICAL' || d.status === 'HIGH RISK' || d.attack_active).length;
  const criticalCount = devices.filter(d => d.status === 'CRITICAL').length;
  const avgRisk = devices.length > 0 ? (devices.reduce((acc, d) => acc + d.risk_score, 0) / devices.length).toFixed(1) : '0';

  // Helper for Status Badge Styles
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'CRITICAL':
        return { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' };
      case 'HIGH RISK':
        return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' };
      case 'SUSPICIOUS':
        return { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-400' };
      case 'MONITORING':
        return { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30', dot: 'bg-cyan-400' };
      case 'ISOLATED':
        return { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30', dot: 'bg-purple-400' };
      case 'SECURE':
      default:
        return { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' };
    }
  };

  const selectedDevHistory = useMemo(() => {
    if (!selectedDeviceId) return [];
    const history = telemetryHistory[selectedDeviceId];
    if (history && history.length > 0) return history;

    // Immediately synthesize clean baseline points so the chart is never waiting
    const baseRisk = selectedDevice ? Math.round(selectedDevice.risk_score) : 10;
    const baseRecords = selectedDevice?.features_15d?.total_records_accessed || selectedDevice?.last_event?.records_accessed || 15;
    const baseExports = selectedDevice?.features_15d?.data_export_count || 0;
    const baseFailed = selectedDevice?.features_15d?.failed_login_rate ? Math.round(selectedDevice.features_15d.failed_login_rate * 10) : 0;
    const baseReqRate = Math.round(selectedDevice?.features_15d?.request_rate || 1);
    const baseDownloads = selectedDevice?.features_15d?.suspicious_download_count || 0;
    const baseRespTime = Math.round(selectedDevice?.features_15d?.average_response_time_ms || 45);

    const now = Date.now();
    const fallback = [];
    for (let i = 10; i >= 0; i--) {
      const t = new Date(now - i * 2500).toLocaleTimeString().slice(0, 8);
      fallback.push({
        time: t,
        risk: baseRisk,
        records: baseRecords,
        exports: baseExports,
        failed_logins: baseFailed,
        request_rate: baseReqRate,
        downloads: baseDownloads,
        response_time: baseRespTime
      });
    }
    return fallback;
  }, [telemetryHistory, selectedDeviceId, selectedDevice]);

  const current15DFeatures: Device15DFeatures | null = selectedDevice?.features_15d || deviceDetail?.features || null;

  // Compute abnormal dimensions dynamically for 15-D Fingerprint
  const abnormalDimensions = useMemo(() => {
    if (!current15DFeatures) return [];
    const ab: { name: string; val: string; desc: string }[] = [];

    if ((current15DFeatures.failed_login_rate || 0) > 0.08) {
      ab.push({ name: 'Failed Logins', val: `${(current15DFeatures.failed_login_rate * 100).toFixed(1)}%`, desc: 'Authentication failure spike' });
    }
    if ((current15DFeatures.data_export_count || 0) > 0) {
      ab.push({ name: 'Data Exports', val: `${current15DFeatures.data_export_count} files`, desc: 'Bulk data export activity' });
    }
    if ((current15DFeatures.total_records_accessed || 0) > 200) {
      ab.push({ name: 'Records Accessed', val: `${current15DFeatures.total_records_accessed.toLocaleString()} recs`, desc: 'High-volume query rate' });
    }
    if ((current15DFeatures.suspicious_download_count || 0) > 0) {
      ab.push({ name: 'Suspicious Downloads', val: `${current15DFeatures.suspicious_download_count}`, desc: 'Unusual payload downloads' });
    }
    if ((current15DFeatures.endpoint_discovery_count || 0) > 1) {
      ab.push({ name: 'Endpoint Scans', val: `${current15DFeatures.endpoint_discovery_count}`, desc: 'API route enumeration detected' });
    }
    if ((current15DFeatures.privilege_escalation_count || 0) > 0) {
      ab.push({ name: 'Privilege Escalation', val: `${current15DFeatures.privilege_escalation_count}`, desc: 'Unauthorized permission attempts' });
    }
    if ((current15DFeatures.error_rate || 0) > 0.08) {
      ab.push({ name: 'HTTP Error Rate', val: `${(current15DFeatures.error_rate * 100).toFixed(1)}%`, desc: 'Elevated 4xx/5xx responses' });
    }
    if ((current15DFeatures.average_response_time_ms || 0) > 200) {
      ab.push({ name: 'Response Time', val: `${Math.round(current15DFeatures.average_response_time_ms)} ms`, desc: 'High latency backend queries' });
    }

    return ab;
  }, [current15DFeatures]);

  const normalDimCount = 15 - abnormalDimensions.length;

  return (
    <div className="min-h-full w-full p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100 pb-24 relative">
      
      {/* Floating SOC Action Notification Toast */}
      {banner && (
        <div className="fixed top-20 right-6 z-50 animate-bounce duration-300">
          <div className={`px-4 py-2.5 rounded-xl border font-mono text-xs font-bold shadow-2xl flex items-center gap-2 backdrop-blur-xl ${
            banner.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300' 
              : banner.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-300'
              : 'bg-indigo-950/90 border-indigo-500/50 text-indigo-300'
          }`}>
            <span className="text-sm">
              {banner.type === 'success' ? '✓' : banner.type === 'error' ? '⚠' : 'ℹ'}
            </span>
            <span>{banner.text}</span>
          </div>
        </div>
      )}

      {/* 1. TOP SUMMARY BAR — Clean, 4 KPI Metrics + ● LIVE indicator */}
      <div className="bg-[#111827]/90 border border-[#1e293b] rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">LIVE DEVICES</h1>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                sseConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                ● LIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Real-time healthcare device telemetry & behavioral intelligence
            </p>
          </div>
        </div>

        {/* 4 Core Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="px-4 py-2 rounded-xl bg-[#161b22] border border-[#1e293b]">
            <span className="text-[10px] text-slate-400 block">Devices Online</span>
            <span className="text-lg font-bold text-white">{onlineCount}</span>
          </div>

          <div className="px-4 py-2 rounded-xl bg-[#161b22] border border-[#1e293b]">
            <span className="text-[10px] text-slate-400 block">Active Threats</span>
            <span className={`text-lg font-bold ${activeThreatsCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {activeThreatsCount}
            </span>
          </div>

          <div className="px-4 py-2 rounded-xl bg-[#161b22] border border-[#1e293b]">
            <span className="text-[10px] text-slate-400 block">Critical Devices</span>
            <span className={`text-lg font-bold ${criticalCount > 0 ? 'text-orange-400' : 'text-slate-200'}`}>
              {criticalCount}
            </span>
          </div>

          <div className="px-4 py-2 rounded-xl bg-[#161b22] border border-[#1e293b]">
            <span className="text-[10px] text-slate-400 block">Average Risk</span>
            <span className={`text-lg font-bold ${parseFloat(avgRisk) > 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {avgRisk} <span className="text-[10px] text-slate-500">/100</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. COMPACT ATTACK CONTROLS PANEL */}
      <div className="bg-[#111827]/90 border border-indigo-500/20 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-indigo-400 uppercase tracking-wider">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span>ATTACK SIMULATOR</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            Selected Target: <strong className="text-white">{selectedDevice?.device_name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center font-mono text-xs">
          {/* Target Device */}
          <div className="sm:col-span-3 space-y-1">
            <label className="text-[10px] text-slate-400 block">Target Device</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="w-full bg-[#161b22] border border-[#1e293b] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-sans text-xs"
            >
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_name} ({d.status})
                </option>
              ))}
            </select>
          </div>

          {/* Attack Type */}
          <div className="sm:col-span-4 space-y-1">
            <label className="text-[10px] text-slate-400 block">Attack Type</label>
            <select
              value={attackType}
              onChange={(e) => setAttackType(e.target.value)}
              className="w-full bg-[#161b22] border border-[#1e293b] rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-sans text-xs"
            >
              <option value="DATA_EXFILTRATION">Data Exfiltration (Bulk Exports)</option>
              <option value="BRUTE_FORCE">Brute Force (Auth Spikes)</option>
              <option value="RECONNAISSANCE">Reconnaissance (Endpoint Scans)</option>
              <option value="PRIVILEGE_ABUSE">Privilege Abuse (Role Escalation)</option>
              <option value="SUSPICIOUS_DATA_ACCESS">Suspicious Data Access (Queries)</option>
            </select>
          </div>

          {/* Intensity */}
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] text-slate-400 block">Intensity</label>
            <div className="grid grid-cols-3 gap-1">
              {['LOW', 'MED', 'HIGH'].map(lvl => {
                const fullLvl = lvl === 'MED' ? 'MEDIUM' : lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setAttackIntensity(fullLvl)}
                    className={`py-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      attackIntensity === fullLvl
                        ? 'bg-indigo-600 text-white border border-indigo-400'
                        : 'bg-[#161b22] text-slate-400 hover:text-white border border-[#1e293b]'
                    }`}
                  >
                    {lvl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions: START SIMULATION & STOP & ISOLATE */}
          <div className="sm:col-span-3 flex items-end gap-2 pt-3 sm:pt-0">
            {selectedDevice?.attack_active ? (
              <button
                onClick={() => handleStopAttack(selectedDevice.device_id)}
                disabled={attackLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>STOP</span>
              </button>
            ) : (
              <button
                onClick={handleStartAttack}
                disabled={attackLoading || selectedDevice?.status === 'ISOLATED'}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>START</span>
              </button>
            )}

            {selectedDevice?.status === 'ISOLATED' ? (
              <button
                onClick={() => handleRestore(selectedDevice.device_id)}
                disabled={attackLoading || quarantineLoading}
                className="px-3 py-2.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs shrink-0"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>RESTORE</span>
              </button>
            ) : (
              <button
                onClick={() => setIsQuarantineModalOpen(true)}
                disabled={attackLoading || quarantineLoading}
                className="px-3 py-2.5 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs shrink-0"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>ISOLATE</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. MAIN DASHBOARD: LIVE DEVICE GRID + LIVE SECURITY ACTIVITY GRAPH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LIVE DEVICE GRID (lg:col-span-5) — Clean, minimal cards */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
              DEVICE FLEET ({devices.length})
            </h2>
            <span className="text-[10px] text-cyan-400 font-mono">CLICK TO INVESTIGATE</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cyan-400 mb-2" />
                Loading devices...
              </div>
            ) : devices.map((dev) => {
              const badge = getStatusBadge(dev.status);
              const isSelected = selectedDeviceId === dev.device_id;

              return (
                <div
                  key={dev.device_id}
                  onClick={() => {
                    setSelectedDeviceId(dev.device_id);
                    setIsDetailOpen(true);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                    isSelected
                      ? 'bg-cyan-950/20 border-cyan-500/80 shadow-md shadow-cyan-500/10'
                      : dev.attack_active
                      ? 'bg-rose-950/15 border-rose-500/40 hover:border-rose-500'
                      : 'bg-[#111827]/90 border-[#1e293b] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors">
                        {dev.device_name}
                      </h3>
                      <div className="text-xs text-slate-400">{dev.device_type}</div>
                    </div>

                    <div className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold flex items-center gap-1.5 shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} ${dev.status === 'CRITICAL' || dev.status === 'HIGH RISK' ? 'animate-pulse' : ''}`}></span>
                      <span>● {dev.status}</span>
                    </div>
                  </div>

                  {/* Clean Risk Score */}
                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400 text-[11px]">Risk: <strong className="text-white">{Math.round(dev.risk_score)}</strong></span>
                    
                    <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          dev.risk_score >= 75 ? 'bg-rose-500' :
                          dev.risk_score >= 50 ? 'bg-orange-500' :
                          dev.risk_score >= 25 ? 'bg-amber-400' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(5, dev.risk_score)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LIVE ACTIVITY GRAPH (lg:col-span-7) — Visual Centerpiece */}
        <div className="lg:col-span-7 bg-[#111827]/90 border border-[#1e293b] rounded-2xl p-5 shadow-2xl backdrop-blur-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-3">
            <div>
              <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>LIVE SECURITY ACTIVITY</span>
              </h2>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                Real-time behavior response for <strong>{selectedDevice?.device_name}</strong>
              </p>
            </div>

            {/* Metric Dropdown */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-400 text-[11px]">Metric:</span>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="bg-[#161b22] border border-[#1e293b] rounded-xl px-2.5 py-1.5 text-cyan-300 font-bold focus:outline-none focus:border-cyan-500 text-xs"
              >
                <option value="records">Records Accessed</option>
                <option value="exports">Data Exports</option>
                <option value="failed_logins">Failed Logins</option>
                <option value="request_rate">Request Rate</option>
                <option value="downloads">Suspicious Downloads</option>
                <option value="response_time">Response Time (ms)</option>
              </select>
            </div>
          </div>

          {/* Graph Visualization */}
          <div className="h-72 w-full bg-[#0d1117] border border-[#1e293b] rounded-xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selectedDevHistory}>
                <defs>
                  <linearGradient id="riskGradClean" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                <YAxis stroke="#475569" fontSize={9} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }} />
                
                {/* Primary Curve: Fused Device Risk */}
                <Area type="monotone" dataKey="risk" stroke="#38bdf8" strokeWidth={2.5} fillOpacity={1} fill="url(#riskGradClean)" name="Device Risk Score" />
                
                {/* Secondary Curve: Selected Behavioral Metric */}
                {selectedMetric === 'records' && (
                  <Line type="monotone" dataKey="records" stroke="#818cf8" strokeWidth={2} dot={false} name="Records Accessed" />
                )}
                {selectedMetric === 'exports' && (
                  <Line type="monotone" dataKey="exports" stroke="#f43f5e" strokeWidth={2} dot={false} name="Data Exports" />
                )}
                {selectedMetric === 'failed_logins' && (
                  <Line type="monotone" dataKey="failed_logins" stroke="#fb7185" strokeWidth={2} dot={false} name="Failed Logins" />
                )}
                {selectedMetric === 'request_rate' && (
                  <Line type="monotone" dataKey="request_rate" stroke="#34d399" strokeWidth={2} dot={false} name="Request Rate" />
                )}
                {selectedMetric === 'downloads' && (
                  <Line type="monotone" dataKey="downloads" stroke="#f59e0b" strokeWidth={2} dot={false} name="Suspicious Downloads" />
                )}
                {selectedMetric === 'response_time' && (
                  <Line type="monotone" dataKey="response_time" stroke="#c084fc" strokeWidth={2} dot={false} name="Response Time (ms)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                <span>Device Risk</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                <span className="capitalize">{selectedMetric.replace('_', ' ')}</span>
              </span>
            </div>
            <button
              onClick={() => setIsDetailOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Full Investigation</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* 4. DEVICE INVESTIGATION VIEW (MODAL / PROGRESSIVE DISCLOSURE) */}
      {isDetailOpen && selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#111827] border border-[#1e293b] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans my-auto">
            
            {/* TOP — Security Status */}
            <div className="p-4 sm:p-5 border-b border-[#1e293b] bg-[#0d1117] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{selectedDevice.device_name}</h2>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold ${getStatusBadge(selectedDevice.status).bg} ${getStatusBadge(selectedDevice.status).text} ${getStatusBadge(selectedDevice.status).border}`}>
                      ● {selectedDevice.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-3 mt-0.5">
                    <span>Risk: <strong className={selectedDevice.risk_score >= 50 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>{Math.round(selectedDevice.risk_score)}</strong></span>
                    <span>·</span>
                    <span>{selectedDevice.threat !== 'NORMAL' ? `${selectedDevice.threat} DETECTED` : 'NO ACTIVE THREATS'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                {selectedDevice.status === 'ISOLATED' ? (
                  <button
                    onClick={() => handleRestore(selectedDevice.device_id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>RESTORE</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsQuarantineModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>QUARANTINE</span>
                  </button>
                )}

                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="p-1.5 rounded-lg bg-[#161b22] hover:bg-[#1f2937] text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* MODAL BODY (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              
              {/* MIDDLE — Live Behavior Graph */}
              <div className="p-4 rounded-xl bg-[#0d1117] border border-[#1e293b] space-y-3">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>LIVE BEHAVIOR TIMELINE</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[10px]">Metric:</span>
                    <select
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value)}
                      className="bg-[#161b22] border border-[#1e293b] rounded-lg px-2 py-1 text-cyan-300 text-xs font-mono"
                    >
                      <option value="records">Records Accessed</option>
                      <option value="exports">Data Exports</option>
                      <option value="failed_logins">Failed Logins</option>
                      <option value="request_rate">Request Rate</option>
                      <option value="downloads">Suspicious Downloads</option>
                      <option value="response_time">Response Time (ms)</option>
                    </select>
                  </div>
                </div>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedDevHistory}>
                      <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                      <YAxis stroke="#475569" fontSize={9} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px', fontFamily: 'monospace' }} />
                      <Area type="monotone" dataKey="risk" stroke="#38bdf8" strokeWidth={2} fill="#38bdf8" fillOpacity={0.15} name="Risk Score" />
                      <Line type="monotone" dataKey={selectedMetric} stroke="#818cf8" strokeWidth={2} dot={false} name={selectedMetric.replace('_', ' ')} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* BOTTOM — 15-D Behavioral Fingerprint */}
              <div className="p-4 rounded-xl bg-[#0d1117] border border-[#1e293b] space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>15-D BEHAVIORAL FINGERPRINT</span>
                  </span>
                  <button
                    onClick={() => setShowFullVector(!showFullVector)}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showFullVector ? 'Hide Full Vector' : 'View Full 15-D Feature Vector'}</span>
                    {showFullVector ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Highlight abnormal dimensions */}
                <div className="space-y-2">
                  {abnormalDimensions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {abnormalDimensions.map((ab, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-rose-300 font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                              <span>{ab.name} ↑</span>
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">{ab.desc}</span>
                          </div>
                          <span className="font-bold text-rose-400 text-sm font-mono">{ab.val}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>All 15 behavioral dimensions within normal operational bounds.</span>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 pt-1">
                    ✓ {normalDimCount} other behavioral dimensions operating normally
                  </div>
                </div>

                {/* Expandable Full 15-D Vector Table */}
                {showFullVector && current15DFeatures && (
                  <div className="pt-3 border-t border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] animate-in fade-in duration-200">
                    {[
                      { label: 'Failed Login Rate', val: current15DFeatures.failed_login_rate?.toFixed(3) },
                      { label: 'Request Rate', val: `${current15DFeatures.request_rate?.toFixed(2)}/hr` },
                      { label: 'Records Accessed', val: current15DFeatures.total_records_accessed },
                      { label: 'Unique Endpoints', val: current15DFeatures.unique_endpoints },
                      { label: 'Endpoint Discovery', val: current15DFeatures.endpoint_discovery_count },
                      { label: 'Suspicious Downloads', val: current15DFeatures.suspicious_download_count },
                      { label: 'Data Exports', val: current15DFeatures.data_export_count },
                      { label: 'Privilege Escalations', val: current15DFeatures.privilege_escalation_count },
                      { label: 'Device Changes', val: current15DFeatures.device_change_count },
                      { label: 'Night Activity', val: current15DFeatures.night_activity_count },
                      { label: 'HTTP Error Rate', val: current15DFeatures.error_rate?.toFixed(3) },
                      { label: 'Anomalous Events', val: current15DFeatures.anomalous_event_count },
                      { label: 'Unique Sessions', val: current15DFeatures.unique_sessions },
                      { label: 'Unique Devices', val: current15DFeatures.unique_devices },
                      { label: 'Avg Response Time', val: `${Math.round(current15DFeatures.average_response_time_ms || 50)} ms` },
                    ].map((f, idx) => (
                      <div key={idx} className="p-2 rounded bg-[#161b22] border border-[#1e293b] flex justify-between">
                        <span className="text-slate-400 truncate">{f.label}:</span>
                        <span className="font-bold text-cyan-300 ml-1">{f.val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI DETECTION — Simple Summary */}
              <div className="p-4 rounded-xl bg-[#0d1117] border border-[#1e293b] space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    <span>AI DETECTION</span>
                  </span>
                  <button
                    onClick={() => setShowMLDetails(!showMLDetails)}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showMLDetails ? 'Hide ML Analysis' : 'View ML Analysis'}</span>
                    {showMLDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block">Threat Detected</span>
                    <span className={`font-bold ${selectedDevice.threat !== 'NORMAL' ? 'text-rose-400' : 'text-slate-200'}`}>
                      {selectedDevice.threat}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block">Detection Confidence</span>
                    <span className="font-bold text-emerald-400">
                      {selectedDevice.risk_score >= 50 ? 'HIGH' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#161b22] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block">Model Agreement</span>
                    <span className="font-bold text-cyan-300">
                      {selectedDevice.model_agreement || '3/3 Consensus'}
                    </span>
                  </div>
                </div>

                {/* Expandable ML Model Breakdown */}
                {showMLDetails && (
                  <div className="pt-3 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs animate-in fade-in duration-200">
                    <div className="p-2 rounded bg-[#161b22] border border-[#1e293b]">
                      <span className="text-[9px] text-slate-500 block">FEC Exposure</span>
                      <span className="font-bold text-cyan-300">{Math.round(selectedDevice.fec_score)}%</span>
                    </div>
                    <div className="p-2 rounded bg-[#161b22] border border-[#1e293b]">
                      <span className="text-[9px] text-slate-500 block">One-Class SVM</span>
                      <span className="font-bold text-indigo-300">{Math.round(selectedDevice.ocsvm_anomaly_score)}%</span>
                    </div>
                    <div className="p-2 rounded bg-[#161b22] border border-[#1e293b]">
                      <span className="text-[9px] text-slate-500 block">Isolation Forest</span>
                      <span className="font-bold text-purple-300">{Math.round(selectedDevice.isolation_forest_anomaly_score)}%</span>
                    </div>
                    <div className="p-2 rounded bg-[#161b22] border border-[#1e293b]">
                      <span className="text-[9px] text-slate-500 block">XGBoost Suspicion</span>
                      <span className="font-bold text-rose-300">{Math.round(selectedDevice.xgboost_suspiciousness_score)}%</span>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#1e293b] bg-[#0d1117] flex justify-end">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#161b22] hover:bg-[#1f2937] text-slate-200 border border-[#1e293b] font-bold text-xs cursor-pointer"
              >
                CLOSE
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. QUARANTINE MODAL */}
      {isQuarantineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#111827] border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl font-sans">
            <div className="flex items-center gap-3 text-purple-300 font-mono text-sm font-bold">
              <Ban className="w-5 h-5 text-purple-400" />
              <span>CONFIRM DEVICE QUARANTINE</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Isolating <strong>{selectedDevice?.device_name}</strong> will halt attack traffic, transition the device to <strong>ISOLATED</strong>, and preserve forensic artifacts.
            </p>

            <div className="space-y-1.5 font-mono text-xs">
              <label className="text-slate-400 block">Isolation Reason</label>
              <textarea
                value={quarantineReason}
                onChange={(e) => setQuarantineReason(e.target.value)}
                rows={3}
                className="w-full bg-[#161b22] border border-[#1e293b] rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-purple-500 font-sans text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
              <button
                onClick={() => setIsQuarantineModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#161b22] hover:bg-[#1f2937] text-slate-300 border border-[#1e293b] cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleQuarantine}
                disabled={quarantineLoading}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all shadow-lg shadow-purple-600/30 cursor-pointer"
              >
                {quarantineLoading ? 'ISOLATING...' : 'EXECUTE QUARANTINE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
