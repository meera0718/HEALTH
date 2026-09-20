import math
import json
import numpy as np
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.db.models import HoneypotSecurityEvent, EventMLResult, Patient
from app.security_engine.event_ml_pipeline import calculate_event_feature_vector, is_night_timestamp

VECTOR_FEATURE_COLUMNS = [
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

def extract_raw_behavioral_features(evt: HoneypotSecurityEvent, patient: Optional[Patient] = None) -> Dict[str, float]:
    """
    Extracts isolated 15-dimensional raw behavioral security features for an event.
    Identifiers (event_id, patient_id, timestamp, UUID) are strictly EXCLUDED.
    """
    vector_dict, _ = calculate_event_feature_vector(evt, patient)
    
    raw_feats = {
        "failed_login_rate": float(vector_dict.get("failed_logins", 0)),
        "request_rate": float(vector_dict.get("requests_per_min", 1)),
        "total_records_accessed": float(vector_dict.get("records_accessed", 0)),
        "unique_endpoints": float(vector_dict.get("unique_endpoints", 1)),
        "endpoint_discovery_count": 1.0 if vector_dict.get("endpoint_enumeration", 0) else 0.0,
        "suspicious_download_count": 1.0 if (evt.event_type or "").upper() == "SUSPICIOUS_DOWNLOAD" else 0.0,
        "data_export_count": float(vector_dict.get("data_export_events", 0)),
        "privilege_escalation_count": float(vector_dict.get("privilege_escalation_attempts", 0)),
        "device_change_count": float(vector_dict.get("device_changes", 0)),
        "night_activity_count": 1.0 if is_night_timestamp(evt.timestamp) else 0.0,
        "error_rate": float(vector_dict.get("error_rate", 0.0)),
        "anomalous_event_count": 1.0 if getattr(evt, "is_anomalous_baseline", False) else 0.0,
        "unique_sessions": 1.0,
        "unique_devices": 1.0,
        "average_response_time_ms": float(evt.response_time_ms or 120)
    }
    
    # Sanitize inputs against NaN / Inf / Negative bounds
    sanitized = {}
    for col in VECTOR_FEATURE_COLUMNS:
        val = raw_feats.get(col, 0.0)
        if math.isnan(val) or math.isinf(val):
            val = 0.0
        sanitized[col] = max(0.0, float(val))
        
    return sanitized

def compute_behavioral_embedding(features_dict: Dict[str, float]) -> List[float]:
    """
    Generates a 15-dimensional L2-normalized unit behavioral vector embedding.
    Formula: embedding_i = x_i / ||x||_2
    """
    vec = [float(features_dict.get(col, 0.0)) for col in VECTOR_FEATURE_COLUMNS]
    arr = np.array(vec, dtype=np.float64)
    
    # Clean NaN / Inf
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    
    norm = np.linalg.norm(arr)
    if norm > 1e-9:
        unit_vec = arr / norm
    else:
        unit_vec = arr
        
    return [round(float(x), 6) for x in unit_vec]

def calculate_cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculates exact Cosine Similarity between two N-dimensional vectors.
    Formula: cosine_sim(a, b) = (a . b) / (||a|| * ||b||)
    Returns similarity score clamped to range [0.0, 1.0].
    """
    a = np.array(vec1, dtype=np.float64)
    b = np.array(vec2, dtype=np.float64)
    
    a = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)
    b = np.nan_to_num(b, nan=0.0, posinf=0.0, neginf=0.0)
    
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
        
    sim = dot / (norm_a * norm_b)
    return float(round(max(0.0, min(1.0, sim)), 4))

def find_nearest_behavioral_attacks(
    db: Session,
    target_event_id: str,
    limit: int = 5,
    patient_scope: Optional[str] = None
) -> Dict[str, Any]:
    """
    Performs vector similarity search against historical security events using behavioral embeddings.
    Returns nearest attack neighbors with similarity scores, scenario labels, and rank.
    """
    target_evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == target_event_id.strip()
    ).first()
    
    if not target_evt:
        raise ValueError(f"Target security event '{target_event_id}' not found.")
        
    patient = db.query(Patient).filter(Patient.patient_id == target_evt.patient_id.upper()).first()
    target_feats = extract_raw_behavioral_features(target_evt, patient)
    target_embedding = compute_behavioral_embedding(target_feats)
    
    # Query historical EventMLResult records (bounded to recent 100 for fast similarity search)
    query = db.query(EventMLResult)
    if patient_scope:
        query = query.filter(EventMLResult.patient_id == patient_scope.upper())
        
    all_ml_records = query.order_by(EventMLResult.created_at.desc()).limit(100).all()

    # Pre-fetch HoneypotSecurityEvent and Patient maps in bulk to eliminate N+1 queries
    event_ids = [rec.event_id for rec in all_ml_records]
    events_map = {e.event_id: e for e in db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id.in_(event_ids)).all()} if event_ids else {}
    
    patient_ids = list(set(e.patient_id.upper() for e in events_map.values() if e.patient_id))
    patients_map = {p.patient_id: p for p in db.query(Patient).filter(Patient.patient_id.in_(patient_ids)).all()} if patient_ids else {}
    
    candidates = []
    for rec in all_ml_records:
        if rec.event_id == target_event_id.strip():
            continue # Exclude target event itself from self-matching
            
        evt_rec = events_map.get(rec.event_id)
        if not evt_rec:
            continue
            
        p_rec = patients_map.get(evt_rec.patient_id.upper()) if evt_rec.patient_id else None
        rec_feats = extract_raw_behavioral_features(evt_rec, p_rec)
        rec_embedding = compute_behavioral_embedding(rec_feats)
        
        sim_score = calculate_cosine_similarity(target_embedding, rec_embedding)
        
        candidates.append({
            "event_id": rec.event_id,
            "patient_id": rec.patient_id,
            "scenario": rec.scenario or "Unknown",
            "event_type": rec.event_type or "UNKNOWN",
            "severity": rec.severity or "LOW",
            "timestamp": rec.timestamp or "",
            "similarity_score": sim_score,
            "similarity_percent": round(sim_score * 100.0, 1),
            "xgboost_classification": rec.xgboost_classification
        })
        
    # Sort descending by similarity score
    candidates.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    # Assign ranks
    top_matches = candidates[:limit]
    for idx, match in enumerate(top_matches, start=1):
        match["rank"] = idx
        
    return {
        "query_event_id": target_event_id.strip(),
        "query_patient_id": target_evt.patient_id,
        "query_scenario": getattr(target_evt, "scenario", "Unknown"),
        "embedding_dimension": len(target_embedding),
        "embedding_vector": target_embedding,
        "nearest_attacks": top_matches,
        "total_historical_searched": len(candidates)
    }
