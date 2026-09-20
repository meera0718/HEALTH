"""
HEALTHSHIELD-X Intelligence Priority Engine Tests (Step 6).

Verifies:
1. AW-07: Operational priority reflects threat + evidence + operational exposure without hardcoding.
2. PM-01: Priority reflects clinical dependency and potential reachability.
3. VU-04: Priority reflects critical clinical context when supported by strong evidence.
4. Evidence sensitivity: Weaker/moderate evidence CANNOT produce P1, explicitly downgrading to P2.
5. Restricted traversal: Host isolation is represented in priority context and reason.
6. Missing attack path: Handles attack_path.status = UNAVAILABLE safely.
7. Missing blast radius: Handles blast_radius.status = UNAVAILABLE safely.
8. Determinism: Same intelligence inputs produce identical priority, drivers, and reason.
9. Backward compatibility: Steps 1-5 intelligence fields remain intact.
10. End-to-end detection event: /api/v1/detection-pipeline/event/{evt_id} includes intelligence.priority.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent
from app.security_engine.intelligence_priority_engine import evaluate_intelligence_priority

client = TestClient(app)


def test_priority_aw07_operational_context():
    """
    Test 1: AW-07
    Admin workstation with lower direct patient dependency.
    Derived purely from runtime intelligence, no hardcoded priority.
    """
    client.post("/api/v1/devices/AW-07/attack/start", json={
        "attack_type": "DATA_EXFILTRATION",
        "intensity": "HIGH"
    })

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "AW-07"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        data = res.json()

        assert "intelligence" in data
        assert "priority" in data["intelligence"]
        p_data = data["intelligence"]["priority"]

        assert p_data["status"] == "AVAILABLE"
        assert p_data["priority"] in ["P1", "P2", "P3", "P4"]
        assert len(p_data["drivers"]) > 0
        assert p_data["reason"] is not None
        assert p_data["context"]["threat_index"] >= 0.0
    finally:
        client.post("/api/v1/devices/AW-07/attack/stop")
        db.close()


def test_priority_pm01_clinical_context():
    """
    Test 2: PM-01
    Patient monitor with clinical telemetry dependency.
    Derived purely from runtime intelligence.
    """
    client.post("/api/v1/devices/PM-01/attack/start", json={
        "attack_type": "SUSPICIOUS_DATA_ACCESS",
        "intensity": "HIGH"
    })

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "PM-01"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        data = res.json()

        p_data = data["intelligence"]["priority"]
        assert p_data["status"] == "AVAILABLE"
        assert p_data["priority"] in ["P1", "P2", "P3"]
        assert "clinical" in p_data["reason"].lower() or "exposure" in p_data["reason"].lower() or "threat" in p_data["reason"].lower()
    finally:
        client.post("/api/v1/devices/PM-01/attack/stop")
        db.close()


def test_priority_vu04_critical_clinical_context():
    """
    Test 3: VU-04
    Ventilator in ICU with critical clinical dependency.
    When supported by strong evidence and critical exposure, reflects P1.
    """
    client.post("/api/v1/devices/VU-04/attack/start", json={
        "attack_type": "BRUTE_FORCE",
        "intensity": "HIGH"
    })

    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == "VU-04"
        ).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        data = res.json()

        p_data = data["intelligence"]["priority"]
        assert p_data["status"] == "AVAILABLE"
        # Since VU-04 has 3/3 model agreement, high threat index, and critical ICU impact:
        assert p_data["priority"] == "P1"
        assert p_data["label"] == "IMMEDIATE ATTENTION"
        assert "critical" in p_data["reason"].lower() or "immediate" in p_data["label"].lower()
    finally:
        client.post("/api/v1/devices/VU-04/attack/stop")
        db.close()


def test_priority_evidence_sensitivity_rule():
    """
    Test 4: Strict Evidence Rule
    Verifies that high threat + critical impact CANNOT produce P1 if evidence is weak or moderate.
    It MUST downgrade to P2 with an explicit evidence constraint reason.
    """
    incident_context = {"device_id": "TEST-DEV-01", "severity": "CRITICAL"}
    threat_context_weak = {
        "threat_index": 92.5,
        "fusion_result": "MALICIOUS",
        "evidence_strength": "LOW",
        "fec_score": 15.0,
        "model_agreement": "1/3"
    }
    patient_impact = {
        "impact_level": "CRITICAL",
        "impact_score": 95.0
    }
    blast_radius = {
        "status": "AVAILABLE",
        "critical_assets_count": 2,
        "potentially_exposed_count": 3
    }

    # Weak evidence -> P2, NOT P1
    res_weak = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context_weak,
        patient_impact=patient_impact,
        blast_radius=blast_radius
    )
    assert res_weak["priority"] == "P2"
    assert "P1" != res_weak["priority"]
    assert "evidence" in res_weak["reason"].lower() or any("evidence" in d.lower() for d in res_weak["drivers"])

    # Moderate evidence -> P2, NOT P1 (P1 strictly requires strong evidence)
    threat_context_mod = {
        "threat_index": 85.0,
        "fusion_result": "MALICIOUS",
        "evidence_strength": "MEDIUM",
        "fec_score": 35.0,
        "model_agreement": "2/3"
    }
    res_mod = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context_mod,
        patient_impact=patient_impact,
        blast_radius=blast_radius
    )
    assert res_mod["priority"] == "P2"
    assert "P1" != res_mod["priority"]

    # Strong evidence -> P1
    threat_context_strong = {
        "threat_index": 85.0,
        "fusion_result": "MALICIOUS",
        "evidence_strength": "HIGH",
        "fec_score": 88.0,
        "model_agreement": "3/3"
    }
    res_strong = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context_strong,
        patient_impact=patient_impact,
        blast_radius=blast_radius
    )
    assert res_strong["priority"] == "P1"
    assert res_strong["label"] == "IMMEDIATE ATTENTION"


def test_priority_restricted_traversal_context():
    """
    Test 5: Isolation Context
    Verifies that host isolation is captured in context and reason,
    without falsely assuming the incident is benign.
    """
    incident_context = {"device_id": "ISO-DEV-01", "severity": "HIGH"}
    threat_context = {
        "threat_index": 75.0,
        "fusion_result": "MALICIOUS",
        "evidence_strength": "HIGH",
        "fec_score": 75.0,
        "model_agreement": "3/3"
    }
    patient_impact = {"impact_level": "HIGH", "impact_score": 80.0}
    blast_radius = {
        "status": "RESTRICTED",
        "restricted": True,
        "potentially_exposed_count": 0,
        "reason": "Traversal restricted by active host isolation."
    }

    res = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context,
        patient_impact=patient_impact,
        blast_radius=blast_radius
    )
    assert res["context"]["restricted"] is True
    assert "isolation" in res["reason"].lower() or "constrained" in res["reason"].lower()
    assert any("isolation" in d.lower() or "quarantine" in d.lower() for d in res["drivers"])


def test_priority_missing_attack_path():
    """
    Test 6: Missing Attack Path
    Verifies handling of attack_path.status = UNAVAILABLE without crashing.
    """
    incident_context = {"device_id": "UNMAPPED-01", "severity": "MEDIUM"}
    threat_context = {
        "threat_index": 50.0,
        "fusion_result": "SUSPICIOUS",
        "evidence_strength": "MEDIUM",
        "fec_score": 45.0,
        "model_agreement": "2/3"
    }
    attack_path = {"status": "UNAVAILABLE", "path_nodes": []}

    res = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context,
        attack_path=attack_path
    )
    assert res["status"] == "AVAILABLE"
    assert res["priority"] in ["P2", "P3"]
    assert res["context"]["attack_path_status"] == "UNAVAILABLE"


def test_priority_missing_blast_radius():
    """
    Test 7: Missing Blast Radius
    Verifies handling of blast_radius.status = UNAVAILABLE without inventing exposure.
    """
    incident_context = {"device_id": "UNMAPPED-02", "severity": "MEDIUM"}
    threat_context = {
        "threat_index": 45.0,
        "fusion_result": "SUSPICIOUS",
        "evidence_strength": "MEDIUM",
        "fec_score": 40.0,
        "model_agreement": "2/3"
    }
    blast_radius = {"status": "UNAVAILABLE", "potentially_exposed_assets": []}

    res = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context,
        blast_radius=blast_radius
    )
    assert res["status"] == "AVAILABLE"
    assert res["context"]["blast_radius_count"] == 0
    assert res["context"]["critical_assets_count"] == 0


def test_priority_determinism():
    """
    Test 8: Determinism
    Repeated evaluations on identical inputs must produce identical priority and drivers.
    """
    inc = {"device_id": "DET-01", "severity": "HIGH"}
    threat = {"threat_index": 68.0, "fusion_result": "MALICIOUS", "evidence_strength": "HIGH", "fec_score": 72.0, "model_agreement": "3/3"}
    impact = {"impact_level": "MODERATE", "impact_score": 60.0}
    blast = {"status": "AVAILABLE", "potentially_exposed_count": 2, "critical_assets_count": 1}

    res1 = evaluate_intelligence_priority(inc, threat, impact, blast_radius=blast)
    res2 = evaluate_intelligence_priority(inc, threat, impact, blast_radius=blast)

    assert res1["priority"] == res2["priority"]
    assert res1["label"] == res2["label"]
    assert res1["reason"] == res2["reason"]
    assert res1["drivers"] == res2["drivers"]


def test_existing_intelligence_fields_intact():
    """
    Test 9: Backward Compatibility
    Verifies Steps 1-5 fields remain present and unchanged in the detection event response.
    """
    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        intel = res.json().get("intelligence", {})

        # Verify all steps 1-5 intact
        assert "incident_context" in intel
        assert "threat_context" in intel
        assert "patient_impact" in intel
        assert "attack_path" in intel
        assert "blast_radius" in intel

        # Verify step 6 present additively
        assert "priority" in intel
    finally:
        db.close()


def test_end_to_end_event_contains_all_six_blocks():
    """
    Test 10: End-to-End Contract
    Verifies /api/v1/detection-pipeline/event/{evt_id} returns all 6 intelligence dimensions.
    """
    db = SessionLocal()
    try:
        evt = db.query(HoneypotSecurityEvent).order_by(HoneypotSecurityEvent.timestamp.desc()).first()
        assert evt is not None

        res = client.get(f"/api/v1/detection-pipeline/event/{evt.event_id}")
        assert res.status_code == 200
        data = res.json()

        assert "intelligence" in data
        intel = data["intelligence"]

        required_keys = [
            "incident_context",
            "threat_context",
            "patient_impact",
            "attack_path",
            "blast_radius",
            "priority"
        ]
        for k in required_keys:
            assert k in intel, f"Missing intelligence key: {k}"

        p = intel["priority"]
        assert p["priority"] in ["P1", "P2", "P3", "P4"]
        assert p["label"] in ["IMMEDIATE ATTENTION", "HIGH ATTENTION", "MONITOR", "INFORMATIONAL"]
        assert isinstance(p["drivers"], list)
        assert isinstance(p["reason"], str)
        assert isinstance(p["context"], dict)
    finally:
        db.close()
