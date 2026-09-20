import sys
import os
import math
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

EXPECTED_15_FEATURES = [
    "failed_login_rate",
    "request_rate",
    "total_records_accessed",
    "unique_endpoints",
    "endpoint_discovery_count",
    "suspicious_download_count",
    "data_export_count",
    "privilege_escalation_count",
    "device_change_count",
    "night_activity_count",
    "error_rate",
    "anomalous_event_count",
    "unique_sessions",
    "unique_devices",
    "average_response_time_ms"
]

def get_live_test_events():
    """Retrieve active honeypot events or simulate one."""
    res = client.get("/api/v1/honeypot/events?limit=10")
    if res.status_code == 200:
        evts = res.json().get("events", [])
        if evts:
            return evts

    sim_res = client.post("/api/honeypot/simulate", json={"scenario": "PRIVILEGE_ESCALATION_ATTEMPT", "patient_id": "P004"})
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    return [{"event_id": sim_data["event"]["event_id"], "patient_id": sim_data["event"]["patient_id"]}]

def test_vector_15_feature_matrix_and_l2_norm():
    """Verify 15-D vector embedding features and L2 unit norm ||v||2 = 1.0000."""
    events = get_live_test_events()
    assert len(events) > 0

    for evt in events[:5]:
        eid = evt["event_id"]
        res = client.get(f"/api/v1/vector/embedding/{eid}")
        assert res.status_code == 200, f"Vector embedding failed for {eid}: {res.text}"
        data = res.json()
        
        assert data["event_id"] == eid
        assert data["dimension"] == 15
        assert data["feature_columns"] == EXPECTED_15_FEATURES
        
        vec = data["embedding_vector"]
        assert len(vec) == 15
        
        # Verify L2 Unit Normalization: ||v||2 = 1.0000 (+/- 0.001)
        norm = np.linalg.norm(np.array(vec, dtype=np.float64))
        assert abs(norm - 1.0) <= 0.001, f"L2 Unit Norm failed for {eid}: {norm}"

def test_cosine_similarity_mathematical_validation():
    """Verify independent dot product calculation matches API similarity score within 0.001."""
    events = get_live_test_events()
    if len(events) < 2:
        pytest.skip("Insufficient test events for pairwise similarity check")

    eid1 = events[0]["event_id"]
    eid2 = events[1]["event_id"]

    v1_res = client.get(f"/api/v1/vector/embedding/{eid1}")
    v2_res = client.get(f"/api/v1/vector/embedding/{eid2}")
    
    assert v1_res.status_code == 200 and v2_res.status_code == 200

    vec1 = np.array(v1_res.json()["embedding_vector"], dtype=np.float64)
    vec2 = np.array(v2_res.json()["embedding_vector"], dtype=np.float64)

    # Independent dot product math
    calculated_cosine = float(np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2)))
    calculated_cosine = max(0.0, min(1.0, calculated_cosine))

    # Fetch similarity endpoint score
    sim_res = client.get(f"/api/v1/vector/similarity/{eid1}?limit=10")
    assert sim_res.status_code == 200
    sim_data = sim_res.json()

    match = next((m for m in sim_data.get("nearest_attacks", []) if m["event_id"] == eid2), None)
    if match:
        api_score = float(match["similarity_score"])
        assert abs(calculated_cosine - api_score) <= 0.001, f"Cosine math mismatch for {eid1} <-> {eid2}: calc={calculated_cosine}, api={api_score}"

def test_vector_endpoint_404():
    """Verify non-existent event ID returns 404 for vector endpoints."""
    res_emb = client.get("/api/v1/vector/embedding/EVT-SIM-NONEXISTENT-9999")
    assert res_emb.status_code == 404
    
    res_sim = client.get("/api/v1/vector/similarity/EVT-SIM-NONEXISTENT-9999")
    assert res_sim.status_code == 404
