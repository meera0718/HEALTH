import sys
import os
import time
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app

client = TestClient(app)

def test_performance_budget_reporting_summary():
    """Verify reporting summary returns cached response within < 50ms budget."""
    # Warm call
    client.get("/api/v1/reporting/summary")
    
    # Measured cached call
    t0 = time.perf_counter()
    res = client.get("/api/v1/reporting/summary")
    t1 = time.perf_counter()
    duration_ms = (t1 - t0) * 1000
    
    assert res.status_code == 200
    assert duration_ms < 50.0, f"Reporting summary cached budget exceeded: {duration_ms:.2f} ms"

def test_performance_budget_vector_similarity():
    """Verify vector similarity search completes within 300ms budget."""
    events_res = client.get("/api/v1/honeypot/events?limit=5")
    assert events_res.status_code == 200
    events = events_res.json().get("events", [])
    if not events:
        pytest.skip("No security events available for vector similarity test")

    evt_id = events[0]["event_id"]
    t0 = time.perf_counter()
    res = client.get(f"/api/v1/vector/similarity/{evt_id}?limit=10")
    t1 = time.perf_counter()
    duration_ms = (t1 - t0) * 1000
    
    assert res.status_code == 200
    assert duration_ms < 300.0, f"Vector similarity budget exceeded: {duration_ms:.2f} ms"

def test_performance_budget_honeypot_events():
    """Verify honeypot events listing completes within 100ms budget."""
    t0 = time.perf_counter()
    res = client.get("/api/v1/honeypot/events?limit=50")
    t1 = time.perf_counter()
    duration_ms = (t1 - t0) * 1000
    
    assert res.status_code == 200
    assert duration_ms < 100.0, f"Honeypot events budget exceeded: {duration_ms:.2f} ms"
