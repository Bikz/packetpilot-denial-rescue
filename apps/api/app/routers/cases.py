from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.fhir_client import FhirClient, FhirClientError
from app.models import AuditEvent, Case, CaseQuestionnaire, User
from app.schemas import (
    CaseCreateRequest,
    CaseQuestionnaireResponse,
    CaseQuestionnaireUpdateRequest,
    CaseResponse,
    CaseStatusUpdateRequest,
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
