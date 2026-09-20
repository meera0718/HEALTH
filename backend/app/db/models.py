import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

class Device(Base):
    __tablename__ = "devices"

    device_id = Column(String, primary_key=True, index=True) # e.g. PM-01
    device_name = Column(String, nullable=False)
    device_type = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    vlan = Column(String, nullable=False)
    status = Column(String, default="SECURE") # SECURE, SUSPICIOUS, HIGH RISK, CRITICAL, ISOLATED
    risk_score = Column(Float, default=10.0)
    last_seen = Column(String, nullable=False)
    isolation_reason = Column(String, nullable=True)
    isolation_time = Column(String, nullable=True)
    previous_risk = Column(Float, nullable=True)
    attack_active = Column(Boolean, default=False)
    attack_type = Column(String, nullable=True)
    attack_intensity = Column(String, nullable=True)
    attack_start_time = Column(String, nullable=True)

class DeviceStateHistory(Base):
    __tablename__ = "device_state_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, index=True, nullable=False)
    timestamp = Column(String, nullable=False)
    status = Column(String, nullable=False)
    risk_score = Column(Float, nullable=False)

class AttackSession(Base):
    __tablename__ = "attack_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, index=True, nullable=False)
    attack_type = Column(String, nullable=False)
    intensity = Column(String, nullable=False)
    status = Column(String, default="ACTIVE") # ACTIVE, COMPLETED
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=True)

class QuarantineAction(Base):
    __tablename__ = "quarantine_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, index=True, nullable=False)
    action = Column(String, nullable=False) # ISOLATED, RESTORED
    timestamp = Column(String, nullable=False)
    reason = Column(String, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String, nullable=False)
    user = Column(String, default="investigator@hospital-demo.org")
    action = Column(String, nullable=False)
    incident_id = Column(String, default="")
    details = Column(Text, default="")

class DecoyAsset(Base):
    __tablename__ = "decoy_assets"

    id = Column(String, primary_key=True, index=True) # e.g. DEC-PHARM-01
    name = Column(String, nullable=False)
    asset_type = Column(String, nullable=False)
    department = Column(String, nullable=False)
    is_decoy = Column(Boolean, default=True)
    clinical_criticality = Column(String, default="HIGH")
    risk_score = Column(Float, default=98.5)
    status = Column(String, default="ARMED") # ARMED, TRIGGERED, DEACTIVATED
    ip_address = Column(String, default="")
    interaction_count = Column(Integer, default=0)
    last_interaction = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class DeceptionEvent(Base):
    __tablename__ = "deception_events"

    id = Column(String, primary_key=True, index=True)
    incident_id = Column(String, nullable=False)
    timestamp = Column(String, nullable=False)
    source_asset = Column(String, nullable=False)
    target_decoy_id = Column(String, nullable=False)
    event_type = Column(String, default="DECOY_TRIGGERED")
    severity = Column(String, default="CRITICAL")
    confidence = Column(Float, default=0.998)
    details = Column(Text, default="")

