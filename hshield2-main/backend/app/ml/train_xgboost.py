import os
import json
import datetime
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    confusion_matrix, precision_score, recall_score, f1_score, accuracy_score, classification_report
)
from xgboost import XGBClassifier

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

def compute_metrics(y_true, y_pred, labels):
    accuracy = accuracy_score(y_true, y_pred)
    macro_precision = precision_score(y_true, y_pred, average="macro", zero_division=0)
    macro_recall = recall_score(y_true, y_pred, average="macro", zero_division=0)
    macro_f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_true, y_pred, average="weighted", zero_division=0)
    
    # Per-class metrics
    report = classification_report(y_true, y_pred, target_names=labels, output_dict=True, zero_division=0)
    
    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred)
    
    return {
        "accuracy": float(accuracy),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "classification_report": report,
        "confusion_matrix": cm.tolist()
    }

def main():
    train_df, val_df, test_df = load_data()
    
    X_train = train_df[FEATURE_COLUMNS]
    y_train_raw = train_df["behavior_class"]
    
    X_val = val_df[FEATURE_COLUMNS]
    y_val_raw = val_df["behavior_class"]
    
    # Fit LabelEncoder on behavior_class
    le = LabelEncoder()
    y_train = le.fit_transform(y_train_raw)
    y_val = le.transform(y_val_raw)
    
    labels_list = list(le.classes_)
    
    # Parameters to search
    n_estimators_list = [100, 200]
    max_depth_list = [3, 5]
    learning_rates = [0.05, 0.1]
    subsamples = [0.8, 1.0]
    colsample_bytrees = [0.8, 1.0]
    
    best_macro_f1 = -1
    best_model = None
    best_params = {}
    best_metrics = {}
    
    print("[XGBOOST TRAINER] Starting validation-based hyperparameter search...")
    for n_est in n_estimators_list:
        for m_depth in max_depth_list:
            for lr in learning_rates:
                for sub in subsamples:
                    for col in colsample_bytrees:
                        model = XGBClassifier(
                            n_estimators=n_est,
                            max_depth=m_depth,
                            learning_rate=lr,
                            subsample=sub,
                            colsample_bytree=col,
                            random_state=RANDOM_SEED,
                            eval_metric="mlogloss",
                            n_jobs=-1
                        )
                        
                        model.fit(X_train, y_train)
                        
                        # Evaluate on validation
                        val_preds = model.predict(X_val)
                        metrics = compute_metrics(y_val, val_preds, labels_list)
                        
                        print(f"  n_est={n_est:<3} depth={m_depth} lr={lr:<4} sub={sub:<3} col={col:<3} -> Macro F1={metrics['macro_f1']:.4f}, Accuracy={metrics['accuracy']:.4f}")
                        
                        if metrics["macro_f1"] > best_macro_f1:
                            best_macro_f1 = metrics["macro_f1"]
                            best_model = model
                            best_params = {
                                "n_estimators": n_est,
                                "max_depth": m_depth,
                                "learning_rate": lr,
                                "subsample": sub,
                                "colsample_bytree": col
                            }
                            best_metrics = metrics
                            
    print(f"[XGBOOST TRAINER] Best Parameters: {best_params} (Macro F1={best_macro_f1:.4f})")
    
    # Save the selected model pipeline
    model_path = os.path.join(MODELS_DIR, "xgboost_pipeline.joblib")
    pipeline_dict = {
        "model": best_model,
        "label_encoder": le
    }
    joblib.dump(pipeline_dict, model_path)
    print(f"[XGBOOST TRAINER] Saved XGBoost pipeline to {model_path}")
    
    # Evaluate on untouched test set
    X_test = test_df[FEATURE_COLUMNS]
    y_test_raw = test_df["behavior_class"]
    y_test = le.transform(y_test_raw)
    
    test_preds = best_model.predict(X_test)
    test_metrics = compute_metrics(y_test, test_preds, labels_list)
    
    print("\n" + "="*50)
    print("FINAL XGBOOST TEST EVALUATION REPORT")
    print("="*50)
    print(f"Accuracy         : {test_metrics['accuracy']:.4f}")
    print(f"Macro Precision  : {test_metrics['macro_precision']:.4f}")
    print(f"Macro Recall     : {test_metrics['macro_recall']:.4f}")
    print(f"Macro F1 Score   : {test_metrics['macro_f1']:.4f}")
    print(f"Weighted F1 Score: {test_metrics['weighted_f1']:.4f}")
    print("="*50)
    
    # Save metrics JSON
    metrics_path = os.path.join(REPORTS_DIR, "xgboost_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(test_metrics, f, indent=2)
    print(f"[XGBOOST TRAINER] Saved metrics report to {metrics_path}")
    
    # Save metadata JSON
    metadata = {
        "model_name": "XGBoost Classifier",
        "model_version": "xgboost_v1",
        "features": FEATURE_COLUMNS,
        "classes": labels_list,
        "hyperparameters": best_params,
        "training_row_count": len(train_df),
        "validation_metrics": {
            "accuracy": best_metrics["accuracy"],
            "macro_precision": best_metrics["macro_precision"],
            "macro_recall": best_metrics["macro_recall"],
            "macro_f1": best_metrics["macro_f1"],
            "weighted_f1": best_metrics["weighted_f1"]
        },
        "test_metrics": {
            "accuracy": test_metrics["accuracy"],
            "macro_precision": test_metrics["macro_precision"],
            "macro_recall": test_metrics["macro_recall"],
            "macro_f1": test_metrics["macro_f1"],
            "weighted_f1": test_metrics["weighted_f1"]
        },
        "random_seed": RANDOM_SEED,
        "training_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    
    metadata_path = os.path.join(MODELS_DIR, "xgboost_metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"[XGBOOST TRAINER] Saved metadata to {metadata_path}")
    
    # Save Confusion Matrix Image
    plt.figure(figsize=(6, 5))
    cm = np.array(test_metrics["confusion_matrix"])
    plt.imshow(cm, interpolation='nearest', cmap=plt.cm.Oranges)
    plt.title("XGBoost Confusion Matrix")
    plt.colorbar()
    
    tick_marks = np.arange(len(labels_list))
    plt.xticks(tick_marks, labels_list, rotation=45, ha="right")
    plt.yticks(tick_marks, labels_list)
    
    thresh = cm.max() / 2.
    for i, j in np.ndindex(cm.shape):
        plt.text(j, i, format(cm[i, j], 'd'),
                 horizontalalignment="center",
                 color="white" if cm[i, j] > thresh else "black")
                 
    plt.ylabel("True Class")
    plt.xlabel("Predicted Class")
    plt.tight_layout()
    
    cm_img_path = os.path.join(REPORTS_DIR, "xgboost_confusion_matrix.png")
    plt.savefig(cm_img_path)
    plt.close()
    print(f"[XGBOOST TRAINER] Saved confusion matrix to {cm_img_path}")
    
    # Extract Feature Importances
    importances = best_model.feature_importances_
    feat_importance_dict = {
        feat: float(imp) for feat, imp in zip(FEATURE_COLUMNS, importances)
    }
    # Sort dict by importance descending
    feat_importance_dict = dict(sorted(feat_importance_dict.items(), key=lambda item: item[1], reverse=True))
    
    # Save feature importance JSON
    feat_imp_path = os.path.join(REPORTS_DIR, "xgboost_feature_importance.json")
    with open(feat_imp_path, "w") as f:
        json.dump(feat_importance_dict, f, indent=2)
    print(f"[XGBOOST TRAINER] Saved feature importances to {feat_imp_path}")
    
    # Plot Feature Importance PNG
    plt.figure(figsize=(8, 6))
    sorted_features = list(feat_importance_dict.keys())[::-1]
    sorted_scores = list(feat_importance_dict.values())[::-1]
    
    plt.barh(sorted_features, sorted_scores, color="orange")
    plt.title("Model Feature Importance")
    plt.xlabel("Importance Score")
    plt.ylabel("Behavioral Feature")
    plt.tight_layout()
    
    feat_imp_img_path = os.path.join(REPORTS_DIR, "xgboost_feature_importance.png")
    plt.savefig(feat_imp_img_path)
    plt.close()
    print(f"[XGBOOST TRAINER] Saved feature importance chart to {feat_imp_img_path}")

if __name__ == "__main__":
    main()
