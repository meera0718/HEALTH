import json
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.db.models import Device, HoneypotSecurityEvent, Patient
from app.security_engine.fusion_engine import calculate_patient_fusion
from app.security_engine.attack_path_engine import evaluate_attack_path
from app.security_engine.blast_radius_engine import evaluate_blast_radius
from app.security_engine.patient_safety_engine import evaluate_patient_safety_impact
from app.security_engine.intelligence_layer import resolve_device_metadata
from app.security_engine.fec_engine import calculate_event_fec

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    incident_id: Optional[str] = None
    history: List[ChatMessage] = Field(default_factory=list, max_length=20)


def _build_context(db: Session, incident_id: Optional[str]) -> Dict[str, Any]:
    events = db.query(HoneypotSecurityEvent).order_by(HoneypotSecurityEvent.timestamp.desc()).limit(20).all()
    latest = events[0] if events else None
    selected_event = next((event for event in events if event.event_id == incident_id), None) if incident_id else None
    active_event = selected_event or latest
    devices = db.query(Device).order_by(Device.risk_score.desc()).limit(10).all()
    patient_detection = None
    event_fec = None
    if active_event and active_event.patient_id and db.query(Patient).filter(Patient.patient_id == active_event.patient_id).first():
        try:
            patient_detection = calculate_patient_fusion(db, active_event.patient_id)
        except Exception:
            pass
    if active_event:
        try:
            fec = calculate_event_fec(active_event.event_id, db)
            event_fec = {"event_id": fec.event_id, "patient_id": fec.patient_id, "fec_score": fec.fec_score,
                         "baseline_fec": fec.baseline_fec, "event_adjustment": fec.event_adjustment}
        except Exception:
            pass

    intelligence = None
    if active_event:
        device_id, device_type, hospital_zone = resolve_device_metadata(db, active_event, active_event.patient_id)
        incident_context = {
            "event_id": active_event.event_id,
            "patient_id": active_event.patient_id,
            "device_id": device_id,
            "device_type": device_type,
            "hospital_zone": hospital_zone,
            "severity": active_event.severity,
        }
        detection = patient_detection or {}
        threat_context = {
            "evidence_strength": detection.get("evidence_strength", "UNAVAILABLE"),
            "fec_score": detection.get("fec_score"),
            "threat_index": detection.get("detection_score"),
        }
        try:
            attack_path = evaluate_attack_path(db, incident_context, threat_context)
            intelligence = {
                "attack_path": attack_path,
                "blast_radius": evaluate_blast_radius(db, incident_context, attack_path),
                "patient_safety": evaluate_patient_safety_impact(db, incident_context, threat_context),
            }
        except Exception:
            intelligence = None

    reporting_summary = None
    try:
        from app.api.routes.reporting import get_report_data
        reporting_summary, _, _ = get_report_data(db)
    except Exception:
        pass

    return {
        "selected_incident": {
            "id": incident_id or "not specified",
            "available": selected_event is not None if incident_id else False,
            "resolved_event_id": active_event.event_id if active_event else None,
        },
        "latest_event": {
            "event_id": active_event.event_id, "event_type": active_event.event_type, "severity": active_event.severity,
            "timestamp": active_event.timestamp, "source": active_event.source, "endpoint": active_event.endpoint,
            "patient_id": active_event.patient_id, "records_accessed": active_event.records_accessed,
        } if active_event else None,
        "recent_events": [
            {"event_id": e.event_id, "event_type": e.event_type, "severity": e.severity,
             "timestamp": e.timestamp, "source": e.source, "endpoint": e.endpoint, "patient_id": e.patient_id}
            for e in events
        ],
        "high_risk_assets": [
            {"device_id": d.device_id, "device_name": d.device_name, "status": d.status, "risk_score": d.risk_score}
            for d in devices if (d.risk_score or 0) >= 50 or str(d.status).upper() not in {"SECURE", "ONLINE"}
        ],
        "patient_detection": patient_detection,
        "event_fec": event_fec,
        "reporting_summary": reporting_summary,
        "intelligence": intelligence,
        "data_available": bool(events or devices or reporting_summary),
    }


