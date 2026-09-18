export type SeverityLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'INVESTIGATING' | 'RESOLVED' | 'EVIDENCE_GAP';

export interface Incident {
  id: string;
  title: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  start_time: string;
  end_time: string;
  fec_score: number;
  summary: string;
  open_gaps_count?: number;
  created_at?: string;
  open_gaps?: Array<{ domain: string; stage: string; weight: number }>;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  event_type: string;
  source_entity: string;
  destination_entity: string;
  user: string;
  application: string;
  attack_stage: string;
  evidence_domain: string;
  evidence_status: string;
  confidence: number;
  raw_reference: string;
}

export interface EvidenceRequirement {
  id: number;
  evidence_domain: string;
  attack_stage: string;
  weight: number;
  required: boolean;
  available: boolean;
  status: string;
}

export interface FECResult {
  overall_fec: number;
  stages: Record<string, number>;
  domain_status: Record<string, { required: boolean; available: boolean; weight: number; status: string }>;
  missing_gaps: Array<{ domain: string; impact: string; weight: number }>;
  formula: string;
  provenance_trace: Array<{ conclusion: string; supported_by: string[]; strength: string }>;
}

export interface AttackNodeData {
  id: string;
  label: string;
  node_type: string;
  ip: string;
  risk_state: 'normal' | 'suspicious' | 'compromised' | 'verified';
  evidence_count: number;
  missing_evidence: string;
}

export interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: AttackNodeData;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  animated?: boolean;
  style?: Record<string, any>;
  data?: { relationship_label: string; supporting_events: string[] };
}

export interface AttackGraphData {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  summary: {
    total_nodes: number;
    total_edges: number;
    compromised_nodes: string[];
    suspicious_nodes: string[];
  };
}

export interface ControlCatalogItem {
  id: string;
  name: string;
  category: string;
  nist_function: string;
  nist_control: string;
  addresses_gap: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  expected_benefit?: string;
}

export interface ReplayRunResult {
  replay_id: string;
  incident_id: string;
  control_id: string;
  control_name: string;
  before_fec: number;
  after_fec: number;
  improvement: number;
  status: string;
  timestamp: string;
  simulation_steps: Array<{ step: number; status: string; message: string }>;
  stage_comparison: Array<{ stage: string; before_score: number; after_score: number; diff: number }>;
  evidence_before: Record<string, any>;
  evidence_after: Record<string, any>;
}

export interface AIRecommendation {
  incident_id: string;
  fec_score: number;
  recommended_control: ControlCatalogItem;
  priority: string;
  reason: string;
  addresses_gap: string;
  expected_visibility_gains: string[];
  nist_mapping: {
    framework: string;
    function: string;
    category: string;
    control: string;
  };
  why_this_recommendation: string;
}

export interface ActivityLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  incident_id: string;
  details: string;
}

export interface ClinicalActivity {
  timestamp: string;
  activity: string;
  clinician: string;
  status: string;
}

export interface RecordAccessLog {
  timestamp: string;
  user: string;
  action: string;
  status: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  blood_group: string;
  dob: string;
  diagnosis: string;
  allergies: string[];
  medications: string[];
  doctor: string;
  department: string;
  admission_date: string;
  discharge_date?: string | null;
  status: string;
  room: string;
  recent_clinical_activity: ClinicalActivity[];
  access_history: RecordAccessLog[];
}

export interface MedicalDevice {
  id: string;
  name: string;
  type: string;
  status: 'SECURE' | 'WARNING' | 'HIGH_RISK' | 'ISOLATED' | 'CRITICAL';
  risk_score: number;
  last_comm: string;
  vlan: string;
  location: string;
  ip: string;
}

export interface SOCNotification {
  id: string;
  type: 'CRITICAL' | 'AUTOMATED_RESPONSE' | 'FORENSIC_EVENT' | 'INFO';
  timestamp: string;
  title: string;
  description: string;
  read?: boolean;
}

export interface AttackSimulationStep {
  phase: number;
  title: string;
  status: string;
  timestamp: string;
  details: string;
}

export interface DecoyAsset {
  id: string;
  name: string;
  asset_type: string;
  department: string;
  is_decoy: boolean;
  clinical_criticality: string;
  risk_score: number;
  status: 'ARMED' | 'TRIGGERED' | 'DEACTIVATED';
  ip_address: string;
  interaction_count: number;
  last_interaction?: string | null;
  decoy_metadata?: Record<string, any>;
}

export interface DeceptionTriggerResult {
  event_id: string;
  incident_id: string;
  timestamp: string;
  event_type: string;
  source_asset: string;
  target_decoy_id: string;
  target_decoy_name: string;
  severity: string;
  malicious_confidence: number;
  attack_stage: string;
  evidence_signatures: string[];
  threat_diverted: boolean;
  real_critical_assets_status: string;
  decoy_asset_status: string;
  alert_banner: {
    title: string;
    subtitle: string;
    confidence_badge: string;
    status: string;
  };
}

