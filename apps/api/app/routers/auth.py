from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import AuditEvent, Org, Setting, User
from app.schemas import (
    AuthResponse,
    BootstrapRequest,
    BootstrapStatusResponse,
    LoginRequest,
    UserResponse,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/bootstrap-status", response_model=BootstrapStatusResponse)
def bootstrap_status(db: Session = Depends(get_db)) -> BootstrapStatusResponse:
    user_count = db.query(User).count()
    return BootstrapStatusResponse(needs_bootstrap=user_count == 0)


@router.post("/bootstrap", response_model=AuthResponse)
def bootstrap_admin(payload: BootstrapRequest, db: Session = Depends(get_db)) -> AuthResponse:
    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bootstrap already completed.",
        )

    org = Org(name=payload.organization_name.strip())
    db.add(org)
    db.flush()

    admin = User(
        org_id=org.id,
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        role="admin",
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(admin)
    db.flush()

    settings = Setting(org_id=org.id, deployment_mode="standalone", updated_by_user_id=admin.id)
    db.add(settings)

    db.add(
        AuditEvent(
            org_id=org.id,
            user_id=admin.id,
            action="login",
            entity_type="user",
            entity_id=str(admin.id),
            metadata_json={"reason": "bootstrap"},
        )
    )
    db.commit()

    token = create_access_token(subject=str(admin.id), org_id=org.id, role=admin.role)
    return AuthResponse(
        access_token=token,
        user=UserResponse(
            id=admin.id,
            org_id=admin.org_id,
            email=admin.email,
            full_name=admin.full_name,
            role=admin.role,
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc)
    db.add(
        AuditEvent(
            org_id=user.org_id,
            user_id=user.id,
            action="login",
            entity_type="user",
            entity_id=str(user.id),
            metadata_json={"email": user.email},
        )
    )
    db.commit()

    token = create_access_token(subject=str(user.id), org_id=user.org_id, role=user.role)

    return AuthResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            org_id=user.org_id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
        ),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        org_id=current_user.org_id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
    )
