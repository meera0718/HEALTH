import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_digital_twin_endpoint_structure():
    response = client.get("/api/v1/digital-twin")
    assert response.status_code == 200
    data = response.json()

    # Core metadata
    assert "timestamp" in data
    assert "platform" in data
    assert "zones" in data
    assert "devices" in data
    assert "honeypots" in data
    assert "risk" in data
    assert "forensics" in data

    # 4 Zones Check
    zone_ids = [z["zone_id"] for z in data["zones"]]
    assert "ZONE-ICU" in zone_ids
    assert "ZONE-NURSE" in zone_ids
    assert "ZONE-WARD" in zone_ids
    assert "ZONE-CORE" in zone_ids

    # Monitored devices check
    assert len(data["devices"]) >= 9
    for dev in data["devices"]:
        assert "device_id" in dev
        assert "device_name" in dev
        assert "device_type" in dev
        assert "zone" in dev
        assert "status" in dev
        assert "risk_score" in dev
        assert "fec_score" in dev
        assert "ocsvm_anomaly_score" in dev
        assert "isolation_forest_anomaly_score" in dev
        assert "xgboost_suspiciousness_score" in dev
        assert "model_agreement" in dev
        assert "threat" in dev

    # Honeypot checks
    assert len(data["honeypots"]) >= 4
    decoy_ids = [h["id"] for h in data["honeypots"]]
    assert "DEC-PHARM-01" in decoy_ids
    assert "DEC-PATIENT-DB" in decoy_ids
    assert "DEC-ADMIN-07" in decoy_ids
    assert "DEC-PUMP-04" in decoy_ids

    # Risk metrics check
    risk = data["risk"]
    assert "mean_risk" in risk
    assert "peak_risk" in risk
    assert "icu_risk" in risk
    assert "critical_devices" in risk
    assert "total_monitored" in risk
    assert risk["total_monitored"] == len(data["devices"])

def test_digital_twin_attack_and_isolation_propagation():
    # 1. Start an attack on PM-04
    attack_res = client.post("/api/v1/devices/PM-04/attack/start", json={
        "attack_type": "DATA_EXFILTRATION",
        "intensity": "HIGH"
    })
    assert attack_res.status_code == 200

    # 2. Query Digital Twin state to confirm live propagation
    twin_res = client.get("/api/v1/digital-twin")
    assert twin_res.status_code == 200
    twin_data = twin_res.json()

    pm04 = next((d for d in twin_data["devices"] if d["device_id"] == "PM-04"), None)
    assert pm04 is not None
    assert pm04["attack_active"] is True
    assert pm04["attack_type"] == "DATA_EXFILTRATION"
    assert pm04["status"] in ["CRITICAL", "HIGH RISK"]
    assert pm04["ocsvm_is_anomalous"] is True

    # 3. Quarantine PM-04
    iso_res = client.post("/api/v1/devices/PM-04/quarantine", json={
        "reason": "Digital Twin Automated Containment"
    })
    assert iso_res.status_code == 200

    # 4. Check Digital Twin state reflects ISOLATED
    twin_iso_res = client.get("/api/v1/digital-twin")
    twin_iso_data = twin_iso_res.json()
    pm04_iso = next((d for d in twin_iso_data["devices"] if d["device_id"] == "PM-04"), None)
    assert pm04_iso is not None
    assert pm04_iso["status"] == "ISOLATED"

    # 5. Restore PM-04
    restore_res = client.post("/api/v1/devices/PM-04/restore")
    assert restore_res.status_code == 200
