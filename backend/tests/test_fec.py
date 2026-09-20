import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import PatientFeature, PatientFEC

client = TestClient(app)

def test_recalculate_fec():
    res = client.post("/api/v1/fec/recalculate")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["patients"] == 30
    assert data["invalid_scores"] == 0
    assert data["missing_components"] == 0
    assert data["weight_total"] == 1.0
    assert data["status_text"] == "● FEC ENGINE VALID"

def test_get_all_fec():
    res = client.get("/api/v1/fec/patients")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 30
    
    # Check shape of one record
    p1 = next(p for p in data if p["patient_id"] == "P001")
    assert "display_name" in p1
    assert "fec_score" in p1
    assert 0.0 <= p1["fec_score"] <= 100.0
    assert p1["fec_version"] == "v1"
    assert "calculated_at" in p1

def test_get_fec_detail():
    res = client.get("/api/v1/fec/patients/P001")
    assert res.status_code == 200
    data = res.json()
    assert data["patient_id"] == "P001"
    assert "primary_diagnosis" in data
    assert "components" in data
    assert "top_contributors" in data
    assert len(data["top_contributors"]) == 3
    assert "explanations" in data
    assert len(data["explanations"]) >= 1

def test_get_fec_detail_invalid():
    res = client.get("/api/v1/fec/patients/INVALID_ID")
    assert res.status_code == 404