export interface JudgeWowData {
  incident_id: string;
  threat_dna: {
    incident_id: string;
    signature_flow: string;
    dna_hash: string;
    similarity_match: {
      target_incident: string;
      similarity_percent: number;
      pattern_summary: string;
    };
    breakdown: {
      credential_access: number;
      privilege_escalation: number;
      lateral_movement: number;
      database_access: number;
    };
  };
  attack_replay_steps: Array<{
    timestamp: string;
    title: string;
    status: string;
    risk_score: number;
    source: string;
    icon: string;
    details: string;
  }>;
  time_machine_states: Array<{
    timestamp: string;
    known_evidence: string[];
    risk_score: number;
    risk_change: string;
    most_influential_evidence: string;
    confidence: number;
  }>;
  invisible_attack_detection: {
    alert_title: string;
    expected_sequence: string[];
    observed_sequence: string[];
    missing_event: string;
    risk_contribution: number;
    explanation: string;
  };
  attack_path_prediction: {
    current_source: string;
    label: string;
    targets: Array<{ target: string; probability: number; risk_level: string }>;
  };
  clinical_service_impact: {
    title: string;
    disclaimer: string;
    chain: string[];
    services: Array<{ service: string; impact_level: string; badge_color: string }>;
  };
  security_xray: {
    asset_id: string;
    scan_title: string;
    dimensions: {
      network: number;
      process: number;
      identity: number;
      behavior: number;
      integrity: number;
    };
    hidden_anomaly: {
      title: string;
      chain: string;
    };
  };
  security_memory: {
    title: string;
    current_incident: string;
    similar_incidents: string[];
    behavioral_similarity: number;
    common_pattern: string;
    alert: string;
    summary: string;
  };
  security_courtroom: {
    title: string;
    prosecutor_ai: {
      name: string;
      arguments: string[];
      threat_confidence: number;
    };
    defender_ai: {
      name: string;
      arguments: string[];
      legitimate_confidence: number;
    };
    verdict: {
      assessment: string;
      recommendation: string;
      disclaimer: string;
    };
  };
  investigator_mode: {
    title: string;
    incident_id: string;
    available_evidence: string[];
    question: string;
    options: Array<{ id: string; text: string; is_correct: boolean; compatibility: number }>;
    investigation_result: {
      supporting_evidence_count: number;
      contradicting_evidence_count: number;
      unknown_count: number;
    };
  };
  counterfactual: {
    title: string;
    current_path: string[];
    options: Array<{
      id: string;
      title: string;
      potential_reachable_assets: number;
      exposure_reduced: number;
      blast_radius: string;
      recommended?: boolean;
    }>;
    containment_blast_radius: {
      systems_affected: number;
      clinical_service_risk: string;
      action_button: string;
    };
  };
}

// ==========================================
// LIVE MEDICAL DEVICES & 3D DIGITAL TWIN
// ==========================================

export type DeviceStatus = 'SECURE' | 'MONITORING' | 'SUSPICIOUS' | 'HIGH RISK' | 'CRITICAL' | 'ISOLATED';

export interface DeviceDetail {
  device_id: string;
  device_name: string;
  device_type: string;
  ip_address: string;
  vlan: string;
  status: DeviceStatus | string;
  risk_score: number;
  last_seen: string;
  isolation_reason?: string | null;
  isolation_time?: string | null;
  previous_risk?: number | null;
  attack_active: boolean;
  attack_type?: string | null;
  attack_intensity?: string | null;
}

export interface DeviceTelemetryEvent {
  event_id?: string;
  patient_id?: string;
  device_id?: string;
  source?: string;
  timestamp: string;
  event_type: string;
  endpoint: string;
  records_accessed: number;
  failed_login_attempts: number;
  response_status: number;
  response_time_ms: number;
  severity?: string;
  is_anomalous: boolean;
}

export interface Device15DFeatures {
  failed_login_rate: number;
  request_rate: number;
  total_records_accessed: number;
  unique_endpoints: number;
  endpoint_discovery_count: number;
  suspicious_download_count: number;
  data_export_count: number;
  privilege_escalation_count: number;
  device_change_count: number;
  night_activity_count: number;
  error_rate: number;
  anomalous_event_count: number;
  unique_sessions: number;
  unique_devices: number;
  average_response_time_ms: number;
  calculated_at?: string;
}

export interface MLFusionResult {
  patient_id?: string;
  device_id?: string;
  diagnosis?: string;
  fec_score: number;
  ocsvm_anomaly_score: number;
  ocsvm_is_anomalous: boolean;
  isolation_forest_anomaly_score: number;
  isolation_forest_is_anomalous: boolean;
  xgboost_predicted_class: string;
  xgboost_class_probabilities: Record<string, number>;
  xgboost_suspiciousness_score: number;
  detection_score: number;
  detection_status: string;
  model_agreement: {
    anomaly_detectors: string;
    count: number;
  };
  evidence_strength: string;
  detection_reasons: string[];
  calculated_at: string;
}

export interface DeviceDetailResponse {
  device_info: DeviceDetail;
  ml_fuses: MLFusionResult;
  features: Device15DFeatures;
  timeline: DeviceTelemetryEvent[];
  history?: any[];
}

export interface AttackStartPayload {
  attack_type: string;
  intensity: 'LOW' | 'MEDIUM' | 'HIGH' | string;
}

