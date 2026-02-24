from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

RoleType = Literal["coordinator", "clinician", "admin"]
DeploymentMode = Literal["standalone", "smart_on_fhir"]
CaseStatus = Literal["draft", "in_review", "submitted", "denied"]


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
