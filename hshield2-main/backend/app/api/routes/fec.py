from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import PatientFEC, Patient, PatientFeature, AuditLog
from app.security_engine.fec_engine import (
    calculate_all_patient_fec,
    validate_fec_dataset
)
import datetime

router = APIRouter()

@router.get("/fec/patients")
def get_all_patient_fec(db: Session = Depends(get_db)):
    """
    Returns patient FEC records for all patients, joined with patient display name.
    """
    records = db.query(PatientFEC).filter(PatientFEC.patient_id.in_(db.query(Patient.patient_id))).all()
    # Calculate on-the-fly if not present
    if not records:
        calculate_all_patient_fec(db)
        records = db.query(PatientFEC).filter(PatientFEC.patient_id.in_(db.query(Patient.patient_id))).all()
        
    result = []
    for rec in records:
        patient = db.query(Patient).filter(Patient.patient_id == rec.patient_id).first()
        result.append({
            "patient_id": rec.patient_id,
            "display_name": patient.display_name if patient else "Unknown Patient",
            "fec_score": rec.fec_score,
            "authentication_component": rec.authentication_component,
            "request_access_component": rec.request_access_component,
            "record_exposure_component": rec.record_exposure_component,
            "endpoint_anomaly_component": rec.endpoint_anomaly_component,
            "data_movement_component": rec.data_movement_component,
            "device_anomaly_component": rec.device_anomaly_component,
            "time_anomaly_component": rec.time_anomaly_component,
            "general_anomaly_component": rec.general_anomaly_component,
            "fec_version": rec.fec_version,
            "calculated_at": rec.calculated_at.isoformat() if rec.calculated_at else None
        })
    return result

