import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_all_patients_detection():
    res = client.get("/api/v1/detection/patients")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 30
    
    # Assert schema for all records
    required_keys = {
        "patient_id", "fec_score", "ocsvm_anomaly_score", "isolation_forest_anomaly_score",
        "xgboost_predicted_class", "xgboost_class_probabilities", "xgboost_suspiciousness_score",
        "detection_score", "detection_status", "model_agreement", "evidence_strength",
        "detection_reasons", "calculated_at"
    }
    
    for r in data:
        assert required_keys.issubset(r.keys())
        assert 0.0 <= r["detection_score"] <= 100.0
        assert r["detection_status"] in ["NORMAL", "LOW CONCERN", "HIGH CONCERN", "CRITICAL"]
        assert r["model_agreement"]["anomaly_detectors"] in ["AGREE", "DISAGREE"]
        assert r["model_agreement"]["count"] in [1, 2]
        assert r["evidence_strength"] in ["LOW", "MODERATE", "STRONG"]
        assert isinstance(r["detection_reasons"], list)

def test_individual_patient_cases():
    test_pids = ["P001", "P015", "P027", "P030"]
    for pid in test_pids:
        res = client.get(f"/api/v1/detection/patients/{pid}")
        assert res.status_code == 200
        data = res.json()
        assert data["patient_id"] == pid
        
        # Output summary in logs
        print(f"\nPatient: {pid:<5} | Score: {data['detection_score']:<5} | Status: {data['detection_status']:<15} | XGBoost: {data['xgboost_predicted_class']:<22} | Agreement: {data['model_agreement']['anomaly_detectors']:<8} (count: {data['model_agreement']['count']}) | Strength: {data['evidence_strength']:<8}")
        print(f"  Reasons: {data['detection_reasons']}")

def test_invalid_patient_detection():
    res = client.get("/api/v1/detection/patients/INVALID_ID")
    assert res.status_code == 404
