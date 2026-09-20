import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.security_engine.replay_engine import run_controlled_replay

def test_run_controlled_replay():
    baseline_evidence = [
        {"evidence_domain": "Identity", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Network", "weight": 0.20, "required": True, "available": True},
        {"evidence_domain": "Endpoint", "weight": 0.28, "required": True, "available": False},
        {"evidence_domain": "Application", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Database", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "File", "weight": 0.07, "required": True, "available": True},
    ]

    result = run_controlled_replay("INC-0241", "CTRL-001", baseline_evidence)
    assert result["before_fec"] == 72.0
    assert result["after_fec"] == 100.0 or result["after_fec"] >= 96.0
    assert result["improvement"] >= 24.0
    assert result["status"] == "COMPLETED"
    assert len(result["simulation_steps"]) == 8
