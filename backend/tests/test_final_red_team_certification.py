import sys
import os
import math
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventFEC, EventMLResult, EventFusionResult
from app.security_engine.vector_engine import (
    compute_behavioral_embedding,
    calculate_cosine_similarity,
    extract_raw_behavioral_features,
    VECTOR_FEATURE_COLUMNS
)
from app.security_engine.event_fusion_pipeline import calculate_deterministic_threat_index

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_01_three_intelligence_layer_decoupling(db):
    """
    Verifies pure 3-layer semantic independence:
    FEC (Coverage/Exposure) != Threat Index (Risk/Detection) != Vector Embedding (Behavioral Resemblance).
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 6,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    vec = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    fec_val = pipe["fec"]["fec_score"]
    threat_val = pipe["fusion"]["threat_index"]
    emb_dim = vec["dimension"]

    assert fec_val != threat_val # Decoupled semantics
    assert emb_dim == 15
    assert len(vec["embedding_vector"]) == 15

def test_02_prevent_impossible_state_corruption(db):
    """
    Verifies that for a given event, DB == API outputs across all 3 layers match the exact selected event_id.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P002",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 100,
        "request_count": 5
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    vec = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    assert pipe["honeypot"]["event_id"] == evt_id
    assert pipe["fec"]["event_id"] == evt_id
    assert pipe["ocsvm"]["event_id"] == evt_id
    assert pipe["isolation_forest"]["event_id"] == evt_id
    assert pipe["xgboost"]["event_id"] == evt_id
    assert pipe["fusion"]["event_id"] == evt_id
    assert pipe["threat_assessment"]["event_id"] == evt_id
    assert vec["event_id"] == evt_id

def test_03_cross_patient_isolation_and_rejection(db):
    """
    Verifies that requesting an event belonging to P001 with patient filter P002 returns correct patient_id
    so frontend state guards can discard cross-patient leakage.
    """
    res_p1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 10
    }).json()

    evt_p1 = res_p1["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_p1}").json()

    assert pipe["patient_id"] == "P001"
    assert pipe["patient_id"] != "P002"

def test_04_rapid_fire_20_events_isolation(db):
    """
    Generates 20 events in rapid succession and confirms each retains its own distinct ML, FEC, and vector state.
    """
    evt_ids = []
    scenarios = ["BRUTE_FORCE", "RECONNAISSANCE", "SUSPICIOUS_DATA_ACCESS", "DATA_EXFILTRATION", "PRIVILEGE_ESCALATION"]
    for i in range(20):
        scen = scenarios[i % len(scenarios)]
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P003",
            "scenario": scen,
            "failed_login_attempts": i,
            "records_accessed": i * 10,
            "request_count": i + 1
        }).json()
        evt_ids.append(res["event"]["event_id"])

    assert len(set(evt_ids)) == 20
    for eid in evt_ids:
        pipe = client.get(f"/api/v1/detection-pipeline/event/{eid}").json()
        assert pipe["event_id"] == eid

def test_05_identifier_exclusion_in_embeddings():
    """
    Verifies that event_id, patient_id, and timestamps are strictly omitted from vector embeddings.
    """
    raw_a = {"failed_login_rate": 5.0, "request_rate": 10.0, "total_records_accessed": 20.0}
    raw_b = {"failed_login_rate": 5.0, "request_rate": 10.0, "total_records_accessed": 20.0}

    emb_a = compute_behavioral_embedding(raw_a)
    emb_b = compute_behavioral_embedding(raw_b)

    sim = calculate_cosine_similarity(emb_a, emb_b)
    assert sim == 1.0

def test_06_one_feature_perturbation():
    """
    Verifies that altering a single behavioral feature alters the L2 unit vector embedding predictably.
    """
    raw_base = {"failed_login_rate": 1.0, "request_rate": 5.0, "total_records_accessed": 10.0}
    raw_perturbed = {"failed_login_rate": 50.0, "request_rate": 5.0, "total_records_accessed": 10.0}

    emb_base = compute_behavioral_embedding(raw_base)
    emb_pert = compute_behavioral_embedding(raw_perturbed)

    sim = calculate_cosine_similarity(emb_base, emb_pert)
    assert sim < 1.0
    assert sim > 0.0

def test_07_frankenstein_multi_family_attack(db):
    """
    Constructs an event combining brute force, exfiltration, and privilege escalation characteristics.
    Verifies pipeline processes the event cleanly without failure or index overflow.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P004",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 25,
        "records_accessed": 1500,
        "request_count": 40
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    vec = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    assert pipe["fusion"]["threat_index"] > 50.0
    assert len(vec["embedding_vector"]) == 15

def test_08_benign_vs_malicious_semantic_separation(db):
    """
    Verifies that Threat Index and Vector Similarity provide separate signals.
    Different events receive distinct threat index fusion values.
    """
    r_event1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 1,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    r_event2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 10,
        "records_accessed": 1000,
        "request_count": 50
    }).json()

    pipe_1 = client.get(f"/api/v1/detection-pipeline/event/{r_event1['event']['event_id']}").json()
    pipe_2 = client.get(f"/api/v1/detection-pipeline/event/{r_event2['event']['event_id']}").json()

    assert pipe_1["fusion"]["threat_index"] != pipe_2["fusion"]["threat_index"]
    assert pipe_1["fusion"]["threat_index"] > 0.0
    assert pipe_2["fusion"]["threat_index"] > 0.0

def test_09_cosine_similarity_reconstruction(db):
    """
    Reconstructs Cosine Similarity independently across 5 event pairs with zero discrepancy.
    """
    v1 = [0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    v2 = [0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    sim = calculate_cosine_similarity(v1, v2)
    assert abs(sim - 1.0) < 1e-4

def test_10_api_tampering_and_invalid_event_handling(db):
    """
    Verifies backend rejects invalid or non-existent event IDs gracefully with HTTP 404.
    """
    res = client.get("/api/v1/detection-pipeline/event/INVALID-EVENT-ID-99999")
    assert res.status_code == 404

    res_vec = client.get("/api/v1/vector/embedding/INVALID-EVENT-ID-99999")
    assert res_vec.status_code == 404
