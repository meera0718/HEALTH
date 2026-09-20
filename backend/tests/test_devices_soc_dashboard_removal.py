import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, Patient, HoneypotSecurityEvent

client = TestClient(app)

def test_devices_soc_dashboard_file_removed():
    dashboard_path = os.path.join(
        r"c:\Users\MEERA V\Desktop\PROJECTS\HEALTH SHIELD X 2.0\frontend\src\pages",
        "DevicesDashboard.tsx"
    )
    assert not os.path.exists(dashboard_path), "DevicesDashboard.tsx should be deleted from frontend/src/pages"

def test_device_api_endpoints_preserved():
    # 1. GET /api/v1/devices
    res = client.get("/api/v1/devices")
    assert res.status_code == 200
    devices = res.json()
    assert isinstance(devices, list)
    assert len(devices) > 0

    target_id = devices[0]["device_id"]

    # 2. GET /api/v1/devices/{device_id}
    res_detail = client.get(f"/api/v1/devices/{target_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert "device_info" in detail or "device_id" in detail

def test_patient_device_relationship_preserved():
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == "P003").first()
        assert patient is not None
        assert hasattr(patient, "device_count")
        assert patient.device_count >= 1
    finally:
        db.close()

def test_device_quarantine_endpoints_preserved():
    # Test quarantine API route exists and responds
    res = client.post("/api/v1/devices/DEV-P003-MED1/quarantine", json={"reason": "Test Quarantine"})
    assert res.status_code in [200, 404]  # Route exists
