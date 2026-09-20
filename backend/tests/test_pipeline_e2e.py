import sys
import os
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import PipelineExecution, HoneypotSecurityEvent, Patient

client = TestClient(app)

def test_detection_pipeline_flow_e2e():
    db = SessionLocal()
    try:
        # Run three different scenarios sequentially to verify dynamic values
        scenarios = ["BRUTE_FORCE", "SUSPICIOUS_DATA_ACCESS", "SUSPICIOUS_LOGIN"]
        previous_detection_id = None
        previous_event_id = None
        previous_timestamp = None
        
        for idx, scenario in enumerate(scenarios):
            # 1. Post simulation request for patient P027
            sim_res = client.post("/api/v1/honeypot/simulate", json={
                "patient_id": "P027",
                "scenario": scenario
            })
            assert sim_res.status_code == 200
            sim_data = sim_res.json()
            assert sim_data["success"] is True
            event_id = sim_data["event"]["event_id"]
            
            # 2. Trigger recalculate
            res = client.post("/api/v1/detection/recalculate/P027")
            assert res.status_code == 200
            
            # 3. Query the latest pipeline execution
            latest_res = client.get("/api/v1/detection/pipeline/latest?patient_id=P027")
            assert latest_res.status_code == 200
            latest_data = latest_res.json()
            
            detection_id = latest_data["detection_id"]
            started_at = latest_data["started_at"]
            
            # Verify uniqueness across runs
            if previous_detection_id is not None:
                assert detection_id != previous_detection_id, "Each simulation must create a new detection ID"
                assert event_id != previous_event_id, "Each simulation must create a new event ID"
                assert started_at != previous_timestamp, "Each run must have a distinct timestamp"
                
            previous_detection_id = detection_id
            previous_event_id = event_id
            previous_timestamp = started_at
            
            # Verify details are populated correctly for this scenario
            details = latest_data["stage_details"]
            assert "Honeypot Event" in details
            assert "Feature Engine" in details
            assert "FEC Engine" in details
            assert "One-Class SVM" in details
            assert "Isolation Forest" in details
            assert "XGBoost" in details
            assert "Fusion Engine" in details
            assert "Threat Assessment" in details
            
            # Verify event info matches the scenario
            evt_info = details["Honeypot Event"]
            assert evt_info["event_id"] == event_id
            if scenario == "BRUTE_FORCE":
                assert evt_info["event_type"] == "BRUTE_FORCE_ATTEMPT"
            elif scenario == "SUSPICIOUS_LOGIN":
                assert evt_info["event_type"] == "SUSPICIOUS_LOGIN"
            elif scenario == "SUSPICIOUS_DATA_ACCESS":
                assert evt_info["event_type"] == "SUSPICIOUS_DATA_ACCESS"
                
    finally:
        db.close()

