import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_iforest_status():
    res = client.get("/api/v1/ml/isolation-forest/status")
    assert res.status_code == 200
    data = res.json()
    assert data["model_loaded"] is True
    assert data["model_version"] == "isolation_forest_v1"
    assert data["feature_count"] == 15

def test_iforest_predict_p001():
    res = client.post("/api/v1/ml/isolation-forest/predict", json={"patient_id": "P001"})
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "P001"
    assert data["model_version"] == "isolation_forest_v1"
    assert "isolation_forest_decision" in data
    assert "isolation_forest_anomaly_score" in data
    assert 0.0 <= data["isolation_forest_anomaly_score"] <= 100.0
    assert "is_anomalous" in data
    
    print(f"\nPrediction for P001: Decision={data['isolation_forest_decision']}, Score={data['isolation_forest_anomaly_score']}, Anomalous={data['is_anomalous']}")

def test_iforest_predict_all_required_patients():
    required_pids = ["P001", "P015", "P027", "P030"]
    for pid in required_pids:
        res = client.post("/api/v1/ml/isolation-forest/predict", json={"patient_id": pid})
        assert res.status_code == 200
        data = res.json()
        assert data["patient_id"] == pid
        assert data["model_version"] == "isolation_forest_v1"
        assert data["isolation_forest_decision"] in ["Normal", "Anomalous"]
        assert 0.0 <= data["isolation_forest_anomaly_score"] <= 100.0
        
        print(f"Patient ID: {pid:<5} | Isolation Forest Decision: {data['isolation_forest_decision']:<10} | Anomaly Score: {data['isolation_forest_anomaly_score']:<5} | Status: {'Anomalous' if data['is_anomalous'] else 'Normal'}")

def test_iforest_predict_invalid():
    res = client.post("/api/v1/ml/isolation-forest/predict", json={"patient_id": "INVALID_ID"})
    assert res.status_code == 404
