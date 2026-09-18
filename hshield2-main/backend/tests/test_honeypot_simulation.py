import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent

client = TestClient(app)

def test_honeypot_simulation_endpoint():
    # 1. Post simulation request
    req_body = {
        "patient_id": "P027",
        "scenario": "BRUTE_FORCE"
    }
    
    res = client.post("/api/v1/honeypot/simulate", json=req_body)
    assert res.status_code == 200
    data = res.json()
    
    assert data["success"] is True
    assert "event" in data
    
    evt_data = data["event"]
    assert "event_id" in evt_data
    assert evt_data["patient_id"] == "P027"
    assert evt_data["event_type"] == "BRUTE_FORCE_ATTEMPT"
    assert evt_data["severity"] == "HIGH"
    assert evt_data["synthetic"] is True
    
    # 2. Check event is stored in database
    db = SessionLocal()
    try:
        db_evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.event_id == evt_data["event_id"]
        ).first()
        
        assert db_evt is not None
        assert db_evt.patient_id == "P027"
        assert db_evt.event_type == "BRUTE_FORCE_ATTEMPT"
        assert db_evt.severity == "HIGH"
        assert db_evt.synthetic is True
        assert db_evt.failed_login_attempts == 5
        assert db_evt.response_status == 401
        assert "192.0.2." in db_evt.source
    finally:
        db.close()

def test_honeypot_simulation_invalid_patient():
    req_body = {
        "patient_id": "P999", # Invalid ID
        "scenario": "BRUTE_FORCE"
    }
    res = client.post("/api/v1/honeypot/simulate", json=req_body)
    assert res.status_code == 404

def test_honeypot_simulation_invalid_scenario():
    req_body = {
        "patient_id": "P027",
        "scenario": "UNKNOWN_ATTACK" # Unsupported scenario
    }
    res = client.post("/api/v1/honeypot/simulate", json=req_body)
    assert res.status_code == 400

def test_honeypot_simulation_suspicious_login():
    req_body = {
        "patient_id": "P027",
        "scenario": "SUSPICIOUS_LOGIN"
    }
    res = client.post("/api/v1/honeypot/simulate", json=req_body)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    
    # Check stored record
    db = SessionLocal()
    try:
        db_evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.event_id == data["event"]["event_id"]
        ).first()
        assert db_evt is not None
        assert db_evt.event_type == "SUSPICIOUS_LOGIN"
        assert db_evt.failed_login_attempts == 1
        assert db_evt.response_status == 200
    finally:
        db.close()

