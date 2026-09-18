import json
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent

client = TestClient(app)
db = SessionLocal()

print("=== HEALTHSHIELD-X FRONTEND PATIENT SAFETY IMPACT DYNAMIC VERIFICATION ===")

# 1. Administrative Workstation Incident (AW-07)
client.post("/api/v1/devices/AW-07/attack/start", json={"attack_type": "DATA_EXFILTRATION", "intensity": "HIGH"})
evt_admin = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.patient_id == "AW-07").order_by(HoneypotSecurityEvent.timestamp.desc()).first()
res_admin = client.get(f"/api/v1/detection-pipeline/event/{evt_admin.event_id}").json()
client.post("/api/v1/devices/AW-07/attack/stop")

# 2. Clinical Device Incident (PM-01)
client.post("/api/v1/devices/PM-01/attack/start", json={"attack_type": "SUSPICIOUS_DATA_ACCESS", "intensity": "HIGH"})
evt_pm01 = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.patient_id == "PM-01").order_by(HoneypotSecurityEvent.timestamp.desc()).first()
res_pm01 = client.get(f"/api/v1/detection-pipeline/event/{evt_pm01.event_id}").json()
client.post("/api/v1/devices/PM-01/attack/stop")

# 3. Critical ICU Device Incident (VU-04)
client.post("/api/v1/devices/VU-04/attack/start", json={"attack_type": "BRUTE_FORCE", "intensity": "HIGH"})
evt_vu04 = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.patient_id == "VU-04").order_by(HoneypotSecurityEvent.timestamp.desc()).first()
res_vu04 = client.get(f"/api/v1/detection-pipeline/event/{evt_vu04.event_id}").json()
client.post("/api/v1/devices/VU-04/attack/stop")

def print_frontend_card_view(label, res):
    intel = res.get("intelligence", {})
    ctx = intel.get("incident_context", {})
    impact = intel.get("patient_impact", {})
    
    print(f"\n>>> UI PRESENTATION FOR: {label}")
    print(f"Event ID: {res.get('event_id')} | Device: {ctx.get('device_id')} ({ctx.get('device_type')}) | Zone: {ctx.get('hospital_zone')}")
    print("----------------------------------------------------")
    print("CARD TITLE: PATIENT / SERVICE IMPACT")
    print(f"* Impact Level: {impact.get('impact_level')}")
    print(f"* Potential Impact Score: {impact.get('impact_score')}/100")
    zone = ctx.get("hospital_zone")
    service_map = {
        "ZONE-ICU": "ICU Monitoring & Life Support",
        "ZONE-WARD": "Inpatient Ward Telemetry",
        "ZONE-NURSE": "Nurse Station & Clinical Triage",
        "ZONE-CORE": "Hospital Core Datacenter"
    }
    print(f"* Affected Service: {service_map.get(zone, zone)}")
    print(f"* Device Criticality: {impact.get('device_criticality')}")
    print(f"* Patient Dependency: {impact.get('patient_dependency')}")
    print("Why:")
    why_factors = [r for r in impact.get("rationale", []) if not r.lower().startswith("clinical preservation") and not r.lower().startswith("assessment scope")]
    for w in why_factors:
        print(f"  • {w}")
    response = next((r for r in impact.get("rationale", []) if r.lower().startswith("clinical preservation") or "restrict or isolate" in r.lower()), "Quarantine host from network perimeter without clinical disruption.")
    print("Recommended Cybersecurity Response:")
    print(f"  {response}")

print_frontend_card_view("1. ADMINISTRATIVE WORKSTATION INCIDENT", res_admin)
print_frontend_card_view("2. CLINICAL DEVICE INCIDENT (WARD PATIENT MONITOR)", res_pm01)
print_frontend_card_view("3. CRITICAL ICU DEVICE INCIDENT (VENTILATOR)", res_vu04)

db.close()
