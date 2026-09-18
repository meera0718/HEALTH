import json
import datetime
from sqlalchemy.orm import Session
from app.db.models import (
    Device, AuditLog, DecoyAsset, PatientRecord, Patient
)
from app.security_engine.deception_engine.decoy_manager import DEFAULT_DECOYS
from app.ml.dataset_generator import PATIENTS_30_DATA
from app.db.synthetic_cohort_v1 import SYNTHETIC_PATIENTS_COHORT_V1

def seed_database(db: Session):
    # Seed HTS-SYN-001 Cohort Patients Table
    for pdata in SYNTHETIC_PATIENTS_COHORT_V1:
        if not db.query(Patient).filter(Patient.patient_id == pdata["patient_id"]).first():
            db.add(Patient(**pdata))
    db.commit()
    # Seed 30 Synthetic Patients
    for pdata in PATIENTS_30_DATA:
        if not db.query(PatientRecord).filter(PatientRecord.id == pdata["id"]).first():
            db.add(PatientRecord(
                id=pdata["id"],
                name=pdata["name"],
                diagnosis=pdata["diagnosis"],
                failed_logins=pdata["failed_logins"],
                requests_per_minute=pdata["requests_per_minute"],
                records_accessed=pdata["records_accessed"],
                unique_endpoints=pdata["unique_endpoints"],
                session_duration_min=pdata["session_duration_min"],
                device_changes=pdata["device_changes"],
                error_rate=pdata["error_rate"],
                unusual_access_time=pdata["unusual_access_time"],
                endpoint_enumeration=pdata["endpoint_enumeration"],
                age=pdata["age"],
                gender=pdata["gender"],
                blood_group=pdata["blood_group"],
                doctor=pdata["doctor"],
                department=pdata["department"],
                status="Admitted (Active)",
                room=f"Ward {pdata['id'][-2:]}",
                access_history_json=json.dumps([
                    {"timestamp": "10:30:15", "user": "doctor_demo", "action": "VIEW_PATIENT_RECORD", "status": "Authorized"}
                ]),
                clinical_activity_json=json.dumps([
                    {"timestamp": "09:00:00", "activity": f"Vitals & {pdata['diagnosis']} check", "clinician": pdata["doctor"], "status": "Normal"}
                ])
            ))
    db.commit()

    # Seed Decoy Assets if not present
    for decoy_data in DEFAULT_DECOYS:
        if not db.query(DecoyAsset).filter(DecoyAsset.id == decoy_data["id"]).first():
            db.add(DecoyAsset(
                id=decoy_data["id"],
                name=decoy_data["name"],
                asset_type=decoy_data["asset_type"],
                department=decoy_data["department"],
                is_decoy=decoy_data["is_decoy"],
                clinical_criticality=decoy_data["clinical_criticality"],
                risk_score=decoy_data["risk_score"],
                status=decoy_data["status"],
                ip_address=decoy_data["ip_address"],
                interaction_count=decoy_data["interaction_count"],
                last_interaction=decoy_data["last_interaction"]
            ))
    db.commit()

    # Seed realistic simulated healthcare medical devices
    initial_devices = [
        {"device_id": "PM-04", "device_name": "Patient Monitor PM-04", "device_type": "Patient Monitor", "ip_address": "10.10.3.11", "vlan": "ICU VLAN"},
        {"device_id": "PM-02", "device_name": "Patient Monitor PM-02", "device_type": "Patient Monitor", "ip_address": "10.10.3.12", "vlan": "ICU VLAN"},
        {"device_id": "PM-01", "device_name": "Patient Monitor PM-01", "device_type": "Patient Monitor", "ip_address": "10.10.3.10", "vlan": "Ward VLAN"},
        {"device_id": "IP-08", "device_name": "Infusion Pump IP-08", "device_type": "Infusion Pump", "ip_address": "10.10.3.88", "vlan": "MedIoT VLAN"},
        {"device_id": "VU-04", "device_name": "Ventilator Unit VU-04", "device_type": "Ventilator", "ip_address": "10.10.3.40", "vlan": "ICU VLAN"},
        {"device_id": "ECG-03", "device_name": "ECG Monitor ECG-03", "device_type": "ECG Monitor", "ip_address": "10.10.3.50", "vlan": "Cardiology VLAN"},
        {"device_id": "LA-03", "device_name": "Lab Analyzer LA-03", "device_type": "Laboratory Analyzer", "ip_address": "10.10.4.30", "vlan": "Lab VLAN"},
        {"device_id": "IW-06", "device_name": "Imaging Workstation IW-06", "device_type": "Imaging Workstation", "ip_address": "10.10.4.60", "vlan": "Imaging VLAN"},
        {"device_id": "MD-02", "device_name": "Medication Dispenser MD-02", "device_type": "Medication Dispenser", "ip_address": "10.10.5.22", "vlan": "Pharm VLAN"},
        {"device_id": "AW-07", "device_name": "Admin Workstation AW-07", "device_type": "Admin Workstation", "ip_address": "10.10.2.14", "vlan": "Admin VLAN"},
    ]

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    for dev in initial_devices:
        existing = db.query(Device).filter(Device.device_id == dev["device_id"]).first()
        if not existing:
            new_dev = Device(
                device_id=dev["device_id"],
                device_name=dev["device_name"],
                device_type=dev["device_type"],
                ip_address=dev["ip_address"],
                vlan=dev["vlan"],
                status="SECURE",
                risk_score=10.0,
                last_seen=now_str
            )
            db.add(new_dev)
    db.commit()

