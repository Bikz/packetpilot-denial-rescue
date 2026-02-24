from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.fhir_client import FhirClient, FhirClientError, patient_display_name
from app.models import User
from app.schemas import FhirPatientSnapshotResponse, FhirPatientSummaryResponse

router = APIRouter(prefix="/fhir", tags=["fhir"])


def _status_for_error(exc: FhirClientError) -> int:
    message = str(exc)
    if "status=404" in message:
        return status.HTTP_404_NOT_FOUND
    return status.HTTP_502_BAD_GATEWAY


@router.get("/patients", response_model=list[FhirPatientSummaryResponse])
def list_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FhirPatientSummaryResponse]:
    del db
    del current_user

    client = FhirClient()
    try:
        patients = client.list_patients()
    except FhirClientError as exc:
        raise HTTPException(status_code=_status_for_error(exc), detail=str(exc)) from exc

    return [
        FhirPatientSummaryResponse(
            id=str(patient.get("id", "")),
            display_name=patient_display_name(patient),
            birth_date=patient.get("birthDate"),
            gender=patient.get("gender"),
        )
        for patient in patients
        if patient.get("id")
    ]


@router.get("/patients/{patient_id}/snapshot", response_model=FhirPatientSnapshotResponse)
def get_patient_snapshot(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FhirPatientSnapshotResponse:
    del db
    del current_user

    client = FhirClient()
    try:
        snapshot = client.get_patient_snapshot(patient_id)
    except FhirClientError as exc:
        raise HTTPException(status_code=_status_for_error(exc), detail=str(exc)) from exc

    return FhirPatientSnapshotResponse(**snapshot)
