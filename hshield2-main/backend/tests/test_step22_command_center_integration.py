import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.database import SessionLocal

client = TestClient(app)

def test_01_health_check_endpoint_includes_all_10_components():
    """
    Verifies /api/v1/health returns status and all 10 component statuses including vector_engine.
    """
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()

    assert "status" in data
    assert "components" in data
    comps = data["components"]

    assert "api" in comps
    assert "database" in comps
    assert "feature_engine" in comps
    assert "fec_engine" in comps
    assert "ocsvm" in comps
    assert "isolation_forest" in comps
    assert "xgboost" in comps
    assert "fusion_engine" in comps
    assert "telemetry" in comps
    assert "vector_engine" in comps
    assert comps["vector_engine"]["dimension"] == 15

def test_02_reporting_summary_endpoint():
    """
    Verifies /api/v1/reporting/summary returns complete overview and model distributions.
    """
    res = client.get("/api/v1/reporting/summary")
    assert res.status_code == 200
    data = res.json()

    assert "summary" in data
    assert "overview" in data["summary"]
    assert "models" in data["summary"]
    assert "events" in data

def test_03_devices_endpoint():
    """
    Verifies /api/v1/devices returns list of monitored MedIoT devices.
    """
    res = client.get("/api/v1/devices")
    assert res.status_code == 200
    devices = res.json()
    assert isinstance(devices, list)

def test_04_deception_decoys_endpoint():
    """
    Verifies /api/v1/deception/decoys returns active decoy assets.
    """
    res = client.get("/api/v1/deception/decoys")
    assert res.status_code == 200
    decoys = res.json()
    assert isinstance(decoys, list)

def test_05_honeypot_events_endpoint():
    """
    Verifies /api/v1/honeypot/events returns security events list.
    """
    res = client.get("/api/v1/honeypot/events")
    assert res.status_code == 200
    data = res.json()
    assert "events" in data or isinstance(data, list)
