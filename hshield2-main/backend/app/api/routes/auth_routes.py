import uuid
import json
import base64
import hashlib
import datetime
import threading
from pathlib import Path
from typing import Optional

import numpy as np
import cv2
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import urllib.request
import urllib.error

from app.api.deps import get_db
from app.db.models import AuditLog, UserFaceBiometric, Patient, Investigator
from app.core.config import settings

router = APIRouter()

MATCH_THRESHOLD = 0.75  # Facenet cosine cutoff; raise for stricter matching
FACES_DIR = Path(__file__).resolve().parents[3] / "data" / "faces"  # saved face photos


def _warmup_face_model():
    try:
        from deepface import DeepFace
        blank = np.zeros((160, 160, 3), dtype=np.uint8)
        DeepFace.represent(img_path=blank, model_name="Facenet",
                           detector_backend="opencv", enforce_detection=False)
        print("FACE MODEL READY")
    except Exception as e:
        print("Face warmup failed:", e)


threading.Thread(target=_warmup_face_model, daemon=True).start()


class AccessAttemptPayload(BaseModel):
    event_type: str = "AUTHENTICATION_FAILURE"
    source: str = "SECURE_GATEWAY"
    timestamp: str = ""
    email_attempted: str = ""


class FaceRegistrationPayload(BaseModel):
    account_id: str
    face_image_b64: str = ""
    user_role: Optional[str] = "PATIENT"


class FaceVerificationPayload(BaseModel):
    account_id: str
    face_image_b64: str = ""
    liveness_passed: bool = True


