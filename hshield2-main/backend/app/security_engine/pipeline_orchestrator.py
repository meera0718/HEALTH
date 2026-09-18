import uuid
import datetime
import json
import logging
from sqlalchemy.orm import Session
from app.db.models import PipelineExecution, HoneypotSecurityEvent, PatientFeature, PatientFEC
from app.security_engine.feature_engine import calculate_single_patient_features
from app.security_engine.fec_engine import calculate_single_patient_fec
from app.security_engine.fusion_engine import calculate_patient_fusion
from app.ml.inference import predict_ocsvm, predict_isolation_forest, predict_xgboost

logger = logging.getLogger("pipeline_orchestrator")

def execute_detection_pipeline(db: Session, patient_id: str, event_id: str = None) -> dict:
    patient_id = patient_id.upper()
    detection_id = f"DET-{uuid.uuid4().hex[:8].upper()}"
    started_at = datetime.datetime.utcnow().isoformat() + "Z"
    
    # 1. Resolve event_id if not supplied
    if not event_id:
        # Get the latest Honeypot security attack event for this patient
        latest_evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == patient_id,
            HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        if not latest_evt:
            latest_evt = db.query(HoneypotSecurityEvent).filter(
                HoneypotSecurityEvent.patient_id == patient_id
            ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        if latest_evt:
            event_id = latest_evt.event_id
            
    # 2. Create the PipelineExecution record
    exec_record = PipelineExecution(
        detection_id=detection_id,
        event_id=event_id,
        patient_id=patient_id,
        current_stage="Honeypot Event",
        stage_status="PROCESSING",
        started_at=started_at,
        final_status="PROCESSING",
        stage_details=json.dumps({})
    )
    db.add(exec_record)
    db.commit()
    
    details = {}
    
    def update_stage(stage: str, status: str, result: dict = None, error: str = None):
        nonlocal details
        exec_record.current_stage = stage
        exec_record.stage_status = status
        if result:
            details[stage] = result
        if error:
            details[stage] = {"error": error}
            exec_record.final_status = "FAILED"
            exec_record.completed_at = datetime.datetime.utcnow().isoformat() + "Z"
        exec_record.stage_details = json.dumps(details)
        db.commit()

    # Step 1: Honeypot Event stage completion
    logger.info(f"[{detection_id}] Starting pipeline for patient {patient_id}, event {event_id}")
    if event_id:
        evt = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.event_id == event_id).first()
        if evt:
            update_stage("Honeypot Event", "COMPLETED", {
                "event_id": evt.event_id,
                "event_type": evt.event_type,
                "severity": evt.severity,
                "endpoint": evt.endpoint,
                "timestamp": evt.timestamp
            })
        else:
            update_stage("Honeypot Event", "COMPLETED", {"event_id": event_id, "info": "Event details not found in DB"})
    else:
        update_stage("Honeypot Event", "COMPLETED", {"info": "No active event associated"})

    # Step 2: Feature Engine
    try:
        logger.info(f"[{detection_id}] Running Feature Engine...")
        update_stage("Feature Engine", "PROCESSING")
        calculate_single_patient_features(patient_id, db)
        # Fetch the updated features
        feat = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id).first()
        feat_dict = {}
        if feat:
            FEATURE_COLUMNS = [
                "failed_login_rate", "request_rate", "total_records_accessed",
                "unique_endpoints", "endpoint_discovery_count", "suspicious_download_count",
                "data_export_count", "privilege_escalation_count", "device_change_count",
                "night_activity_count", "error_rate", "anomalous_event_count",
                "unique_sessions", "unique_devices", "average_response_time_ms"
            ]
            feat_dict = {col: getattr(feat, col) for col in FEATURE_COLUMNS}
        update_stage("Feature Engine", "COMPLETED", {"features": feat_dict})
    except Exception as e:
        logger.error(f"[{detection_id}] Feature Engine failed: {e}")
        update_stage("Feature Engine", "FAILED", error=str(e))
        raise e

    # Step 3: FEC Engine
    try:
        logger.info(f"[{detection_id}] Running FEC Engine...")
        update_stage("FEC Engine", "PROCESSING")
        calculate_single_patient_fec(patient_id, db)
        fec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
        fec_score = fec.fec_score if fec else 0.0
        update_stage("FEC Engine", "COMPLETED", {
            "fec_score": fec_score,
            "components": {
                "authentication": fec.authentication_component if fec else 0,
                "request_access": fec.request_access_component if fec else 0,
                "record_exposure": fec.record_exposure_component if fec else 0,
                "endpoint_anomaly": fec.endpoint_anomaly_component if fec else 0,
                "data_movement": fec.data_movement_component if fec else 0,
                "device_anomaly": fec.device_anomaly_component if fec else 0,
                "time_anomaly": fec.time_anomaly_component if fec else 0,
                "general_anomaly": fec.general_anomaly_component if fec else 0,
            }
        })
    except Exception as e:
        logger.error(f"[{detection_id}] FEC Engine failed: {e}")
        update_stage("FEC Engine", "FAILED", error=str(e))
        raise e

    # Step 4: One-Class SVM
    try:
        logger.info(f"[{detection_id}] Running One-Class SVM...")
        update_stage("One-Class SVM", "PROCESSING")
        pred = predict_ocsvm(feat_dict)
        update_stage("One-Class SVM", "COMPLETED", {
            "ocsvm_decision": pred["ocsvm_decision"],
            "ocsvm_anomaly_score": pred["ocsvm_anomaly_score"],
            "ocsvm_raw_score": pred["ocsvm_raw_score"]
        })
    except Exception as e:
        logger.error(f"[{detection_id}] One-Class SVM failed: {e}")
        update_stage("One-Class SVM", "FAILED", error=str(e))
        raise e

    # Step 5: Isolation Forest
    try:
        logger.info(f"[{detection_id}] Running Isolation Forest...")
        update_stage("Isolation Forest", "PROCESSING")
        pred = predict_isolation_forest(feat_dict)
        update_stage("Isolation Forest", "COMPLETED", {
            "isolation_forest_decision": pred["isolation_forest_decision"],
            "isolation_forest_anomaly_score": pred["isolation_forest_anomaly_score"],
            "isolation_forest_raw_score": pred["isolation_forest_raw_score"]
        })
    except Exception as e:
        logger.error(f"[{detection_id}] Isolation Forest failed: {e}")
        update_stage("Isolation Forest", "FAILED", error=str(e))
        raise e

    # Step 6: XGBoost
    try:
        logger.info(f"[{detection_id}] Running XGBoost...")
        update_stage("XGBoost", "PROCESSING")
        pred = predict_xgboost(feat_dict)
        update_stage("XGBoost", "COMPLETED", {
            "predicted_class": pred["predicted_class"],
            "confidence": pred["confidence"],
            "class_probabilities": pred["class_probabilities"]
        })
    except Exception as e:
        logger.error(f"[{detection_id}] XGBoost failed: {e}")
        update_stage("XGBoost", "FAILED", error=str(e))
        raise e

    # Step 7: Fusion Engine
    try:
        logger.info(f"[{detection_id}] Running Fusion Engine...")
        update_stage("Fusion Engine", "PROCESSING")
        fusion_res = calculate_patient_fusion(db, patient_id)
        update_stage("Fusion Engine", "COMPLETED", {
            "detection_score": fusion_res["detection_score"],
            "detection_status": fusion_res["detection_status"],
            "model_agreement": fusion_res["model_agreement"],
            "evidence_strength": fusion_res["evidence_strength"],
            "detection_reasons": fusion_res["detection_reasons"]
        })
    except Exception as e:
        logger.error(f"[{detection_id}] Fusion Engine failed: {e}")
        update_stage("Fusion Engine", "FAILED", error=str(e))
        raise e

    # Step 8: Threat Assessment (Final Status)
    logger.info(f"[{detection_id}] Pipeline completed successfully.")
    exec_record.current_stage = "Threat Assessment"
    exec_record.stage_status = "COMPLETED"
    exec_record.final_status = "COMPLETED"
    exec_record.completed_at = datetime.datetime.utcnow().isoformat() + "Z"
    
    # Save Threat Assessment final result
    details["Threat Assessment"] = {
        "detection_score": fusion_res["detection_score"],
        "detection_status": fusion_res["detection_status"]
    }
    exec_record.stage_details = json.dumps(details)
    db.commit()

    return fusion_res
