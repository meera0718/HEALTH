from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from app.api.deps import get_db
from app.db.models import DecoyAsset, DeceptionEvent, AuditLog
from app.security_engine.deception_engine.deception_service import DeceptionService

router = APIRouter()

class DecoyTriggerPayload(BaseModel):
    decoy_id: str = "DEC-PHARM-01"
    source_asset: str = "Staff-PC-07"
    incident_id: str = "HSX-042"

@router.get("/deception/decoys")
def list_decoy_assets(
    view_mode: str = Query("defender", description="defender or attacker"),
    db: Session = Depends(get_db)
):
    service = DeceptionService(db_session=db)
    return service.get_decoys(view_mode=view_mode)

@router.get("/deception/events")
def list_deception_events(db: Session = Depends(get_db)):
    events = db.query(DeceptionEvent).order_by(DeceptionEvent.id.desc()).all()
    return [
        {
            "id": e.id,
            "incident_id": e.incident_id,
            "timestamp": e.timestamp,
            "source_asset": e.source_asset,
            "target_decoy_id": e.target_decoy_id,
            "event_type": e.event_type,
            "severity": e.severity,
            "confidence": e.confidence,
            "details": e.details
        }
        for e in events
    ]

@router.post("/deception/trigger")
def trigger_decoy_interaction(payload: DecoyTriggerPayload, db: Session = Depends(get_db)):
    service = DeceptionService(db_session=db)
    result = service.trigger_decoy_event(
        decoy_id=payload.decoy_id,
        source_asset=payload.source_asset,
        incident_id=payload.incident_id
    )

    # Persist to DB
    evt = DeceptionEvent(
        id=result["event_id"],
        incident_id=payload.incident_id,
        timestamp=result["timestamp"],
        source_asset=payload.source_asset,
        target_decoy_id=payload.decoy_id,
        event_type="DECOY_TRIGGERED",
        severity="CRITICAL",
        confidence=result["malicious_confidence"],
        details=f"Attacker at {payload.source_asset} intercepted by synthetic decoy {payload.decoy_id}"
    )
    db.add(evt)

    decoy = db.query(DecoyAsset).filter(DecoyAsset.id == payload.decoy_id).first()
    if decoy:
        decoy.interaction_count += 1
        decoy.last_interaction = result["timestamp"]
        decoy.status = "TRIGGERED"

    audit = AuditLog(
        timestamp=result["timestamp"],
        user="deception_engine",
        action="DECOY_INTERCEPTED",
        incident_id=payload.incident_id,
        details=f"Attacker diverted to decoy asset {payload.decoy_id}. Real critical assets SAFE."
    )
    db.add(audit)
    db.commit()

    return result

@router.get("/deception/recommendations")
def get_deception_recommendations(
    incident_stage: str = Query("Lateral Movement"),
    target_threat: str = Query("Pharmacy infrastructure"),
    db: Session = Depends(get_db)
):
    service = DeceptionService(db_session=db)
    return service.get_adaptive_recommendation(incident_stage, target_threat)
