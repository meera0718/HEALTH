import sys
import os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import AuditLog

client = TestClient(app)

def test_detection_recomputation_flow():
    # 1. Fetch initial detection state for P027 and P015
    res_p27_before = client.post("/api/v1/detection/recalculate/P027")
    assert res_p27_before.status_code == 200
    p27_before = res_p27_before.json()
    
    res_p15_before = client.post("/api/v1/detection/recalculate/P015")
    assert res_p15_before.status_code == 200
    p15_before = res_p15_before.json()
    
    # 2. Simulate one BRUTE_FORCE event for P027
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P027",
        "scenario": "BRUTE_FORCE"
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    event_id = sim_data["event"]["event_id"]
    
    # 3. Trigger full pipeline recomputation for P027
    recomp_res = client.post("/api/v1/detection/recalculate/P027")
    assert recomp_res.status_code == 200
    p27_after = recomp_res.json()
    
    # Verify AuditLog created for P027
    db = SessionLocal()
    try:
        audit = db.query(AuditLog).filter(
            AuditLog.action == "DETECTION_RECOMPUTATION_SYNTHETIC"
        ).order_by(AuditLog.id.desc()).first()
        
        assert audit is not None
        details = json.loads(audit.details)
        assert details["patient_id"] == "P027"
        assert event_id in details["event_ids"]
        assert "detection_recomputation_timestamp" in details
    finally:
        db.close()
        
    # 4. Fetch P015 after and assert it remained completely unchanged
    res_p15_after = client.post("/api/v1/detection/recalculate/P015")
    assert res_p15_after.status_code == 200
    p15_after = res_p15_after.json()
    
    # Compare P015 before vs after
    assert p15_before["fec_score"] == p15_after["fec_score"]
    assert p15_before["ocsvm_anomaly_score"] == p15_after["ocsvm_anomaly_score"]
    assert p15_before["isolation_forest_anomaly_score"] == p15_after["isolation_forest_anomaly_score"]
    assert p15_before["xgboost"] == p15_after["xgboost"]
    assert p15_before["detection_score"] == p15_after["detection_score"]
    assert p15_before["detection_status"] == p15_after["detection_status"]
    
    # Compare P027 before vs after
    print("\n==================================================")
    print("P027 BEFORE")
    print("----------------")
    print(f"- FEC: {p27_before['fec_score']}")
    print(f"- OCSVM: {p27_before['ocsvm_anomaly_score']}")
    print(f"- Isolation Forest: {p27_before['isolation_forest_anomaly_score']}")
    print(f"- XGBoost Class: {p27_before['xgboost']['predicted_class']}")
    print(f"- XGBoost Suspiciousness: {p27_before['xgboost']['suspiciousness_score']}")
    print(f"- Detection Score: {p27_before['detection_score']}")
    print(f"- Status: {p27_before['detection_status']}")
    print("==================================================")
    print("P027 AFTER")
    print("----------------")
    print(f"- FEC: {p27_after['fec_score']}")
    print(f"- OCSVM: {p27_after['ocsvm_anomaly_score']}")
    print(f"- Isolation Forest: {p27_after['isolation_forest_anomaly_score']}")
    print(f"- XGBoost Class: {p27_after['xgboost']['predicted_class']}")
    print(f"- XGBoost Suspiciousness: {p27_after['xgboost']['suspiciousness_score']}")
    print(f"- Detection Score: {p27_after['detection_score']}")
    print(f"- Status: {p27_after['detection_status']}")
    print("==================================================")
