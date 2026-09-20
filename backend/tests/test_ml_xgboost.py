import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_xgboost_status():
    res = client.get("/api/v1/ml/xgboost/status")
    assert res.status_code == 200
    data = res.json()
    assert data["model_loaded"] is True
    assert data["model_version"] == "xgboost_v1"
    assert data["feature_count"] == 15
    assert len(data["classes"]) == 6

def test_xgboost_predict_p001():
    res = client.post("/api/v1/ml/xgboost/predict", json={"patient_id": "P001"})
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "P001"
    assert data["model_version"] == "xgboost_v1"
    assert "predicted_class" in data
    assert "confidence" in data
    assert 0.0 <= data["confidence"] <= 100.0
    assert "class_probabilities" in data
    
    print(f"\nPrediction for P001: Class={data['predicted_class']}, Confidence={data['confidence']}, Probabilities={data['class_probabilities']}")

def test_xgboost_predict_all_required_patients():
    required_pids = ["P001", "P015", "P027", "P030"]
    for pid in required_pids:
        res = client.post("/api/v1/ml/xgboost/predict", json={"patient_id": pid})
        assert res.status_code == 200
        data = res.json()
        assert data["patient_id"] == pid
        assert data["model_version"] == "xgboost_v1"
        assert "predicted_class" in data
        assert "confidence" in data
        assert "class_probabilities" in data
        
        print(f"Patient ID: {pid:<5} | Predicted Behaviour: {data['predicted_class']:<25} | Confidence: {data['confidence']}% | Class Probs: {data['class_probabilities']}")

def test_xgboost_predict_invalid():
    res = client.post("/api/v1/ml/xgboost/predict", json={"patient_id": "INVALID_ID"})
    assert res.status_code == 404
