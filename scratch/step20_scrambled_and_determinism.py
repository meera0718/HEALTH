import sys
import os
import json
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app
from app.db.database import SessionLocal
from app.db.models import EventFEC

def test_scrambled_and_determinism():
    client = TestClient(app)
    db = SessionLocal()

    print("\n=========================================================================")
    print("STEP 20 — SCRAMBLED SELECTION, DETERMINISM & THREAT INDEX ISOLATION PROOF")
    print("=========================================================================")

    # 1. SCRAMBLED SELECTION TEST
    scrambled_sequence = [
        ("BRUTE_FORCE", 12, 0, 1, "P001"),
        ("RECONNAISSANCE", 0, 0, 5, "P002"),
        ("SUSPICIOUS_DATA_ACCESS", 0, 200, 15, "P003"),
        ("BRUTE_FORCE", 1, 0, 1, "P001"),
        ("DATA_EXFILTRATION", 0, 500, 20, "P004"),
        ("RECONNAISSANCE", 0, 0, 30, "P002"),
        ("SUSPICIOUS_DATA_ACCESS", 0, 10, 2, "P003")
    ]

    scrambled_events = []
    for scenario, failed, recs, reqs, pid in scrambled_sequence:
        res = client.post("/api/v1/honeypot/simulate", json={
            "patient_id": pid,
            "scenario": scenario,
            "failed_login_attempts": failed,
            "records_accessed": recs,
            "request_count": reqs
        })
        data = res.json()
        event_id = data["event"]["event_id"]
        
        ml_res = client.get(f"/api/v1/fec/event_ml/{event_id}").json()
        expected_fec = ml_res["event_fec"]["fec_score"]

        scrambled_events.append({
            "event_id": event_id,
            "patient_id": pid,
            "scenario": scenario,
            "expected_fec": expected_fec
        })

    print("\n[+] Created Scrambled Pool of Events:")
    for item in scrambled_events:
        print(f"    Event: {item['event_id']} | Scenario: {item['scenario']} | Expected FEC: {item['expected_fec']}%")

    print("\n[+] Testing Scrambled Selection Order:")
    # Simulate user clicking in scrambled order:
    select_order = [6, 1, 4, 0, 5, 2, 3]
    scrambled_proof = []
    for idx in select_order:
        evt = scrambled_events[idx]
        # Simulate React selecting this event_id
        selected_id = evt["event_id"]
        ui_res = client.get(f"/api/v1/fec/event_ml/{selected_id}").json()
        displayed_ui_fec = ui_res["event_fec"]["fec_score"]
        displayed_event_id = ui_res["event_id"]

        match = (selected_id == displayed_event_id) and (evt["expected_fec"] == displayed_ui_fec)
        scrambled_proof.append({
            "selected_id": selected_id,
            "expected_fec": evt["expected_fec"],
            "displayed_ui_fec": displayed_ui_fec,
            "match": match
        })
        print(f"    Selected: {selected_id} -> Expected FEC: {evt['expected_fec']}% | Displayed UI FEC: {displayed_ui_fec}% | Match: {match}")

    # 2. IDENTICAL INPUT DETERMINISM TEST
    print("\n[+] Testing Identical Input Determinism:")
    # Event A and Event B generated with identical security parameters for P003
    p3_input = {
        "patient_id": "P003",
        "scenario": "SUSPICIOUS_DATA_ACCESS",
        "failed_login_attempts": 0,
        "records_accessed": 75,
        "request_count": 8
    }

    res_a = client.post("/api/v1/honeypot/simulate", json=p3_input).json()
    evt_a_id = res_a["event"]["event_id"]

    res_b = client.post("/api/v1/honeypot/simulate", json=p3_input).json()
    evt_b_id = res_b["event"]["event_id"]

    fec_a = client.get(f"/api/v1/fec/event_ml/{evt_a_id}").json()["event_fec"]["fec_score"]
    fec_b = client.get(f"/api/v1/fec/event_ml/{evt_b_id}").json()["event_fec"]["fec_score"]

    print(f"    Event A ID: {evt_a_id} -> Event FEC: {fec_a}%")
    print(f"    Event B ID: {evt_b_id} -> Event FEC: {fec_b}%")
    print(f"    Event A ID != Event B ID: {evt_a_id != evt_b_id}")
    print(f"    Deterministic Score Match (fec_a == fec_b): {fec_a == fec_b}")

    # 3. THREAT INDEX ISOLATION TEST
    print("\n[+] Testing Threat Index Isolation:")
    # Compare Event FEC vs Threat Index across different events
    evt_tf_a = client.get(f"/api/v1/detection-pipeline/event/{evt_a_id}").json()
    fec_val_a = evt_tf_a["fec"]["fec_score"]
    threat_val_a = evt_tf_a["threat_assessment"]["threat_index"]

    evt_tf_b = client.get(f"/api/v1/detection-pipeline/event/{evt_b_id}").json()
    fec_val_b = evt_tf_b["fec"]["fec_score"]
    threat_val_b = evt_tf_b["threat_assessment"]["threat_index"]

    print(f"    Event A ({evt_a_id}): Event FEC = {fec_val_a}%, Threat Index = {threat_val_a}")
    print(f"    Event B ({evt_b_id}): Event FEC = {fec_val_b}%, Threat Index = {threat_val_b}")

    db.close()

if __name__ == "__main__":
    test_scrambled_and_determinism()
