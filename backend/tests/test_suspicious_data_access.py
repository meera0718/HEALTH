import sys
import os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_suspicious_data_access_flow():
    # 1. Fetch initial states for P026, P027, P028
    res_p27_before = client.post("/api/v1/detection/recalculate/P027")
    assert res_p27_before.status_code == 200
    p27_before = res_p27_before.json()
    
    res_p26_before = client.post("/api/v1/detection/recalculate/P026")
    assert res_p26_before.status_code == 200
    p26_before = res_p26_before.json()
    
    res_p28_before = client.post("/api/v1/detection/recalculate/P028")
    assert res_p28_before.status_code == 200
    p28_before = res_p28_before.json()
    
    # 2. Fetch P027 features before
    feat_res_before = client.get("/api/v1/features/patients/P027")
    assert feat_res_before.status_code == 200
    feat_before = feat_res_before.json()
    
    # 3. Simulate SUSPICIOUS_DATA_ACCESS event for P027
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P027",
        "scenario": "SUSPICIOUS_DATA_ACCESS"
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data["success"] is True
    event = sim_data["event"]
    assert event["event_type"] == "SUSPICIOUS_DATA_ACCESS"
    assert event["severity"] == "HIGH"
    assert event["synthetic"] is True
    assert event["patient_id"] == "P027"
    
    # 4. Trigger recalculation
    recalc_res = client.post("/api/v1/detection/recalculate/P027")
    assert recalc_res.status_code == 200
    p27_after = recalc_res.json()
    
    # 5. Fetch P027 features after
    feat_res_after = client.get("/api/v1/features/patients/P027")
    assert feat_res_after.status_code == 200
    feat_after = feat_res_after.json()
    
    # Assert features updated correctly (SUSPICIOUS_DATA_ACCESS maps to record_access)
    assert feat_after["record_access_count"] == feat_before["record_access_count"] + 1
    assert feat_after["total_records_accessed"] == feat_before["total_records_accessed"] + 250
    assert feat_after["total_events"] == feat_before["total_events"] + 1
    
    # 6. Fetch P026 and P028 after and assert they remained completely unchanged
    res_p26_after = client.post("/api/v1/detection/recalculate/P026")
    assert res_p26_after.status_code == 200
    p26_after = res_p26_after.json()
    
    res_p28_after = client.post("/api/v1/detection/recalculate/P028")
    assert res_p28_after.status_code == 200
    p28_after = res_p28_after.json()
    
    # Confirm neighbors are completely unaffected
    assert p26_before["fec_score"] == p26_after["fec_score"]
    assert p26_before["detection_score"] == p26_after["detection_score"]
    assert p26_before["detection_status"] == p26_after["detection_status"]
    
    assert p28_before["fec_score"] == p28_after["fec_score"]
    assert p28_before["detection_score"] == p28_after["detection_score"]
    assert p28_before["detection_status"] == p28_after["detection_status"]
    
    # Print comparison
    print("\n==================================================")
    print("P027 SUSPICIOUS_DATA_ACCESS SIMULATION")
    print("--------------------------------------------------")
    print("BEFORE:")
    print(f"- FEC: {p27_before['fec_score']}")
    print(f"- OCSVM Score: {p27_before['ocsvm_anomaly_score']}")
    print(f"- Isolation Forest Score: {p27_before['isolation_forest_anomaly_score']}")
    print(f"- XGBoost Class: {p27_before['xgboost']['predicted_class']}")
    print(f"- XGBoost Suspiciousness: {p27_before['xgboost']['suspiciousness_score']}")
    print(f"- Detection Score: {p27_before['detection_score']}")
    print(f"- Status: {p27_before['detection_status']}")
    print("--------------------------------------------------")
    print("AFTER:")
    print(f"- FEC: {p27_after['fec_score']}")
    print(f"- OCSVM Score: {p27_after['ocsvm_anomaly_score']}")
    print(f"- Isolation Forest Score: {p27_after['isolation_forest_anomaly_score']}")
    print(f"- XGBoost Class: {p27_after['xgboost']['predicted_class']}")
    print(f"- XGBoost Suspiciousness: {p27_after['xgboost']['suspiciousness_score']}")
    print(f"- Detection Score: {p27_after['detection_score']}")
    print(f"- Status: {p27_after['detection_status']}")
    print("==================================================")
