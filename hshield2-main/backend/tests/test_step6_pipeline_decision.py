import sys
import os
import datetime
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import json
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventMLResult, EventFusionResult, PatientFeature, PatientFEC

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_1_p003_brute_force_pipeline(db_session):
    """TEST 1: P003 BRUTE_FORCE end-to-end trace."""
    resp = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    assert resp.status_code == 200
    data = resp.json()
    evt_id = data["event"]["event_id"]
    assert evt_id.startswith("EVT-SIM-")

    pipe_resp = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_resp.status_code == 200
    pipe_data = pipe_resp.json()

    assert pipe_data["event_id"] == evt_id
    assert pipe_data["patient_id"] == "P003"
    assert pipe_data["scenario"] == "Brute Force"
    assert pipe_data["honeypot"]["status"] == "COMPLETE"
    assert pipe_data["feature_engine"]["status"] == "COMPLETE"
    assert pipe_data["fec"]["status"] == "COMPLETE"
    assert pipe_data["ocsvm"]["status"] == "COMPLETE"
    assert pipe_data["isolation_forest"]["status"] == "COMPLETE"
    assert pipe_data["xgboost"]["status"] == "COMPLETE"
    assert pipe_data["fusion"]["status"] == "COMPLETE"
    assert pipe_data["threat_assessment"]["status"] == "COMPLETE"

def test_2_p003_reconnaissance_pipeline(db_session):
    """TEST 2: P003 RECONNAISSANCE end-to-end trace."""
    resp = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"})
    assert resp.status_code == 200
    data = resp.json()
    evt_id = data["event"]["event_id"]

    pipe_resp = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_resp.status_code == 200
    pipe_data = pipe_resp.json()

    assert pipe_data["event_id"] == evt_id
    assert pipe_data["scenario"] == "Reconnaissance"

def test_3_p003_suspicious_data_access_pipeline(db_session):
    """TEST 3: P003 SUSPICIOUS_DATA_ACCESS end-to-end trace."""
    resp = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "SUSPICIOUS_DATA_ACCESS"})
    assert resp.status_code == 200
    data = resp.json()
    evt_id = data["event"]["event_id"]

    pipe_resp = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_resp.status_code == 200
    pipe_data = pipe_resp.json()

    assert pipe_data["event_id"] == evt_id
    assert pipe_data["scenario"] == "Suspicious Data Access"

def test_4_p003_data_exfiltration_pipeline(db_session):
    """TEST 4: P003 DATA_EXFILTRATION end-to-end trace."""
    resp = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    assert resp.status_code == 200
    data = resp.json()
    evt_id = data["event"]["event_id"]

    pipe_resp = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_resp.status_code == 200
    pipe_data = pipe_resp.json()

    assert pipe_data["event_id"] == evt_id
    assert pipe_data["scenario"] == "Data Exfiltration"

def test_5_p004_data_exfiltration_pipeline(db_session):
    """TEST 5: P004 DATA_EXFILTRATION end-to-end trace."""
    resp = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "DATA_EXFILTRATION"})
    assert resp.status_code == 200
    data = resp.json()
    evt_id = data["event"]["event_id"]

    pipe_resp = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_resp.status_code == 200
    pipe_data = pipe_resp.json()

    assert pipe_data["event_id"] == evt_id
    assert pipe_data["patient_id"] == "P004"

def test_6_verify_event_ids_differ(db_session):
    """TEST 6: Verify event IDs differ between runs."""
    r1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    assert r1["event"]["event_id"] != r2["event"]["event_id"]

