import os
import json
import datetime
import random
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

# ==============================================================================
# Pipeline Parameters
# ==============================================================================
RANDOM_SEED = 42
TOTAL_ROWS = 3600
DATASET_VERSION = "v1"

FEATURE_COLUMNS = [
    "failed_login_rate",
    "request_rate",
    "total_records_accessed",
    "unique_endpoints",
    "endpoint_discovery_count",
    "suspicious_download_count",
    "data_export_count",
    "privilege_escalation_count",
    "device_change_count",
    "night_activity_count",
    "error_rate",
    "anomalous_event_count",
    "unique_sessions",
    "unique_devices",
    "average_response_time_ms"
]

CLASS_ALLOCATIONS = {
    "NORMAL": 2160,                 # 60%
    "BRUTE_FORCE": 288,             # 8%
    "RECONNAISSANCE": 288,          # 8%
    "SUSPICIOUS_DATA_ACCESS": 360,   # 10%
    "DATA_EXFILTRATION": 252,       # 7%
    "PRIVILEGE_ABUSE": 252          # 7%
}

def seed_random_generators():
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

def generate_row(behavior_class: str, patient_id: str) -> dict:
    failed_login_rate = 0.0
    request_rate = 0.0
    total_records_accessed = 0
    unique_endpoints = 0
    endpoint_discovery_count = 0
    suspicious_download_count = 0
    data_export_count = 0
    privilege_escalation_count = 0
    device_change_count = 0
    night_activity_count = 0
    error_rate = 0.0
    anomalous_event_count = 0
    unique_sessions = 0
    unique_devices = 0
    average_response_time_ms = 0.0

    if behavior_class == "NORMAL":
        failed_login_rate = float(np.clip(np.random.normal(0.04, 0.02), 0.0, 0.12))
        request_rate = float(np.clip(np.random.normal(0.02, 0.005), 0.005, 0.045))
        total_records_accessed = int(np.clip(np.random.normal(150, 40), 40, 350))
        unique_endpoints = int(np.clip(np.random.normal(9, 1.5), 4, 14))
        endpoint_discovery_count = int(np.random.choice([0, 1, 2], p=[0.85, 0.12, 0.03]))
        suspicious_download_count = int(np.random.choice([0, 1], p=[0.98, 0.02]))
        data_export_count = int(np.random.choice([0, 1], p=[0.99, 0.01]))
        privilege_escalation_count = 0
        device_change_count = int(np.random.choice([0, 1], p=[0.95, 0.05]))
        night_activity_count = int(np.clip(np.random.normal(25, 8), 5, 55))
        error_rate = float(np.clip(np.random.normal(0.015, 0.005), 0.0, 0.04))
        anomalous_event_count = int(np.random.choice([0, 1, 2], p=[0.93, 0.06, 0.01]))
        unique_sessions = int(np.clip(np.random.normal(4, 1.2), 1, 8))
        unique_devices = int(np.random.choice([1, 2], p=[0.90, 0.10]))
        average_response_time_ms = float(np.clip(np.random.normal(380, 80), 180, 650))

    elif behavior_class == "BRUTE_FORCE":
        failed_login_rate = float(np.clip(np.random.normal(0.55, 0.08), 0.30, 0.85))
        request_rate = float(np.clip(np.random.normal(0.07, 0.015), 0.03, 0.12))
        total_records_accessed = int(np.clip(np.random.normal(180, 40), 50, 350))
        unique_endpoints = int(np.clip(np.random.normal(10, 1.5), 5, 15))
        endpoint_discovery_count = int(np.random.choice([0, 1, 2], p=[0.75, 0.20, 0.05]))
        suspicious_download_count = int(np.random.choice([0, 1], p=[0.96, 0.04]))
        data_export_count = int(np.random.choice([0, 1], p=[0.97, 0.03]))
        privilege_escalation_count = 0
        device_change_count = int(np.random.choice([0, 1, 2], p=[0.85, 0.10, 0.05]))
        night_activity_count = int(np.clip(np.random.normal(40, 10), 10, 75))
        error_rate = float(np.clip(np.random.normal(0.30, 0.06), 0.10, 0.55))
        anomalous_event_count = int(np.clip(np.random.normal(12, 4), 3, 25))
        unique_sessions = int(np.clip(np.random.normal(5, 1.5), 2, 10))
        unique_devices = int(np.random.choice([1, 2, 3], p=[0.75, 0.20, 0.05]))
        average_response_time_ms = float(np.clip(np.random.normal(420, 90), 200, 750))

    elif behavior_class == "RECONNAISSANCE":
        failed_login_rate = float(np.clip(np.random.normal(0.08, 0.03), 0.0, 0.22))
        request_rate = float(np.clip(np.random.normal(0.065, 0.015), 0.02, 0.11))
        total_records_accessed = int(np.clip(np.random.normal(320, 70), 90, 550))
        unique_endpoints = int(np.clip(np.random.normal(16, 2.5), 11, 26))
        endpoint_discovery_count = int(np.clip(np.random.normal(8, 2.5), 2, 15))
        suspicious_download_count = int(np.random.choice([0, 1, 2], p=[0.90, 0.08, 0.02]))
        data_export_count = int(np.random.choice([0, 1], p=[0.92, 0.08]))
        privilege_escalation_count = 0
        device_change_count = int(np.clip(np.random.normal(1.2, 0.7), 0, 3))
        night_activity_count = int(np.clip(np.random.normal(48, 12), 15, 85))
        error_rate = float(np.clip(np.random.normal(0.10, 0.03), 0.04, 0.22))
        anomalous_event_count = int(np.clip(np.random.normal(10, 3), 3, 22))
        unique_sessions = int(np.clip(np.random.normal(6, 1.8), 2, 11))
        unique_devices = int(np.clip(np.random.normal(2.2, 0.7), 1, 4))
        average_response_time_ms = float(np.clip(np.random.normal(480, 100), 200, 750))

    elif behavior_class == "SUSPICIOUS_DATA_ACCESS":
        failed_login_rate = float(np.clip(np.random.normal(0.06, 0.02), 0.0, 0.16))
        request_rate = float(np.clip(np.random.normal(0.08, 0.02), 0.03, 0.16))
        total_records_accessed = int(np.clip(np.random.normal(2400, 400), 1000, 3800))
        unique_endpoints = int(np.clip(np.random.normal(13, 2.0), 7, 18))
        endpoint_discovery_count = int(np.clip(np.random.normal(3, 1.2), 0, 7))
        suspicious_download_count = int(np.clip(np.random.normal(1.2, 0.8), 0, 4))
        data_export_count = int(np.clip(np.random.normal(0.8, 0.6), 0, 3))
        privilege_escalation_count = 0
        device_change_count = int(np.clip(np.random.normal(2.0, 1.0), 0, 5))
        night_activity_count = int(np.clip(np.random.normal(55, 12), 20, 90))
        error_rate = float(np.clip(np.random.normal(0.04, 0.015), 0.0, 0.10))
        anomalous_event_count = int(np.clip(np.random.normal(18, 5), 4, 35))
        unique_sessions = int(np.clip(np.random.normal(7, 2.0), 2, 14))
        unique_devices = int(np.clip(np.random.normal(2.8, 0.8), 1, 5))
        average_response_time_ms = float(np.clip(np.random.normal(580, 120), 250, 950))

    elif behavior_class == "DATA_EXFILTRATION":
        failed_login_rate = float(np.clip(np.random.normal(0.07, 0.02), 0.0, 0.18))
        request_rate = float(np.clip(np.random.normal(0.11, 0.025), 0.05, 0.20))
        total_records_accessed = int(np.clip(np.random.normal(3000, 350), 1800, 4200))
        unique_endpoints = int(np.clip(np.random.normal(14, 2.0), 8, 20))
        endpoint_discovery_count = int(np.clip(np.random.normal(2, 1.2), 0, 5))
        suspicious_download_count = int(np.clip(np.random.normal(13, 3.5), 5, 24))
        data_export_count = int(np.clip(np.random.normal(6.5, 1.8), 2, 11))
        privilege_escalation_count = int(np.random.choice([0, 1], p=[0.85, 0.15]))
        device_change_count = int(np.clip(np.random.normal(3.0, 1.2), 0, 7))
        night_activity_count = int(np.clip(np.random.normal(62, 10), 25, 90))
        error_rate = float(np.clip(np.random.normal(0.035, 0.015), 0.0, 0.09))
        anomalous_event_count = int(np.clip(np.random.normal(32, 8), 12, 55))
        unique_sessions = int(np.clip(np.random.normal(8, 2.0), 3, 15))
        unique_devices = int(np.clip(np.random.normal(3.2, 0.8), 1, 5))
        average_response_time_ms = float(np.clip(np.random.normal(650, 130), 300, 1050))

    elif behavior_class == "PRIVILEGE_ABUSE":
        failed_login_rate = float(np.clip(np.random.normal(0.10, 0.04), 0.0, 0.26))
        request_rate = float(np.clip(np.random.normal(0.075, 0.015), 0.02, 0.13))
        total_records_accessed = int(np.clip(np.random.normal(1700, 350), 900, 2800))
        unique_endpoints = int(np.clip(np.random.normal(15, 2.5), 9, 22))
        endpoint_discovery_count = int(np.clip(np.random.normal(3.5, 1.5), 0, 9))
        suspicious_download_count = int(np.clip(np.random.normal(1.8, 1.2), 0, 5))
        data_export_count = int(np.clip(np.random.normal(1.2, 0.8), 0, 4))
        privilege_escalation_count = int(np.clip(np.random.normal(6.5, 1.8), 2, 11))
        device_change_count = int(np.clip(np.random.normal(4.0, 1.2), 0, 8))
        night_activity_count = int(np.clip(np.random.normal(52, 12), 15, 85))
        error_rate = float(np.clip(np.random.normal(0.08, 0.03), 0.01, 0.18))
        anomalous_event_count = int(np.clip(np.random.normal(22, 6), 6, 40))
        unique_sessions = int(np.clip(np.random.normal(9, 2.5), 3, 16))
        unique_devices = int(np.clip(np.random.normal(3.6, 1.0), 1, 6))
        average_response_time_ms = float(np.clip(np.random.normal(530, 110), 200, 850))

    # Apply correlations and physical rules
    if data_export_count > 0:
        total_records_accessed = max(total_records_accessed, data_export_count * 10 + int(np.random.exponential(15)))
    if endpoint_discovery_count > 0:
        unique_endpoints = max(unique_endpoints, endpoint_discovery_count + int(np.random.exponential(3)))
    if failed_login_rate > 0.3:
        error_rate = max(error_rate, failed_login_rate * 0.4 + float(np.random.exponential(0.02)))
    if privilege_escalation_count > 0:
        total_records_accessed = max(total_records_accessed, privilege_escalation_count * 15 + int(np.random.exponential(20)))

    # Force range clamps to protect data quality
    failed_login_rate = max(0.0, min(1.0, failed_login_rate))
    request_rate = max(0.0, request_rate)
    total_records_accessed = max(0, total_records_accessed)
    unique_endpoints = max(1, unique_endpoints)
    endpoint_discovery_count = max(0, endpoint_discovery_count)
    suspicious_download_count = max(0, suspicious_download_count)
    data_export_count = max(0, data_export_count)
    privilege_escalation_count = max(0, privilege_escalation_count)
    device_change_count = max(0, device_change_count)
    night_activity_count = max(0, night_activity_count)
    error_rate = max(0.0, min(1.0, error_rate))
    anomalous_event_count = max(0, anomalous_event_count)
    unique_sessions = max(1, unique_sessions)
    unique_devices = max(1, unique_devices)
    average_response_time_ms = max(0.0, average_response_time_ms)

    return {
        "patient_id": patient_id,
        "failed_login_rate": float(round(failed_login_rate, 4)),
        "request_rate": float(round(request_rate, 4)),
        "total_records_accessed": int(total_records_accessed),
        "unique_endpoints": int(unique_endpoints),
        "endpoint_discovery_count": int(endpoint_discovery_count),
        "suspicious_download_count": int(suspicious_download_count),
        "data_export_count": int(data_export_count),
        "privilege_escalation_count": int(privilege_escalation_count),
        "device_change_count": int(device_change_count),
        "night_activity_count": int(night_activity_count),
        "error_rate": float(round(error_rate, 4)),
        "anomalous_event_count": int(anomalous_event_count),
        "unique_sessions": int(unique_sessions),
        "unique_devices": int(unique_devices),
        "average_response_time_ms": float(round(average_response_time_ms, 2)),
        "behavior_class": behavior_class,
        "is_anomalous": 0 if behavior_class == "NORMAL" else 1
    }

