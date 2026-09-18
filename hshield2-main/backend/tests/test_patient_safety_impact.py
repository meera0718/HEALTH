import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent
from app.security_engine.intelligence_layer import evaluate_patient_safety_impact

client = TestClient(app)

EXPECTED_TOP_LEVEL_KEYS = [
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
    "stage_details",
    "intelligence"
]

def test_patient_safety_impact_three_cases():
    """
    Validates the three distinct asset categories:
    1. Low-criticality administrative workstation (AW-07)
    2. Patient monitor in general ward (PM-01)
    3. Critical ICU ventilator (VU-04) / ICU monitor (PM-04)
    """
    db = SessionLocal()
    try:
        dummy_threat = {
            "fusion_result": "THREAT",
            "threat_index": 76.1,
            "model_agreement": "3/3",
            "evidence_strength": "HIGH",
            "fec_score": 65.0
        }

        # --- Case 1: Low-criticality Administrative Workstation (AW-07) ---
        aw_ctx = {
            "event_id": "EVT-TEST-AW07",
            "device_id": "AW-07",
            "device_type": "Admin Workstation",
            "hospital_zone": "ZONE-NURSE",
            "scenario": "DATA_EXFILTRATION",
            "event_type": "DATA_EXPORT",
            "severity": "HIGH",
            "timestamp": "2026-09-16T12:00:00Z"
        }
        impact_case1 = evaluate_patient_safety_impact(db, aw_ctx, dummy_threat)
        assert impact_case1["device_criticality"] == "LOW"
        assert impact_case1["patient_dependency"] == "LOW"
        assert impact_case1["operational_disruption"] == "LOW"
        assert impact_case1["impact_level"] == "LOW"
        assert impact_case1["impact_score"] < 35.0

        # --- Case 2: Clinical Device in General Ward (PM-01) ---
        pm01_ctx = {
            "event_id": "EVT-TEST-PM01",
            "device_id": "PM-01",
            "device_type": "Patient Monitor",
            "hospital_zone": "ZONE-WARD",
            "scenario": "SUSPICIOUS_DATA_ACCESS",
            "event_type": "SUSPICIOUS_DATA_ACCESS",
            "severity": "HIGH",
            "timestamp": "2026-09-16T12:00:00Z"
        }
        impact_case2 = evaluate_patient_safety_impact(db, pm01_ctx, dummy_threat)
        assert impact_case2["device_criticality"] == "HIGH"
        assert impact_case2["service_criticality"] == "MODERATE"
        assert impact_case2["patient_dependency"] == "HIGH"
        assert impact_case2["operational_disruption"] == "MODERATE"
        assert impact_case2["impact_level"] == "HIGH"
        assert 60.0 <= impact_case2["impact_score"] < 80.0

        # --- Case 3: Critical ICU Ventilator (VU-04) ---
        vu04_ctx = {
            "event_id": "EVT-TEST-VU04",
            "device_id": "VU-04",
            "device_type": "Ventilator",
            "hospital_zone": "ZONE-ICU",
            "scenario": "BRUTE_FORCE",
            "event_type": "FAILED_LOGIN",
            "severity": "CRITICAL",
            "timestamp": "2026-09-16T12:00:00Z"
        }
        impact_case3 = evaluate_patient_safety_impact(db, vu04_ctx, dummy_threat)
        assert impact_case3["device_criticality"] == "CRITICAL"
        assert impact_case3["service_criticality"] == "CRITICAL"
        assert impact_case3["patient_dependency"] == "CRITICAL"
        assert impact_case3["operational_disruption"] == "HIGH"
        assert impact_case3["impact_level"] == "CRITICAL"
        assert impact_case3["impact_score"] >= 80.0

        # Verify impact scores order: Case 1 (Admin) < Case 2 (Ward Monitor) < Case 3 (ICU Ventilator)
        assert impact_case1["impact_score"] < impact_case2["impact_score"] < impact_case3["impact_score"]
    finally:
        db.close()


