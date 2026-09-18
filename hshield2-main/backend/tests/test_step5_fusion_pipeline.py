import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventMLResult, EventFusionResult
from app.security_engine.event_fusion_pipeline import calculate_deterministic_threat_index

client = TestClient(app)

def test_fusion_event_isolation():
    """
    Simulates Attack A (BRUTE_FORCE) and Attack B (DATA_EXFILTRATION) for patient P003.
    Verifies that Event A and Event B produce distinct event_ids, distinct feature vectors,
    distinct ML results, and distinct fusion results. Fusion A remains unchanged when B is created.
    """
    # 1. Attack A: BRUTE_FORCE
    res_a = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    evt_id_a = data_a["event"]["event_id"]

    fusion_res_a1 = client.get(f"/api/v1/fusion/event/{evt_id_a}")
    assert fusion_res_a1.status_code == 200
    fusion_a1 = fusion_res_a1.json()

    # 2. Attack B: DATA_EXFILTRATION
    res_b = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    assert res_b.status_code == 200
    data_b = res_b.json()
    evt_id_b = data_b["event"]["event_id"]

    fusion_res_b = client.get(f"/api/v1/fusion/event/{evt_id_b}")
    assert fusion_res_b.status_code == 200
    fusion_b = fusion_res_b.json()

    # Re-fetch fusion A to confirm it remains unchanged
    fusion_res_a2 = client.get(f"/api/v1/fusion/event/{evt_id_a}")
    fusion_a2 = fusion_res_a2.json()

    assert evt_id_a != evt_id_b
    assert fusion_a1["feature_vector"] != fusion_b["feature_vector"]
    assert fusion_a1 == fusion_a2, "Fusion A must remain unchanged when Fusion B is created."

def test_fusion_persistence():
    """
    Verifies that calling fusion endpoint multiple times for the same event_id
    returns the exact persisted record from EventFusionResult table.
    """
    res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"})
    assert res.status_code == 200
    evt_id = res.json()["event"]["event_id"]

    # First fetch (creates and persists)
    get1 = client.get(f"/api/v1/fusion/event/{evt_id}")
    assert get1.status_code == 200
    data1 = get1.json()

    # Second fetch (retrieves persisted)
    get2 = client.get(f"/api/v1/fusion/event/{evt_id}")
    assert get2.status_code == 200
    data2 = get2.json()

    db = SessionLocal()
    records = db.query(EventFusionResult).filter(EventFusionResult.event_id == evt_id).all()
    db.close()

    assert len(records) == 1, f"Expected exactly 1 EventFusionResult for {evt_id}, got {len(records)}"
    assert data1["threat_assessment"]["threat_index"] == data2["threat_assessment"]["threat_index"]

def test_threat_index_deterministic():
    """
    Verifies that calculate_deterministic_threat_index returns identical, reproducible
    Threat Index values for identical inputs.
    """
    idx1 = calculate_deterministic_threat_index(
        ocsvm_pred="ANOMALOUS", ocsvm_score=-5.03,
        iforest_pred="OUTLIER", iforest_score=-0.07,
        xgb_class="DATA_EXFILTRATION", xgb_prob=0.99
    )
    idx2 = calculate_deterministic_threat_index(
        ocsvm_pred="ANOMALOUS", ocsvm_score=-5.03,
        iforest_pred="OUTLIER", iforest_score=-0.07,
        xgb_class="DATA_EXFILTRATION", xgb_prob=0.99
    )

    assert idx1 == idx2, "Threat index calculation must be 100% deterministic."
    assert 0.0 <= idx1 <= 100.0, "Threat index must be bounded between 0 and 100."

def test_model_agreement():
    """
    Verifies that Model Agreement ratio ('1/3', '2/3', '3/3') dynamically reflects actual model predictions.
    """
    res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    assert res.status_code == 200
    evt_id = res.json()["event"]["event_id"]

    fusion_res = client.get(f"/api/v1/fusion/event/{evt_id}").json()
    model_agreement = fusion_res["fusion"]["model_agreement"]
    ocsvm_flagged = 1 if fusion_res["ocsvm"]["classification"] == "ANOMALOUS" else 0
    iforest_flagged = 1 if fusion_res["isolation_forest"]["classification"] == "OUTLIER" else 0
    xgb_flagged = 1 if fusion_res["xgboost"]["classification"] != "NORMAL" else 0
    expected_count = ocsvm_flagged + iforest_flagged + xgb_flagged

    agreement_ratio = model_agreement if isinstance(model_agreement, str) else model_agreement.get("ratio")
    assert agreement_ratio == f"{expected_count}/3"

def test_patient_isolation():
    """
    Verifies that simulating attacks for P003, P012, and P020 produces isolated events,
    features, and threat assessments without cross-patient leakage.
    """
    pids = ["P003", "P012", "P020"]
    event_ids = []

    for pid in pids:
        res = client.post("/api/v1/honeypot/simulate", json={"patient_id": pid, "scenario": "SUSPICIOUS_DATA_ACCESS"})
        assert res.status_code == 200
        evt_id = res.json()["event"]["event_id"]
        event_ids.append(evt_id)

        latest_res = client.get(f"/api/v1/fusion/patient/{pid}/latest")
        assert latest_res.status_code == 200
        latest_data = latest_res.json()
        assert latest_data["patient_id"] == pid
        assert latest_data["event_id"] == evt_id

    assert len(set(event_ids)) == 3, "All 3 patients must receive distinct event_ids."

def test_four_attack_scenarios():
    """
    Verifies end-to-end processing for all 4 supported attack scenarios:
    1. BRUTE_FORCE
    2. RECONNAISSANCE
    3. SUSPICIOUS_DATA_ACCESS
    4. DATA_EXFILTRATION
    """
    scenarios = [
        ("BRUTE_FORCE", "Brute Force"),
        ("RECONNAISSANCE", "Reconnaissance"),
        ("SUSPICIOUS_DATA_ACCESS", "Suspicious Data Access"),
        ("DATA_EXFILTRATION", "Data Exfiltration")
    ]

    for scen_key, expected_name in scenarios:
        res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": scen_key})
        assert res.status_code == 200
        evt_id = res.json()["event"]["event_id"]

        fusion_res = client.get(f"/api/v1/fusion/event/{evt_id}")
        assert fusion_res.status_code == 200
        data = fusion_res.json()

        assert data["event_id"] == evt_id
        assert data["patient_id"] == "P003"
        assert data["scenario"] == expected_name
        assert "ocsvm" in data
        assert "isolation_forest" in data
        assert "xgboost" in data
        assert "fusion" in data
        assert "threat_assessment" in data
        assert 0.0 <= data["threat_assessment"]["threat_index"] <= 100.0
        assert data["threat_assessment"]["evidence_strength"] in ["HIGH", "MEDIUM", "LOW"]

if __name__ == "__main__":
    pytest.main(["-v", __file__])
