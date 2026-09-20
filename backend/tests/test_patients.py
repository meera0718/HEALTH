import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_all_patients():
    response = client.get("/api/v1/patients")
    assert response.status_code == 200
    data = response.json()
    assert "patients" in data
    assert "summary" in data
    assert len(data["patients"]) >= 10
    assert data["summary"]["total_patients"] >= 10

def test_get_patient_by_id():
    response = client.get("/api/v1/patients/P001")
    assert response.status_code == 200
    patient = response.json()
    assert patient["patient_id"] == "P001"
    assert patient["display_name"] == "Patient Alpha"

def test_patient_access_audit():
    payload = {
        "user": "doctor_demo",
        "action": "VIEW_PATIENT_RECORD",
        "status": "Authorized"
    }
    response = client.post("/api/v1/patients/P001/access-audit", json=payload)
    assert response.status_code == 200
    res = response.json()
    assert res["recorded"] is True
    assert res["patient_id"] == "P001"
