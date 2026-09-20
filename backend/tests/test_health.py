import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.main import app

client = TestClient(app)

def test_health_endpoint_healthy():
    """
    Test successful health check response when all systems are healthy.
    """
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    
    assert data["status"] in ["healthy", "degraded"]
    assert "timestamp" in data
    assert "components" in data
    
    components = data["components"]
    assert components["api"]["status"] == "online"
    assert components["database"]["status"] == "connected"
    assert components["feature_engine"]["status"] == "ready"
    assert components["fec_engine"]["status"] == "ready"

def test_health_endpoint_database_offline():
    """
    Test health check behavior when database connectivity fails.
    """
    # Mock db.execute to raise an exception
    with patch("sqlalchemy.orm.Session.execute") as mock_execute:
        mock_execute.side_effect = Exception("DB Connection Refused")
        
        res = client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.json()
        
        assert data["status"] == "offline"
        assert data["components"]["database"]["status"] == "offline"
        assert "DB Connection Refused" in data["components"]["database"]["reason"]

def test_health_endpoint_model_missing():
    """
    Test health check behavior when an ML model artifact is missing.
    """
    # Mock os.path.exists to return False for OCSVM model path
    original_exists = os.path.exists
    
    def mock_exists(path):
        if "ocsvm_pipeline.joblib" in path or "ocsvm_metadata.json" in path:
            return False
        return original_exists(path)
        
    with patch("os.path.exists", side_effect=mock_exists):
        res = client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.json()
        
        # System should transition to degraded
        assert data["status"] == "degraded"
        assert data["components"]["ocsvm"]["status"] == "unavailable"
        assert "not found" in data["components"]["ocsvm"]["reason"]
        
        # Fusion engine should also report degraded/unavailable due to missing model dependency
        assert data["components"]["fusion_engine"]["status"] == "unavailable"
        assert "Required ML models are missing" in data["components"]["fusion_engine"]["reason"]
