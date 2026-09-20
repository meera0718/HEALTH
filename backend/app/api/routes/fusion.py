from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.api.deps import get_db
from app.db.models import HoneypotSecurityEvent, EventFusionResult
from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline

router = APIRouter()

@router.get("/fusion/event/{event_id}")
def get_event_fusion_result(event_id: str, db: Session = Depends(get_db)):
    """
    Returns the complete event-aware Fusion Engine and Threat Assessment result for a specific security event_id.
    """
    try:
        return process_event_fusion_pipeline(db, event_id.strip())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process fusion pipeline: {e}")

@router.get("/fusion/patient/{patient_id}/latest")
def get_latest_patient_fusion_result(patient_id: str, db: Session = Depends(get_db)):
    """
    Returns the Fusion Engine & Threat Assessment result for the latest HONEYPOT SIMULATION attack event for a patient.
    """
    pid = patient_id.strip().upper()
    latest_evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id.ilike(pid),
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()

    if not latest_evt:
        raise HTTPException(
            status_code=404,
            detail=f"No honeypot simulation events found for patient '{pid}'."
        )

    return process_event_fusion_pipeline(db, latest_evt.event_id)
