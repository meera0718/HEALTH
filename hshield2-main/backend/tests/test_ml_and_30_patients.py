import os
import sys

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.db.database import SessionLocal, engine, Base
from app.db.seeds import seed_database
from app.ml.dataset_generator import save_datasets, PATIENTS_30_DATA
from app.ml.trainer import train_and_persist_models
from app.ml.inference import CyberHealthMLEngine

def test_full_ml_pipeline_and_30_patients():
    print("\n--- 1. GENERATING DATASETS & TRAINING ML MODELS ---")
    save_datasets(backend_dir)
    bounds = train_and_persist_models(backend_dir)
    print("Models trained with bounds:", bounds)

    print("\n--- 2. INITIALIZING DATABASE AND SEEDING 30 PATIENTS ---")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()
    print("30 Patients seeded in Database.")

    print("\n--- 3. TESTING ML INFERENCE FOR ALL 30 PATIENTS ---")
    engine_ml = CyberHealthMLEngine(backend_dir)

    results = []
    for pdata in PATIENTS_30_DATA:
        res = engine_ml.evaluate_patient_features(pdata, patient_id=pdata["id"], diagnosis=pdata["diagnosis"])
        results.append(res)

        print(f"[{res['patient_id']}] {res['diagnosis']:<35} | OCSVM: {res['ocsvm']['risk_score']:>5.1f}% | IF: {res['isolation_forest']['risk_score']:>5.1f}% | XGB: {res['xgboost']['probability']:>5.1f}% ({res['xgboost']['prediction']:<22}) | OVERALL: {res['overall_risk']:>5.1f}% [{res['risk_level']}]")

    print("\n--- 4. VERIFYING DIVERSITY OF RESULTS ---")
    overall_scores = [r["overall_risk"] for r in results]
    unique_scores = set(overall_scores)
    print(f"Total Patients evaluated: {len(results)}")
    print(f"Unique Overall Risk Scores: {len(unique_scores)} out of {len(results)}")

    assert len(results) == 30, "Should have evaluated 30 patients."
    assert len(unique_scores) >= 25, "Scores should be distinct and reflect patient security features."
    print("\nSUCCESS: All 30 patient records evaluated properly with distinct ML scores!")

if __name__ == "__main__":
    test_full_ml_pipeline_and_30_patients()
