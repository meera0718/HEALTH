import time
import random
import datetime
import json
import threading
import uuid
from sqlalchemy.orm import Session
from app.db.models import Device, HoneypotSecurityEvent, DeviceStateHistory
from app.security_engine.feature_engine import calculate_single_patient_features
from app.security_engine.fec_engine import calculate_single_patient_fec
from app.security_engine.fusion_engine import calculate_patient_fusion

# Server-Sent Events (SSE) broadcast listeners
listeners = []
LAST_TELEMETRY_CYCLE_TIME = None

def add_listener(queue):
    listeners.append(queue)

def remove_listener(queue):
    if queue in listeners:
        listeners.remove(queue)

def broadcast_update(data: dict):
    for q in list(listeners):
        try:
            q.put(data)
        except Exception:
            pass


def get_patient_id_for_device(device_id: str) -> str:
    if device_id and device_id.startswith("P0"):
        return device_id
    try:
        parts = device_id.split('-')
        num = int(parts[-1])
        pid_num = ((num - 1) % 30) + 1
        return f"P{pid_num:03d}"
    except Exception:
        return "P001"

def generate_device_event(device: Device, timestamp_str: str) -> HoneypotSecurityEvent:
    pid = get_patient_id_for_device(device.device_id)
    # Baseline normal values
    event_type = "API_REQUEST"
    records_accessed = random.randint(0, 3)
    failed_login_attempts = 0
    response_status = 200
    response_time_ms = random.randint(45, 120)
    is_anomalous_baseline = False
    
    # If device is isolated (quarantined), generate extremely quiet, low-activity heartbeat events
    if device.status == "ISOLATED":
        return HoneypotSecurityEvent(
            event_id=f"EVT-DEV-{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}",
            patient_id=pid,
            timestamp=timestamp_str,
            event_type="HEARTBEAT",
            severity="LOW",
            source=device.ip_address,
            endpoint="/api/v1/heartbeat",
            session_id=f"SESS-ISO-{random.randint(1000,9999)}",
            device_id=device.device_id,
            request_count=1,
            records_accessed=0,
            failed_login_attempts=0,
            response_status=200,
            response_time_ms=20,
            is_anomalous_baseline=False,
            synthetic=True
        )

    # Attack modulation logic
    if device.attack_active and device.attack_type:
        is_anomalous_baseline = True
        intensity_mult = {"LOW": 1.0, "MEDIUM": 2.5, "HIGH": 5.0}.get(device.attack_intensity, 1.0)
        att_type = device.attack_type.upper().replace(" ", "_")
        pid = device.device_id
        
        if "BRUTE_FORCE" in att_type or "BRUTE" in att_type:
            event_type = "FAILED_LOGIN"
            failed_login_attempts = int(random.randint(6, 16) * intensity_mult)
            response_status = 401
            response_time_ms = random.randint(120, 350)
            endpoint = "/api/v1/auth/login"
        elif "RECONNAISSANCE" in att_type or "RECON" in att_type:
            event_type = "ENDPOINT_DISCOVERY"
            records_accessed = 0
            response_status = random.choice([404, 403, 400])
            response_time_ms = random.randint(180, 480)
            endpoint = f"/api/v1/scan/port_{random.randint(1000,9999)}"
        elif "PRIVILEGE" in att_type or "ABUSE" in att_type:
            event_type = "PRIVILEGE_ESCALATION_ATTEMPT"
            failed_login_attempts = random.choice([0, 1])
            response_status = 403
            response_time_ms = random.randint(100, 250)
            endpoint = "/api/v1/admin/privilege/escalate"
        elif "SUSPICIOUS_DATA" in att_type or "DATA_ACCESS" in att_type:
            event_type = "SUSPICIOUS_DATA_ACCESS"
            records_accessed = int(random.randint(200, 500) * intensity_mult)
            response_status = 200
            response_time_ms = random.randint(250, 700)
            endpoint = f"/api/v1/patient/records/{random.randint(10000,99999)}"
        elif "EXFILTRATION" in att_type or "EXPORT" in att_type:
            event_type = "DATA_EXPORT"
            records_accessed = int(random.randint(450, 950) * intensity_mult)
            response_status = 200
            response_time_ms = random.randint(350, 950)
            endpoint = "/api/v1/patient/export/bulk"
        else:
            event_type = "SUSPICIOUS_DATA_ACCESS"
            records_accessed = int(random.randint(150, 400) * intensity_mult)
            response_status = 200
            response_time_ms = random.randint(200, 600)
            endpoint = "/api/v1/patient/export"
    else:
        # Default baseline endpoints and behavior based on device type
        endpoints = {
            "Patient Monitor": ["/api/v1/vitals/stream", "/api/v1/vitals/pulse"],
            "Infusion Pump": ["/api/v1/pump/rate", "/api/v1/pump/status"],
            "Ventilator": ["/api/v1/ventilation/pressure", "/api/v1/ventilation/flow"],
            "ECG Monitor": ["/api/v1/ecg/wave", "/api/v1/ecg/leads"],
            "Laboratory Analyzer": ["/api/v1/lab/results", "/api/v1/lab/analyze"],
            "Imaging Workstation": ["/api/v1/dicom/view", "/api/v1/dicom/metadata"],
            "Medication Dispenser": ["/api/v1/dispenser/dispense", "/api/v1/dispenser/inventory"],
            "Admin Workstation": ["/api/v1/users/active", "/api/v1/system/status"],
        }.get(device.device_type, ["/api/v1/device/status"])
        
        endpoint = random.choice(endpoints)
        if random.random() < 0.05:  # Occasional authentication failure
            event_type = "FAILED_LOGIN"
            failed_login_attempts = 1
            response_status = 401
        elif random.random() < 0.08:  # Occasional Client error
            response_status = random.choice([400, 404])

    return HoneypotSecurityEvent(
        event_id=f"EVT-DEV-{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}",
        patient_id=pid,
        timestamp=timestamp_str,
        event_type=event_type,
        severity="HIGH" if is_anomalous_baseline else "LOW",
        source=device.ip_address,
        endpoint=endpoint,
        session_id=f"SESS-{random.randint(10000,99999)}",
        device_id=device.device_id,
        request_count=1 if device.status != "ISOLATED" else 0,
        records_accessed=records_accessed,
        failed_login_attempts=failed_login_attempts,
        response_status=response_status,
        response_time_ms=response_time_ms,
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Healthcare-Agent/1.0",
        network_zone="INTERNAL",
        is_anomalous_baseline=is_anomalous_baseline,
        synthetic=True
    )


