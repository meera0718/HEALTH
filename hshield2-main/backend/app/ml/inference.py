import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any
from app.ml.dataset_generator import FEATURE_COLUMNS

class CyberHealthMLEngine:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.models_dir = os.path.join(base_dir, "models")
        self.ocsvm = None
        self.ocsvm_scaler = None
        self.isolation_forest = None
        self.xgboost = None
        self.label_encoder = None
        self.bounds = None

        self.ensure_loaded()

    def ensure_loaded(self):
        # If models do not exist, auto-train them first
        bounds_path = os.path.join(self.models_dir, "score_bounds.json")
        if not os.path.exists(bounds_path):
            from app.ml.trainer import train_and_persist_models
            train_and_persist_models(self.base_dir)

        self.ocsvm = joblib.load(os.path.join(self.models_dir, "ocsvm.pkl"))
        self.ocsvm_scaler = joblib.load(os.path.join(self.models_dir, "ocsvm_scaler.pkl"))
        self.isolation_forest = joblib.load(os.path.join(self.models_dir, "isolation_forest.pkl"))
        self.xgboost = joblib.load(os.path.join(self.models_dir, "xgboost.pkl"))
        self.label_encoder = joblib.load(os.path.join(self.models_dir, "xgb_label_encoder.pkl"))

        with open(bounds_path, "r") as f:
            self.bounds = json.load(f)

    def evaluate_patient_features(self, features_dict: Dict[str, Any], patient_id: str = "P000", diagnosis: str = "Unknown") -> Dict[str, Any]:
        """
        Runs feature vector x through One-Class SVM, Isolation Forest, and XGBoost.
        Computes exact normalized risk indices, composite overall risk, and risk band.
        """
        self.ensure_loaded()

        # Build feature vector in correct order
        feat_vector = [float(features_dict.get(col, 0)) for col in FEATURE_COLUMNS]
        X = pd.DataFrame([feat_vector], columns=FEATURE_COLUMNS)

        # 1. One-Class SVM Risk Index
        X_scaled = self.ocsvm_scaler.transform(X)
        d_score = float(self.ocsvm.decision_function(X_scaled)[0])
        d_min = self.bounds["ocsvm"]["dmin"]
        d_max = self.bounds["ocsvm"]["dmax"]

        if d_max != d_min:
            ocsvm_risk_raw = 100.0 * (d_max - d_score) / (d_max - d_min)
        else:
            ocsvm_risk_raw = 50.0
        ocsvm_risk = float(np.clip(ocsvm_risk_raw, 0.0, 100.0))
        ocsvm_anomaly = bool(d_score < 0.0 or ocsvm_risk > 50.0)

        # 2. Isolation Forest Risk Index
        s_if = float(self.isolation_forest.decision_function(X)[0])
        s_min = self.bounds["isolation_forest"]["smin"]
        s_max = self.bounds["isolation_forest"]["smax"]

        if s_max != s_min:
            if_norm = 100.0 * (s_if - s_min) / (s_max - s_min)
        else:
            if_norm = 50.0
        if_risk_raw = 100.0 - if_norm
        if_risk = float(np.clip(if_risk_raw, 0.0, 100.0))
        if_anomaly = bool(s_if < 0.0 or if_risk > 50.0)

        # 3. XGBoost Threat Probability
        probs = self.xgboost.predict_proba(X)[0]
        top_idx = int(np.argmax(probs))
        predicted_class = str(self.label_encoder.inverse_transform([top_idx])[0])
        xgb_probability = float(round(probs[top_idx] * 100.0, 1))

        # Class probabilities mapping
        class_probs = {
            str(cls_name): float(round(p * 100.0, 1))
            for cls_name, p in zip(self.label_encoder.classes_, probs)
        }

        # 4. Overall Composite Cybersecurity Risk (Section 5.4 Formula)
        # Overall Risk = 0.25 * OCSVM_Risk + 0.25 * IF_Risk + 0.50 * XGB_Threat_Probability
        overall_risk = round(0.25 * ocsvm_risk + 0.25 * if_risk + 0.50 * xgb_probability, 1)

        # 5. Risk Level Bands (Section 5.5)
        if overall_risk >= 75.0:
            risk_level = "CRITICAL"
        elif overall_risk >= 50.0:
            risk_level = "HIGH"
        elif overall_risk >= 25.0:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"

        return {
            "patient_id": patient_id,
            "diagnosis": diagnosis,
            "security_features": {
                col: features_dict.get(col, 0) for col in FEATURE_COLUMNS
            },
            "ocsvm": {
                "anomaly": ocsvm_anomaly,
                "risk_score": round(ocsvm_risk, 1),
                "decision_function": round(d_score, 4)
            },
            "isolation_forest": {
                "anomaly": if_anomaly,
                "risk_score": round(if_risk, 1),
                "decision_function": round(s_if, 4)
            },
            "xgboost": {
                "prediction": predicted_class,
                "probability": xgb_probability,
                "class_probabilities": class_probs
            },
            "overall_risk": overall_risk,
            "risk_level": risk_level
        }

