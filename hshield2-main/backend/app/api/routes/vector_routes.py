from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import HoneypotSecurityEvent, Patient
from app.security_engine.vector_engine import (
    extract_raw_behavioral_features,
    compute_behavioral_embedding,
    find_nearest_behavioral_attacks,
    VECTOR_FEATURE_COLUMNS
)
from typing import Optional

router = APIRouter()

@router.get("/vector/embedding/{event_id}")
def get_event_vector_embedding(event_id: str, db: Session = Depends(get_db)):
    """
    Returns the isolated 15-dimensional L2-normalized behavioral embedding for a specific event ID.
    Identifiers (event_id, patient_id, timestamp, UUID) are strictly excluded from the embedding vector.
    """
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == event_id.strip()
    ).first()
    
    if not evt:
        raise HTTPException(status_code=404, detail=f"Security event '{event_id}' not found.")
        
    patient = db.query(Patient).filter(Patient.patient_id == evt.patient_id.upper()).first()
    raw_feats = extract_raw_behavioral_features(evt, patient)
    embedding = compute_behavioral_embedding(raw_feats)
    
    return {
        "event_id": evt.event_id,
        "patient_id": evt.patient_id,
        "scenario": evt.scenario or "Unknown",
        "dimension": len(embedding),
        "feature_columns": VECTOR_FEATURE_COLUMNS,
        "raw_features": raw_feats,
        "embedding_vector": embedding
    }

@router.get("/vector/similarity/{event_id}")
def get_nearest_attack_neighbors(
    event_id: str,
    limit: int = Query(5, ge=1, le=20),
    patient_scope: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Performs cosine similarity search over historical security events using behavioral embeddings.
    """
    try:
        results = find_nearest_behavioral_attacks(
            db=db,
            target_event_id=event_id,
            limit=limit,
            patient_scope=patient_scope
        )
        return results
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector similarity search failed for event '{event_id}': {e}")
