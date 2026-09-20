import sys
import os
import datetime
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventMLResult, EventFusionResult

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_1_four_attacks_produce_correct_event_vectors(db_session):
    """TEST 1: Four attacks produce correct event-specific vectors."""
    scenarios = ["BRUTE_FORCE", "RECONNAISSANCE", "SUSPICIOUS_DATA_ACCESS", "DATA_EXFILTRATION"]
    for sc in scenarios:
        r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": sc}).json()
        eid = r["event"]["event_id"]
        pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
        assert pipe["event_id"] == eid
        assert len(pipe["feature_vector"]) == 11

def test_2_every_event_receives_unique_event_id(db_session):
    """TEST 2: Every event receives a unique event_id."""
    r1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    assert r1["event"]["event_id"] != r2["event"]["event_id"]

def test_3_ocsvm_receives_event_specific_vectors(db_session):
    """TEST 3: OCSVM receives event-specific vectors."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
    assert pipe["ocsvm"]["status"] == "COMPLETE"
    assert "classification" in pipe["ocsvm"]
    assert "score" in pipe["ocsvm"]

def test_4_isolation_forest_receives_event_specific_vectors(db_session):
    """TEST 4: Isolation Forest receives event-specific vectors."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"}).json()
    eid = r["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
    assert pipe["isolation_forest"]["status"] == "COMPLETE"
    assert "classification" in pipe["isolation_forest"]
    assert "score" in pipe["isolation_forest"]

def test_5_xgboost_receives_event_specific_vectors(db_session):
    """TEST 5: XGBoost receives event-specific vectors."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"}).json()
    eid = r["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
    assert pipe["xgboost"]["status"] == "COMPLETE"
    assert "classification" in pipe["xgboost"]
    assert "probability" in pipe["xgboost"]

def test_6_results_persist_by_event_id(db_session):
    """TEST 6: Results persist by event_id."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    ml_rec = db_session.query(EventMLResult).filter(EventMLResult.event_id == eid).first()
    f_rec = db_session.query(EventFusionResult).filter(EventFusionResult.event_id == eid).first()
    assert ml_rec is not None
    assert f_rec is not None
    assert ml_rec.event_id == eid
    assert f_rec.event_id == eid

def test_7_previous_results_cannot_overwrite_new_results(db_session):
    """TEST 7: Previous results cannot overwrite new results."""
    r1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"}).json()

    eid1 = r1["event"]["event_id"]
    eid2 = r2["event"]["event_id"]

    p1 = client.get(f"/api/v1/detection-pipeline/event/{eid1}").json()
    p2 = client.get(f"/api/v1/detection-pipeline/event/{eid2}").json()

    assert p1["event_id"] == eid1
    assert p2["event_id"] == eid2
    assert p1["scenario"] == "Brute Force"
    assert p2["scenario"] == "Reconnaissance"

def test_8_fusion_consumes_current_event_model_results(db_session):
    """TEST 8: Fusion consumes current event model results."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
    assert pipe["fusion"]["event_id"] == eid
    assert pipe["fusion"]["model_agreement"] in ["1/3", "2/3", "3/3"]

def test_9_threat_assessment_consumes_current_event_results(db_session):
    """TEST 9: Threat assessment consumes current event results."""
    r = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    eid = r["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
    assert pipe["threat_assessment"]["event_id"] == eid
    assert 0.0 <= pipe["threat_assessment"]["threat_index"] <= 100.0

def test_10_patient_isolation(db_session):
    """TEST 10: Patient isolation works."""
    r3 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r4 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "DATA_EXFILTRATION"}).json()

    l3 = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    l4 = client.get("/api/v1/detection-pipeline/latest?patient_id=P004").json()

    assert l3["event_id"] == r3["event"]["event_id"]
    assert l4["event_id"] == r4["event"]["event_id"]

def test_11_evt_dev_baseline_events_excluded(db_session):
    """TEST 11: EVT-DEV baseline events are excluded."""
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
    assert not lat.get("event_id", "").startswith("EVT-DEV-")

def test_12_same_attack_twice_produces_independently_persisted_results(db_session):
    """TEST 12: Same attack twice produces independently persisted results."""
    r1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    r2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()

    eid1 = r1["event"]["event_id"]
    eid2 = r2["event"]["event_id"]

    assert eid1 != eid2
    p1 = client.get(f"/api/v1/detection-pipeline/event/{eid1}").json()
    p2 = client.get(f"/api/v1/detection-pipeline/event/{eid2}").json()
    assert p1["event_id"] == eid1
    assert p2["event_id"] == eid2

def test_13_different_attacks_produce_correct_behavioral_differences(db_session):
    """TEST 13: Different attacks produce correct behavioral feature differences."""
    rb = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"}).json()
    rr = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"}).json()
    re = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"}).json()

    pb = client.get(f"/api/v1/detection-pipeline/event/{rb['event']['event_id']}").json()
    pr = client.get(f"/api/v1/detection-pipeline/event/{rr['event']['event_id']}").json()
    pe = client.get(f"/api/v1/detection-pipeline/event/{re['event']['event_id']}").json()

    vb = pb["feature_vector"]
    vr = pr["feature_vector"]
    ve = pe["feature_vector"]

    # Brute Force failed logins (idx 0)
    assert vb[0] == 5
    # Recon unique endpoints (idx 3)
    assert vr[3] == 5
    # Data Exfiltration records accessed (idx 2)
    assert ve[2] == 1000
