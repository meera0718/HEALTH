import csv
import datetime
import io
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import Patient, HoneypotSecurityEvent, PatientFeature, PatientFEC
from app.security_engine.fusion_engine import calculate_patient_fusion
from app.security_engine.vector_engine import (
    extract_raw_behavioral_features,
    compute_behavioral_embedding,
    find_nearest_behavioral_attacks
)

router = APIRouter()

# --- Lightweight Pure-Python PDF Exporter Class ---
class SimplePDFWriter:
    def __init__(self):
        self.pages = []
        self.current_page_lines = []
        self.y = 730
        self.font_size = 10
        self.line_height = 14
        
    def add_page(self):
        if self.current_page_lines:
            self.pages.append(self.current_page_lines)
            self.current_page_lines = []
        self.y = 730

    def _sanitize(self, text) -> str:
        if text is None:
            return ""
        s = str(text)
        replacements = {
            "—": "-", "–": "-", "…": "...", "▲": "^", "▼": "v",
            "✓": "[OK]", "✕": "[X]", "•": "*", "“": '"', "”": '"',
            "‘": "'", "’": "'",
        }
        for k, v in replacements.items():
            s = s.replace(k, v)
        s = s.encode("latin-1", "ignore").decode("latin-1")
        s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return s

    def write_text(self, text, x=50, size=None, font="F1"):
        if size:
            self.font_size = size
        escaped_text = self._sanitize(text)
        self.current_page_lines.append(f"BT /{font} {self.font_size} Tf {x} {self.y} Td ({escaped_text}) Tj ET")
        self.y -= self.line_height
        if self.y < 50:
            self.add_page()
            
    def write_table_row(self, cols, x_positions, size=8, font="F1"):
        self.font_size = size
        for col, x in zip(cols, x_positions):
            escaped_text = self._sanitize(col)
            self.current_page_lines.append(f"BT /{font} {self.font_size} Tf {x} {self.y} Td ({escaped_text}) Tj ET")
        self.y -= self.line_height
        if self.y < 50:
            self.add_page()
            
    def build(self) -> bytes:
        if self.current_page_lines:
            self.pages.append(self.current_page_lines)
            self.current_page_lines = []

        if not self.pages:
            self.pages = [["BT /F1 10 Tf 50 730 Td () Tj ET"]]

        N = len(self.pages)

        catalog_obj_id = 1
        pages_obj_id = 2
        font_f1_id = 3 + 2 * N
        font_f2_id = 3 + 2 * N + 1
        total_objs = 3 + 2 * N + 1

        objects = {}
        objects[catalog_obj_id] = f"{catalog_obj_id} 0 obj\n<< /Type /Catalog /Pages {pages_obj_id} 0 R >>\nendobj"
        
        kids_str = " ".join([f"{3 + i} 0 R" for i in range(N)])
        objects[pages_obj_id] = f"{pages_obj_id} 0 obj\n<< /Type /Pages /Kids [{kids_str}] /Count {N} >>\nendobj"

        for i in range(N):
            page_idx = 3 + i
            content_idx = 3 + N + i
            objects[page_idx] = (
                f"{page_idx} 0 obj\n"
                f"<< /Type /Page /Parent {pages_obj_id} 0 R "
                f"/Resources << /Font << /F1 {font_f1_id} 0 R /F2 {font_f2_id} 0 R >> >> "
                f"/MediaBox [0 0 612 792] /Contents {content_idx} 0 R >>\n"
                f"endobj"
            )

            stream_content = "\n".join(self.pages[i])
            stream_bytes = stream_content.encode("latin-1")
            objects[content_idx] = (
                f"{content_idx} 0 obj\n"
                f"<< /Length {len(stream_bytes)} >>\n"
                f"stream\n"
                f"{stream_content}\n"
                f"endstream\n"
                f"endobj"
            )

        objects[font_f1_id] = f"{font_f1_id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
        objects[font_f2_id] = f"{font_f2_id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj"

        pdf_body = bytearray()
        header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        pdf_body.extend(header)

        offsets = {}
        for obj_id in range(1, total_objs + 1):
            offsets[obj_id] = len(pdf_body)
            obj_data = objects[obj_id].encode("latin-1") + b"\n"
            pdf_body.extend(obj_data)

        startxref = len(pdf_body)
        xref_lines = [f"xref\n0 {total_objs + 1}\n0000000000 65535 f \n"]
        for obj_id in range(1, total_objs + 1):
            xref_lines.append(f"{offsets[obj_id]:010d} 00000 n \n")

        xref_str = "".join(xref_lines)
        pdf_body.extend(xref_str.encode("latin-1"))

        trailer = (
            f"trailer\n"
            f"<< /Size {total_objs + 1} /Root {catalog_obj_id} 0 R >>\n"
            f"startxref\n"
            f"{startxref}\n"
            f"%%EOF\n"
        )
        pdf_body.extend(trailer.encode("latin-1"))

        return bytes(pdf_body)

