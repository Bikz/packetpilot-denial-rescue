from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

PATIENTS = [
    {
        "resourceType": "Patient",
        "id": "pat-001",
        "name": [{"given": ["Avery"], "family": "Cole"}],
        "gender": "female",
        "birthDate": "1988-04-10",
    },
    {
        "resourceType": "Patient",
        "id": "pat-002",
        "name": [{"given": ["Jordan"], "family": "Shaw"}],
        "gender": "male",
        "birthDate": "1974-11-03",
    },
]

RESOURCE_INDEX = {
    "Coverage": [
        {
            "resourceType": "Coverage",
            "id": "cov-001",
            "beneficiary": {"reference": "Patient/pat-001"},
            "payor": [{"display": "Aetna Gold"}],
            "status": "active",
        }
    ],
    "Condition": [
        {
            "resourceType": "Condition",
            "id": "cond-001",
            "subject": {"reference": "Patient/pat-001"},
            "code": {"text": "Lumbar radiculopathy"},
        }
    ],
    "Observation": [
        {
            "resourceType": "Observation",
            "id": "obs-001",
            "subject": {"reference": "Patient/pat-001"},
            "code": {"text": "Pain score"},
            "status": "final",
            "valueString": "7/10",
        }
    ],
    "MedicationRequest": [
        {
            "resourceType": "MedicationRequest",
            "id": "med-001",
            "subject": {"reference": "Patient/pat-001"},
            "status": "active",
            "medicationCodeableConcept": {"text": "Naproxen"},
        }
    ],
    "ServiceRequest": [
        {
            "resourceType": "ServiceRequest",
            "id": "svc-001",
            "subject": {"reference": "Patient/pat-001"},
            "status": "active",
            "code": {"text": "MRI lumbar spine"},
        }
    ],
    "DocumentReference": [
        {
            "resourceType": "DocumentReference",
            "id": "doc-001",
            "subject": {"reference": "Patient/pat-001"},
            "status": "current",
            "description": "PT trial summary",
        }
    ],
}


def _bundle(resources: list[dict]) -> dict:
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": len(resources),
        "entry": [{"resource": resource} for resource in resources],
    }


class _FhirHandler(BaseHTTPRequestHandler):
    def _write_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/fhir+json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        segments = [segment for segment in parsed.path.split("/") if segment]

        if len(segments) < 2 or segments[0] != "fhir":
            self._write_json(404, {"issue": [{"diagnostics": "not found"}]})
            return

        resource_type = segments[1]
        query = parse_qs(parsed.query)

        if resource_type == "Patient":
            if len(segments) == 3:
                patient = next((item for item in PATIENTS if item["id"] == segments[2]), None)
                if patient is None:
                    self._write_json(404, {"issue": [{"diagnostics": "patient not found"}]})
                    return
                self._write_json(200, patient)
                return

            self._write_json(200, _bundle(PATIENTS))
            return

        resources = RESOURCE_INDEX.get(resource_type)
        if resources is None:
            self._write_json(200, _bundle([]))
            return

        beneficiary = (query.get("beneficiary") or [None])[0]
        patient_id = (query.get("patient") or [None])[0]

        if beneficiary:
            filtered = [
                item
                for item in resources
                if item.get("beneficiary", {}).get("reference") == beneficiary
            ]
        elif patient_id:
            filtered = [
                item
                for item in resources
                if item.get("subject", {}).get("reference") == f"Patient/{patient_id}"
            ]
        else:
            filtered = resources

        self._write_json(200, _bundle(filtered))

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003
        return


@pytest.fixture()
def fhir_base_url() -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FhirHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()

    host, port = server.server_address
    base_url = f"http://{host}:{port}/fhir"

    try:
        yield base_url
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture()
def client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    fhir_base_url: str,
) -> TestClient:
    db_path = tmp_path / "packetpilot-test.db"

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("APP_SECRET", "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz")
    monkeypatch.setenv("FHIR_BASE_URL", fhir_base_url)

    from app.db import init_db, reset_db_engine

    reset_db_engine()
    init_db()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    reset_db_engine()
