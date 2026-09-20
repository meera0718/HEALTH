import datetime
import json
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.db.models import HoneypotSecurityEvent, EventMLResult, EventFusionResult, PatientFEC
from app.security_engine.event_ml_pipeline import process_event_ml_pipeline

def calculate_deterministic_threat_index(
    ocsvm_pred: str,
    ocsvm_score: float,
    iforest_pred: str,
    iforest_score: float,
    xgb_class: str,
    xgb_prob: float
) -> float:
    """
    Calculates a 100% deterministic Threat Index (0.0 to 100.0) from exact model outputs.
    No randomness is used.
    """
    xgb_flagged = (xgb_class != "NORMAL")
    ocsvm_flagged = (ocsvm_pred == "ANOMALOUS")
    iforest_flagged = (iforest_pred == "OUTLIER")

    # 1. XGBoost Component (40 pts max)
    if xgb_flagged:
        xgb_comp = float(xgb_prob) * 40.0
    else:
        xgb_comp = (1.0 - float(xgb_prob)) * 10.0

    # 2. OCSVM Anomaly Component (30 pts max)
    if ocsvm_flagged:
        ocsvm_comp = 20.0 + min(10.0, abs(float(ocsvm_score)))
    else:
        ocsvm_comp = 5.0

    # 3. Isolation Forest Component (30 pts max)
    if iforest_flagged:
        iforest_comp = 20.0 + min(10.0, abs(float(iforest_score)) * 50.0)
    else:
        iforest_comp = 5.0

    raw_index = xgb_comp + ocsvm_comp + iforest_comp
    return float(round(max(0.0, min(100.0, raw_index)), 1))