def _out_of_scope(message: str) -> bool:
    cyber_terms = ("security", "threat", "incident", "attack", "patient", "data", "evidence", "fec", "asset",
                   "blast", "soc", "contain", "forensic", "monitor", "recommend", "risk", "device", "system",
                   "next", "should", "action", "investigate", "investigation", "recommendation")
    return not any(term in message.lower() for term in cyber_terms)


def _fallback_answer(message: str, context: Dict[str, Any]) -> str:
    lower = message.lower()
    if _out_of_scope(message):
        return ("I am the HealthShield-X Security Intelligence Assistant. I can help with security status, incidents, "
                "forensics, evidence, threat analysis, patient-security impact, and containment recommendations.")

    latest = context.get("latest_event")
    detection = context.get("patient_detection") or {}
    assets = context.get("high_risk_assets", [])
    intelligence = context.get("intelligence") or {}
    reporting = context.get("reporting_summary") or {}
    if not context.get("data_available"):
        return "The available HealthShield-X data is insufficient to answer that security question right now."

    if any(word in lower for word in ("recommend", "do next", "first", "contain", "reduce", "measure", "monitor")):
        steps = []
        if latest:
            steps.append(f"preserve and review evidence for {latest['event_id']}")
            steps.append(f"contain the affected endpoint {latest['endpoint']}")
        if assets:
            steps.append(f"prioritize the highest-risk asset {assets[0]['device_id']}")
        steps.append("recalculate detection/FEC after new telemetry is available")
        return "Recommended next steps: " + "; ".join(steps) + ". These are security actions only; clinical decisions remain outside this assistant."

    if "security status" in lower or "current status" in lower:
        overview = reporting.get("overview")
        if not overview:
            return "The current security status is UNAVAILABLE because the reporting summary could not be retrieved."
        return (f"Current HealthShield-X status: {overview.get('total_detected_incidents', 0)} detected incidents, "
                f"{overview.get('high_risk_patients', 0)} high-risk patients, {overview.get('critical_patients', 0)} critical patients, "
                f"and average FEC {overview.get('average_fec_score', 'UNAVAILABLE')}%. "
                "These values come from the current reporting summary.")

    if "threat" in lower and any(word in lower for word in ("detected", "found", "current")):
        distribution = reporting.get("threat_distribution")
        if not distribution:
            return "Detected-threat information is UNAVAILABLE because the reporting summary could not be retrieved."
        return f"Current reporting threat distribution: {json.dumps(distribution, sort_keys=True)}. Recent event records are included in the supplied HealthShield-X context."

    if "missing" in lower:
        return "Specific missing-evidence artifacts are UNAVAILABLE in the current chatbot context. The available FEC and event records do not expose a verified missing-artifact list."

    if "evidence" in lower and not re.search(r"\bfec\b", lower):
        strength = detection.get("evidence_strength")
        if latest and strength:
            return (f"Available evidence context: event {latest['event_id']} was observed on {latest['endpoint']} "
                    f"with {strength} evidence strength. The chatbot does not claim artifacts beyond the event and "
                    "pipeline records currently exposed by HealthShield-X.")
        return "Supporting evidence details are UNAVAILABLE because no applicable event pipeline record was retrieved."

    if re.search(r"\bfec\b", lower):
        fec_record = context.get("event_fec") or {}
        fec = fec_record.get("fec_score") or detection.get("fec_score")
        if fec is not None:
            return f"The current patient-linked detection record reports an FEC score of {fec:.1f}%. Review the event pipeline for the remaining evidence gaps; this assistant does not infer missing artifacts."
        return "FEC and evidence-gap details are UNAVAILABLE because no applicable FEC record was retrieved from HealthShield-X."

    if "attack path" in lower or ("progress" in lower and "attack" in lower):
        path = intelligence.get("attack_path")
        if not path or path.get("status") == "UNAVAILABLE":
            return "The attack path is UNAVAILABLE: the existing HealthShield-X topology data is insufficient for path reconstruction."
        labels = [node.get("label", node.get("id", "unknown")) for node in path.get("path_nodes", [])]
        return f"The deterministic attack-path engine reports status {path['status']}: {' -> '.join(labels)}. This is potential reachability, not confirmed compromise."

    if "blast radius" in lower or "could the attacker reach" in lower or "assets could" in lower:
        radius = intelligence.get("blast_radius")
        if not radius or radius.get("status") == "UNAVAILABLE":
            return "The potential blast radius is UNAVAILABLE: the existing HealthShield-X topology data is insufficient for assessment."
        return (f"The deterministic blast-radius engine reports {radius.get('potentially_exposed_count', 0)} potentially exposed assets, "
                f"including {radius.get('clinical_assets_count', 0)} clinical and {radius.get('critical_assets_count', 0)} critical assets. "
                "This is potential exposure, not confirmed compromise.")

    if "patient" in lower and any(word in lower for word in ("affect", "risk", "expos", "safe", "impact")):
        patient_safety = intelligence.get("patient_safety")
        if patient_safety:
            return (f"The deterministic patient-safety engine assesses potential operational impact as "
                    f"{patient_safety.get('impact_level', 'UNAVAILABLE')} ({patient_safety.get('impact_score', 'UNAVAILABLE')}/100). "
                    f"This is a cybersecurity exposure assessment, not a medical conclusion. {patient_safety.get('scope_disclaimer', '')}")
        status = detection.get("detection_status", "not available")
        return f"The current security data reports patient-security detection status as {status}. This indicates cybersecurity exposure context, not a medical conclusion; confirm affected services and access logs with the incident team."

    if latest:
        return (f"Current HealthShield-X context: {latest['event_id']} is a {latest['severity']} {latest['event_type']} "
                f"event affecting endpoint {latest['endpoint']}, observed at {latest['timestamp']}. "
                f"Source: {latest['source']}. Use the event pipeline and evidence views for the authoritative investigation record.")
    return "HealthShield-X has security data available, but no current event is selected for this question."


