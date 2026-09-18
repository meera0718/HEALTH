import pytest
import datetime
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent

client = TestClient(app)

def test_honeypot_returns_event_id():
    """
    Verifies POST /api/v1/honeypot/simulate returns newly generated event_id and status.
    """
    res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    assert res.status_code == 200
    data = res.json()

    assert data["success"] is True
    assert "event" in data
    assert data["event"]["event_id"].startswith("EVT-SIM-")
    assert data["event"]["patient_id"] == "P003"

def test_honeypot_detection_event_handoff():
    """
    Verifies Honeypot simulation payload returns complete metadata needed for event handoff.
    """
    res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "RECONNAISSANCE"})
    assert res.status_code == 200
    event_payload = res.json()["event"]

    assert "event_id" in event_payload
    assert "patient_id" in event_payload
    assert "scenario" in event_payload
    assert "event_type" in event_payload
    assert "severity" in event_payload
    assert "timestamp" in event_payload

def test_detection_pipeline_receives_event():
    """
    Verifies detection pipeline latest endpoint returns the newly created event.
    """
    sim_res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "SUSPICIOUS_DATA_ACCESS"})
    sim_evt_id = sim_res.json()["event"]["event_id"]

    pipe_res = client.get("/api/v1/detection-pipeline/latest?patient_id=P003")
    assert pipe_res.status_code == 200
    pipe_data = pipe_res.json()

    assert pipe_data["event_id"] == sim_evt_id
    assert pipe_data["patient_id"] == "P003"

def test_detection_pipeline_uses_exact_event_id():
    """
    Verifies GET /api/v1/detection-pipeline/event/{event_id} and /events/{event_id} retrieve that exact event_id.
    """
    sim_res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    sim_evt_id = sim_res.json()["event"]["event_id"]

    evt_res = client.get(f"/api/v1/detection-pipeline/event/{sim_evt_id}")
    assert evt_res.status_code == 200
    evt_data = evt_res.json()

    assert evt_data["event_id"] == sim_evt_id
    assert evt_data["patient_id"] == "P003"
    assert evt_data["honeypot"]["event_id"] == sim_evt_id

    # Verify route alias /events/{event_id}
    events_alias_res = client.get(f"/api/v1/detection-pipeline/events/{sim_evt_id}")
    assert events_alias_res.status_code == 200
    assert events_alias_res.json()["event_id"] == sim_evt_id

def test_second_event_replaces_first():
    """
    Simulates Event A then Event B for P003, verifying latest pipeline updates to Event B.
    """
    res_a = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    evt_a = res_a.json()["event"]["event_id"]

    res_b = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "DATA_EXFILTRATION"})
    evt_b = res_b.json()["event"]["event_id"]

    latest_data = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()

    assert evt_a != evt_b
    assert latest_data["event_id"] == evt_b, "Event B must replace Event A in latest detection."

def test_patient_event_isolation():
    """
    Verifies P003 and P012 events remain isolated.
    """
    res_p003 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    evt_p003 = res_p003.json()["event"]["event_id"]

    res_p012 = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P012", "scenario": "RECONNAISSANCE"})
    evt_p012 = res_p012.json()["event"]["event_id"]

    data_p003 = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    data_p012 = client.get("/api/v1/detection-pipeline/latest?patient_id=P012").json()

    assert data_p003["event_id"] == evt_p003
    assert data_p012["event_id"] == evt_p012
    assert evt_p003 != evt_p012

def test_baseline_event_cannot_override_simulation():
    """
    Verifies baseline EVT-DEV- events do not override Honeypot simulation detections.
    """
    sim_res = client.post("/api/v1/honeypot/simulate", json={"patient_id": "P003", "scenario": "BRUTE_FORCE"})
    sim_evt_id = sim_res.json()["event"]["event_id"]

    db = SessionLocal()
    dev_evt_id = f"EVT-DEV-BASE-{uuid.uuid4().hex[:8].upper()}"
    dev_evt = HoneypotSecurityEvent(
        event_id=dev_evt_id,
        patient_id="P003",
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z",
        source="baseline-generator",
        session_id="SES-BASE",
        device_id="DEV-BASE",
        event_type="API_REQUEST",
        severity="INFO",
        scenario="Baseline / Not applicable",
        endpoint="/api/v1/patients/P003",
        synthetic=False
    )
    db.add(dev_evt)
    db.commit()
    db.close()

    latest_data = client.get("/api/v1/detection-pipeline/latest?patient_id=P003").json()
    assert latest_data["event_id"] == sim_evt_id

def test_detection_pipeline_does_not_create_events():
    """
    Verifies that GET requests on detection-pipeline endpoints do not create new SQLite events.
    """
    db = SessionLocal()
    count_before = db.query(HoneypotSecurityEvent).count()
    db.close()

    client.get("/api/v1/detection-pipeline/latest?patient_id=P003")
    client.get("/api/v1/detection-pipeline/latest?patient_id=ALL")

    db = SessionLocal()
    count_after = db.query(HoneypotSecurityEvent).count()
    db.close()

    assert count_before == count_after, "Detection Pipeline GET endpoints must be strictly read-only."

if __name__ == "__main__":
    pytest.main(["-v", __file__])