# Global Engine Instance
ml_engine = None

def get_ml_engine(base_dir: str = None) -> CyberHealthMLEngine:
    global ml_engine
    if ml_engine is None:
        if base_dir is None:
            # Default to backend root
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        ml_engine = CyberHealthMLEngine(base_dir)
    return ml_engine


_LOADED_MODELS = {}

def _get_cached_model_and_metadata(pipeline_path: str, metadata_path: str):
    key = (pipeline_path, metadata_path)
    if key not in _LOADED_MODELS:
        if not os.path.exists(pipeline_path) or not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Model pipeline or metadata file not found: {pipeline_path}, {metadata_path}")
        pipeline = joblib.load(pipeline_path)
        with open(metadata_path, "r") as f:
            metadata = json.load(f)
        _LOADED_MODELS[key] = (pipeline, metadata)
    return _LOADED_MODELS[key]

def predict_ocsvm(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predicts One-Class SVM anomaly score and decision for a single patient's feature vector.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    pipeline_path = os.path.join(base_dir, "models", "ocsvm_pipeline.joblib")
    metadata_path = os.path.join(base_dir, "models", "ocsvm_metadata.json")
    
    pipeline, metadata = _get_cached_model_and_metadata(pipeline_path, metadata_path)
        
    feature_cols = metadata["features"]
    
    # Extract features in correct order
    feat_vector = [float(features.get(col, 0)) for col in feature_cols]
    df_feat = pd.DataFrame([feat_vector], columns=feature_cols)
    
    # Predict
    d_score = float(pipeline.decision_function(df_feat)[0])
    raw_pred = pipeline.predict(df_feat)[0]
    is_anom = bool(raw_pred == -1)
    
    # Normalize score
    d_min = metadata["normalization_bounds"]["dmin"]
    d_max = metadata["normalization_bounds"]["dmax"]
    
    if d_max != d_min:
        anomaly_score = 100.0 * (d_max - d_score) / (d_max - d_min)
    else:
        anomaly_score = 50.0
        
    anomaly_score = max(0.0, min(100.0, float(anomaly_score)))
    
    return {
        "ocsvm_decision": "Anomalous" if is_anom else "Normal",
        "ocsvm_raw_score": round(d_score, 4),
        "ocsvm_anomaly_score": round(anomaly_score, 1),
        "is_anomalous": is_anom
    }


def predict_isolation_forest(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predicts Isolation Forest anomaly score and decision for a single patient's feature vector.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    pipeline_path = os.path.join(base_dir, "models", "isolation_forest_pipeline.joblib")
    metadata_path = os.path.join(base_dir, "models", "isolation_forest_metadata.json")
    
    pipeline, metadata = _get_cached_model_and_metadata(pipeline_path, metadata_path)
        
    feature_cols = metadata["features"]
    
    # Extract features in correct order
    feat_vector = [float(features.get(col, 0)) for col in feature_cols]
    df_feat = pd.DataFrame([feat_vector], columns=feature_cols)
    
    # Predict
    d_score = float(pipeline.decision_function(df_feat)[0])
    raw_pred = pipeline.predict(df_feat)[0]
    is_anom = bool(raw_pred == -1)
    
    # Normalize score
    d_min = metadata["normalization_bounds"]["dmin"]
    d_max = metadata["normalization_bounds"]["dmax"]
    
    if d_max != d_min:
        anomaly_score = 100.0 * (d_max - d_score) / (d_max - d_min)
    else:
        anomaly_score = 50.0
        
    anomaly_score = max(0.0, min(100.0, float(anomaly_score)))
    
    return {
        "isolation_forest_decision": "Anomalous" if is_anom else "Normal",
        "isolation_forest_raw_score": round(d_score, 4),
        "isolation_forest_anomaly_score": round(anomaly_score, 1),
        "is_anomalous": is_anom
    }


def predict_xgboost(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predicts XGBoost class probabilities and predictions for a single patient's feature vector.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    pipeline_path = os.path.join(base_dir, "models", "xgboost_pipeline.joblib")
    metadata_path = os.path.join(base_dir, "models", "xgboost_metadata.json")
    
    pipeline, metadata = _get_cached_model_and_metadata(pipeline_path, metadata_path)
        
    feature_cols = metadata["features"]
    
    # Extract features in correct order
    feat_vector = [float(features.get(col, 0)) for col in feature_cols]
    df_feat = pd.DataFrame([feat_vector], columns=feature_cols)
    
    # Predict
    model = pipeline["model"]
    le = pipeline["label_encoder"]
    
    probs = model.predict_proba(df_feat)[0]
    predicted_idx = int(model.predict(df_feat)[0])
    predicted_class = str(le.inverse_transform([predicted_idx])[0])
    confidence = float(probs[predicted_idx])
    
    class_probabilities = {
        str(le.inverse_transform([i])[0]): float(round(p * 100.0, 1))
        for i, p in enumerate(probs)
    }
    
    return {
        "predicted_class": predicted_class,
        "class_probabilities": class_probabilities,
        "confidence": float(round(confidence * 100.0, 1))
    }



