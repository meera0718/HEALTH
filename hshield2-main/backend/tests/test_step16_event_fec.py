import pytest
import uuid
import datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db.database import get_db
from app.db.models import HoneypotSecurityEvent, Patient, PatientFEC, EventFEC
from app.security_engine.fec_engine import calculate_event_fec
from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline

client = TestClient(app)

def test_event_fec_persistence_and_determinism():
    """
    Verifies that calculate_event_fec calculates and persists event_fec record cleanly and deterministically.
    """
    response = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5
    })
    assert response.status_code == 200
    event_id = response.json()["event"]["event_id"]

    res_pipe = client.get(f"/api/v1/detection-pipeline/event/{event_id}")
    assert res_pipe.status_code == 200
    fec_data = res_pipe.json()["fec"]

    assert fec_data["event_id"] == event_id
    assert fec_data["scope"] == "EVENT"
    assert "fec_score" in fec_data
    assert "baseline_fec" in fec_data
    assert "event_adjustment" in fec_data

    # Re-fetch same event_id
    res_pipe_2 = client.get(f"/api/v1/detection-pipeline/event/{event_id}")
    assert res_pipe_2.status_code == 200
    assert res_pipe_2.json()["fec"]["fec_score"] == fec_data["fec_score"]

def test_event_fec_different_intensities_same_patient():
    """
    Verifies that launching Brute Force events with different intensities for the SAME patient (P003)
    produces different Event FEC scores corresponding to their security characteristics.
    """
    event_scores = {}
    for intensity in [1, 3, 5, 8, 12]:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": "BRUTE_FORCE",
            "failed_login_attempts": intensity
        })
        assert res.status_code == 200
        eid = res.json()["event"]["event_id"]

        pipe_res = client.get(f"/api/v1/detection-pipeline/event/{eid}")
        assert pipe_res.status_code == 200
        event_scores[intensity] = pipe_res.json()["fec"]["fec_score"]

    # Higher failed login intensity must produce monotonically higher or equal event FEC scores
    assert event_scores[1] < event_scores[3]
    assert event_scores[3] < event_scores[5]
    assert event_scores[5] < event_scores[8]
    assert event_scores[8] <= event_scores[12]

def test_identical_input_determinism():
    """
    Verifies that two separate events with identical normalized security characteristics
    for the same patient produce identical Event FEC scores.
    """
    res1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5
    })
    res2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5
    })
    eid1 = res1.json()["event"]["event_id"]
    eid2 = res2.json()["event"]["event_id"]
    assert eid1 != eid2

    fec1 = client.get(f"/api/v1/detection-pipeline/event/{eid1}").json()["fec"]["fec_score"]
    fec2 = client.get(f"/api/v1/detection-pipeline/event/{eid2}").json()["fec"]["fec_score"]

    assert fec1 == fec2

def test_patient_isolation():
    """
    Verifies that event FEC calculations correctly isolate patient baselines (P003 vs P004 vs P005).
    """
    res_p3 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE", "failed_login_attempts": 5})
    res_p4 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P004", "scenario": "BRUTE_FORCE", "failed_login_attempts": 5})
    res_p5 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P005", "scenario": "BRUTE_FORCE", "failed_login_attempts": 5})

    fec_p3 = client.get(f"/api/v1/detection-pipeline/event/{res_p3.json()['event']['event_id']}").json()["fec"]
    fec_p4 = client.get(f"/api/v1/detection-pipeline/event/{res_p4.json()['event']['event_id']}").json()["fec"]
    fec_p5 = client.get(f"/api/v1/detection-pipeline/event/{res_p5.json()['event']['event_id']}").json()["fec"]

    # Baseline FECs must match patient baselines
    assert fec_p3["baseline_fec"] != fec_p4["baseline_fec"]
    assert fec_p4["baseline_fec"] != fec_p5["baseline_fec"]

def test_fec_route_event_endpoint():
    """
    Verifies that GET /api/v1/fec/event/{event_id} returns detailed EventFEC fields.
    """
    res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    eid = res.json()["event"]["event_id"]

    res_detail = client.get(f"/api/v1/fec/event/{eid}")
    assert res_detail.status_code == 200
    data = res_detail.json()

    assert data["event_id"] == eid
    assert data["patient_id"] == "P003"
    assert "fec_score" in data
    assert "baseline_fec" in data
    assert "event_adjustment" in data
    assert data["scope"] == "EVENT"
