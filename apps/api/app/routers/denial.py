from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.denial_service import build_appeal_letter, build_gap_report, parse_denial_letter
from app.document_service import extract_text, save_document_bytes
from app.models import AuditEvent, Case, CaseDenial, CaseDocument, CaseQuestionnaire, User
from app.routers.cases import _citation_from_dict, _normalized_content_type, _validate_upload_type
from app.schemas import CitationResponse, DenialAnalysisResponse, GapReportItemResponse
from app.template_registry import default_answers, get_service_line_template

from app.deps import get_current_user

router = APIRouter(prefix="/cases", tags=["denial"])


def _get_case_or_404(db: Session, case_id: int, org_id: int) -> Case:
    case = db.query(Case).filter(Case.id == case_id, Case.org_id == org_id).first()
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _get_or_create_questionnaire(db: Session, case: Case, user: User) -> CaseQuestionnaire:
    questionnaire = (
        db.query(CaseQuestionnaire)
        .filter(CaseQuestionnaire.case_id == case.id, CaseQuestionnaire.org_id == case.org_id)
        .first()
    )
    if questionnaire is not None:
        return questionnaire

    template = get_service_line_template(case.service_line_template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported service line template '{case.service_line_template_id}'",
        )

    questionnaire = CaseQuestionnaire(
        case_id=case.id,
        org_id=case.org_id,
        template_id=case.service_line_template_id,
        answers_json=default_answers(template),
        updated_by_user_id=user.id,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(questionnaire)
    db.flush()
    return questionnaire


def _denial_response(case_id: int, denial: CaseDenial) -> DenialAnalysisResponse:
    return DenialAnalysisResponse(
        case_id=case_id,
        denial_document_id=int(denial.denial_document_id or 0),
        reasons=list(denial.reasons_json or []),
        missing_items=list(denial.missing_items_json or []),
        gap_report=[
            GapReportItemResponse(item=item, status="missing")
            for item in list(denial.missing_items_json or [])
        ],
        reference_id=denial.reference_id,
        deadline_text=denial.deadline_text,
        citations=[_citation_from_dict(item) for item in list(denial.citations_json or [])],
        appeal_letter_draft=denial.appeal_letter_draft,
    )


@router.post("/{case_id}/denial/upload", response_model=DenialAnalysisResponse)
async def upload_denial_letter(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DenialAnalysisResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    questionnaire = _get_or_create_questionnaire(db, case, current_user)

    filename = file.filename or "denial-letter"
    content_type = _normalized_content_type(file.content_type or "application/octet-stream")
    _validate_upload_type(filename, content_type)
    max_upload_bytes = max(get_settings().max_upload_bytes, 1)
    content = await file.read(max_upload_bytes + 1)
    if len(content) > max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File too large. Max size is {max_upload_bytes} bytes",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )

    storage_path = save_document_bytes(case_id, filename, content)
    extracted_text = extract_text(content_type, filename, content)

    document = CaseDocument(
        case_id=case.id,
        org_id=current_user.org_id,
        filename=filename,
        content_type=content_type,
        document_kind="denial_letter",
        storage_path=storage_path,
        extracted_text=extracted_text,
        snippets_json=[],
        created_by_user_id=current_user.id,
    )
    db.add(document)
    db.flush()

    parsed = parse_denial_letter(document.id, extracted_text)
    answers = questionnaire.answers_json or {}
    clinical_rationale = str((answers.get("clinical_rationale") or {}).get("value") or "").strip()
    appeal_draft = build_appeal_letter(
        case_id=case.id,
        payer_label=case.payer_label,
        reasons=parsed.reasons,
        missing_items=parsed.missing_items,
        clinical_rationale=clinical_rationale,
        citations=parsed.citations,
    )

    denial = (
        db.query(CaseDenial)
        .filter(CaseDenial.case_id == case.id, CaseDenial.org_id == current_user.org_id)
        .first()
    )
    if denial is None:
        denial = CaseDenial(case_id=case.id, org_id=current_user.org_id, raw_text=extracted_text)

    denial.denial_document_id = document.id
    denial.raw_text = extracted_text
    denial.reasons_json = parsed.reasons
    denial.missing_items_json = parsed.missing_items
    denial.reference_id = parsed.reference_id
    denial.deadline_text = parsed.deadline_text
    denial.citations_json = parsed.citations
    denial.appeal_letter_draft = appeal_draft
    denial.updated_by_user_id = current_user.id
    denial.updated_at = datetime.now(timezone.utc)
    db.add(denial)

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="denial_upload",
            entity_type="case_denial",
            entity_id=str(case.id),
            metadata_json={
                "case_id": case.id,
                "denial_document_id": document.id,
                "reason_count": len(parsed.reasons),
                "missing_item_count": len(parsed.missing_items),
            },
        )
    )

    db.commit()
    db.refresh(denial)

    return DenialAnalysisResponse(
        case_id=case.id,
        denial_document_id=document.id,
        reasons=parsed.reasons,
        missing_items=parsed.missing_items,
        gap_report=[
            GapReportItemResponse(item=item["item"], status=item["status"])
            for item in build_gap_report(parsed.missing_items)
        ],
        reference_id=parsed.reference_id,
        deadline_text=parsed.deadline_text,
        citations=[CitationResponse(**item) for item in parsed.citations],
        appeal_letter_draft=appeal_draft,
    )


@router.get("/{case_id}/denial", response_model=DenialAnalysisResponse)
def get_denial_analysis(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DenialAnalysisResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    denial = (
        db.query(CaseDenial)
        .filter(CaseDenial.case_id == case.id, CaseDenial.org_id == current_user.org_id)
        .first()
    )
    if denial is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No denial letter uploaded"
        )

    return _denial_response(case.id, denial)
