#!/usr/bin/env python3
"""
Seed Script for HealthTech Shield Synthetic Patient Cohort v1 (HTS-SYN-001)

Usage:
    python seed_patients.py

This script:
1. Connects to the database
2. Checks whether HTS-SYN-001 (30 patients P001-P030) already exists
3. Avoids accidental duplication
4. Inserts exactly 30 synthetic patients
5. Validates every record according to Data Quality Rules
6. Prints a summary
7. Reports success/failure
"""

import sys
import os

# Ensure backend path is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.db.database import SessionLocal, engine, Base
from app.db.models import Patient
from app.db.synthetic_cohort_v1 import SYNTHETIC_PATIENTS_COHORT_V1

REQUIRED_FIELDS = [
    "patient_id", "synthetic", "display_name", "age", "sex", "city", "occupation",
    "organization", "primary_diagnosis", "device_count", "device_type",
    "operating_system", "browser_type", "network_type", "account_age_days",
    "mfa_enabled", "last_login_days_ago", "failed_login_attempts",
    "successful_login_attempts", "requests_per_minute", "session_duration_minutes",
    "records_accessed", "unique_records_accessed", "unique_endpoints", "api_calls",
    "error_rate", "device_changes", "password_reset_count", "unusual_access_time",
    "endpoint_enumeration", "privilege_escalation_attempts", "data_export_events",
    "suspicious_downloads", "geographic_anomaly", "session_anomaly", "security_profile"
]

def validate_patient_record(rec: dict) -> tuple[bool, str]:
    # 1. Missing fields check
    for field in REQUIRED_FIELDS:
        if field not in rec or rec[field] is None:
            return False, f"Missing required field: {field}"
    
    # 2. Synthetic flag check
    if not rec.get("synthetic"):
        return False, "Record must have synthetic=True"
    
    # 3. Age range check (18-80)
    age = rec.get("age", 0)
    if not isinstance(age, int) or age < 18 or age > 80:
        return False, f"Age out of range 18-80: {age}"
    
    # 4. Error rate check (0.0 to 1.0)
    err_rate = rec.get("error_rate", -1.0)
    if not isinstance(err_rate, (int, float)) or err_rate < 0.0 or err_rate > 1.0:
        return False, f"Invalid error_rate: {err_rate}"
    
    # 5. Non-negative numeric counts check
    numeric_counts = [
        "failed_login_attempts", "successful_login_attempts", "requests_per_minute",
        "session_duration_minutes", "records_accessed", "unique_records_accessed",
        "unique_endpoints", "api_calls", "device_changes", "password_reset_count",
        "privilege_escalation_attempts", "data_export_events", "suspicious_downloads"
    ]
    for key in numeric_counts:
        val = rec.get(key, -1)
        if not isinstance(val, int) or val < 0:
            return False, f"Invalid count field {key}: {val}"

    # 6. Boolean fields check
    boolean_fields = [
        "synthetic", "mfa_enabled", "unusual_access_time", "endpoint_enumeration",
        "geographic_anomaly", "session_anomaly"
    ]
    for key in boolean_fields:
        val = rec.get(key)
        if not isinstance(val, bool):
            return False, f"Field {key} must be boolean: {val}"
            
    # 7. Security profile check
    profile = rec.get("security_profile")
    if profile not in ["LOW", "MODERATE", "HIGH", "CRITICAL"]:
        return False, f"Invalid security_profile: {profile}"

    return True, "OK"

def seed_patients_cohort():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check existing patients
        existing_count = db.query(Patient).count()
        existing_ids = {p.patient_id for p in db.query(Patient.patient_id).all()}
        
        # Check validation across cohort
        patients_data = SYNTHETIC_PATIENTS_COHORT_V1
        validation_passed = True
        missing_fields_count = 0
        duplicate_count = 0
        seen_ids = set()
        
        profile_counts = {"LOW": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}
        
        patients_to_insert = []
        
        for pdata in patients_data:
            pid = pdata["patient_id"]
            
            # Check duplicate in payload
            if pid in seen_ids or pid in existing_ids:
                duplicate_count += 1
            else:
                seen_ids.add(pid)
                
            is_valid, err_msg = validate_patient_record(pdata)
            if not is_valid:
                validation_passed = False
                missing_fields_count += 1
                print(f"Validation Error for {pid}: {err_msg}")
                
            sec_prof = pdata.get("security_profile", "LOW")
            if sec_prof in profile_counts:
                profile_counts[sec_prof] += 1
                
            patients_to_insert.append(Patient(**pdata))

        # Perform insertion if valid and not already inserted
        if validation_passed and duplicate_count == 0 and len(patients_to_insert) == 30:
            for p_obj in patients_to_insert:
                db.add(p_obj)
            db.commit()
            insertion_status = "SUCCESS"
        elif existing_count >= 30 and duplicate_count == 30:
            insertion_status = "ALREADY_SEEDED (0 Duplicates Inserted)"
        else:
            insertion_status = "FAILED"

        # Print output summary
        print("HealthTech Shield Synthetic Patient Cohort v1\n")
        print(f"Patients generated: {len(patients_data)}")
        print(f"Validation: {'PASSED' if validation_passed else 'FAILED'}")
        print(f"Duplicates: {duplicate_count if insertion_status != 'ALREADY_SEEDED (0 Duplicates Inserted)' else 0}")
        print(f"Missing fields: {missing_fields_count}\n")
        print(f"LOW: {profile_counts['LOW']}")
        print(f"MODERATE: {profile_counts['MODERATE']}")
        print(f"HIGH: {profile_counts['HIGH']}")
        print(f"CRITICAL: {profile_counts['CRITICAL']}\n")
        print(f"Database insertion: {insertion_status}")
        
        return insertion_status in ["SUCCESS", "ALREADY_SEEDED (0 Duplicates Inserted)"]

    except Exception as e:
        db.rollback()
        print(f"Database insertion: FAILED ({e})")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    success = seed_patients_cohort()
    sys.exit(0 if success else 1)
