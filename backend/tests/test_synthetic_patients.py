import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient
from app.main import app
from seed_patients import seed_patients_cohort, validate_patient_record
from app.db.synthetic_cohort_v1 import SYNTHETIC_PATIENTS_COHORT_V1

client = TestClient(app)

def test_seed_patients_cohort_validation():
    assert len(SYNTHETIC_PATIENTS_COHORT_V1) == 30
    patient_ids = set()
    diagnoses = set()
    profiles = {"LOW": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}

    for rec in SYNTHETIC_PATIENTS_COHORT_V1:
        valid, msg = validate_patient_record(rec)
        assert valid is True, f"Record {rec.get('patient_id')} failed validation: {msg}"
        patient_ids.add(rec["patient_id"])
        diagnoses.add(rec["primary_diagnosis"])
        profiles[rec["security_profile"]] += 1

    assert len(patient_ids) == 30
    assert len(diagnoses) == 30
    assert profiles["LOW"] == 8
    assert profiles["MODERATE"] == 8
    assert profiles["HIGH"] == 8
    assert profiles["CRITICAL"] == 6

def test_run_seed_script():
    success = seed_patients_cohort()
    assert success is True

def test_get_patients_count():
    response = client.get("/api/v1/patients/count")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 30
    assert data["dataset_id"] == "HTS-SYN-001"
    assert data["synthetic"] is True

def test_get_all_synthetic_patients():
    response = client.get("/api/v1/patients")
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_id"] == "HTS-SYN-001"
    assert data["synthetic"] is True
    assert data["record_count"] == 30
    assert len(data["patients"]) == 30
    assert data["summary"]["low"] == 8
    assert data["summary"]["moderate"] == 8
    assert data["summary"]["high"] == 8
    assert data["summary"]["critical"] == 6

def test_get_single_synthetic_patient():
    response = client.get("/api/v1/patients/P001")
    assert response.status_code == 200
    patient = response.json()
    assert patient["patient_id"] == "P001"
    assert patient["synthetic"] is True
    assert patient["display_name"] == "Patient Alpha"
    assert patient["primary_diagnosis"] == "Type 2 Diabetes"
    assert patient["security_profile"] == "LOW"
    assert patient["digital_environment"]["mfa_enabled"] is True
    assert patient["security_features"]["failed_login_attempts"] == 1

def test_get_patient_security_profile():
    response = client.get("/api/v1/patients/P025/security-profile")
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == "P025"
    assert data["security_profile"] == "CRITICAL"
    assert data["synthetic"] is True

def test_export_patients_csv():
    response = client.get("/api/v1/patients/export/csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "healthtech_shield_patients_v1.csv" in response.headers["content-disposition"]
    lines = response.text.strip().split("\n")
    assert len(lines) == 31 # Header + 30 rows
    assert "P001" in lines[1]
    assert "P030" in lines[-1]

def test_export_patients_json():
    response = client.get("/api/v1/patients/export/json")
    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]
    assert "healthtech_shield_patients_v1.json" in response.headers["content-disposition"]
    data = response.json()
    assert data["dataset_id"] == "HTS-SYN-001"
    assert data["synthetic"] is True
    assert data["record_count"] == 30
    assert len(data["records"]) == 30

def test_validate_patients_dataset():
    response = client.get("/api/v1/patients/validate")
    assert response.status_code == 200
    data = response.json()
    assert data["total_records"] == 30
    assert data["unique_ids"] == 30
    assert data["missing_fields"] == 0
    assert data["duplicate_ids"] == 0
    assert data["synthetic_records"] == 30
    assert data["status"] == "VALID"
    assert data["is_valid"] is True