def generate_full_dataset() -> pd.DataFrame:
    rows = []
    pid_counter = 1
    for behavior_class, count in CLASS_ALLOCATIONS.items():
        for _ in range(count):
            patient_id = f"TRAIN_P{pid_counter:04d}"
            rows.append(generate_row(behavior_class, patient_id))
            pid_counter += 1
            
    df = pd.DataFrame(rows)
    # Shuffle the dataset deterministically
    df = df.sample(frac=1.0, random_state=RANDOM_SEED).reset_index(drop=True)
    return df

def validate_dataset(df: pd.DataFrame) -> dict:
    """
    Validates data quality constraints on the generated dataframe.
    """
    errors = []
    
    # 1. Check for negative counts / rates
    for feat in FEATURE_COLUMNS:
        negatives = (df[feat] < 0).sum()
        if negatives > 0:
            errors.append(f"Feature '{feat}' contains {negatives} negative values.")
            
    # 2. Check failed_login_rate and error_rate bounds
    for rate_feat in ["failed_login_rate", "error_rate"]:
        out_of_bounds = ((df[rate_feat] < 0.0) | (df[rate_feat] > 1.0)).sum()
        if out_of_bounds > 0:
            errors.append(f"Rate feature '{rate_feat}' has {out_of_bounds} values outside [0.0, 1.0].")

    # 3. Check for missing values
    missing_sum = df[FEATURE_COLUMNS].isnull().sum().sum()
    if missing_sum > 0:
        errors.append(f"Dataset has {missing_sum} missing values.")

    # 4. Check label sanity
    allowed_labels = set(CLASS_ALLOCATIONS.keys())
    invalid_labels = (~df["behavior_class"].isin(allowed_labels)).sum()
    if invalid_labels > 0:
        errors.append(f"Found {invalid_labels} behavior_class values not in allowed labels.")
        
    invalid_anom = (~df["is_anomalous"].isin([0, 1])).sum()
    if invalid_anom > 0:
        errors.append(f"Found {invalid_anom} is_anomalous values not in [0, 1].")

    # 5. Check duplicate rows (excluding patient_id, behavior_class, and is_anomalous)
    duplicate_count = df.duplicated(subset=FEATURE_COLUMNS).sum()

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "duplicate_count": int(duplicate_count)
    }

