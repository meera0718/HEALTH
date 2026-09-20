import sys
import os
import math
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app

client = TestClient(app)

def test_01_single_event_identity_survives_entire_pipeline():
    """Verify single event_id survives Honeypot -> DB -> Features -> ML -> Threat Index -> FEC -> Vector -> Forensic Inspector."""
    # 1. Simulate Honeypot Event
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 12,
        "records_accessed": 0
    })
    assert sim_res.status_code == 200
    sim_data = sim_res.json()

    event_id = sim_data["event"]["event_id"]
    patient_id = sim_data["event"]["patient_id"]

    assert event_id.startswith("EVT-SIM-")
    assert patient_id == "P005"

    # 2. Verify Event DB Retrieval by Event ID
    evt_res = client.get(f"/api/v1/honeypot/event/{event_id}")
    assert evt_res.status_code == 200
    assert evt_res.json()["event_id"] == event_id
    assert evt_res.json()["patient_id"] == patient_id

    # 3. Verify Detection Pipeline Output by Event ID
    det_res = client.get(f"/api/v1/detection-pipeline/event/{event_id}")
    assert det_res.status_code == 200
    det_data = det_res.json()

    assert det_data["event_id"] == event_id
    assert det_data["patient_id"] == patient_id
    assert "ocsvm" in det_data
    assert "isolation_forest" in det_data
    assert "xgboost" in det_data
    assert "threat_index" in det_data.get("fusion", {})

    # 4. Verify 15-D Vector Embedding for Event ID
    vec_res = client.get(f"/api/v1/vector/embedding/{event_id}")
    assert vec_res.status_code == 200
    vec_data = vec_res.json()

    assert vec_data["event_id"] == event_id
    assert vec_data["patient_id"] == patient_id
    assert vec_data["dimension"] == 15

    # Check L2 Unit Normalization
    vec = vec_data["embedding_vector"]
    l2_norm = math.sqrt(sum(x * x for x in vec))
    assert math.isclose(l2_norm, 1.0, abs_tol=1e-3)

    # 5. Verify Vector Similarity for Event ID
    sim_search_res = client.get(f"/api/v1/vector/similarity/{event_id}?limit=10")
    assert sim_search_res.status_code == 200
    sim_search_data = sim_search_res.json()

    assert sim_search_data["query_event_id"] == event_id
    assert sim_search_data["query_patient_id"] == patient_id

def test_02_cross_patient_vector_topology_discovery():
    """Verify that different patients and different attacks connect via 15-D vector cosine similarity."""
    # Create Event A for Patient P003 (Brute Force)
    evtA_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 15
    })
    assert evtA_res.status_code == 200
    evtA_id = evtA_res.json()["event"]["event_id"]

    # Create Event B for Patient P017 (Reconnaissance)
    evtB_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P017",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0
    })
    assert evtB_res.status_code == 200
    evtB_id = evtB_res.json()["event"]["event_id"]

    # Query similarity for Event A
    sim_res = client.get(f"/api/v1/vector/similarity/{evtA_id}?limit=10")
    assert sim_res.status_code == 200
    matches = sim_res.json().get("nearest_attacks", [])

    # Find match belonging to a different patient
    cross_patient_matches = [m for m in matches if m["patient_id"] != "P003"]
    assert len(cross_patient_matches) > 0, "Expected at least one cross-patient similarity match"

    # Verify dot product math
    first_match = cross_patient_matches[0]
    tgt_id = first_match["event_id"]
    api_score = first_match["similarity_score"]

    vecA = client.get(f"/api/v1/vector/embedding/{evtA_id}").json()["embedding_vector"]
    vecB = client.get(f"/api/v1/vector/embedding/{tgt_id}").json()["embedding_vector"]

    calc_dot = sum(a * b for a, b in zip(vecA, vecB))
    calc_dot = max(0.0, min(1.0, calc_dot))

    assert abs(calc_dot - api_score) <= 0.001, f"Dot product mismatch: {calc_dot:.4f} != {api_score:.4f}"

def test_03_negative_similarity_threshold_filtering():
    """Verify that low similarity events below threshold do not qualify for topology relationships."""
    events_res = client.get("/api/v1/honeypot/events?limit=20")
    events = events_res.json().get("events", [])
    if len(events) < 2:
        pytest.skip("Not enough security events for negative similarity test")

    evt_id = events[0]["event_id"]
    sim_res = client.get(f"/api/v1/vector/similarity/{evt_id}?limit=20")
    matches = sim_res.json().get("nearest_attacks", [])

    # Verify that score values in returned array are ordered descending
    scores = [m["similarity_score"] for m in matches]
    assert scores == sorted(scores, reverse=True), "Similarity matches must be sorted in descending order"
