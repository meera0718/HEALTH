import pytest
import sqlite3
import os
import json
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventFEC, PatientFEC
from app.security_engine.fec_engine import calculate_event_fec
from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_1_different_failed_login_counts_produce_different_fec(db):
    """Test 1: Different failed login counts produce different Event FEC scores."""
    intensities = [1, 3, 5, 8, 12]
    event_fec_scores = []
    
    for count in intensities:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": "BRUTE_FORCE",
            "failed_login_attempts": count
        })
        assert res.status_code == 200
        data = res.json()
        eid = data["event"]["event_id"]
        
        db.expire_all()
        evt_fec = calculate_event_fec(eid, db)
        event_fec_scores.append(float(evt_fec.fec_score))
        
    assert len(set(event_fec_scores)) == len(intensities), f"Expected 5 distinct scores, got: {event_fec_scores}"
    assert sorted(event_fec_scores) == event_fec_scores, f"Scores must be strictly increasing: {event_fec_scores}"

def test_2_different_request_rates_produce_different_fec(db):
    """Test 2: Different request rates produce different Event FEC scores."""
    rates = [1, 5, 10, 20]
    scores = []
    
    for r in rates:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": "RECONNAISSANCE",
            "request_count": r
        })
        assert res.status_code == 200
        eid = res.json()["event"]["event_id"]
        db.expire_all()
        evt_fec = calculate_event_fec(eid, db)
        scores.append(float(evt_fec.fec_score))
        
    assert len(set(scores)) == len(rates), f"Expected distinct FEC scores for request rates, got {scores}"

def test_3_different_data_exposure_produces_different_fec(db):
    """Test 3: Different data exposure counts produce different Event FEC scores."""
    record_counts = [10, 50, 150, 300]
    scores = []
    
    for cnt in record_counts:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": "DATA_EXFILTRATION",
            "records_accessed": cnt
        })
        assert res.status_code == 200
        eid = res.json()["event"]["event_id"]
        db.expire_all()
        evt_fec = calculate_event_fec(eid, db)
        scores.append(float(evt_fec.fec_score))
        
    assert len(set(scores)) == len(record_counts), f"Expected distinct FEC scores for data exposure, got {scores}"

def test_4_identical_normalized_inputs_produce_identical_fec(db):
    """Test 4: Identical normalized event inputs produce identical Event FEC (100% deterministic)."""
    payload = {
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 5,
        "request_count": 1,
        "records_accessed": 0
    }
    
    res1 = client.post("/api/v1/honeypot/simulate", json=payload)
    res2 = client.post("/api/v1/honeypot/simulate", json=payload)
    
    eid1 = res1.json()["event"]["event_id"]
    eid2 = res2.json()["event"]["event_id"]
    
    assert eid1 != eid2
    db.expire_all()
    fec1 = calculate_event_fec(eid1, db)
    fec2 = calculate_event_fec(eid2, db)
    
    assert float(fec1.fec_score) == float(fec2.fec_score), "Identical security inputs must produce identical FEC score"
    assert float(fec1.event_adjustment) == float(fec2.event_adjustment)

def test_5_different_patients_use_different_baselines(db):
    """Test 5: Different patients use their respective patient baseline FECs."""
    pats = ["P003", "P004", "P005"]
    fec_results = {}
    
    for pid in pats:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": pid,
            "scenario": "BRUTE_FORCE",
            "failed_login_attempts": 5
        })
        assert res.status_code == 200
        eid = res.json()["event"]["event_id"]
        db.expire_all()
        evt_fec = calculate_event_fec(eid, db)
        patient_baseline = db.query(PatientFEC).filter(PatientFEC.patient_id == pid).first()
        fec_results[pid] = {
            "baseline": float(patient_baseline.fec_score),
            "event_fec": float(evt_fec.fec_score),
            "adjustment": float(evt_fec.event_adjustment)
        }
        
    assert fec_results["P003"]["baseline"] != fec_results["P005"]["baseline"]
    assert fec_results["P003"]["event_fec"] != fec_results["P005"]["event_fec"]

def test_6_event_fec_persisted_by_event_id(db):
    """Test 6: Event FEC is persisted in event_fec table keyed by event_id."""
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 7
    })
    eid = res.json()["event"]["event_id"]
    db.expire_all()
    calculate_event_fec(eid, db)
    
    record = db.query(EventFEC).filter(EventFEC.event_id == eid).first()
    assert record is not None
    assert record.event_id == eid
    assert record.patient_id == "P003"
    assert record.failed_login_component == 7.0

def test_7_api_event_fec_equals_database_event_fec(db):
    """Test 7: API event FEC equals database event FEC 100%."""
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 4
    })
    eid = res.json()["event"]["event_id"]
    db.expire_all()
    
    api_res = client.get(f"/api/v1/detection-pipeline/event/{eid}")
    assert api_res.status_code == 200
    api_fec = api_res.json()["fec"]
    
    db_fec = db.query(EventFEC).filter(EventFEC.event_id == eid).first()
    assert api_fec["fec_score"] == float(db_fec.fec_score)
    assert api_fec["baseline_fec"] == float(db_fec.baseline_fec)
    assert api_fec["event_adjustment"] == float(db_fec.event_adjustment)

def test_8_no_patient_fec_fallback_overwrites_event_fec(db):
    """Test 8: No PatientFEC fallback overwrites EventFEC."""
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 10
    })
    eid = res.json()["event"]["event_id"]
    
    api_res = client.get(f"/api/v1/detection-pipeline/event/{eid}")
    data = api_res.json()
    assert data["fec"]["scope"] == "EVENT"
    assert data["fec"]["event_adjustment"] > 0
    assert data["fec"]["fec_score"] > data["fec"]["baseline_fec"]

def test_9_scrambled_event_queries_return_correct_fec(db):
    """Test 9: Scrambled event queries return correct FEC without state leakage."""
    events = []
    for count in [1, 3, 5, 8, 12]:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": "BRUTE_FORCE",
            "failed_login_attempts": count
        })
        events.append((res.json()["event"]["event_id"], count))
        
    scrambled = [events[4], events[0], events[3], events[1], events[2], events[0], events[4]]
    
    for eid, count in scrambled:
        api_res = client.get(f"/api/v1/detection-pipeline/event/{eid}")
        assert api_res.status_code == 200
        fec_score = api_res.json()["fec"]["fec_score"]
        expected_adjustment = min(20.0, float(count) * 1.0) + 2.0
        patient_baseline = float(db.query(PatientFEC).filter(PatientFEC.patient_id == "P003").first().fec_score)
        expected_fec = round(patient_baseline + expected_adjustment, 1)
        assert fec_score == expected_fec, f"Event {eid} (logins={count}) returned {fec_score}, expected {expected_fec}"

def test_10_no_randomness_or_event_id_based_scoring(db):
    """Test 10: Verify no randomness or event-id hashing exists in FEC engine."""
    res1 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE", "failed_login_attempts": 5})
    res2 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE", "failed_login_attempts": 5})
    
    eid1 = res1.json()["event"]["event_id"]
    eid2 = res2.json()["event"]["event_id"]
    
    db.expire_all()
    rec1 = calculate_event_fec(eid1, db)
    rec2 = calculate_event_fec(eid2, db)
    
    assert rec1.fec_score == rec2.fec_score
    assert rec1.event_adjustment == rec2.event_adjustment