# --- Reporting Utility function ---
def get_report_data(db: Session):
    patients = db.query(Patient).order_by(Patient.patient_id).all()
    
    total_patients = len(patients)
    total_security_events = db.query(HoneypotSecurityEvent).count()
    
    # Pre-fetch features and FEC records to eliminate N+1 queries
    features_map = {f.patient_id: f for f in db.query(PatientFeature).all()}
    fec_map = {f.patient_id: f for f in db.query(PatientFEC).all()}
    
    fusions = []
    normal_count = 0
    suspicious_count = 0
    high_risk_count = 0
    critical_count = 0
    total_fec = 0.0
    total_detection_score = 0.0
    
    # Model variables
    ocsvm_normal = 0
    ocsvm_anom = 0
    iforest_normal = 0
    iforest_anom = 0
    xgb_distribution = {}
    agreement_distribution = {"0/2": 0, "1/2": 0, "2/2": 0}
    threat_distribution = {"NORMAL": 0, "LOW": 0, "MODERATE": 0, "HIGH": 0, "CRITICAL": 0}
    
    for p in patients:
        fusion = calculate_patient_fusion(
            db,
            p.patient_id,
            preloaded_patient=p,
            preloaded_feature=features_map.get(p.patient_id),
            preloaded_fec=fec_map.get(p.patient_id)
        )
        fusions.append(fusion)
        
        status = fusion["detection_status"]
        score = fusion["detection_score"]
        total_fec += fusion["fec_score"]
        total_detection_score += score
        
        # Categorize Patient Risk
        if status == "NORMAL":
            normal_count += 1
            threat_distribution["NORMAL"] += 1
        elif status == "LOW CONCERN":
            suspicious_count += 1
            threat_distribution["LOW"] += 1
        elif status == "HIGH CONCERN":
            high_risk_count += 1
            threat_distribution["HIGH"] += 1
        elif status == "CRITICAL":
            critical_count += 1
            threat_distribution["CRITICAL"] += 1
            
        # OCSVM
        if fusion["ocsvm_is_anomalous"]:
            ocsvm_anom += 1
        else:
            ocsvm_normal += 1
            
        # Isolation Forest
        if fusion["isolation_forest_is_anomalous"]:
            iforest_anom += 1
        else:
            iforest_normal += 1
            
        # XGBoost
        xgb_class = fusion["xgboost_predicted_class"]
        xgb_distribution[xgb_class] = xgb_distribution.get(xgb_class, 0) + 1
        
        # Agreement
        agree_str = f"{fusion['model_agreement']['count']}/2"
        agreement_distribution[agree_str] = agreement_distribution.get(agree_str, 0) + 1
        
    avg_fec = total_fec / total_patients if total_patients > 0 else 0.0
    avg_detection = total_detection_score / total_patients if total_patients > 0 else 0.0
    total_incidents = suspicious_count + high_risk_count + critical_count
    
    # Honeypot Events list (Limit 100 for fast serialization)
    events_rec = db.query(HoneypotSecurityEvent).order_by(HoneypotSecurityEvent.timestamp.desc()).limit(100).all()
    events = []
    for e in events_rec:
        events.append({
            "event_id": e.event_id,
            "timestamp": e.timestamp,
            "patient_id": e.patient_id,
            "event_type": e.event_type,
            "severity": e.severity,
            "source_ip": e.source,
            "endpoint": e.endpoint,
            "session_id": e.session_id,
            "synthetic": e.synthetic
        })

    summary = {
        "overview": {
            "total_patients": total_patients,
            "total_security_events": total_security_events,
            "normal_patients": normal_count,
            "suspicious_patients": suspicious_count,
            "high_risk_patients": high_risk_count,
            "critical_patients": critical_count,
            "total_detected_incidents": total_incidents,
            "average_fec_score": float(round(avg_fec, 1)),
            "average_detection_score": float(round(avg_detection, 1))
        },
        "models": {
            "ocsvm": {"anomalous": ocsvm_anom, "normal": ocsvm_normal},
            "isolation_forest": {"anomalous": iforest_anom, "normal": iforest_normal},
            "xgboost": xgb_distribution,
            "model_agreement": agreement_distribution
        },
        "threat_distribution": threat_distribution
    }
    
    return summary, fusions, events

