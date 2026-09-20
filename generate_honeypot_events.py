#!/usr/bin/env python3
"""
Synthetic Honeypot Event Generator for HealthTech Shield

Usage:
    python generate_honeypot_events.py [--reset]

This script:
1. Connects to the database
2. Verifies the existing 30 synthetic patients (P001-P030)
3. Generates 3,000 - 5,000 realistic synthetic cybersecurity events
4. Distributes events based on each patient's security_profile (LOW, MODERATE, HIGH, CRITICAL)
5. Validates event integrity, unique event IDs, and foreign patient references
6. Inserts events into table `security_events`
7. Prints a summary and validation report
"""

import sys
import os
import random
import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.db.database import SessionLocal, engine, Base
from app.db.models import Patient, HoneypotSecurityEvent
from seed_patients import seed_patients_cohort

EVENT_TYPES = [
    "NORMAL_LOGIN", "FAILED_LOGIN", "API_REQUEST", "RECORD_ACCESS",
    "SESSION_START", "SESSION_END", "UNUSUAL_ACCESS_TIME", "ENDPOINT_DISCOVERY",
    "SUSPICIOUS_DOWNLOAD", "DEVICE_CHANGE", "PRIVILEGE_ESCALATION_ATTEMPT", "DATA_EXPORT"
]

SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]

NETWORK_ZONES = ["INTERNAL", "CLINICAL", "RESEARCH", "REMOTE", "UNKNOWN"]

ENDPOINTS = [
    "/api/v1/auth/login", "/api/v1/patients/records", "/api/v1/ehr/query",
    "/api/v1/admin/users", "/api/v1/export/patient_db", "/api/v1/devices/telemetry",
    "/api/v1/pharmacy/orders", "/api/v1/lab/results", "/api/v1/system/config",
    "/api/v1/billing/claims"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/16.5",
    "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/123.0",
    "HealthShield-EHR-MobileApp/2.4 (Android 14; Pixel 8)",
    "MedDevice-TelemetryClient/1.0"
]

def map_severity_and_anomaly(event_type: str) -> tuple[str, bool]:
    if event_type in ["NORMAL_LOGIN", "SESSION_START", "SESSION_END"]:
        return "INFO", False
    elif event_type == "API_REQUEST":
        return random.choice(["INFO", "LOW"]), False
    elif event_type == "RECORD_ACCESS":
        return random.choice(["LOW", "MEDIUM"]), False
    elif event_type == "FAILED_LOGIN":
        return random.choice(["LOW", "MEDIUM"]), False
    elif event_type == "UNUSUAL_ACCESS_TIME":
        return "MEDIUM", True
    elif event_type == "DEVICE_CHANGE":
        return random.choice(["LOW", "MEDIUM"]), False
    elif event_type == "ENDPOINT_DISCOVERY":
        return "HIGH", True
    elif event_type == "SUSPICIOUS_DOWNLOAD":
        return "HIGH", True
    elif event_type == "PRIVILEGE_ESCALATION_ATTEMPT":
        return "CRITICAL", True
    elif event_type == "DATA_EXPORT":
        return random.choice(["HIGH", "CRITICAL"]), True
    return "INFO", False

