import sys
import os
import math
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app

client = TestClient(app)

def test_01_real_events_pipeline_and_vector_embedding():
    """Verify security events produce valid 15-D L2 normalized vectors."""
    res = client.get("/api/v1/honeypot/events?limit=10")
    assert res.status_code == 200
    data = res.json()
    events = data.get("events", [])
    assert len(events) > 0, "No security events found in database"

    evt_id = events[0]["event_id"]
    pid = events[0]["patient_id"]

    emb_res = client.get(f"/api/v1/vector/embedding/{evt_id}")
    assert emb_res.status_code == 200
    emb_data = emb_res.json()

    assert emb_data["event_id"] == evt_id
    assert emb_data["patient_id"] == pid
    assert emb_data["dimension"] == 15
    vec = emb_data["embedding_vector"]
    assert len(vec) == 15

    # Verify L2 Unit Normalization (||v||₂ ≈ 1.0)
    l2_norm = math.sqrt(sum(x * x for x in vec))
    assert math.isclose(l2_norm, 1.0, abs_tol=1e-3), f"L2 norm {l2_norm} != 1.0"

def test_02_vector_similarity_and_dot_product_proof():
    """Verify vector similarity endpoint returns real cross-patient matches and exact dot products."""
    events_res = client.get("/api/v1/honeypot/events?limit=10")
    assert events_res.status_code == 200
    events = events_res.json().get("events", [])
    assert len(events) >= 2, "Need at least 2 events for similarity testing"

    src_evt_id = events[0]["event_id"]
    src_pid = events[0]["patient_id"]

    sim_res = client.get(f"/api/v1/vector/similarity/{src_evt_id}?limit=10")
    assert sim_res.status_code == 200
    sim_data = sim_res.json()

    assert sim_data["query_event_id"] == src_evt_id
    assert sim_data["query_patient_id"] == src_pid

    matches = sim_data.get("nearest_attacks", [])
    assert len(matches) > 0, "No similarity matches returned"

    # Verify each match
    for match in matches:
        tgt_evt_id = match["event_id"]
        tgt_pid = match["patient_id"]
        score = match["similarity_score"]

        # Fetch target embedding to verify dot product equality
        tgt_emb_res = client.get(f"/api/v1/vector/embedding/{tgt_evt_id}")
        assert tgt_emb_res.status_code == 200
        tgt_vec = tgt_emb_res.json()["embedding_vector"]

        src_emb_res = client.get(f"/api/v1/vector/embedding/{src_evt_id}")
        src_vec = src_emb_res.json()["embedding_vector"]

        calculated_dot = sum(a * b for a, b in zip(src_vec, tgt_vec))
        calculated_dot = max(0.0, min(1.0, calculated_dot))

        assert abs(calculated_dot - score) <= 0.001, f"Dot product mismatch: {calculated_dot:.4f} != {score:.4f}"

def test_03_cross_patient_relationship_discovery():
    """Verify that cross-patient relationships (patient_A != patient_B) exist in vector similarity."""
    events_res = client.get("/api/v1/honeypot/events?limit=20")
    events = events_res.json().get("events", [])
    
    found_cross_patient = False
    for evt in events:
        sim_res = client.get(f"/api/v1/vector/similarity/{evt['event_id']}?limit=10")
        if sim_res.status_code == 200:
            matches = sim_res.json().get("nearest_attacks", [])
            for m in matches:
                if m["patient_id"] != evt["patient_id"]:
                    found_cross_patient = True
                    break
        if found_cross_patient:
            break

    assert found_cross_patient, "Expected to find at least one cross-patient similarity relationship in events corpus"

def test_04_different_attack_types_relationship():
    """Verify that events with DIFFERENT attack types can share high behavioral similarity."""
    events_res = client.get("/api/v1/honeypot/events?limit=20")
    events = events_res.json().get("events", [])

    found_diff_attack = False
    for evt in events:
        sim_res = client.get(f"/api/v1/vector/similarity/{evt['event_id']}?limit=10")
        if sim_res.status_code == 200:
            matches = sim_res.json().get("nearest_attacks", [])
            for m in matches:
                if m["event_type"] != evt["event_type"] and m["similarity_score"] >= 0.70:
                    found_diff_attack = True
                    break
        if found_diff_attack:
            break

    assert found_diff_attack, "Expected to find cross-attack behavioral similarity relationship"
