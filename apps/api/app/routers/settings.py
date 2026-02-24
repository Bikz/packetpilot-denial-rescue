from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import AuditEvent, Setting, User
from app.schemas import SettingsResponse, SettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create_settings(db: Session, user: User) -> Setting:
    settings = db.query(Setting).filter(Setting.org_id == user.org_id).first()
    if settings is None:
        settings = Setting(
            org_id=user.org_id,
            deployment_mode="standalone",
            updated_by_user_id=user.id,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(settings)
        db.flush()
    return settings


@router.get("/current", response_model=SettingsResponse)
def get_current_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> SettingsResponse:
    settings = _get_or_create_settings(db, current_user)
    db.commit()

    return SettingsResponse(
        deployment_mode=settings.deployment_mode,
        fhir_base_url=settings.fhir_base_url,
        fhir_auth_type=settings.fhir_auth_type,
        fhir_auth_config=settings.fhir_auth_config,
        model_endpoint=settings.model_endpoint,
        updated_at=settings.updated_at,
    )


@router.put("/current", response_model=SettingsResponse)
def update_current_settings(
    payload: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsResponse:
    settings = _get_or_create_settings(db, current_user)

    settings.deployment_mode = payload.deployment_mode
    settings.fhir_base_url = payload.fhir_base_url
    settings.fhir_auth_type = payload.fhir_auth_type
    settings.fhir_auth_config = payload.fhir_auth_config
    settings.model_endpoint = payload.model_endpoint
    settings.updated_by_user_id = current_user.id
    settings.updated_at = datetime.now(timezone.utc)

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="settings_change",
            entity_type="settings",
            entity_id=str(settings.id),
            metadata_json={
                "deployment_mode": payload.deployment_mode,
                "fhir_base_url": payload.fhir_base_url,
                "fhir_auth_type": payload.fhir_auth_type,
                "model_endpoint": payload.model_endpoint,
            },
        )
    )

    db.commit()
    db.refresh(settings)

    return SettingsResponse(
        deployment_mode=settings.deployment_mode,
        fhir_base_url=settings.fhir_base_url,
        fhir_auth_type=settings.fhir_auth_type,
        fhir_auth_config=settings.fhir_auth_config,
        model_endpoint=settings.model_endpoint,
        updated_at=settings.updated_at,
    )
