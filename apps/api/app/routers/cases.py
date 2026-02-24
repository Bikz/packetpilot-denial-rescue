from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.document_service import detect_relevant_snippets, extract_text, save_document_bytes
from app.db import get_db
from app.deps import get_current_user
from app.fhir_client import FhirClient, FhirClientError
from app.model_service import ModelDocument, get_model_service
from app.models import AuditEvent, Case, CaseAutofill, CaseDocument, CaseQuestionnaire, User
from app.schemas import (
    AutofillFieldFillResponse,
    AutofillRunResponse,
    CaseCreateRequest,
    CaseDocumentListItemResponse,
    CaseDocumentResponse,
    CaseQuestionnaireResponse,
    CaseQuestionnaireUpdateRequest,
    CaseResponse,
    CaseStatusUpdateRequest,
    CitationResponse,
    EvidenceChecklistItemResponse,
    QuestionnaireAnswerResponse,
    QuestionnaireItemResponse,
    QuestionnaireOptionResponse,
    QuestionnaireSectionResponse,
)
from app.template_registry import (
    default_answers,
    get_service_line_template,
    get_template_required_field_ids,
    missing_required_fields,
    validate_answers,
)

router = APIRouter(prefix="/cases", tags=["cases"])


def _normalized_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";", 1)[0].strip().lower()


def _validate_upload_type(filename: str, content_type: str | None) -> None:
    settings = get_settings()
    extension = Path(filename).suffix.lower()
    if extension not in settings.allowed_upload_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{extension or '(none)'}'",
        )

    normalized_type = _normalized_content_type(content_type)
    if normalized_type and normalized_type != "application/octet-stream":
        if normalized_type not in settings.allowed_upload_content_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported content type '{normalized_type}'",
            )


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


def _get_template_or_400(template_id: str) -> dict:
    template = get_service_line_template(template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported service line template '{template_id}'",
        )
    return template


