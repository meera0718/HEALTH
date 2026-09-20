import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Shield, Play, Pause, SkipBack, SkipForward, RotateCcw,
  Clock, Square, Ban, CheckCircle, Radio, X, Cpu, Server, Flame
} from 'lucide-react';
import { HospitalScene3D, type CameraPreset } from '../features/digital-twin/HospitalScene3D';
import { api } from '../api/client';
import type {
  DeviceGridItem, DecoyAsset, DigitalTwinZone, DigitalTwinResponse,
  DeviceDetailResponse
} from '../types';

export const HospitalDigitalTwin: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HospitalScene3D | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Live Digital Twin State
  const [twinData, setTwinData] = useState<DigitalTwinResponse | null>(null);
  const [devices, setDevices] = useState<DeviceGridItem[]>([]);
  const [honeypots, setHoneypots] = useState<DecoyAsset[]>([]);
  const [zones, setZones] = useState<DigitalTwinZone[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Connection health indicator
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [lastUpdateTimestamp, setLastUpdateTimestamp] = useState<string>('');
  const [tickCount, setTickCount] = useState<number>(0);
  const [isStale, setIsStale] = useState<boolean>(false);

  // Mode: LIVE vs REPLAY
  const [mode, setMode] = useState<'LIVE' | 'REPLAY'>('LIVE');
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [replayIsPlaying, setReplayIsPlaying] = useState<boolean>(false);

  // Selected camera preset & zone
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPreset>('OVERVIEW');

  // Selected device for inspector drawer
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [deviceDetail, setDeviceDetail] = useState<DeviceDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Hover tooltip state
  const [hoverInfo, setHoverInfo] = useState<{
    id: string;
    name: string;
    type: string;
    status: string;
    risk: number;
    agreement: string;
    threat: string;
    pos: { x: number; y: number };
  } | null>(null);

  // Attack simulator state
  const [attackType, setAttackType] = useState<string>('DATA_EXFILTRATION');
  const [attackIntensity, setAttackIntensity] = useState<string>('HIGH');
  const [simLoading, setSimLoading] = useState<boolean>(false);

  // Action toast banner
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const devicesRef = useRef<DeviceGridItem[]>([]);
  const honeypotsRef = useRef<DecoyAsset[]>([]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    honeypotsRef.current = honeypots;
  }, [honeypots]);

  // 1. Initial REST Snapshot Load
  const loadInitialSnapshot = async () => {
    try {
      setLoading(true);
      const data = await api.getDigitalTwinState();
      setTwinData(data);
      setDevices(data.devices || []);
      setHoneypots(data.honeypots || []);
      setZones(data.zones || []);
      setLastUpdateTimestamp(data.timestamp);

      if (sceneRef.current) {
        sceneRef.current.syncHospitalData(data.devices || [], data.honeypots || [], data.zones || []);
      }
    } catch (err) {
      console.error('Failed to load Digital Twin snapshot', err);
      showToast('error', 'Failed to retrieve initial Digital Twin state.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Setup Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new HospitalScene3D(containerRef.current);
    sceneRef.current = scene;

    scene.onDeviceClick = (deviceId: string) => {
      setSelectedDeviceId(deviceId);
    };

    scene.onDeviceHover = (deviceId: string | null, mouseEvt?: { x: number; y: number }) => {
      if (!deviceId) {
        setHoverInfo(null);
        return;
      }

      const dev = devicesRef.current.find((d) => d.device_id === deviceId);
      const dec = honeypotsRef.current.find((h) => h.id === deviceId);

      if (dev && mouseEvt) {
        setHoverInfo({
          id: dev.device_id,
          name: dev.device_name,
          type: dev.device_type,
          status: dev.status,
          risk: dev.risk_score,
          agreement: dev.model_agreement,
          threat: dev.threat,
          pos: mouseEvt,
        });
      } else if (dec && mouseEvt) {
        setHoverInfo({
          id: dec.id,
          name: dec.name,
          type: dec.asset_type,
          status: dec.status,
          risk: dec.risk_score,
          agreement: 'DECOY TRAP',
          threat: dec.status === 'TRIGGERED' ? 'ATTACKER INTERCEPTED' : 'ARMED',
          pos: mouseEvt,
        });
      }
    };

    loadInitialSnapshot();

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 3. Connect Live SSE Stream
  useEffect(() => {
    if (mode !== 'LIVE') {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    const connectSSE = () => {
      const sse = new EventSource('/api/v1/devices/telemetry-stream');
      sseRef.current = sse;

      sse.onopen = () => {
        setSseConnected(true);
        setIsStale(false);
      };

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'DEVICES_UPDATE' && Array.isArray(payload.devices)) {
            const updatedDevs: DeviceGridItem[] = payload.devices;
            setDevices(updatedDevs);
            setTickCount((prev) => prev + 1);
            setLastUpdateTimestamp(new Date().toISOString());
            setIsStale(false);

            setZones((prevZones) => {
              const updatedZones = prevZones.map((z) => {
                const zDevs = updatedDevs.filter((d) => z.device_ids?.includes(d.device_id));
                const zDecoys = honeypots.filter((h) => z.decoy_ids?.includes(h.id));
                const zRisks = zDevs.map((d) => d.risk_score || 0);
                const avgRisk = zRisks.length > 0 ? Math.round((zRisks.reduce((a, b) => a + b, 0) / zRisks.length) * 10) / 10 : 0;
                const peakRisk = zRisks.length > 0 ? Math.round(Math.max(...zRisks) * 10) / 10 : 0;
                const threatCount = zDevs.filter((d) => d.status === 'CRITICAL' || d.status === 'HIGH RISK' || d.attack_active).length;
                const isolatedCount = zDevs.filter((d) => d.status === 'ISOLATED').length;
                const attackActive = zDevs.some((d) => d.attack_active) || zDecoys.some((h) => h.status === 'TRIGGERED');
                return {
                  ...z,
                  average_risk: avgRisk,
                  peak_risk: peakRisk,
                  threat_count: threatCount,
                  isolated_count: isolatedCount,
                  attack_active: attackActive
                };
              });

              if (sceneRef.current) {
                sceneRef.current.syncHospitalData(updatedDevs, honeypots, updatedZones);
              }
              return updatedZones;
            });
          }
        } catch (e) {
          console.error('Error processing live SSE message', e);
        }
      };

      sse.onerror = () => {
        setSseConnected(false);
        setIsStale(true);
        sse.close();
        setTimeout(connectSSE, 3500);
      };
    };

    connectSSE();

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, [mode, honeypots, zones]);

  // 4. Check Stale Connection Timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdateTimestamp) {
        const diffMs = Date.now() - new Date(lastUpdateTimestamp).getTime();
        if (diffMs > 8000) {
          setIsStale(true);
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [lastUpdateTimestamp]);

  // 5. Load Selected Device Forensic Details
  useEffect(() => {
    if (!selectedDeviceId) {
      setDeviceDetail(null);
      return;
    }

    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const data = await api.getDeviceDetail(selectedDeviceId);
        setDeviceDetail(data);
      } catch {
        setDeviceDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    };

    fetchDetail();
  }, [selectedDeviceId]);

  // Keep device detail in sync with live stream
  useEffect(() => {
    if (selectedDeviceId && devices.length > 0 && deviceDetail) {
      const activeDev = devices.find((d) => d.device_id === selectedDeviceId);
      if (activeDev) {
        setDeviceDetail((prev) =>
          prev
            ? {
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
                previous_risk: activeDev.previous_risk,
              },
              features: activeDev.features_15d
                ? {
                  ...prev.features,
                  ...activeDev.features_15d,
                }
                : prev.features,
              ml_fuses: {
                ...prev.ml_fuses,
                detection_score: activeDev.risk_score,
                fec_score: activeDev.fec_score,
                ocsvm_anomaly_score: activeDev.ocsvm_anomaly_score,
                isolation_forest_anomaly_score: activeDev.isolation_forest_anomaly_score,
                xgboost_suspiciousness_score: activeDev.xgboost_suspiciousness_score,
                xgboost_predicted_class: activeDev.threat,
                evidence_strength: activeDev.evidence_strength || prev.ml_fuses.evidence_strength,
              },
            }
            : null
        );
      }
    }
  }, [devices]);

  // Handle Camera Preset Switch
  const handlePresetSelect = (preset: CameraPreset) => {
    setActiveCameraPreset(preset);
    if (sceneRef.current) {
      sceneRef.current.setCameraPreset(preset);
    }
  };

  // Actions
  const handleStartAttack = async () => {
    if (!selectedDeviceId) return;
    setSimLoading(true);
    try {
      const res = await api.startAttack(selectedDeviceId, attackType, attackIntensity);
      showToast('success', res.message || `Simulation started on ${selectedDeviceId}`);
      await loadInitialSnapshot();
    } catch (err: any) {
      showToast('error', `Attack simulation failed: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleStopAttack = async () => {
    if (!selectedDeviceId) return;
    setSimLoading(true);
    try {
      const res = await api.stopAttack(selectedDeviceId);
      showToast('info', res.message || `Simulation stopped on ${selectedDeviceId}`);
      await loadInitialSnapshot();
    } catch (err: any) {
      showToast('error', `Failed to stop simulation: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleQuarantine = async () => {
    if (!selectedDeviceId) return;
    setSimLoading(true);
    try {
      const res = await api.quarantineDevice(selectedDeviceId, 'Operator 3D Digital Twin Containment');
      showToast('info', res.message || `Device ${selectedDeviceId} isolated into containment VLAN.`);
      await loadInitialSnapshot();
    } catch (err: any) {
      showToast('error', `Isolation failed: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedDeviceId) return;
    setSimLoading(true);
    try {
      const res = await api.restoreDevice(selectedDeviceId);
      showToast('success', res.message || `Device ${selectedDeviceId} restored to normal monitoring status.`);
      await loadInitialSnapshot();
    } catch (err: any) {
      showToast('error', `Restoration failed: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleTriggerDecoy = async (decoyId: string) => {
    try {
      const res = await api.triggerDecoy(decoyId, 'Staff-PC-07', 'HSX-042');
      showToast('info', res.alert_banner?.title || `Synthetic Decoy ${decoyId} triggered. Threat intercepted.`);
      await loadInitialSnapshot();
    } catch (err: any) {
      showToast('error', `Decoy trigger failed: ${err.message}`);
    }
  };

  // Replay Mode Timeline Events (Sorted Chronologically)
  const chronologicalEvents = useMemo(() => {
    const raw = twinData?.recent_events || [];
    return [...raw].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [twinData?.recent_events]);

  // Auto-play timeline loop
  useEffect(() => {
    if (mode !== 'REPLAY' || !replayIsPlaying || chronologicalEvents.length === 0) return;
    const interval = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= chronologicalEvents.length - 1) {
          setReplayIsPlaying(false);
          return prev;
        }
        const nextIdx = prev + 1;
        const evt = chronologicalEvents[nextIdx];
        if (evt && evt.patient_id) {
          setSelectedDeviceId(evt.patient_id);
        }
        return nextIdx;
      });
    }, 1600);
    return () => clearInterval(interval);
  }, [mode, replayIsPlaying, chronologicalEvents]);

  // Replay Navigation Handlers (Strictly Read-Only)
  const handleReturnToLive = () => {
    setMode('LIVE');
    setReplayIsPlaying(false);
    loadInitialSnapshot();
  };

  const handlePrevEvent = () => {
    setReplayIsPlaying(false);
    setReplayIndex((prev) => {
      const nextIdx = Math.max(0, prev - 1);
      const evt = chronologicalEvents[nextIdx];
      if (evt && evt.patient_id) {
        setSelectedDeviceId(evt.patient_id);
      }
      return nextIdx;
    });
  };

  const handleNextEvent = () => {
    setReplayIsPlaying(false);
    setReplayIndex((prev) => {
      const nextIdx = Math.min(chronologicalEvents.length - 1, prev + 1);
      const evt = chronologicalEvents[nextIdx];
      if (evt && evt.patient_id) {
        setSelectedDeviceId(evt.patient_id);
      }
      return nextIdx;
    });
  };

  const handleReplayScrub = (idx: number) => {
    setReplayIsPlaying(false);
    setReplayIndex(idx);
    const evt = chronologicalEvents[idx];
    if (evt && evt.patient_id) {
      setSelectedDeviceId(evt.patient_id);
    }
  };

  const selectedDeviceObj = useMemo(() => {
    if (!selectedDeviceId) return null;
    return devices.find((d) => d.device_id === selectedDeviceId) || null;
  }, [devices, selectedDeviceId]);

  const selectedDecoyObj = useMemo(() => {
    if (!selectedDeviceId) return null;
    return honeypots.find((h) => h.id === selectedDeviceId) || null;
  }, [honeypots, selectedDeviceId]);

  return (
    <div className="w-full h-[calc(100vh-140px)] min-h-[640px] flex flex-col font-sans text-slate-100 bg-[#080c14] relative overflow-hidden select-none rounded-xl border border-white/10 shadow-2xl">

      {/* 1. FLOATING TOAST BANNER */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 animate-bounce duration-300">
          <div
            className={`px-4 py-2.5 rounded-xl border font-mono text-xs font-bold shadow-2xl flex items-center gap-2 backdrop-blur-xl ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-300'
                : 'bg-indigo-950/90 border-indigo-500/50 text-indigo-300'
            }`}
          >
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 2. TOP HUD HEADER BAR */}
      <header className="px-4 py-2.5 bg-[#0b0f19]/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 backdrop-blur-md">

        {/* Left Brand & Connection / Mode Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-sm sm:text-base text-white tracking-wide font-mono">
                3D HOSPITAL DIGITAL TWIN
              </h1>

              {/* LIVE vs REPLAY Mode Status Pill */}
              {mode === 'LIVE' ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    sseConnected && !isStale
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : isStale
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      sseConnected && !isStale
                        ? 'bg-emerald-400 animate-ping'
                        : isStale
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  ></span>
                  {sseConnected && !isStale ? `LIVE STREAMING (#${tickCount})` : isStale ? 'STALE' : 'DISCONNECTED'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm">
                  <Clock className="w-3 h-3 text-purple-400" />
                  REPLAY MODE (READ-ONLY)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-sans hidden sm:block">
              {mode === 'LIVE'
                ? 'Real-time 3D spatial mapping of healthcare telemetry & ML defense engines'
                : 'Reviewing past telemetry and security events along the kill-chain timeline'}
            </p>
          </div>
        </div>

        {/* Center Hospital Health Summary Gauges */}
        <div className="flex items-center gap-2 font-mono text-xs overflow-x-auto">
          <div className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Hospital Risk:</span>
            <span
              className={`font-bold ${
                (twinData?.risk?.mean_risk || 0) >= 50
                  ? 'text-rose-400'
                  : (twinData?.risk?.mean_risk || 0) >= 25
                  ? 'text-amber-300'
                  : 'text-emerald-400'
              }`}
            >
              {twinData?.risk?.mean_risk ?? 0} <span className="text-[9px] text-slate-500">/100</span>
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center gap-2">
            <span className="text-[10px] text-slate-400">ICU Risk:</span>
            <span className="font-bold text-cyan-300">{twinData?.risk?.icu_risk ?? 0}</span>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Threats:</span>
            <span
              className={`font-bold ${
                (twinData?.risk?.critical_devices || 0) > 0 ? 'text-rose-400' : 'text-slate-200'
              }`}
            >
              {twinData?.risk?.critical_devices || 0}
            </span>
          </div>
        </div>

        {/* Right Mode Switcher & Camera Preset Selectors */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Live / Replay Toggle */}
          <div className="flex rounded-lg bg-[#161b22] p-0.5 border border-[#1e293b]">
            <button
              onClick={handleReturnToLive}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'LIVE' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className={`w-3 h-3 ${mode === 'LIVE' ? 'animate-pulse text-white' : 'text-slate-400'}`} />
              LIVE
            </button>
            <button
              onClick={() => setMode('REPLAY')}
              className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                mode === 'REPLAY' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3" />
              REPLAY
            </button>
          </div>

          {/* Quick Camera Presets */}
          <div className="hidden lg:flex items-center gap-1">
            {(
              [
                { id: 'OVERVIEW', label: '🏢 OVERVIEW' },
                { id: 'ZONE-ICU', label: '🫀 ICU' },
                { id: 'ZONE-NURSE', label: '👩‍⚕️ NURSE' },
                { id: 'ZONE-WARD', label: '🩺 WARD' },
                { id: 'ZONE-CORE', label: '🔒 CORE' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetSelect(p.id)}
                className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                  activeCameraPreset === p.id
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-[#161b22] border-[#1e293b] text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 3. REPLAY MODE TIMELINE SCRUBBER BAR */}
      {mode === 'REPLAY' && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-purple-950/70 via-[#0d121f] to-purple-950/70 border-b border-purple-500/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-mono text-xs z-20 shadow-xl backdrop-blur-md">
          
          {/* Left: Mode Title & Direct Return to Live Action */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-500/40 font-bold text-[10px]">
              <Clock className="w-3 h-3 text-purple-400" />
              HISTORICAL EVENTS
            </span>
            <button
              onClick={handleReturnToLive}
              className="px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 font-bold text-[10px] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Return to Live real-time stream"
            >
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              Return to Live
            </button>
          </div>

          {/* Center: Playback Controls & Timeline Scrubber */}
          <div className="flex-1 flex items-center gap-2 max-w-xl">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handlePrevEvent}
                disabled={replayIndex <= 0}
                className="p-1 rounded bg-[#161b22] border border-purple-500/30 text-purple-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                title="Previous Event"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setReplayIsPlaying(!replayIsPlaying)}
                className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                title={replayIsPlaying ? 'Pause Playback' : 'Play Timeline'}
              >
                {replayIsPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span className="text-[10px]">{replayIsPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>
              <button
                onClick={handleNextEvent}
                disabled={replayIndex >= chronologicalEvents.length - 1}
                className="p-1 rounded bg-[#161b22] border border-purple-500/30 text-purple-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                title="Next Event"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setReplayIsPlaying(false);
                  setReplayIndex(0);
                  if (chronologicalEvents[0]?.patient_id) {
                    setSelectedDeviceId(chronologicalEvents[0].patient_id);
                  }
                }}
                className="p-1 rounded bg-[#161b22] border border-purple-500/30 text-purple-300 hover:text-white cursor-pointer transition-all"
                title="Reset to Earliest Event"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, chronologicalEvents.length - 1)}
                value={replayIndex}
                onChange={(e) => handleReplayScrub(parseInt(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer h-1.5 bg-purple-950/60 rounded-lg"
              />
              <span className="text-[10px] text-purple-200 shrink-0 tabular-nums font-mono">
                {chronologicalEvents.length > 0 ? `${replayIndex + 1} / ${chronologicalEvents.length}` : '0 / 0'}
              </span>
            </div>
          </div>

          {/* Right: Current Event Details Card */}
          {chronologicalEvents[replayIndex] ? (
            <div className="flex items-center gap-2 shrink-0 bg-[#0f1422] px-2.5 py-1 rounded border border-purple-500/30 text-[11px]">
              <span className="text-purple-300/70 text-[10px]">
                {chronologicalEvents[replayIndex].timestamp
                  ? new Date(chronologicalEvents[replayIndex].timestamp).toLocaleTimeString()
                  : '--:--:--'}
              </span>
              <span className="text-white font-bold px-1.5 py-0.5 rounded bg-purple-900/50 border border-purple-400/30 text-[10px]">
                {chronologicalEvents[replayIndex].patient_id}
              </span>
              <span className="text-purple-200 font-semibold truncate max-w-[130px]">
                {chronologicalEvents[replayIndex].event_type}
              </span>
              {chronologicalEvents[replayIndex].is_anomalous && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  ANOMALY
                </span>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-purple-300/60 shrink-0">
              No recorded events in history
            </div>
          )}
        </div>
      )}

      {/* 4. MAIN 3D HOSPITAL VIEWPORT */}
      <div className="flex-1 relative w-full h-full min-h-[480px] overflow-hidden bg-[#080c14]">

        {/* Loading Snapshot Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-[#080c14]/80 backdrop-blur-md flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-mono text-xs text-cyan-300 font-bold tracking-widest animate-pulse">
              INITIALIZING 3D DIGITAL TWIN...
            </span>
          </div>
        )}

        {/* Canvas Container */}
        <div ref={containerRef} className="w-full h-full min-h-[480px] cursor-grab active:cursor-grabbing block relative" />

        {/* Floating Zone Selection Pills Overlay */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 pointer-events-auto">
          {zones.map((z) => {
            const isSelected = activeCameraPreset === z.zone_id;
            return (
              <button
                key={z.zone_id}
                onClick={() => handlePresetSelect(z.zone_id as CameraPreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold backdrop-blur-xl border transition-all cursor-pointer shadow-lg flex items-center gap-2 ${isSelected
                    ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-cyan-500/20'
                    : z.attack_active
                      ? 'bg-rose-950/70 border-rose-500/60 text-rose-300 animate-pulse'
                      : 'bg-[#0f172a]/80 border-white/10 text-slate-300 hover:border-white/30'
                  }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${z.attack_active ? 'bg-rose-400 animate-ping' : isSelected ? 'bg-cyan-400' : 'bg-slate-400'
                    }`}
                ></span>
                <span>{z.name}</span>
                <span className="text-[10px] text-slate-400 px-1 py-0.2 rounded bg-black/40">
                  {z.average_risk} risk
                </span>
              </button>
            );
          })}
        </div>

        {/* Floating 3D Navigation Controls Legend (Bottom-Left) */}
        <div className="absolute bottom-10 left-4 z-10 hidden sm:block p-2.5 rounded-xl bg-[#0b0f19]/85 border border-white/10 backdrop-blur-md font-mono text-[10px] text-slate-400 space-y-1">
          <div className="text-cyan-400 font-bold tracking-wider">3D NAVIGATION HINTS</div>
          <div>• Left Click + Drag: Orbit Camera</div>
          <div>• Scroll: Zoom In / Out</div>
          <div>• Click 3D Device: Live Forensic Inspector</div>
        </div>

        {/* Floating Hover Tooltip */}
        {hoverInfo && (
          <div
            className="fixed pointer-events-none z-40 p-3 rounded-xl bg-[#0f172a]/95 border border-cyan-500/50 shadow-2xl backdrop-blur-xl text-xs font-mono text-slate-100 transform -translate-x-1/2 -translate-y-full -mt-3 space-y-1 min-w-[200px]"
            style={{ left: hoverInfo.pos.x, top: hoverInfo.pos.y }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
              <span className="font-bold text-white text-sm">{hoverInfo.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                {hoverInfo.id}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">{hoverInfo.type}</div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">Risk Score:</span>
              <span
                className={`font-bold ${hoverInfo.risk >= 50
                    ? 'text-rose-400'
                    : hoverInfo.risk >= 25
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }`}
              >
                {Math.round(hoverInfo.risk)} / 100
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">ML Agreement:</span>
              <span className="font-bold text-cyan-300">{hoverInfo.agreement}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Threat Status:</span>
              <span
                className={`font-bold ${hoverInfo.threat !== 'NORMAL' ? 'text-rose-400 animate-pulse' : 'text-slate-300'
                  }`}
              >
                {hoverInfo.threat}
              </span>
            </div>
          </div>
        )}

        {/* 5. SLIDE-OUT FORENSIC INSPECTOR DRAWER (RIGHT PANEL) */}
        {selectedDeviceId && (
          <div className="absolute top-0 right-0 h-full w-full sm:w-[460px] bg-[#0b0f19]/95 border-l border-white/10 backdrop-blur-2xl shadow-2xl z-30 flex flex-col overflow-hidden font-sans">

            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0d1117]/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-white text-sm">
                    {selectedDeviceObj?.device_name || selectedDecoyObj?.name || selectedDeviceId}
                  </h2>
                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                    <span>{selectedDeviceId}</span>
                    <span>•</span>
                    <span className="text-cyan-400">{selectedDeviceObj?.vlan || 'Healthcare VLAN'}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedDeviceId(null)}
                className="p-1.5 rounded-lg bg-[#161b22] hover:bg-[#1f2937] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">

              {/* Security Status Badge & Quick Actions */}
              <div className="p-3 rounded-xl bg-[#111827] border border-[#1e293b] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-400 text-[11px]">DEVICE STATUS</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border ${selectedDeviceObj?.status === 'ISOLATED'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : selectedDeviceObj?.status === 'CRITICAL' || (selectedDeviceObj?.risk_score || 0) >= 75
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                          : selectedDeviceObj?.status === 'HIGH RISK' || (selectedDeviceObj?.risk_score || 0) >= 50
                            ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                            : selectedDeviceObj?.status === 'SUSPICIOUS'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                  >
                    ● {selectedDeviceObj?.status || selectedDecoyObj?.status || 'SECURE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-2 rounded-lg bg-[#161b22] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block">Fused Risk Score</span>
                    <span className="text-base font-bold text-white">
                      {Math.round(selectedDeviceObj?.risk_score || selectedDecoyObj?.risk_score || 0)} / 100
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-[#161b22] border border-[#1e293b]">
                    <span className="text-[10px] text-slate-400 block">FEC Exposure</span>
                    <span className="text-base font-bold text-cyan-300">
                      {selectedDeviceObj?.fec_score?.toFixed(1) || '0.0'}
                    </span>
                  </div>
                </div>

                {/* Simulation & Isolation Controls */}
                <div className="flex items-center gap-2 pt-1 font-mono text-xs">
                  {selectedDeviceObj?.attack_active ? (
                    <button
                      onClick={handleStopAttack}
                      disabled={simLoading}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-white" />
                      <span>STOP ATTACK</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStartAttack}
                      disabled={simLoading || selectedDeviceObj?.status === 'ISOLATED'}
                      className="flex-1 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>START ATTACK</span>
                    </button>
                  )}

                  {selectedDeviceObj?.status === 'ISOLATED' ? (
                    <button
                      onClick={handleRestore}
                      disabled={simLoading}
                      className="px-3 py-2 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>RESTORE</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleQuarantine}
                      disabled={simLoading}
                      className="px-3 py-2 rounded-xl bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>ISOLATE</span>
                    </button>
                  )}
                </div>

                {/* Attack Type Selector */}
                {!selectedDeviceObj?.attack_active && (
                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">Scenario</span>
                      <select
                        value={attackType}
                        onChange={(e) => setAttackType(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#1e293b] rounded-lg px-2 py-1 text-slate-200 text-xs"
                      >
                        <option value="DATA_EXFILTRATION">Data Exfiltration</option>
                        <option value="BRUTE_FORCE">Brute Force</option>
                        <option value="RECONNAISSANCE">Reconnaissance</option>
                        <option value="PRIVILEGE_ABUSE">Privilege Abuse</option>
                        <option value="SUSPICIOUS_DATA_ACCESS">Suspicious Queries</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">Intensity</span>
                      <select
                        value={attackIntensity}
                        onChange={(e) => setAttackIntensity(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#1e293b] rounded-lg px-2 py-1 text-slate-200 text-xs"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* REAL ML 3-MODEL CONSENSUS BREAKDOWN */}
              <div className="p-3 rounded-xl bg-[#111827] border border-[#1e293b] space-y-3 font-mono">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>REAL ML MODEL CONSENSUS</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                    AGREEMENT: {selectedDeviceObj?.model_agreement || '3/3'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* One-Class SVM */}
                  <div className="p-2 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">One-Class SVM</div>
                      <div className="text-[10px] text-slate-400">Boundary Deviation</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-cyan-300">
                        {selectedDeviceObj?.ocsvm_anomaly_score?.toFixed(1) || '0.0'}%
                      </div>
                      <div className="text-[10px]">
                        {selectedDeviceObj?.ocsvm_is_anomalous ? (
                          <span className="text-rose-400 font-bold">ANOMALOUS</span>
                        ) : (
                          <span className="text-emerald-400">NORMAL</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Isolation Forest */}
                  <div className="p-2 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">Isolation Forest</div>
                      <div className="text-[10px] text-slate-400">Tree Isolation Score</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-indigo-300">
                        {selectedDeviceObj?.isolation_forest_anomaly_score?.toFixed(1) || '0.0'}%
                      </div>
                      <div className="text-[10px]">
                        {selectedDeviceObj?.isolation_forest_is_anomalous ? (
                          <span className="text-rose-400 font-bold">ANOMALOUS</span>
                        ) : (
                          <span className="text-emerald-400">NORMAL</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* XGBoost Classifier */}
                  <div className="p-2 rounded-lg bg-[#161b22] border border-[#1e293b] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">XGBoost Classifier</div>
                      <div className="text-[10px] text-slate-400">Predicted Threat Class</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-300">
                        {selectedDeviceObj?.xgboost_predicted_class || selectedDeviceObj?.threat || 'NORMAL'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Suspiciousness: {selectedDeviceObj?.xgboost_suspiciousness_score?.toFixed(1) || '0.0'}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evidence Strength & Detection Reasons */}
                {selectedDeviceObj?.detection_reasons && selectedDeviceObj.detection_reasons.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Detection Evidence:
                    </span>
                    {selectedDeviceObj.detection_reasons.map((r, idx) => (
                      <div key={idx} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 15-D BEHAVIORAL VECTOR SUMMARY */}
              {selectedDeviceObj?.features_15d && (
                <div className="p-3 rounded-xl bg-[#111827] border border-[#1e293b] space-y-2 font-mono text-xs">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                    15-D Behavioral Fingerprint
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-1.5 rounded bg-[#161b22] border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Records Accessed</span>
                      <span className="font-bold text-white">
                        {selectedDeviceObj.features_15d.total_records_accessed || 0}
                      </span>
                    </div>
                    <div className="p-1.5 rounded bg-[#161b22] border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Data Exports</span>
                      <span className="font-bold text-white">
                        {selectedDeviceObj.features_15d.data_export_count || 0}
                      </span>
                    </div>
                    <div className="p-1.5 rounded bg-[#161b22] border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Failed Logins</span>
                      <span className="font-bold text-white">
                        {(selectedDeviceObj.features_15d.failed_login_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-1.5 rounded bg-[#161b22] border border-white/5">
                      <span className="text-[9px] text-slate-400 block">Request Rate</span>
                      <span className="font-bold text-white">
                        {selectedDeviceObj.features_15d.request_rate?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* LIVE TELEMETRY LOGS TIMELINE */}
              {deviceDetail?.timeline && deviceDetail.timeline.length > 0 && (
                <div className="p-3 rounded-xl bg-[#111827] border border-[#1e293b] space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                      Live Telemetry Event Log (Sliding Window)
                    </span>
                    {loadingDetail && (
                      <span className="text-[10px] text-cyan-400 animate-pulse">Syncing...</span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {deviceDetail.timeline.slice(0, 6).map((evt, idx) => (
                      <div
                        key={idx}
                        className="p-1.5 rounded bg-[#161b22] border border-white/5 flex items-center justify-between text-[10px]"
                      >
                        <div>
                          <span className="text-cyan-400 font-bold block">{evt.event_type}</span>
                          <span className="text-slate-400 text-[9px]">{evt.endpoint}</span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-bold ${evt.is_anomalous || evt.severity === 'HIGH' ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                          >
                            {evt.response_status}
                          </span>
                          <span className="text-slate-500 text-[9px] block">
                            {evt.response_time_ms}ms
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DECOY TRIGGER BUTTON (IF DECOY SELECTED) */}
              {selectedDecoyObj && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-3 font-mono">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>AI DECEPTION HONEYPOT INTERACTION</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Triggering this decoy simulates attacker lateral movement interception without risking clinical assets.
                  </p>
                  <button
                    onClick={() => handleTriggerDecoy(selectedDecoyObj.id)}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>TRIGGER DECOY INTERCEPTION</span>
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* 6. BOTTOM REAL-TIME EVENT TICKER / MARQUEE */}
      <footer className="px-4 py-2 bg-[#0b0f19] border-t border-white/10 flex items-center justify-between gap-4 font-mono text-xs shrink-0 z-20 overflow-hidden">
        <div className="flex items-center gap-2 text-cyan-400 font-bold shrink-0 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>LIVE EVENTS //</span>
        </div>

        <div className="flex-1 overflow-x-auto whitespace-nowrap text-[11px] text-slate-400 flex items-center gap-6">
          {(twinData?.recent_events || []).slice(0, 8).map((e, idx) => (
            <div key={idx} className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">[{e.timestamp ? e.timestamp.slice(11, 19) : 'LIVE'}]</span>
              <span className="text-white font-bold">{e.patient_id}</span>
              <span className="text-cyan-400">{e.event_type}</span>
              <span className="text-slate-500">({e.response_status})</span>
            </div>
          ))}
        </div>

        <div className="text-[10px] text-slate-500 hidden md:block shrink-0">
          HEALTHSHIELD-X 3D TWIN v2.0
        </div>
      </footer>

    </div>
  );
};
