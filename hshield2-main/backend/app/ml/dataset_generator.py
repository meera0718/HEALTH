import os
import random
import pandas as pd
import numpy as np

# Exact 30 Patients Database Table from Section 10 of the Architecture Spec
PATIENTS_30_DATA = [
    {"id": "P001", "name": "Arthur Pendelton", "diagnosis": "Type 2 Diabetes", "failed_logins": 1, "requests_per_minute": 8, "records_accessed": 2, "unique_endpoints": 3, "session_duration_min": 25, "device_changes": 0, "error_rate": 0.01, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 54, "gender": "Male", "blood_group": "A+", "doctor": "Dr. Sarah Lin, MD", "department": "Endocrinology"},
    {"id": "P002", "name": "Beatrice Vance", "diagnosis": "Hypertension", "failed_logins": 2, "requests_per_minute": 12, "records_accessed": 3, "unique_endpoints": 4, "session_duration_min": 31, "device_changes": 0, "error_rate": 0.02, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 62, "gender": "Female", "blood_group": "O+", "doctor": "Dr. Robert Chen, MD", "department": "Cardiology"},
    {"id": "P003", "name": "Charles Montgomery", "diagnosis": "Asthma", "failed_logins": 0, "requests_per_minute": 6, "records_accessed": 1, "unique_endpoints": 2, "session_duration_min": 18, "device_changes": 0, "error_rate": 0.01, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 29, "gender": "Male", "blood_group": "B+", "doctor": "Dr. Elena Rostova, MD", "department": "Pulmonology"},
    {"id": "P004", "name": "Diana Prince", "diagnosis": "Migraine", "failed_logins": 3, "requests_per_minute": 15, "records_accessed": 4, "unique_endpoints": 5, "session_duration_min": 28, "device_changes": 0, "error_rate": 0.03, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 35, "gender": "Female", "blood_group": "AB+", "doctor": "Dr. Marcus Thorne, MD", "department": "Neurology"},
    {"id": "P005", "name": "Edward Rochester", "diagnosis": "Iron Deficiency Anemia", "failed_logins": 1, "requests_per_minute": 10, "records_accessed": 2, "unique_endpoints": 3, "session_duration_min": 22, "device_changes": 0, "error_rate": 0.02, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 48, "gender": "Male", "blood_group": "O-", "doctor": "Dr. Sarah Lin, MD", "department": "Hematology"},
    {"id": "P006", "name": "Fiona Gallagher", "diagnosis": "Gastritis", "failed_logins": 2, "requests_per_minute": 14, "records_accessed": 3, "unique_endpoints": 4, "session_duration_min": 35, "device_changes": 0, "error_rate": 0.02, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 41, "gender": "Female", "blood_group": "A-", "doctor": "Dr. Robert Chen, MD", "department": "Gastroenterology"},
    {"id": "P007", "name": "George Clark", "diagnosis": "Hypothyroidism", "failed_logins": 4, "requests_per_minute": 18, "records_accessed": 5, "unique_endpoints": 5, "session_duration_min": 40, "device_changes": 1, "error_rate": 0.04, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 58, "gender": "Male", "blood_group": "B-", "doctor": "Dr. Sarah Lin, MD", "department": "Endocrinology"},
    {"id": "P008", "name": "Hannah Abbott", "diagnosis": "Seasonal Allergy", "failed_logins": 0, "requests_per_minute": 7, "records_accessed": 1, "unique_endpoints": 2, "session_duration_min": 16, "device_changes": 0, "error_rate": 0.01, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 24, "gender": "Female", "blood_group": "O+", "doctor": "Dr. Elena Rostova, MD", "department": "Allergy & Immunology"},
    {"id": "P009", "name": "Ian Malcolm", "diagnosis": "Vitamin D Deficiency", "failed_logins": 3, "requests_per_minute": 16, "records_accessed": 3, "unique_endpoints": 4, "session_duration_min": 29, "device_changes": 0, "error_rate": 0.03, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 51, "gender": "Male", "blood_group": "A+", "doctor": "Dr. Marcus Thorne, MD", "department": "Internal Medicine"},
    {"id": "P010", "name": "Julia Roberts", "diagnosis": "Chronic Kidney Disease", "failed_logins": 2, "requests_per_minute": 20, "records_accessed": 5, "unique_endpoints": 6, "session_duration_min": 45, "device_changes": 1, "error_rate": 0.04, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 67, "gender": "Female", "blood_group": "AB-", "doctor": "Dr. Robert Chen, MD", "department": "Nephrology"},
    {"id": "P011", "name": "Kevin Bacon", "diagnosis": "Type 1 Diabetes", "failed_logins": 9, "requests_per_minute": 75, "records_accessed": 14, "unique_endpoints": 10, "session_duration_min": 18, "device_changes": 1, "error_rate": 0.12, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 31, "gender": "Male", "blood_group": "O+", "doctor": "Dr. Sarah Lin, MD", "department": "Endocrinology"},
    {"id": "P012", "name": "Laura Palmer", "diagnosis": "Coronary Artery Disease", "failed_logins": 14, "requests_per_minute": 110, "records_accessed": 22, "unique_endpoints": 15, "session_duration_min": 15, "device_changes": 1, "error_rate": 0.18, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 60, "gender": "Female", "blood_group": "A+", "doctor": "Dr. Robert Chen, MD", "department": "Cardiology"},
    {"id": "P013", "name": "Michael Corleone", "diagnosis": "Chronic Obstructive Pulmonary Disease", "failed_logins": 21, "requests_per_minute": 160, "records_accessed": 31, "unique_endpoints": 19, "session_duration_min": 11, "device_changes": 2, "error_rate": 0.25, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 73, "gender": "Male", "blood_group": "B+", "doctor": "Dr. Elena Rostova, MD", "department": "Pulmonology"},
    {"id": "P014", "name": "Nancy Wheeler", "diagnosis": "Peptic Ulcer Disease", "failed_logins": 7, "requests_per_minute": 95, "records_accessed": 18, "unique_endpoints": 13, "session_duration_min": 14, "device_changes": 1, "error_rate": 0.15, "unusual_access_time": 0, "endpoint_enumeration": 1, "age": 28, "gender": "Female", "blood_group": "O-", "doctor": "Dr. Robert Chen, MD", "department": "Gastroenterology"},
    {"id": "P015", "name": "Oscar Isaac", "diagnosis": "Psoriasis", "failed_logins": 12, "requests_per_minute": 130, "records_accessed": 26, "unique_endpoints": 17, "session_duration_min": 12, "device_changes": 2, "error_rate": 0.21, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 44, "gender": "Male", "blood_group": "A-", "doctor": "Dr. Marcus Thorne, MD", "department": "Dermatology"},
    {"id": "P016", "name": "Penelope Cruz", "diagnosis": "Epilepsy", "failed_logins": 35, "requests_per_minute": 40, "records_accessed": 8, "unique_endpoints": 6, "session_duration_min": 9, "device_changes": 1, "error_rate": 0.42, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 39, "gender": "Female", "blood_group": "AB+", "doctor": "Dr. Marcus Thorne, MD", "department": "Neurology"},
    {"id": "P017", "name": "Quentin Tarantino", "diagnosis": "Arthritis", "failed_logins": 48, "requests_per_minute": 55, "records_accessed": 11, "unique_endpoints": 7, "session_duration_min": 8, "device_changes": 2, "error_rate": 0.51, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 61, "gender": "Male", "blood_group": "B+", "doctor": "Dr. Sarah Lin, MD", "department": "Rheumatology"},
    {"id": "P018", "name": "Rachel Green", "diagnosis": "Chronic Liver Disease", "failed_logins": 61, "requests_per_minute": 70, "records_accessed": 15, "unique_endpoints": 8, "session_duration_min": 7, "device_changes": 0, "error_rate": 0.63, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 52, "gender": "Female", "blood_group": "O+", "doctor": "Dr. Robert Chen, MD", "department": "Hepatology"},
    {"id": "P019", "name": "Steve Rogers", "diagnosis": "Pneumonia", "failed_logins": 29, "requests_per_minute": 45, "records_accessed": 9, "unique_endpoints": 6, "session_duration_min": 10, "device_changes": 1, "error_rate": 0.38, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 45, "gender": "Male", "blood_group": "A+", "doctor": "Dr. Elena Rostova, MD", "department": "Pulmonology"},
    {"id": "P020", "name": "Tony Stark", "diagnosis": "Heart Failure", "failed_logins": 55, "requests_per_minute": 62, "records_accessed": 13, "unique_endpoints": 9, "session_duration_min": 6, "device_changes": 2, "error_rate": 0.57, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 56, "gender": "Male", "blood_group": "O+", "doctor": "Dr. Robert Chen, MD", "department": "Cardiology"},
    {"id": "P021", "name": "Uma Thurman", "diagnosis": "Influenza", "failed_logins": 5, "requests_per_minute": 210, "records_accessed": 72, "unique_endpoints": 24, "session_duration_min": 6, "device_changes": 2, "error_rate": 0.19, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 33, "gender": "Female", "blood_group": "B-", "doctor": "Dr. Sarah Lin, MD", "department": "Infectious Disease"},
    {"id": "P022", "name": "Victor Vance", "diagnosis": "GERD", "failed_logins": 8, "requests_per_minute": 280, "records_accessed": 96, "unique_endpoints": 29, "session_duration_min": 5, "device_changes": 3, "error_rate": 0.24, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 42, "gender": "Male", "blood_group": "A-", "doctor": "Dr. Robert Chen, MD", "department": "Gastroenterology"},
    {"id": "P023", "name": "Wanda Maximoff", "diagnosis": "Osteoporosis", "failed_logins": 11, "requests_per_minute": 340, "records_accessed": 125, "unique_endpoints": 33, "session_duration_min": 4, "device_changes": 3, "error_rate": 0.31, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 65, "gender": "Female", "blood_group": "O-", "doctor": "Dr. Sarah Lin, MD", "department": "Orthopedics"},
    {"id": "P024", "name": "Xavier Charles", "diagnosis": "Anxiety Disorder", "failed_logins": 6, "requests_per_minute": 190, "records_accessed": 58, "unique_endpoints": 21, "session_duration_min": 8, "device_changes": 2, "error_rate": 0.16, "unusual_access_time": 0, "endpoint_enumeration": 1, "age": 49, "gender": "Male", "blood_group": "AB+", "doctor": "Dr. Marcus Thorne, MD", "department": "Psychiatry"},
    {"id": "P025", "name": "Yennefer Vengerberg", "diagnosis": "Atopic Dermatitis", "failed_logins": 13, "requests_per_minute": 390, "records_accessed": 145, "unique_endpoints": 37, "session_duration_min": 4, "device_changes": 4, "error_rate": 0.35, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 37, "gender": "Female", "blood_group": "A+", "doctor": "Dr. Marcus Thorne, MD", "department": "Dermatology"},
    {"id": "P026", "name": "Zelda Hyrule", "diagnosis": "Obesity", "failed_logins": 4, "requests_per_minute": 45, "records_accessed": 7, "unique_endpoints": 6, "session_duration_min": 20, "device_changes": 1, "error_rate": 0.08, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 27, "gender": "Female", "blood_group": "O+", "doctor": "Dr. Sarah Lin, MD", "department": "Nutrition & Bariatrics"},
    {"id": "P027", "name": "Arya Stark", "diagnosis": "Polycystic Ovary Syndrome", "failed_logins": 18, "requests_per_minute": 145, "records_accessed": 32, "unique_endpoints": 18, "session_duration_min": 10, "device_changes": 2, "error_rate": 0.27, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 23, "gender": "Female", "blood_group": "B+", "doctor": "Dr. Sarah Lin, MD", "department": "Gynecology"},
    {"id": "P028", "name": "Bruce Wayne", "diagnosis": "Chronic Back Pain", "failed_logins": 32, "requests_per_minute": 50, "records_accessed": 10, "unique_endpoints": 7, "session_duration_min": 9, "device_changes": 1, "error_rate": 0.45, "unusual_access_time": 1, "endpoint_enumeration": 0, "age": 47, "gender": "Male", "blood_group": "O+", "doctor": "Dr. Marcus Thorne, MD", "department": "Orthopedics"},
    {"id": "P029", "name": "Clark Kent", "diagnosis": "Acid Reflux Disease", "failed_logins": 3, "requests_per_minute": 25, "records_accessed": 6, "unique_endpoints": 5, "session_duration_min": 30, "device_changes": 0, "error_rate": 0.05, "unusual_access_time": 0, "endpoint_enumeration": 0, "age": 36, "gender": "Male", "blood_group": "A+", "doctor": "Dr. Robert Chen, MD", "department": "Gastroenterology"},
    {"id": "P030", "name": "Peter Parker", "diagnosis": "Parkinsonian Syndrome", "failed_logins": 24, "requests_per_minute": 225, "records_accessed": 81, "unique_endpoints": 27, "session_duration_min": 6, "device_changes": 3, "error_rate": 0.29, "unusual_access_time": 1, "endpoint_enumeration": 1, "age": 68, "gender": "Male", "blood_group": "AB-", "doctor": "Dr. Marcus Thorne, MD", "department": "Neurology"}
]

