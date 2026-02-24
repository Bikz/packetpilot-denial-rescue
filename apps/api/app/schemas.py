from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

RoleType = Literal["coordinator", "clinician", "admin"]
DeploymentMode = Literal["standalone", "smart_on_fhir"]
CaseStatus = Literal["draft", "in_review", "submitted", "denied"]
QuestionnaireFieldState = Literal["missing", "filled", "verified"]


class UserResponse(BaseModel):
    id: int
    org_id: int
    email: EmailStr
    full_name: str
    role: RoleType


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse


class BootstrapStatusResponse(BaseModel):
    needs_bootstrap: bool


class BootstrapRequest(BaseModel):
    organization_name: str = Field(min_length=2, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SettingsResponse(BaseModel):
    deployment_mode: DeploymentMode
    fhir_base_url: str | None = None
    fhir_auth_type: str | None = None
    fhir_auth_config: str | None = None
    model_endpoint: str | None = None
    updated_at: datetime


class SettingsUpdateRequest(BaseModel):
    deployment_mode: DeploymentMode
    fhir_base_url: str | None = None
    fhir_auth_type: str | None = None
    fhir_auth_config: str | None = None
    model_endpoint: str | None = None


class AuditEventResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: str | None
    actor_email: str | None
    metadata: dict[str, Any] | None
    created_at: datetime


class FhirPatientSummaryResponse(BaseModel):
    id: str
    display_name: str
    birth_date: str | None = None
    gender: str | None = None


class FhirPatientSnapshotResponse(BaseModel):
    patient: dict[str, Any]
    coverage: list[dict[str, Any]]
    conditions: list[dict[str, Any]]
    observations: list[dict[str, Any]]
    medicationRequests: list[dict[str, Any]]
    serviceRequests: list[dict[str, Any]]
    documentReferences: list[dict[str, Any]]


class CaseCreateRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=128)
    payer_label: str = Field(min_length=1, max_length=255)
    service_line_template_id: str = Field(min_length=1, max_length=128)


class CaseStatusUpdateRequest(BaseModel):
    status: CaseStatus


class CaseResponse(BaseModel):
    id: int
    org_id: int
    patient_id: str
    payer_label: str
    service_line_template_id: str
    status: CaseStatus
    created_at: datetime
    updated_at: datetime


class QuestionnaireAnswerInput(BaseModel):
    value: str | None = None
    state: QuestionnaireFieldState
    note: str | None = Field(default=None, max_length=2000)


class CaseQuestionnaireUpdateRequest(BaseModel):
    answers: dict[str, QuestionnaireAnswerInput]


class QuestionnaireOptionResponse(BaseModel):
    label: str
    value: str


class QuestionnaireItemResponse(BaseModel):
    field_id: str
    label: str
    type: str
    required: bool
    placeholder: str | None = None
    options: list[QuestionnaireOptionResponse] = Field(default_factory=list)


class QuestionnaireSectionResponse(BaseModel):
    id: str
    title: str
    description: str
    items: list[QuestionnaireItemResponse]


class EvidenceChecklistItemResponse(BaseModel):
    id: str
    label: str
    description: str
    required: bool


class QuestionnaireAnswerResponse(BaseModel):
    value: str | None = None
    state: QuestionnaireFieldState
    note: str | None = None


class CaseQuestionnaireResponse(BaseModel):
    case_id: int
    template_id: str
    required_field_ids: list[str]
    sections: list[QuestionnaireSectionResponse]
    evidence_checklist: list[EvidenceChecklistItemResponse]
    answers: dict[str, QuestionnaireAnswerResponse]
    missing_required_field_ids: list[str]
    attested_at: datetime | None = None
    attested_by_email: str | None = None
    export_enabled: bool
