import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import SessionLocal
from app.db.models import Patient, HoneypotSecurityEvent
from app.api.routes.reporting import (
    generate_patient_security_pdf, 
    generate_patient_security_cv,
    generate_patient_security_csv
)

client = TestClient(app)

def test_pdf_export_p003():
    db = SessionLocal()
    try:
        pdf_bytes, filename = generate_patient_security_pdf(db, "P003")
        assert filename == "HEALTHX_Security_Report_P003.pdf"
        assert len(pdf_bytes) > 1000
        assert pdf_bytes.startswith(b"%PDF-1.4")
        assert pdf_bytes.endswith(b"%%EOF\n")
        
        pdf_text = pdf_bytes.decode("latin-1", "ignore")
        assert "Patient ID:                       P003" in pdf_text
        assert "HEALTHX PATIENT SECURITY REPORT" in pdf_text
        assert "undefined" not in pdf_text
        assert "[object Object]" not in pdf_text
    finally:
        db.close()

def test_csv_export_p001():
    db = SessionLocal()
    try:
        csv_bytes, filename = generate_patient_security_csv(db, "P001")
        assert filename == "HEALTHX_Security_Report_P001.csv"
        assert len(csv_bytes) > 100
        csv_text = csv_bytes.decode("utf-8")
        assert "HEALTHX PATIENT SECURITY REPORT" in csv_text
        assert "Patient ID,P001" in csv_text
        assert "P002" not in csv_text
    finally:
        db.close()

def test_cv_export_p003():
    db = SessionLocal()
    try:
        cv_data, filename = generate_patient_security_cv(db, "P003")
        assert filename == "HEALTHX_Security_CV_P003.json"
        assert cv_data["patient_id"] == "P003"
        assert cv_data["patient_profile"]["patient_id"] == "P003"
        assert "threat_index" in cv_data["risk_assessment"]
        assert "ocsvm" in cv_data["detection_ensemble"]
        assert "categories" in cv_data["evidence_coverage_fec"]
    finally:
        db.close()

def test_pdf_export_endpoint():
    res = client.get("/api/v1/reporting/export/pdf?patient_id=P004")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "HEALTHX_Security_Report_P004.pdf" in res.headers["content-disposition"]
    assert len(res.content) > 1000
    assert res.content.startswith(b"%PDF-1.4")

def test_csv_export_endpoint():
    res = client.get("/api/v1/reporting/export/csv?patient_id=P002")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "HEALTHX_Security_Report_P002.csv" in res.headers["content-disposition"]
    csv_text = res.content.decode("utf-8")
    assert "Patient ID,P002" in csv_text
    assert "P001" not in csv_text

def test_cv_export_endpoint():
    res = client.get("/api/v1/reporting/export/cv?patient_id=P004")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    assert "HEALTHX_Security_CV_P004.json" in res.headers["content-disposition"]
    cv_data = res.json()
    assert cv_data["patient_id"] == "P004"
    assert cv_data["patient_profile"]["patient_id"] == "P004"

def test_cross_patient_isolation():
    db = SessionLocal()
    try:
        pdf_bytes_p3, _ = generate_patient_security_pdf(db, "P003")
        pdf_bytes_p4, _ = generate_patient_security_pdf(db, "P004")
        
        text_p3 = pdf_bytes_p3.decode("latin-1", "ignore")
        text_p4 = pdf_bytes_p4.decode("latin-1", "ignore")
        
        assert "Patient ID:                       P003" in text_p3
        assert "Patient ID:                       P004" not in text_p3
        
        assert "Patient ID:                       P004" in text_p4
        assert "Patient ID:                       P003" not in text_p4

        csv_bytes_p1, _ = generate_patient_security_csv(db, "P001")
        csv_bytes_p2, _ = generate_patient_security_csv(db, "P002")
        
        csv_p1 = csv_bytes_p1.decode("utf-8")
        csv_p2 = csv_bytes_p2.decode("utf-8")
        
        assert "Patient ID,P001" in csv_p1
        assert "Patient ID,P002" not in csv_p1
        assert "Patient ID,P002" in csv_p2
        assert "Patient ID,P001" not in csv_p2

        cv_p3, _ = generate_patient_security_cv(db, "P003")
        cv_p4, _ = generate_patient_security_cv(db, "P004")
        
        assert cv_p3["patient_id"] == "P003"
        assert cv_p4["patient_id"] == "P004"
        assert cv_p3["patient_id"] != cv_p4["patient_id"]
    finally:
        db.close()

def test_nonexistent_patient_export_404():
    res_pdf = client.get("/api/v1/reporting/export/pdf?patient_id=P9999")
    assert res_pdf.status_code == 404

    res_csv = client.get("/api/v1/reporting/export/csv?patient_id=P9999")
    assert res_csv.status_code == 404

    res_cv = client.get("/api/v1/reporting/export/cv?patient_id=P9999")
    assert res_cv.status_code == 404
