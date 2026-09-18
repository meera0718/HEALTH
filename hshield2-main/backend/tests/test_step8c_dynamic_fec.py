import pytest
from app.db.database import SessionLocal
from app.db.models import HoneypotSecurityEvent, Patient, PatientFEC
from app.security_engine.event_fusion_pipeline import process_event_fusion_pipeline, calculate_deterministic_threat_index
from app.security_engine.event_ml_pipeline import calculate_event_feature_vector

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_1_dynamic_fec_p003(db):
    """TEST 1: Dynamic FEC for P003 uses baseline_fec equal to PatientFEC DB score"""
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == "P003",
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).first()
    assert evt is not None, "No simulation event found for P003"
    
    res = process_event_fusion_pipeline(db, evt.event_id)
    db.expire_all()
    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == "P003").first()
    assert fec_rec is not None
    expected_baseline = float(fec_rec.fec_score)
    
    assert res["fec"]["baseline_fec"] == expected_baseline
    assert res["fec"]["baseline_fec"] != 85.0
    assert res["fec"]["scope"] == "EVENT"

def test_2_dynamic_fec_p004(db):
    """TEST 2: Dynamic FEC for P004 uses baseline_fec equal to PatientFEC DB score"""
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == "P004",
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).first()
    assert evt is not None, "No simulation event found for P004"
    
    res = process_event_fusion_pipeline(db, evt.event_id)
    db.expire_all()
    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == "P004").first()
    assert fec_rec is not None
    expected_baseline = float(fec_rec.fec_score)
    
    assert res["fec"]["baseline_fec"] == expected_baseline
    assert res["fec"]["baseline_fec"] != 85.0
    assert res["fec"]["scope"] == "EVENT"

def test_3_patient_specific_fec(db):
    """TEST 3: Patient-specific FEC baseline matches respective PatientFEC record for P003, P004, P005"""
    for pid in ["P003", "P004", "P005"]:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == pid,
            HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
        ).first()
        assert evt is not None, f"No simulation event found for {pid}"
        
        res = process_event_fusion_pipeline(db, evt.event_id)
        db.expire_all()
        fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == pid).first()
        assert fec_rec is not None
        expected_baseline = float(fec_rec.fec_score)
        assert res["fec"]["baseline_fec"] == expected_baseline

def test_4_same_patient_different_events(db):
    """TEST 4: Two events for P003 return identical patient baseline FEC score"""
    evts = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == "P003",
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).limit(2).all()
    assert len(evts) >= 2, "Need at least 2 simulation events for P003"
    
    res_a = process_event_fusion_pipeline(db, evts[0].event_id)
    res_b = process_event_fusion_pipeline(db, evts[1].event_id)
    db.expire_all()
    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == "P003").first()
    expected_baseline = float(fec_rec.fec_score)
    
    assert res_a["fec"]["baseline_fec"] == expected_baseline
    assert res_b["fec"]["baseline_fec"] == expected_baseline

def test_5_no_hardcoded_85(db):
    """TEST 5: Production pipeline does not return 85.0 static placeholder"""
    for pid in ["P001", "P002", "P003", "P004", "P005"]:
        evt = db.query(HoneypotSecurityEvent).filter(
            HoneypotSecurityEvent.patient_id == pid,
            HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
        ).first()
        if evt:
            res = process_event_fusion_pipeline(db, evt.event_id)
            db.expire_all()
            fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == pid).first()
            if fec_rec:
                assert res["fec"]["baseline_fec"] == float(fec_rec.fec_score)

def test_6_missing_patient_fec_fallback(db):
    """TEST 6: Missing PatientFEC record uses baseline fallback 50.0, NOT 85.0"""
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id.like("EVT-SIM-%")
    ).first()
    assert evt is not None
    
    orig_pid = evt.patient_id
    evt.patient_id = "NON_EXISTENT_PATIENT_999"
    try:
        res = process_event_fusion_pipeline(db, evt.event_id)
        assert res["fec"]["baseline_fec"] == 50.0
        assert res["fec"]["baseline_fec"] != 85.0
    finally:
        evt.patient_id = orig_pid

def test_7_threat_index_unchanged(db):
    """TEST 7: Threat Index calculation for EVT-SIM-A2740EE2 remains 76.1"""
    res = process_event_fusion_pipeline(db, "EVT-SIM-A2740EE2")
    assert res["threat_assessment"]["threat_index"] == 76.1

def test_8_fusion_unchanged(db):
    """TEST 8: Model agreement and Fusion result remain unchanged"""
    res = process_event_fusion_pipeline(db, "EVT-SIM-A2740EE2")
    assert res["fusion"]["model_agreement"] == "3/3"
    assert res["fusion"]["fusion_result"] == "THREAT"

def test_9_ml_vector_unchanged(db):
    """TEST 9: Feature vector generation remains isolated and unchanged"""
    evt = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.event_id == "EVT-SIM-A2740EE2"
    ).first()
    patient = db.query(Patient).filter(Patient.patient_id == evt.patient_id.upper()).first()
    _, vector_array = calculate_event_feature_vector(evt, patient)
    assert vector_array == [5, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0]

def test_10_patient_isolation(db):
    """TEST 10: Patient baseline isolation is strictly enforced"""
    evt_p3 = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.patient_id == "P003").first()
    evt_p4 = db.query(HoneypotSecurityEvent).filter(HoneypotSecurityEvent.patient_id == "P004").first()
    
    res_p3 = process_event_fusion_pipeline(db, evt_p3.event_id)
    res_p4 = process_event_fusion_pipeline(db, evt_p4.event_id)
    db.expire_all()
    
    fec_p3 = float(db.query(PatientFEC).filter(PatientFEC.patient_id == "P003").first().fec_score)
    fec_p4 = float(db.query(PatientFEC).filter(PatientFEC.patient_id == "P004").first().fec_score)
    
    assert res_p3["fec"]["baseline_fec"] == fec_p3
    assert res_p4["fec"]["baseline_fec"] == fec_p4
    assert res_p3["fec"]["baseline_fec"] != res_p4["fec"]["baseline_fec"]