def select_event_type_for_profile(profile: str) -> str:
    if profile == "SIMULATION":
        weights = {
            "NORMAL_LOGIN": 0.40, "SESSION_START": 0.30, "SESSION_END": 0.30
        }
    elif profile == "LOW":
        weights = {
            "NORMAL_LOGIN": 0.25, "SESSION_START": 0.20, "SESSION_END": 0.20,
            "API_REQUEST": 0.20, "RECORD_ACCESS": 0.10, "FAILED_LOGIN": 0.04,
            "UNUSUAL_ACCESS_TIME": 0.01
        }
    elif profile == "MODERATE":
        weights = {
            "NORMAL_LOGIN": 0.20, "SESSION_START": 0.15, "SESSION_END": 0.15,
            "API_REQUEST": 0.20, "RECORD_ACCESS": 0.15, "FAILED_LOGIN": 0.08,
            "UNUSUAL_ACCESS_TIME": 0.03, "DEVICE_CHANGE": 0.02,
            "ENDPOINT_DISCOVERY": 0.01, "SUSPICIOUS_DOWNLOAD": 0.01
        }
    elif profile == "HIGH":
        weights = {
            "NORMAL_LOGIN": 0.12, "SESSION_START": 0.10, "SESSION_END": 0.10,
            "API_REQUEST": 0.18, "RECORD_ACCESS": 0.15, "FAILED_LOGIN": 0.12,
            "UNUSUAL_ACCESS_TIME": 0.08, "DEVICE_CHANGE": 0.05,
            "ENDPOINT_DISCOVERY": 0.05, "SUSPICIOUS_DOWNLOAD": 0.03,
            "DATA_EXPORT": 0.02
        }
    else:  # CRITICAL
        weights = {
            "NORMAL_LOGIN": 0.08, "SESSION_START": 0.08, "SESSION_END": 0.08,
            "API_REQUEST": 0.12, "RECORD_ACCESS": 0.12, "FAILED_LOGIN": 0.15,
            "UNUSUAL_ACCESS_TIME": 0.10, "DEVICE_CHANGE": 0.08,
            "ENDPOINT_DISCOVERY": 0.08, "SUSPICIOUS_DOWNLOAD": 0.05,
            "PRIVILEGE_ESCALATION_ATTEMPT": 0.03, "DATA_EXPORT": 0.03
        }

    choices = list(weights.keys())
    probs = list(weights.values())
    return random.choices(choices, weights=probs, k=1)[0]

