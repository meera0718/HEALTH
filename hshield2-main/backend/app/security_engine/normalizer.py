from typing import Dict, Any, List
from pydantic import BaseModel, Field

class CanonicalEvent(BaseModel):
    id: str
    incident_id: str
    timestamp: str
    source_ip: str
    destination_ip: str
    source_port: int = 0
    destination_port: int = 0
    protocol: str = "TCP"
    event_type: str
    source_entity: str
    destination_entity: str
    user: str = "system"
    application: str = "Healthcare App"
    attack_stage: str # Initial Access, Execution, Lateral Movement, Data Access, Exfiltration
    evidence_domain: str # Identity, Network, Endpoint, Application, Database, File
    evidence_status: str = "Verified" # Verified, Missing, Suspicious
    confidence: float = 0.95
    raw_reference: str = ""

EVENT_TYPE_STAGE_MAP = {
    "failed_login": ("Initial Access", "Identity"),
    "successful_authentication": ("Initial Access", "Identity"),
    "workstation_logon": ("Initial Access", "Identity"),
    "process_creation": ("Execution", "Endpoint"),
    "powershell_execution": ("Execution", "Endpoint"),
    "service_installation": ("Execution", "Endpoint"),
    "internal_connection": ("Lateral Movement", "Network"),
    "smb_traversal": ("Lateral Movement", "Network"),
    "api_access": ("Lateral Movement", "Application"),
    "database_query": ("Data Access", "Database"),
    "patient_record_read": ("Data Access", "Database"),
    "large_outbound_transfer": ("Exfiltration", "Network"),
    "file_export": ("Exfiltration", "File"),
}

def normalize_event(raw_data: Dict[str, Any], incident_id: str, event_id: str) -> CanonicalEvent:
    event_type = raw_data.get("event_type", "unknown_access").lower()
    
    # Map event type to attack stage & evidence domain if available
    stage, domain = EVENT_TYPE_STAGE_MAP.get(
        event_type, 
        (raw_data.get("attack_stage", "Lateral Movement"), raw_data.get("evidence_domain", "Network"))
    )

    return CanonicalEvent(
        id=event_id,
        incident_id=incident_id,
        timestamp=raw_data.get("timestamp", "10:30:00"),
        source_ip=raw_data.get("source_ip", "10.10.1.10"),
        destination_ip=raw_data.get("destination_ip", "10.10.2.14"),
        source_port=int(raw_data.get("source_port", 443)),
        destination_port=int(raw_data.get("destination_port", 8080)),
        protocol=raw_data.get("protocol", "TCP"),
        event_type=event_type,
        source_entity=raw_data.get("source_entity", "EXTERNAL_NET"),
        destination_entity=raw_data.get("destination_entity", "WORKSTATION-14"),
        user=raw_data.get("user", "dr_smith"),
        application=raw_data.get("application", "EHR Portal"),
        attack_stage=stage,
        evidence_domain=domain,
        evidence_status=raw_data.get("evidence_status", "Verified"),
        confidence=float(raw_data.get("confidence", 0.95)),
        raw_reference=str(raw_data.get("raw_reference", raw_data))
    )