FEATURE_COLUMNS = [
    "failed_logins",
    "requests_per_minute",
    "records_accessed",
    "unique_endpoints",
    "session_duration_min",
    "device_changes",
    "error_rate",
    "unusual_access_time",
    "endpoint_enumeration"
]

def generate_synthetic_3600_dataset(seed: int = 42) -> pd.DataFrame:
    """
    Generates 3,600 synthetic security sessions across 4 scenarios as specified in Section 11:
    - 1,800 Benign
    - 700 Reconnaissance
    - 550 Brute-Force
    - 550 Suspicious Data Access
    """
    np.random.seed(seed)
    random.seed(seed)

    rows = []

    # 1. Benign Sessions (1800)
    for _ in range(1800):
        failed_logins = int(np.random.choice([0, 1, 2, 3], p=[0.70, 0.20, 0.08, 0.02]))
        req_min = int(np.clip(np.random.normal(12, 5), 3, 30))
        records = int(np.clip(np.random.normal(3, 1.5), 1, 8))
        endpoints = int(np.clip(np.random.normal(4, 1.5), 1, 8))
        duration = int(np.clip(np.random.normal(30, 10), 10, 60))
        devices = int(np.random.choice([0, 1], p=[0.90, 0.10]))
        error_rate = float(round(np.clip(np.random.exponential(0.015), 0.0, 0.06), 3))
        odd_time = int(np.random.choice([0, 1], p=[0.95, 0.05]))
        enumeration = 0
        rows.append({
            "failed_logins": failed_logins,
            "requests_per_minute": req_min,
            "records_accessed": records,
            "unique_endpoints": endpoints,
            "session_duration_min": duration,
            "device_changes": devices,
            "error_rate": error_rate,
            "unusual_access_time": odd_time,
            "endpoint_enumeration": enumeration,
            "attack_label": "benign"
        })

    # 2. Reconnaissance (700)
    for _ in range(700):
        failed_logins = int(np.clip(np.random.normal(10, 4), 3, 25))
        req_min = int(np.clip(np.random.normal(120, 35), 60, 220))
        records = int(np.clip(np.random.normal(20, 8), 8, 45))
        endpoints = int(np.clip(np.random.normal(18, 5), 10, 30))
        duration = int(np.clip(np.random.normal(14, 4), 5, 25))
        devices = int(np.random.choice([1, 2], p=[0.70, 0.30]))
        error_rate = float(round(np.clip(np.random.normal(0.18, 0.05), 0.08, 0.32), 3))
        odd_time = int(np.random.choice([0, 1], p=[0.40, 0.60]))
        enumeration = 1
        rows.append({
            "failed_logins": failed_logins,
            "requests_per_minute": req_min,
            "records_accessed": records,
            "unique_endpoints": endpoints,
            "session_duration_min": duration,
            "device_changes": devices,
            "error_rate": error_rate,
            "unusual_access_time": odd_time,
            "endpoint_enumeration": enumeration,
            "attack_label": "reconnaissance"
        })

    # 3. Brute-Force (550)
    for _ in range(550):
        failed_logins = int(np.clip(np.random.normal(45, 15), 22, 95))
        req_min = int(np.clip(np.random.normal(55, 15), 25, 90))
        records = int(np.clip(np.random.normal(10, 4), 4, 20))
        endpoints = int(np.clip(np.random.normal(7, 2), 3, 12))
        duration = int(np.clip(np.random.normal(8, 3), 3, 18))
        devices = int(np.random.choice([0, 1, 2], p=[0.20, 0.50, 0.30]))
        error_rate = float(round(np.clip(np.random.normal(0.50, 0.12), 0.28, 0.75), 3))
        odd_time = int(np.random.choice([0, 1], p=[0.25, 0.75]))
        enumeration = int(np.random.choice([0, 1], p=[0.70, 0.30]))
        rows.append({
            "failed_logins": failed_logins,
            "requests_per_minute": req_min,
            "records_accessed": records,
            "unique_endpoints": endpoints,
            "session_duration_min": duration,
            "device_changes": devices,
            "error_rate": error_rate,
            "unusual_access_time": odd_time,
            "endpoint_enumeration": enumeration,
            "attack_label": "brute_force"
        })

    # 4. Suspicious Data Access (550)
    for _ in range(550):
        failed_logins = int(np.clip(np.random.normal(10, 5), 4, 22))
        req_min = int(np.clip(np.random.normal(290, 60), 160, 450))
        records = int(np.clip(np.random.normal(105, 30), 50, 180))
        endpoints = int(np.clip(np.random.normal(30, 7), 18, 45))
        duration = int(np.clip(np.random.normal(5, 2), 2, 12))
        devices = int(np.random.choice([2, 3, 4], p=[0.30, 0.50, 0.20]))
        error_rate = float(round(np.clip(np.random.normal(0.28, 0.08), 0.12, 0.45), 3))
        odd_time = int(np.random.choice([0, 1], p=[0.15, 0.85]))
        enumeration = 1
        rows.append({
            "failed_logins": failed_logins,
            "requests_per_minute": req_min,
            "records_accessed": records,
            "unique_endpoints": endpoints,
            "session_duration_min": duration,
            "device_changes": devices,
            "error_rate": error_rate,
            "unusual_access_time": odd_time,
            "endpoint_enumeration": enumeration,
            "attack_label": "suspicious_data_access"
        })

    df = pd.DataFrame(rows)
    # Shuffle dataset
    df = df.sample(frac=1.0, random_state=seed).reset_index(drop=True)
    return df

def save_datasets(base_dir: str):
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)

    # 1. Save 3,600 dataset
    df_3600 = generate_synthetic_3600_dataset()
    path_3600 = os.path.join(data_dir, "synthetic_training_3600.csv")
    df_3600.to_csv(path_3600, index=False)

    # 2. Save 30 Patients CSV
    df_30 = pd.DataFrame(PATIENTS_30_DATA)
    path_30 = os.path.join(data_dir, "patients_30.csv")
    df_30.to_csv(path_30, index=False)

    print(f"[DATASET GENERATOR] Saved synthetic_training_3600.csv ({len(df_3600)} rows) and patients_30.csv ({len(df_30)} rows) to {data_dir}")
