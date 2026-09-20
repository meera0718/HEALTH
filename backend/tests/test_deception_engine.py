import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.security_engine.deception_engine.decoy_manager import DecoyManager
from app.security_engine.deception_engine.decoy_detector import DecoyDetector
from app.security_engine.deception_engine.deception_service import DeceptionService

def test_decoy_manager_views():
    manager = DecoyManager()
    defender_decoys = manager.get_all_decoys(view_mode="defender")
    assert len(defender_decoys) == 4
    assert defender_decoys[0]["is_decoy"] is True

    attacker_decoys = manager.get_all_decoys(view_mode="attacker")
    assert len(attacker_decoys) == 4
    assert attacker_decoys[0]["is_decoy"] is False
    assert "Fake" not in attacker_decoys[0]["name"]

def test_decoy_detector_trigger():
    detector = DecoyDetector()
    alert = detector.process_decoy_interaction(
        source_asset="Staff-PC-07",
        decoy_id="DEC-PHARM-01",
        decoy_name="Fake Pharmacy Server",
        incident_id="HSX-042"
    )
    assert alert["event_type"] == "DECOY_TRIGGERED"
    assert alert["malicious_confidence"] == 0.998
    assert alert["threat_diverted"] is True
    assert alert["real_critical_assets_status"] == "SAFE"

def test_deception_service_recommendation():
    service = DeceptionService()
    rec = service.get_adaptive_recommendation(
        incident_stage="Lateral Movement",
        target_threat="Pharmacy infrastructure targeting"
    )
    assert rec["recommended_decoy_id"] == "DEC-PHARM-01"
    assert rec["confidence"] == 0.94
