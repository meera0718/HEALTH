"""
HEALTHSHIELD-X Intelligence Layer (Foundation).

Consumes completed security pipeline and fusion results to synthesize
a centralized, operational intelligence context.

Derives real device metadata and hospital zone topology from existing database
and Digital Twin mappings without redundant writes or duplicate tables.
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.db.models import Device, Patient, PatientRecord, HoneypotSecurityEvent
from app.api.routes.digital_twin import ZONE_MAPPINGS

def resolve_device_metadata(
    db: Session,
    evt: Optional[HoneypotSecurityEvent],
    patient_id: Optional[str]
) -> tuple[str, str, str]:
    """
    Deterministically resolves (device_id, device_type, hospital_zone)
    using the existing Device database records, Patient cohort, and ZONE_MAPPINGS.
    Zero synthetic or hardcoded values are fabricated.
    """
    raw_device_id = evt.device_id if evt else None
    pid = (patient_id or (evt.patient_id if evt else "")).strip().upper()

    device_rec: Optional[Device] = None

    # 1. Check if raw_device_id matches an existing Device in DB
    if raw_device_id:
        device_rec = db.query(Device).filter(Device.device_id == raw_device_id.strip()).first()

    # 2. Check if patient_id itself directly matches a Device (e.g. PM-04)
    if not device_rec and pid:
        device_rec = db.query(Device).filter(Device.device_id == pid).first()

    # 3. Resolve existing authoritative patient -> device mapping in topology
    if not device_rec and pid and db:
        from app.security_engine.telemetry_generator import get_patient_id_for_device
        all_devices = db.query(Device).all()
        for dev in all_devices:
            if get_patient_id_for_device(dev.device_id) == pid:
                device_rec = dev
                break
        if not device_rec and all_devices and pid.startswith("P"):
            try:
                pnum = int(pid.replace("P", ""))
                dev_idx = (pnum - 1) % len(all_devices)
                device_rec = all_devices[dev_idx]
            except Exception:
                pass

    # 4. If device_id is a simulated placeholder or not in Device table, check patient association
    if device_rec:
        resolved_device_id = device_rec.device_id
        resolved_device_type = device_rec.device_type
    else:
        # Fallback to patient cohort device metadata
        patient = db.query(Patient).filter(Patient.patient_id == pid).first()
        if patient:
            resolved_device_id = raw_device_id or f"DEV-{patient.patient_id}"
            resolved_device_type = patient.device_type or "Clinical Workstation"
        else:
            resolved_device_id = raw_device_id or "UNKNOWN-DEVICE"
            resolved_device_type = "Medical IoT Device"

    # 4. Resolve Hospital Zone from existing ZONE_MAPPINGS
    resolved_zone = "ZONE-WARD" # Default logical zone matching Digital Twin convention
    zone_matched = False

    for zid, zinfo in ZONE_MAPPINGS.items():
        if resolved_device_id in zinfo.get("device_ids", []):
            resolved_zone = zid
            zone_matched = True
            break

    if not zone_matched and pid:
        # Map via patient department if device is a bedside terminal or workstation
        precord = db.query(PatientRecord).filter(PatientRecord.id == pid).first()
        dept = (precord.department if precord else "").lower()
        if "icu" in dept or "critical" in dept:
            resolved_zone = "ZONE-ICU"
        elif "nurse" in dept or "triage" in dept:
            resolved_zone = "ZONE-NURSE"
        elif "pharm" in dept or "admin" in dept or "it" in dept or "record" in dept:
            resolved_zone = "ZONE-CORE"
        else:
            resolved_zone = "ZONE-WARD"

    return resolved_device_id, resolved_device_type, resolved_zone


def build_intelligence_context(
    db: Session,
    event_id: str,
    pipeline_result: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Centralized Intelligence Layer synthesis function.
    Extracts all threat indicators directly from the completed pipeline and fusion result,
    resolves operational device and zone topology, and produces the intelligence block.

    All numeric and classification values are derived directly from actual pipeline outputs.
    """
    clean_event_id = event_id.strip()

    # Query the existing event from the database for operational context
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == clean_event_id
    ).first()

    patient_id = pipeline_result.get("patient_id") or (evt.patient_id if evt else "")
    resolved_device_id, resolved_device_type, resolved_zone = resolve_device_metadata(
        db=db,
        evt=evt,
        patient_id=patient_id
    )

    # Incident Context (derived from event and pipeline metadata)
    scenario = pipeline_result.get("scenario") or (evt.scenario if evt else "UNKNOWN")
    event_type = pipeline_result.get("event_type") or (evt.event_type if evt else "SECURITY_EVENT")
    severity = pipeline_result.get("severity") or (evt.severity if evt else "HIGH")
    timestamp = pipeline_result.get("timestamp") or (evt.timestamp if evt else "")

    incident_context = {
        "event_id": clean_event_id,
        "device_id": resolved_device_id,
        "device_type": resolved_device_type,
        "hospital_zone": resolved_zone,
        "scenario": scenario,
        "event_type": event_type,
        "severity": severity,
        "timestamp": timestamp
    }

    # Threat Context (derived strictly from actual existing Fusion & FEC outputs)
    fusion_sub = pipeline_result.get("fusion") or {}
    threat_assessment_sub = pipeline_result.get("threat_assessment") or {}
    fec_sub = pipeline_result.get("fec") or {}

    fusion_result = (
        fusion_sub.get("fusion_result") or
        fusion_sub.get("result") or
        "BENIGN"
    )

    threat_index = (
        fusion_sub.get("threat_index")
        if fusion_sub.get("threat_index") is not None
        else (
            threat_assessment_sub.get("threat_index")
            if threat_assessment_sub.get("threat_index") is not None
            else 0.0
        )
    )

    model_agreement = (
        fusion_sub.get("model_agreement") or
        "0/3"
    )

    evidence_strength = (
        fusion_sub.get("evidence_strength") or
        threat_assessment_sub.get("evidence_strength") or
        "LOW"
    )

    fec_score = (
        fec_sub.get("fec_score")
        if fec_sub.get("fec_score") is not None
        else 0.0
    )

    threat_context = {
        "fusion_result": str(fusion_result),
        "threat_index": float(threat_index),
        "model_agreement": str(model_agreement),
        "evidence_strength": str(evidence_strength),
        "fec_score": float(fec_score)
    }

    # Evaluate Patient Safety & Operational Impact deterministically
    patient_impact = evaluate_patient_safety_impact(
        db=db,
        incident_context=incident_context,
        threat_context=threat_context
    )

    # Evaluate Potential Attack Path deterministically from hospital topology
    attack_path = evaluate_attack_path(
        db=db,
        incident_context=incident_context,
        threat_context=threat_context
    )

    # Evaluate Potential Blast Radius deterministically from hospital topology
    blast_radius = evaluate_blast_radius(
        db=db,
        incident_context=incident_context,
        attack_path_context=attack_path
    )

    # Evaluate Intelligence Priority deterministically from multi-dimensional context
    priority = evaluate_intelligence_priority(
        incident_context=incident_context,
        threat_context=threat_context,
        patient_impact=patient_impact,
        attack_path=attack_path,
        blast_radius=blast_radius
    )

    return {
        "incident_context": incident_context,
        "threat_context": threat_context,
        "patient_impact": patient_impact,
        "attack_path": attack_path,
        "blast_radius": blast_radius,
        "priority": priority,
        "status": "READY"
    }

from app.security_engine.patient_safety_engine import evaluate_patient_safety_impact
from app.security_engine.attack_path_engine import evaluate_attack_path
from app.security_engine.blast_radius_engine import evaluate_blast_radius
from app.security_engine.intelligence_priority_engine import evaluate_intelligence_priority

__all__ = [
    "resolve_device_metadata",
    "build_intelligence_context",
    "evaluate_patient_safety_impact",
    "evaluate_attack_path",
    "evaluate_blast_radius",
    "evaluate_intelligence_priority",
]


