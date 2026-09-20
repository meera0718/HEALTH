import json
import datetime
import asyncio
from typing import Optional
from queue import Queue
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import (
    Device, AttackSession, QuarantineAction, HoneypotSecurityEvent, 
    PatientFeature, PatientFEC, DeviceStateHistory
)
from app.security_engine.telemetry_generator import add_listener, remove_listener, generate_device_event
from app.security_engine.feature_engine import calculate_single_patient_features
from app.security_engine.fec_engine import calculate_single_patient_fec
from app.security_engine.fusion_engine import calculate_patient_fusion

router = APIRouter()

class AttackStartPayload(BaseModel):
    attack_type: Optional[str] = "DATA_EXFILTRATION"
    intensity: Optional[str] = "HIGH"

class QuarantinePayload(BaseModel):
    reason: Optional[str] = "Operator Quarantine Isolation"

@router.get("/devices")
def get_all_devices(db: Session = Depends(get_db)):
    devices = db.query(Device).order_by(Device.device_id).all()
    results = []
    for d in devices:
        # Fetch current ML scores from the pipeline
        try:
            fusion = calculate_patient_fusion(db, d.device_id)
            fec_score = fusion["fec_score"]
            ocsvm = fusion["ocsvm_anomaly_score"]
            iforest = fusion["isolation_forest_anomaly_score"]
            xgb = fusion["xgboost_suspiciousness_score"]
            
            ocsvm_anom = bool(fusion.get("ocsvm_is_anomalous") or ocsvm > 50)
            iforest_anom = bool(fusion.get("isolation_forest_is_anomalous") or iforest > 50)
            xgb_anom = bool(fusion.get("xgboost_predicted_class") != "NORMAL" or xgb > 50)
            
            anom_count = sum([1 if ocsvm_anom else 0, 1 if iforest_anom else 0, 1 if xgb_anom else 0])
            if anom_count >= 2:
                agreement = f"{anom_count}/3"
            elif anom_count == 0:
                agreement = "3/3"
            else:
                agreement = f"{3 - anom_count}/3"

            threat = fusion.get("xgboost_predicted_class", "NORMAL") if d.status != "ISOLATED" else "NORMAL"
        except Exception:
            fec_score = 0.0
            ocsvm = 0.0
            iforest = 0.0
            xgb = 0.0
            agreement = "3/3"
            threat = "NORMAL"
            
        results.append({
            "device_id": d.device_id,
            "device_name": d.device_name,
            "device_type": d.device_type,
            "ip_address": d.ip_address,
            "vlan": d.vlan,
            "status": d.status,
            "risk_score": d.risk_score,
            "last_seen": d.last_seen,
            "isolation_reason": d.isolation_reason,
            "isolation_time": d.isolation_time,
            "previous_risk": d.previous_risk,
            "attack_active": d.attack_active,
            "attack_type": d.attack_type,
            "attack_intensity": d.attack_intensity,
            "fec_score": fec_score,
            "ocsvm_anomaly_score": ocsvm,
            "isolation_forest_anomaly_score": iforest,
            "xgboost_suspiciousness_score": xgb,
            "model_agreement": agreement,
            "threat": threat
        })
    return results

