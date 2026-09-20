import sys
import os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_ml_inference_flow():
    # 1. Fetch initial predictions for P027 (BEFORE simulation)
    res_before = client.post("/api/v1/ml/inference/P027")
    assert res_before.status_code == 200
    pred_before = res_before.json()
    
    # 2. Simulate one BRUTE_FORCE event for P027
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P027",
        "scenario": "BRUTE_FORCE"
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    event_id = sim_data["event"]["event_id"]
    
    # 3. Trigger recomputation of features
    recomp_res = client.post("/api/v1/features/recompute/P027", json={
        "event_id": event_id
    })
    assert recomp_res.status_code == 200
    
    # 4. Fetch predictions for P027 AFTER simulation
    res_after = client.post("/api/v1/ml/inference/P027")
    assert res_after.status_code == 200
    pred_after = res_after.json()
    
    # 5. Log comparison output and check whether results changed
    ocsvm_change = "CHANGED" if (pred_before["ocsvm"] != pred_after["ocsvm"]) else "UNCHANGED"
    iforest_change = "CHANGED" if (pred_before["isolation_forest"] != pred_after["isolation_forest"]) else "UNCHANGED"
    xgb_change = "CHANGED" if (pred_before["xgboost"] != pred_after["xgboost"]) else "UNCHANGED"
    
    print("\n==================================================")
    print("P027 BEFORE")
    print("----------------")
    print(f"OCSVM: {pred_before['ocsvm']}")
    print(f"Isolation Forest: {pred_before['isolation_forest']}")
    print(f"XGBoost Class: {pred_before['xgboost']['predicted_class']}")
    print(f"XGBoost Probabilities: {pred_before['xgboost']['probabilities']}")
    print("==================================================")
    print("P027 AFTER")
    print("----------------")
    print(f"OCSVM: {pred_after['ocsvm']} ({ocsvm_change})")
    print(f"Isolation Forest: {pred_after['isolation_forest']} ({iforest_change})")
    print(f"XGBoost Class: {pred_after['xgboost']['predicted_class']} ({xgb_change})")
    print(f"XGBoost Probabilities: {pred_after['xgboost']['probabilities']}")
    print("==================================================")
    
    # Verify response schema fields
    for field in ["patient_id", "ocsvm", "isolation_forest", "xgboost", "ocsvm_version", "isolation_forest_version", "xgboost_version"]:
        assert field in pred_after
        
    assert pred_after["patient_id"] == "P027"
    assert "anomalous" in pred_after["ocsvm"]
    assert "score" in pred_after["ocsvm"]
    assert "anomalous" in pred_after["isolation_forest"]
    assert "score" in pred_after["isolation_forest"]
    assert "predicted_class" in pred_after["xgboost"]
    assert "probabilities" in pred_after["xgboost"]
