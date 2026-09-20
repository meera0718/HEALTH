"""
HEALTHSHIELD-X Intelligence Priority Engine (Step 6).

Evaluates operational priority (P1–P4) for security incidents deterministically:
- Answers: "How should a security operator prioritize this incident relative to other incidents?"
- Operational Priority assessment, NOT a threat score or replacement for existing detection scores.
- Synthesizes existing multi-dimensional intelligence:
  1. Threat Assessment (threat_index, fusion_result, model_agreement, severity)
  2. Evidence Strength (FEC score, evidence_strength: HIGH/MEDIUM/LOW/UNAVAILABLE)
  3. Patient / Service Impact (impact_level, impact_score)
  4. Potential Attack Path (reachability, availability, quarantine)
  5. Potential Blast Radius (critical_assets_count, clinical_assets_count, exposed_count, isolation)
- Strict Rule: P1 REQUIRES STRONG EVIDENCE. Moderate, weak, or unavailable evidence
  cannot directly produce P1 under any circumstance.
- Zero ML models, zero LLMs, zero hardcoded device IDs, zero synthetic scores.
"""

from typing import Dict, Any, List, Optional


def evaluate_intelligence_priority(
    incident_context: Dict[str, Any],
    threat_context: Dict[str, Any],
    patient_impact: Optional[Dict[str, Any]] = None,
    attack_path: Optional[Dict[str, Any]] = None,
    blast_radius: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Deterministically derives the operational Intelligence Priority (P1 to P4).

    Returns:
    {
        "status": "AVAILABLE",
        "priority": "P1" | "P2" | "P3" | "P4",
        "label": "IMMEDIATE ATTENTION" | "HIGH ATTENTION" | "MONITOR" | "INFORMATIONAL",
        "reason": str,
        "drivers": List[str],
        "context": {
            "threat_severity": str,
            "threat_index": float,
            "evidence_strength": str,
            "patient_impact_level": str,
            "attack_path_status": str,
            "critical_assets_count": int,
            "clinical_assets_count": int,
            "blast_radius_count": int,
            "restricted": bool
        }
    }
    """
    # 1. Extract Threat Dimensions
    raw_threat_index = threat_context.get("threat_index")
    threat_index = float(raw_threat_index) if raw_threat_index is not None else 0.0
    fusion_result = str(threat_context.get("fusion_result") or "BENIGN").upper()
    threat_severity = str(incident_context.get("severity") or "LOW").upper()
    model_agreement = str(threat_context.get("model_agreement") or "0/3")

    is_high_threat = (
        threat_index >= 70.0 
        or threat_severity in ["CRITICAL", "HIGH"] 
        or fusion_result in ["MALICIOUS", "ATTACK"]
    )
    is_moderate_threat = (
        threat_index >= 40.0 
        or threat_severity in ["MEDIUM", "MODERATE"] 
        or fusion_result in ["SUSPICIOUS", "ANOMALOUS"]
    )

    # 2. Extract Evidence Dimensions
    ev_str = str(threat_context.get("evidence_strength") or "LOW").upper()
    raw_fec = threat_context.get("fec_score")
    fec_score = float(raw_fec) if raw_fec is not None else 0.0

    # P1 explicitly requires STRONG evidence. Moderate or weak evidence cannot produce P1.
    is_strong_evidence = (
        ev_str == "HIGH" 
        or (fec_score >= 60.0 and model_agreement == "3/3")
    )
    is_moderate_evidence = (
        not is_strong_evidence 
        and (ev_str == "MEDIUM" or fec_score >= 30.0 or model_agreement in ["2/3", "3/3"])
    )
    is_weak_evidence = (
        not is_strong_evidence 
        and not is_moderate_evidence
    )
    is_evidence_incomplete = ev_str in ["UNAVAILABLE", "UNKNOWN", "NONE"]

    # 3. Extract Patient / Service Impact Dimensions
    p_impact = patient_impact or {}
    impact_level = str(p_impact.get("impact_level") or "LOW").upper()
    raw_impact_score = p_impact.get("impact_score")
    impact_score = float(raw_impact_score) if raw_impact_score is not None else 0.0

    # 4. Extract Attack Path & Blast Radius Dimensions
    b_radius = blast_radius or {}
    a_path = attack_path or {}

    blast_status = b_radius.get("status", "UNAVAILABLE")
    attack_status = a_path.get("status", "UNAVAILABLE")

    critical_assets_count = int(b_radius.get("critical_assets_count") or 0) if blast_status == "AVAILABLE" else 0
    clinical_assets_count = int(b_radius.get("clinical_assets_count") or 0) if blast_status == "AVAILABLE" else 0
    blast_count = int(b_radius.get("potentially_exposed_count") or 0) if blast_status == "AVAILABLE" else 0

    has_critical_clinical_exposure = (
        impact_level in ["CRITICAL", "HIGH"]
        or impact_score >= 70.0
        or critical_assets_count > 0
    )
    has_meaningful_exposure = (
        has_critical_clinical_exposure
        or impact_level in ["MODERATE", "MEDIUM"]
        or clinical_assets_count > 0
        or blast_count > 0
    )

    # 5. Isolation / Containment Context
    is_restricted = bool(
        b_radius.get("restricted")
        or a_path.get("is_quarantined")
        or attack_status == "RESTRICTED"
    )

    # 6. Priority Evaluation Rules
    drivers: List[str] = []

    # Priority determination
    if is_high_threat and is_strong_evidence and has_critical_clinical_exposure:
        priority = "P1"
        label = "IMMEDIATE ATTENTION"
        drivers.append("High threat severity supported by verified ML detection")
        drivers.append("Strong evidence strength and feature correlation")
        if impact_level in ["CRITICAL", "HIGH"]:
            drivers.append(f"Critical patient safety impact ({impact_level})")
        if critical_assets_count > 0:
            drivers.append(f"Reachable critical clinical assets ({critical_assets_count} in blast radius)")

        if is_restricted:
            reason = "High-confidence threat with critical clinical exposure; lateral movement currently constrained by active host isolation."
        else:
            reason = "High-confidence threat with verified strong evidence and critical clinical exposure."

    elif is_high_threat and has_critical_clinical_exposure and not is_strong_evidence:
        # High threat with critical exposure but lacking strong evidence:
        # Explicit rule: Moderate or weak evidence prevents P1 escalation -> P2
        priority = "P2"
        label = "HIGH ATTENTION"
        drivers.append("High threat severity and critical clinical exposure")
        if is_evidence_incomplete:
            drivers.append("Evidence is incomplete; P1 escalation constrained pending telemetry verification")
            reason = "Critical clinical threat detected, but operational priority constrained to P2 pending complete evidence corroboration."
        else:
            drivers.append("Evidence strength is moderate; P1 escalation constrained")
            reason = "High clinical threat detected, but priority constrained to P2 pending stronger evidence corroboration."

    elif (is_high_threat and has_meaningful_exposure) or (is_moderate_threat and has_critical_clinical_exposure and (is_strong_evidence or is_moderate_evidence)):
        priority = "P2"
        label = "HIGH ATTENTION"
        if is_high_threat:
            drivers.append("High threat severity requiring operational investigation")
        else:
            drivers.append("Moderate threat coupled with significant clinical exposure")
        if has_meaningful_exposure:
            drivers.append(f"Downstream operational exposure ({blast_count} assets potentially reachable)")

        if is_restricted:
            reason = "Credible threat with operational exposure; lateral movement constrained by active host isolation."
        else:
            reason = "Credible threat with meaningful operational exposure requiring SOC review."

    elif is_moderate_threat or has_meaningful_exposure or threat_index >= 30.0:
        priority = "P3"
        label = "MONITOR"
        drivers.append(f"Anomalous telemetry activity (Threat Index: {threat_index:.1f}/100)")
        if is_weak_evidence or is_evidence_incomplete:
            drivers.append("Supporting evidence is limited; automated continuous monitoring active")
        else:
            drivers.append("Operational and clinical exposure are currently constrained")

        if is_restricted:
            reason = "Suspicious activity detected; host isolation is actively restricting lateral movement."
        else:
            reason = "Suspicious anomaly observed, but current operational exposure and evidence are limited."

    else:
        priority = "P4"
        label = "INFORMATIONAL"
        drivers.append("Baseline or low-severity operational event")
        drivers.append("Minimal patient and infrastructure exposure")
        reason = "Low-severity or routine telemetry activity with negligible operational impact."

    if is_restricted:
        drivers.append("Active host quarantine enforced on source asset")

    return {
        "status": "AVAILABLE",
        "priority": priority,
        "label": label,
        "reason": reason,
        "drivers": drivers,
        "context": {
            "threat_severity": threat_severity,
            "threat_index": threat_index,
            "evidence_strength": ev_str,
            "patient_impact_level": impact_level,
            "attack_path_status": attack_status,
            "critical_assets_count": critical_assets_count,
            "clinical_assets_count": clinical_assets_count,
            "blast_radius_count": blast_count,
            "restricted": is_restricted
        }
    }