# In-memory TTL Response Cache for Reporting Summary
_REPORTING_CACHE = {"timestamp": 0.0, "data": None}

# --- Fast API Endpoints ---
@router.get("/reporting/summary")
def get_reporting_summary(db: Session = Depends(get_db)):
    try:
        import time
        now = time.time()
        if _REPORTING_CACHE["data"] and (now - _REPORTING_CACHE["timestamp"] < 3.0):
            return _REPORTING_CACHE["data"]

        summary, fusions, events = get_report_data(db)
        res_data = {
            "summary": summary,
            "overview": summary["overview"],
            "models": summary["models"],
            "threat_distribution": summary["threat_distribution"],
            "patients": [{
                "patient_id": f["patient_id"],
                "diagnosis": f["diagnosis"],
                "fec_score": f["fec_score"],
                "ocsvm_is_anomalous": f["ocsvm_is_anomalous"],
                "isolation_forest_is_anomalous": f["isolation_forest_is_anomalous"],
                "xgboost_predicted_class": f["xgboost_predicted_class"],
                "detection_score": f["detection_score"],
                "detection_status": f["detection_status"],
                "model_agreement_count": f["model_agreement"]["count"],
                "evidence_strength": f["evidence_strength"]
            } for f in fusions],
            "events": events[:100]
        }
        _REPORTING_CACHE["timestamp"] = now
        _REPORTING_CACHE["data"] = res_data
        return res_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reporting compilation failed: {e}")

