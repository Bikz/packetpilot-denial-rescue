from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import audit, auth, cases, denial, exports, fhir, model, settings


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="PacketPilot API", version="0.2.0", lifespan=app_lifespan)

runtime_settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=runtime_settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(denial.router)
app.include_router(exports.router)
app.include_router(model.router)