def _get_or_create_case_questionnaire(
    db: Session, case: Case, template: dict, current_user: User
) -> CaseQuestionnaire:
    questionnaire = (
        db.query(CaseQuestionnaire)
        .filter(CaseQuestionnaire.case_id == case.id, CaseQuestionnaire.org_id == case.org_id)
        .first()
    )
    if questionnaire is None:
        questionnaire = CaseQuestionnaire(
            case_id=case.id,
            org_id=case.org_id,
            template_id=case.service_line_template_id,
            answers_json=default_answers(template),
            updated_by_user_id=current_user.id,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(questionnaire)
        db.flush()

    return questionnaire


def _normalize_answers(template: dict, answers: dict | None) -> dict:
    normalized = default_answers(template)
    for field_id, answer in (answers or {}).items():
        if field_id in normalized and isinstance(answer, dict):
            normalized[field_id] = {
                "value": answer.get("value"),
                "state": answer.get("state", "missing"),
                "note": answer.get("note"),
            }
    return normalized


def _questionnaire_response(
    db: Session, case: Case, questionnaire: CaseQuestionnaire, template: dict
) -> CaseQuestionnaireResponse:
    answers = _normalize_answers(template, questionnaire.answers_json)
    missing_required_field_ids = missing_required_fields(template, answers)

    attested_by_email: str | None = None
    if questionnaire.clinician_attested_by_user_id is not None:
        user = (
            db.query(User)
            .filter(
                User.id == questionnaire.clinician_attested_by_user_id, User.org_id == case.org_id
            )
            .first()
        )
        attested_by_email = user.email if user else None

    sections: list[QuestionnaireSectionResponse] = []
    for section in template.get("questionnaire", {}).get("sections", []):
        items: list[QuestionnaireItemResponse] = []
        for item in section.get("items", []):
            options = [
                QuestionnaireOptionResponse(label=option["label"], value=option["value"])
                for option in item.get("options", [])
            ]
            items.append(
                QuestionnaireItemResponse(
                    field_id=item["fieldId"],
                    label=item["label"],
                    type=item["type"],
                    required=bool(item.get("required", False)),
                    placeholder=item.get("placeholder"),
                    options=options,
                )
            )

        sections.append(
            QuestionnaireSectionResponse(
                id=section["id"],
                title=section["title"],
                description=section.get("description", ""),
                items=items,
            )
        )

    evidence_checklist = [
        EvidenceChecklistItemResponse(
            id=item["id"],
            label=item["label"],
            description=item.get("description", ""),
            required=bool(item.get("required", False)),
        )
        for item in template.get("evidenceChecklist", [])
    ]

    return CaseQuestionnaireResponse(
        case_id=case.id,
        template_id=questionnaire.template_id,
        required_field_ids=get_template_required_field_ids(template),
        sections=sections,
        evidence_checklist=evidence_checklist,
        answers={
            field_id: QuestionnaireAnswerResponse(
                value=answer.get("value"),
                state=answer.get("state", "missing"),
                note=answer.get("note"),
            )
            for field_id, answer in answers.items()
        },
        missing_required_field_ids=missing_required_field_ids,
        attested_at=questionnaire.clinician_attested_at,
        attested_by_email=attested_by_email,
        export_enabled=questionnaire.clinician_attested_at is not None,
    )


def _citation_from_dict(citation: dict) -> CitationResponse:
    return CitationResponse(
        doc_id=int(citation.get("doc_id", 0)),
        page=int(citation.get("page", 1)),
        start=int(citation.get("start", 0)),
        end=int(citation.get("end", 0)),
        excerpt=str(citation.get("excerpt", "")),
    )


def _document_response(document: CaseDocument) -> CaseDocumentResponse:
    snippets = [_citation_from_dict(item) for item in (document.snippets_json or [])]
    snippets = [
        CitationResponse(
            doc_id=document.id,
            page=item.page,
            start=item.start,
            end=item.end,
            excerpt=item.excerpt,
        )
        for item in snippets
    ]
    return CaseDocumentResponse(
        id=document.id,
        case_id=document.case_id,
        filename=document.filename,
        content_type=document.content_type,
        document_kind=document.document_kind,
        extracted_text=document.extracted_text,
        snippets=snippets,
        created_at=document.created_at,
    )


def _document_list_item(document: CaseDocument) -> CaseDocumentListItemResponse:
    snippets = [_citation_from_dict(item) for item in (document.snippets_json or [])]
    snippets = [
        CitationResponse(
            doc_id=document.id,
            page=item.page,
            start=item.start,
            end=item.end,
            excerpt=item.excerpt,
        )
        for item in snippets
    ]
    text_preview = document.extracted_text.replace("\n", " ").strip()[:200]
    return CaseDocumentListItemResponse(
        id=document.id,
        case_id=document.case_id,
        filename=document.filename,
        content_type=document.content_type,
        document_kind=document.document_kind,
        text_preview=text_preview,
        snippets=snippets,
        created_at=document.created_at,
    )


def _autofill_response(case_id: int, fills: list[CaseAutofill]) -> AutofillRunResponse:
    sorted_fills = sorted(fills, key=lambda item: item.field_id)
    return AutofillRunResponse(
        case_id=case_id,
        fills=[
            AutofillFieldFillResponse(
                field_id=fill.field_id,
                value=fill.value,
                confidence=fill.confidence,
                status=fill.status,
                citations=[_citation_from_dict(citation) for citation in fill.citations_json],
            )
            for fill in sorted_fills
        ],
    )


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
    template_id = payload.service_line_template_id.strip()
    _get_template_or_400(template_id)

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
        service_line_template_id=template_id,
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


@router.get("/{case_id}/questionnaire", response_model=CaseQuestionnaireResponse)
def get_case_questionnaire(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseQuestionnaireResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    template = _get_template_or_400(case.service_line_template_id)
    questionnaire = _get_or_create_case_questionnaire(db, case, template, current_user)

    if questionnaire.answers_json is None:
        questionnaire.answers_json = default_answers(template)
        db.commit()
        db.refresh(questionnaire)

    return _questionnaire_response(db, case, questionnaire, template)


@router.put("/{case_id}/questionnaire", response_model=CaseQuestionnaireResponse)
def update_case_questionnaire(
    case_id: int,
    payload: CaseQuestionnaireUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseQuestionnaireResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    template = _get_template_or_400(case.service_line_template_id)
    questionnaire = _get_or_create_case_questionnaire(db, case, template, current_user)

    merged_answers = _normalize_answers(template, questionnaire.answers_json)
    for field_id, answer in payload.answers.items():
        merged_answers[field_id] = answer.model_dump()

    validation_errors = validate_answers(template, merged_answers)
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="; ".join(validation_errors),
        )

    questionnaire.answers_json = merged_answers
    questionnaire.updated_by_user_id = current_user.id
    questionnaire.updated_at = datetime.now(timezone.utc)
    questionnaire.clinician_attested_by_user_id = None
    questionnaire.clinician_attested_at = None

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="questionnaire_save",
            entity_type="case",
            entity_id=str(case.id),
            metadata_json={"case_id": case.id, "template_id": questionnaire.template_id},
        )
    )

    db.commit()
    db.refresh(questionnaire)

    return _questionnaire_response(db, case, questionnaire, template)