export interface QuarantinePayload {
  reason: string;
}

export interface DeviceGridItem extends DeviceDetail {
  fec_score: number;
  ocsvm_anomaly_score: number;
  ocsvm_is_anomalous?: boolean;
  isolation_forest_anomaly_score: number;
  isolation_forest_is_anomalous?: boolean;
  xgboost_predicted_class?: string;
  xgboost_suspiciousness_score: number;
  model_agreement: string;
  threat: string;
  evidence_strength?: string;
  detection_reasons?: string[];
  last_event?: DeviceTelemetryEvent;
  features_15d?: Device15DFeatures;
}

export interface DigitalTwinZone {
  zone_id: string;
  name: string;
  department: string;
  floor: string;
  device_count: number;
  decoy_count: number;
  threat_count: number;
  isolated_count: number;
  average_risk: number;
  peak_risk: number;
  attack_active: boolean;
  device_ids: string[];
  decoy_ids: string[];
}

export interface DigitalTwinRisk {
  mean_risk: number;
  peak_risk: number;
  icu_risk: number;
  critical_devices: number;
  high_risk_devices: number;
  isolated_devices: number;
  total_monitored: number;
  total_decoys: number;
}

export interface DigitalTwinForensics {
  average_fec_score: number;
  visibility_gap: boolean;
  evidence_coverage: string;
}

export interface DigitalTwinResponse {
  timestamp: string;
  platform: string;
  version: string;
  zones: DigitalTwinZone[];
  devices: DeviceGridItem[];
  honeypots: DecoyAsset[];
  active_attacks: Array<{
    id: number;
    device_id: string;
    attack_type: string;
    intensity: string;
    start_time: string;
  }>;
  recent_events: DeviceTelemetryEvent[];
  recent_deceptions: Array<{
    id: string;
    incident_id: string;
    timestamp: string;
    source_asset: string;
    target_decoy_id: string;
    event_type: string;
    severity: string;
    confidence: number;
    details: string;
  }>;
  risk: DigitalTwinRisk;
  forensics: DigitalTwinForensics;
}

// --- Intelligence Layer Foundation Types ---
export interface IntelligenceIncidentContext {
  event_id: string;
  device_id: string;
  device_type: string;
  hospital_zone: string;
  scenario: string;
  event_type: string;
  severity: string;
  timestamp: string;
}

export interface IntelligenceThreatContext {
  fusion_result: string;
  threat_index: number;
  model_agreement: string;
  evidence_strength: string;
  fec_score: number;
}

export interface PatientImpactContext {
  impact_score: number;
  impact_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | string;
  device_criticality: string;
  service_criticality: string;
  patient_dependency: string;
  operational_disruption: string;
  rationale: string[];
  confidence: string;
}

export interface AttackPathNode {
  step: number;
  type: 'SOURCE' | 'NETWORK' | 'REACHABLE_ASSET' | 'TARGET_SERVICE';
  id: string;
  label: string;
  detail?: string;
  status?: string;
}

export interface AttackPathContext {
  status: 'AVAILABLE' | 'RESTRICTED' | 'UNAVAILABLE';
  reason?: string;
  source?: {
    id: string;
    name: string;
    zone: string;
    vlan: string;
    ip: string;
  };
  path_nodes: AttackPathNode[];
  explanation?: string;
  is_quarantined?: boolean;
}

export interface ExposedAssetItem {
  device_id: string;
  device_name: string;
  device_type: string;
  zone: string;
  hospital_zone?: string;
  vlan: string;
  asset_category: string;
  reachability: 'POTENTIAL';
}

export interface BlastRadiusContext {
  status: 'AVAILABLE' | 'RESTRICTED' | 'UNAVAILABLE';
  source?: {
    device_id: string;
    device_name: string;
    device_type?: string;
    hospital_zone?: string;
    zone?: string;
    vlan?: string;
  };
  potentially_exposed_assets: ExposedAssetItem[];
  potentially_exposed_count: number;
  clinical_assets_count: number;
  critical_assets_count: number;
  affected_zones: string[];
  services_at_exposure: string[];
  restricted: boolean;
  reason?: string | null;
}

export interface IntelligencePriorityContext {
  status: 'AVAILABLE' | 'UNAVAILABLE' | string;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | string;
  label: 'IMMEDIATE ATTENTION' | 'HIGH ATTENTION' | 'MONITOR' | 'INFORMATIONAL' | string;
  reason: string;
  drivers: string[];
  context: {
    threat_severity: string;
    threat_index: number;
    evidence_strength: string;
    patient_impact_level: string;
    attack_path_status: string;
    critical_assets_count: number;
    clinical_assets_count: number;
    blast_radius_count: number;
    restricted: boolean;
  };
}

export interface IntelligenceContext {
  incident_context: IntelligenceIncidentContext;
  threat_context: IntelligenceThreatContext;
  patient_impact?: PatientImpactContext;
  attack_path?: AttackPathContext;
  blast_radius?: BlastRadiusContext;
  priority?: IntelligencePriorityContext;
  status: 'READY' | string;
}

