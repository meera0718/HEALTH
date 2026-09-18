import json
import csv
import io
import datetime
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import AuditLog, PatientRecord, Patient, HoneypotSecurityEvent
from app.db.synthetic_cohort_v1 import SYNTHETIC_PATIENTS_COHORT_V1
from app.ml.inference import get_ml_engine
from app.ml.trainer import train_and_persist_models

router = APIRouter()

def map_scenario_name(evt_type: str) -> str:
    mapping = {
        "BRUTE_FORCE_ATTEMPT": "Brute Force",
        "ENDPOINT_DISCOVERY": "Reconnaissance",
        "SUSPICIOUS_DATA_ACCESS": "Suspicious Data Access",
        "DATA_EXPORT": "Data Exfiltration",
        "SUSPICIOUS_LOGIN": "Suspicious Login"
    }
    return mapping.get(evt_type, evt_type)

def format_patient_dict(p: Patient, db: Optional[Session] = None, preloaded_latest_event: Optional[HoneypotSecurityEvent] = None) -> dict:
    latest_event = None
    evt = preloaded_latest_event
    if evt is None and db:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == p.patient_id,
            HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()

    if evt:
        formatted_ts = evt.timestamp
        try:
            ts_str = evt.timestamp.replace("Z", "+00:00")
            dt = datetime.datetime.fromisoformat(ts_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            local_dt = dt.astimezone()
            formatted_ts = local_dt.strftime("%d %b %Y, %H:%M:%S")
        except Exception:
            pass

        scenario_name = getattr(evt, "scenario", None) or map_scenario_name(evt.event_type)

        latest_event = {
            "event_id": evt.event_id,
            "timestamp": evt.timestamp,
            "formatted_timestamp": formatted_ts,
            "scenario": scenario_name,
            "event_type": evt.event_type,
            "severity": evt.severity,
            "endpoint": evt.endpoint,
            "records_accessed": evt.records_accessed,
            "failed_login_attempts": evt.failed_login_attempts
        }

    # Format real successful login timestamp
    login_days = p.last_login_days_ago
    if login_days is not None and login_days > 0:
        login_dt = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=login_days)
        local_login_dt = login_dt.astimezone()
        last_successful_login_fmt = local_login_dt.strftime("%d %b %Y, %H:%M:%S")
    elif login_days == 0:
        last_successful_login_fmt = datetime.datetime.now(datetime.timezone.utc).astimezone().strftime("%d %b %Y, %H:%M:%S")
    else:
        last_successful_login_fmt = "No successful login recorded"

    return {
        "patient_id": p.patient_id,
        "synthetic": p.synthetic,
        "display_name": p.display_name,
        "age": p.age,
        "sex": p.sex,
        "city": p.city,
        "occupation": p.occupation,
        "organization": p.organization,
        "primary_diagnosis": p.primary_diagnosis,
        "security_profile": p.security_profile,
        "latest_security_event": latest_event,
        "digital_environment": {
            "device_count": p.device_count,
            "device_type": p.device_type,
            "operating_system": p.operating_system,
            "browser_type": p.browser_type,
            "network_type": p.network_type,
            "account_age_days": p.account_age_days,
            "mfa_enabled": p.mfa_enabled,
            "last_login_days_ago": p.last_login_days_ago,
            "last_successful_login_formatted": last_successful_login_fmt
        },
        "security_features": {
            "failed_login_attempts": p.failed_login_attempts,
            "successful_login_attempts": p.successful_login_attempts,
            "requests_per_minute": p.requests_per_minute,
            "session_duration_minutes": p.session_duration_minutes,
            "records_accessed": p.records_accessed,
            "unique_records_accessed": p.unique_records_accessed,
            "unique_endpoints": p.unique_endpoints,
            "api_calls": p.api_calls,
            "error_rate": p.error_rate,
            "device_changes": p.device_changes,
            "password_reset_count": p.password_reset_count,
            "unusual_access_time": p.unusual_access_time,
            "endpoint_enumeration": p.endpoint_enumeration,
            "privilege_escalation_attempts": p.privilege_escalation_attempts,
            "data_export_events": p.data_export_events,
            "suspicious_downloads": p.suspicious_downloads,
            "geographic_anomaly": p.geographic_anomaly,
            "session_anomaly": p.session_anomaly
        },
        "created_at": p.created_at.isoformat() if p.created_at else None
    }

