import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent

client = TestClient(app)

def test_latest_detection_endpoint():
    """
    Verifies /api/v1/detection-pipeline/latest returns unified data contract.
    """
    res_sim = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    assert res_sim.status_code == 200
    sim_evt_id = res_sim.json()["event"]["event_id"]

    res_pipeline = client.get("/api/v1/detection-pipeline/latest?patient_id=P003")
    assert res_pipeline.status_code == 200
    data = res_pipeline.json()

    assert data["event_id"] == sim_evt_id
    assert data["patient_id"] == "P003"
    assert "honeypot" in data
    assert "feature_engine" in data
    assert "fec" in data
    assert "ocsvm" in data
    assert "isolation_forest" in data
    assert "xgboost" in data
    assert "fusion" in data
    assert "threat_assessment" in data

def test_event_id_traceability():
    """
    Verifies event_id is present and identical across all pipeline stage objects.
    """
    res_sim = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"})
    assert res_sim.status_code == 200
    evt_id = res_sim.json()["event"]["event_id"]

    res_pipeline = client.get(f"/api/v1/detection-pipeline/event/{evt_id}")
    assert res_pipeline.status_code == 200
    data = res_pipeline.json()

    assert data["event_id"] == evt_id
    assert data["honeypot"]["event_id"] == evt_id
    assert data["feature_engine"]["event_id"] == evt_id
    assert data["fec"]["event_id"] == evt_id
    assert data["ocsvm"]["event_id"] == evt_id
    assert data["isolation_forest"]["event_id"] == evt_id
    assert data["xgboost"]["event_id"] == evt_id
    assert data["fusion"]["event_id"] == evt_id
    assert data["threat_assessment"]["event_id"] == evt_id

def test_pipeline_event_isolation():
    """
    Simulates Event A and Event B for P003 and verifies they are completely isolated.
    """
    res_a = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    evt_id_a = res_a.json()["event"]["event_id"]

    res_b = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    evt_id_b = res_b.json()["event"]["event_id"]

    data_a = client.get(f"/api/v1/detection-pipeline/event/{evt_id_a}").json()
    data_b = client.get(f"/api/v1/detection-pipeline/event/{evt_id_b}").json()

    assert evt_id_a != evt_id_b
    assert data_a["event_id"] == evt_id_a
    assert data_b["event_id"] == evt_id_b
    assert data_a["scenario"] != data_b["scenario"]

def test_simulation_updates_pipeline():
    """
    Verifies that calling simulate updates the latest detection pipeline endpoint for the patient.
    """
    res_sim = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "SUSPICIOUS_DATA_ACCESS"})
    new_evt_id = res_sim.json()["event"]["event_id"]

    latest_data = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    assert latest_data["event_id"] == new_evt_id

def test_baseline_events_do_not_override_detection():
    """
    Verifies that baseline EVT-DEV- events are strictly excluded from latest detection pipeline.
    """
    # 1. Simulate an attack event
    res_sim = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    sim_evt_id = res_sim.json()["event"]["event_id"]

    import datetime
    import uuid
    # 2. Insert a baseline EVT-DEV- event manually
    db = SessionLocal()
    dev_evt_id = f"EVT-DEV-BASELINE-{uuid.uuid4().hex[:8].upper()}"
    dev_evt = HoneypotSecurityEvent(
        event_id=dev_evt_id,
        patient_id="P003",
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z",
        source="baseline-telemetry-generator",
        session_id="SES-BASE-123",
        device_id="DEV-BASE-456",
        event_type="API_REQUEST",
        severity="INFO",
        scenario="Baseline / Not applicable",
        endpoint="/api/v1/patients/P003",
        synthetic=False
    )
    db.add(dev_evt)
    db.commit()
    db.close()

    # 3. Query latest detection pipeline
    latest_data = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()

    assert latest_data["event_id"] == sim_evt_id, "Baseline EVT-DEV event must NOT override simulation detection."

def test_no_random_pipeline_values():
    """
    Verifies Threat Index and pipeline outputs are 100% deterministic.
    """
    res_sim = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    evt_id = res_sim.json()["event"]["event_id"]

    data1 = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()
    data2 = client.get(f"/api/v1/detection-pipeline/event/{evt_id}").json()

    assert data1["threat_assessment"]["threat_index"] == data2["threat_assessment"]["threat_index"]
    assert data1["fusion"]["model_agreement"] == data2["fusion"]["model_agreement"]

def test_patient_isolation():
    """
    Verifies patient P003 and P012 receive distinct events and pipeline results.
    """
    res_p003 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    evt_p003 = res_p003.json()["event"]["event_id"]

    res_p012 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P012", "scenario": "RECONNAISSANCE"})
    evt_p012 = res_p012.json()["event"]["event_id"]

    latest_p003 = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    latest_p012 = client.get("/api/v1/detection-pipeline/latest?patient_id=P012").json()

    assert latest_p003["patient_id"] == "P003"
    assert latest_p003["event_id"] == evt_p003

    assert latest_p012["patient_id"] == "P012"
    assert latest_p012["event_id"] == evt_p012

    assert evt_p003 != evt_p012

if __name__ == "__main__":
    pytest.main(["-v", __file__])