def test_metadata_driven_scoring_independence():
    """
    Confirms scoring is strictly metadata-driven and not hardcoded to specific IDs:
    1. An arbitrary device ID 'DEV-X99' with 'Admin Workstation' metadata yields LOW.
    2. An arbitrary device ID 'DEV-X99' with 'Ventilator' metadata yields CRITICAL.
    3. Changing only event_id for the same asset yields identical impact scores.
    """
    db = SessionLocal()
    try:
        dummy_threat = {
            "fusion_result": "THREAT",
            "threat_index": 70.0,
            "model_agreement": "2/3",
            "evidence_strength": "HIGH",
            "fec_score": 50.0
        }

        # Dynamic Test A: DEV-X99 as Admin Workstation in Ward
        ctx_admin = {
            "event_id": "EVT-ALPHA-01",
            "device_id": "DEV-X99",
            "device_type": "Admin Workstation",
            "hospital_zone": "ZONE-WARD",
            "scenario": "RECONNAISSANCE",
            "event_type": "ENDPOINT_DISCOVERY",
            "severity": "MEDIUM",
            "timestamp": "2026-09-16T10:00:00Z"
        }
        score_admin = evaluate_patient_safety_impact(db, ctx_admin, dummy_threat)

        # Dynamic Test B: Exact same DEV-X99 changed to Ventilator in ZONE-ICU
        ctx_vent = {
            "event_id": "EVT-ALPHA-01",
            "device_id": "DEV-X99",
            "device_type": "Ventilator Unit",
            "hospital_zone": "ZONE-ICU",
            "scenario": "RECONNAISSANCE",
            "event_type": "ENDPOINT_DISCOVERY",
            "severity": "MEDIUM",
            "timestamp": "2026-09-16T10:00:00Z"
        }
        score_vent = evaluate_patient_safety_impact(db, ctx_vent, dummy_threat)

        assert score_admin["impact_level"] == "LOW"
        assert score_vent["impact_level"] == "CRITICAL"
        assert score_vent["impact_score"] > score_admin["impact_score"] + 50.0

        # Dynamic Test C: Changing only event_id yields identical deterministic score
        ctx_admin_evt2 = dict(ctx_admin)
        ctx_admin_evt2["event_id"] = "EVT-OMEGA-99"
        score_admin_evt2 = evaluate_patient_safety_impact(db, ctx_admin_evt2, dummy_threat)

        assert score_admin["impact_score"] == score_admin_evt2["impact_score"]
        assert score_admin["device_criticality"] == score_admin_evt2["device_criticality"]
        assert score_admin["patient_dependency"] == score_admin_evt2["patient_dependency"]
    finally:
        db.close()


def test_safety_preservation_and_non_harm_disclaimer():
    """
    Verifies that clinical safety preservation guidance is explicitly included
    and that no medical harm claims are made.
    """
    db = SessionLocal()
    try:
        clinical_ctx = {
            "event_id": "EVT-TEST-SAFE",
            "device_id": "IP-08",
            "device_type": "Infusion Pump",
            "hospital_zone": "ZONE-ICU",
            "scenario": "DATA_EXFILTRATION",
            "event_type": "DATA_EXPORT",
            "severity": "HIGH",
            "timestamp": "2026-09-16T15:00:00Z"
        }
        dummy_threat = {"evidence_strength": "HIGH", "threat_index": 80.0}
        res = evaluate_patient_safety_impact(db, clinical_ctx, dummy_threat)

        rationale_text = " ".join(res["rationale"])

        # Check clinical preservation wording
        assert "Clinical Preservation Notice" in rationale_text
        assert "Restrict or isolate suspicious network communication while preserving clinical operation" in rationale_text
        assert "must not be powered off" in rationale_text

        # Check non-harm disclaimer
        assert "does not claim patient harm has occurred" in rationale_text
        assert "does not represent a medical harm probability" in rationale_text
    finally:
        db.close()


def test_end_to_end_detection_pipeline_with_patient_impact():
    """
    Triggers a live Honeypot simulation attack, fetches the detection-pipeline
    response, and confirms:
    1. All 19 existing keys are present and unchanged.
    2. 'intelligence' contains both 'incident_context', 'threat_context', and 'patient_impact'.
    3. 'patient_impact' fields match the contract specification.
    """
    sim_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P008",
        "scenario": "DATA_EXFILTRATION"
    })
    assert sim_res.status_code == 200
    evt_id = sim_res.json()["event"]["event_id"]

    pipe_res = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert pipe_res.status_code == 200
    data = pipe_res.json()

    # Confirm all existing top-level keys
    for k in EXPECTED_TOP_LEVEL_KEYS:
        assert k in data, f"Key '{k}' missing from data contract!"

    # Confirm intelligence sub-blocks
    intel = data["intelligence"]
    assert "incident_context" in intel
    assert "threat_context" in intel
    assert "patient_impact" in intel

    impact = intel["patient_impact"]
    assert "impact_score" in impact
    assert "impact_level" in impact
    assert "device_criticality" in impact
    assert "service_criticality" in impact
    assert "patient_dependency" in impact
    assert "operational_disruption" in impact
    assert "rationale" in impact
    assert "confidence" in impact

    assert isinstance(impact["impact_score"], (int, float))
    assert impact["impact_level"] in ["LOW", "MODERATE", "HIGH", "CRITICAL"]
    assert isinstance(impact["rationale"], list)
    assert len(impact["rationale"]) >= 4
    assert impact["confidence"] == data["threat_assessment"]["evidence_strength"]
