import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Device, HoneypotSecurityEvent, PatientFeature, PatientFEC
from app.security_engine.telemetry_generator import generate_device_event
from app.security_engine.feature_engine import calculate_single_patient_features
from app.security_engine.fec_engine import calculate_single_patient_fec
from app.security_engine.fusion_engine import calculate_patient_fusion

client = TestClient(app)

def run_full_acceptance_audit():
    print("=" * 80)
    print("HEALTHSHIELD-X 2.0 ACCEPTANCE VERIFICATION AUDIT")
    print("=" * 80)

    db = SessionLocal()
    try:
        # STEP 1: Verify Devices API
        print("\n[STEP 1] Fetching live medical devices...")
        res = client.get("/api/v1/devices")
        assert res.status_code == 200, f"Devices endpoint failed: {res.status_code}"
        devices = res.json()
        print(f"-> Found {len(devices)} simulated medical devices:")
        for d in devices:
            print(f"   * {d['device_id']}: {d['device_name']} [{d['device_type']}] | Risk: {d['risk_score']} | Status: {d['status']} | Threat: {d['threat']}")

        # STEP 2: Verify Baseline Normal State for PM-04
        pm04 = next((d for d in devices if d["device_id"] == "PM-04"), None)
        assert pm04 is not None, "PM-04 not found in devices"
        print(f"\n[STEP 2] Verifying baseline state for {pm04['device_name']}...")
        print(f"   Baseline Risk: {pm04['risk_score']} | Status: {pm04['status']} | Agreement: {pm04['model_agreement']}")

        # STEP 3: Launch Controlled Simulated Attack (DATA_EXFILTRATION)
        print("\n[STEP 3] Launching controlled attack: DATA_EXFILTRATION on PM-04 (Intensity: HIGH)...")
        att_res = client.post("/api/v1/devices/PM-04/attack/start", json={
            "attack_type": "DATA_EXFILTRATION",
            "intensity": "HIGH"
        })
        assert att_res.status_code == 200, f"Attack start failed: {att_res.text}"
        print(f"-> Attack response: {att_res.json()['message']}")

        # STEP 4: Generate Attack Telemetry Events & Flow through 15-D ML Pipeline
        print("\n[STEP 4] Generating attack telemetry and passing through 15-D ML Pipeline...")
        pm04_dev = db.query(Device).filter(Device.device_id == "PM-04").first()
        assert pm04_dev.attack_active is True

        for i in range(12):
            evt = generate_device_event(pm04_dev, time.strftime("%Y-%m-%dT%H:%M:%SZ"))
            db.add(evt)
        db.commit()

        # Recalculate 15-D features, FEC, and ML Fusion
        calculate_single_patient_features("PM-04", db)
        calculate_single_patient_fec("PM-04", db)
        fusion = calculate_patient_fusion(db, "PM-04")
        
        pm04_dev.risk_score = float(fusion["detection_score"])
        if pm04_dev.risk_score >= 75.0:
            pm04_dev.status = "CRITICAL"
        elif pm04_dev.risk_score >= 50.0:
            pm04_dev.status = "HIGH RISK"
        elif pm04_dev.risk_score >= 25.0:
            pm04_dev.status = "SUSPICIOUS"
        db.commit()

        print(f"-> 15-D Feature Values Updated in DB:")
        feat = db.query(PatientFeature).filter(PatientFeature.patient_id == "PM-04").first()
        print(f"   * Total Records Accessed: {feat.total_records_accessed}")
        print(f"   * Data Export Count: {feat.data_export_count}")
        print(f"   * Avg Response Time: {feat.average_response_time_ms} ms")
        print(f"   * Anomalous Event Count: {feat.anomalous_event_count}")

        print(f"\n-> ML Engine Pipeline Outputs for PM-04:")
        print(f"   * FEC Score: {fusion['fec_score']}%")
        print(f"   * OCSVM Anomaly Score: {fusion['ocsvm_anomaly_score']}% (Anomalous: {fusion['ocsvm_is_anomalous']})")
        print(f"   * iForest Anomaly Score: {fusion['isolation_forest_anomaly_score']}% (Anomalous: {fusion['isolation_forest_is_anomalous']})")
        print(f"   * XGBoost Classification: {fusion['xgboost_predicted_class']} (Suspiciousness: {fusion['xgboost_suspiciousness_score']}%)")
        print(f"   * Fusion Detection Score: {fusion['detection_score']} / 100")
        print(f"   * Resulting Device Status: {pm04_dev.status}")
        print(f"   * Evidence Strength: {fusion['evidence_strength']}")

        assert fusion["xgboost_predicted_class"] in ["DATA_EXFILTRATION", "SUSPICIOUS_DATA_ACCESS", "CRITICAL"] or fusion["detection_score"] > 40.0
        assert pm04_dev.status in ["CRITICAL", "HIGH RISK", "SUSPICIOUS"]

        # STEP 5: Verify Device Detail View API
        print("\n[STEP 5] Checking Device Detail API...")
        detail_res = client.get("/api/v1/devices/PM-04")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert len(detail["timeline"]) > 0
        print(f"-> Device detail returned with {len(detail['timeline'])} live event timeline items:")
        for item in detail["timeline"][:3]:
            print(f"   [{item['timestamp']}] {item['event_type']} -> {item['endpoint']} (Records: {item['records_accessed']}, Status: {item['response_status']})")

        # STEP 6: Execute Simulated Quarantine
        print("\n[STEP 6] Testing simulated Quarantine...")
        quar_res = client.post("/api/v1/devices/PM-04/quarantine", json={
            "reason": "Exfiltration behavioral anomaly flagged in acceptance audit"
        })
        assert quar_res.status_code == 200
        pm04_q = client.get("/api/v1/devices/PM-04").json()
        assert pm04_q["device_info"]["status"] == "ISOLATED"
        assert pm04_q["device_info"]["attack_active"] is False
        print(f"-> Quarantine confirmed:")
        print(f"   * Status: {pm04_q['device_info']['status']}")
        print(f"   * Isolation Time: {pm04_q['device_info']['isolation_time']}")
        print(f"   * Isolation Reason: {pm04_q['device_info']['isolation_reason']}")
        print(f"   * Previous Risk: {pm04_q['device_info']['previous_risk']}")

        # STEP 7: Restore Device to Monitoring
        print("\n[STEP 7] Testing device restoration...")
        rest_res = client.post("/api/v1/devices/PM-04/restore")
        assert rest_res.status_code == 200
        pm04_r = client.get("/api/v1/devices/PM-04").json()
        assert pm04_r["device_info"]["status"] == "SECURE"
        print(f"-> Restoration confirmed: Status = {pm04_r['device_info']['status']}")

        print("\n" + "=" * 80)
        print(">>> ALL HEALTHSHIELD-X 2.0 ACCEPTANCE TESTS PASSED SUCCESSFULLY <<<")
        print("=" * 80)

    finally:
        db.close()

if __name__ == "__main__":
    run_full_acceptance_audit()
