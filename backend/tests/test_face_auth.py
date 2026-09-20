import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_unregistered_face_login_denied():
    # Attempting face login for an account with NO registered face MUST be denied (HTTP 403)
    res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "UNREGISTERED_ACCOUNT_99",
        "face_image_b64": "test_face_stream_capture_data",
        "liveness_passed": True
    })
    assert res.status_code == 403
    assert "FACE LOGIN DENIED" in res.json()["detail"]
    assert "You must click 'Register Face' first" in res.json()["detail"]

def test_doctor_face_registration_and_login_flow():
    # 1. Register Doctor Face
    reg_res = client.post("/api/v1/auth/register-face", json={
        "account_id": "doctor_demo",
        "face_image_b64": "doctor_sarah_lin_face_b64_stream",
        "user_role": "DOCTOR"
    })
    assert reg_res.status_code == 200
    assert reg_res.json()["success"] is True

    # 2. Check registration status
    status_res = client.get("/api/v1/auth/face-status/doctor_demo")
    assert status_res.status_code == 200
    assert status_res.json()["registered"] is True

    # 3. Doctor Face Login with matching face
    login_res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "doctor_demo",
        "face_image_b64": "doctor_sarah_lin_face_b64_stream",
        "liveness_passed": True
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert data["success"] is True
    assert data["user_profile"]["role"] == "DOCTOR"
    assert data["user_profile"]["email"] == "doctor_demo"

def test_patient_face_registration_and_login_flow():
    # 1. Register Patient P001 Face
    reg_res = client.post("/api/v1/auth/register-face", json={
        "account_id": "P001",
        "face_image_b64": "patient_p001_face_b64_stream",
        "user_role": "PATIENT"
    })
    assert reg_res.status_code == 200
    assert reg_res.json()["success"] is True

    # 2. Patient P001 Face Login with matching face
    login_res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "P001",
        "face_image_b64": "patient_p001_face_b64_stream",
        "liveness_passed": True
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert data["success"] is True
    assert data["user_profile"]["patient_id"] == "P001"

def test_unmatched_face_login_denied():
    # Register P003
    client.post("/api/v1/auth/register-face", json={
        "account_id": "P003",
        "face_image_b64": "patient_p003_registered_face",
        "user_role": "PATIENT"
    })

    # Login attempt with unmatched face
    res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "P003",
        "face_image_b64": "UNMATCHED_FACE_SAMPLE",
        "liveness_passed": True
    })
    assert res.status_code == 401
    assert "FACE LOGIN DENIED" in res.json()["detail"]

def test_cross_account_face_isolation():
    # Register Doctor Demo and Patient P002 separately
    client.post("/api/v1/auth/register-face", json={
        "account_id": "doctor_demo",
        "face_image_b64": "doctor_face_sample_data_xyz",
        "user_role": "DOCTOR"
    })
    client.post("/api/v1/auth/register-face", json={
        "account_id": "P002",
        "face_image_b64": "patient_p002_face_sample_data_abc",
        "user_role": "PATIENT"
    })

    # Attempting to use Doctor's face stream to authenticate Patient P002 must fail
    res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "P002",
        "face_image_b64": "DIFFERENT_FACE_TRYING_P002",
        "liveness_passed": True
    })
    assert res.status_code == 401
    assert "FACE LOGIN DENIED" in res.json()["detail"]

def test_verify_face_liveness_failure():
    # Register account first
    client.post("/api/v1/auth/register-face", json={
        "account_id": "doctor_demo",
        "face_image_b64": "doctor_face_sample_data_xyz",
        "user_role": "DOCTOR"
    })

    res = client.post("/api/v1/auth/verify-face", json={
        "account_id": "doctor_demo",
        "face_image_b64": "doctor_face_sample_data_xyz",
        "liveness_passed": False
    })
    assert res.status_code == 401
    assert "Liveness check failed" in res.json()["detail"]
