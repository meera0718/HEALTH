import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.security_engine.fec_engine import calculate_fec

def test_calculate_fec_baseline():
    evidence_list = [
        {"evidence_domain": "Identity", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Network", "weight": 0.20, "required": True, "available": True},
        {"evidence_domain": "Endpoint", "weight": 0.28, "required": True, "available": False}, # MISSING
        {"evidence_domain": "Application", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Database", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "File", "weight": 0.07, "required": True, "available": True},
    ]

    result = calculate_fec(evidence_list)
    assert result["overall_fec"] == 72.0
    assert result["stages"]["Execution"] == 61.0
    assert result["stages"]["Lateral Movement"] == 48.0
    assert len(result["missing_gaps"]) == 1
    assert result["missing_gaps"][0]["domain"] == "Endpoint"

def test_calculate_fec_post_control():
    evidence_list = [
        {"evidence_domain": "Identity", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Network", "weight": 0.20, "required": True, "available": True},
        {"evidence_domain": "Endpoint", "weight": 0.28, "required": True, "available": True}, # APPLIED CONTROL
        {"evidence_domain": "Application", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "Database", "weight": 0.15, "required": True, "available": True},
        {"evidence_domain": "File", "weight": 0.07, "required": True, "available": True},
    ]

    result = calculate_fec(evidence_list)
    assert result["overall_fec"] == 100.0 or result["overall_fec"] >= 96.0
    assert result["stages"]["Execution"] == 94.0
    assert result["stages"]["Lateral Movement"] == 91.0
    assert len(result["missing_gaps"]) == 0
