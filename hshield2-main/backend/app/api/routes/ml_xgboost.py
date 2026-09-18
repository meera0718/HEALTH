from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import PatientFeature, Patient
from app.ml.inference import predict_xgboost, predict_ocsvm, predict_isolation_forest
import os
import json

router = APIRouter()

# Directory configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
METADATA_PATH = os.path.join(BASE_DIR, "models", "xgboost_metadata.json")

@router.get("/ml/xgboost/status")
def get_xgboost_status():
    """
    Returns the loaded model status, version, training timestamp, feature count, and class names.
    """
    if not os.path.exists(METADATA_PATH):
        return {
            "model_loaded": False,
            "model_version": None,
            "training_timestamp": None,
            "feature_count": 0,
            "classes": []
        }
        
    try:
        with open(METADATA_PATH, "r") as f:
            metadata = json.load(f)
        return {
            "model_loaded": True,
            "model_version": metadata.get("model_version", "xgboost_v1"),
            "training_timestamp": metadata.get("training_timestamp"),
            "feature_count": len(metadata.get("features", [])),
            "classes": metadata.get("classes", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read XGBoost metadata: {e}")

@router.post("/ml/xgboost/predict")
def predict_patient_anomaly(payload: dict, db: Session = Depends(get_db)):
    """
    Retrieves a patient's features from the database, runs XGBoost prediction, and returns the output.
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
        pred_res = predict_xgboost(features_dict)
        return {
            "patient_id": patient_id,
            "model_version": "xgboost_v1",
            "predicted_class": pred_res["predicted_class"],
            "confidence": pred_res["confidence"],
            "class_probabilities": pred_res["class_probabilities"]
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")


@router.post("/ml/inference/{patient_id}")
def run_unified_ml_inference(patient_id: str, db: Session = Depends(get_db)):
    patient_id = patient_id.upper()
    
    # 1. Check patient existence
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    # 2. Retrieve features
    feat = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id).first()
    if not feat:
        raise HTTPException(status_code=404, detail=f"Feature extraction data not found for patient {patient_id}")
        
    # 3. Enforce strict feature presence checks
    feature_cols = [
        "failed_login_rate", "request_rate", "total_records_accessed",
        "unique_endpoints", "endpoint_discovery_count", "suspicious_download_count",
        "data_export_count", "privilege_escalation_count", "device_change_count",
        "night_activity_count", "error_rate", "anomalous_event_count",
        "unique_sessions", "unique_devices", "average_response_time_ms"
    ]
    
    features_dict = {}
    for col in feature_cols:
        val = getattr(feat, col, None)
        if val is None:
            raise HTTPException(
                status_code=400,
                detail=f"Required feature '{col}' is missing or null for patient {patient_id}. Cannot run inference."
            )
        features_dict[col] = float(val)
        
    # 4. Load metadata versions
    models_dir = os.path.join(BASE_DIR, "models")
    
    ocsvm_ver = "ocsvm_v1"
    try:
        with open(os.path.join(models_dir, "ocsvm_metadata.json"), "r") as f:
            ocsvm_ver = json.load(f).get("model_version", "ocsvm_v1")
    except Exception:
        pass
        
    iforest_ver = "isolation_forest_v1"
    try:
        with open(os.path.join(models_dir, "isolation_forest_metadata.json"), "r") as f:
            iforest_ver = json.load(f).get("model_version", "isolation_forest_v1")
    except Exception:
        pass
        
    xgboost_ver = "xgboost_v1"
    try:
        with open(os.path.join(models_dir, "xgboost_metadata.json"), "r") as f:
            xgboost_ver = json.load(f).get("model_version", "xgboost_v1")
    except Exception:
        pass
        
    # 5. Run inference on all three models
    try:
        ocsvm_res = predict_ocsvm(features_dict)
        iforest_res = predict_isolation_forest(features_dict)
        xgb_res = predict_xgboost(features_dict)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Model loading error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model inference execution error: {str(e)}")
        
    return {
        "patient_id": patient_id,
        "ocsvm": {
            "anomalous": ocsvm_res["is_anomalous"],
            "score": ocsvm_res["ocsvm_anomaly_score"]
        },
        "isolation_forest": {
            "anomalous": iforest_res["is_anomalous"],
            "score": iforest_res["isolation_forest_anomaly_score"]
        },
        "xgboost": {
            "predicted_class": xgb_res["predicted_class"],
            "probabilities": xgb_res["class_probabilities"]
        },
        "ocsvm_version": ocsvm_ver,
        "isolation_forest_version": iforest_ver,
        "xgboost_version": xgboost_ver
    }