def run_telemetry_loop(db_session_factory):
    while True:
        try:
            db = db_session_factory()
            devices = db.query(Device).all()
            now_dt = datetime.datetime.utcnow()
            now_str = now_dt.isoformat() + "Z"
            
            updated_devices = []
            
            for device in devices:
                # Update Device state parameters without inserting security events
                device.last_seen = now_str
                
                # Add to history log
                history = DeviceStateHistory(
                    device_id=device.device_id,
                    timestamp=now_str,
                    status=device.status,
                    risk_score=device.risk_score or 10.0
                )
                db.add(history)
                
                # Accumulate detailed device dictionary
                updated_devices.append({
                    "device_id": device.device_id,
                    "device_name": device.device_name,
                    "device_type": device.device_type,
                    "ip_address": device.ip_address,
                    "vlan": device.vlan,
                    "status": device.status,
                    "risk_score": device.risk_score or 10.0,
                    "last_seen": device.last_seen,
                    "isolation_reason": device.isolation_reason,
                    "isolation_time": device.isolation_time,
                    "previous_risk": device.previous_risk,
                    "attack_active": device.attack_active,
                    "attack_type": device.attack_type,
                    "attack_intensity": device.attack_intensity,
                    "last_event": {
                        "timestamp": now_str,
                        "event_type": "API_REQUEST",
                        "endpoint": "/api/v1/device/status",
                        "records_accessed": 0,
                        "failed_login_attempts": 0,
                        "response_status": 200,
                        "response_time_ms": 50
                    }
                })
            
            db.commit()
            
            # Broadcast the updated status grid to listeners
            broadcast_update({
                "type": "DEVICES_UPDATE",
                "devices": updated_devices
            })
            
            db.close()
            global LAST_TELEMETRY_CYCLE_TIME
            LAST_TELEMETRY_CYCLE_TIME = datetime.datetime.utcnow()
        except Exception as e:
            print(f"Error in live telemetry generator worker: {e}")
            try:
                db.rollback()
                db.close()
            except Exception:
                pass
        
        # Sleep for 3 seconds
        time.sleep(3)


_TELEMETRY_LOCK = threading.Lock()
_TELEMETRY_RUNNING = False

def start_telemetry_generator(db_session_factory):
    global _TELEMETRY_RUNNING
    with _TELEMETRY_LOCK:
        if _TELEMETRY_RUNNING:
            return None
        _TELEMETRY_RUNNING = True
        t = threading.Thread(target=run_telemetry_loop, args=(db_session_factory,), daemon=True, name="telemetry_generator")
        t.start()
        return t
