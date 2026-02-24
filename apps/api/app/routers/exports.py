from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.db import get_db
from app.denial_service import build_appeal_letter
from app.deps import get_current_user
from app.eval_service import compute_case_metrics
from app.export_service import (
    build_packet_json,
    build_packet_pdf_bytes,
    encode_pdf_base64,
    stable_json,
)
from app.models import (
    AuditEvent,
    Case,
    CaseAutofill,
    CaseDenial,
    CaseDocument,
    CaseExport,
    CaseQuestionnaire,
    User,
)
from app.schemas import PacketExportListItemResponse, PacketExportRequest, PacketExportResponse
from app.template_registry import get_service_line_template, missing_required_fields

router = APIRouter(prefix="/cases", tags=["exports"])


def _get_case_or_404(db: Session, case_id: int, org_id: int) -> Case:
    case = db.query(Case).filter(Case.id == case_id, Case.org_id == org_id).first()
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _get_questionnaire_or_404(db: Session, case_id: int, org_id: int) -> CaseQuestionnaire:
    questionnaire = (
        db.query(CaseQuestionnaire)
        .filter(CaseQuestionnaire.case_id == case_id, CaseQuestionnaire.org_id == org_id)
        .first()
    )
    if questionnaire is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Questionnaire is not initialized for this case",
        )
    return questionnaire


def _load_case_audit_events(db: Session, case: Case, org_id: int) -> list[AuditEvent]:
    document_entity_ids = [
        str(document_id)
        for (document_id,) in db.query(CaseDocument.id)
        .filter(CaseDocument.case_id == case.id, CaseDocument.org_id == org_id)
        .all()
    ]
    export_entity_ids = [
        str(export_id)
        for (export_id,) in db.query(CaseExport.id)
        .filter(CaseExport.case_id == case.id, CaseExport.org_id == org_id)
        .all()
    ]

    filters = [
        and_(AuditEvent.entity_type == "case", AuditEvent.entity_id == str(case.id)),
        and_(AuditEvent.entity_type == "case_denial", AuditEvent.entity_id == str(case.id)),
    ]
    if document_entity_ids:
        filters.append(
            and_(
                AuditEvent.entity_type == "case_document",
                AuditEvent.entity_id.in_(document_entity_ids),
            )
        )
    if export_entity_ids:
        filters.append(
            and_(
                AuditEvent.entity_type == "case_export",
                AuditEvent.entity_id.in_(export_entity_ids),
            )
        )

    return (
        db.query(AuditEvent)
        .filter(AuditEvent.org_id == org_id, or_(*filters))
        .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        .all()
    )


