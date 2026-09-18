import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.svm import OneClassSVM
from sklearn.ensemble import IsolationForest
from xgboost import XGBClassifier
from app.ml.dataset_generator import FEATURE_COLUMNS, generate_synthetic_3600_dataset, save_datasets

def train_and_persist_models(base_dir: str):
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    # 1. Ensure dataset exists or generate it
    data_dir = os.path.join(base_dir, "data")
    csv_path = os.path.join(data_dir, "synthetic_training_3600.csv")
    if not os.path.exists(csv_path):
        save_datasets(base_dir)

    df = pd.read_csv(csv_path)
    X = df[FEATURE_COLUMNS]

    # --- MODEL 1: One-Class SVM ---
    print("[ML TRAINER] Training One-Class SVM on benign baseline...")
    normal_df = df[df["attack_label"] == "benign"]
    X_normal = normal_df[FEATURE_COLUMNS]

    ocsvm_scaler = StandardScaler()
    X_normal_scaled = ocsvm_scaler.fit_transform(X_normal)

    ocsvm_model = OneClassSVM(kernel="rbf", gamma="scale", nu=0.05)
    ocsvm_model.fit(X_normal_scaled)

    # Calculate global decision function bounds across full population X
    X_all_scaled = ocsvm_scaler.transform(X)
    ocsvm_scores = ocsvm_model.decision_function(X_all_scaled)
    ocsvm_dmin = float(np.min(ocsvm_scores))
    ocsvm_dmax = float(np.max(ocsvm_scores))

    # --- MODEL 2: Isolation Forest ---
    print("[ML TRAINER] Training Isolation Forest on session features...")
    if_model = IsolationForest(
        n_estimators=300,
        contamination=0.10,
        random_state=42
    )
    if_model.fit(X)

    if_scores = if_model.decision_function(X)
    if_smin = float(np.min(if_scores))
    if_smax = float(np.max(if_scores))

    # --- MODEL 3: XGBoost Multiclass Classifier ---
    print("[ML TRAINER] Training XGBoost Classifier on labeled attack scenarios...")
    label_encoder = LabelEncoder()
    y_encoded = label_encoder.fit_transform(df["attack_label"])

    xgb_model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="multi:softprob",
        eval_metric="mlogloss",
        random_state=42
    )
    xgb_model.fit(X, y_encoded)

    # --- PERSIST ARTIFACTS ---
    joblib.dump(ocsvm_model, os.path.join(models_dir, "ocsvm.pkl"))
    joblib.dump(ocsvm_scaler, os.path.join(models_dir, "ocsvm_scaler.pkl"))
    joblib.dump(if_model, os.path.join(models_dir, "isolation_forest.pkl"))
    joblib.dump(xgb_model, os.path.join(models_dir, "xgboost.pkl"))
    joblib.dump(label_encoder, os.path.join(models_dir, "xgb_label_encoder.pkl"))

    bounds = {
        "ocsvm": {
            "dmin": ocsvm_dmin,
            "dmax": ocsvm_dmax
        },
        "isolation_forest": {
            "smin": if_smin,
            "smax": if_smax
        },
        "classes": list(label_encoder.classes_)
    }

    with open(os.path.join(models_dir, "score_bounds.json"), "w") as f:
        json.dump(bounds, f, indent=2)

    print(f"[ML TRAINER] Successfully saved all trained models and score bounds to {models_dir}")
    return bounds
