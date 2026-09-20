import datetime
import math
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.models import Patient, HoneypotSecurityEvent, PatientFeature, Device

# Clearly document definitions and time windows
NIGHT_START_HOUR = 22  # 10:00 PM
NIGHT_END_HOUR = 6     # 06:00 AM
DEFAULT_OBSERVATION_WINDOW_HOURS = 720.0  # 30 days fallback

# The canonical 15-Dimensional Feature Definitions
FEATURE_15D_ORDER = [
    "failed_login_rate",
    "request_rate",
    "total_records_accessed",
    "unique_endpoints",
    "endpoint_discovery_count",
    "suspicious_download_count",
    "data_export_count",
    "privilege_escalation_count",
    "device_change_count",
    "night_activity_count",
    "error_rate",
    "anomalous_event_count",
    "unique_sessions",
    "unique_devices",
    "average_response_time_ms"
]

FEATURE_15D_METADATA: Dict[str, Dict[str, Any]] = {
    "failed_login_rate": {
        "dimension": 1,
        "name": "Failed Login Rate",
        "category": "Authentication",
        "formula": "failed_logins / max(normal_logins + failed_logins, 1)",
        "unit": "ratio [0.0 - 1.0]",
        "normal_range": "[0.00 - 0.08]",
        "attack_indicator": "Brute-force credential stuffing, password guessing"
    },
    "request_rate": {
        "dimension": 2,
        "name": "Request Rate",
        "category": "Traffic Dynamics",
        "formula": "api_requests / max(observed_duration_hours, 1.0)",
        "unit": "requests/hour",
        "normal_range": "[0.5 - 15.0]",
        "attack_indicator": "Automated scraping, denial of service, rapid API querying"
    },
    "total_records_accessed": {
        "dimension": 3,
        "name": "Total Records Accessed",
        "category": "Data Access",
        "formula": "sum(records_accessed per event)",
        "unit": "count",
        "normal_range": "[0 - 50]",
        "attack_indicator": "Bulk patient records harvesting, unauthorized PHI retrieval"
    },
    "unique_endpoints": {
        "dimension": 4,
        "name": "Unique Endpoints Visited",
        "category": "Traversal",
        "formula": "count(distinct endpoint URIs)",
        "unit": "count",
        "normal_range": "[1 - 8]",
        "attack_indicator": "API enumeration, lateral traversal across microservices"
    },
    "endpoint_discovery_count": {
        "dimension": 5,
        "name": "Endpoint Discovery Scans",
        "category": "Reconnaissance",
        "formula": "count(events where type == 'ENDPOINT_DISCOVERY')",
        "unit": "count",
        "normal_range": "[0 - 1]",
        "attack_indicator": "Fuzzing non-existent API routes, vulnerability probing"
    },
    "suspicious_download_count": {
        "dimension": 6,
        "name": "Suspicious Downloads",
        "category": "Data Movement",
        "formula": "count(events where type == 'SUSPICIOUS_DOWNLOAD')",
        "unit": "count",
        "normal_range": "[0 - 0]",
        "attack_indicator": "Bulk medical report/image extraction without clinical order"
    },
    "data_export_count": {
        "dimension": 7,
        "name": "Data Export Events",
        "category": "Exfiltration",
        "formula": "count(events where type == 'DATA_EXPORT')",
        "unit": "count",
        "normal_range": "[0 - 1]",
        "attack_indicator": "Bulk CSV/JSON exports, data exfiltration over encrypted tunnels"
    },
    "privilege_escalation_count": {
        "dimension": 8,
        "name": "Privilege Escalation Attempts",
        "category": "Authorization",
        "formula": "count(events where type == 'PRIVILEGE_ESCALATION_ATTEMPT')",
        "unit": "count",
        "normal_range": "[0 - 0]",
        "attack_indicator": "Unauthorized role switching, admin permission tampering"
    },
    "device_change_count": {
        "dimension": 9,
        "name": "Device Changes",
        "category": "Identity & Asset",
        "formula": "count(events where type == 'DEVICE_CHANGE')",
        "unit": "count",
        "normal_range": "[0 - 1]",
        "attack_indicator": "Session hijacking, multiple simultaneous device switches"
    },
    "night_activity_count": {
        "dimension": 10,
        "name": "Night Activity Count",
        "category": "Temporal",
        "formula": "count(events occurring between 22:00 and 06:00)",
        "unit": "count",
        "normal_range": "[0 - 5]",
        "attack_indicator": "Off-hours operations, covert attacker active periods"
    },
    "error_rate": {
        "dimension": 11,
        "name": "HTTP Error Rate",
        "category": "Reliability & Anomaly",
        "formula": "error_events / max(total_events, 1)",
        "unit": "ratio [0.0 - 1.0]",
        "normal_range": "[0.00 - 0.05]",
        "attack_indicator": "Exploitation attempts, broken auth headers (HTTP 401/403/404/500)"
    },
    "anomalous_event_count": {
        "dimension": 12,
        "name": "Baseline Anomaly Count",
        "category": "Statistical",
        "formula": "count(events flagged with is_anomalous_baseline == True)",
        "unit": "count",
        "normal_range": "[0 - 2]",
        "attack_indicator": "Statistically deviant telemetry events"
    },
    "unique_sessions": {
        "dimension": 13,
        "name": "Unique Sessions",
        "category": "Session Dynamics",
        "formula": "count(distinct session_id)",
        "unit": "count",
        "normal_range": "[1 - 4]",
        "attack_indicator": "Concurrent multi-session spraying, rapid session renegotiation"
    },
    "unique_devices": {
        "dimension": 14,
        "name": "Unique Device Fingerprints",
        "category": "Device Fingerprint",
        "formula": "count(distinct device_id)",
        "unit": "count",
        "normal_range": "[1 - 2]",
        "attack_indicator": "Token reuse across disparate IP/hardware fingerprints"
    },
    "average_response_time_ms": {
        "dimension": 15,
        "name": "Average Response Time",
        "category": "Performance",
        "formula": "mean(response_time_ms)",
        "unit": "milliseconds",
        "normal_range": "[35 - 120]",
        "attack_indicator": "Heavy backend queries caused by mass DB exfiltration"
    }
}