@router.get("/me")
def get_current_user_profile(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")

    token = authorization.split(" ")[1]
    
    # Fallbacks removed

    # If it's a supabase token, allow it
    if token.startswith("hsx_jwt_supabase_"):
        account = token.split("hsx_jwt_supabase_")[1].rsplit("_", 1)[0]
        return {
            "id": f"usr_inv_{account.lower()}",
            "email": account.lower(),
            "name": account.lower(),
            "role": "INVESTIGATOR",
            "authorized": True,
            "session_expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).isoformat(),
        }

    # If it's a face token, try parsing
    if token.startswith("hsx_jwt_face_"):
        parts = token.split("_")
        if len(parts) >= 4:
            account = parts[3].upper()
            
            # Check investigator
            inv = db.query(Investigator).filter(Investigator.account_id == account).first()
            if inv:
                return {
                    "id": f"usr_inv_{account.lower()}",
                    "email": account.lower(),
                    "name": inv.full_name,
                    "role": "INVESTIGATOR",
                    "authorized": True,
                    "session_expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).isoformat(),
                }
            
            # Check patient
            if account.startswith("P") and (account[1:].isdigit() or len(account) == 4):
                pat = db.query(Patient).filter(Patient.patient_id == account).first()
                if pat:
                    return {
                        "id": f"usr_patient_{account.lower()}",
                        "email": f"{account.lower()}@patient.healthx",
                        "name": f"Patient {account}",
                        "role": "PATIENT",
                        "authorized": True,
                        "session_expires": (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).isoformat(),
                    }

            # No doctor demo or fallback checks

    raise HTTPException(status_code=401, detail="Invalid token or user not found")

class PasswordLoginPayload(BaseModel):
    email: str
    password: str

@router.post("/auth/password-login")
def password_login(payload: PasswordLoginPayload, db: Session = Depends(get_db)):
    clean_email = payload.email.strip().lower()
    
    is_inv_default = clean_email == "investigator@gmail.com"
    is_inv_pw = payload.password == "investigate@123"
        
    if is_inv_default and is_inv_pw:
        token = f"hsx_jwt_face_{clean_email}_{int(datetime.datetime.utcnow().timestamp())}"
        inv_rec = db.query(Investigator).filter(Investigator.account_id == "INVESTIGATOR@GMAIL.COM").first()
        return {
            "success": True,
            "user_profile": {
                "id": f"usr_inv_{clean_email}",
                "email": clean_email,
                "name": inv_rec.full_name if inv_rec else "Dr. Alexander Doe",
                "role": "INVESTIGATOR",
                "authorized": True,
                "token": token
            }
        }
    
    # Try Supabase if configured
    if settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY:
        req = urllib.request.Request(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            data=json.dumps({
                "email": clean_email,
                "password": payload.password
            }).encode('utf-8'),
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                pass
        except urllib.error.HTTPError as e:
            _log(db, clean_email, "UNAUTHORIZED_LOGIN_ATTEMPT", f"Password login denied for {clean_email} via Supabase.")
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        # Verify email is in Investigator table
        inv = db.query(Investigator).filter(Investigator.account_id == clean_email.upper()).first()
        if inv:
            token = f"hsx_jwt_face_{clean_email}_{int(datetime.datetime.utcnow().timestamp())}"
            return {
                "success": True,
                "user_profile": {
                    "id": f"usr_inv_{clean_email}",
                    "email": clean_email,
                    "name": inv.full_name,
                    "role": "INVESTIGATOR",
                    "authorized": True,
                    "token": token
                }
            }
        _log(db, clean_email, "UNAUTHORIZED_LOGIN_ATTEMPT", f"Account not in Investigator table: {clean_email}.")
        raise HTTPException(status_code=403, detail="Account not authorized as investigator")

    _log(db, clean_email, "UNAUTHORIZED_LOGIN_ATTEMPT", f"Password login denied for {clean_email}.")
    raise HTTPException(status_code=401, detail="Account not registered")


# ---------------------------------------------------------------- helpers
def _log(db: Session, user: str, action: str, details: str, prefix: str = "HSX") -> str:
    ref_id = f"{prefix}-{uuid.uuid4().hex[:6].upper()}"
    db.add(AuditLog(
        timestamp=datetime.datetime.utcnow().strftime("%H:%M:%S"),
        user=user,
        action=action,
        incident_id="",
        details=f"{details} Ref: {ref_id}",
    ))
    db.commit()
    return ref_id


def _compute_facial_embedding(b64_data: str):
    """Real face embedding (Facenet, 128-D) from a base64 image. Rejects 0 or 2+ faces."""
    from deepface import DeepFace  # lazy import so the server starts fast

    try:
        if "," in b64_data:  # strip "data:image/jpeg;base64,"
            b64_data = b64_data.split(",", 1)[1]
        img = cv2.imdecode(np.frombuffer(base64.b64decode(b64_data), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("bad image")
        reps = DeepFace.represent(
            img_path=img,
            model_name="Facenet",
            detector_backend="opencv",
            enforce_detection=True,
        )
        if len(reps) != 1:
            raise ValueError("need exactly one face")
        vec = reps[0]["embedding"]
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="No single clear face detected. Face the camera in good light and try again.",
        )

    norm = (sum(v * v for v in vec)) ** 0.5 or 1.0
    vec = [v / norm for v in vec]
    return vec, hashlib.sha256(json.dumps(vec).encode()).hexdigest()


def _safe_name(account: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in account.strip().upper())


def _save_face_photo(account: str, b64_data: str) -> None:
    FACES_DIR.mkdir(parents=True, exist_ok=True)
    (FACES_DIR / f"{_safe_name(account)}.jpg").write_bytes(base64.b64decode(b64_data.split(",", 1)[-1]))


def _cosine_similarity(vec1: list, vec2: list) -> float:
    if len(vec1) != len(vec2) or not vec1:
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    n1 = (sum(a * a for a in vec1)) ** 0.5
    n2 = (sum(b * b for b in vec2)) ** 0.5
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


# ---------------------------------------------------------------- routes
@router.post("/auth/register-face")
def register_face_biometric(payload: FaceRegistrationPayload, db: Session = Depends(get_db)):
    account_clean = payload.account_id.strip().upper() if payload.account_id else ""
    if not account_clean:
        raise HTTPException(status_code=400, detail="Account ID is required for face registration")
    if not payload.face_image_b64:
        raise HTTPException(status_code=400, detail="No face image received from camera")

    investigator_rec = db.query(Investigator).filter(Investigator.account_id == account_clean).first()
    is_investigator = investigator_rec is not None

    if not is_investigator:
        _log(db, account_clean.lower(), "UNAUTHORIZED_ACCOUNT_ATTEMPT",
             f"Face registration denied for unregistered account {account_clean}.")
        raise HTTPException(status_code=403, detail="Account not authorized")

    embedding_vec, embedding_hash = _compute_facial_embedding(payload.face_image_b64)
    role = "INVESTIGATOR"

    _save_face_photo(account_clean, payload.face_image_b64)

    existing = db.query(UserFaceBiometric).filter(UserFaceBiometric.account_id == account_clean).first()
    if existing:
        existing.face_embedding_hash = embedding_hash
        existing.biometric_features_json = json.dumps(embedding_vec)
        existing.updated_at = datetime.datetime.utcnow()
    else:
        db.add(UserFaceBiometric(
            account_id=account_clean,
            user_role=role,
            face_embedding_hash=embedding_hash,
            biometric_features_json=json.dumps(embedding_vec),
        ))

    _log(db, account_clean.lower(), "FACE_BIOMETRIC_REGISTERED",
         f"Facial biometric template registered for account {account_clean}.", prefix="HSX-REG")

    return {
        "success": True,
        "message": f"Face template registered successfully for account {account_clean}",
        "account_id": account_clean,
        "registered_at": datetime.datetime.utcnow().isoformat() + "Z",
    }


@router.get("/auth/face-status/{account_id}")
def check_face_registration_status(account_id: str, db: Session = Depends(get_db)):
    account_clean = account_id.strip().upper()
    existing = db.query(UserFaceBiometric).filter(UserFaceBiometric.account_id == account_clean).first()
    return {"registered": existing is not None, "account_id": account_clean}


@router.post("/auth/verify-face")
def verify_face_login(payload: FaceVerificationPayload, db: Session = Depends(get_db)):
    account_clean = payload.account_id.strip().upper() if payload.account_id else ""
    account_lower = payload.account_id.strip().lower() if payload.account_id else ""

    if not account_clean:
        raise HTTPException(status_code=400, detail="Account ID or Username is required for face verification")

    if not payload.liveness_passed:
        _log(db, account_lower, "FACE_LIVENESS_FAILURE",
             f"Face liveness verification failed during face login attempt for {account_clean}.")
        raise HTTPException(status_code=401, detail="Liveness check failed. Facial motion/blink not verified.")

    if not payload.face_image_b64:
        raise HTTPException(status_code=400, detail="No face image received from camera")

    registered_bio = db.query(UserFaceBiometric).filter(UserFaceBiometric.account_id == account_clean).first()
    if not registered_bio:
        _log(db, account_lower, "UNREGISTERED_FACE_LOGIN_DENIED",
             f"Face login denied for {account_clean}: No registered face template in database.")
        raise HTTPException(
            status_code=403,
            detail=f"FACE LOGIN DENIED: No registered face template found for account {account_clean}. "
                   f"You must click 'Register Face' first.",
        )

    investigator_rec = db.query(Investigator).filter(Investigator.account_id == account_clean).first()
    is_investigator = investigator_rec is not None

    if not is_investigator:
        _log(db, account_lower, "UNREGISTERED_ACCOUNT_LOGIN_DENIED",
             f"Face login denied for {account_clean}: Account not registered.")
        raise HTTPException(
            status_code=403,
            detail=f"FACE LOGIN DENIED: Account not registered.",
        )

    # Real comparison: live face vs registered face
    live_vec, _ = _compute_facial_embedding(payload.face_image_b64)
    try:
        registered_vec = json.loads(registered_bio.biometric_features_json)
    except Exception:
        registered_vec = []

    similarity = _cosine_similarity(live_vec, registered_vec)

    if similarity < MATCH_THRESHOLD:
        _log(db, account_lower, "FACE_BIOMETRIC_MISMATCH",
             f"Facial biometric mismatch for {account_clean} (Match Similarity: {similarity*100:.1f}%).")
        raise HTTPException(
            status_code=401,
            detail=f"FACE LOGIN DENIED: Captured face does not match the registered face "
                   f"for account {account_clean} (Match Score: {similarity*100:.1f}%).",
        )

    _log(db, account_lower, "FACE_LOGIN_SUCCESS",
         f"Face login succeeded for {account_clean} (Match Similarity: {similarity*100:.1f}%).")

    token = f"hsx_jwt_face_{account_clean.lower()}_{int(datetime.datetime.utcnow().timestamp())}"

    profile = {
            "id": f"usr_inv_{account_clean.lower()}",
            "email": account_lower,
            "name": investigator_rec.full_name,
            "role": "INVESTIGATOR",
            "authorized": True,
            "token": token,
            "auth_method": "FACE_DETECTION",
        }

    return {
        "success": True,
        "message": f"Face verification successful for {account_clean}",
        "confidence_score": float(round(similarity * 100, 1)),
        "user_profile": profile,
        "token": token,
    }


@router.post("/security/access-attempts")
def log_security_access_attempt(payload: AccessAttemptPayload, db: Session = Depends(get_db)):
    ref_id = _log(
        db,
        payload.email_attempted or "unauthenticated@gateway",
        payload.event_type,
        f"Access attempt logged from {payload.source}.",
    )
    return {"recorded": True, "reference_id": ref_id, "status": "LOGGED"}


@router.get("/auth/face-image/{account_id}")
def get_face_image(account_id: str):
    f = FACES_DIR / f"{_safe_name(account_id)}.jpg"
    if not f.exists():
        raise HTTPException(status_code=404, detail="No face image")
    return FileResponse(f, media_type="image/jpeg")


@router.get("/auth/faces")
def list_registered_faces(db: Session = Depends(get_db)):
    rows = db.query(UserFaceBiometric).all()
    # Join with investigators to get the display_id and name, or patient
    out = []
    for r in rows:
        display_id = r.account_id
        full_name = r.account_id
        email = ""
        inv = db.query(Investigator).filter(Investigator.account_id == r.account_id).first()
        if inv:
            display_id = inv.display_id
            full_name = inv.full_name
            email = inv.email
        out.append({
            "account_id": r.account_id,
            "email": email,
            "display_id": display_id,
            "full_name": full_name,
            "role": r.user_role,
            "registered_at": r.registered_at.isoformat() if r.registered_at else None,
            "photo_url": f"/api/v1/auth/face-image/{r.account_id}"
        })
    return out


@router.delete("/auth/face/{account_id}")
def delete_face(account_id: str, db: Session = Depends(get_db)):
    acc = account_id.strip().upper()
    (FACES_DIR / f"{_safe_name(acc)}.jpg").unlink(missing_ok=True)
    rec = db.query(UserFaceBiometric).filter(UserFaceBiometric.account_id == acc).first()
    if rec:
        db.delete(rec)
        db.commit()
    _log(db, acc.lower(), "FACE_BIOMETRIC_DELETED", f"Face data deleted for {acc}.")
    return {"deleted": True, "account_id": acc}


class InvestigatorPayload(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "Security Analyst"


@router.get("/auth/investigators")
def list_investigators(db: Session = Depends(get_db)):
    rows = db.query(Investigator).order_by(Investigator.display_id).all()
    return [{
        "account_id": r.account_id,
        "email": r.email,
        "display_id": r.display_id,
        "full_name": r.full_name,
        "created_at": r.created_at.isoformat()
    } for r in rows]


def _require_investigator(authorization: str, db: Session):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ")[1]
    
    if token.startswith("hsx_jwt_investigator_token"):
        return
    
    if token.startswith("hsx_jwt_face_"):
        parts = token.split("_")
        if len(parts) >= 4:
            account = parts[3].upper()
            if db.query(Investigator).filter(Investigator.account_id == account).first():
                return
    
    raise HTTPException(status_code=403, detail="Requires INVESTIGATOR role")


@router.post("/auth/investigators")
def add_investigator(payload: InvestigatorPayload, authorization: str = Header(None), db: Session = Depends(get_db)):
    _require_investigator(authorization, db)
    acc = payload.email.strip().upper()
    if not acc or not payload.full_name or not payload.password:
        raise HTTPException(status_code=400, detail="Missing fields")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not "@" in acc:
        raise HTTPException(status_code=400, detail="Invalid email format")
        
    existing = db.query(Investigator).filter(Investigator.account_id == acc).first()
    if existing:
        raise HTTPException(status_code=409, detail="Investigator already exists in local DB")
        
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        req = urllib.request.Request(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json"
            },
            data=json.dumps({
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": payload.full_name,
                    "role": payload.role if payload.role in ["Security Analyst", "Incident Responder", "Administrator"] else "Security Analyst"
                }
            }).encode('utf-8'),
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as response:
                pass
        except urllib.error.HTTPError as e:
            if e.code == 422:
                err_text = e.read().decode('utf-8')
                if "already registered" in err_text.lower() or "already exists" in err_text.lower():
                    raise HTTPException(status_code=409, detail="Email already exists in Supabase")
            raise HTTPException(status_code=400, detail=f"Supabase Admin error: {e.read().decode('utf-8')}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error contacting Supabase: {str(e)}")

    # Find the next free display_id
    all_invs = db.query(Investigator).all()
    max_num = 0
    for inv in all_invs:
        if inv.display_id and inv.display_id.startswith("INV-"):
            try:
                num = int(inv.display_id.split("-")[1])
                max_num = max(max_num, num)
            except:
                pass
    next_display_id = f"INV-{max_num + 1:03d}"

    db.add(Investigator(
        account_id=acc,
        email=payload.email.lower(),
        display_id=next_display_id,
        full_name=payload.full_name
    ))
    _log(db, "admin", "INVESTIGATOR_ADDED", f"Added investigator {acc} as {next_display_id}")
    db.commit()
    return {"success": True, "account_id": acc, "display_id": next_display_id}


@router.delete("/auth/investigators/{account_id}")
def remove_investigator(account_id: str, authorization: str = Header(None), db: Session = Depends(get_db)):
    _require_investigator(authorization, db)
    acc = account_id.strip().upper()
    inv = db.query(Investigator).filter(Investigator.account_id == acc).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Delete face record and photo
    (FACES_DIR / f"{_safe_name(acc)}.jpg").unlink(missing_ok=True)
    rec = db.query(UserFaceBiometric).filter(UserFaceBiometric.account_id == acc).first()
    if rec:
        db.delete(rec)
    db.delete(inv)
    _log(db, "admin", "INVESTIGATOR_REMOVED", f"Removed investigator {acc}")
    db.commit()
    return {"success": True, "account_id": acc}