@router.get("/patients/validate")
def validate_patients_dataset(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    if not patients:
        from seed_patients import seed_patients_cohort
        seed_patients_cohort()
        patients = db.query(Patient).all()

    total_records = len(patients)
    patient_ids = [p.patient_id for p in patients if p.patient_id]
    unique_ids = len(set(patient_ids))
    duplicate_ids = total_records - unique_ids
    synthetic_records = sum(1 for p in patients if p.synthetic is True)

    required_keys = ["patient_id", "display_name", "age", "sex", "city", "primary_diagnosis", "security_profile"]
    missing_fields = 0
    for p in patients:
        for key in required_keys:
            if getattr(p, key, None) is None:
                missing_fields += 1

    is_valid = (
        total_records == 30 and
        unique_ids == 30 and
        missing_fields == 0 and
        duplicate_ids == 0 and
        synthetic_records == 30
    )

    return {
        "total_records": total_records,
        "unique_ids": unique_ids,
        "missing_fields": missing_fields,
        "duplicate_ids": duplicate_ids,
        "synthetic_records": synthetic_records,
        "status": "VALID" if is_valid else "VALIDATION_ERROR",
        "is_valid": is_valid
    }

@router.get("/patients/count")
def get_patients_count(db: Session = Depends(get_db)):
    count = db.query(Patient).count()
    if count == 0:
        count = len(SYNTHETIC_PATIENTS_COHORT_V1)
    return {
        "count": count,
        "dataset_id": "HTS-SYN-001",
        "dataset_name": "HealthTech Shield Synthetic Patient Cohort v1",
        "synthetic": True
    }

@router.post("/patients/seed")
def seed_patients_endpoint(db: Session = Depends(get_db)):
    from seed_patients import seed_patients_cohort
    success = seed_patients_cohort()
    count = db.query(Patient).count()
    return {
        "status": "SUCCESS" if success else "FAILED",
        "dataset_id": "HTS-SYN-001",
        "patients_generated": 30,
        "current_total": count,
        "synthetic": True
    }

@router.get("/patients/export/csv")
def export_patients_csv(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    if not patients:
        # Fallback to seed data if DB table not populated yet
        from seed_patients import seed_patients_cohort
        seed_patients_cohort()
        patients = db.query(Patient).all()

    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    field_names = [
        "patient_id", "synthetic", "display_name", "age", "sex", "city", "occupation",
        "organization", "primary_diagnosis", "security_profile", "device_count",
        "device_type", "operating_system", "browser_type", "network_type",
        "account_age_days", "mfa_enabled", "last_login_days_ago", "failed_login_attempts",
        "successful_login_attempts", "requests_per_minute", "session_duration_minutes",
        "records_accessed", "unique_records_accessed", "unique_endpoints", "api_calls",
        "error_rate", "device_changes", "password_reset_count", "unusual_access_time",
        "endpoint_enumeration", "privilege_escalation_attempts", "data_export_events",
        "suspicious_downloads", "geographic_anomaly", "session_anomaly"
    ]
    writer.writerow(field_names)

    for p in patients:
        writer.writerow([
            p.patient_id, p.synthetic, p.display_name, p.age, p.sex, p.city, p.occupation,
            p.organization, p.primary_diagnosis, p.security_profile, p.device_count,
            p.device_type, p.operating_system, p.browser_type, p.network_type,
            p.account_age_days, p.mfa_enabled, p.last_login_days_ago, p.failed_login_attempts,
            p.successful_login_attempts, p.requests_per_minute, p.session_duration_minutes,
            p.records_accessed, p.unique_records_accessed, p.unique_endpoints, p.api_calls,
            p.error_rate, p.device_changes, p.password_reset_count, p.unusual_access_time,
            p.endpoint_enumeration, p.privilege_escalation_attempts, p.data_export_events,
            p.suspicious_downloads, p.geographic_anomaly, p.session_anomaly
        ])

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=healthtech_shield_patients_v1.csv"}
    )

@router.get("/patients/export/json")
def export_patients_json(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    if not patients:
        from seed_patients import seed_patients_cohort
        seed_patients_cohort()
        patients = db.query(Patient).all()

    records = [format_patient_dict(p) for p in patients]

    data = {
        "dataset_id": "HTS-SYN-001",
        "dataset_version": "v1",
        "synthetic": True,
        "record_count": len(records),
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "records": records
    }

    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=healthtech_shield_patients_v1.json"}
    )

@router.get("/patients")
def get_all_patients(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    if not patients:
        from seed_patients import seed_patients_cohort
        seed_patients_cohort()
        patients = db.query(Patient).all()

    # Pre-fetch all latest EVT-SIM events in 1 single query
    sim_events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).all()

    latest_event_map = {}
    for evt in sim_events:
        if evt.patient_id not in latest_event_map:
            latest_event_map[evt.patient_id] = evt

    patients_list = [format_patient_dict(p, db=db, preloaded_latest_event=latest_event_map.get(p.patient_id)) for p in patients]

    counts = {"LOW": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}
    for p in patients:
        prof = p.security_profile or "LOW"
        if prof in counts:
            counts[prof] += 1

    return {
        "dataset_id": "HTS-SYN-001",
        "dataset_name": "HealthTech Shield Synthetic Patient Cohort v1",
        "synthetic": True,
        "record_count": len(patients_list),
        "summary": {
            "total_patients": len(patients_list),
            "low": counts["LOW"],
            "moderate": counts["MODERATE"],
            "high": counts["HIGH"],
            "critical": counts["CRITICAL"]
        },
        "patients": patients_list
    }

@router.get("/patients/{patient_id}/security-profile")
def get_patient_security_profile(patient_id: str, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.patient_id.ilike(patient_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail=f"Patient '{patient_id}' not found.")
    return {
        "patient_id": p.patient_id,
        "security_profile": p.security_profile,
        "synthetic": True
    }

@router.get("/patients/{patient_id}")
def get_patient_by_id(patient_id: str, db: Session = Depends(get_db)):
    # Check HTS-SYN-001 Patient table
    p = db.query(Patient).filter(Patient.patient_id.ilike(patient_id)).first()
    if p:
        return format_patient_dict(p, db=db)
    
    # Fallback to legacy PatientRecord table if queried
    rec = db.query(PatientRecord).filter(PatientRecord.id.ilike(patient_id)).first()
    if not rec:
        rec = db.query(PatientRecord).filter(PatientRecord.id == patient_id.upper()).first()

    if not rec:
        raise HTTPException(status_code=404, detail=f"Patient record '{patient_id}' not found.")

    ml_engine = get_ml_engine()
    feat = {
        "failed_logins": rec.failed_logins,
        "requests_per_minute": rec.requests_per_minute,
        "records_accessed": rec.records_accessed,
        "unique_endpoints": rec.unique_endpoints,
        "session_duration_min": rec.session_duration_min,
        "device_changes": rec.device_changes,
        "error_rate": rec.error_rate,
        "unusual_access_time": rec.unusual_access_time,
        "endpoint_enumeration": rec.endpoint_enumeration,
    }

    eval_res = ml_engine.evaluate_patient_features(feat, patient_id=rec.id, diagnosis=rec.diagnosis)

    try:
        access_hist = json.loads(rec.access_history_json or "[]")
    except:
        access_hist = []

    try:
        clinical_act = json.loads(rec.clinical_activity_json or "[]")
    except:
        clinical_act = []

    return {
        "id": rec.id,
        "patient_id": rec.id,
        "name": rec.name,
        "diagnosis": rec.diagnosis,
        "security_features": feat,
        "ml_evaluation": eval_res,
        "age": rec.age,
        "gender": rec.gender,
        "blood_group": rec.blood_group,
        "doctor": rec.doctor,
        "department": rec.department,
        "status": rec.status,
        "room": rec.room,
        "recent_clinical_activity": clinical_act,
        "access_history": access_hist
    }

    ml_engine = get_ml_engine()
    feat = {
        "failed_logins": rec.failed_logins,
        "requests_per_minute": rec.requests_per_minute,
        "records_accessed": rec.records_accessed,
        "unique_endpoints": rec.unique_endpoints,
        "session_duration_min": rec.session_duration_min,
        "device_changes": rec.device_changes,
        "error_rate": rec.error_rate,
        "unusual_access_time": rec.unusual_access_time,
        "endpoint_enumeration": rec.endpoint_enumeration,
    }

    eval_res = ml_engine.evaluate_patient_features(feat, patient_id=rec.id, diagnosis=rec.diagnosis)

    try:
        access_hist = json.loads(rec.access_history_json or "[]")
    except:
        access_hist = []

    try:
        clinical_act = json.loads(rec.clinical_activity_json or "[]")
    except:
        clinical_act = []

    return {
        "id": rec.id,
        "name": rec.name,
        "diagnosis": rec.diagnosis,
        "security_features": feat,
        "ml_evaluation": eval_res,
        "age": rec.age,
        "gender": rec.gender,
        "blood_group": rec.blood_group,
        "doctor": rec.doctor,
        "department": rec.department,
        "status": rec.status,
        "room": rec.room,
        "recent_clinical_activity": clinical_act,
        "access_history": access_hist
    }

# Endpoint matching Section 12 spec: GET /api/patient/{patient_id}/risk or /api/patients/{patient_id}/risk
@router.get("/patient/{patient_id}/risk")
@router.get("/patients/{patient_id}/risk")
def get_patient_risk_analysis(patient_id: str, db: Session = Depends(get_db)):
    rec = db.query(PatientRecord).filter(PatientRecord.id.ilike(patient_id)).first()
    if not rec:
        rec = db.query(PatientRecord).filter(PatientRecord.id == patient_id.upper()).first()

    if not rec:
        raise HTTPException(status_code=404, detail=f"Patient record {patient_id} not found.")

    ml_engine = get_ml_engine()
    feat = {
        "failed_logins": rec.failed_logins,
        "requests_per_minute": rec.requests_per_minute,
        "records_accessed": rec.records_accessed,
        "unique_endpoints": rec.unique_endpoints,
        "session_duration_min": rec.session_duration_min,
        "device_changes": rec.device_changes,
        "error_rate": rec.error_rate,
        "unusual_access_time": rec.unusual_access_time,
        "endpoint_enumeration": rec.endpoint_enumeration,
    }

    eval_res = ml_engine.evaluate_patient_features(feat, patient_id=rec.id, diagnosis=rec.diagnosis)

    return {
        "patient_id": rec.id,
        "diagnosis": rec.diagnosis,
        "ocsvm": eval_res["ocsvm"],
        "isolation_forest": eval_res["isolation_forest"],
        "xgboost": eval_res["xgboost"],
        "overall_risk": eval_res["overall_risk"],
        "risk_level": eval_res["risk_level"]
    }

@router.post("/ml/train")
def trigger_ml_retraining():
    import os
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    bounds = train_and_persist_models(base_dir)
    # Reset engine
    global ml_engine
    from app.ml.inference import ml_engine as global_engine
    global_engine = None

    return {
        "status": "SUCCESS",
        "message": "One-Class SVM, Isolation Forest, and XGBoost models trained successfully on 3,600 synthetic security sessions.",
        "score_bounds": bounds
    }

class PatientAuditPayload(BaseModel):
    user: str = "doctor_demo"
    action: str = "VIEW_PATIENT_RECORD"
    status: str = "Authorized"

@router.post("/patients/{patient_id}/access-audit")
def audit_patient_record_access(patient_id: str, payload: PatientAuditPayload, db: Session = Depends(get_db)):
    rec = db.query(PatientRecord).filter(PatientRecord.id.ilike(patient_id)).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Patient record {patient_id} not found.")

    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    
    # Also log to main security AuditLog database table
    audit = AuditLog(
        timestamp=timestamp,
        user=payload.user,
        action=f"PATIENT_RECORD_ACCESSED: {patient_id}",
        incident_id="",
        details=f"Authorized record access for patient {rec.name} ({patient_id}). Status: {payload.status}"
    )
    db.add(audit)
    db.commit()

    return {
        "recorded": True,
        "patient_id": patient_id,
        "timestamp": timestamp,
        "status": payload.status
    }