@router.get("/devices/{device_id}")
def get_device_detail(device_id: str, db: Session = Depends(get_db)):
    device_id = device_id.upper()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
        
    # Get ML fusion details
    try:
        fusion = calculate_patient_fusion(db, device_id)
    except Exception:
        fusion = {}

    # Get current 15-D feature vectors
    feature_rec = db.query(PatientFeature).filter(PatientFeature.patient_id == device_id).first()
    features = {}
    if feature_rec:
        features = {
            "failed_login_rate": feature_rec.failed_login_rate,
            "request_rate": feature_rec.request_rate,
            "total_records_accessed": feature_rec.total_records_accessed,
            "unique_endpoints": feature_rec.unique_endpoints,
            "endpoint_discovery_count": feature_rec.endpoint_discovery_count,
            "suspicious_download_count": feature_rec.suspicious_download_count,
            "data_export_count": feature_rec.data_export_count,
            "privilege_escalation_count": feature_rec.privilege_escalation_count,
            "device_change_count": feature_rec.device_change_count,
            "night_activity_count": feature_rec.night_activity_count,
            "error_rate": feature_rec.error_rate,
            "anomalous_event_count": feature_rec.anomalous_event_count,
            "unique_sessions": feature_rec.unique_sessions,
            "unique_devices": feature_rec.unique_devices,
            "average_response_time_ms": feature_rec.average_response_time_ms
        }

    # Get recent telemetry event timeline (last 25 events)
    events = db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id == device_id
    ).order_by(HoneypotSecurityEvent.timestamp.desc()).limit(25).all()
    
    timeline = []
    for e in events:
        timeline.append({
            "event_id": e.event_id,
            "timestamp": e.timestamp,
            "event_type": e.event_type,
            "endpoint": e.endpoint,
            "records_accessed": e.records_accessed,
            "failed_login_attempts": e.failed_login_attempts,
            "response_status": e.response_status,
            "response_time_ms": e.response_time_ms,
            "severity": getattr(e, "severity", "MEDIUM"),
            "is_anomalous": e.is_anomalous_baseline
        })

    # Get historical state progression and timeline data
    state_records = db.query(DeviceStateHistory).filter(
        DeviceStateHistory.device_id == device_id
    ).order_by(DeviceStateHistory.id.desc()).limit(20).all()
    
    history = []
    if state_records:
        for s in reversed(state_records):
            history.append({
                "time": s.timestamp[-8:] if len(s.timestamp) >= 8 else s.timestamp,
                "risk": round(s.risk_score),
                "records": features.get("total_records_accessed", 0),
                "exports": features.get("data_export_count", 0),
                "failed_logins": round(features.get("failed_login_rate", 0) * 10),
                "request_rate": round(features.get("request_rate", 1)),
                "downloads": features.get("suspicious_download_count", 0),
                "response_time": round(features.get("average_response_time_ms", 50))
            })
    else:
        # Generate initial seed baseline points so charts render immediately
        now = datetime.datetime.utcnow()
        for i in range(10, 0, -1):
            t = (now - datetime.timedelta(seconds=i*3)).strftime("%H:%M:%S")
            history.append({
                "time": t,
                "risk": round(device.risk_score),
                "records": features.get("total_records_accessed", 0),
                "exports": features.get("data_export_count", 0),
                "failed_logins": round(features.get("failed_login_rate", 0) * 10),
                "request_rate": round(features.get("request_rate", 1)),
                "downloads": features.get("suspicious_download_count", 0),
                "response_time": round(features.get("average_response_time_ms", 50))
            })

    return {
        "device_info": {
            "device_id": device.device_id,
            "device_name": device.device_name,
            "device_type": device.device_type,
            "ip_address": device.ip_address,
            "vlan": device.vlan,
            "status": device.status,
            "risk_score": device.risk_score,
            "last_seen": device.last_seen,
            "isolation_reason": device.isolation_reason,
            "isolation_time": device.isolation_time,
            "previous_risk": device.previous_risk,
            "attack_active": device.attack_active,
            "attack_type": device.attack_type,
            "attack_intensity": device.attack_intensity,
        },
        "ml_fuses": fusion,
        "features": features,
        "timeline": timeline,
        "history": history
    }

@router.post("/devices/{device_id}/attack/start")
@router.post("/devices/{device_id}/attack")
@router.post("/devices/{device_id}/attack/burst")
def start_device_attack(device_id: str, payload: Optional[AttackStartPayload] = None, db: Session = Depends(get_db)):
    device_id = device_id.upper()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
        
    if device.status == "ISOLATED":
        raise HTTPException(status_code=400, detail="Cannot attack an isolated device")

    attack_type = payload.attack_type if (payload and payload.attack_type) else "DATA_EXFILTRATION"
    intensity = payload.intensity if (payload and payload.intensity) else "HIGH"

    device.attack_active = True
    device.attack_type = attack_type
    device.attack_intensity = intensity
    device.attack_start_time = datetime.datetime.utcnow().isoformat() + "Z"
    
    # Store attack session
    session = AttackSession(
        device_id=device_id,
        attack_type=attack_type,
        intensity=intensity,
        status="ACTIVE",
        start_time=device.attack_start_time
    )
    db.add(session)
    
    # Generate active attack telemetry events
    now_str = device.attack_start_time
    for _ in range(5):
        evt = generate_device_event(device, now_str)
        db.add(evt)
    db.flush()

    # Recalculate 15-D features, FEC, and fusion in real-time
    calculate_single_patient_features(device.device_id, db)
    calculate_single_patient_fec(device.device_id, db)
    fusion_res = calculate_patient_fusion(db, device.device_id)
    device.risk_score = float(fusion_res["detection_score"])
    if device.risk_score >= 75.0:
        device.status = "CRITICAL"
    elif device.risk_score >= 50.0:
        device.status = "HIGH RISK"
    elif device.risk_score >= 25.0:
        device.status = "SUSPICIOUS"
    else:
        device.status = "MONITORING"

    # Add state history record
    history = DeviceStateHistory(
        device_id=device.device_id,
        timestamp=now_str,
        status=device.status,
        risk_score=device.risk_score
    )
    db.add(history)
    db.commit()
    return {"status": "SUCCESS", "message": f"Attack {attack_type} started on device {device_id}"}

