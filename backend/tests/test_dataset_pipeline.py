import sys
import os
import json
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def test_files_exist():
    assert os.path.exists(os.path.join(DATA_DIR, "ml_training_dataset.csv"))
    assert os.path.exists(os.path.join(DATA_DIR, "ml_training_dataset_metadata.json"))
    assert os.path.exists(os.path.join(DATA_DIR, "train.csv"))
    assert os.path.exists(os.path.join(DATA_DIR, "validation.csv"))
    assert os.path.exists(os.path.join(DATA_DIR, "test.csv"))

def test_dataset_dimensions_and_features():
    df = pd.read_csv(os.path.join(DATA_DIR, "ml_training_dataset.csv"))
    
    assert len(df) == 3600
    
    # 15 features + patient_id + behavior_class + is_anomalous = 18 columns
    assert len(df.columns) == 18
    
    required_cols = [
        "patient_id", "failed_login_rate", "request_rate", "total_records_accessed",
        "unique_endpoints", "endpoint_discovery_count", "suspicious_download_count",
        "data_export_count", "privilege_escalation_count", "device_change_count",
        "night_activity_count", "error_rate", "anomalous_event_count",
        "unique_sessions", "unique_devices", "average_response_time_ms",
        "behavior_class", "is_anomalous"
    ]
    for col in required_cols:
        assert col in df.columns

def test_data_quality():
    df = pd.read_csv(os.path.join(DATA_DIR, "ml_training_dataset.csv"))
    
    # Assert no missing values
    assert df.isnull().sum().sum() == 0
    
    # Assert no negative values in numeric features
    numeric_features = [
        "failed_login_rate", "request_rate", "total_records_accessed",
        "unique_endpoints", "endpoint_discovery_count", "suspicious_download_count",
        "data_export_count", "privilege_escalation_count", "device_change_count",
        "night_activity_count", "error_rate", "anomalous_event_count",
        "unique_sessions", "unique_devices", "average_response_time_ms"
    ]
    for feat in numeric_features:
        assert (df[feat] < 0).sum() == 0
        
    # Assert failed_login_rate and error_rate are bound between 0 and 1
    assert (df["failed_login_rate"] > 1.0).sum() == 0
    assert (df["error_rate"] > 1.0).sum() == 0
    
    # Assert allowed labels
    allowed_labels = {"NORMAL", "BRUTE_FORCE", "RECONNAISSANCE", "SUSPICIOUS_DATA_ACCESS", "DATA_EXFILTRATION", "PRIVILEGE_ABUSE"}
    assert set(df["behavior_class"].unique()).issubset(allowed_labels)
    assert set(df["is_anomalous"].unique()).issubset({0, 1})

def test_split_stratification():
    train_df = pd.read_csv(os.path.join(DATA_DIR, "train.csv"))
    val_df = pd.read_csv(os.path.join(DATA_DIR, "validation.csv"))
    test_df = pd.read_csv(os.path.join(DATA_DIR, "test.csv"))
    
    # Assert exact counts based on 70% / 15% / 15%
    assert len(train_df) == 2520
    assert len(val_df) == 540
    assert len(test_df) == 540
    
    # Validate stratification on behavior_class (Normal is 60%, brute force is 8% etc)
    # Check that in each subset, NORMAL makes up exactly 60%
    assert round((train_df["behavior_class"] == "NORMAL").sum() / len(train_df), 2) == 0.60
    assert round((val_df["behavior_class"] == "NORMAL").sum() / len(val_df), 2) == 0.60
    assert round((test_df["behavior_class"] == "NORMAL").sum() / len(test_df), 2) == 0.60

def test_metadata_contents():
    with open(os.path.join(DATA_DIR, "ml_training_dataset_metadata.json"), "r") as f:
        meta = json.load(f)
        
    assert meta["dataset_version"] == "v1"
    assert meta["row_count"] == 3600
    assert meta["feature_count"] == 15
    assert meta["random_seed"] == 42
    assert "class_distribution" in meta
    assert len(meta["feature_names"]) == 15
    assert "generation_timestamp" in meta
