import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventFEC, EventMLResult

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_stale_response_cannot_overwrite_newer_event(db):
    """
    Simulates rapid API queries for Event A and Event B to ensure responses contain exact matching IDs.
    """
    res1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 2,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    res2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 10,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt1 = res1["event"]["event_id"]
    evt2 = res2["event"]["event_id"]

    data1 = client.get(f"/api/v1/fec/event_ml/{evt1}").json()
    data2 = client.get(f"/api/v1/fec/event_ml/{evt2}").json()

    assert data1["event_id"] == evt1
    assert data2["event_id"] == evt2
    assert data1["event_fec"]["fec_score"] < data2["event_fec"]["fec_score"]

def test_cross_patient_event_rejection(db):
    """
    Verifies that patient P001 event requested for P002 returns patient_id == P001 so UI guards can discard it.
    """
    res_p1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 15
    }).json()

    evt_p1 = res_p1["event"]["event_id"]
    data = client.get(f"/api/v1/fec/event_ml/{evt_p1}").json()

    assert data["patient_id"] == "P001"
    assert data["patient_id"] != "P002"

def test_invalid_localstorage_event(db):
    """
    Verifies that requesting a non-existent or sabotaged event ID returns HTTP 404 error instead of 200 fallback.
    """
    res = client.get("/api/v1/fec/event_ml/EVT-SABOTAGE-99999")
    assert res.status_code == 404

def test_baseline_filter_does_not_select_wrong_attack(db):
    """
    Verifies category filtering endpoint behavior for patient events.
    """
    res = client.get("/api/v1/honeypot/events/patient/P003?category=BASELINE")
    assert res.status_code == 200
    events = res.json()["events"]
    for e in events:
        assert not e["event_id"].startswith("EVT-SIM-")

def test_selected_event_id_matches_requested_event(db):
    """
    Verifies detection pipeline event lookup by exact event_id.
    """
    sim = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 100,
        "request_count": 5
    }).json()
    evt_id = sim["event"]["event_id"]

    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    assert pipe["event_id"] == evt_id

def test_out_of_order_api_responses(db):
    """
    Verifies multiple concurrent requests return their own respective event data.
    """
    e1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "PRIVILEGE_ESCALATION"}).json()["event"]["event_id"]
    e2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "DATA_EXFILTRATION"}).json()["event"]["event_id"]

    r2 = client.get(f"/api/v1/fec/event_ml/{e2}").json()
    r1 = client.get(f"/api/v1/fec/event_ml/{e1}").json()

    assert r2["event_id"] == e2
    assert r1["event_id"] == e1
    assert r2["scenario"] in ["DATA_EXFILTRATION", "Data Exfiltration"]
    assert r1["scenario"] in ["PRIVILEGE_ESCALATION", "Privilege Escalation"]
