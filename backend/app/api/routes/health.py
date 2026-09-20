import os
import json
import logging
import datetime
import threading
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.deps import get_db

logger = logging.getLogger("health_check")
router = APIRouter()

# 4 levels up from backend/app/api/routes/health.py -> backend root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
MODELS_DIR = os.path.join(BASE_DIR, "models")

def check_ml_model(name: str, pipeline_file: str, metadata_file: str):
    pipeline_path = os.path.join(MODELS_DIR, pipeline_file)
    metadata_path = os.path.join(MODELS_DIR, metadata_file)
    
    if not os.path.exists(pipeline_path):
        return {"status": "unavailable", "reason": f"Model pipeline file {pipeline_file} not found"}
    if not os.path.exists(metadata_path):
        return {"status": "unavailable", "reason": f"Model metadata file {metadata_file} not found"}
        
    try:
        # Verify metadata is valid JSON
        with open(metadata_path, "r") as f:
            json.load(f)
            
        # Verify pipeline file is non-empty and readable
        if os.path.getsize(pipeline_path) == 0:
            return {"status": "unavailable", "reason": f"Model pipeline file {pipeline_file} is empty"}
            
        return {"status": "loaded"}
    except Exception as e:
        logger.error(f"ML Model {name} verification failed: {e}")
        return {"status": "unavailable", "reason": str(e)}

@router.get("/health")
def get_system_health(db: Session = Depends(get_db)):
    # 1. API Status
    api_status = {"status": "online"}
    
    # 2. Database Connectivity
    try:
        db.execute(text("SELECT 1"))
        db_status = {"status": "connected"}
    except Exception as e:
        logger.error(f"Database connectivity check failed: {e}")
        db_status = {"status": "offline", "reason": str(e)}
        
    # 3. Feature Engine
    try:
        from app.security_engine.feature_engine import calculate_single_patient_features
        from app.db.models import PatientFeature
        db.query(PatientFeature).limit(1).all()
        feature_engine_status = {"status": "ready"}
    except Exception as e:
        logger.error(f"Feature Engine health check failed: {e}")
        feature_engine_status = {"status": "unavailable", "reason": str(e)}
        
    # 4. FEC Engine
    try:
        from app.security_engine.fec_engine import calculate_fec
        from app.db.models import PatientFEC
        calculate_fec([])
        db.query(PatientFEC).limit(1).all()
        fec_engine_status = {"status": "ready"}
    except Exception as e:
        logger.error(f"FEC Engine health check failed: {e}")
        fec_engine_status = {"status": "unavailable", "reason": str(e)}

    # 5. One-Class SVM
    ocsvm_status = check_ml_model("One-Class SVM", "ocsvm_pipeline.joblib", "ocsvm_metadata.json")
    
    # 6. Isolation Forest
    iforest_status = check_ml_model("Isolation Forest", "isolation_forest_pipeline.joblib", "isolation_forest_metadata.json")
    
    # 7. XGBoost
    xgboost_status = check_ml_model("XGBoost", "xgboost_pipeline.joblib", "xgboost_metadata.json")

    # 8. Fusion Engine
    try:
        from app.security_engine.fusion_engine import calculate_patient_fusion
        if (ocsvm_status["status"] != "loaded" or 
            iforest_status["status"] != "loaded" or 
            xgboost_status["status"] != "loaded"):
            missing = [k for k, v in [("ocsvm", ocsvm_status), ("isolation_forest", iforest_status), ("xgboost", xgboost_status)] if v["status"] != "loaded"]
            fusion_engine_status = {"status": "unavailable", "reason": f"Required ML models are missing: {', '.join(missing)}"}
        else:
            fusion_engine_status = {"status": "ready"}
    except Exception as e:
        logger.error(f"Fusion Engine health check failed: {e}")
        fusion_engine_status = {"status": "unavailable", "reason": str(e)}

    # 9. Telemetry Stream
    try:
        threads = threading.enumerate()
        thread_alive = any(t.name == "telemetry_generator" and t.is_alive() for t in threads)
        
        from app.security_engine.telemetry_generator import LAST_TELEMETRY_CYCLE_TIME
        
        if not thread_alive:
            telemetry_status = {"status": "offline", "reason": "Telemetry generator background thread is not running"}
        elif LAST_TELEMETRY_CYCLE_TIME is None:
            # Started but has not completed the first cycle yet
            telemetry_status = {"status": "streaming"}
        else:
            elapsed = (datetime.datetime.utcnow() - LAST_TELEMETRY_CYCLE_TIME).total_seconds()
            if elapsed > 15.0:
                telemetry_status = {
                    "status": "offline", 
                    "reason": f"Telemetry generator thread is active but last cycle was {elapsed:.1f}s ago"
                }
            else:
                telemetry_status = {"status": "streaming"}
    except Exception as e:
        logger.error(f"Telemetry health check failed: {e}")
        telemetry_status = {"status": "offline", "reason": str(e)}

    # 10. Vector Engine
    try:
        from app.security_engine.vector_engine import VECTOR_FEATURE_COLUMNS
        vector_engine_status = {"status": "ready", "dimension": len(VECTOR_FEATURE_COLUMNS)}
    except Exception as e:
        logger.error(f"Vector Engine health check failed: {e}")
        vector_engine_status = {"status": "unavailable", "reason": str(e)}

    # Determine overall status
    if db_status["status"] == "offline":
        overall_status = "offline"
    elif (feature_engine_status["status"] != "ready" or
          fec_engine_status["status"] != "ready" or
          ocsvm_status["status"] != "loaded" or
          iforest_status["status"] != "loaded" or
          xgboost_status["status"] != "loaded" or
          fusion_engine_status["status"] != "ready" or
          telemetry_status["status"] != "streaming" or
          vector_engine_status["status"] != "ready"):
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "components": {
            "api": api_status,
            "database": db_status,
            "feature_engine": feature_engine_status,
            "fec_engine": fec_engine_status,
            "ocsvm": ocsvm_status,
            "isolation_forest": iforest_status,
            "xgboost": xgboost_status,
            "fusion_engine": fusion_engine_status,
            "telemetry": telemetry_status,
            "vector_engine": vector_engine_status
        }
    }
