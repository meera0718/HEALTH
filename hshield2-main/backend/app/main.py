from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import engine, Base, SessionLocal
from app.db.seeds import seed_database
from app.api.routes import datasets, auth_routes, patients, deception, honeypot, features, fec, ml_ocsvm, ml_isolation_forest, ml_xgboost, detection, devices, reporting, health, fusion, vector_routes, digital_twin

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Ensure 'synthetic' column exists (SQLite lightweight migration)
from sqlalchemy import text
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE security_events ADD COLUMN synthetic BOOLEAN DEFAULT 0"))
except Exception:
    pass

# Seed database on startup if empty
db = SessionLocal()
try:
    seed_database(db)
    from app.db.models import PatientFeature, PatientFEC
    if db.query(PatientFeature).count() == 0:
        from app.security_engine.feature_engine import calculate_all_patient_features
        calculate_all_patient_features(db)
    if db.query(PatientFEC).count() == 0:
        from app.security_engine.fec_engine import calculate_all_patient_fec
        calculate_all_patient_fec(db)
finally:
    db.close()

# Start continuous medical device telemetry loop (Singleton Thread Guarded)
from app.security_engine.telemetry_generator import start_telemetry_generator
start_telemetry_generator(SessionLocal)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Deterministic Healthcare Cybersecurity Investigation & Defense Validation Platform API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes under API_V1_STR (/api/v1) and root /api
app.include_router(devices.router, prefix=settings.API_V1_STR, tags=["devices"])
app.include_router(reporting.router, prefix=settings.API_V1_STR, tags=["reporting"])
app.include_router(datasets.router, prefix=settings.API_V1_STR, tags=["datasets"])
app.include_router(auth_routes.router, prefix=settings.API_V1_STR, tags=["auth"])
app.include_router(patients.router, prefix=settings.API_V1_STR, tags=["patients"])
app.include_router(deception.router, prefix=settings.API_V1_STR, tags=["deception"])
app.include_router(honeypot.router, prefix=settings.API_V1_STR, tags=["honeypot"])
app.include_router(features.router, prefix=settings.API_V1_STR, tags=["features"])
app.include_router(fec.router, prefix=settings.API_V1_STR, tags=["fec"])
app.include_router(fusion.router, prefix=settings.API_V1_STR, tags=["fusion"])
app.include_router(ml_ocsvm.router, prefix=settings.API_V1_STR, tags=["ml_ocsvm"])
app.include_router(ml_isolation_forest.router, prefix=settings.API_V1_STR, tags=["ml_isolation_forest"])
app.include_router(ml_xgboost.router, prefix=settings.API_V1_STR, tags=["ml_xgboost"])
app.include_router(detection.router, prefix=settings.API_V1_STR, tags=["detection"])
app.include_router(vector_routes.router, prefix=settings.API_V1_STR, tags=["vector"])
app.include_router(health.router, prefix=settings.API_V1_STR, tags=["health"])
app.include_router(digital_twin.router, prefix=settings.API_V1_STR, tags=["digital-twin"])

# Direct legacy / fallback aliases for root endpoints
app.include_router(devices.router, prefix="/api", tags=["devices-legacy"])
app.include_router(reporting.router, prefix="/api", tags=["reporting-legacy"])
app.include_router(datasets.router, prefix="/api", tags=["datasets-legacy"])
app.include_router(auth_routes.router, prefix="/api", tags=["auth-legacy"])
app.include_router(patients.router, prefix="/api", tags=["patients-legacy"])
app.include_router(deception.router, prefix="/api", tags=["deception-legacy"])
app.include_router(honeypot.router, prefix="/api", tags=["honeypot-legacy"])
app.include_router(features.router, prefix="/api", tags=["features-legacy"])
app.include_router(fec.router, prefix="/api", tags=["fec-legacy"])
app.include_router(fusion.router, prefix="/api", tags=["fusion-legacy"])
app.include_router(ml_ocsvm.router, prefix="/api", tags=["ml_ocsvm-legacy"])
app.include_router(ml_isolation_forest.router, prefix="/api", tags=["ml_isolation_forest-legacy"])
app.include_router(ml_xgboost.router, prefix="/api", tags=["ml_xgboost-legacy"])
app.include_router(detection.router, prefix="/api", tags=["detection-legacy"])
app.include_router(vector_routes.router, prefix="/api", tags=["vector-legacy"])
app.include_router(health.router, prefix="/api", tags=["health-legacy"])
app.include_router(digital_twin.router, prefix="/api", tags=["digital-twin-legacy"])

@app.get("/")
def root():
    return {
        "status": "ONLINE",
        "platform": settings.PROJECT_NAME,
        "version": "2.0.0",
        "docs": "/docs",
        "architecture": "Deterministic-First Security Engine + Isolated AI Defense Recommendation Service"
    }
