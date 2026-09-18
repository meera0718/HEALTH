import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { realtimeStream } from '../services/realtime';

export interface ServiceHealth {
  status: 'online' | 'ready' | 'streaming' | 'loaded' | 'connected' | 'degraded' | 'offline' | 'unavailable';
  latencyMs?: number;
  reason?: string;
  lastChecked?: string;
  dimension?: number;
}

export interface SystemHealthData {
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  timestamp?: string;
  components: Record<string, ServiceHealth>;
}

export interface PatientDetectionSummary {
  patient_id: string;
  fec_score: number;
  ocsvm_anomaly_score: number;
  ocsvm_is_anomalous?: boolean;
  isolation_forest_anomaly_score: number;
  isolation_forest_is_anomalous?: boolean;
  xgboost_predicted_class: string;
  xgboost_suspiciousness_score: number;
  detection_score: number;
  detection_status: 'NORMAL' | 'LOW CONCERN' | 'HIGH CONCERN' | 'CRITICAL';
  model_agreement: {
    count: number;
  };
  evidence_strength: 'LOW' | 'MODERATE' | 'STRONG';
}

export interface SecurityEventItem {
  event_id: string;
  timestamp: string;
  patient_id: string;
  event_type: string;
  severity: string;
  source_ip?: string;
  endpoint?: string;
  records_accessed?: number;
  failed_login_attempts?: number;
  synthetic?: boolean;
}

export interface DecoyAssetItem {
  id: string;
  name: string;
  asset_type: string;
  status: string;
  interaction_count: number;
  last_interaction?: string;
}

export interface MonitoredDeviceItem {
  device_id: string;
  device_name: string;
  device_type: string;
  status: string;
  risk_score: number;
  fec_score: number;
  threat: string;
}

export interface ReportingSummaryData {
  overview: {
    total_patients: number;
    total_security_events: number;
    normal_patients: number;
    suspicious_patients: number;
    high_risk_patients: number;
    critical_patients: number;
    total_detected_incidents: number;
    average_fec_score: number;
    average_detection_score: number;
  };
  models: {
    ocsvm: { anomalous: number; normal: number };
    isolation_forest: { anomalous: number; normal: number };
    xgboost: Record<string, number>;
    model_agreement: Record<string, number>;
  };
  threat_distribution: Record<string, number>;
}

export interface CommandCenterDataState {
  health: SystemHealthData | null;
  reporting: ReportingSummaryData | null;
  detections: PatientDetectionSummary[];
  events: SecurityEventItem[];
  decoys: DecoyAssetItem[];
  devices: MonitoredDeviceItem[];
  telemetryStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  lastTelemetryEvent: any | null;
  loading: boolean;
  error: string | null;
  lastSync: string | null;
}

export function useCommandCenterData(refreshIntervalMs = 5000) {
  const [data, setData] = useState<CommandCenterDataState>({
    health: null,
    reporting: null,
    detections: [],
    events: [],
    decoys: [],
    devices: [],
    telemetryStatus: 'DISCONNECTED',
    lastTelemetryEvent: null,
    loading: true,
    error: null,
    lastSync: null
  });

  const loadAllData = useCallback(async () => {
    let healthData: SystemHealthData | null = null;
    let reportingData: ReportingSummaryData | null = null;
    let detectionsData: PatientDetectionSummary[] = [];
    let eventsData: SecurityEventItem[] = [];
    let decoysData: DecoyAssetItem[] = [];
    let devicesData: MonitoredDeviceItem[] = [];

    // Isolated fetch calls using deduplicated apiRequest
    try {
      healthData = await apiRequest<SystemHealthData>('/api/v1/health');
    } catch (err) {
      console.warn('[CommandCenterData] Health check degraded:', err);
    }

    try {
      const json = await apiRequest<{ summary: ReportingSummaryData; events?: SecurityEventItem[] }>('/api/v1/reporting/summary');
      reportingData = json.summary;
      if (json.events && json.events.length > 0) {
        eventsData = json.events;
      }
    } catch (err) {
      console.warn('[CommandCenterData] Reporting summary degraded:', err);
    }

    try {
      detectionsData = await apiRequest<PatientDetectionSummary[]>('/api/v1/detection/patients');
    } catch (err) {
      console.warn('[CommandCenterData] Detection patients degraded:', err);
    }

    try {
      const json = await apiRequest<{ events?: SecurityEventItem[] } | SecurityEventItem[]>('/api/v1/honeypot/events');
      if (Array.isArray(json)) {
        eventsData = json;
      } else if (json.events) {
        eventsData = json.events;
      }
    } catch (err) {
      console.warn('[CommandCenterData] Honeypot events degraded:', err);
    }

    try {
      decoysData = await apiRequest<DecoyAssetItem[]>('/api/v1/deception/decoys');
    } catch (err) {
      console.warn('[CommandCenterData] Decoys degraded:', err);
    }

    try {
      devicesData = await apiRequest<MonitoredDeviceItem[]>('/api/v1/devices');
    } catch (err) {
      console.warn('[CommandCenterData] Devices degraded:', err);
    }

    setData(prev => ({
      health: healthData || prev.health,
      reporting: reportingData || prev.reporting,
      detections: detectionsData.length > 0 ? detectionsData : prev.detections,
      events: eventsData.length > 0 ? eventsData : prev.events,
      decoys: decoysData.length > 0 ? decoysData : prev.decoys,
      devices: devicesData.length > 0 ? devicesData : prev.devices,
      telemetryStatus: realtimeStream.getStatus(),
      lastTelemetryEvent: prev.lastTelemetryEvent,
      loading: false,
      error: null,
      lastSync: new Date().toISOString()
    }));
  }, []);

  // Subscribe to shared SSE stream for zero-refresh attack updates
  useEffect(() => {
    const unsubscribe = realtimeStream.subscribe((streamPayload) => {
      if (streamPayload.type === 'STATUS_CHANGE') {
        setData(prev => ({ ...prev, telemetryStatus: streamPayload.status }));
      } else if (streamPayload.type === 'HONEYPOT_ATTACK_SIMULATED') {
        const newEvt = streamPayload.event;
        const fusion = streamPayload.fusion_pipeline;

        setData(prev => {
          // Prepend new event avoiding duplicates
          const exists = prev.events.some(e => e.event_id === newEvt.event_id);
          const updatedEvents = exists ? prev.events : [newEvt, ...prev.events];

          // Update reporting threat index overview if available
          let updatedReporting = prev.reporting;
          if (fusion && prev.reporting) {
            updatedReporting = {
              ...prev.reporting,
              overview: {
                ...prev.reporting.overview,
                average_detection_score: fusion.threat_index ?? prev.reporting.overview.average_detection_score,
                total_security_events: prev.reporting.overview.total_security_events + 1
              }
            };
          }

          return {
            ...prev,
            events: updatedEvents,
            reporting: updatedReporting,
            lastTelemetryEvent: streamPayload,
            lastSync: new Date().toISOString()
          };
        });
      }
    });

    return unsubscribe;
  }, []);

  // Initial load and sequential non-overlapping polling (Section 5)
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const runLoop = async () => {
      await loadAllData();
      if (isMounted) {
        timerId = setTimeout(runLoop, refreshIntervalMs);
      }
    };

    runLoop();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [loadAllData, refreshIntervalMs]);

  return {
    ...data,
    refreshNow: loadAllData
  };
}
