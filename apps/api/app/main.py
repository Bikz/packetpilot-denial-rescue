from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import audit, auth, cases, fhir, settings

app = FastAPI(title="PacketPilot API", version="0.2.0")

runtime_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=runtime_settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "packetpilot-api",
        "version": app.version,
    }


app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(audit.router)
app.include_router(fhir.router)
app.include_router(cases.router)
