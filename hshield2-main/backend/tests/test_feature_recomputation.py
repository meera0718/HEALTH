import sys
import os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import PatientFeature, AuditLog

client = TestClient(app)

def test_feature_recomputation_flow():
    # 1. Fetch initial features for P027 and P015
    res_p27_before = client.get("/api/v1/features/patients/P027")
    assert res_p27_before.status_code == 200
    p27_before = res_p27_before.json()
    
    res_p15_before = client.get("/api/v1/features/patients/P015")
    assert res_p15_before.status_code == 200
    p15_before = res_p15_before.json()
    
    # 2. Simulate one BRUTE_FORCE event for P027
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P027",
        "scenario": "BRUTE_FORCE"
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    sim_event = sim_data["event"]
    event_id = sim_event["event_id"]
    
    # 3. Trigger recomputation for P027
    recomp_res = client.post(f"/api/v1/features/recompute/P027", json={
        "event_id": event_id
    })
    assert recomp_res.status_code == 200
    p27_after = recomp_res.json()
    
    # 4. Assert P027 features changed appropriately
    assert p27_after["total_events"] == p27_before["total_events"] + 1
    assert p27_after["failed_login_count"] == p27_before["failed_login_count"] + 1
    assert p27_after["error_count"] == p27_before["error_count"] + 1
    assert p27_after["anomalous_event_count"] == p27_before["anomalous_event_count"] + 1
    
    # 5. Fetch P015 features after and assert they remained unchanged
    res_p15_after = client.get("/api/v1/features/patients/P015")
    assert res_p15_after.status_code == 200
    p15_after = res_p15_after.json()
    
    # Unchanged features for P015 comparison
    assert p15_before["total_events"] == p15_after["total_events"]
    assert p15_before["failed_login_count"] == p15_after["failed_login_count"]
    assert p15_before["error_count"] == p15_after["error_count"]
    assert p15_before["anomalous_event_count"] == p15_after["anomalous_event_count"]
    
    # 6. Verify AuditLog details
    db = SessionLocal()
    try:
        audit = db.query(AuditLog).filter(
            AuditLog.action == "FEATURE_RECOMPUTATION_SYNTHETIC"
        ).order_by(AuditLog.id.desc()).first()
        
        assert audit is not None
        details = json.loads(audit.details)
        assert details["patient_id"] == "P027"
        assert details["event_id"] == event_id
        assert "feature_recomputation_timestamp" in details
    finally:
        db.close()
