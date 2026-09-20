import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventFEC, EventMLResult, EventFusionResult

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_01_brute_force_intensities(db):
    patient_id = "P001"
    logins = [1, 3, 5, 8, 12]
    fec_scores = []
    
    for count in logins:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "BRUTE_FORCE",
            "failed_login_attempts": count,
            "records_accessed": 0,
            "request_count": 1
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]
        
        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    # Monotonicity check
    for i in range(len(fec_scores) - 1):
        assert fec_scores[i] <= fec_scores[i+1]
    assert fec_scores[0] < fec_scores[-1]

def test_02_reconnaissance_intensities(db):
    patient_id = "P002"
    requests = [2, 10, 25]
    fec_scores = []

    for req_cnt in requests:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "RECONNAISSANCE",
            "failed_login_attempts": 0,
            "records_accessed": 0,
            "request_count": req_cnt
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1] < fec_scores[2]

def test_03_suspicious_data_access_intensities(db):
    patient_id = "P003"
    records = [10, 50, 200]
    fec_scores = []

    for rec_cnt in records:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "SUSPICIOUS_DATA_ACCESS",
            "failed_login_attempts": 0,
            "records_accessed": rec_cnt,
            "request_count": 2
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1] < fec_scores[2]

def test_04_data_exfiltration_intensities(db):
    patient_id = "P004"
    records = [50, 250, 1000]
    fec_scores = []

    for rec_cnt in records:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "DATA_EXFILTRATION",
            "failed_login_attempts": 0,
            "records_accessed": rec_cnt,
            "request_count": 5
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1] <= fec_scores[2]

def test_05_privilege_escalation_characteristics(db):
    patient_id = "P005"
    requests = [1, 10]
    fec_scores = []

    for req_cnt in requests:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "PRIVILEGE_ESCALATION",
            "failed_login_attempts": 0,
            "records_accessed": 0,
            "request_count": req_cnt
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1]

def test_06_endpoint_discovery_characteristics(db):
    patient_id = "P006"
    requests = [3, 20]
    fec_scores = []

    for req_cnt in requests:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "ENDPOINT_DISCOVERY",
            "failed_login_attempts": 0,
            "records_accessed": 0,
            "request_count": req_cnt
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1]

def test_07_suspicious_download_characteristics(db):
    patient_id = "P007"
    records = [20, 250]
    fec_scores = []

    for rec_cnt in records:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": patient_id,
            "scenario": "SUSPICIOUS_DOWNLOAD",
            "failed_login_attempts": 0,
            "records_accessed": rec_cnt,
            "request_count": 2
        })
        assert res.status_code == 200
        event_id = res.json()["event"]["event_id"]

        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        fec_scores.append(ml_res["event_fec"]["fec_score"])

    assert fec_scores[0] < fec_scores[1]

def test_08_identical_input_determinism(db):
    payload = {
        "patient_id": "P008",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 4,
        "records_accessed": 0,
        "request_count": 1
    }
    res_a = client.post("/api/v1/honeypot/simulate", json=payload).json()
    res_b = client.post("/api/v1/honeypot/simulate", json=payload).json()

    evt_a = res_a["event"]["event_id"]
    evt_b = res_b["event"]["event_id"]

    assert evt_a != evt_b

    fec_a = client.get(f"/api/v1/fec/event_ml/{evt_a}").json()["event_fec"]["fec_score"]
    fec_b = client.get(f"/api/v1/fec/event_ml/{evt_b}").json()["event_fec"]["fec_score"]

    assert fec_a == fec_b

def test_09_event_id_persistence(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P009",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 30,
        "request_count": 3
    }).json()

    evt_id = res["event"]["event_id"]
    row = db.query(EventFEC).filter(EventFEC.event_id == evt_id).first()

    assert row is not None
    assert row.event_id == evt_id
    assert row.patient_id == "P009"

def test_10_api_db_equality(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P010",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 8
    }).json()

    evt_id = res["event"]["event_id"]

    db_row = db.query(EventFEC).filter(EventFEC.event_id == evt_id).first()
    db_fec = float(db_row.fec_score)

    api_ml = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()
    api_fec = float(api_ml["event_fec"]["fec_score"])

    pipe_res = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    pipe_fec = float(pipe_res["fec"]["fec_score"])

    assert db_fec == api_fec == pipe_fec