def process_event_fusion_pipeline(db: Session, event_id: str) -> Dict[str, Any]:
    """
    Processes or retrieves the Fusion Engine and Threat Assessment results for a single Honeypot Security Event ID.
    Authoritative identifier: event_id.
    """
    # 1. Check if EventFusionResult already exists for this event_id
    existing_fusion = db.query(EventFusionResult).filter(
        EventFusionResult.event_id == event_id.strip()
    ).first()

    ml_data = process_event_ml_pipeline(db, event_id.strip())

    print(f"[HEALTHX] Honeypot event created: event_id={event_id.strip()} patient_id={ml_data['patient_id']}")
    print(f"[HEALTHX] Feature processing: event_id={event_id.strip()}")
    print(f"[HEALTHX] FEC processing: event_id={event_id.strip()}")
    print(f"[HEALTHX] ML processing: event_id={event_id.strip()}")

    ocsvm_pred = ml_data["ocsvm"]["prediction"]
    ocsvm_score = ml_data["ocsvm"]["score"]
    iforest_pred = ml_data["isolation_forest"]["prediction"]
    iforest_score = ml_data["isolation_forest"]["score"]
    xgb_class = ml_data["xgboost"]["classification"]
    xgb_prob = ml_data["xgboost"]["probability"]

    # Calculate Model Agreement dynamically
    ocsvm_flagged = 1 if ocsvm_pred == "ANOMALOUS" else 0
    iforest_flagged = 1 if iforest_pred == "OUTLIER" else 0
    xgb_flagged = 1 if xgb_class != "NORMAL" else 0
    agreement_count = ocsvm_flagged + iforest_flagged + xgb_flagged
    agreement_ratio = f"{agreement_count}/3"
    fusion_res_type = "THREAT" if agreement_count >= 2 else "BENIGN"

    # Calculate Deterministic Threat Index
    threat_idx = calculate_deterministic_threat_index(
        ocsvm_pred, ocsvm_score,
        iforest_pred, iforest_score,
        xgb_class, xgb_prob
    )

    print(f"[HEALTHX] THREAT_INDEX_INPUTS: event_id={event_id.strip()} ocsvm={ocsvm_pred} (score={ocsvm_score}) iforest={iforest_pred} (score={iforest_score}) xgb={xgb_class} (prob={xgb_prob}) agreement={agreement_ratio} -> threat_index={threat_idx}")

    # Evidence Strength
    if agreement_count == 3 or (agreement_count == 2 and xgb_prob >= 0.8):
        evidence_str = "HIGH"
    elif agreement_count == 2:
        evidence_str = "MEDIUM"
    else:
        evidence_str = "LOW"

    # Threat Assessment Rating
    if threat_idx >= 85.0 and evidence_str == "HIGH":
        assessment_rating = "CRITICAL RISK"
    elif threat_idx >= 65.0:
        assessment_rating = "HIGH RISK"
    elif threat_idx >= 35.0:
        assessment_rating = "SUSPICIOUS"
    elif threat_idx >= 15.0:
        assessment_rating = "LOW RISK"
    else:
        assessment_rating = "NORMAL"

    if not existing_fusion:
        existing_fusion = EventFusionResult(
            event_id=event_id.strip(),
            patient_id=ml_data["patient_id"],
            scenario=ml_data["scenario"],
            event_type=ml_data["event_type"],
            timestamp=ml_data["timestamp"],
            endpoint=ml_data["endpoint"],
            model_agreement_count=agreement_count,
            model_agreement_ratio=agreement_ratio,
            fusion_result=fusion_res_type,
            threat_index=threat_idx,
            evidence_strength=evidence_str,
            assessment=assessment_rating,
            created_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(existing_fusion)
        db.commit()
        db.refresh(existing_fusion)

    from app.security_engine.fec_engine import calculate_event_fec
    evt_fec_rec = calculate_event_fec(event_id.strip(), db)
    event_fec_score = float(evt_fec_rec.fec_score)
    baseline_fec_score = float(evt_fec_rec.baseline_fec)
    event_adjustment_val = float(evt_fec_rec.event_adjustment)

    pipeline_output = {
        "event_id": event_id.strip(),
        "patient_id": ml_data["patient_id"],
        "scenario": ml_data["scenario"],
        "event_type": ml_data["event_type"],
        "severity": ml_data["severity"],
        "timestamp": ml_data["timestamp"],
        "endpoint": ml_data["endpoint"],
        "feature_vector": ml_data["feature_vector"],

        # Explicit Pipeline Stage Objects matching Single Data Contract Requirements
        "honeypot": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "patient_id": ml_data["patient_id"],
            "scenario": ml_data["scenario"],
            "event_type": ml_data["event_type"],
            "endpoint": ml_data["endpoint"]
        },
        "feature_engine": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "feature_vector": ml_data["feature_vector"]
        },
        "fec": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "fec_score": event_fec_score,
            "baseline_fec": baseline_fec_score,
            "event_adjustment": event_adjustment_val,
            "scope": "EVENT"
        },
        "ocsvm": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "classification": ocsvm_pred,
            "prediction": ocsvm_pred,
            "score": ocsvm_score
        },
        "isolation_forest": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "classification": iforest_pred,
            "prediction": iforest_pred,
            "score": iforest_score
        },
        "xgboost": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "classification": xgb_class,
            "probability": xgb_prob
        },
        "fusion": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "result": fusion_res_type,
            "fusion_result": fusion_res_type,
            "model_agreement": agreement_ratio,
            "model_agreement_details": {
                "count": agreement_count,
                "ratio": agreement_ratio,
                "anomaly_detectors": "AGREE" if (ocsvm_flagged == iforest_flagged) else "DISAGREE"
            },
            "threat_index": threat_idx,
            "evidence_strength": evidence_str
        },
        "threat_assessment": {
            "status": "COMPLETE",
            "event_id": event_id.strip(),
            "detection_id": event_id.strip(),
            "patient_id": ml_data["patient_id"],
            "scenario": ml_data["scenario"],
            "threat_index": threat_idx,
            "evidence_strength": evidence_str,
            "assessment": assessment_rating
        },

        # Backward compatibility aliases for E2E testing and legacy consumers
        "detection_id": event_id.strip(),
        "started_at": ml_data["timestamp"],
        "stage_details": {
            "Honeypot Event": {
                "event_id": event_id.strip(),
                "event_type": ml_data["event_type"],
                "severity": ml_data["severity"],
                "endpoint": ml_data["endpoint"],
                "timestamp": ml_data["timestamp"]
            },
            "Feature Engine": {
                "features": ml_data["feature_vector"]
            },
            "FEC Engine": {
                "fec_score": event_fec_score,
                "baseline_fec": baseline_fec_score,
                "event_adjustment": event_adjustment_val
            },
            "One-Class SVM": {
                "ocsvm_decision": ocsvm_pred,
                "ocsvm_anomaly_score": ocsvm_score
            },
            "Isolation Forest": {
                "isolation_forest_decision": iforest_pred,
                "isolation_forest_anomaly_score": iforest_score
            },
            "XGBoost": {
                "predicted_class": xgb_class,
                "probability": xgb_prob
            },
            "Fusion Engine": {
                "model_agreement": agreement_ratio,
                "fusion_result": fusion_res_type,
                "threat_index": threat_idx
            },
            "Threat Assessment": {
                "assessment": assessment_rating,
                "threat_index": threat_idx
            }
        }
    }

    # Centralized Intelligence Layer (Foundation): Additive synthesis
    try:
        from app.security_engine.intelligence_layer import build_intelligence_context
        pipeline_output["intelligence"] = build_intelligence_context(db, event_id.strip(), pipeline_output)
    except Exception as e:
        print(f"[WARNING] Intelligence layer derivation error for {event_id}: {e}")
        pipeline_output["intelligence"] = {
            "incident_context": {
                "event_id": event_id.strip(),
                "device_id": "UNKNOWN",
                "device_type": "Medical IoT Device",
                "hospital_zone": "ZONE-WARD",
                "scenario": ml_data.get("scenario", "UNKNOWN"),
                "event_type": ml_data.get("event_type", "SECURITY_EVENT"),
                "severity": ml_data.get("severity", "HIGH"),
                "timestamp": ml_data.get("timestamp", "")
            },
            "threat_context": {
                "fusion_result": fusion_res_type,
                "threat_index": threat_idx,
                "model_agreement": agreement_ratio,
                "evidence_strength": evidence_str,
                "fec_score": event_fec_score
            },
            "patient_impact": {
                "impact_score": 25.0,
                "impact_level": "LOW",
                "device_criticality": "UNKNOWN",
                "service_criticality": "UNKNOWN",
                "patient_dependency": "UNAVAILABLE",
                "operational_disruption": "LOW",
                "rationale": [
                    "Assessment Scope: Conservative fallback evaluation applied.",
                    "Clinical Preservation Notice: Restrict or isolate suspicious network communication while preserving clinical operation where appropriate."
                ],
                "confidence": evidence_str
            },
            "status": "READY"
        }

    return pipeline_output