def extract_15d_vector(feat: PatientFeature) -> List[float]:
    """
    Extracts the ordered 15-dimensional numeric list from a PatientFeature DB record.
    """
    return [
        float(getattr(feat, col, 0.0) or 0.0)
        for col in FEATURE_15D_ORDER
    ]

def extract_15d_dict(feat: PatientFeature) -> Dict[str, Any]:
    """
    Extracts the 15-dimensional dictionary from a PatientFeature DB record.
    """
    return {
        col: getattr(feat, col, 0.0)
        for col in FEATURE_15D_ORDER
    }

def calculate_event_feature_vector(evt: HoneypotSecurityEvent, patient: Optional[Patient] = None, db: Optional[Session] = None) -> dict:
    """
    Calculates isolated behavioral feature vector for a specific Honeypot security event.
    Guarantees event isolation so telemetry from prior events (e.g. data exfiltration)
    does not contaminate subsequent unrelated attack events (e.g. reconnaissance).
    """
    etype = (evt.event_type or "").upper()
    
    failed_logins = evt.failed_login_attempts or 0
    records_accessed = evt.records_accessed or 0
    
    # API calls and request rate for this event
    api_calls = evt.request_count or 1
    requests_per_min = float(api_calls)
    
    # Error rate: 4xx / 5xx HTTP responses count as errors for the event
    error_rate = 1.0 if (evt.response_status and evt.response_status >= 400) else 0.0
    
    # Endpoint enumeration
    endpoint_enumeration = (etype == "ENDPOINT_DISCOVERY")
    unique_endpoints = 5 if endpoint_enumeration else 1
    
    # Data exports
    data_export_events = 1 if etype == "DATA_EXPORT" else 0
    
    # Privilege escalation
    privilege_escalation_attempts = 1 if etype == "PRIVILEGE_ESCALATION_ATTEMPT" else 0
    
    # Baseline patient features
    device_changes = patient.device_changes if patient else 0
    password_resets = patient.password_reset_count if patient else 0

    vector_dict = {
        "failed_logins": failed_logins,
        "requests_per_min": requests_per_min,
        "records_accessed": records_accessed,
        "unique_endpoints": unique_endpoints,
        "api_calls": api_calls,
        "error_rate": error_rate,
        "device_changes": device_changes,
        "password_resets": password_resets,
        "endpoint_enumeration": endpoint_enumeration,
        "data_export_events": data_export_events,
        "privilege_escalation_attempts": privilege_escalation_attempts
    }

    vector_array = [
        int(failed_logins),
        int(requests_per_min),
        int(records_accessed),
        int(unique_endpoints),
        int(api_calls),
        int(error_rate),
        int(device_changes),
        int(password_resets),
        1 if endpoint_enumeration else 0,
        int(data_export_events),
        int(privilege_escalation_attempts)
    ]

    return vector_dict, vector_array