@router.post("/{case_id}/attest", response_model=CaseQuestionnaireResponse)
def attest_case_questionnaire(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseQuestionnaireResponse:
    if current_user.role != "clinician":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinician users can attest case packets",
        )

    case = _get_case_or_404(db, case_id, current_user.org_id)
    template = _get_template_or_400(case.service_line_template_id)
    questionnaire = _get_or_create_case_questionnaire(db, case, template, current_user)

    answers = _normalize_answers(template, questionnaire.answers_json)
    missing_required_field_ids = missing_required_fields(template, answers)
    if missing_required_field_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Required fields must be completed before attestation: {', '.join(missing_required_field_ids)}",
        )

    questionnaire.clinician_attested_by_user_id = current_user.id
    questionnaire.clinician_attested_at = datetime.now(timezone.utc)
    questionnaire.updated_at = datetime.now(timezone.utc)

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="case_attested",
            entity_type="case",
            entity_id=str(case.id),
            metadata_json={
                "case_id": case.id,
                "template_id": questionnaire.template_id,
                "attested_by": current_user.email,
            },
        )
    )

    db.commit()
    db.refresh(questionnaire)

    return _questionnaire_response(db, case, questionnaire, template)


@router.get("/{case_id}/documents", response_model=list[CaseDocumentListItemResponse])
def list_case_documents(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CaseDocumentListItemResponse]:
    _get_case_or_404(db, case_id, current_user.org_id)
    documents = (
        db.query(CaseDocument)
        .filter(CaseDocument.case_id == case_id, CaseDocument.org_id == current_user.org_id)
        .order_by(CaseDocument.created_at.desc(), CaseDocument.id.desc())
        .all()
    )
    return [_document_list_item(document) for document in documents]


