import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent
from app.api.routes.digital_twin import ZONE_MAPPINGS

client = TestClient(app)

EXPECTED_EXISTING_KEYS = [
    "event_id",
    "patient_id",
    "scenario",
    "event_type",
    "severity",
    "timestamp",
    "endpoint",
    "feature_vector",
    "honeypot",
    "feature_engine",
    "fec",
    "ocsvm",
    "isolation_forest",
    "xgboost",
    "fusion",
    "threat_assessment",
    "detection_id",
    "started_at",
    "stage_details"
]

def test_intelligence_layer_additive_contract():
    """
    Simulates a real attack (DATA_EXFILTRATION) on patient P003.
    Verifies that:
    1. All 19 existing keys are preserved intact.
    2. 'intelligence' block is added additively.
    3. Threat context values match actual pipeline numbers dynamically (not hardcoded).
    4. Incident context reflects real event metadata.
    """
    # 1. Trigger live Honeypot simulation
    res_sim = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "DATA_EXFILTRATION"
    })
    assert res_sim.status_code == 200
    sim_data = res_sim.json()
    evt_id = sim_data["event"]["event_id"]

    # 2. Query detection-pipeline by event_id
    res_pipe = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert res_pipe.status_code == 200
    pipe_data = res_pipe.json()

    # 3. Assert all existing keys remain unchanged
    for key in EXPECTED_EXISTING_KEYS:
        assert key in pipe_data, f"Existing key '{key}' was lost from data contract!"

    # 4. Assert 'intelligence' block exists
    assert "intelligence" in pipe_data, "'intelligence' key missing from detection pipeline response!"
    intel = pipe_data["intelligence"]

    assert "incident_context" in intel
    assert "threat_context" in intel
    assert intel["status"] == "READY"

    # 5. Verify incident context
    inc_ctx = intel["incident_context"]
    assert inc_ctx["event_id"] == evt_id
    assert inc_ctx["scenario"] == "DATA_EXFILTRATION"
    assert inc_ctx["event_type"] == "DATA_EXPORT"
    assert inc_ctx["severity"] == "HIGH"
    assert bool(inc_ctx["device_id"])
    assert bool(inc_ctx["device_type"])
    assert inc_ctx["hospital_zone"] in ["ZONE-ICU", "ZONE-NURSE", "ZONE-WARD", "ZONE-CORE"]

    # 6. Verify threat context matches actual pipeline numbers dynamically
    thr_ctx = intel["threat_context"]
    assert thr_ctx["fusion_result"] == pipe_data["fusion"]["result"]
    assert thr_ctx["threat_index"] == pipe_data["fusion"]["threat_index"]
    assert thr_ctx["model_agreement"] == pipe_data["fusion"]["model_agreement"]
    assert thr_ctx["evidence_strength"] == pipe_data["fusion"]["evidence_strength"]
    assert thr_ctx["fec_score"] == pipe_data["fec"]["fec_score"]


def test_intelligence_device_and_zone_resolution():
    """
    Verifies that a device attack targeting PM-04 resolves directly to:
    - device_id: PM-04
    - device_type: Patient Monitor
    - hospital_zone: ZONE-ICU
    strictly derived from Device table and ZONE_MAPPINGS.
    """
    db = SessionLocal()
    try:
        device = db.query(Device).filter(Device.device_id == "PM-04").first()
        assert device is not None, "Device PM-04 must exist in seeds."

        # Start device attack which creates real device events
        res_attack = client.post("/api/v1/devices/PM-04/attack/start", json={
            "attack_type": "DATA_EXFILTRATION",
            "intensity": "HIGH"
        })
        assert res_attack.status_code == 200

        # Retrieve the latest event generated for PM-04
        latest_evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "PM-04"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert latest_evt is not None

        # Query pipeline for this event
        res_pipe = client.get(f"/api/v1/detection-pipeline/event/{latest_evt.event_id}")
        assert res_pipe.status_code == 200
        pipe_data = res_pipe.json()

        assert "intelligence" in pipe_data
        intel = pipe_data["intelligence"]
        inc_ctx = intel["incident_context"]

        assert inc_ctx["device_id"] == "PM-04"
        assert inc_ctx["device_type"] == "Patient Monitor"
        assert inc_ctx["hospital_zone"] == "ZONE-ICU"
    finally:
        # Clean up attack state
        client.post("/api/v1/devices/PM-04/attack/stop")
        db.close()


def test_simulation_response_includes_intelligence():
    """
    Verifies that the /api/v1/honeypot/simulate endpoint response itself
    includes the new intelligence block inside its fusion_pipeline payload.
    """
    res_sim = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P005",
        "scenario": "BRUTE_FORCE"
    })
    assert res_sim.status_code == 200
    sim_data = res_sim.json()

    assert "fusion_pipeline" in sim_data
    fusion_pipeline = sim_data["fusion_pipeline"]
    assert "intelligence" in fusion_pipeline
    assert fusion_pipeline["intelligence"]["status"] == "READY"
    assert fusion_pipeline["intelligence"]["threat_context"]["threat_index"] == fusion_pipeline["fusion"]["threat_index"]
