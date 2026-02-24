from __future__ import annotations

from fastapi import APIRouter

from app.model_service import get_model_service

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/status")
def model_status() -> dict[str, object]:
    return get_model_service().runtime_status()
