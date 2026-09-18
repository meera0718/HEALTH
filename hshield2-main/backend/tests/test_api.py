import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_root_endpoint():
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ONLINE"

def test_list_incidents():
    res = client.get("/api/v1/incidents")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 3
    inc241 = next(i for i in data if i["id"] == "INC-0241")
    assert inc241["fec_score"] == 72.0

def test_get_incident_fec():
    res = client.get("/api/v1/incidents/INC-0241/fec")
    assert res.status_code == 200
    data = res.json()
    assert data["overall_fec"] == 72.0
    assert "missing_gaps" in data

def test_trigger_replay():
    res = client.post("/api/v1/incidents/INC-0241/replay", json={"control_id": "CTRL-001"})
    assert res.status_code == 200
    data = res.json()
    assert data["before_fec"] == 72.0
    assert data["after_fec"] >= 96.0

def test_ai_analysis():
    res = client.post("/api/v1/incidents/INC-0241/ai-analysis")
    assert res.status_code == 200
    data = res.json()
    assert "recommended_control" in data
    assert data["recommended_control"]["id"] == "CTRL-001"
    assert "nist_mapping" in data
