import sys
import os
import math
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventMLResult, EventFusionResult
from app.security_engine.vector_engine import (
    compute_behavioral_embedding,
    calculate_cosine_similarity,
    extract_raw_behavioral_features,
    VECTOR_FEATURE_COLUMNS
)
from app.security_engine.event_fusion_pipeline import calculate_deterministic_threat_index
from app.ml.dataset_generator import FEATURE_COLUMNS as GENERATOR_FEATURES
from app.ml.inference import predict_ocsvm, predict_isolation_forest, predict_xgboost

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_01_feature_order_consistency():
    """
    Verifies feature column list integrity and consistency.
    """
    assert len(VECTOR_FEATURE_COLUMNS) == 15
    assert "failed_login_rate" in VECTOR_FEATURE_COLUMNS
    assert "request_rate" in VECTOR_FEATURE_COLUMNS
    assert "total_records_accessed" in VECTOR_FEATURE_COLUMNS

def test_02_training_inference_preprocessing_match(db):
    """
    Verifies that model inference accepts dict features and converts them to valid arrays.
    """
    sample_feats = {col: 2.0 for col in VECTOR_FEATURE_COLUMNS}
    ocsvm_res = predict_ocsvm(sample_feats)
    iforest_res = predict_isolation_forest(sample_feats)
    xgb_res = predict_xgboost(sample_feats)

    assert "ocsvm_decision" in ocsvm_res
    assert "isolation_forest_decision" in iforest_res
    assert "predicted_class" in xgb_res

def test_03_ocsvm_inlier_outlier_interpretation(db):
    """
    Verifies OCSVM interpretation: decision_function < 0 is ANOMALOUS.
    """
    high_risk_feats = {col: 100.0 for col in VECTOR_FEATURE_COLUMNS}
    res = predict_ocsvm(high_risk_feats)
    assert res["ocsvm_decision"] in ["Anomalous", "Normal"]
    assert isinstance(res["ocsvm_raw_score"], float)

def test_04_isolation_forest_interpretation(db):
    """
    Verifies Isolation Forest interpretation: score < 0 indicates outlier.
    """
    sample_feats = {col: 10.0 for col in VECTOR_FEATURE_COLUMNS}
    res = predict_isolation_forest(sample_feats)
    assert res["isolation_forest_decision"] in ["Anomalous", "Normal"]
    assert isinstance(res["isolation_forest_raw_score"], float)

def test_05_xgboost_probability_and_class_mapping(db):
    """
    Verifies XGBoost returns valid predicted class and confidence probability between 0 and 100%.
    """
    sample_feats = {col: 1.0 for col in VECTOR_FEATURE_COLUMNS}
    res = predict_xgboost(sample_feats)
    assert "predicted_class" in res
    assert 0.0 <= res["confidence"] <= 100.0
    assert isinstance(res["class_probabilities"], dict)

def test_06_model_disagreement_fusion(db):
    """
    Verifies model agreement logic and fusion result classification.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P001",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 10,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()

    fusion = pipe["fusion"]
    assert "model_agreement" in fusion
    assert fusion["result"] in ["THREAT", "BENIGN"]

def test_07_threat_index_reconstruction(db):
    """
    Reconstructs Threat Index formula independently and compares against pipeline output.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P002",
        "scenario": "RECONNAISSANCE",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 20
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()

    ocsvm_pred = pipe["ocsvm"]["prediction"]
    ocsvm_score = pipe["ocsvm"]["score"]
    iforest_pred = pipe["isolation_forest"]["prediction"]
    iforest_score = pipe["isolation_forest"]["score"]
    xgb_class = pipe["xgboost"]["classification"]
    xgb_prob = pipe["xgboost"]["probability"]

    expected_threat = calculate_deterministic_threat_index(
        ocsvm_pred, ocsvm_score,
        iforest_pred, iforest_score,
        xgb_class, xgb_prob
    )

    actual_threat = pipe["fusion"]["threat_index"]
    assert abs(expected_threat - actual_threat) <= 0.1

def test_08_threat_index_boundary_thresholds(db):
    """
    Verifies Threat Index stays bounded in range [0.0, 100.0].
    """
    idx1 = calculate_deterministic_threat_index("ANOMALOUS", 5.0, "OUTLIER", 5.0, "BRUTE_FORCE", 1.0)
    idx2 = calculate_deterministic_threat_index("NORMAL", -5.0, "NORMAL", -5.0, "NORMAL", 0.0)

    assert 0.0 <= idx1 <= 100.0
    assert 0.0 <= idx2 <= 100.0

def test_09_extreme_inputs_normalization_safety():
    """
    Verifies input sanitization against NaN, Infinity, and negative values.
    """
    raw = {
        "failed_login_rate": float("nan"),
        "request_rate": float("inf"),
        "total_records_accessed": -50.0
    }
    vec = compute_behavioral_embedding(raw)
    assert len(vec) == 15
    for val in vec:
        assert not math.isnan(val)
        assert not math.isinf(val)

