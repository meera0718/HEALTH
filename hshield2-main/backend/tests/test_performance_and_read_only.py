import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, EventMLResult

client = TestClient(app)

def test_dashboard_read_operations_do_not_create_security_events():
    """
    Ensures that viewing Feature Engine, FEC Engine, Honeypot events, or Patient dashboards
    is strictly read-only and does NOT create new security_events records in the database.
    """
    db = SessionLocal()
    initial_event_count = db.query(HoneypotSecurityEvent).count()
    db.close()

    # 1. GET /api/v1/features/latest?patient_id=P003
    res1 = client.get("/api/v1/features/latest?patient_id=P003")
    assert res1.status_code in [200, 404]

    # 2. GET /api/v1/fec/patient/P003/latest_ml
    res2 = client.get("/api/v1/fec/patient/P003/latest_ml")
    assert res2.status_code in [200, 404]

    # 3. GET /api/v1/honeypot/events/patient/P003
    res3 = client.get("/api/v1/honeypot/events/patient/P003?category=ATTACK&limit=10")
    assert res3.status_code == 200

    # 4. GET /api/v1/patients
    res4 = client.get("/api/v1/patients")
    assert res4.status_code == 200

    # 5. GET /api/v1/devices
    res5 = client.get("/api/v1/devices")
    assert res5.status_code == 200

    db_after = SessionLocal()
    final_event_count = db_after.query(HoneypotSecurityEvent).count()
    db_after.close()

    assert final_event_count == initial_event_count, (
        f"FAIL: Dashboard GET operations created new security events! "
        f"Initial count: {initial_event_count}, Final count: {final_event_count}"
    )

def test_honeypot_simulation_creates_exactly_one_event_and_ml_result():
    """
    Ensures that executing ONE Honeypot attack simulation creates EXACTLY ONE security event
    and produces EXACTLY ONE corresponding EventMLResult.
    """
    db = SessionLocal()
    patient_id = "P003"
    initial_event_count = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id
    ).count()
    db.close()

    sim_payload = {
        "patient_id": patient_id,
        "scenario": "BRUTE_FORCE"
    }
    response = client.post("/api/v1/honeypot/simulate", json=sim_payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data.get("success") is True or res_data.get("status") == "SUCCESS"
    event_id = res_data["event"]["event_id"]
    assert event_id.startswith("EVT-SIM-")

    db_check = SessionLocal()
    new_event_count = db_check.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id
    ).count()

    created_event = db_check.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == event_id
    ).first()

    # Query ML Result for this event
    ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}")
    assert ml_res.status_code == 200
    ml_data = ml_res.json()
    assert ml_data["event_id"] == event_id

    ml_records = db_check.query(EventMLResult).filter(
        EventMLResult.event_id == event_id
    ).all()

    db_check.close()

    assert new_event_count == initial_event_count + 1, "Expected exactly 1 new event created in DB."
    assert created_event is not None, f"Event {event_id} was not found in DB."
    assert len(ml_records) == 1, f"Expected exactly 1 ML result for {event_id}, got {len(ml_records)}"

if __name__ == "__main__":
    pytest.main(["-v", __file__])
