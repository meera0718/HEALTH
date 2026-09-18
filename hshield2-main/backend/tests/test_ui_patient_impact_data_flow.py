import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent

client = TestClient(app)

def test_actual_admin_workstation_incident_flow():
    """
    1. Triggers a real attack on administrative workstation AW-07.
    2. Fetches the detection pipeline output.
    3. Verifies that intelligence.patient_impact reflects low criticality and low disruption.
    """
    # Start attack on administrative workstation AW-07
    res_start = client.post("/api/v1/devices/AW-07/attack/start", json={
        "attack_type": "DATA_EXFILTRATION",
        "intensity": "HIGH"
    })
    assert res_start.status_code == 200

    db = SessionLocal()
    try:
        # Get latest event for AW-07
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "AW-07"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None, "Real event for AW-07 must exist in database"

        # Query detection-pipeline by event_id (the exact endpoint consumed by frontend)
        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "patient_impact" in data["intelligence"]
        impact = data["intelligence"]["patient_impact"]

        assert impact["device_criticality"] == "LOW"
        assert impact["patient_dependency"] == "LOW"
        assert impact["operational_disruption"] == "LOW"
        assert impact["impact_level"] == "LOW"
        assert impact["impact_score"] < 35.0
    finally:
        client.post("/api/v1/devices/AW-07/attack/stop")
        db.close()


def test_actual_clinical_patient_monitor_incident_flow():
    """
    1. Triggers a real attack on ward patient monitor PM-01.
    2. Fetches the detection pipeline output.
    3. Verifies that intelligence.patient_impact dynamically shifts to HIGH impact.
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
        assert evt is not None, "Real event for PM-01 must exist in database"

        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "patient_impact" in data["intelligence"]
        impact = data["intelligence"]["patient_impact"]

        assert impact["device_criticality"] == "HIGH"
        assert impact["service_criticality"] == "MODERATE"
        assert impact["patient_dependency"] == "HIGH"
        assert impact["operational_disruption"] == "MODERATE"
        assert impact["impact_level"] == "HIGH"
        assert 60.0 <= impact["impact_score"] < 80.0
    finally:
        client.post("/api/v1/devices/PM-01/attack/stop")
        db.close()


def test_actual_critical_icu_ventilator_incident_flow():
    """
    1. Triggers a real attack on critical ICU ventilator VU-04.
    2. Fetches the detection pipeline output.
    3. Verifies that intelligence.patient_impact dynamically shifts to CRITICAL impact.
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
        assert evt is not None, "Real event for VU-04 must exist in database"

        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res_pipe.status_code == 200
        data = res_pipe.json()

        assert "intelligence" in data
        assert "patient_impact" in data["intelligence"]
        impact = data["intelligence"]["patient_impact"]

        assert impact["device_criticality"] == "CRITICAL"
        assert impact["service_criticality"] == "CRITICAL"
        assert impact["patient_dependency"] == "CRITICAL"
        assert impact["operational_disruption"] == "HIGH"
        assert impact["impact_level"] == "CRITICAL"
        assert impact["impact_score"] >= 80.0
    finally:
        client.post("/api/v1/devices/VU-04/attack/stop")
        db.close()
