import datetime
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.db.models import Patient, PatientFeature, PatientFEC, Device
from app.ml.inference import predict_ocsvm, predict_isolation_forest, predict_xgboost

FEATURE_COLUMNS = [
    "failed_login_rate",
    "request_rate",
    "total_records_accessed",
    "unique_endpoints",
    "endpoint_discovery_count",
    "suspicious_download_count",
    "data_export_count",
    "privilege_escalation_count",
    "device_change_count",
    "night_activity_count",
    "error_rate",
    "anomalous_event_count",
    "unique_sessions",
    "unique_devices",
    "average_response_time_ms"
]

def calculate_patient_fusion(
    db: Session,
    patient_id: str,
    preloaded_patient: Optional[Any] = None,
    preloaded_feature: Optional[Any] = None,
    preloaded_fec: Optional[Any] = None
) -> dict:
    # 1. Fetch patient or fallback to device
    if preloaded_patient is not None:
        patient = preloaded_patient
    else:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            device = db.query(Device).filter(Device.device_id == patient_id).first()
            if not device:
                raise ValueError(f"Patient or Device {patient_id} not found")
            class MockPatient:
                primary_diagnosis = device.device_type
            patient = MockPatient()
        
    # 2. Fetch features
    if preloaded_feature is not None:
        feat = preloaded_feature
    else:
        feat = db.query(PatientFeature).filter(PatientFeature.patient_id == patient_id).first()
        if not feat:
            raise ValueError(f"Feature extraction record not found for patient {patient_id}")
        
    # 3. Fetch FEC score
    if preloaded_fec is not None:
        fec_score = float(preloaded_fec.fec_score) if preloaded_fec else 0.0
    else:
        fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
        fec_score = float(fec_rec.fec_score) if fec_rec else 0.0
    
    # 4. Map feature dictionary
    feat_dict = {col: getattr(feat, col) for col in FEATURE_COLUMNS}
    
    # 5. Run ML predictions
    ocsvm_res = predict_ocsvm(feat_dict)
    iforest_res = predict_isolation_forest(feat_dict)
    xgb_res = predict_xgboost(feat_dict)
    
    # 6. Extract raw values
    ocsvm_anomaly_score = float(ocsvm_res["ocsvm_anomaly_score"])
    isolation_forest_anomaly_score = float(iforest_res["isolation_forest_anomaly_score"])
    
    xgboost_predicted_class = xgb_res["predicted_class"]
    class_probabilities = xgb_res["class_probabilities"]
    
    # XGBoost suspiciousness = 1 - P(NORMAL)
    # Since class_probabilities are represented in percentages (e.g. 98.3%), divide NORMAL by 100
    p_normal = float(class_probabilities.get("NORMAL", 100.0)) / 100.0
    xgb_suspiciousness = 1.0 - p_normal
    xgboost_suspiciousness_score = float(round(100.0 * xgb_suspiciousness, 1))
    
    # 7. Detection Score calculation
    # 20% FEC + 20% OCSVM + 20% IF + 40% XGB
    detection_score = (
        0.20 * fec_score +
        0.20 * ocsvm_anomaly_score +
        0.20 * isolation_forest_anomaly_score +
        0.40 * xgboost_suspiciousness_score
    )
    detection_score = max(0.0, min(100.0, float(round(detection_score, 1))))
    
    # 8. Detection Status Bands
    if detection_score >= 75.0:
        detection_status = "CRITICAL"
    elif detection_score >= 50.0:
        detection_status = "HIGH CONCERN"
    elif detection_score >= 25.0:
        detection_status = "LOW CONCERN"
    else:
        detection_status = "NORMAL"
        
    # 9. Model Agreement
    ocsvm_anom = ocsvm_res["is_anomalous"]
    iforest_anom = iforest_res["is_anomalous"]
    
    if ocsvm_anom == iforest_anom:
        anomaly_detectors_status = "AGREE"
        agreement_count = 2
    else:
        anomaly_detectors_status = "DISAGREE"
        agreement_count = 1
        
    model_agreement = {
        "anomaly_detectors": anomaly_detectors_status,
        "count": agreement_count
    }
    
    # 10. Evidence Strength
    is_xgb_suspicious = (xgboost_predicted_class != "NORMAL")
    if (ocsvm_anom and iforest_anom) and is_xgb_suspicious:
        evidence_strength = "STRONG"
    elif (ocsvm_anom or iforest_anom) or is_xgb_suspicious:
        evidence_strength = "MODERATE"
    else:
        evidence_strength = "LOW"
        
    # 11. Dynamic Detection Reasons
    detection_reasons = []
    
    # Feature-based reasons
    if feat.total_records_accessed > 1000:
        detection_reasons.append("High record access volume")
    if feat.unique_endpoints > 15:
        detection_reasons.append("Unusual endpoint activity")
    if feat.failed_login_rate > 0.3:
        detection_reasons.append("Elevated failed login rate")
    if feat.request_rate > 0.05:
        detection_reasons.append("Abnormal request rate")
    if feat.night_activity_count > 40:
        detection_reasons.append("Night-time access detected")
        
    # Model-based reasons
    if ocsvm_anom:
        detection_reasons.append("One-Class SVM identified deviation from normal behaviour")
    if iforest_anom:
        detection_reasons.append("Isolation Forest identified anomalous behaviour")
    if is_xgb_suspicious:
        detection_reasons.append(f"XGBoost classified behaviour as {xgboost_predicted_class}")
        
    return {
        "patient_id": patient_id,
        "diagnosis": patient.primary_diagnosis,
        "fec_score": fec_score,
        "ocsvm_anomaly_score": ocsvm_anomaly_score,
        "ocsvm_is_anomalous": ocsvm_anom,
        "isolation_forest_anomaly_score": isolation_forest_anomaly_score,
        "isolation_forest_is_anomalous": iforest_anom,
        "xgboost_predicted_class": xgboost_predicted_class,
        "xgboost_class_probabilities": class_probabilities,
        "xgboost_suspiciousness_score": xgboost_suspiciousness_score,
        "detection_score": detection_score,
        "detection_status": detection_status,
        "model_agreement": model_agreement,
        "evidence_strength": evidence_strength,
        "detection_reasons": detection_reasons,
        "calculated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
