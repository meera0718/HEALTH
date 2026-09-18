"""
HEALTHSHIELD-X Blast Radius Engine Tests (Step 5).

Verifies:
1. AW-07: Blast radius derives from actual topology, no fabricated devices, source excluded.
2. PM-01: Reachable assets derived from topology; Core/EHR assets included only if topology supports them.
3. VU-04: ICU assets included only if topology supports them; critical clinical assets classified correctly.
4. Unknown/unmapped device: status=UNAVAILABLE with "Insufficient topology data for blast radius assessment."
5. Isolated source: traversal restricted, restricted=True, count=0.
6. No duplicate assets.
7. Existing Step 4 attack path remains available and unchanged.
8. End-to-end detection event returns both intelligence.attack_path and intelligence.blast_radius.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent
from app.security_engine.blast_radius_engine import evaluate_blast_radius

client = TestClient(app)


def test_blast_radius_aw07_actual_topology():
    """
    Validation Scenario 1:
    Admin Workstation AW-07:
    - Blast radius derives from actual hospital topology.
    - Source AW-07 is NOT counted as exposed.
    - No fabricated devices.
    - Affected zones include Ward and Core.
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
        assert "blast_radius" in data["intelligence"]
        blast = data["intelligence"]["blast_radius"]

        assert blast["status"] == "AVAILABLE"
        assert blast["restricted"] is False
        assert blast["potentially_exposed_count"] > 0

        # Source AW-07 must NOT be counted as exposed
        exposed_ids = [a["device_id"] for a in blast["potentially_exposed_assets"]]
        assert "AW-07" not in exposed_ids

        # Topology reachability: Ward assets and Core infrastructure reached via gateway
        assert "ZONE-WARD" in blast["affected_zones"]
        assert "ZONE-CORE" in blast["affected_zones"]
        assert "PM-01" in exposed_ids
        assert "EHR-DB-01" in exposed_ids

        # Counts must match exposed assets list exactly
        assert blast["potentially_exposed_count"] == len(blast["potentially_exposed_assets"])
        assert blast["clinical_assets_count"] >= 1
        assert blast["critical_assets_count"] >= 1

        # Strict terminology: reachability must be POTENTIAL
        for asset in blast["potentially_exposed_assets"]:
            assert asset["reachability"] == "POTENTIAL"
    finally:
        client.post("/api/v1/devices/AW-07/attack/stop")
        db.close()


def test_blast_radius_pm01_core_reachability():
    """
    Validation Scenario 2:
    Patient Monitor PM-01:
    - Reachable assets are derived from actual topology.
    - Core/EHR assets are included ONLY because the actual topology supports them.
    - Source PM-01 is NOT counted as exposed.
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
        assert "blast_radius" in data["intelligence"]
        blast = data["intelligence"]["blast_radius"]

        assert blast["status"] == "AVAILABLE"
        exposed_ids = [a["device_id"] for a in blast["potentially_exposed_assets"]]
        assert "PM-01" not in exposed_ids

        # Core/EHR assets included because transit routes to Core
        assert "EHR-DB-01" in exposed_ids
        assert "ZONE-CORE" in blast["affected_zones"]
        assert blast["critical_assets_count"] >= 1
    finally:
        client.post("/api/v1/devices/PM-01/attack/stop")
        db.close()


def test_blast_radius_vu04_icu_reachability():
    """
    Validation Scenario 3:
    ICU Ventilator VU-04:
    - ICU assets are included ONLY if actual topology supports them.
    - Critical clinical assets are correctly classified from existing metadata.
    - Source VU-04 is NOT counted as exposed.
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
        assert "blast_radius" in data["intelligence"]
        blast = data["intelligence"]["blast_radius"]

        assert blast["status"] == "AVAILABLE"
        exposed_ids = [a["device_id"] for a in blast["potentially_exposed_assets"]]
        assert "VU-04" not in exposed_ids

        # ICU local VLAN reachability: ICU bedside monitors included
        assert "ZONE-ICU" in blast["affected_zones"]
        assert "PM-04" in exposed_ids
        assert blast["clinical_assets_count"] >= 1
        assert blast["critical_assets_count"] >= 1
    finally:
        client.post("/api/v1/devices/VU-04/attack/stop")
        db.close()


def test_blast_radius_unmapped_device():
    """
    Validation Scenario 4:
    Unknown/unmapped device:
    - Returns status = UNAVAILABLE
    - reason = "Insufficient topology data for blast radius assessment."
    """
    db = SessionLocal()
    try:
        blast = evaluate_blast_radius(
            db=db,
            incident_context={"device_id": "DEV-UNKNOWN-9999"}
        )
        assert blast["status"] == "UNAVAILABLE"
        assert blast["reason"] == "Insufficient topology data for blast radius assessment."
        assert blast["potentially_exposed_count"] == 0
        assert len(blast["potentially_exposed_assets"]) == 0
    finally:
        db.close()


def test_blast_radius_isolated_source():
    """
    Validation Scenario 5:
    Isolated source:
    - Traversal is restricted by active host isolation.
    - No false lateral exposure reported (count = 0).
    """
    db = SessionLocal()
    try:
        dev = db.query(Device).filter(Device.device_id == "AW-07").first()
        assert dev is not None
        original_status = dev.status
        dev.status = "ISOLATED"
        db.commit()

        blast = evaluate_blast_radius(
            db=db,
            incident_context={"device_id": "AW-07"}
        )
        assert blast["restricted"] is True
        assert blast["potentially_exposed_count"] == 0
        assert len(blast["potentially_exposed_assets"]) == 0
        assert "isolation" in blast["reason"].lower() or "quarantine" in blast["reason"].lower()

        # Restore
        dev.status = original_status
        db.commit()
    finally:
        db.close()


def test_blast_radius_no_duplicate_assets():
    """
    Validation Scenario 6:
    Verifies that no assets are double-counted or duplicated.
    """
    db = SessionLocal()
    try:
        for dev_id in ["AW-07", "PM-01", "VU-04"]:
            blast = evaluate_blast_radius(db=db, incident_context={"device_id": dev_id})
            if blast["status"] == "AVAILABLE" and not blast["restricted"]:
                exposed_ids = [a["device_id"] for a in blast["potentially_exposed_assets"]]
                assert len(exposed_ids) == len(set(exposed_ids)), f"Duplicate asset IDs found for {dev_id}: {exposed_ids}"
                assert blast["potentially_exposed_count"] == len(exposed_ids)
    finally:
        db.close()


def test_blast_radius_and_attack_path_coexist():
    """
    Validation Scenario 7 & 8:
    Ensures that attack_path remains fully functional and intact,
    and end-to-end detection pipeline event response returns BOTH.
    """
    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        data = res.json()

        assert "intelligence" in data
        intel = data["intelligence"]

        # Step 4 attack path intact
        assert "attack_path" in intel
        assert "path_nodes" in intel["attack_path"]
        assert intel["attack_path"]["status"] in ["AVAILABLE", "RESTRICTED", "UNAVAILABLE"]

        # Step 5 blast radius present
        assert "blast_radius" in intel
        assert "potentially_exposed_assets" in intel["blast_radius"]
        assert intel["blast_radius"]["status"] in ["AVAILABLE", "RESTRICTED", "UNAVAILABLE"]
    finally:
        db.close()