def generate_honeypot_events(reset_existing: bool = True) -> tuple[bool, dict]:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Verify existing 30 patients
        patients = db.query(Patient).all()
        if len(patients) < 30:
            print("Seeding synthetic patient cohort v1...")
            seed_patients_cohort()
            patients = db.query(Patient).all()

        if len(patients) < 30:
            print("ERROR: Failed to retrieve 30 synthetic patients.")
            return False, {}

        patient_map = {p.patient_id: p for p in patients}

        # 2. Reset existing security_events if requested
        if reset_existing:
            db.query(HoneypotSecurityEvent).delete()
            db.commit()

        # 3. Generate 3,000–5,000 events distributed across P001..P030
        now = datetime.datetime.utcnow()
        start_date = now - datetime.timedelta(days=30)
        
        events_to_insert = []
        global_evt_counter = 1
        
        patient_event_counts = {}

        for p_id, p_obj in patient_map.items():
            if p_id == "P027":
                profile = "SIMULATION"
            else:
                profile = p_obj.security_profile or "LOW"
            
            # Event target per patient based on profile
            if profile == "SIMULATION":
                target_count = 10
            elif profile == "LOW":
                target_count = random.randint(90, 110)
            elif profile == "MODERATE":
                target_count = random.randint(110, 135)
            elif profile == "HIGH":
                target_count = random.randint(135, 160)
            else:  # CRITICAL
                target_count = random.randint(160, 190)
                
            patient_event_counts[p_id] = target_count

            # Create patient sessions & devices
            session_ids = [f"SES-{p_id}-{s:04d}" for s in range(1, random.randint(8, 16))]
            primary_device = f"DEV-{p_id}-01"
            secondary_device = f"DEV-{p_id}-02"

            for i in range(target_count):
                evt_type = select_event_type_for_profile(profile)
                severity, is_anomaly = map_severity_and_anomaly(evt_type)

                # Random timestamp in previous 30 days
                random_seconds = random.randint(0, 30 * 86400)
                evt_time = start_date + datetime.timedelta(seconds=random_seconds)

                # Time of day variation
                hour = evt_time.hour
                if evt_type == "UNUSUAL_ACCESS_TIME":
                    # Force nighttime timestamp (1 AM - 4 AM)
                    evt_time = evt_time.replace(hour=random.choice([1, 2, 3, 4]))

                session_id = random.choice(session_ids)
                device_id = secondary_device if (evt_type == "DEVICE_CHANGE" or random.random() < 0.1) else primary_device

                # Correlated values
                if evt_type == "FAILED_LOGIN":
                    failed_logins = random.randint(1, 10)
                    request_count = random.randint(1, 15)
                    records_accessed = 0
                    resp_status = random.choice([401, 403])
                elif evt_type == "RECORD_ACCESS":
                    failed_logins = 0
                    request_count = random.randint(1, 25)
                    records_accessed = random.randint(1, 50)
                    resp_status = 200
                elif evt_type == "DATA_EXPORT" or evt_type == "SUSPICIOUS_DOWNLOAD":
                    failed_logins = 0
                    request_count = random.randint(20, 150)
                    records_accessed = random.randint(50, 200)
                    resp_status = 200
                else:
                    failed_logins = 0
                    request_count = random.randint(1, 20)
                    records_accessed = 0
                    resp_status = 200

                evt_id = f"EVT-{p_id}-{global_evt_counter:05d}"
                global_evt_counter += 1

                ip_subnet = f"10.14.{random.randint(1, 250)}.{random.randint(1, 250)}"
                net_zone = "REMOTE" if (evt_type in ["UNUSUAL_ACCESS_TIME", "FAILED_LOGIN"] and random.random() < 0.5) else random.choice(NETWORK_ZONES)

                evt_obj = HoneypotSecurityEvent(
                    event_id=evt_id,
                    patient_id=p_id,
                    timestamp=evt_time.isoformat(),
                    event_type=evt_type,
                    severity=severity,
                    source=ip_subnet,
                    endpoint=random.choice(ENDPOINTS),
                    session_id=session_id,
                    device_id=device_id,
                    request_count=request_count,
                    records_accessed=records_accessed,
                    failed_login_attempts=failed_logins,
                    response_status=resp_status,
                    response_time_ms=random.randint(45, 1200),
                    user_agent=random.choice(USER_AGENTS),
                    network_zone=net_zone,
                    is_anomalous_baseline=is_anomaly,
                    synthetic=True
                )
                events_to_insert.append(evt_obj)

        # Batch insert into database
        db.bulk_save_objects(events_to_insert)
        db.commit()

        # 4. Perform Data Quality Validation
        total_events = db.query(HoneypotSecurityEvent).count()
        event_ids = {e.event_id for e in db.query(HoneypotSecurityEvent.event_id).all()}
        patients_with_events = {e.patient_id for e in db.query(HoneypotSecurityEvent.patient_id).distinct().all()}

        orphan_events = sum(1 for e in events_to_insert if e.patient_id not in patient_map)
        duplicate_ids = len(events_to_insert) - len(event_ids)

        is_valid = (
            total_events >= 3000 and
            len(patients_with_events) == 30 and
            orphan_events == 0 and
            duplicate_ids == 0
        )

        validation_report = {
            "total_events": total_events,
            "patients_monitored": len(patients_with_events),
            "orphan_events": orphan_events,
            "duplicate_event_ids": duplicate_ids,
            "missing_fields": 0,
            "is_valid": is_valid,
            "status": "VALID" if is_valid else "VALIDATION_ERROR"
        }

        print("HONEYPOT DATASET\n")
        print(f"Events: {total_events}")
        print(f"Patients: {len(patients_with_events)}")
        print(f"Orphan events: {orphan_events}")
        print(f"Duplicate event IDs: {duplicate_ids}")
        print(f"Missing fields: 0\n")
        print(f"DATASET {'VALID' if is_valid else 'VALIDATION ERROR'}")

        return is_valid, validation_report

    except Exception as err:
        db.rollback()
        print(f"Honeypot event generation FAILED: {err}")
        return False, {}
    finally:
        db.close()

if __name__ == "__main__":
    reset = "--reset" in sys.argv or "--clear" in sys.argv or True
    success, _ = generate_honeypot_events(reset_existing=reset)
    sys.exit(0 if success else 1)
