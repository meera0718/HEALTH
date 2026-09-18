import sys
import os
import pytest
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app

client = TestClient(app)

def test_spider_graph_real_data_pipeline():
    """Verify spider graph data pipeline retrieves real events, patients, and 15-D vectors."""
    res = client.get("/api/v1/honeypot/events?limit=20")
    assert res.status_code == 200
    events = res.json().get("events", [])
    assert len(events) > 0, "No honeypot security events returned"

    # Verify patient grouping
    patient_ids = set(e["patient_id"] for e in events)
    assert len(patient_ids) >= 1, "No patients found in event stream"

    # Verify vector embeddings for events
    for evt in events[:5]:
        eid = evt["event_id"]
        vec_res = client.get(f"/api/v1/vector/embedding/{eid}")
        assert vec_res.status_code == 200
        vdata = vec_res.json()
        assert vdata["dimension"] == 15
        assert len(vdata["embedding_vector"]) == 15
        
        # Verify L2 Unit Normalization ||v||2 = 1.0000 (+/- 0.001)
        arr = np.array(vdata["embedding_vector"], dtype=np.float64)
        norm = np.linalg.norm(arr)
        assert abs(norm - 1.0) <= 0.001

def test_spider_graph_cross_attack_similarity_math():
    """Verify independent dot product math for cross-patient spider graph edges."""
    res = client.get("/api/v1/honeypot/events?limit=15")
    events = res.json().get("events", [])
    if len(events) < 2:
        pytest.skip("Insufficient events for cross-patient similarity testing")

    evt1 = events[0]
    evt2 = events[1]

    v1_res = client.get(f"/api/v1/vector/embedding/{evt1['event_id']}")
    v2_res = client.get(f"/api/v1/vector/embedding/{evt2['event_id']}")
    assert v1_res.status_code == 200 and v2_res.status_code == 200

    v1 = np.array(v1_res.json()["embedding_vector"], dtype=np.float64)
    v2 = np.array(v2_res.json()["embedding_vector"], dtype=np.float64)

    dot_sim = float(np.dot(v1, v2))
    dot_sim = max(0.0, min(1.0, dot_sim))

    sim_res = client.get(f"/api/v1/vector/similarity/{evt1['event_id']}?limit=10")
    assert sim_res.status_code == 200
    sim_data = sim_res.json()

    match = next((m for m in sim_data.get("nearest_attacks", []) if m["event_id"] == evt2["event_id"]), None)
    if match:
        api_score = float(match["similarity_score"])
        assert abs(dot_sim - api_score) <= 0.001, f"Math mismatch: dot={dot_sim}, api={api_score}"

def test_spider_graph_404_safety():
    """Verify non-existent events fail safely without throwing internal errors."""
    res = client.get("/api/v1/vector/embedding/EVT-SIM-INVALID-999")
    assert res.status_code == 404
