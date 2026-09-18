import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.security_engine.judge_wow_engine import get_judge_wow_data

def test_judge_wow_engine_structure():
    data = get_judge_wow_data("HSX-042")
    assert data["incident_id"] == "HSX-042"
    
    # 🧬 Threat DNA
    assert "threat_dna" in data
    assert data["threat_dna"]["signature_flow"] == "CRED → PRIV → LATERAL → DECOY"
    assert data["threat_dna"]["similarity_match"]["similarity_percent"] == 94.0

    # ▶️ Attack Replay
    assert len(data["attack_replay_steps"]) == 5

    # 🕰️ Time Machine & Evidence Evolution
    assert len(data["time_machine_states"]) == 5
    assert data["time_machine_states"][0]["risk_score"] == 18
    assert data["time_machine_states"][-1]["risk_score"] == 99.8

    # 🫥 Invisible Attack Detector
    assert data["invisible_attack_detection"]["missing_event"] == "MFA verification"

    # 🔮 Attack Path Prediction
    assert len(data["attack_path_prediction"]["targets"]) == 4

    # 🏥 Clinical Impact
    assert len(data["clinical_service_impact"]["services"]) == 4

    # ⚖️ Security Courtroom
    assert data["security_courtroom"]["prosecutor_ai"]["threat_confidence"] == 87.0
    assert data["security_courtroom"]["defender_ai"]["legitimate_confidence"] == 31.0

    # 🕵️ Investigator Mode
    assert len(data["investigator_mode"]["options"]) == 4

    # 🧠 Counterfactual & Blast Radius
    assert len(data["counterfactual"]["options"]) == 3