def test_7_verify_feature_vectors_differ_by_behavior(db_session):
    """TEST 7: Verify feature vectors differ according to attack behavior."""
    r_brute = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r_recon = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"}).json()
    r_exfil = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"}).json()

    p_brute = client.get(f"/api/v1/detection-pipeline/event/{r_brute['event']['event_id']}").json()
    p_recon = client.get(f"/api/v1/detection-pipeline/event/{r_recon['event']['event_id']}").json()
    p_exfil = client.get(f"/api/v1/detection-pipeline/event/{r_exfil['event']['event_id']}").json()

    vec_brute = p_brute["feature_vector"]
    vec_recon = p_recon["feature_vector"]
    vec_exfil = p_exfil["feature_vector"]

    # Brute force failed logins (idx 0)
    assert vec_brute[0] > 0
    # Recon unique endpoints / enumeration (idx 3)
    assert vec_recon[3] >= 5
    # Data exfiltration records accessed / export (idx 2)
    assert vec_exfil[2] >= 500

def test_8_verify_ml_results_stored_per_event_id(db_session):
    """TEST 8: Verify ML results are stored per event_id."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    ml_row = db_session.query(EventMLResult).filter(EventMLResult.event_id == eid).first()
    assert ml_row is not None
    assert ml_row.event_id == eid
    assert ml_row.ocsvm_prediction in ["ANOMALOUS", "NORMAL"]
    assert ml_row.isolation_forest_prediction in ["OUTLIER", "NORMAL"]

def test_9_verify_fusion_results_stored_per_event_id(db_session):
    """TEST 9: Verify fusion results are stored per event_id."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    f_row = db_session.query(EventFusionResult).filter(EventFusionResult.event_id == eid).first()
    assert f_row is not None
    assert f_row.event_id == eid
    assert f_row.fusion_result in ["THREAT", "BENIGN"]

def test_10_verify_threat_assessment_stored_per_event_id(db_session):
    """TEST 10: Verify threat assessment is stored per event_id."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    f_row = db_session.query(EventFusionResult).filter(EventFusionResult.event_id == eid).first()
    assert f_row.threat_index >= 0.0
    assert f_row.evidence_strength in ["HIGH", "MEDIUM", "LOW"]

def test_11_verify_patient_isolation(db_session):
    """TEST 11: Verify P003 and P004 isolation."""
    r3 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r4 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "DATA_EXFILTRATION"}).json()

    lat3 = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    lat4 = client.get("/api/v1/detection-pipeline/latest?patient_id=P004").json()

    assert lat3["event_id"] == r3["event"]["event_id"]
    assert lat4["event_id"] == r4["event"]["event_id"]
    assert lat3["event_id"] != lat4["event_id"]

import uuid

def test_12_verify_baseline_telemetry_exclusion(db_session):
    """TEST 12: Verify EVT-DEV-* baseline telemetry cannot enter ML detection pipeline."""
    dev_id = f"EVT-DEV-{uuid.uuid4().hex[:8].upper()}"
    dev_evt = HoneypotSecurityEvent(
        event_id=dev_id,
        patient_id="P003",
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
        event_type="API_REQUEST",
        severity="LOW",
        source="INTERNAL",
        endpoint="/api/v1/baseline",
        session_id="SESS-DEV",
        device_id="DEV-001",
        is_anomalous_baseline=False,
        synthetic=True
    )
    db_session.add(dev_evt)
    db_session.commit()

    lat = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    latest_eid = lat.get("event_id", "")
    assert not latest_eid.startswith("EVT-DEV-")

def test_13_verify_second_attack_does_not_reuse_first_attack_results(db_session):
    """TEST 13: Verify a second attack does not reuse the first attack's ML results."""
    r1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"}).json()

    eid1 = r1["event"]["event_id"]
    eid2 = r2["event"]["event_id"]

    p1 = client.get(f"/api/v1/detection-pipeline/event/{eid1}").json()
    p2 = client.get(f"/api/v1/detection-pipeline/event/{eid2}").json()

    assert p1["event_id"] != p2["event_id"]
    assert p1["scenario"] == "Brute Force"
    assert p2["scenario"] == "Reconnaissance"
    assert p1["feature_vector"] != p2["feature_vector"]
