import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient
from app.main import app
from generate_honeypot_events import generate_honeypot_events

client = TestClient(app)

def test_generate_honeypot_events_script():
    success, report = generate_honeypot_events(reset_existing=True)
    assert success is True
    assert report["total_events"] >= 3000
    assert report["patients_monitored"] == 30
    assert report["orphan_events"] == 0
    assert report["duplicate_event_ids"] == 0
    assert report["is_valid"] is True
    assert report["status"] == "VALID"

def test_get_honeypot_stats():
    response = client.get("/api/v1/honeypot/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_events"] >= 3000
    assert data["patients_monitored"] == 30
    assert "high_critical_events" in data
    assert "anomalous_baseline_events" in data

def test_validate_honeypot_dataset():
    response = client.get("/api/v1/honeypot/validate")
    assert response.status_code == 200
    data = response.json()
    assert data["total_events"] >= 3000
    assert data["patients_monitored"] == 30
    assert data["orphan_events"] == 0
    assert data["duplicate_event_ids"] == 0
    assert data["missing_fields"] == 0
    assert data["status"] == "VALID"
    assert data["is_valid"] is True

def test_get_honeypot_events_list():
    response = client.get("/api/v1/honeypot/events?limit=50")
    assert response.status_code == 200
    data = response.json()
    assert data["total_events"] >= 3000
    assert len(data["events"]) == 50
    
    first_evt = data["events"][0]
    assert "event_id" in first_evt
    assert "patient_id" in first_evt
    assert "timestamp" in first_evt
    assert "event_type" in first_evt
    assert "severity" in first_evt

def test_get_honeypot_events_patient_filter():
    response = client.get("/api/v1/honeypot/events/patient/P001")
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "P001"
    assert data["total_events"] > 0
    for evt in data["events"]:
        assert evt["patient_id"] == "P001"

def test_get_single_honeypot_event():
    res_list = client.get("/api/v1/honeypot/events?limit=1")
    assert res_list.status_code == 200
    evt_id = res_list.json()["events"][0]["event_id"]

    res_single = client.get(f"/api/v1/honeypot/events/{evt_id}")
    assert res_single.status_code == 200
    single_data = res_single.json()
    assert single_data["event_id"] == evt_id

def test_patient_id_search_variations():
    # Test P001, P005, P015, P030, lowercase p001, and padded " P001 "
    for query_str in ["P001", "P005", "P015", "P030", "p001", " P001 "]:
        res = client.get(f"/api/v1/honeypot/events?search={query_str}")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] > 0
        target_pid = query_str.strip().upper()
        for e in data["events"]:
            assert e["patient_id"] == target_pid or target_pid in e["event_id"]

def test_event_id_search():
    res_first = client.get("/api/v1/honeypot/events?limit=1")
    assert res_first.status_code == 200
    target_evt_id = res_first.json()["events"][0]["event_id"]

    res_search = client.get(f"/api/v1/honeypot/events?search={target_evt_id}")
    assert res_search.status_code == 200
    events = res_search.json()["events"]
    assert len(events) >= 1
    assert events[0]["event_id"] == target_evt_id

def test_search_combined_with_severity():
    res = client.get("/api/v1/honeypot/events?patient_id=P030&severity=HIGH")
    assert res.status_code == 200
    data = res.json()
    for e in data["events"]:
        assert e["patient_id"] == "P030"
        assert e["severity"] == "HIGH"

def test_nonexistent_patient_search():
    res = client.get("/api/v1/honeypot/events?search=P999")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert len(data["events"]) == 0
