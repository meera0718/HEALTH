import os
import json
import datetime
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score, accuracy_score

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(BASE_DIR, "models")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

RANDOM_SEED = 42

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

def load_data():
    train = pd.read_csv(os.path.join(DATA_DIR, "train.csv"))
    validation = pd.read_csv(os.path.join(DATA_DIR, "validation.csv"))
    test = pd.read_csv(os.path.join(DATA_DIR, "test.csv"))
    return train, validation, test

def compute_metrics(y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    accuracy = accuracy_score(y_true, y_pred)
    
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    normal_det = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    anom_det = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    
    return {
        "TN": int(tn), "FP": int(fp), "FN": int(fn), "TP": int(tp),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "accuracy": float(accuracy),
        "false_positive_rate": float(fpr),
        "normal_detection_rate": float(normal_det),
        "anomaly_detection_rate": float(anom_det)
    }

def main():
    train_df, val_df, test_df = load_data()
    
    # Isolation Forest is trained on all training features without labels
    X_train = train_df[FEATURE_COLUMNS]
    
    X_val = val_df[FEATURE_COLUMNS]
    y_val = val_df["is_anomalous"]
    
    # Parameters to search
    n_estimators_list = [100, 200, 300]
    max_samples_list = ["auto", 0.7, 1.0]
    contaminations = [0.01, 0.03, 0.05, 0.10]
    
    best_f1 = -1
    best_model = None
    best_params = {}
    best_metrics = {}
    
    print("[IFOREST TRAINER] Starting validation-based hyperparameter search...")
    for n_est in n_estimators_list:
        for max_samp in max_samples_list:
            for cont in contaminations:
                # Create model
                model = IsolationForest(
                    n_estimators=n_est,
                    max_samples=max_samp,
                    contamination=cont,
                    random_state=RANDOM_SEED,
                    n_jobs=-1
                )
                
                model.fit(X_train)
                
                # Predict validation set (predicts 1 for normal, -1 for anomaly)
                val_preds_raw = model.predict(X_val)
                val_preds = np.where(val_preds_raw == 1, 0, 1) # Map 1 -> 0 (normal), -1 -> 1 (anomaly)
                
                metrics = compute_metrics(y_val, val_preds)
                print(f"  n_estimators={n_est:<3} max_samples={str(max_samp):<4} contamination={cont:<4} -> F1={metrics['f1']:.4f}, FPR={metrics['false_positive_rate']:.4f}, NDR={metrics['normal_detection_rate']:.4f}, ADR={metrics['anomaly_detection_rate']:.4f}")
                
                if metrics["f1"] > best_f1:
                    best_f1 = metrics["f1"]
                    best_model = model
                    best_params = {"n_estimators": n_est, "max_samples": max_samp, "contamination": cont}
                    best_metrics = metrics
                    
    print(f"[IFOREST TRAINER] Best Parameters: n_estimators={best_params['n_estimators']}, max_samples={best_params['max_samples']}, contamination={best_params['contamination']} (F1={best_f1:.4f})")
    
    # Save the selected model
    model_path = os.path.join(MODELS_DIR, "isolation_forest_pipeline.joblib")
    joblib.dump(best_model, model_path)
    print(f"[IFOREST TRAINER] Saved Isolation Forest pipeline to {model_path}")
    
    # Fit normalization ranges using training & validation sets combined
    d_train = best_model.decision_function(train_df[FEATURE_COLUMNS])
    d_val = best_model.decision_function(val_df[FEATURE_COLUMNS])
    d_combined = np.concatenate([d_train, d_val])
    d_min = float(np.min(d_combined))
    d_max = float(np.max(d_combined))
    
    print(f"[IFOREST TRAINER] Normalization bounds - dmin: {d_min:.4f}, dmax: {d_max:.4f}")
    
    # Save metadata JSON
    metadata = {
        "model_name": "Isolation Forest",
        "model_version": "isolation_forest_v1",
        "features": FEATURE_COLUMNS,
        "n_estimators": best_params["n_estimators"],
        "max_samples": best_params["max_samples"],
        "contamination": best_params["contamination"],
        "random_seed": RANDOM_SEED,
        "training_row_count": len(train_df),
        "training_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "validation_metrics": best_metrics,
        "normalization_bounds": {
            "dmin": d_min,
            "dmax": d_max
        }
    }
    
    metadata_path = os.path.join(MODELS_DIR, "isolation_forest_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"[IFOREST TRAINER] Saved metadata to {metadata_path}")
    
    # Evaluate on untouched test set
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["is_anomalous"]
    
    test_preds_raw = best_model.predict(X_test)
    test_preds = np.where(test_preds_raw == 1, 0, 1)
    
    test_metrics = compute_metrics(y_test, test_preds)
    print("\n" + "="*50)
    print("FINAL ISOLATION FOREST TEST EVALUATION REPORT")
    print("="*50)
    print(f"Accuracy               : {test_metrics['accuracy']:.4f}")
    print(f"Precision              : {test_metrics['precision']:.4f}")
    print(f"Recall                 : {test_metrics['recall']:.4f}")
    print(f"F1 Score               : {test_metrics['f1']:.4f}")
    print(f"False Positive Rate    : {test_metrics['false_positive_rate']:.4f}")
    print(f"Normal Detection Rate  : {test_metrics['normal_detection_rate']:.4f}")
    print(f"Anomaly Detection Rate : {test_metrics['anomaly_detection_rate']:.4f}")
    print(f"Confusion Matrix       : TN={test_metrics['TN']}, FP={test_metrics['FP']}, FN={test_metrics['FN']}, TP={test_metrics['TP']}")
    print("="*50)
    
    # Save metrics JSON
    metrics_path = os.path.join(REPORTS_DIR, "isolation_forest_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(test_metrics, f, indent=2)
    print(f"[IFOREST TRAINER] Saved metrics report to {metrics_path}")
    
    # Save Confusion Matrix Image
    plt.figure(figsize=(5, 4))
    cm = np.array([[test_metrics["TN"], test_metrics["FP"]],
                   [test_metrics["FN"], test_metrics["TP"]]])
    
    plt.imshow(cm, interpolation='nearest', cmap=plt.cm.Greens)
    plt.title("Isolation Forest Confusion Matrix")
    plt.colorbar()
    
    classes = ["Normal", "Anomalous"]
    tick_marks = np.arange(len(classes))
    plt.xticks(tick_marks, classes)
    plt.yticks(tick_marks, classes)
    
    thresh = cm.max() / 2.
    for i, j in np.ndindex(cm.shape):
        plt.text(j, i, format(cm[i, j], 'd'),
                 horizontalalignment="center",
                 color="white" if cm[i, j] > thresh else "black")
                 
    plt.ylabel("True Class")
    plt.xlabel("Predicted Class")
    plt.tight_layout()
    
    cm_img_path = os.path.join(REPORTS_DIR, "isolation_forest_confusion_matrix.png")
    plt.savefig(cm_img_path)
    plt.close()
    print(f"[IFOREST TRAINER] Saved confusion matrix to {cm_img_path}")

if __name__ == "__main__":
    main()
