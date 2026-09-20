import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.routes.chatbot import _fallback_answer


def test_chatbot_rejects_unrelated_questions():
    answer = _fallback_answer("What is the capital of France?", {"data_available": True})
    assert "HealthShield-X Security Intelligence Assistant" in answer
    assert "medical" not in answer.lower()


def test_chatbot_recommendation_uses_security_context():
    context = {
        "data_available": True,
        "latest_event": {"event_id": "EVT-123", "endpoint": "EHR-API"},
        "high_risk_assets": [{"device_id": "DEV-7"}],
        "patient_detection": None,
    }
    answer = _fallback_answer("What should we do next to contain this threat?", context)
    assert "EVT-123" in answer
    assert "EHR-API" in answer
    assert "DEV-7" in answer


def test_chatbot_states_when_project_data_is_missing():
    answer = _fallback_answer("What threats have been detected?", {"data_available": False})
    assert "available HealthShield-X data is insufficient" in answer


def test_chatbot_recognizes_plain_language_recommendation_request():
    context = {
        "data_available": True,
        "latest_event": {"event_id": "EVT-123", "endpoint": "EHR-API"},
        "high_risk_assets": [],
        "patient_detection": None,
    }
    answer = _fallback_answer("What should we do next?", context)
    assert answer.startswith("Recommended next steps:")


def test_chatbot_does_not_confuse_affect_with_fec():
    context = {
        "data_available": True,
        "latest_event": {"event_id": "EVT-123", "endpoint": "EHR-API"},
        "high_risk_assets": [],
        "patient_detection": {"detection_status": "HIGH CONCERN"},
        "intelligence": {"patient_safety": {"impact_level": "HIGH", "impact_score": 72.0}},
    }
    answer = _fallback_answer("Could this incident affect patients?", context)
    assert "patient-safety engine" in answer
    assert "FEC score" not in answer


def test_chatbot_does_not_invent_missing_evidence():
    answer = _fallback_answer(
        "What evidence is still missing?",
        {"data_available": True, "latest_event": {"event_id": "EVT-123"}, "patient_detection": {}}
    )
    assert "UNAVAILABLE" in answer
    assert "missing-artifact list" in answer