@router.post("/{case_id}/exports/generate", response_model=PacketExportResponse)
def generate_case_export(
    case_id: int,
    payload: PacketExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PacketExportResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    questionnaire = _get_questionnaire_or_404(db, case.id, current_user.org_id)
    template = get_service_line_template(case.service_line_template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported service line template '{case.service_line_template_id}'",
        )

    answers = questionnaire.answers_json or {}
    missing_required = missing_required_fields(template, answers)
    if missing_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Required fields must be complete before export: {', '.join(missing_required)}",
        )
    if questionnaire.clinician_attested_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Clinician attestation is required before export",
        )

    denial = (
        db.query(CaseDenial)
        .filter(CaseDenial.case_id == case.id, CaseDenial.org_id == current_user.org_id)
        .first()
    )
    if payload.export_type == "appeal" and denial is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appeal export requires an uploaded denial letter",
        )

    if payload.export_type == "appeal" and denial is not None:
        refreshed_appeal_draft = build_appeal_letter(
            case_id=case.id,
            payer_label=case.payer_label,
            reasons=list(denial.reasons_json or []),
            missing_items=list(denial.missing_items_json or []),
            clinical_rationale=str(
                (answers.get("clinical_rationale") or {}).get("value") or ""
            ).strip(),
            citations=list(denial.citations_json or []),
        )
        if denial.appeal_letter_draft != refreshed_appeal_draft:
            denial.appeal_letter_draft = refreshed_appeal_draft
            denial.updated_by_user_id = current_user.id
            denial.updated_at = datetime.now(timezone.utc)
            db.add(denial)

    documents = (
        db.query(CaseDocument)
        .filter(CaseDocument.case_id == case.id, CaseDocument.org_id == current_user.org_id)
        .order_by(CaseDocument.id.asc())
        .all()
    )
    autofills = (
        db.query(CaseAutofill)
        .filter(CaseAutofill.case_id == case.id, CaseAutofill.org_id == current_user.org_id)
        .order_by(CaseAutofill.field_id.asc())
        .all()
    )
    audit_events = _load_case_audit_events(db, case, current_user.org_id)
    org_users = (
        db.query(User).filter(User.org_id == current_user.org_id).order_by(User.id.asc()).all()
    )
    users_by_id = {user.id: user for user in org_users}

    created_at = datetime.now(timezone.utc)
    packet_json = stable_json(
        build_packet_json(
            case=case,
            questionnaire=questionnaire,
            documents=documents,
            autofills=autofills,
            audit_events=audit_events,
            users_by_id=users_by_id,
            export_type=payload.export_type,
            denial=denial if payload.export_type == "appeal" else None,
        )
    )
    metrics_json = stable_json(
        compute_case_metrics(
            case=case,
            template=template,
            questionnaire=questionnaire,
            autofills=autofills,
            documents=documents,
            audit_events=audit_events,
        )
    )
    pdf_base64 = encode_pdf_base64(build_packet_pdf_bytes(packet_json))

    export_record = CaseExport(
        case_id=case.id,
        org_id=current_user.org_id,
        export_type=payload.export_type,
        packet_json=packet_json,
        metrics_json=metrics_json,
        pdf_base64=pdf_base64,
        created_by_user_id=current_user.id,
        created_at=created_at,
    )
    db.add(export_record)
    db.flush()

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="packet_export",
            entity_type="case_export",
            entity_id=str(export_record.id),
            metadata_json={
                "case_id": case.id,
                "export_id": export_record.id,
                "export_type": payload.export_type,
                "completeness_score": metrics_json.get("completeness_score"),
            },
        )
    )
    db.commit()
    db.refresh(export_record)

    return PacketExportResponse(
        export_id=export_record.id,
        case_id=case.id,
        export_type=payload.export_type,
        packet_json=export_record.packet_json,
        metrics_json=export_record.metrics_json,
        pdf_base64=export_record.pdf_base64,
        created_at=export_record.created_at,
    )


@router.get("/{case_id}/exports", response_model=list[PacketExportListItemResponse])
def list_case_exports(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PacketExportListItemResponse]:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    exports = (
        db.query(CaseExport)
        .filter(CaseExport.case_id == case.id, CaseExport.org_id == current_user.org_id)
        .order_by(CaseExport.created_at.desc(), CaseExport.id.desc())
        .all()
    )
    return [
        PacketExportListItemResponse(
            export_id=item.id,
            case_id=case.id,
            export_type=item.export_type,  # type: ignore[arg-type]
            metrics_json=item.metrics_json,
            created_at=item.created_at,
        )
        for item in exports
    ]


@router.get("/{case_id}/exports/{export_id}", response_model=PacketExportResponse)
def get_case_export(
    case_id: int,
    export_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PacketExportResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    export_record = (
        db.query(CaseExport)
        .filter(
            CaseExport.id == export_id,
            CaseExport.case_id == case.id,
            CaseExport.org_id == current_user.org_id,
        )
        .first()
    )
    if export_record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    return PacketExportResponse(
        export_id=export_record.id,
        case_id=case.id,
        export_type=export_record.export_type,  # type: ignore[arg-type]
        packet_json=export_record.packet_json,
        metrics_json=export_record.metrics_json,
        pdf_base64=export_record.pdf_base64,
        created_at=export_record.created_at,
    )
