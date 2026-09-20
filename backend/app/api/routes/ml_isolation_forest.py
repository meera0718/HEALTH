from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import PatientFeature, Patient
from app.ml.inference import predict_isolation_forest
import os
import json

router = APIRouter()

# Directory configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
METADATA_PATH = os.path.join(BASE_DIR, "models", "isolation_forest_metadata.json")

@router.get("/ml/isolation-forest/status")
def get_isolation_forest_status():
    """
    Returns the loaded model status, version, training timestamp, and feature count.
    """
    if not os.path.exists(METADATA_PATH):
        return {
            "model_loaded": False,
            "model_version": None,
            "training_timestamp": None,
            "feature_count": 0
        }
        
    try:
        with open(METADATA_PATH, "r") as f:
            metadata = json.load(f)
        return {
            "model_loaded": True,
            "model_version": metadata.get("model_version", "isolation_forest_v1"),
            "training_timestamp": metadata.get("training_timestamp"),
            "feature_count": len(metadata.get("features", []))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Isolation Forest metadata: {e}")

@router.post("/ml/isolation-forest/predict")
def predict_patient_anomaly(payload: dict, db: Session = Depends(get_db)):
    """
    Retrieves a patient's features from the database, runs Isolation Forest prediction, and returns the output.
    """
    patient_id = payload.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="Missing required field 'patient_id'")
        
    # Check patient existence
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    # Retrieve features
    feat = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id).first()
    if not feat:
        raise HTTPException(status_code=404, detail=f"Feature extraction data not found for patient {patient_id}")
        
    # Build features dict
    feature_cols = [
        "failed_login_rate", "request_rate", "total_records_accessed",
        "unique_endpoints", "endpoint_discovery_count", "suspicious_download_count",
        "data_export_count", "privilege_escalation_count", "device_change_count",
        "night_activity_count", "error_rate", "anomalous_event_count",
        "unique_sessions", "unique_devices", "average_response_time_ms"
    ]
    features_dict = {col: getattr(feat, col) for col in feature_cols}
    
    try:
        pred_res = predict_isolation_forest(features_dict)
        return {
            "patient_id": patient_id,
            "model_version": "isolation_forest_v1",
            "isolation_forest_decision": pred_res["isolation_forest_decision"],
            "isolation_forest_raw_score": pred_res["isolation_forest_raw_score"],
            "isolation_forest_anomaly_score": pred_res["isolation_forest_anomaly_score"],
            "is_anomalous": pred_res["is_anomalous"]
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")
