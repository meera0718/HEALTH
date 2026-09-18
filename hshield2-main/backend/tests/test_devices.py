import sys
import os
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_devices_listing():
    res = client.get("/api/v1/devices")
    assert res.status_code == 200
    devices = res.json()
    assert len(devices) >= 8
    # Verify required keys
    d0 = devices[0]
    assert "device_id" in d0
    assert "device_name" in d0
    assert "device_type" in d0
    assert "ip_address" in d0
    assert "vlan" in d0
    assert "status" in d0
    assert "risk_score" in d0
    assert "fec_score" in d0
    assert "ocsvm_anomaly_score" in d0
    assert "isolation_forest_anomaly_score" in d0
    assert "xgboost_suspiciousness_score" in d0
    assert "model_agreement" in d0
    assert "threat" in d0

def test_device_detail():
    # Test detail for PM-04 or PM-01
    res = client.get("/api/v1/devices")
    devices = res.json()
    dev_id = devices[0]["device_id"]

    detail_res = client.get(f"/api/v1/devices/{dev_id}")
    assert detail_res.status_code == 200
    data = detail_res.json()
    assert "device_info" in data
    assert "features" in data
    assert "ml_fuses" in data
    assert "timeline" in data
    assert data["device_info"]["device_id"] == dev_id

def test_attack_flow_and_quarantine():
    res = client.get("/api/v1/devices")
    devices = res.json()
    target_id = devices[0]["device_id"]

    # 1. Start attack
    att_res = client.post(f"/api/v1/devices/{target_id}/attack/start", json={
        "attack_type": "DATA_EXFILTRATION",
        "intensity": "HIGH"
    })
    assert att_res.status_code == 200
    assert att_res.json()["status"] == "SUCCESS"

    # Verify device has attack active
    detail = client.get(f"/api/v1/devices/{target_id}").json()
    assert detail["device_info"]["attack_active"] is True
    assert detail["device_info"]["attack_type"] == "DATA_EXFILTRATION"

    # 2. Quarantine device
    quarantine_res = client.post(f"/api/v1/devices/{target_id}/quarantine", json={
        "reason": "Exfiltration anomaly flagged by SOC analyst"
    })
    assert quarantine_res.status_code == 200
    assert quarantine_res.json()["status"] == "SUCCESS"

    # Verify device status is ISOLATED and attack stopped
    detail_q = client.get(f"/api/v1/devices/{target_id}").json()
    assert detail_q["device_info"]["status"] == "ISOLATED"
    assert detail_q["device_info"]["attack_active"] is False
    assert detail_q["device_info"]["isolation_reason"] == "Exfiltration anomaly flagged by SOC analyst"

    # 3. Restore device
    restore_res = client.post(f"/api/v1/devices/{target_id}/restore")
    assert restore_res.status_code == 200
    detail_r = client.get(f"/api/v1/devices/{target_id}").json()
    assert detail_r["device_info"]["status"] == "SECURE"