def print_report(df: pd.DataFrame, validation_res: dict):
    print("=" * 60)
    print("HEALTHSHIELD-X SYNTHETIC ML TRAINING DATASET REPORT")
    print("=" * 60)
    print(f"Dataset Rows: {len(df)}")
    print(f"Number of Features: {len(FEATURE_COLUMNS)}")
    print("-" * 60)
    print("Class Distribution:")
    for cls, count in df["behavior_class"].value_counts().items():
        print(f"  {cls:<25}: {count} ({count/len(df)*100:.1f}%)")
    print("-" * 60)
    print("Data Quality & Integrity Checks:")
    print(f"  Status          : {'PASSED' if validation_res['valid'] else 'FAILED'}")
    print(f"  Missing values  : 0")
    print(f"  Duplicate rows  : {validation_res['duplicate_count']}")
    if not validation_res["valid"]:
        print("  Errors:")
        for err in validation_res["errors"]:
            print(f"    - {err}")
    print("-" * 60)
    print(f"{'Feature':<30} | {'Min':<10} | {'Max':<10}")
    print("-" * 60)
    for feat in FEATURE_COLUMNS:
        f_min = df[feat].min()
        f_max = df[feat].max()
        print(f"{feat:<30} | {f_min:<10} | {f_max:<10}")
    print("=" * 60)