@router.post("/devices/{device_id}/attack/stop")
def stop_device_attack(device_id: str, db: Session = Depends(get_db)):
    device_id = device_id.upper()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    device.attack_active = False
    device.attack_type = None
    device.attack_intensity = None
    device.attack_start_time = None
    
    # Complete attack session in db
    session = db.query(AttackSession).filter(
        AttackSession.device_id == device_id,
        AttackSession.status == "ACTIVE"
    ).first()
    if session:
        session.status = "COMPLETED"
        session.end_time = datetime.datetime.utcnow().isoformat() + "Z"

    # Flush anomalous attack events and add baseline events
    db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id.ilike(device.device_id),
        HoneypotSecurityEvent.is_anomalous_baseline == True
    ).delete()

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    for _ in range(5):
        evt = generate_device_event(device, now_str)
        db.add(evt)
    db.flush()

    # Recalculate 15-D features, FEC, and fusion
    calculate_single_patient_features(device.device_id, db)
    calculate_single_patient_fec(device.device_id, db)
    fusion_res = calculate_patient_fusion(db, device.device_id)
    device.risk_score = float(fusion_res["detection_score"])
    device.status = "SECURE" if device.risk_score < 25.0 else "MONITORING"

    # Add state history record
    history = DeviceStateHistory(
        device_id=device.device_id,
        timestamp=now_str,
        status=device.status,
        risk_score=device.risk_score
    )
    db.add(history)
    db.commit()
    return {"status": "SUCCESS", "message": f"Attack stopped on device {device_id}"}

@router.post("/devices/{device_id}/quarantine")
def quarantine_device(device_id: str, payload: Optional[QuarantinePayload] = None, db: Session = Depends(get_db)):
    device_id = device_id.upper()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    reason = payload.reason if (payload and payload.reason) else "Operator Quarantine Isolation"

    # Save current risk and state change
    device.previous_risk = device.risk_score
    device.status = "ISOLATED"
    device.isolation_reason = reason
    device.isolation_time = datetime.datetime.utcnow().isoformat() + "Z"
    
    # If active attack exists, stop it
    device.attack_active = False
    device.attack_type = None
    device.attack_intensity = None
    device.attack_start_time = None
    
    session = db.query(AttackSession).filter(
        AttackSession.device_id == device_id,
        AttackSession.status == "ACTIVE"
    ).first()
    if session:
        session.status = "COMPLETED"
        session.end_time = device.isolation_time

    action = QuarantineAction(
        device_id=device_id,
        action="ISOLATED",
        timestamp=device.isolation_time,
        reason=reason
    )
    db.add(action)

    # Flush active attack events and generate isolated heartbeat events
    db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id.ilike(device.device_id),
        HoneypotSecurityEvent.is_anomalous_baseline == True
    ).delete()

    now_str = device.isolation_time
    for _ in range(3):
        evt = generate_device_event(device, now_str)
        db.add(evt)
    db.flush()

    calculate_single_patient_features(device.device_id, db)
    calculate_single_patient_fec(device.device_id, db)
    
    # Add state history record
    history = DeviceStateHistory(
        device_id=device.device_id,
        timestamp=now_str,
        status="ISOLATED",
        risk_score=device.risk_score
    )
    db.add(history)
    db.commit()
    return {"status": "SUCCESS", "message": f"Device {device_id} quarantined successfully"}

@router.post("/devices/{device_id}/restore")
def restore_device(device_id: str, db: Session = Depends(get_db)):
    device_id = device_id.upper()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")

    device.status = "SECURE"
    device.isolation_reason = None
    device.isolation_time = None
    device.previous_risk = None
    device.attack_active = False
    device.attack_type = None
    device.attack_intensity = None
    device.attack_start_time = None
    
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    action = QuarantineAction(
        device_id=device_id,
        action="RESTORED",
        timestamp=now_str,
        reason="Manual Restoration"
    )
    db.add(action)

    # Delete any lingering attack events and seed clean normal events
    db.query(HoneypotSecurityEvent).filter(
        HoneypotSecurityEvent.patient_id.ilike(device.device_id),
        HoneypotSecurityEvent.is_anomalous_baseline == True
    ).delete()

    for _ in range(5):
        evt = generate_device_event(device, now_str)
        db.add(evt)
    db.flush()

    calculate_single_patient_features(device.device_id, db)
    calculate_single_patient_fec(device.device_id, db)
    fusion_res = calculate_patient_fusion(db, device.device_id)
    device.risk_score = float(fusion_res["detection_score"])
    device.status = "SECURE"

    # Add state history record
    history = DeviceStateHistory(
        device_id=device.device_id,
        timestamp=now_str,
        status="SECURE",
        risk_score=device.risk_score
    )
    db.add(history)
    db.commit()
    return {"status": "SUCCESS", "message": f"Device {device_id} restored to monitoring status"}

@router.get("/devices/telemetry-stream")
async def get_telemetry_stream(request: Request):
    q = Queue()
    add_listener(q)
    
    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                if not q.empty():
                    data = q.get_nowait()
                    yield {
                        "event": "message",
                        "data": json.dumps(data)
                    }
                await asyncio.sleep(0.5)
        finally:
            remove_listener(q)
            
    async def sse_format():
        async for item in event_generator():
            yield f"data: {item['data']}\n\n"

    return StreamingResponse(sse_format(), media_type="text/event-stream")