class PatientRecord(Base):
    __tablename__ = "patient_records"

    id = Column(String, primary_key=True, index=True) # e.g. P001, P025
    name = Column(String, nullable=False)
    diagnosis = Column(String, nullable=False)
    failed_logins = Column(Integer, default=0)
    requests_per_minute = Column(Integer, default=0)
    records_accessed = Column(Integer, default=0)
    unique_endpoints = Column(Integer, default=0)
    session_duration_min = Column(Integer, default=0)
    device_changes = Column(Integer, default=0)
    error_rate = Column(Float, default=0.0)
    unusual_access_time = Column(Integer, default=0)
    endpoint_enumeration = Column(Integer, default=0)

    # Demographic & Clinical context
    age = Column(Integer, default=45)
    gender = Column(String, default="Unspecified")
    blood_group = Column(String, default="O+")
    doctor = Column(String, default="Dr. Sarah Lin, MD")
    department = Column(String, default="General Medicine")
    status = Column(String, default="Admitted (Active)")
    room = Column(String, default="Ward 3A")
    access_history_json = Column(Text, default="[]")
    clinical_activity_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Patient(Base):
    """
    HealthTech Shield Synthetic Patient Cohort v1 (HTS-SYN-001) Table
    """
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String, unique=True, index=True, nullable=False)
    synthetic = Column(Boolean, default=True, nullable=False)
    display_name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    sex = Column(String, nullable=False)
    city = Column(String, nullable=False)
    occupation = Column(String, nullable=False)
    organization = Column(String, nullable=False)
    primary_diagnosis = Column(String, nullable=False)

    device_count = Column(Integer, default=1)
    device_type = Column(String, default="Laptop")
    operating_system = Column(String, default="Windows 11")
    browser_type = Column(String, default="Chrome")
    network_type = Column(String, default="Home WiFi")
    account_age_days = Column(Integer, default=100)
    mfa_enabled = Column(Boolean, default=True)
    last_login_days_ago = Column(Integer, default=1)

    failed_login_attempts = Column(Integer, default=0)
    successful_login_attempts = Column(Integer, default=10)
    requests_per_minute = Column(Integer, default=10)
    session_duration_minutes = Column(Integer, default=30)
    records_accessed = Column(Integer, default=5)
    unique_records_accessed = Column(Integer, default=4)
    unique_endpoints = Column(Integer, default=3)
    api_calls = Column(Integer, default=50)
    error_rate = Column(Float, default=0.01)
    device_changes = Column(Integer, default=0)
    password_reset_count = Column(Integer, default=0)
    unusual_access_time = Column(Boolean, default=False)
    endpoint_enumeration = Column(Boolean, default=False)
    privilege_escalation_attempts = Column(Integer, default=0)
    data_export_events = Column(Integer, default=0)
    suspicious_downloads = Column(Integer, default=0)
    geographic_anomaly = Column(Boolean, default=False)
    session_anomaly = Column(Boolean, default=False)
    security_profile = Column(String, default="LOW")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class HoneypotSecurityEvent(Base):
    """
    Synthetic Honeypot Security Events Table (security_events)
    """
    __tablename__ = "security_events"

    event_id = Column(String, primary_key=True, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    timestamp = Column(String, index=True, nullable=False)
    event_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    source = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)
    session_id = Column(String, index=True, nullable=False)
    device_id = Column(String, nullable=False)
    request_count = Column(Integer, default=1)
    records_accessed = Column(Integer, default=0)
    failed_login_attempts = Column(Integer, default=0)
    response_status = Column(Integer, default=200)
    response_time_ms = Column(Integer, default=100)
    user_agent = Column(String, default="Mozilla/5.0")
    network_zone = Column(String, default="INTERNAL")
    is_anomalous_baseline = Column(Boolean, default=False)
    synthetic = Column(Boolean, default=False)
    scenario = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PatientFeature(Base):
    __tablename__ = "patient_features"

    feature_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String, nullable=False, unique=True, index=True)
    calculated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    feature_version = Column(String, default="v1", nullable=False)

    total_events = Column(Integer, default=0, nullable=False)
    normal_login_count = Column(Integer, default=0, nullable=False)
    failed_login_count = Column(Integer, default=0, nullable=False)
    failed_login_rate = Column(Float, default=0.0, nullable=False)
    api_request_count = Column(Integer, default=0, nullable=False)
    request_rate = Column(Float, default=0.0, nullable=False)
    record_access_count = Column(Integer, default=0, nullable=False)
    total_records_accessed = Column(Integer, default=0, nullable=False)
    unique_endpoints = Column(Integer, default=0, nullable=False)
    endpoint_discovery_count = Column(Integer, default=0, nullable=False)
    suspicious_download_count = Column(Integer, default=0, nullable=False)
    data_export_count = Column(Integer, default=0, nullable=False)
    privilege_escalation_count = Column(Integer, default=0, nullable=False)
    device_change_count = Column(Integer, default=0, nullable=False)
    unusual_access_time_count = Column(Integer, default=0, nullable=False)
    error_count = Column(Integer, default=0, nullable=False)
    error_rate = Column(Float, default=0.0, nullable=False)
    unique_sessions = Column(Integer, default=0, nullable=False)
    unique_devices = Column(Integer, default=0, nullable=False)
    average_response_time_ms = Column(Float, default=0.0, nullable=False)
    night_activity_count = Column(Integer, default=0, nullable=False)
    anomalous_event_count = Column(Integer, default=0, nullable=False)


