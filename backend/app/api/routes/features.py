from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from app.api.deps import get_db
from app.db.models import PatientFeature, AuditLog, HoneypotSecurityEvent, Patient
from app.security_engine.feature_engine import (
    calculate_all_patient_features,
    validate_all_patient_features,
    calculate_single_patient_features,
    calculate_event_feature_vector
)
from app.api.routes.honeypot import map_scenario_name
import datetime

router = APIRouter()

@router.get("/features/latest")
def get_latest_processed_feature_event(patient_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns the latest security event processed by the Feature Engine and its event-isolated behavioural feature vector.
    """
    query = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id.like("EVT-SIM-%"))
    if patient_id:
        query = query.filter(HoneypotSecurityEvent.patient_id == patient_id.upper())
    
    latest_evt = query.order_by(HoneypotSecurityEvent.timestamp.desc()).first()
    if not latest_evt:
        raise HTTPException(status_code=404, detail=f"No Honeypot security events found for patient {patient_id or ''}.")
        
    patient = db.query(Patient).filter(Patient.patient_id == latest_evt.patient_id.upper()).first()
    vector_dict, vector_array = calculate_event_feature_vector(latest_evt, patient)
        
    formatted_ts = latest_evt.timestamp
    try:
        ts_str = latest_evt.timestamp.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(ts_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        local_dt = dt.astimezone()
        formatted_ts = local_dt.strftime("%d %b %Y, %H:%M:%S")
    except Exception:
        pass

    scenario_name = map_scenario_name(latest_evt.event_type, getattr(latest_evt, "scenario", None))

    return {
        "status": "PROCESSED",
        "patient_id": latest_evt.patient_id,
        "event_id": latest_evt.event_id,
        "scenario": scenario_name,
        "event_type": latest_evt.event_type,
        "severity": latest_evt.severity,
        "endpoint": latest_evt.endpoint,
        "timestamp": latest_evt.timestamp,
        "formatted_timestamp": formatted_ts,
        "features": vector_dict,
        "feature_vector": vector_array
    }

@router.get("/features/event/{event_id}")
def get_event_processed_features(event_id: str, db: Session = Depends(get_db)):
    """
    Returns event-isolated behavioural feature vector for a specific event_id.
    """
    evt = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id == event_id.strip()).first()
    if not evt:
        raise HTTPException(status_code=404, detail=f"Security event '{event_id}' not found.")

    patient = db.query(Patient).filter(Patient.patient_id == evt.patient_id.upper()).first()
    vector_dict, vector_array = calculate_event_feature_vector(evt, patient)

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

    scenario_name = map_scenario_name(evt.event_type, getattr(evt, "scenario", None))

    return {
        "status": "PROCESSED",
        "patient_id": evt.patient_id,
        "event_id": evt.event_id,
        "scenario": scenario_name,
        "event_type": evt.event_type,
        "severity": evt.severity,
        "endpoint": evt.endpoint,
        "timestamp": evt.timestamp,
        "formatted_timestamp": formatted_ts,
        "features": vector_dict,
        "feature_vector": vector_array
    }


@router.get("/features/patients")
def get_all_patient_features(db: Session = Depends(get_db)):
    """
    Returns the calculated features for all patients.
    """
    features = db.query(PatientFeature).filter(PatientFeature.patient_id.in_(db.query(Patient.patient_id))).all()
    # If no features exist, calculate them on the fly
    if not features:
        calculate_all_patient_features(db)
        features = db.query(PatientFeature).filter(PatientFeature.patient_id.in_(db.query(Patient.patient_id))).all()
        
    return features

@router.get("/features/patients/{patient_id}")
def get_patient_feature(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the feature vector for one patient.
    """
    feature = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id.upper()).first()
    if not feature:
        calculate_all_patient_features(db)
        feature = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id.upper()).first()
        if not feature:
            raise HTTPException(status_code=404, detail=f"Patient features not found for ID: {patient_id}")
    return feature

@router.post("/features/recalculate")
def recalculate_features(db: Session = Depends(get_db)):
    """
    Recalculates features from the existing security_events table.
    Does not generate new events.
    """
    # Trigger recalculation
    calculate_all_patient_features(db)
    
    # Run validation
    validation_res = validate_all_patient_features(db)
    
    # Create audit log
    audit = AuditLog(
        timestamp=datetime.datetime.utcnow().isoformat(),
        user="system@healthshield-x.org",
        action="FEATURES_RECALCULATED",
        incident_id="",
        details=f"Recalculated behavioral features for all 30 patients. Status: {validation_res['status_text']}."
    )
    db.add(audit)
    db.commit()
    
    return validation_res


from pydantic import BaseModel
from typing import Optional
import json

class RecomputeRequest(BaseModel):
    event_id: Optional[str] = None

@router.post("/features/recompute/{patient_id}")
def recompute_patient_features(patient_id: str, req: Optional[RecomputeRequest] = None, db: Session = Depends(get_db)):
    patient_id = patient_id.upper()
    
    try:
        updated_features = calculate_single_patient_features(patient_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
        
    # Get associated event_id
    event_id = None
    if req and req.event_id:
        event_id = req.event_id
    else:
        # Lookup latest synthetic event
        latest_evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == patient_id,
            HoneypotSecurityEvent.synthetic == True
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        if latest_evt:
            event_id = latest_evt.event_id
            
    if not event_id:
        event_id = "UNKNOWN"
        
    # Record audit log
    recomp_time = datetime.datetime.utcnow().isoformat()
    audit_details = {
        "patient_id": patient_id,
        "event_id": event_id,
        "feature_recomputation_timestamp": recomp_time
    }
    
    audit = AuditLog(
        timestamp=recomp_time,
        user="simulation-engine@healthshield-x.org",
        action="FEATURE_RECOMPUTATION_SYNTHETIC",
        incident_id="",
        details=json.dumps(audit_details)
    )
    db.add(audit)
    db.commit()
    
    # Reload from database to ensure fresh session state
    db.refresh(updated_features)
    
    return updated_features