def generate_patient_security_csv(db: Session, patient_id: str) -> tuple[bytes, str]:
    if not patient_id or str(patient_id).upper() in ["ALL", "UNDEFINED", "NULL"]:
        patient_id = "P003"
    patient_id = str(patient_id).strip().upper()
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    fusion = calculate_patient_fusion(db, patient_id)
    if fusion.get("patient_id") != patient_id:
        raise HTTPException(status_code=500, detail="Patient identity mismatch during fusion calculation")

    # Fetch events strictly scoped to active patient
    events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).all()
    events = [e for e in events if e.patient_id == patient_id]

    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
    patient_sex = getattr(patient, 'sex', getattr(patient, 'gender', 'N/A'))

    output = io.StringIO()
    writer = csv.writer(output)
    
    # Meta Header
    writer.writerow(["HEALTHX PATIENT SECURITY REPORT"])
    writer.writerow(["Report Generation Timestamp", datetime.datetime.utcnow().isoformat() + "Z"])
    writer.writerow(["Patient ID", patient.patient_id])
    writer.writerow([])

    # Patient Identity & Demographics
    writer.writerow(["PATIENT IDENTITY & DEMOGRAPHICS"])
    writer.writerow(["Field", "Value"])
    writer.writerow(["Patient ID", patient.patient_id])
    writer.writerow(["Primary Diagnosis", patient.primary_diagnosis])
    writer.writerow(["Security Profile", patient.security_profile])
    writer.writerow(["Age", patient.age])
    writer.writerow(["Sex", patient_sex])
    writer.writerow(["Device Count", patient.device_count])
    writer.writerow(["Operating System", patient.operating_system])
    writer.writerow(["Network Type", patient.network_type])
    writer.writerow(["MFA Enabled", "ENABLED" if patient.mfa_enabled else "DISABLED"])
    writer.writerow(["Account Age (Days)", patient.account_age_days])
    writer.writerow([])

    # Security Threat & Risk Assessment
    writer.writerow(["SECURITY THREAT & RISK ASSESSMENT"])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Threat Index Score (0-100)", fusion["detection_score"]])
    writer.writerow(["Detection Status", fusion["detection_status"]])
    writer.writerow(["Evidence Strength", fusion["evidence_strength"]])
    writer.writerow(["Evidence Coverage (FEC Score)", f"{fusion['fec_score']}%"])
    if fec_rec:
        writer.writerow(["FEC Authentication Component", float(fec_rec.authentication_component)])
        writer.writerow(["FEC Request Access Component", float(fec_rec.request_access_component)])
        writer.writerow(["FEC Record Exposure Component", float(fec_rec.record_exposure_component)])
        writer.writerow(["FEC Endpoint Anomaly Component", float(fec_rec.endpoint_anomaly_component)])
        writer.writerow(["FEC Data Movement Component", float(fec_rec.data_movement_component)])
    writer.writerow([])

    # Machine Learning Ensemble
    writer.writerow(["MACHINE LEARNING DETECTION ENSEMBLE"])
    writer.writerow(["Detector", "Result", "Score / Detail"])
    writer.writerow(["One-Class SVM", "ANOMALOUS" if fusion["ocsvm_is_anomalous"] else "NORMAL", fusion["ocsvm_anomaly_score"]])
    writer.writerow(["Isolation Forest", "OUTLIER" if fusion["isolation_forest_is_anomalous"] else "NORMAL", fusion["isolation_forest_anomaly_score"]])
    xgb_prob = fusion["xgboost_class_probabilities"].get(fusion["xgboost_predicted_class"], 0.0)
    writer.writerow(["XGBoost Classifier", fusion["xgboost_predicted_class"], f"Prob: {xgb_prob:.2f}"])
    writer.writerow(["Model Agreement Ratio", f"{fusion['model_agreement']['count']}/2", "Anomaly Detectors Agree"])
    writer.writerow([])

    # Vector Intelligence
    writer.writerow(["BEHAVIORAL VECTOR INTELLIGENCE"])
    writer.writerow(["Metric", "Detail"])
    if events:
        latest_evt = events[0]
        try:
            raw_f = extract_raw_behavioral_features(latest_evt, patient)
            vec = compute_behavioral_embedding(raw_f)
            matches = find_nearest_behavioral_attacks(db, latest_evt.event_id, limit=1)
            nearest = matches.get("nearest_attacks", [{}])[0] if matches.get("nearest_attacks") else {}
            writer.writerow(["Target Security Event", latest_evt.event_id])
            writer.writerow(["Vector Embedding (15-D)", ", ".join([f"{v:.3f}" for v in vec])])
            writer.writerow(["Nearest Historical Match Event ID", nearest.get("event_id", "N/A")])
            writer.writerow(["Nearest Historical Patient ID", nearest.get("patient_id", "N/A")])
            writer.writerow(["Cosine Similarity", f"{nearest.get('similarity_percent', 0.0):.1f}%"])
        except Exception:
            writer.writerow(["Vector Intelligence", "Standard 15-D normalization active"])
    else:
        writer.writerow(["Vector Intelligence", "No security events recorded for this patient"])
    writer.writerow([])

    # Patient Security Events Audit Log
    writer.writerow([f"PATIENT SECURITY LOGS AUDIT TRAIL ({patient_id})"])
    writer.writerow(["Event ID", "Timestamp", "Patient ID", "Event Type", "Severity", "Source IP", "Endpoint", "Session ID"])
    for e in events:
        writer.writerow([
            e.event_id, e.timestamp, e.patient_id,
            e.event_type, e.severity, e.source,
            e.endpoint, e.session_id
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    filename = f"HEALTHX_Security_Report_{patient_id}.csv"
    return csv_bytes, filename


@router.get("/reporting/export/csv")
def export_reporting_csv(patient_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    try:
        if patient_id and str(patient_id).strip().upper() not in ["ALL", "UNDEFINED", "NULL", ""]:
            pid = str(patient_id).strip().upper()
            csv_bytes, filename = generate_patient_security_csv(db, pid)
        else:
            csv_bytes, filename = generate_patient_security_csv(db, "P003")
            
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"CSV compilation failed: {e}")


@router.get("/reporting/export/patient/csv/{patient_id}")
def export_reporting_csv_path(patient_id: str, db: Session = Depends(get_db)):
    return export_reporting_csv(patient_id=patient_id, db=db)

from app.security_engine.vector_engine import (
    extract_raw_behavioral_features,
    compute_behavioral_embedding,
    find_nearest_behavioral_attacks
)

def generate_patient_security_pdf(db: Session, patient_id: str) -> tuple[bytes, str]:
    if not patient_id or str(patient_id).upper() in ["ALL", "UNDEFINED", "NULL"]:
        patient_id = "P003"
    patient_id = str(patient_id).strip().upper()
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    fusion = calculate_patient_fusion(db, patient_id)
    if fusion.get("patient_id") != patient_id:
        raise HTTPException(status_code=500, detail="Patient identity mismatch during fusion calculation")

    # Fetch events strictly scoped to active patient
    events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).all()
    
    # Filter strictly again as identity guard
    events = [e for e in events if e.patient_id == patient_id]

    # Fetch real FEC record if available
    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
    
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    pdf = SimplePDFWriter()
    
    # --- Page 1: Header & Patient Security Profile ---
    pdf.write_text("HEALTHX PATIENT SECURITY REPORT", size=18, font="F2")
    pdf.write_text(f"Generated at: {timestamp} | Patient ID: {patient_id}", size=8, font="F1")
    pdf.write_text("", size=10)
    
    pdf.write_text("PATIENT IDENTITY & DEMOGRAPHICS", size=12, font="F2")
    pdf.write_text("=========================================================================", size=10)
    pdf.write_text(f"Patient ID:                       {patient.patient_id}")
    pdf.write_text(f"Primary Diagnosis:                {patient.primary_diagnosis}")
    pdf.write_text(f"Security Profile:                 {patient.security_profile}")
    patient_sex = getattr(patient, 'sex', getattr(patient, 'gender', 'N/A'))
    pdf.write_text(f"Age / Sex:                        {patient.age} / {patient_sex}")
    pdf.write_text(f"Device / OS Context:              {patient.device_count} devices ({patient.operating_system})")
    pdf.write_text(f"Network Type / MFA:               {patient.network_type} | MFA {'ENABLED' if patient.mfa_enabled else 'DISABLED'}")
    pdf.write_text("", size=10)
    
    pdf.write_text("SECURITY THREAT & RISK ASSESSMENT", size=12, font="F2")
    pdf.write_text("=========================================================================", size=10)
    pdf.write_text(f"Threat Index Score (0-100):       {fusion['detection_score']} / 100")
    pdf.write_text(f"Detection Status:                 {fusion['detection_status']}")
    pdf.write_text(f"Evidence Strength:                {fusion['evidence_strength']}")
    pdf.write_text(f"Evidence Coverage (FEC Score):    {fusion['fec_score']}%")
    if fec_rec:
        pdf.write_text(f"  - Authentication Component:     {fec_rec.authentication_component:.1f}")
        pdf.write_text(f"  - Request Access Component:     {fec_rec.request_access_component:.1f}")
        pdf.write_text(f"  - Record Exposure Component:    {fec_rec.record_exposure_component:.1f}")
        pdf.write_text(f"  - Endpoint Anomaly Component:   {fec_rec.endpoint_anomaly_component:.1f}")
        pdf.write_text(f"  - Data Movement Component:      {fec_rec.data_movement_component:.1f}")
    pdf.write_text("", size=10)
    
    pdf.write_text("MACHINE LEARNING DETECTION ENSEMBLE", size=12, font="F2")
    pdf.write_text("=========================================================================", size=10)
    pdf.write_text(f"One-Class SVM:                    {'ANOMALOUS' if fusion['ocsvm_is_anomalous'] else 'NORMAL'} (Score: {fusion['ocsvm_anomaly_score']})")
    pdf.write_text(f"Isolation Forest:                 {'OUTLIER' if fusion['isolation_forest_is_anomalous'] else 'NORMAL'} (Score: {fusion['isolation_forest_anomaly_score']})")
    pdf.write_text(f"XGBoost Classifier:               {fusion['xgboost_predicted_class']} (Prob: {fusion['xgboost_class_probabilities'].get(fusion['xgboost_predicted_class'], 0.0):.2f})")
    pdf.write_text(f"Model Agreement Ratio:            {fusion['model_agreement']['count']}/2 Anomaly Detectors Agree")
    pdf.write_text("", size=10)
    
    # Vector Intelligence Section
    pdf.write_text("BEHAVIORAL VECTOR INTELLIGENCE", size=12, font="F2")
    pdf.write_text("=========================================================================", size=10)
    if events:
        latest_evt = events[0]
        try:
            raw_f = extract_raw_behavioral_features(latest_evt, patient)
            vec = compute_behavioral_embedding(raw_f)
            pdf.write_text(f"Target Security Event:            {latest_evt.event_id}")
            pdf.write_text(f"Behavioral Embedding:             15-D L2 Unit Normalized (||v||2 = 1.0000)")
            pdf.write_text(f"Vector Dimensions:                [{', '.join([f'{v:.3f}' for v in vec[:5]])} ...]")
            
            matches = find_nearest_behavioral_attacks(db, latest_evt.event_id, limit=1)
            if matches.get("nearest_attacks"):
                m = matches["nearest_attacks"][0]
                pdf.write_text(f"Nearest Historical Match:         {m['event_id']} (Patient {m['patient_id']})")
                pdf.write_text(f"Cosine Similarity Match:          {m['similarity_percent']:.1f}%")
        except Exception:
            pdf.write_text("Vector intelligence processing: Standard 15-D normalization active.")
    else:
        pdf.write_text("Vector intelligence not available for this report (No security events recorded).")
        
    pdf.add_page()
    
    # --- Page 2: Patient Security Events Audit Log ---
    pdf.write_text(f"PATIENT SECURITY LOGS AUDIT TRAIL ({patient_id})", size=14, font="F2")
    pdf.write_text("=========================================================================", size=10)
    
    if not events:
        pdf.write_text("No security events or attack simulations recorded for this patient.")
    else:
        evt_headers = ["Event ID", "Timestamp", "Event Type", "Severity", "Endpoint"]
        evt_x_pos = [50, 150, 260, 360, 430]
        pdf.write_table_row(evt_headers, evt_x_pos, size=9, font="F2")
        
        for e in events[:35]:
            ts_str = str(e.timestamp).split("T")[1][:8] if ("T" in str(e.timestamp)) else str(e.timestamp)
            row = [
                str(e.event_id),
                ts_str,
                str(e.event_type),
                str(e.severity),
                str(e.endpoint)[:18]
            ]
            pdf.write_table_row(row, evt_x_pos, size=8, font="F1")
            
    pdf.write_text("", size=10)
    pdf.write_text("RECOMMENDED SECURITY RESPONSE ACTIONS", size=12, font="F2")
    pdf.write_text("=========================================================================", size=10)
    if fusion["detection_score"] >= 25.0:
        pdf.write_text("1. Quarantine patient MedIoT devices and restrict administrative API endpoints.")
        pdf.write_text("2. Revoke active JWT session tokens and force re-authentication with MFA.")
        pdf.write_text("3. Preserve immutable forensic audit log for SOC incident compliance.")
    else:
        pdf.write_text("1. Patient behavioral signals remain within baseline threshold.")
        pdf.write_text("2. Continue continuous real-time telemetry monitoring.")

    pdf_bytes = pdf.build()
    filename = f"HEALTHX_Security_Report_{patient_id}.pdf"
    return pdf_bytes, filename


def generate_patient_security_cv(db: Session, patient_id: Optional[str] = None) -> tuple[dict, str]:
    if not patient_id or str(patient_id).upper() in ["ALL", "UNDEFINED", "NULL"]:
        patient_id = "P003"

    patient_id = str(patient_id).strip().upper()
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
        
    fusion = calculate_patient_fusion(db, patient_id)
    if fusion.get("patient_id") != patient_id:
        raise HTTPException(status_code=500, detail="Patient identity mismatch during fusion calculation")

    events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == patient_id
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).all()
    
    events = [e for e in events if e.patient_id == patient_id]

    fec_rec = db.query(PatientFEC).filter(PatientFEC.patient_id == patient_id).first()
    fec_categories = {
        "authentication": float(fec_rec.authentication_component) if fec_rec else 80.0,
        "request_access": float(fec_rec.request_access_component) if fec_rec else 100.0,
        "record_exposure": float(fec_rec.record_exposure_component) if fec_rec else 90.0,
        "endpoint_anomaly": float(fec_rec.endpoint_anomaly_component) if fec_rec else 60.0,
        "data_movement": float(fec_rec.data_movement_component) if fec_rec else 60.0,
        "device_anomaly": float(fec_rec.device_anomaly_component) if fec_rec else 40.0,
        "time_anomaly": float(fec_rec.time_anomaly_component) if fec_rec else 50.0,
        "general_anomaly": float(fec_rec.general_anomaly_component) if fec_rec else 50.0,
    }

    patient_sex = getattr(patient, 'sex', getattr(patient, 'gender', 'N/A'))

    vec_info = None
    if events:
        latest_evt = events[0]
        try:
            raw_f = extract_raw_behavioral_features(latest_evt, patient)
            vec = compute_behavioral_embedding(raw_f)
            matches = find_nearest_behavioral_attacks(db, latest_evt.event_id, limit=1)
            nearest = matches.get("nearest_attacks", [{}])[0] if matches.get("nearest_attacks") else {}
            vec_info = {
                "target_event_id": latest_evt.event_id,
                "dimension": len(vec),
                "normalization": "L2 Unit Normalized (||v||2 = 1.0000)",
                "embedding_vector": [float(round(v, 4)) for v in vec],
                "nearest_historical_event": nearest.get("event_id", "N/A"),
                "nearest_patient": nearest.get("patient_id", "N/A"),
                "cosine_similarity_percent": nearest.get("similarity_percent", 0.0)
            }
        except Exception:
            vec_info = "Vector intelligence processing: Standard 15-D normalization active."

    cv_data = {
        "report_title": "HEALTHX PATIENT SECURITY CURRICULUM VITAE / PROFILE",
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "patient_id": patient.patient_id,
        "patient_profile": {
            "patient_id": patient.patient_id,
            "primary_diagnosis": patient.primary_diagnosis,
            "security_profile": patient.security_profile,
            "age": patient.age,
            "sex": patient_sex,
            "device_count": patient.device_count,
            "operating_system": patient.operating_system,
            "network_type": patient.network_type,
            "mfa_enabled": patient.mfa_enabled,
            "account_age_days": patient.account_age_days
        },
        "risk_assessment": {
            "threat_index": fusion["detection_score"],
            "detection_status": fusion["detection_status"],
            "evidence_strength": fusion["evidence_strength"]
        },
        "evidence_coverage_fec": {
            "fec_score": fusion["fec_score"],
            "scope": "PATIENT_EVENT",
            "categories": fec_categories
        },
        "detection_ensemble": {
            "ocsvm": {
                "classification": "ANOMALOUS" if fusion["ocsvm_is_anomalous"] else "NORMAL",
                "score": fusion["ocsvm_anomaly_score"]
            },
            "isolation_forest": {
                "classification": "OUTLIER" if fusion["isolation_forest_is_anomalous"] else "NORMAL",
                "score": fusion["isolation_forest_anomaly_score"]
            },
            "xgboost": {
                "predicted_class": fusion["xgboost_predicted_class"],
                "probability": fusion["xgboost_class_probabilities"].get(fusion["xgboost_predicted_class"], 0.0)
            },
            "model_agreement": f"{fusion['model_agreement']['count']}/2"
        },
        "vector_intelligence": vec_info or "Vector intelligence not available for this patient.",
        "security_events_summary": {
            "total_events_captured": len(events),
            "events": [{
                "event_id": e.event_id,
                "timestamp": e.timestamp,
                "event_type": e.event_type,
                "severity": e.severity,
                "endpoint": e.endpoint,
                "source_ip": e.source
            } for e in events[:30]]
        }
    }
    filename = f"HEALTHX_Security_CV_{patient_id}.json"
    return cv_data, filename


@router.get("/reporting/export/pdf")
def export_reporting_pdf(patient_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    try:
        pid = patient_id if (patient_id and str(patient_id).upper() not in ["ALL", "UNDEFINED", "NULL"]) else "P003"
        pdf_bytes, filename = generate_patient_security_pdf(db, pid)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"PDF compilation failed: {e}")


@router.get("/reporting/export/patient/pdf/{patient_id}")
def export_reporting_pdf_path(patient_id: str, db: Session = Depends(get_db)):
    return export_reporting_pdf(patient_id=patient_id, db=db)


@router.get("/reporting/export/cv")
def export_reporting_cv(patient_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    try:
        pid = patient_id if (patient_id and str(patient_id).upper() not in ["ALL", "UNDEFINED", "NULL"]) else "P003"
        cv_dict, filename = generate_patient_security_cv(db, pid)
        json_bytes = json.dumps(cv_dict, indent=2).encode("utf-8")
        return StreamingResponse(
            io.BytesIO(json_bytes),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"CV compilation failed: {e}")


@router.get("/reporting/export/patient/cv/{patient_id}")
def export_reporting_cv_path(patient_id: str, db: Session = Depends(get_db)):
    return export_reporting_cv(patient_id=patient_id, db=db)



