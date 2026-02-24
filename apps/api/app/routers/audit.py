from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import AuditEvent, User
from app.schemas import AuditEventResponse

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=list[AuditEventResponse])
def list_audit_events(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditEventResponse]:
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.org_id == current_user.org_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )

    email_by_user_id = {
        user.id: user.email
        for user in db.query(User).filter(User.org_id == current_user.org_id).all()
    }

    return [
        AuditEventResponse(
            id=event.id,
            action=event.action,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            actor_email=email_by_user_id.get(event.user_id),
            metadata=event.metadata_json,
            created_at=event.created_at,
        )
        for event in events
    ]
