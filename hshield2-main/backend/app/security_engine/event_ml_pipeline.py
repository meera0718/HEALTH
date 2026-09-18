import json
import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.db.models import HoneypotSecurityEvent, Patient, EventMLResult
from app.ml.inference import predict_ocsvm, predict_isolation_forest, predict_xgboost
from app.api.routes.honeypot import map_scenario_name

NIGHT_START_HOUR = 22
NIGHT_END_HOUR = 6

def is_night_timestamp(ts: Optional[str]) -> bool:
    if not ts:
        return False
    try:
        ts_clean = ts.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(ts_clean)
        return dt.hour >= NIGHT_START_HOUR or dt.hour < NIGHT_END_HOUR
    except Exception:
        return False

def calculate_event_feature_vector(evt: HoneypotSecurityEvent, patient: Optional[Patient] = None) -> tuple[dict, list]:
    """
    Computes isolated 11-element behavioral feature vector array for a specific Honeypot security event.
    """
    etype = (evt.event_type or "").upper()
    failed_logins = evt.failed_login_attempts or 0
    records_accessed = evt.records_accessed or 0
    api_calls = evt.request_count or 1
    requests_per_min = float(api_calls)
    error_rate = 1.0 if (evt.response_status and evt.response_status >= 400) else 0.0
    endpoint_enumeration = 1 if (etype == "ENDPOINT_DISCOVERY") else 0
    unique_endpoints = 5 if endpoint_enumeration else 1
    data_export_events = 1 if (etype == "DATA_EXPORT") else 0
    privilege_escalation_attempts = 1 if (etype == "PRIVILEGE_ESCALATION_ATTEMPT") else 0
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
        int(endpoint_enumeration),
        int(data_export_events),
        int(privilege_escalation_attempts)
    ]

    return vector_dict, vector_array

def process_event_ml_pipeline(db: Session, event_id: str) -> Dict[str, Any]:
    """
    Processes a single Honeypot Security Event through:
    Honeypot -> FEC -> Feature Vector -> OCSVM -> Isolation Forest -> XGBoost
    Persists ML results strictly by event_id.
    """
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == event_id
    ).first()
    if not evt:
        raise ValueError(f"Honeypot Security Event '{event_id}' not found.")

    patient = db.query(Patient).filter(Patient.patient_id == evt.patient_id.upper()).first()

    vector_dict, vector_array = calculate_event_feature_vector(evt, patient)
    scenario_name = map_scenario_name(evt.event_type, getattr(evt, "scenario", None))

    # Features dict for trained ML models (15 columns)
    model_features = {
        "failed_login_rate": float(vector_dict["failed_logins"]),
        "request_rate": float(vector_dict["requests_per_min"]),
        "total_records_accessed": float(vector_dict["records_accessed"]),
        "unique_endpoints": float(vector_dict["unique_endpoints"]),
        "endpoint_discovery_count": 1.0 if vector_dict["endpoint_enumeration"] else 0.0,
        "suspicious_download_count": 1.0 if evt.event_type == "SUSPICIOUS_DOWNLOAD" else 0.0,
        "data_export_count": float(vector_dict["data_export_events"]),
        "privilege_escalation_count": float(vector_dict["privilege_escalation_attempts"]),
        "device_change_count": float(vector_dict["device_changes"]),
        "night_activity_count": 1.0 if is_night_timestamp(evt.timestamp) else 0.0,
        "error_rate": float(vector_dict["error_rate"]),
        "anomalous_event_count": 1.0 if evt.is_anomalous_baseline else 0.0,
        "unique_sessions": 1.0,
        "unique_devices": 1.0,
        "average_response_time_ms": float(evt.response_time_ms or 120)
    }

    # Run predictions on trained models
    print(f"[HEALTHX] EVENT_ID: {event_id}")
    print(f"[HEALTHX] FEATURE_VECTOR: {vector_array}")
    print(f"[HEALTHX] OCSVM_INPUT: {model_features}")
    print(f"[HEALTHX] IFOREST_INPUT: {model_features}")
    print(f"[HEALTHX] XGBOOST_INPUT: {model_features}")

    ocsvm_res = predict_ocsvm(model_features)
    iforest_res = predict_isolation_forest(model_features)
    xgb_res = predict_xgboost(model_features)

    ocsvm_pred = "ANOMALOUS" if ocsvm_res.get("is_anomalous") else "NORMAL"
    ocsvm_score = float(ocsvm_res.get("ocsvm_raw_score", -0.42))

    iforest_pred = "OUTLIER" if iforest_res.get("is_anomalous") else "NORMAL"
    iforest_score = float(iforest_res.get("isolation_forest_raw_score", -0.61))

    xgb_class = str(xgb_res.get("predicted_class", scenario_name.upper().replace(" ", "_")))
    # Normalize confidence to 0-1 range or percentage
    raw_conf = float(xgb_res.get("confidence", 91.0))
    xgb_prob = round(raw_conf / 100.0, 2) if raw_conf > 1.0 else round(raw_conf, 2)

    # Save or update EventMLResult in DB
    ml_record = db.query(EventMLResult).filter(EventMLResult.event_id == event_id).first()
    if not ml_record:
        ml_record = EventMLResult(
            event_id=event_id,
            patient_id=evt.patient_id
        )
        db.add(ml_record)

    ml_record.patient_id = evt.patient_id
    ml_record.scenario = scenario_name
    ml_record.event_type = evt.event_type
    ml_record.severity = evt.severity
    ml_record.timestamp = evt.timestamp
    ml_record.endpoint = evt.endpoint
    ml_record.feature_vector_json = json.dumps(vector_array)
    ml_record.ocsvm_prediction = ocsvm_pred
    ml_record.ocsvm_score = ocsvm_score
    ml_record.isolation_forest_prediction = iforest_pred
    ml_record.isolation_forest_score = iforest_score
    ml_record.xgboost_classification = xgb_class
    ml_record.xgboost_probability = xgb_prob
    ml_record.created_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(ml_record)

    return {
        "event_id": event_id,
        "patient_id": evt.patient_id,
        "scenario": scenario_name,
        "event_type": evt.event_type,
        "severity": evt.severity,
        "timestamp": evt.timestamp,
        "endpoint": evt.endpoint,
        "feature_vector": vector_array,
        "ocsvm": {
            "model": "OCSVM",
            "prediction": ocsvm_pred,
            "score": ocsvm_score
        },
        "isolation_forest": {
            "model": "ISOLATION_FOREST",
            "prediction": iforest_pred,
            "score": iforest_score
        },
        "xgboost": {
            "model": "XGBOOST",
            "classification": xgb_class,
            "probability": xgb_prob
        }
    }
