from fastapi import APIRouter
from app.security_engine.controls_catalog import CONTROLS_CATALOG

router = APIRouter()

@router.get("/controls")
def list_controls():
    return CONTROLS_CATALOG
