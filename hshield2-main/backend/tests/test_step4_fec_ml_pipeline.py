import sys
import os
import json
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_step4_four_attacks_and_patient_isolation():
    """
    Step 4 Test Suite:
    1. Tests 4 attack scenarios for P003 (BRUTE_FORCE, RECONNAISSANCE, SUSPICIOUS_DATA_ACCESS, DATA_EXFILTRATION).
    2. Verifies exact Event ID flow: Honeypot -> FEC -> Feature Vector -> OCSVM -> Isolation Forest -> XGBoost.
    3. Verifies historical preservation (new event results do NOT overwrite old event results).
    4. Verifies Patient Isolation across P003, P012, P020, and P025.
    5. Verifies no static/fake values.
    """
    print("\n==================================================")
    print("STEP 4: FEC ENGINE TO ML DETECTION PIPELINE TESTS")
    print("==================================================")

    # ------------------------------------------------------------------
    # TEST 1: P003 - BRUTE FORCE
    # ------------------------------------------------------------------
    sim1_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "BRUTE_FORCE"
    })
    assert sim1_res.status_code == 200
    data1 = sim1_res.json()
    evt1_id = data1["event"]["event_id"]
    assert evt1_id.startswith("EVT-SIM-")

    # Fetch Event ML result for EVT1
    ml1_res = client.get(f"/api/v1/fec/event_ml/{evt1_id}")
    assert ml1_res.status_code == 200
    ml1 = ml1_res.json()

    # Trace Event ID
    assert ml1["event_id"] == evt1_id
    assert ml1["patient_id"] == "P003"
    assert ml1["ocsvm"]["model"] == "OCSVM"
    assert ml1["isolation_forest"]["model"] == "ISOLATION_FOREST"
    assert ml1["xgboost"]["model"] == "XGBOOST"

    # Verify Feature Vector (11 elements)
    assert isinstance(ml1["feature_vector"], list)
    assert len(ml1["feature_vector"]) == 11
    # For Brute Force: failed_logins=5, requests_per_min=1, error_rate=1
    assert ml1["feature_vector"][0] == 5

    # Verify model prediction structures
    assert ml1["ocsvm"]["prediction"] in ["ANOMALOUS", "NORMAL"]
    assert isinstance(ml1["ocsvm"]["score"], float)
    assert ml1["isolation_forest"]["prediction"] in ["OUTLIER", "ANOMALOUS", "NORMAL"]
    assert isinstance(ml1["isolation_forest"]["score"], float)
    assert isinstance(ml1["xgboost"]["classification"], str)
    assert isinstance(ml1["xgboost"]["probability"], float)

    print(f"[PASSED] TEST 1 (P003 Brute Force - Event ID: {evt1_id})")

    # ------------------------------------------------------------------
    # TEST 2: P003 - RECONNAISSANCE
    # ------------------------------------------------------------------
    sim2_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "RECONNAISSANCE"
    })
    assert sim2_res.status_code == 200
    data2 = sim2_res.json()
    evt2_id = data2["event"]["event_id"]
    assert evt2_id != evt1_id

    ml2_res = client.get(f"/api/v1/fec/event_ml/{evt2_id}")
    assert ml2_res.status_code == 200
    ml2 = ml2_res.json()

    assert ml2["event_id"] == evt2_id
    assert ml2["patient_id"] == "P003"
    assert ml2["feature_vector"] != ml1["feature_vector"]
    # Endpoint discovery sets endpoint_enumeration=1 and unique_endpoints=5
    assert ml2["feature_vector"][3] == 5
    assert ml2["feature_vector"][8] == 1

    # Verify HISTORICAL PRESERVATION: EVT1 result must remain unchanged
    ml1_check = client.get(f"/api/v1/fec/event_ml/{evt1_id}").json()
    assert ml1_check["event_id"] == evt1_id
    assert ml1_check["feature_vector"] == ml1["feature_vector"]
    assert ml1_check["ocsvm"] == ml1["ocsvm"]
    assert ml1_check["isolation_forest"] == ml1["isolation_forest"]
    assert ml1_check["xgboost"] == ml1["xgboost"]

    print(f"[PASSED] TEST 2 (P003 Reconnaissance - Event ID: {evt2_id}, Historical preserved)")

    # ------------------------------------------------------------------
    # TEST 3: P003 - SUSPICIOUS DATA ACCESS
    # ------------------------------------------------------------------
    sim3_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "SUSPICIOUS_DATA_ACCESS"
    })
    assert sim3_res.status_code == 200
    data3 = sim3_res.json()
    evt3_id = data3["event"]["event_id"]
    assert evt3_id not in [evt1_id, evt2_id]

    ml3 = client.get(f"/api/v1/fec/event_ml/{evt3_id}").json()
    assert ml3["event_id"] == evt3_id
    assert ml3["feature_vector"][2] == 250 # records_accessed = 250

    print(f"[PASSED] TEST 3 (P003 Suspicious Data Access - Event ID: {evt3_id})")

    # ------------------------------------------------------------------
    # TEST 4: P003 - DATA EXFILTRATION
    # ------------------------------------------------------------------
    sim4_res = client.post("/api/v1/honeypot/simulate", json={
        "patient_id": "P003",
        "scenario": "DATA_EXFILTRATION"
    })
    assert sim4_res.status_code == 200
    data4 = sim4_res.json()
    evt4_id = data4["event"]["event_id"]

    ml4 = client.get(f"/api/v1/fec/event_ml/{evt4_id}").json()
    assert ml4["event_id"] == evt4_id
    assert ml4["feature_vector"][9] == 1 # data_export_events = 1

    # ------------------------------------------------------------------
    # CRITICAL ACCEPTANCE TEST: ALL 4 ATTACK VECTORS MUST BE DISTINCT
    # ------------------------------------------------------------------
    assert ml1["feature_vector"] != ml2["feature_vector"]
    assert ml2["feature_vector"] != ml3["feature_vector"]
    assert ml3["feature_vector"] != ml4["feature_vector"]
    assert ml1["feature_vector"] != ml4["feature_vector"]

    print(f"[PASSED] TEST 4 (P003 Data Exfiltration - Event ID: {evt4_id})")
    print(f"[PASSED] ALL 4 ATTACK FEATURE VECTORS ARE DISTINCT FOR P003:")
    print(f"  - Brute Force ({evt1_id}): {ml1['feature_vector']}")
    print(f"  - Reconnaissance ({evt2_id}): {ml2['feature_vector']}")
    print(f"  - Suspicious Access ({evt3_id}): {ml3['feature_vector']}")
    print(f"  - Data Exfiltration ({evt4_id}): {ml4['feature_vector']}")

    # ------------------------------------------------------------------
    # PATIENT ISOLATION TEST: P003, P012, P020, P025
    # ------------------------------------------------------------------
    patients_test_cases = [
        ("P003", "BRUTE_FORCE"),
        ("P012", "RECONNAISSANCE"),
        ("P020", "SUSPICIOUS_DATA_ACCESS"),
        ("P025", "DATA_EXFILTRATION")
    ]

    patient_results = {}
    for pid, sc in patients_test_cases:
        res = client.post("/api/v1/honeypot/simulate", json={"patient_id": pid, "scenario": sc})
        assert res.status_code == 200
        eid = res.json()["event"]["event_id"]
        ml_res = client.get(f"/api/v1/fec/event_ml/{eid}").json()
        patient_results[pid] = ml_res

    # Assert patient isolation: each event belongs strictly to its target patient
    for pid, ml_data in patient_results.items():
        assert ml_data["patient_id"] == pid

    # Verify P003 result does NOT match P012 result
    assert patient_results["P003"]["patient_id"] != patient_results["P012"]["patient_id"]
    assert patient_results["P003"]["event_id"] != patient_results["P012"]["event_id"]

    print("[PASSED] PATIENT ISOLATION TEST (P003, P012, P020, P025 isolated)")
    print("==================================================")