def test_11_ui_event_selection_correctness(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P011",
        "scenario": "PRIVILEGE_ESCALATION",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 2
    }).json()

    evt_id = res["event"]["event_id"]

    api_res = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()
    assert api_res["event_id"] == evt_id
    assert api_res["patient_id"] == "P011"

def test_12_cross_patient_isolation(db):
    res1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P012",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    res2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P013",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt1 = res1["event"]["event_id"]
    evt2 = res2["event"]["event_id"]

    data1 = client.get(f"/api/v1/fec/event_ml/{evt1}").json()
    data2 = client.get(f"/api/v1/fec/event_ml/{evt2}").json()

    assert data1["patient_id"] == "P012"
    assert data2["patient_id"] == "P013"
    assert data1["event_id"] != data2["event_id"]

def test_13_cross_event_isolation(db):
    res1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P014",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 10,
        "request_count": 1
    }).json()

    res2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P014",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 500,
        "request_count": 10
    }).json()

    evt1 = res1["event"]["event_id"]
    evt2 = res2["event"]["event_id"]

    fec1 = client.get(f"/api/v1/fec/event_ml/{evt1}").json()["event_fec"]["fec_score"]
    fec2 = client.get(f"/api/v1/fec/event_ml/{evt2}").json()["event_fec"]["fec_score"]

    assert evt1 != evt2
    assert fec1 < fec2

def test_14_rapid_event_isolation(db):
    events = []
    for i in range(10):
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P015",
            "scenario": "RECONNAISSANCE",
            "failed_login_attempts": 0,
            "records_accessed": 0,
            "request_count": i + 1
        }).json()
        events.append(res["event"]["event_id"])

    assert len(set(events)) == 10
    for evt_id in events:
        row = db.query(EventFEC).filter(EventFEC.event_id == evt_id).first()
        assert row is not None

def test_15_no_randomness(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P016",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 3,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt_id = res["event"]["event_id"]

    score1 = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()["event_fec"]["fec_score"]
    score2 = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()["event_fec"]["fec_score"]
    score3 = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()["event_fec"]["fec_score"]

    assert score1 == score2 == score3

def test_16_no_timestamp_or_eventid_scoring(db):
    # Two events with same inputs but different IDs created at different times
    p = {
        "patient_id": "P017",
        "scenario": "SUSPICIOUS_DOWNLOAD",
        "failed_login_attempts": 0,
        "records_accessed": 100,
        "request_count": 2
    }
    r1 = client.post("/api/v1/honeypot/simulate", json=p).json()
    r2 = client.post("/api/v1/honeypot/simulate", json=p).json()

    id1 = r1["event"]["event_id"]
    id2 = r2["event"]["event_id"]

    fec1 = client.get(f"/api/v1/fec/event_ml/{id1}").json()["event_fec"]["fec_score"]
    fec2 = client.get(f"/api/v1/fec/event_ml/{id2}").json()["event_fec"]["fec_score"]

    assert fec1 == fec2

def test_17_no_stale_frontend_state(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P018",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 0,
        "records_accessed": 200,
        "request_count": 5
    }).json()

    evt_id = res["event"]["event_id"]
    data = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()

    assert data["event_fec"]["scope"] == "EVENT"
    assert "baseline_fec" in data["event_fec"]
    assert "event_adjustment" in data["event_fec"]

def test_18_no_patient_baseline_fallback_overwriting(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P019",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 6,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt_id = res["event"]["event_id"]
    data = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()["event_fec"]

    assert data["event_adjustment"] > 0
    assert data["fec_score"] != data["baseline_fec"]

def test_19_legitimate_100_point_saturation(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P020",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 10,
        "records_accessed": 5000,
        "request_count": 50
    }).json()

    evt_id = res["event"]["event_id"]
    data = client.get(f"/api/v1/fec/event_ml/{evt_id}").json()["event_fec"]

    assert data["fec_score"] <= 100.0

def test_20_threat_index_isolation(db):
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P021",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 10
    }).json()

    evt_id = res["event"]["event_id"]
    pipe_res = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()

    assert "fec" in pipe_res
    assert "threat_assessment" in pipe_res
    assert "threat_index" in pipe_res["threat_assessment"]
