"""
HEALTHSHIELD-X Patient Safety and Operational Impact Engine.

A centralized, deterministic, explainable engine that evaluates clinical asset exposure
and operational disruption potential when a security event affects a hospital device or service.

Core Principles:
1. Threat Confidence vs. Patient/Operational Impact:
   - Threat Confidence: How suspicious the event is (derived from multi-model ML ensemble, FEC, Threat Index).
   - Patient/Operational Impact: What clinical workflows could be affected if the asset is compromised.
2. Clinical Safety Preservation:
   - For medical devices, never recommend blindly powering off or shutting down equipment.
   - Recommends network restriction/quarantine while preserving bedside clinical operation.
3. Non-Harm Disclaimer:
   - This is an exposure/risk assessment, NOT a medical harm probability.
   - Does not claim that patient harm has occurred.
4. Fully Data-Derived & Deterministic:
   - Zero hardcoding of specific device IDs, event IDs, patients, or scenario strings.
   - All results are derived from asset metadata, hospital zone topology, and device/patient records.
   - When metadata is unavailable, explicit UNKNOWN/UNAVAILABLE values with documented conservative fallbacks are applied.
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.db.models import Device, PatientRecord

# Factor Weights (Composite = 100%)
WEIGHT_DEVICE_CRITICALITY = 0.35
WEIGHT_SERVICE_CRITICALITY = 0.25
WEIGHT_PATIENT_DEPENDENCY = 0.25
WEIGHT_OPERATIONAL_DISRUPTION = 0.15

# Thresholds for Impact Level
LEVEL_CRITICAL_THRESHOLD = 80.0
LEVEL_HIGH_THRESHOLD = 60.0
LEVEL_MODERATE_THRESHOLD = 35.0

CLINICAL_PRESERVATION_NOTICE = (
    "Clinical Preservation Notice: Restrict or isolate suspicious network communication "
    "while preserving clinical operation where appropriate. Equipment must not be "
    "powered off or disconnected from active patients."
)

ASSESSMENT_SCOPE_DISCLAIMER = (
    "Assessment Scope: This evaluation models potential clinical and operational exposure. "
    "It does not represent a medical harm probability and does not claim patient harm has occurred."
)


def evaluate_device_criticality(device_type: str, hospital_zone: str) -> tuple[str, float, str]:
    """
    Deterministically derives device criticality level, numerical score (0-100), and rationale description.
    """
    dtype = (device_type or "").strip()
    dtype_lower = dtype.lower()
    is_icu = (hospital_zone == "ZONE-ICU")

    if not dtype or dtype in ["UNKNOWN", "UNAVAILABLE"]:
        return "UNKNOWN", 20.0, "unverified device profile (conservative default applied)"

    # Life-support or continuous therapeutic intervention
    if any(k in dtype_lower for k in [
        "ventilator", "infusion pump", "defibrillator", "anesthesia", "life support", "ecmo"
    ]):
        return "CRITICAL", 100.0, "life-support or continuous therapeutic equipment with direct patient connection"

    # Patient monitors in ICU have critical hemodynamic monitoring status
    if "patient monitor" in dtype_lower and is_icu:
        return "CRITICAL", 100.0, "continuous bedside ICU hemodynamic monitoring critical to life maintenance"

    # Active patient monitoring or direct medication administration
    if any(k in dtype_lower for k in [
        "patient monitor", "ecg monitor", "medication dispenser", "dialysis", "vital signs monitor"
    ]):
        return "HIGH", 75.0, "active patient monitoring or direct medication administration instrument"

    # Diagnostic investigation, imaging, or laboratory analyzers
    if any(k in dtype_lower for k in [
        "laboratory analyzer", "imaging workstation", "radiology", "diagnostic", "nurse station", "ct scanner", "mri"
    ]):
        return "MODERATE", 45.0, "diagnostic investigation or clinical support workstation"

    # Administrative workstations, general compute, or office laptops
    if any(k in dtype_lower for k in [
        "admin workstation", "laptop", "desktop", "tablet", "mobile", "office", "workstation"
    ]):
        return "LOW", 15.0, "administrative workstation or non-clinical computational terminal"

    # Fallback for unclassified devices
    return "LOW", 25.0, "general computational hardware without direct clinical intervention"


def evaluate_service_criticality(hospital_zone: str) -> tuple[str, float, str]:
    """
    Deterministically derives hospital zone / service criticality level, numerical score (0-100),
    and rationale description.
    """
    zone = (hospital_zone or "").strip()

    if zone == "ZONE-ICU":
        return "CRITICAL", 100.0, "Intensive Care Unit (ICU), where disruption risks immediate acute patient deterioration"
    elif zone in ["ZONE-NURSE", "ZONE-CORE"]:
        return "HIGH", 75.0, "centralized clinical triage or datacenter infrastructure supporting multi-ward care"
    elif zone == "ZONE-WARD":
        return "MODERATE", 45.0, "inpatient medical ward supporting routine bedside care and inpatient telemetry"
    elif zone in ["EXTERNAL", "ZONE-GUEST", "ZONE-ADMIN"]:
        return "LOW", 15.0, "administrative perimeter or external network without direct bedside services"
    elif not zone or zone in ["UNKNOWN", "UNAVAILABLE"]:
        return "UNKNOWN", 25.0, "unmapped hospital zone (conservative baseline applied)"
    else:
        return "LOW", 25.0, f"general facility zone '{zone}' without acute intensive services"


def evaluate_patient_dependency(
    dev_crit: str,
    hospital_zone: str,
    device_rec: Optional[Device],
    patient_rec: Optional[PatientRecord]
) -> tuple[str, float, str]:
    """
    Deterministically evaluates active patient dependency on the asset.
    """
    is_icu = (hospital_zone == "ZONE-ICU")

    # If the device is already network-quarantined/isolated, live network dependency is suspended
    if device_rec and device_rec.status == "ISOLATED":
        return "LOW", 15.0, "Device is currently network-quarantined; live active network telemetry dependency is suspended"

    # Direct acute life support in ICU
    if dev_crit == "CRITICAL" and is_icu:
        return "CRITICAL", 100.0, "Active acute inpatient directly dependent on continuous operational feedback"

    # Active clinical workflow in high-care zones
    if dev_crit in ["CRITICAL", "HIGH"] and hospital_zone in ["ZONE-ICU", "ZONE-WARD", "ZONE-NURSE"]:
        return "HIGH", 75.0, "Inpatient clinical workflow actively streaming telemetry or medication dispensing"

    # Moderate dependency (diagnostic access or general inpatient chart)
    if dev_crit == "MODERATE" or (patient_rec and "admitted" in (patient_rec.status or "").lower()):
        return "MODERATE", 45.0, "Periodic diagnostic access or general inpatient chart dependency"

    # Low dependency (administrative devices)
    if dev_crit == "LOW":
        return "LOW", 15.0, "Zero direct individual patient dependency; operator uses independent clinical terminals"

    # Fallback when patient dependency context cannot be resolved
    return "UNAVAILABLE", 20.0, "Patient dependency context is unavailable; evaluated conservatively"


def evaluate_operational_disruption(
    dev_crit: str,
    hospital_zone: str
) -> tuple[str, float, str]:
    """
    Deterministically evaluates hospital operational disruption potential.
    """
    is_icu = (hospital_zone == "ZONE-ICU")

    if hospital_zone == "ZONE-CORE":
        return "CRITICAL", 90.0, "Enterprise-wide outage of hospital core services affecting cross-departmental operations"
    elif is_icu and dev_crit in ["CRITICAL", "HIGH"]:
        return "HIGH", 85.0, "Bedside ICU disruption requiring immediate bedside clinician presence and manual vital titration"
    elif dev_crit in ["HIGH", "MODERATE"] and hospital_zone in ["ZONE-WARD", "ZONE-NURSE"]:
        return "MODERATE", 45.0, "Bedside monitoring impairment; nursing staff shifts to manual intermittent rounds"
    elif dev_crit == "MODERATE":
        return "MODERATE", 40.0, "Diagnostic equipment queue delay; clinical samples queued for secondary analyzer"
    else:
        return "LOW", 15.0, "Local administrative workstation impact; operator switches to alternate terminal without clinical interruption"


def evaluate_patient_safety_impact(
    db: Optional[Session],
    incident_context: Dict[str, Any],
    threat_context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates potential patient safety and operational exposure deterministically.

    Consumes:
    - incident_context: Contains event_id, device_id, device_type, hospital_zone, etc.
    - threat_context: Contains fusion_result, threat_index, model_agreement, evidence_strength, fec_score.
    - db: SQLAlchemy Session (optional for deeper DB context queries).

    Returns:
    {
      "impact_score": float,
      "impact_level": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
      "device_criticality": str,
      "service_criticality": str,
      "patient_dependency": str,
      "operational_disruption": str,
      "rationale": list[str],
      "confidence": str
    }
    """
    device_id = str(incident_context.get("device_id") or "").strip()
    device_type = str(incident_context.get("device_type") or "UNKNOWN").strip()
    hospital_zone = str(incident_context.get("hospital_zone") or "UNKNOWN").strip()

    device_rec: Optional[Device] = None
    patient_rec: Optional[PatientRecord] = None

    if db is not None:
        try:
            if device_id and device_id not in ["UNKNOWN", "UNAVAILABLE"]:
                device_rec = db.query(Device).filter(Device.device_id == device_id).first()

            pid = str(incident_context.get("patient_id") or "").strip().upper()
            if not pid and device_id.startswith("P0"):
                pid = device_id
            if pid:
                patient_rec = db.query(PatientRecord).filter(PatientRecord.id == pid).first()
        except Exception:
            # Maintain resilience against transient DB connection errors
            device_rec = None
            patient_rec = None

    # Factor 1: Device Criticality (35% weight)
    dev_crit, dev_score, dev_desc = evaluate_device_criticality(device_type, hospital_zone)

    # Factor 2: Service / Hospital Zone Criticality (25% weight)
    zone_crit, zone_score, zone_desc = evaluate_service_criticality(hospital_zone)

    # Factor 3: Patient Dependency (25% weight)
    pat_dep, dep_score, dep_desc = evaluate_patient_dependency(
        dev_crit=dev_crit,
        hospital_zone=hospital_zone,
        device_rec=device_rec,
        patient_rec=patient_rec
    )

    # Factor 4: Operational Disruption Potential (15% weight)
    ops_disrupt, ops_score, ops_desc = evaluate_operational_disruption(
        dev_crit=dev_crit,
        hospital_zone=hospital_zone
    )

    # Deterministic Composite Impact Score (0.0 to 100.0)
    raw_impact = (
        WEIGHT_DEVICE_CRITICALITY * dev_score +
        WEIGHT_SERVICE_CRITICALITY * zone_score +
        WEIGHT_PATIENT_DEPENDENCY * dep_score +
        WEIGHT_OPERATIONAL_DISRUPTION * ops_score
    )
    impact_score = round(max(0.0, min(100.0, raw_impact)), 1)

    if impact_score >= LEVEL_CRITICAL_THRESHOLD:
        impact_level = "CRITICAL"
    elif impact_score >= LEVEL_HIGH_THRESHOLD:
        impact_level = "HIGH"
    elif impact_score >= LEVEL_MODERATE_THRESHOLD:
        impact_level = "MODERATE"
    else:
        impact_level = "LOW"

    # Threat confidence derived strictly from pipeline threat context
    threat_conf = threat_context.get("evidence_strength") or "LOW"

    # Construct explainable rationale items
    rationale: List[str] = [
        f"Device Criticality ({dev_crit}): Asset is classified as '{device_type}', representing {dev_desc}.",
        f"Service Criticality ({zone_crit}): Asset operates within {hospital_zone}, serving {zone_desc}.",
        f"Patient Dependency ({pat_dep}): {dep_desc}.",
        f"Operational Disruption ({ops_disrupt}): {ops_desc}."
    ]

    # Clinical Safety Preservation Guidance (for clinical equipment)
    if dev_crit in ["CRITICAL", "HIGH", "MODERATE"]:
        rationale.append(CLINICAL_PRESERVATION_NOTICE)

    # Mandatory Non-Harm Disclaimer
    rationale.append(ASSESSMENT_SCOPE_DISCLAIMER)

    return {
        "impact_score": impact_score,
        "impact_level": impact_level,
        "device_criticality": dev_crit,
        "service_criticality": zone_crit,
        "patient_dependency": pat_dep,
        "operational_disruption": ops_disrupt,
        "rationale": rationale,
        "confidence": threat_conf
    }