def calculate_all_patient_features(db: Session):
    """
    Recalculates behavioral features for all patients from the existing security_events table.
    Updates or inserts records into the patient_features table.
    """
    patients = db.query(Patient).all()
    for patient in patients:
        calculate_single_patient_features(patient.patient_id, db)


def calculate_single_patient_features(pid: str, db: Session) -> PatientFeature:
    """
    Recalculates behavioral features for a single patient from the existing security_events table.
    Updates or inserts record into the patient_features table.
    """
    patient = db.query(Patient).filter(Patient.patient_id == pid.upper()).first()
    if not patient:
        device = db.query(Device).filter(Device.device_id == pid.upper()).first()
        if not device:
            raise ValueError(f"Patient or Device {pid} not found.")
        
    events = db.query(HoneypotSecurityEvent).filter(
        (HoneypotSecurityEvent.patient_id == pid.upper()) | (HoneypotSecurityEvent.device_id == pid.upper())
    ).all()
    total_evts = len(events)
    
    # 1. Counts of specific event types
    normal_login = 0
    failed_login = 0
    api_request = 0
    record_access = 0
    endpoint_discovery = 0
    suspicious_download = 0
    data_export = 0
    privilege_escalation = 0
    device_change = 0
    unusual_access_time = 0
    error_cnt = 0
    anomalous_evt_cnt = 0
    night_activity = 0
    
    # Totals and distinct lists
    records_accessed_sum = 0
    endpoints_set = set()
    sessions_set = set()
    devices_set = set()
    response_times = []
    
    timestamps = []
    
    for evt in events:
        etype = evt.event_type.upper() if evt.event_type else ""
        
        if etype == 'NORMAL_LOGIN':
            normal_login += 1
        elif etype in ['FAILED_LOGIN', 'BRUTE_FORCE_ATTEMPT']:
            failed_login += 1
        elif etype == 'API_REQUEST':
            api_request += 1
        elif etype in ['RECORD_ACCESS', 'SUSPICIOUS_DATA_ACCESS']:
            record_access += 1
        elif etype == 'ENDPOINT_DISCOVERY':
            endpoint_discovery += 1
        elif etype == 'SUSPICIOUS_DOWNLOAD':
            suspicious_download += 1
        elif etype == 'DATA_EXPORT':
            data_export += 1
        elif etype == 'PRIVILEGE_ESCALATION_ATTEMPT':
            privilege_escalation += 1
        elif etype == 'DEVICE_CHANGE':
            device_change += 1
        elif etype == 'UNUSUAL_ACCESS_TIME':
            unusual_access_time += 1
            
        # Records accessed
        if evt.records_accessed:
            records_accessed_sum += evt.records_accessed
            
        # Distinct counts
        if evt.endpoint:
            endpoints_set.add(evt.endpoint)
        if evt.session_id:
            sessions_set.add(evt.session_id)
        if evt.device_id:
            devices_set.add(evt.device_id)
            
        # Response times
        if evt.response_time_ms is not None:
            response_times.append(evt.response_time_ms)
            
        # Errors
        if evt.response_status and evt.response_status >= 400:
            error_cnt += 1
            
        # Anomalies
        if evt.is_anomalous_baseline:
            anomalous_evt_cnt += 1
            
        # Timestamps
        if evt.timestamp:
            timestamps.append(evt.timestamp)
            try:
                # Check night activity window (22:00 - 06:00 inclusive)
                dt = datetime.datetime.fromisoformat(evt.timestamp).replace(tzinfo=None)
                if dt.hour >= NIGHT_START_HOUR or dt.hour < NIGHT_END_HOUR:
                    night_activity += 1
            except ValueError:
                pass
                
    # Calculate Rates and Averages
    auth_attempts = normal_login + failed_login
    failed_login_rate = failed_login / max(auth_attempts, 1)
    error_rate = error_cnt / max(total_evts, 1)
    avg_resp_time = sum(response_times) / max(len(response_times), 1) if response_times else 0.0
    
    # Calculate observed duration in hours
    observed_duration_hours = 0.0
    if len(timestamps) >= 2:
        try:
            parsed_ts = [datetime.datetime.fromisoformat(ts).replace(tzinfo=None) for ts in timestamps]
            min_t = min(parsed_ts)
            max_t = max(parsed_ts)
            observed_duration_hours = (max_t - min_t).total_seconds() / 3600.0
        except ValueError:
            pass
            
    # If observed duration is invalid or 0, fallback to fixed observation window
    if observed_duration_hours <= 0:
        observed_duration_hours = DEFAULT_OBSERVATION_WINDOW_HOURS
        
    request_rate = api_request / observed_duration_hours
    
    # Save or update in database
    feat = db.query(PatientFeature).filter(PatientFeature.patient_id == pid.upper()).first()
    if not feat:
        feat = PatientFeature(patient_id=pid.upper())
        db.add(feat)
        
    feat.calculated_at = datetime.datetime.utcnow()
    feat.feature_version = "v1"
    
    feat.total_events = total_evts
    feat.normal_login_count = normal_login
    feat.failed_login_count = failed_login
    feat.failed_login_rate = failed_login_rate
    feat.api_request_count = api_request
    feat.request_rate = request_rate
    feat.record_access_count = record_access
    feat.total_records_accessed = records_accessed_sum
    feat.unique_endpoints = len(endpoints_set)
    feat.endpoint_discovery_count = endpoint_discovery
    feat.suspicious_download_count = suspicious_download
    feat.data_export_count = data_export
    feat.privilege_escalation_count = privilege_escalation
    feat.device_change_count = device_change
    feat.unusual_access_time_count = unusual_access_time
    feat.error_count = error_cnt
    feat.error_rate = error_rate
    feat.unique_sessions = len(sessions_set)
    feat.unique_devices = len(devices_set)
    feat.average_response_time_ms = avg_resp_time
    feat.night_activity_count = night_activity
    feat.anomalous_event_count = anomalous_evt_cnt
    
    db.commit()
    return feat