def main():
    seed_random_generators()
    
    # 1. Generate full dataset
    df = generate_full_dataset()
    
    # 2. Validate
    val_res = validate_dataset(df)
    if not val_res["valid"]:
        raise ValueError(f"Dataset validation failed: {val_res['errors']}")
        
    # 3. Print report
    print_report(df, val_res)
    
    # 4. Persistence setup
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) # backend/ directory
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    
    # Save main dataset
    df.to_csv(os.path.join(data_dir, "ml_training_dataset.csv"), index=False)
    
    # Save metadata JSON
    metadata = {
        "dataset_version": DATASET_VERSION,
        "row_count": len(df),
        "feature_count": len(FEATURE_COLUMNS),
        "random_seed": RANDOM_SEED,
        "class_distribution": df["behavior_class"].value_counts().to_dict(),
        "feature_names": FEATURE_COLUMNS,
        "generation_timestamp": datetime.datetime.utcnow().isoformat()
    }
    with open(os.path.join(data_dir, "ml_training_dataset_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
        
    # 5. Deterministic Stratified Split (70% Train, 15% Val, 15% Test)
    # Step A: Split off train (70%)
    train_df, val_test_df = train_test_split(
        df,
        test_size=0.30,
        random_state=RANDOM_SEED,
        stratify=df["behavior_class"]
    )
    
    # Step B: Split remaining 30% into validation (15% total) and test (15% total)
    val_df, test_df = train_test_split(
        val_test_df,
        test_size=0.50,
        random_state=RANDOM_SEED,
        stratify=val_test_df["behavior_class"]
    )
    
    # Save splits
    train_df.to_csv(os.path.join(data_dir, "train.csv"), index=False)
    val_df.to_csv(os.path.join(data_dir, "validation.csv"), index=False)
    test_df.to_csv(os.path.join(data_dir, "test.csv"), index=False)
    
    print(f"[DATASET PIPELINE] Persisted dataset, splits, and metadata to {data_dir}")

if __name__ == "__main__":
    main()