class PatientFEC(Base):
    __tablename__ = "patient_fec"

    fec_id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String, nullable=False, unique=True, index=True)
    fec_score = Column(Float, nullable=False)
    authentication_component = Column(Float, nullable=False)
    request_access_component = Column(Float, nullable=False)
    record_exposure_component = Column(Float, nullable=False)
    endpoint_anomaly_component = Column(Float, nullable=False)
    data_movement_component = Column(Float, nullable=False)
    device_anomaly_component = Column(Float, nullable=False)
    time_anomaly_component = Column(Float, nullable=False)
    general_anomaly_component = Column(Float, nullable=False)
    fec_version = Column(String, default="v1", nullable=False)
    calculated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class PipelineExecution(Base):
    __tablename__ = "pipeline_executions"

    detection_id = Column(String, primary_key=True, index=True)
    event_id = Column(String, index=True, nullable=True)
    patient_id = Column(String, index=True, nullable=True)
    current_stage = Column(String, nullable=True)
    stage_status = Column(String, nullable=True)
    started_at = Column(String, nullable=True)
    completed_at = Column(String, nullable=True)
    final_status = Column(String, default="PROCESSING")
    stage_details = Column(Text, default="{}")


class EventMLResult(Base):
    """
    ML Pipeline execution outputs linked to a single, unique Honeypot Security Event ID.
    Guarantees traceabilty: Honeypot -> FEC -> Feature Vector -> OCSVM -> Isolation Forest -> XGBoost.
    """
    __tablename__ = "event_ml_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    scenario = Column(String, nullable=True)
    event_type = Column(String, nullable=True)
    severity = Column(String, nullable=True)
    timestamp = Column(String, nullable=True)
    endpoint = Column(String, nullable=True)
    feature_vector_json = Column(Text, nullable=False)
    ocsvm_prediction = Column(String, nullable=False)
    ocsvm_score = Column(Float, nullable=False)
    isolation_forest_prediction = Column(String, nullable=False)
    isolation_forest_score = Column(Float, nullable=False)
    xgboost_classification = Column(String, nullable=False)
    xgboost_probability = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)



class EventFusionResult(Base):
    """
    Fusion Engine and Threat Assessment outputs linked to a single, unique Honeypot Security Event ID.
    Guarantees traceability: EventMLResult -> Fusion Engine -> Threat Assessment.
    """
    __tablename__ = "event_fusion_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    scenario = Column(String, nullable=True)
    event_type = Column(String, nullable=True)
    timestamp = Column(String, nullable=True)
    endpoint = Column(String, nullable=True)
    model_agreement_count = Column(Integer, nullable=False)
    model_agreement_ratio = Column(String, nullable=False)
    fusion_result = Column(String, nullable=False)
    threat_index = Column(Float, nullable=False)
    evidence_strength = Column(String, nullable=False)
    assessment = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class EventFEC(Base):
    """
    Event-level Feature Exposure Composite (FEC) results linked to a single, unique Honeypot Security Event ID.
    Calculated deterministically from patient baseline FEC + event-specific security characteristics.
    """
    __tablename__ = "event_fec"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(String, index=True, nullable=False)
    fec_score = Column(Float, nullable=False)
    baseline_fec = Column(Float, nullable=False)
    event_adjustment = Column(Float, nullable=False)
    failed_login_component = Column(Float, default=0.0)
    request_rate_component = Column(Float, default=0.0)
    data_access_component = Column(Float, default=0.0)
    privilege_escalation_component = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

class UserFaceBiometric(Base):
    __tablename__ = "user_face_biometrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String, unique=True, index=True, nullable=False) # e.g. DOCTOR_DEMO, P001, P003, INVESTIGATOR@GMAIL.COM
    user_role = Column(String, nullable=False, default="PATIENT") # DOCTOR, PATIENT, INVESTIGATOR
    face_embedding_hash = Column(String, nullable=False)
    biometric_features_json = Column(Text, nullable=False)
    registered_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class Investigator(Base):
    __tablename__ = "investigators"

    account_id = Column(String, primary_key=True, index=True) # e.g. HARSHITHA@GMAIL.COM, INVESTIGATOR@GMAIL.COM
    email = Column(String, unique=True, index=True, nullable=True) # nullable=True initially for migration, but enforced at logic level
    display_id = Column(String, unique=True, nullable=True) # e.g. INV-003
    full_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    created_by = Column(String, default="SYSTEM")
