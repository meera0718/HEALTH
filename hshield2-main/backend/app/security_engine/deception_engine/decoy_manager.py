import datetime
from typing import List, Dict, Any, Optional

DEFAULT_DECOYS = [
    {
        "id": "DEC-PHARM-01",
        "name": "Fake Pharmacy Server",
        "asset_type": "Pharmacy Dispenser",
        "department": "Pharmacy",
        "is_decoy": True,
        "clinical_criticality": "HIGH",
        "risk_score": 98.5,
        "status": "ARMED",
        "ip_address": "10.10.5.99",
        "interaction_count": 0,
        "last_interaction": None,
        "decoy_metadata": {
            "environment": "SIMULATION",
            "real_asset": False,
            "trap_type": "SYNTHETIC_PHARMACY_DISPENSER",
            "simulated_vulnerability": "CVE-2024-HEALTH-DECOY"
        }
    },
    {
        "id": "DEC-PATIENT-DB",
        "name": "Synthetic Patient Database",
        "asset_type": "EHR Database",
        "department": "Records & Administration",
        "is_decoy": True,
        "clinical_criticality": "CRITICAL",
        "risk_score": 99.2,
        "status": "ARMED",
        "ip_address": "10.10.5.150",
        "interaction_count": 0,
        "last_interaction": None,
        "decoy_metadata": {
            "environment": "SIMULATION",
            "real_asset": False,
            "trap_type": "HONEYPOT_DATABASE_DECOY",
            "simulated_records": 50000
        }
    },
    {
        "id": "DEC-ADMIN-07",
        "name": "Fake Admin Workstation",
        "asset_type": "Admin Workstation",
        "department": "IT Operations",
        "is_decoy": True,
        "clinical_criticality": "MEDIUM",
        "risk_score": 85.0,
        "status": "ARMED",
        "ip_address": "10.10.2.77",
        "interaction_count": 0,
        "last_interaction": None,
        "decoy_metadata": {
            "environment": "SIMULATION",
            "real_asset": False,
            "trap_type": "HONEYPOT_CREDENTIAL_TRAP",
            "fake_admin": "sysadmin_decoy"
        }
    },
    {
        "id": "DEC-PUMP-04",
        "name": "Decoy Infusion Pump",
        "asset_type": "Infusion Pump",
        "department": "ICU Ward 3B",
        "is_decoy": True,
        "clinical_criticality": "HIGH",
        "risk_score": 91.4,
        "status": "ARMED",
        "ip_address": "10.10.3.99",
        "interaction_count": 0,
        "last_interaction": None,
        "decoy_metadata": {
            "environment": "SIMULATION",
            "real_asset": False,
            "trap_type": "DECOY_MEDICAL_IOT_DEVICE",
            "vlan": "MedIoT VLAN"
        }
    }
]

class DecoyManager:
    """
    Manages synthetic hospital deception assets.
    Supports filtering view models between Defender View and Attacker View.
    """
    def __init__(self, db_decoys: Optional[List[Dict[str, Any]]] = None):
        self.decoys = db_decoys if db_decoys is not None else DEFAULT_DECOYS

    def get_all_decoys(self, view_mode: str = "defender") -> List[Dict[str, Any]]:
        """
        Returns decoys formatted for either DEFENDER VIEW (reveals honeypot traps)
        or ATTACKER VIEW (disguises decoys as legitimate hospital assets).
        """
        result = []
        for decoy in self.decoys:
            item = dict(decoy)
            if view_mode.lower() == "attacker":
                # Disguise decoy indicators from simulated attacker view
                item["is_decoy"] = False
                item["name"] = item["name"].replace("Fake ", "").replace("Synthetic ", "").replace("Decoy ", "")
                item.pop("decoy_metadata", None)
            result.append(item)
        return result

    def get_decoy_by_id(self, decoy_id: str) -> Optional[Dict[str, Any]]:
        for d in self.decoys:
            if d["id"] == decoy_id:
                return d
        return None

    def recommend_adaptive_decoy(self, incident_stage: str, target_threat: str) -> Dict[str, Any]:
        """
        AI Adaptive Deception recommendation engine.
        Recommends optimal synthetic decoy deployment based on predicted attack path.
        """
        if "pharmacy" in target_threat.lower() or "medication" in target_threat.lower():
            rec_id = "DEC-PHARM-01"
            reason = "Attacker path predicts lateral traversal into Pharmacy infrastructure. Deploying Fake Pharmacy Server intercepts access before reaching real medication dispenser."
        elif "database" in target_threat.lower() or "ehr" in target_threat.lower():
            rec_id = "DEC-PATIENT-DB"
            reason = "High volume SQL queries detected. Synthetic Patient DB trap isolates exfiltration attempt."
        elif "admin" in target_threat.lower() or "privilege" in target_threat.lower():
            rec_id = "DEC-ADMIN-07"
            reason = "Privilege escalation detected on workstation. Fake Admin Workstation credential trap recommended."
        else:
            rec_id = "DEC-PUMP-04"
            reason = "Medical IoT network scan observed. Decoy Infusion Pump traps unauthorized device enumeration."

        decoy = self.get_decoy_by_id(rec_id) or DEFAULT_DECOYS[0]
        return {
            "recommended_decoy_id": decoy["id"],
            "decoy_name": decoy["name"],
            "target_threat_pattern": target_threat,
            "confidence": 0.94,
            "reasoning": reason,
            "status": "READY_FOR_DEPLOYMENT",
            "action_label": "ARM ADAPTIVE DECOY TRAP"
        }
