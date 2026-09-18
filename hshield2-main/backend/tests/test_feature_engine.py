import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_all_features():
    response = client.get("/api/v1/features/patients")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 30
    
    # Verify structure of first record
    first = data[0]
    assert "patient_id" in first
    assert "total_events" in first
    assert "failed_login_rate" in first
    assert "request_rate" in first
    assert "error_rate" in first
    assert "night_activity_count" in first
    assert "anomalous_event_count" in first
    
    # Verify rates are floats and counts are non-negative
    for feat in data:
        assert isinstance(feat["total_events"], int)
        assert feat["total_events"] >= 0
        assert isinstance(feat["failed_login_rate"], float)
        assert 0.0 <= feat["failed_login_rate"] <= 1.0
        assert isinstance(feat["error_rate"], float)
        assert 0.0 <= feat["error_rate"] <= 1.0
        assert isinstance(feat["request_rate"], float)
        assert feat["request_rate"] >= 0.0

def test_get_single_patient_features():
    for pid in ["P001", "P015", "P027", "P030"]:
        response = client.get(f"/api/v1/features/patients/{pid}")
        assert response.status_code == 200
        feat = response.json()
        assert feat["patient_id"] == pid
        assert "feature_version" in feat
        assert feat["feature_version"] == "v1"

def test_recalculate_features():
    response = client.post("/api/v1/features/recalculate")
    assert response.status_code == 200
    res = response.json()
    assert res["valid"] is True
    assert res["patients"] == 30
    assert res["feature_records"] == 30
    assert res["invalid_references"] == 0
    assert res["missing_feature_values"] == 0
    assert "● FEATURE DATASET VALID" in res["status_text"]