def validate_all_patient_features(db: Session):
    """
    Validates the generated features dataset.
    Returns validation diagnostics dictionary.
    """
    # 1. Total patients from patients table
    all_patients = db.query(Patient.patient_id).all()
    patient_ids = {p.patient_id for p in all_patients}
    patient_count = len(patient_ids)
    
    # Get device IDs as valid references
    all_devices = db.query(Device.device_id).all()
    device_ids = {d.device_id for d in all_devices}
    
    # 2. Total feature records
    feature_records = db.query(PatientFeature).all()
    feature_count = len([f for f in feature_records if f.patient_id in patient_ids])
    
    invalid_references = 0
    missing_feature_values = 0
    
    for feat in feature_records:
        # Check invalid reference
        if feat.patient_id not in patient_ids and feat.patient_id not in device_ids:
            invalid_references += 1
            
        # Check required fields are not null
        fields_to_check = [
            feat.total_events, feat.normal_login_count, feat.failed_login_count,
            feat.failed_login_rate, feat.api_request_count, feat.request_rate,
            feat.record_access_count, feat.total_records_accessed, feat.unique_endpoints,
            feat.endpoint_discovery_count, feat.suspicious_download_count, feat.data_export_count,
            feat.privilege_escalation_count, feat.device_change_count, feat.unusual_access_time_count,
            feat.error_count, feat.error_rate, feat.unique_sessions, feat.unique_devices,
            feat.average_response_time_ms, feat.night_activity_count, feat.anomalous_event_count
        ]
        
        for val in fields_to_check:
            if val is None:
                missing_feature_values += 1
            elif isinstance(val, (int, float)):
                # Ensure counts are non-negative
                if isinstance(val, int) and val < 0:
                    missing_feature_values += 1
                # Ensure rates and averages are finite
                if isinstance(val, float) and (math.isnan(val) or math.isinf(val) or val < 0):
                    missing_feature_values += 1

    valid = (
        patient_count == 30 and 
        feature_count == 30 and 
        invalid_references == 0 and 
        missing_feature_values == 0
    )
    
    status_text = "● FEATURE DATASET VALID" if valid else "● FEATURE DATASET INVALID"
    
    return {
        "valid": valid,
        "patients": patient_count,
        "feature_records": feature_count,
        "invalid_references": invalid_references,
        "missing_feature_values": missing_feature_values,
        "status_text": status_text
    }
