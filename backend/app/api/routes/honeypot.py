import os
import sys
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from app.api.deps import get_db
from app.db.models import HoneypotSecurityEvent, Patient
from app.security_engine.feature_engine import calculate_single_patient_features
from app.security_engine.fec_engine import calculate_single_patient_fec

router = APIRouter()

def map_scenario_name(event_type: str, scenario_hint: Optional[str] = None) -> str:
    if scenario_hint:
        return scenario_hint.upper()
    if not event_type:
        return "BRUTE_FORCE"
    etype = event_type.upper()
    if "BRUTE" in etype:
        return "BRUTE_FORCE"
    elif "RECON" in etype or "SCAN" in etype:
        return "RECONNAISSANCE"
    elif "ENDPOINT" in etype:
        return "ENDPOINT_DISCOVERY"
    elif "EXPORT" in etype or "EXFIL" in etype:
        return "DATA_EXFILTRATION"
    elif "ESCALAT" in etype:
        return "PRIVILEGE_ESCALATION"
    elif "DOWNLOAD" in etype:
        return "SUSPICIOUS_DOWNLOAD"
    elif "ACCESS" in etype:
        return "SUSPICIOUS_DATA_ACCESS"
    return "BRUTE_FORCE"

def get_generator_function():
    try:
        from generate_honeypot_events import generate_honeypot_events
        return generate_honeypot_events
    except ModuleNotFoundError:
        root1 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
        root2 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        root3 = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        for r in [root1, root2, root3]:
            if r not in sys.path:
                sys.path.insert(0, r)
        from generate_honeypot_events import generate_honeypot_events
        return generate_honeypot_events

def format_event_dict(e: HoneypotSecurityEvent) -> dict:
    return {
        "event_id": e.event_id,
        "patient_id": e.patient_id,
        "timestamp": e.timestamp,
        "event_type": e.event_type,
        "scenario": map_scenario_name(e.event_type),
        "severity": e.severity,
        "source": e.source,
        "endpoint": e.endpoint,
        "session_id": e.session_id,
        "device_id": e.device_id,
        "request_count": e.request_count,
        "records_accessed": e.records_accessed,
        "failed_login_attempts": e.failed_login_attempts,
        "response_status": e.response_status,
        "response_time_ms": e.response_time_ms,
        "synthetic": getattr(e, "synthetic", False)
    }

@router.get("/honeypot/events")
def get_honeypot_events(
    patient_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(HoneypotSecurityEvent)

    if patient_id:
        query = query.filter(HoneypotSecurityEvent.patient_id == patient_id.upper())
    if event_type:
        query = query.filter(HoneypotSecurityEvent.event_type == event_type.upper())
    if severity:
        query = query.filter(HoneypotSecurityEvent.severity == severity.upper())
    if search:
        s = f"%{search}%"
        query = query.filter(
            (HoneypotSecurityEvent.event_id.like(s)) |
            (HoneypotSecurityEvent.patient_id.like(s)) |
            (HoneypotSecurityEvent.endpoint.like(s)) |
            (HoneypotSecurityEvent.source.like(s))
        )

    events = query.order_by(HoneypotSecurityEvent.timestamp.desc()).limit(limit).all()
    return {
        "count": len(events),
        "events": [format_event_dict(e) for e in events]
    }

@router.get("/honeypot/events/patient/{patient_id}")
def get_patient_honeypot_events(
    patient_id: str,
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id.upper()
    )
    if category:
        if category.upper() == "BASELINE":
            query = query.filter(HoneypotSecurityEvent.is_anomalous_baseline == False)
        elif category.upper() in ["ATTACK", "ANOMALOUS"]:
            query = query.filter(HoneypotSecurityEvent.is_anomalous_baseline == True)

    events = query.order_by(HoneypotSecurityEvent.timestamp.desc()).limit(limit).all()
    return {
        "patient_id": patient_id.upper(),
        "count": len(events),
        "events": [format_event_dict(e) for e in events]
    }

@router.get("/honeypot/stats")
def get_honeypot_stats(db: Session = Depends(get_db)):
    total_events = db.query(HoneypotSecurityEvent).count()
    patients_monitored = db.query(Patient).count()
    high_critical_events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.severity.in_(["HIGH", "CRITICAL"])
    ).count()
    anomalous_baseline_events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.is_anomalous_baseline == True
    ).count()

    return {
        "total_events": total_events,
        "patients_monitored": patients_monitored,
        "high_critical_events": high_critical_events,
        "anomalous_baseline_events": anomalous_baseline_events
    }