def _llm_answer(message: str, history: List[ChatMessage], context: Dict[str, Any], fallback: str) -> str:
    if not settings.LLM_API_KEY:
        return fallback
    try:
        transcript = [{"role": item.role, "content": item.content} for item in history[-10:]]
        transcript.append({"role": "user", "content": message})
        system = ("You are the HealthShield-X cybersecurity intelligence assistant. Answer only about healthcare "
                  "cybersecurity, incidents, digital forensics, evidence, threats, assets, FEC, blast radius, "
                  "patient-data protection, patient-safety impact from security incidents, and SOC recommendations. "
                  "Never diagnose, prescribe, or make clinical decisions. Use only the supplied JSON context. If a "
                  "fact is absent, say the available data is insufficient. Keep answers concise and professional.\n\n"
                  f"LIVE HEALTHSHIELD-X CONTEXT:\n{json.dumps(context, default=str)}")
        response = httpx.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini", "messages": [{"role": "system", "content": system}, *transcript],
            "temperature": 0.1
        }, headers={"Authorization": f"Bearer {settings.LLM_API_KEY}", "Content-Type": "application/json"}, timeout=8.0)
        response.raise_for_status()
        answer = response.json()["choices"][0]["message"]["content"].strip()
        return answer or fallback
    except Exception:
        return fallback


@router.post("/chatbot/message")
def chatbot_message(request: ChatRequest, db: Session = Depends(get_db)):
    context = _build_context(db, request.incident_id)
    fallback = _fallback_answer(request.message.strip(), context)
    answer = _llm_answer(request.message.strip(), request.history, context, fallback)
    return {"answer": answer, "context": context, "source": "llm" if answer != fallback and settings.LLM_API_KEY else "deterministic"}