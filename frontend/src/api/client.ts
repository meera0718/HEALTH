import type {
  Incident, SecurityEvent, FECResult, AttackGraphData,
  ControlCatalogItem, ReplayRunResult, AIRecommendation, ActivityLog,
  DecoyAsset, DeceptionTriggerResult, JudgeWowData,
  DeviceGridItem, DeviceDetailResponse, AttackStartPayload, QuarantinePayload, DigitalTwinResponse
} from '../types';

const API_BASE = '/api/v1';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errObj = await res.json();
      if (errObj && errObj.detail) {
        errorDetail = errObj.detail;
      }
    } catch (_) {}
    throw new Error(errorDetail || `API call failed: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // --- Live Medical Devices API ---
  getDevices: (): Promise<DeviceGridItem[]> => 
    fetchJson<DeviceGridItem[]>(`${API_BASE}/devices`),

  getDeviceDetail: (deviceId: string): Promise<DeviceDetailResponse> => 
    fetchJson<DeviceDetailResponse>(`${API_BASE}/devices/${deviceId}`),

  startAttack: (deviceId: string, attackType: string, intensity: string = 'MEDIUM'): Promise<{ status: string; message: string }> =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/devices/${deviceId}/attack/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attack_type: attackType, intensity } as AttackStartPayload)
    }),

  stopAttack: (deviceId: string): Promise<{ status: string; message: string }> =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/devices/${deviceId}/attack/stop`, {
      method: 'POST'
    }),

  quarantineDevice: (deviceId: string, reason: string): Promise<{ status: string; message: string }> =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/devices/${deviceId}/quarantine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason } as QuarantinePayload)
    }),

  restoreDevice: (deviceId: string): Promise<{ status: string; message: string }> =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/devices/${deviceId}/restore`, {
      method: 'POST'
    }),

  // --- Digital Twin State API ---
  getDigitalTwinState: (): Promise<DigitalTwinResponse> =>
    fetchJson<DigitalTwinResponse>(`${API_BASE}/digital-twin`),

  getIncidents: (): Promise<Incident[]> => fetchJson<Incident[]>(`${API_BASE}/incidents`),
  getIncident: (id: string): Promise<Incident> => fetchJson<Incident>(`${API_BASE}/incidents/${id}`),
  getTimeline: (id: string): Promise<SecurityEvent[]> => fetchJson<SecurityEvent[]>(`${API_BASE}/incidents/${id}/timeline`),
  getAttackGraph: (id: string): Promise<AttackGraphData> => fetchJson<AttackGraphData>(`${API_BASE}/incidents/${id}/graph`),
  getEvidence: (id: string) => fetchJson<any[]>(`${API_BASE}/incidents/${id}/evidence`),
  getFEC: (id: string): Promise<FECResult> => fetchJson<FECResult>(`${API_BASE}/incidents/${id}/fec`),
  getControls: (): Promise<ControlCatalogItem[]> => fetchJson<ControlCatalogItem[]>(`${API_BASE}/controls`),
  getAIAnalysis: (id: string): Promise<AIRecommendation> => 
    fetchJson<AIRecommendation>(`${API_BASE}/incidents/${id}/ai-analysis`, { method: 'POST' }),
  triggerReplay: (id: string, controlId: string): Promise<ReplayRunResult> => 
    fetchJson<ReplayRunResult>(`${API_BASE}/incidents/${id}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ control_id: controlId })
    }),
  getActivityLog: (): Promise<ActivityLog[]> => fetchJson<ActivityLog[]>(`${API_BASE}/activity-log`).catch(() => []),

  // Deception API
  getDecoys: (viewMode: string = 'defender'): Promise<DecoyAsset[]> =>
    fetchJson<DecoyAsset[]>(`${API_BASE}/deception/decoys?view_mode=${viewMode}`),
  triggerDecoy: (decoyId: string, sourceAsset: string = 'Staff-PC-07', incidentId: string = 'HSX-042'): Promise<DeceptionTriggerResult> =>
    fetchJson<DeceptionTriggerResult>(`${API_BASE}/deception/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decoy_id: decoyId, source_asset: sourceAsset, incident_id: incidentId })
    }),

  // Judge-Wow API
  getJudgeWowData: (incidentId: string = 'HSX-042'): Promise<JudgeWowData> =>
    fetchJson<JudgeWowData>(`${API_BASE}/incidents/${incidentId}/judge-wow`),
  submitInvestigatorHypothesis: (incidentId: string, hypothesisId: string, userNotes: string = ''): Promise<any> =>
    fetchJson<any>(`${API_BASE}/incidents/${incidentId}/investigator-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesis_id: hypothesisId, user_notes: userNotes })
    }),
  simulateContainment: (incidentId: string, actionType: string, targetAsset: string): Promise<any> =>
    fetchJson<any>(`${API_BASE}/incidents/${incidentId}/simulate-containment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: actionType, target_asset: targetAsset })
    })
};