@router.get("/honeypot/validate")
def validate_honeypot_dataset(db: Session = Depends(get_db)):
    gen_fn = get_generator_function()
    is_valid, report = gen_fn(reset_existing=False)
    return {
        "is_valid": is_valid,
        "report": report
    }

@router.get("/honeypot/event/{event_id}")
def get_honeypot_event_detail(event_id: str, db: Session = Depends(get_db)):
    e = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id.ilike(event_id.strip())
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail=f"Honeypot event '{event_id}' not found.")
    return format_event_dict(e)

@router.post("/honeypot/generate")
def trigger_honeypot_event_generation(db: Session = Depends(get_db)):
    gen_fn = get_generator_function()
    is_valid, report = gen_fn(reset_existing=True)
    return {
        "status": "SUCCESS" if is_valid else "FAILED",
        "validation_report": report
    }

from pydantic import BaseModel
import uuid
import datetime

class SimulationRequest(BaseModel):
    patient_id: str
    scenario: str
    failed_login_attempts: Optional[int] = None
    records_accessed: Optional[int] = None
    request_count: Optional[int] = None

@router.post("/honeypot/simulate")
def simulate_honeypot_event(req: SimulationRequest, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.patient_id == req.patient_id.upper()).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {req.patient_id} not found.")
        
    event_id = f"EVT-SIM-{uuid.uuid4().hex[:8].upper()}"
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    
    if req.scenario == "BRUTE_FORCE":
        event_type = "BRUTE_FORCE_ATTEMPT"
        endpoint = "/api/v1/auth/login"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 5
        records_accessed = req.records_accessed if req.records_accessed is not None else 0
        response_status = 401
    elif req.scenario == "RECONNAISSANCE":
        event_type = "ENDPOINT_DISCOVERY"
        endpoint = "/api/v1/admin/scan"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 0
        response_status = 404
    elif req.scenario == "DATA_EXFILTRATION":
        event_type = "DATA_EXPORT"
        endpoint = "/api/v1/export/patient_db"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 1000
        response_status = 200
    elif req.scenario == "SUSPICIOUS_LOGIN":
        event_type = "SUSPICIOUS_LOGIN"
        endpoint = "/api/v1/auth/login"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 1
        records_accessed = req.records_accessed if req.records_accessed is not None else 0
        response_status = 200
    elif req.scenario == "PRIVILEGE_ESCALATION":
        event_type = "PRIVILEGE_ESCALATION_ATTEMPT"
        endpoint = "/api/v1/admin/escalate"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 0
        response_status = 403
    elif req.scenario == "ENDPOINT_DISCOVERY":
        event_type = "ENDPOINT_DISCOVERY"
        endpoint = "/api/v1/admin/endpoints"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 0
        response_status = 404
    elif req.scenario == "SUSPICIOUS_DOWNLOAD":
        event_type = "SUSPICIOUS_DOWNLOAD"
        endpoint = "/api/v1/files/download"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 500
        response_status = 200
    else:  # SUSPICIOUS_DATA_ACCESS
        event_type = "SUSPICIOUS_DATA_ACCESS"
        endpoint = "/api/v1/patients/records"
        failed_login_attempts = req.failed_login_attempts if req.failed_login_attempts is not None else 0
        records_accessed = req.records_accessed if req.records_accessed is not None else 250
        response_status = 200
        
    req_cnt = req.request_count if req.request_count is not None else 1

    sim_event = HoneypotSecurityEvent(
        event_id=event_id,
        patient_id=patient.patient_id,
        timestamp=timestamp,
        event_type=event_type,
        scenario=map_scenario_name(event_type, req.scenario),
        severity="HIGH",
        source="192.0.2.42",
        endpoint=endpoint,
        session_id=f"sess-sim-{uuid.uuid4().hex[:8].upper()}",
        device_id="dev-sim-laptop",
        request_count=req_cnt,
        records_accessed=records_accessed,
        failed_login_attempts=failed_login_attempts,
        response_status=response_status,
        response_time_ms=120,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) SimulationAgent/1.0",
        network_zone="EXTERNAL",
        is_anomalous_baseline=True,
        synthetic=True
    )
    
    try:
        db.add(sim_event)
        
        if req.scenario == "BRUTE_FORCE":
            patient.failed_login_attempts = (patient.failed_login_attempts or 0) + failed_login_attempts
        elif req.scenario == "SUSPICIOUS_LOGIN":
            patient.failed_login_attempts = (patient.failed_login_attempts or 0) + 1
        elif req.scenario == "SUSPICIOUS_DATA_ACCESS":
            patient.records_accessed = (patient.records_accessed or 0) + records_accessed
        elif req.scenario == "RECONNAISSANCE":
            patient.unique_endpoints = (patient.unique_endpoints or 0) + 5
            patient.endpoint_enumeration = True
        elif req.scenario == "DATA_EXFILTRATION":
            patient.data_export_events = (patient.data_export_events or 0) + 1
            patient.records_accessed = (patient.records_accessed or 0) + records_accessed

        db.add(patient)
        db.commit()
        db.refresh(sim_event)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to write simulation event: {e}")

    # Trigger Automated Pipeline Calculation
    feature_result_dict = None
    fusion_result_dict = None

    try:
        from app.security_engine.event_ml_pipeline import process_event_ml_pipeline
        from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline
        from app.security_engine.fec_engine import calculate_event_fec

        feat_obj = calculate_single_patient_features(patient.patient_id, db)
        calculate_single_patient_fec(patient.patient_id, db)
        calculate_event_fec(sim_event.event_id, db)
        process_event_ml_pipeline(db, sim_event.event_id)
        fusion_result_dict = process_event_fusion_pipeline(db, sim_event.event_id)

        if feat_obj:
            feature_result_dict = {
                "status": "PROCESSED",
                "patient_id": patient.patient_id,
                "event_id": sim_event.event_id,
                "calculated_at": feat_obj.calculated_at.isoformat() if feat_obj.calculated_at else None,
                "feature_version": feat_obj.feature_version,
                "features": {
                    "total_events": feat_obj.total_events,
                    "failed_login_count": feat_obj.failed_login_count,
                    "failed_login_rate": feat_obj.failed_login_rate,
                    "api_request_count": feat_obj.api_request_count,
                    "request_rate": feat_obj.request_rate,
                    "record_access_count": feat_obj.record_access_count,
                    "total_records_accessed": feat_obj.total_records_accessed,
                    "unique_endpoints": feat_obj.unique_endpoints,
                    "endpoint_discovery_count": feat_obj.endpoint_discovery_count,
                    "suspicious_download_count": feat_obj.suspicious_download_count,
                    "data_export_count": feat_obj.data_export_count,
                    "privilege_escalation_count": feat_obj.privilege_escalation_count,
                    "error_rate": feat_obj.error_rate,
                    "night_activity_count": feat_obj.night_activity_count,
                    "anomalous_event_count": feat_obj.anomalous_event_count
                }
            }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[ERROR] Automated Feature/ML Engine calculation failed: {e}")
        feature_result_dict = {
            "status": "FAILED",
            "patient_id": patient.patient_id,
            "event_id": sim_event.event_id,
            "error": str(e)
        }

    event_dict = {
        "event_id": sim_event.event_id,
        "patient_id": sim_event.patient_id,
        "scenario": sim_event.scenario,
        "event_type": sim_event.event_type,
        "severity": sim_event.severity,
        "timestamp": sim_event.timestamp,
        "endpoint": sim_event.endpoint,
        "failed_login_attempts": sim_event.failed_login_attempts,
        "records_accessed": sim_event.records_accessed,
        "request_count": sim_event.request_count,
        "synthetic": True
    }

    try:
        from app.security_engine.telemetry_generator import broadcast_update
        broadcast_update({
            "type": "HONEYPOT_ATTACK_SIMULATED",
            "event": event_dict,
            "fusion_pipeline": fusion_result_dict
        })
    except Exception as e:
        print(f"[WARNING] Telemetry broadcast failed: {e}")

    return {
        "success": True,
        "event": event_dict,
        "feature_processing": feature_result_dict,
        "fusion_pipeline": fusion_result_dict
    }
