import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def get_live_test_events():
    """Helper to retrieve active test events or generate one via simulation."""
    res = client.get("/api/v1/honeypot/events?limit=10")
    if res.status_code == 200:
        events = res.json().get("events", [])
        if events:
            return events
    
    # Generate a fresh simulation attack if database is unseeded in test environment
    sim_res = client.post("/api/honeypot/simulate", json={"scenario": "BRUTE_FORCE_ATTEMPT", "patient_id": "P004"})
    assert sim_res.status_code == 200, f"Simulation failed: {sim_res.text}"
    sim_data = sim_res.json()
    evt_id = sim_data["event"]["event_id"]
    patient_id = sim_data["event"]["patient_id"]
    return [{"event_id": evt_id, "patient_id": patient_id}]

def test_event_forensic_inspector_real_events():
    """Verify that every real event in Command Centre resolves its exact forensic details."""
    events = get_live_test_events()
    assert len(events) > 0, "No events available for testing"

    for evt in events[:5]:
        eid = evt["event_id"]
        res = client.get(f"/api/v1/detection-pipeline/event/{eid}")
        assert res.status_code == 200, f"Failed to fetch forensic detail for {eid}: {res.text}"
        data = res.json()
        assert data["event_id"] == eid, f"Event ID mismatch: expected {eid}, got {data.get('event_id')}"
        assert "patient_id" in data
        assert "scenario" in data
        assert "severity" in data
        assert "endpoint" in data
        assert "fusion" in data

def test_event_forensic_inspector_vector_alignment():
    """Verify that vector embedding endpoint aligns with exact event ID."""
    events = get_live_test_events()
    assert len(events) > 0

    for evt in events[:5]:
        eid = evt["event_id"]
        res = client.get(f"/api/v1/vector/embedding/{eid}")
        assert res.status_code == 200
        data = res.json()
        assert data["event_id"] == eid
        assert len(data["embedding_vector"]) == 15

def test_event_forensic_inspector_unknown_event():
    """Verify that non-existent event returns HTTP 404."""
    res = client.get("/api/v1/detection-pipeline/event/EVT-SIM-NONEXISTENT-9999")
    assert res.status_code == 404