@router.get("/fec/patients/{patient_id}")
def get_patient_fec_detail(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns detailed FEC breakdown and dynamic explanation for a single patient.
    """
    rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
    if not rec:
        # Calculate on-the-fly if missing
        calculate_all_patient_fec(db)
        rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail=f"FEC record not found for patient {patient_id}")
            
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    feat = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id).first()
    
    if not feat:
        raise HTTPException(status_code=404, detail=f"Feature extraction data not found for patient {patient_id}")
        
    # Map component scores
    components = {
        "Authentication": rec.authentication_component,
        "Request / Access": rec.request_access_component,
        "Record Exposure": rec.record_exposure_component,
        "Endpoint Anomaly": rec.endpoint_anomaly_component,
        "Data Movement": rec.data_movement_component,
        "Device Anomaly": rec.device_anomaly_component,
        "Time Anomaly": rec.time_anomaly_component,
        "General Anomaly": rec.general_anomaly_component
    }
    
    # Sort descending by score to identify top 3 contributors
    sorted_components = sorted(components.items(), key=lambda item: item[1], reverse=True)
    top_3 = [name for name, score in sorted_components[:3]]
    
    # Compile dynamic explanations for top 3 components based on raw features
    explanation_mapping = {
        "Record Exposure": lambda f: [f"{f.total_records_accessed} records accessed"],
        "Endpoint Anomaly": lambda f: [
            f"{f.unique_endpoints} unique endpoints",
            f"{f.endpoint_discovery_count} endpoint discovery events"
        ],
        "Data Movement": lambda f: [
            line for line in [
                f"{f.data_export_count} data exports" if f.data_export_count > 0 else None,
                f"{f.suspicious_download_count} suspicious downloads" if f.suspicious_download_count > 0 else None,
                f"{f.privilege_escalation_count} privilege escalation attempts" if f.privilege_escalation_count > 0 else None
            ] if line is not None
        ] if (f.data_export_count > 0 or f.suspicious_download_count > 0 or f.privilege_escalation_count > 0) else [
            "0 data exports",
            "0 suspicious downloads",
            "0 privilege escalation attempts"
        ],
        "Authentication": lambda f: [f"{f.failed_login_count} failed logins"],
        "Request / Access": lambda f: [f"{f.request_rate:.2f} requests/hour"],
        "Device Anomaly": lambda f: [f"{f.device_change_count} device changes"],
        "Time Anomaly": lambda f: [f"{f.night_activity_count} night activity events"],
        "General Anomaly": lambda f: [
            f"{f.error_rate * 100:.1f}% error rate",
            f"{f.anomalous_event_count} anomalous events"
        ]
     }
    
    explanations = []
    for comp in top_3:
        if comp in explanation_mapping:
            explanations.extend(explanation_mapping[comp](feat))
            
    return {
        "patient_id": rec.patient_id,
        "display_name": patient.display_name if patient else "Unknown Patient",
        "primary_diagnosis": patient.primary_diagnosis if patient else "N/A",
        "fec_score": rec.fec_score,
        "components": components,
        "top_contributors": top_3,
        "explanations": explanations,
        "fec_version": rec.fec_version,
        "calculated_at": rec.calculated_at.isoformat() if rec.calculated_at else None
    }

@router.post("/fec/recalculate")
def recalculate_patient_fec(db: Session = Depends(get_db)):
    """
    Recalculates patient FEC scores using the current Feature Extraction data.
    """
    # Trigger recalculation
    calculate_all_patient_fec(db)
    
    # Run validation
    validation_res = validate_fec_dataset(db)
    
    # Log audit event
    audit = AuditLog(
        timestamp=datetime.datetime.utcnow().isoformat(),
        user="system@healthshield-x.org",
        action="FEC_RECALCULATED",
        incident_id="",
        details=f"Recalculated Feature Exposure Composite for all 30 patients. Status: {validation_res['status_text']}."
    )
    db.add(audit)
    db.commit()
    return validation_res
@router.get("/fec/events/patient/{patient_id}")
def get_patient_fec_events(
    patient_id: str,
    category: Optional[str] = "ALL",
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    from app.api.routes.honeypot import get_patient_honeypot_events
    return get_patient_honeypot_events(patient_id, category=category, limit=limit, offset=offset, db=db)

@router.get("/fec/event/{event_id}")
def get_event_fec_detail(event_id: str, db: Session = Depends(get_db)):
    """
    Returns the event-specific FEC result for a single security event_id.
    """
    from app.security_engine.fec_engine import calculate_event_fec
    try:
        rec = calculate_event_fec(event_id.strip(), db)
        return {
            "event_id": rec.event_id,
            "patient_id": rec.patient_id,
            "fec_score": rec.fec_score,
            "baseline_fec": rec.baseline_fec,
            "event_adjustment": rec.event_adjustment,
            "failed_login_component": rec.failed_login_component,
            "request_rate_component": rec.request_rate_component,
            "data_access_component": rec.data_access_component,
            "privilege_escalation_component": rec.privilege_escalation_component,
            "scope": "EVENT",
            "calculated_at": rec.created_at.isoformat() if rec.created_at else None
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/fec/event_ml/{event_id}")
@router.get("/fec/events/{event_id}")
def get_event_ml_result(event_id: str, db: Session = Depends(get_db)):
    """
    Returns the persisted ML pipeline result for a specific security event_id.
    If not yet computed, automatically runs the event ML pipeline on-the-fly.
    """
    from app.db.models import EventMLResult, HoneypotSecurityEvent, Patient
    from app.security_engine.event_ml_pipeline import process_event_ml_pipeline, calculate_event_feature_vector
    import json

    rec = db.query(EventMLResult).filter(EventMLResult.event_id == event_id.strip()).first()
    if not rec:
        # Check if event exists in Honeypot table
        evt = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id == event_id.strip()).first()
        if not evt:
            raise HTTPException(status_code=404, detail=f"Security event '{event_id}' not found.")
        # Process on the fly
        process_event_ml_pipeline(db, event_id.strip())
        rec = db.query(EventMLResult).filter(EventMLResult.event_id == event_id.strip()).first()
        if not rec:
            raise HTTPException(status_code=500, detail=f"Failed to compute ML result for event '{event_id}'.")

    feature_vec = json.loads(rec.feature_vector_json) if rec.feature_vector_json else []
    
    # Calculate feature vector dict for UI consumption
    evt = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id == rec.event_id).first()
    patient = db.query(Patient).filter(Patient.patient_id == rec.patient_id.upper()).first() if rec.patient_id else None
    vector_dict = {}
    if evt:
        vector_dict, _ = calculate_event_feature_vector(evt, patient)

    from app.security_engine.fec_engine import calculate_event_fec
    evt_fec = calculate_event_fec(rec.event_id, db)

    return {
        "event_id": rec.event_id,
        "patient_id": rec.patient_id,
        "scenario": rec.scenario,
        "event_type": rec.event_type,
        "severity": rec.severity,
        "timestamp": rec.timestamp,
        "endpoint": rec.endpoint,
        "features": vector_dict,
        "feature_vector": feature_vec,
        "event_fec": {
            "fec_score": float(evt_fec.fec_score),
            "baseline_fec": float(evt_fec.baseline_fec),
            "event_adjustment": float(evt_fec.event_adjustment),
            "scope": "EVENT"
        },
        "ocsvm": {
            "model": "OCSVM",
            "prediction": rec.ocsvm_prediction,
            "score": rec.ocsvm_score
        },
        "isolation_forest": {
            "model": "ISOLATION_FOREST",
            "prediction": rec.isolation_forest_prediction,
            "score": rec.isolation_forest_score
        },
        "xgboost": {
            "model": "XGBOOST",
            "classification": rec.xgboost_classification,
            "probability": rec.xgboost_probability
        }
    }

@router.get("/fec/patient/{patient_id}/latest_ml")
def get_latest_patient_ml_result(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the Event ML result for the latest Honeypot security event belonging to patient_id.
    """
    from app.db.models import HoneypotSecurityEvent, EventMLResult
    from app.security_engine.event_ml_pipeline import process_event_ml_pipeline
    import json

    pid = patient_id.strip().upper()
    latest_evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == pid,
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()

    if not latest_evt:
        return {"status": "none", "message": f"No Honeypot simulation events found for patient {pid}"}

    return get_event_ml_result(latest_evt.event_id, db)


