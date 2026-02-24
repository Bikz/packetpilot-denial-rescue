from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.fhir_client import FhirClient, FhirClientError
from app.models import AuditEvent, Case, User
from app.schemas import CaseCreateRequest, CaseResponse, CaseStatusUpdateRequest

router = APIRouter(prefix="/cases", tags=["cases"])


def _case_response(case: Case) -> CaseResponse:
    return CaseResponse(
        id=case.id,
        org_id=case.org_id,
        patient_id=case.patient_id,
        payer_label=case.payer_label,
        service_line_template_id=case.service_line_template_id,
        status=case.status,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def _get_case_or_404(db: Session, case_id: int, org_id: int) -> Case:
    case = db.query(Case).filter(Case.id == case_id, Case.org_id == org_id).first()
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


@router.get("", response_model=list[CaseResponse])
def list_cases(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[CaseResponse]:
    cases = (
        db.query(Case)
        .filter(Case.org_id == current_user.org_id)
        .order_by(Case.updated_at.desc(), Case.id.desc())
        .all()
    )
    return [_case_response(case) for case in cases]


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    return _case_response(case)


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    fhir = FhirClient()
    try:
        fhir.get_patient(payload.patient_id)
    except FhirClientError as exc:
        detail = "Patient not found in FHIR sandbox" if "status=404" in str(exc) else str(exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from exc

    case = Case(
        org_id=current_user.org_id,
        patient_id=payload.patient_id,
        payer_label=payload.payer_label.strip(),
        service_line_template_id=payload.service_line_template_id.strip(),
        status="draft",
        created_by_user_id=current_user.id,
    )

    db.add(case)
    db.flush()

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="case_create",
            entity_type="case",
            entity_id=str(case.id),
            metadata_json={
                "patient_id": case.patient_id,
                "payer_label": case.payer_label,
                "service_line_template_id": case.service_line_template_id,
                "status": case.status,
            },
        )
    )

    db.commit()
    db.refresh(case)

    return _case_response(case)


@router.patch("/{case_id}/status", response_model=CaseResponse)
def update_case_status(
    case_id: int,
    payload: CaseStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    case.status = payload.status
    case.updated_at = datetime.now(timezone.utc)

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="case_status_change",
            entity_type="case",
            entity_id=str(case.id),
            metadata_json={"status": payload.status},
        )
    )

    db.commit()
    db.refresh(case)

    return _case_response(case)
