from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import Patient, AuditLog, HoneypotSecurityEvent, PipelineExecution, PatientFeature, PatientFEC
from app.security_engine.pipeline_orchestrator import execute_detection_pipeline
from app.security_engine.fusion_engine import calculate_patient_fusion
from typing import Optional
import datetime
import json

router = APIRouter()

@router.get("/detection/patients")
def get_all_patients_detection(db: Session = Depends(get_db)):
    """
    Returns the fused detection result for all 30 patients.
    """
    patients = db.query(Patient).order_by(Patient.patient_id).all()
    
    # Pre-fetch features and FEC records to eliminate N+1 queries
    features_map = {f.patient_id: f for f in db.query(PatientFeature).all()}
    fec_map = {f.patient_id: f for f in db.query(PatientFEC).all()}
    
    results = []
    for p in patients:
        try:
            res = calculate_patient_fusion(
                db,
                p.patient_id,
                preloaded_patient=p,
                preloaded_feature=features_map.get(p.patient_id),
                preloaded_fec=fec_map.get(p.patient_id)
            )
            results.append(res)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error fusing patient {p.patient_id}: {e}")
    return results

@router.get("/detection/patients/{patient_id}")
def get_patient_detection(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the detailed fused detection result for a single patient.
    """
    try:
        res = calculate_patient_fusion(db, patient_id)
        return res
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fusing patient {patient_id}: {e}")


@router.post("/detection/recalculate/{patient_id}")
def recalculate_patient_detection(patient_id: str, db: Session = Depends(get_db)):
    patient_id = patient_id.upper()
    
    # Check patient existence
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    try:
        fusion_res = execute_detection_pipeline(db, patient_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {e}")
        
    # Record audit log
    recomp_time = datetime.datetime.utcnow().isoformat()
    evts = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id,
        HoneypotSecurityEvent.synthetic == True
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).all()
    event_ids = [e.event_id for e in evts]
    
    audit_details = {
        "patient_id": patient_id,
        "event_ids": event_ids,
        "detection_recomputation_timestamp": recomp_time
    }
    
    audit = AuditLog(
        timestamp=recomp_time,
        user="simulation-engine@healthshield-x.org",
        action="DETECTION_RECOMPUTATION_SYNTHETIC",
        incident_id="",
        details=json.dumps(audit_details)
    )
    db.add(audit)
    db.commit()
    
    return {
        "patient_id": fusion_res["patient_id"],
        "fec_score": fusion_res["fec_score"],
        "ocsvm_anomaly_score": fusion_res["ocsvm_anomaly_score"],
        "ocsvm_is_anomalous": fusion_res["ocsvm_is_anomalous"],
        "isolation_forest_anomaly_score": fusion_res["isolation_forest_anomaly_score"],
        "isolation_forest_is_anomalous": fusion_res["isolation_forest_is_anomalous"],
        "xgboost": {
            "predicted_class": fusion_res["xgboost_predicted_class"],
            "suspiciousness_score": fusion_res["xgboost_suspiciousness_score"],
            "probabilities": fusion_res["xgboost_class_probabilities"]
        },
        "detection_score": fusion_res["detection_score"],
        "detection_status": fusion_res["detection_status"],
        "model_agreement": fusion_res["model_agreement"],
        "evidence_strength": fusion_res["evidence_strength"],
        "detection_reasons": fusion_res["detection_reasons"]
    }

from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline

@router.get("/detection-pipeline/latest")
@router.get("/detection/pipeline/latest")
def get_latest_detection_pipeline(patient_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """
    Returns the latest REAL processed Honeypot simulation attack event (EVT-SIM-...).
    Baseline telemetry (EVT-DEV-...) is strictly excluded.
    """
    query = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id.like("EVT-SIM-%"))
    if patient_id and patient_id.upper() not in ["ALL", "UNDEFINED"]:
        query = query.filter(HoneypotSecurityEvent.patient_id == patient_id.upper())
        
    latest_evt = query.order_by(HoneypotSecurityEvent.created_at.desc(), HoneypotSecurityEvent.timestamp.desc()).first()
    if not latest_evt:
        return {"status": "none", "message": "No Honeypot simulation detection event found"}
        
    try:
        return process_event_fusion_pipeline(db, latest_evt.event_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process detection pipeline for event {latest_evt.event_id}: {e}")

@router.get("/detection-pipeline/event/{event_id}")
@router.get("/detection-pipeline/events/{event_id}")
@router.get("/detection/pipeline/event/{event_id}")
@router.get("/detection/pipeline/events/{event_id}")
def get_detection_pipeline_by_event_id(event_id: str, db: Session = Depends(get_db)):
    """
    Returns the complete processing state for exactly ONE event_id.
    """
    try:
        return process_event_fusion_pipeline(db, event_id.strip())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process detection pipeline for event {event_id}: {e}")

@router.get("/detection/pipeline/{detection_id}")
def get_pipeline_by_id(detection_id: str, db: Session = Depends(get_db)):
    """
    Fallback returns the details of a specific pipeline execution or event_id.
    """
    if detection_id.startswith("EVT-"):
        return process_event_fusion_pipeline(db, detection_id.strip())

    record = db.query(PipelineExecution).filter(PipelineExecution.detection_id == detection_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Pipeline execution '{detection_id}' not found")
        
    try:
        details = json.loads(record.stage_details)
    except Exception:
        details = {}
        
    return {
        "detection_id": record.detection_id,
        "event_id": record.event_id,
        "patient_id": record.patient_id,
        "current_stage": record.current_stage,
        "stage_status": record.stage_status,
        "started_at": record.started_at,
        "completed_at": record.completed_at,
        "final_status": record.final_status,
        "stage_details": details
    }


