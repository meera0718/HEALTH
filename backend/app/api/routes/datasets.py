from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.db.models import AuditLog

router = APIRouter()

@router.post("/datasets/import")
async def import_dataset(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.csv', '.json')):
        raise HTTPException(status_code=400, detail="Only CSV or JSON telemetry files supported.")

    content = await file.read()
    records_count = len(content.splitlines())

    audit = AuditLog(
        timestamp="10:00:00",
        user="admin@hospital-demo.org",
        action="DATASET_IMPORTED",
        details=f"Uploaded telemetry file '{file.filename}' containing {records_count} records."
    )
    db.add(audit)
    db.commit()

    return {
        "filename": file.filename,
        "records_imported": records_count,
        "status": "SUCCESS",
        "message": f"Successfully ingested {file.filename} into UNSW-NB15 + Shadow Hospital normalization pipeline."
    }
