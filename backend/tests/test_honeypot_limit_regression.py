import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_honeypot_events_valid_limits():
    """Verify backend returns 200 OK for valid limit query parameters <= 500."""
    valid_limits = [1, 50, 100, 500]
    for lim in valid_limits:
        res = client.get(f"/api/honeypot/events?limit={lim}")
        assert res.status_code == 200, f"Expected 200 for limit={lim}, got {res.status_code}"
        data = res.json()
        assert "events" in data
        assert len(data["events"]) <= lim

def test_honeypot_events_invalid_limits_return_422():
    """Verify backend enforces max limit <= 500 and returns HTTP 422 for limit > 500."""
    invalid_limits = [501, 1000, 5000]
    for lim in invalid_limits:
        res = client.get(f"/api/honeypot/events?limit={lim}")
        assert res.status_code == 422, f"Expected 422 for limit={lim}, got {res.status_code}: {res.text}"
        data = res.json()
        assert "detail" in data

def test_honeypot_events_severities_with_valid_limit():
    """Verify querying honeypot events with severity filters and limit=500 returns HTTP 200."""
    severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    for sev in severities:
        res = client.get(f"/api/honeypot/events?severity={sev}&limit=500")
        assert res.status_code == 200, f"Expected 200 for severity={sev}&limit=500, got {res.status_code}"
        data = res.json()
        assert "events" in data

def test_honeypot_v1_events_limits():
    """Verify prefix /api/v1/honeypot/events correctly validates limit parameter."""
    res_valid = client.get("/api/v1/honeypot/events?severity=LOW&limit=500")
    assert res_valid.status_code == 200
    
    res_invalid = client.get("/api/v1/honeypot/events?severity=LOW&limit=5000")
    assert res_invalid.status_code == 422

def test_patient_honeypot_events_limits():
    """Verify patient-specific honeypot endpoint /api/v1/honeypot/events/patient/P001 validates limit."""
    res_valid = client.get("/api/v1/honeypot/events/patient/P001?limit=500")
    assert res_valid.status_code == 200
    
    res_invalid = client.get("/api/v1/honeypot/events/patient/P001?limit=5000")
    assert res_invalid.status_code == 422
