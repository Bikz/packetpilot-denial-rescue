from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class FhirClientError(RuntimeError):
    pass


DEMO_PATIENTS: list[dict[str, Any]] = [
    {
        "resourceType": "Patient",
        "id": "pat-001",
        "name": [{"text": "Alex Morgan"}],
        "gender": "female",
        "birthDate": "1985-01-16",
    },
    {
        "resourceType": "Patient",
        "id": "demo-001",
        "name": [{"text": "Ava Thompson"}],
        "gender": "female",
        "birthDate": "1986-04-12",
    },
    {
        "resourceType": "Patient",
        "id": "demo-002",
        "name": [{"text": "Noah Patel"}],
        "gender": "male",
        "birthDate": "1979-09-03",
    },
]


def demo_patient_by_id(patient_id: str) -> dict[str, Any] | None:
    for patient in DEMO_PATIENTS:
        if patient.get("id") == patient_id:
            return patient
    return None


class FhirClient:
    def __init__(self, base_url: str | None = None, timeout_seconds: float | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.fhir_base_url).rstrip("/")
        self.timeout_seconds = timeout_seconds or settings.fhir_timeout_seconds

    def _bundle_resources(
        self, resource_type: str, search: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        params = {"_count": "50"}
        if search:
            params.update(search)

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.get(
                    f"{self.base_url}/{resource_type}",
                    params=params,
                    headers={"Accept": "application/fhir+json, application/json"},
                )
        except httpx.RequestError as exc:
            raise FhirClientError(
                f"Unable to fetch {resource_type}: transport_error={exc}"
            ) from exc

        if response.status_code != 200:
            raise FhirClientError(
                f"Unable to fetch {resource_type}: status={response.status_code} body={response.text}"
            )

        bundle = response.json()
        return [entry.get("resource", {}) for entry in bundle.get("entry", [])]

    def _resource_by_id(self, resource_type: str, resource_id: str) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.get(
                    f"{self.base_url}/{resource_type}/{resource_id}",
                    headers={"Accept": "application/fhir+json, application/json"},
                )
        except httpx.RequestError as exc:
            raise FhirClientError(
                f"Unable to fetch {resource_type}/{resource_id}: transport_error={exc}"
            ) from exc

        if response.status_code != 200:
            raise FhirClientError(
                f"Unable to fetch {resource_type}/{resource_id}: status={response.status_code}"
            )

        return response.json()

    def list_patients(self) -> list[dict[str, Any]]:
        return self._bundle_resources("Patient")

    def get_patient(self, patient_id: str) -> dict[str, Any]:
        return self._resource_by_id("Patient", patient_id)

    def get_patient_snapshot(self, patient_id: str) -> dict[str, Any]:
        return {
            "patient": self._resource_by_id("Patient", patient_id),
            "coverage": self._bundle_resources(
                "Coverage", {"beneficiary": f"Patient/{patient_id}"}
            ),
            "conditions": self._bundle_resources("Condition", {"patient": patient_id}),
            "observations": self._bundle_resources("Observation", {"patient": patient_id}),
            "medicationRequests": self._bundle_resources(
                "MedicationRequest", {"patient": patient_id}
            ),
            "serviceRequests": self._bundle_resources("ServiceRequest", {"patient": patient_id}),
            "documentReferences": self._bundle_resources(
                "DocumentReference", {"patient": patient_id}
            ),
        }


def patient_display_name(patient: dict[str, Any]) -> str:
    names = patient.get("name") or []
    if names:
        first = names[0]
        text = first.get("text")
        if text:
            return str(text)

        given = " ".join(first.get("given") or [])
        family = first.get("family") or ""
        assembled = f"{given} {family}".strip()
        if assembled:
            return assembled

    return patient.get("id") or "Unknown Patient"