@router.get("/{case_id}/documents/{doc_id}", response_model=CaseDocumentResponse)
def get_case_document(
    case_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDocumentResponse:
    _get_case_or_404(db, case_id, current_user.org_id)
    document = (
        db.query(CaseDocument)
        .filter(
            CaseDocument.id == doc_id,
            CaseDocument.case_id == case_id,
            CaseDocument.org_id == current_user.org_id,
        )
        .first()
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return _document_response(document)


@router.post("/{case_id}/documents/upload", response_model=CaseDocumentResponse)
async def upload_case_document(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDocumentResponse:
    _get_case_or_404(db, case_id, current_user.org_id)

    filename = file.filename or "uploaded-document"
    content_type = file.content_type or "application/octet-stream"
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
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    storage_path = save_document_bytes(case_id, filename, content)
    extracted_text = extract_text(content_type, filename, content)
    snippets = detect_relevant_snippets(extracted_text)

    document = CaseDocument(
        case_id=case_id,
        org_id=current_user.org_id,
        filename=filename,
        content_type=content_type,
        document_kind="evidence",
        storage_path=storage_path,
        extracted_text=extracted_text,
        snippets_json=snippets,
        created_by_user_id=current_user.id,
    )
    db.add(document)
    db.flush()

    document.snippets_json = [
        {
            "doc_id": document.id,
            "page": int(item.get("page", 1)),
            "start": int(item.get("start", 0)),
            "end": int(item.get("end", 0)),
            "excerpt": str(item.get("excerpt", "")),
        }
        for item in snippets
    ]

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="document_upload",
            entity_type="case_document",
            entity_id=str(document.id),
            metadata_json={"case_id": case_id, "filename": filename, "content_type": content_type},
        )
    )

    db.commit()
    db.refresh(document)

    return _document_response(document)


@router.get("/{case_id}/autofill", response_model=AutofillRunResponse)
def get_case_autofill(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutofillRunResponse:
    _get_case_or_404(db, case_id, current_user.org_id)
    fills = (
        db.query(CaseAutofill)
        .filter(CaseAutofill.case_id == case_id, CaseAutofill.org_id == current_user.org_id)
        .order_by(CaseAutofill.field_id.asc())
        .all()
    )
    return _autofill_response(case_id, fills)


@router.post("/{case_id}/autofill", response_model=AutofillRunResponse)
def run_case_autofill(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AutofillRunResponse:
    case = _get_case_or_404(db, case_id, current_user.org_id)
    template = _get_template_or_400(case.service_line_template_id)
    questionnaire = _get_or_create_case_questionnaire(db, case, template, current_user)

    documents = (
        db.query(CaseDocument)
        .filter(
            CaseDocument.case_id == case_id,
            CaseDocument.org_id == current_user.org_id,
            CaseDocument.document_kind == "evidence",
        )
        .order_by(CaseDocument.created_at.asc(), CaseDocument.id.asc())
        .all()
    )
    if not documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload at least one evidence document before running autofill",
        )

    model_documents = [
        ModelDocument(id=document.id, text=document.extracted_text) for document in documents
    ]
    fills = get_model_service().extract_field_fills(model_documents)

    (
        db.query(CaseAutofill)
        .filter(CaseAutofill.case_id == case_id, CaseAutofill.org_id == current_user.org_id)
        .delete()
    )

    saved_fills: list[CaseAutofill] = []
    merged_answers = _normalize_answers(template, questionnaire.answers_json)

    for fill in fills:
        citation_payload = [
            {
                "doc_id": citation.doc_id,
                "page": citation.page,
                "start": citation.start,
                "end": citation.end,
                "excerpt": citation.excerpt,
            }
            for citation in fill.citations
        ]
        source_doc_ids = sorted({item["doc_id"] for item in citation_payload if item["doc_id"]})

        record = CaseAutofill(
            case_id=case_id,
            org_id=current_user.org_id,
            field_id=fill.field_id,
            value=fill.value,
            confidence=fill.confidence,
            status=fill.status,
            citations_json=citation_payload,
            source_doc_ids_json=source_doc_ids,
        )
        db.add(record)
        saved_fills.append(record)

        if fill.status != "missing":
            merged_answers[fill.field_id] = {
                "value": fill.value,
                "state": "filled",
                "note": "Model draft suggestion. Verify before submission.",
            }

    validation_errors = validate_answers(template, merged_answers)
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="; ".join(validation_errors),
        )

    questionnaire.answers_json = merged_answers
    questionnaire.updated_by_user_id = current_user.id
    questionnaire.updated_at = datetime.now(timezone.utc)
    questionnaire.clinician_attested_by_user_id = None
    questionnaire.clinician_attested_at = None

    db.add(
        AuditEvent(
            org_id=current_user.org_id,
            user_id=current_user.id,
            action="autofill_run",
            entity_type="case",
            entity_id=str(case.id),
            metadata_json={
                "case_id": case.id,
                "num_documents": len(documents),
                "num_fields": len(saved_fills),
            },
        )
    )

    db.commit()

    persisted = (
        db.query(CaseAutofill)
        .filter(CaseAutofill.case_id == case_id, CaseAutofill.org_id == current_user.org_id)
        .order_by(CaseAutofill.field_id.asc())
        .all()
    )

    return _autofill_response(case_id, persisted)
