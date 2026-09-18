import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent
from app.security_engine.attack_path_engine import evaluate_attack_path

client = TestClient(app)

def test_attack_path_aw07_ward_reachability():
    """
    Validation Scenario 1:
    Admin Workstation AW-07 routes across Admin VLAN through gateway to reachable Ward asset.
    """
    res_start = client.post("/api/v1/devices/AW-07/attack/start", json={
        "attack_type": "DATA_EXFILTRATION",
        "intensity": "HIGH"
    })
    assert res_start.status_code == 200

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "AW-07"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "attack_path" in data["intelligence"]
        path_data = data["intelligence"]["attack_path"]

        assert path_data["status"] == "AVAILABLE"
        assert path_data["is_quarantined"] is False
        assert len(path_data["path_nodes"]) >= 3

        # First node is source AW-07
        assert path_data["path_nodes"][0]["id"] == "AW-07"
        assert path_data["path_nodes"][0]["type"] == "SOURCE"

        # Reachable asset on path
        node_ids = [n["id"] for n in path_data["path_nodes"]]
        assert "NET-ADMIN-VLAN" in node_ids
        assert "VLAN-GW-01" in node_ids
        assert "PM-01" in node_ids
    finally:
        client.post("/api/v1/devices/AW-07/attack/stop")
        db.close()


def test_attack_path_pm01_core_reachability():
    """
    Validation Scenario 2:
    Patient Monitor PM-01 routes across Ward VLAN through gateway toward Central EHR Database.
    """
    res_start = client.post("/api/v1/devices/PM-01/attack/start", json={
        "attack_type": "SUSPICIOUS_DATA_ACCESS",
        "intensity": "HIGH"
    })
    assert res_start.status_code == 200

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "PM-01"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "attack_path" in data["intelligence"]
        path_data = data["intelligence"]["attack_path"]

        assert path_data["status"] == "AVAILABLE"
        assert path_data["path_nodes"][0]["id"] == "PM-01"
        assert path_data["path_nodes"][0]["type"] == "SOURCE"

        node_ids = [n["id"] for n in path_data["path_nodes"]]
        assert "NET-WARD-VLAN" in node_ids
        assert "VLAN-GW-01" in node_ids
        assert "EHR-DB-01" in node_ids
    finally:
        client.post("/api/v1/devices/PM-01/attack/stop")
        db.close()


def test_attack_path_vu04_icu_reachability():
    """
    Validation Scenario 3:
    ICU Ventilator VU-04 communicates over ICU VLAN to reachable adjacent ICU bedside monitor.
    """
    res_start = client.post("/api/v1/devices/VU-04/attack/start", json={
        "attack_type": "BRUTE_FORCE",
        "intensity": "HIGH"
    })
    assert res_start.status_code == 200

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "VU-04"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "attack_path" in data["intelligence"]
        path_data = data["intelligence"]["attack_path"]

        assert path_data["status"] == "AVAILABLE"
        assert path_data["path_nodes"][0]["id"] == "VU-04"
        assert path_data["path_nodes"][0]["type"] == "SOURCE"

        node_ids = [n["id"] for n in path_data["path_nodes"]]
        assert "NET-ICU-VLAN" in node_ids
        assert "PM-04" in node_ids
    finally:
        client.post("/api/v1/devices/VU-04/attack/stop")
        db.close()


def test_attack_path_unmapped_device_insufficient_topology():
    """
    Tests that unmapped or missing devices return UNAVAILABLE with the mandatory text.
    """
    db = SessionLocal()
    try:
        path_data = evaluate_attack_path(
            db=db,
            incident_context={"device_id": "DEV-UNKNOWN-9999"}
        )
        assert path_data["status"] == "UNAVAILABLE"
        assert path_data["reason"] == "Insufficient topology data for path reconstruction."
        assert len(path_data["path_nodes"]) == 0
    finally:
        db.close()


def test_attack_path_quarantined_device():
    """
    Tests that isolated devices have traversal restricted at the quarantine boundary.
    """
    db = SessionLocal()
    try:
        dev = db.query(Device).filter(Device.device_id == "AW-07").first()
        assert dev is not None
        original_status = dev.status
        dev.status = "ISOLATED"
        db.commit()

        path_data = evaluate_attack_path(
            db=db,
            incident_context={"device_id": "AW-07"}
        )
        assert path_data["status"] == "RESTRICTED"
        assert path_data["is_quarantined"] is True
        assert "quarantine" in path_data["reason"].lower()

        # Restore
        dev.status = original_status
        db.commit()
    finally:
        db.close()


def test_attack_path_deterministic_reproducibility():
    """
    Verifies that calling evaluate_attack_path multiple times returns identical paths.
    """
    db = SessionLocal()
    try:
        res1 = evaluate_attack_path(db, {"device_id": "AW-07", "hospital_zone": "ZONE-NURSE"})
        res2 = evaluate_attack_path(db, {"device_id": "AW-07", "hospital_zone": "ZONE-NURSE"})

        ids1 = [n["id"] for n in res1["path_nodes"]]
        ids2 = [n["id"] for n in res2["path_nodes"]]
        assert ids1 == ids2
    finally:
        db.close()