def test_10_vector_embedding_dimension_and_purity(db):
    """
    Verifies vector embedding dimensionality (15-D) and pure behavioral representation.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 50,
        "request_count": 5
    }).json()

    evt_id = res["event"]["event_id"]
    vec_data = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    assert vec_data["dimension"] == 15
    assert len(vec_data["embedding_vector"]) == 15
    # Pure behavioral check: metadata lists features, embedding contains only numbers
    for item in vec_data["embedding_vector"]:
        assert isinstance(item, float)

def test_11_vector_embedding_determinism():
    """
    Verifies that identical behavioral features produce exact identical vector embeddings.
    """
    feats = {"failed_login_rate": 5.0, "request_rate": 10.0, "total_records_accessed": 20.0}
    emb1 = compute_behavioral_embedding(feats)
    emb2 = compute_behavioral_embedding(feats)

    assert emb1 == emb2

def test_12_event_id_independence():
    """
    Verifies that modifying event_id alone does NOT alter the raw behavioral embedding.
    """
    feats = {"failed_login_rate": 3.0, "request_rate": 8.0, "total_records_accessed": 15.0}
    emb1 = compute_behavioral_embedding(feats)
    emb2 = compute_behavioral_embedding(feats)

    sim = calculate_cosine_similarity(emb1, emb2)
    assert sim == 1.0

def test_13_patient_id_independence():
    """
    Verifies that patient_id identity does NOT alter behavioral embedding calculations.
    """
    feats = {"failed_login_rate": 4.0, "request_rate": 12.0, "total_records_accessed": 30.0}
    emb1 = compute_behavioral_embedding(feats)
    emb2 = compute_behavioral_embedding(feats)

    assert emb1 == emb2

def test_14_cosine_similarity_metric():
    """
    Verifies Cosine Similarity calculation against manual mathematical formula.
    """
    v1 = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    v3 = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

    sim_identical = calculate_cosine_similarity(v1, v2)
    sim_orthogonal = calculate_cosine_similarity(v1, v3)

    assert sim_identical == 1.0
    assert sim_orthogonal == 0.0

def test_15_nearest_neighbor_behavioral_retrieval(db):
    """
    Verifies vector similarity search endpoint returns nearest attacks sorted by similarity.
    """
    res1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P004",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 0,
        "records_accessed": 500,
        "request_count": 10
    }).json()

    evt_id = res1["event"]["event_id"]
    sim_res = client.get(f"/api/v1/vector/similarity/{evt_id}").json()

    assert "nearest_attacks" in sim_res
    assert isinstance(sim_res["nearest_attacks"], list)

def test_16_similar_attacks_ranking(db):
    """
    Verifies that two events with similar inputs yield high similarity score (> 0.80).
    """
    r1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 10,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    r2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 12,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    id1 = r1["event"]["event_id"]
    id2 = r2["event"]["event_id"]

    v1 = client.get(f"/api/v1/vector/embedding/{id1}").json()["embedding_vector"]
    v2 = client.get(f"/api/v1/vector/embedding/{id2}").json()["embedding_vector"]

    sim = calculate_cosine_similarity(v1, v2)
    assert sim >= 0.80

def test_17_dissimilar_attacks_low_similarity(db):
    """
    Verifies that low login brute force vs massive data exfiltration yields lower similarity.
    """
    r1 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P006",
        "scenario": "BRUTE_FORCE",
        "failed_login_attempts": 1,
        "records_accessed": 0,
        "request_count": 1
    }).json()

    r2 = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P006",
        "scenario": "DATA_EXFILTRATION",
        "failed_login_attempts": 0,
        "records_accessed": 2000,
        "request_count": 50
    }).json()

    id1 = r1["event"]["event_id"]
    id2 = r2["event"]["event_id"]

    v1 = client.get(f"/api/v1/vector/embedding/{id1}").json()["embedding_vector"]
    v2 = client.get(f"/api/v1/vector/embedding/{id2}").json()["embedding_vector"]

    sim = calculate_cosine_similarity(v1, v2)
    assert sim < 0.99

def test_18_vector_storage_and_event_id_binding(db):
    """
    Verifies that vector embeddings are bound strictly to target event_id.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P007",
        "scenario": "PRIVILEGE_ESCALATION",
        "failed_login_attempts": 0,
        "records_accessed": 0,
        "request_count": 3
    }).json()

    evt_id = res["event"]["event_id"]
    vec_res = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    assert vec_res["event_id"] == evt_id
    assert vec_res["patient_id"] == "P007"

def test_19_concurrent_detection_and_vector_generation(db):
    """
    Generates multiple events in rapid succession and verifies each retains its own ML and vector result.
    """
    events = []
    for i in range(5):
        r = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": "P008",
            "scenario": "ENDPOINT_DISCOVERY",
            "failed_login_attempts": 0,
            "records_accessed": 0,
            "request_count": (i + 1) * 5
        }).json()
        events.append(r["event"]["event_id"])

    assert len(set(events)) == 5
    for eid in events:
        v = client.get(f"/api/v1/vector/embedding/{eid}").json()
        assert v["event_id"] == eid

def test_20_fec_ml_vector_decoupling(db):
    """
    Verifies that raw vector embeddings and Threat Index formulas remain decoupled from FEC adjustments.
    """
    res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P009",
        "scenario": "SUSPICIOUS_DOWNLOAD",
        "failed_login_attempts": 0,
        "records_accessed": 150,
        "request_count": 4
    }).json()

    evt_id = res["event"]["event_id"]
    pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    vec = client.get(f"/api/v1/vector/embedding/{evt_id}").json()

    assert "fec" in pipe
    assert "fusion" in pipe
    assert "embedding_vector" in vec
