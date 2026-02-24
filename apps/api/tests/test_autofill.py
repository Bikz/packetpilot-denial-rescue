from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _bootstrap_and_token(client: TestClient) -> str:
    response = client.post(
        "/auth/bootstrap",
        json={
            "organization_name": "Northwind Clinic",
            "full_name": "Alex Kim",
            "email": "admin@northwind.com",
            "password": "super-secret-123",
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _create_case(client: TestClient, token: str) -> int:
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/cases",
        headers=headers,
        json={
            "patient_id": "pat-001",
            "payer_label": "Aetna Gold",
            "service_line_template_id": "imaging-mri-lumbar-spine",
        },
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def test_document_upload_and_autofill_generates_citations(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    document_text = """
Primary diagnosis: Lumbar radiculopathy
Symptom duration (weeks): 12
Neurologic deficit present: yes
Conservative therapy duration (weeks): 8
Physical therapy trial documented: yes
Date of prior imaging: 2025-10-22
Clinical rationale: Persistent neurologic deficits and failed conservative treatment justify MRI authorization.
""".strip()

    upload = client.post(
        f"/cases/{case_id}/documents/upload",
        headers=headers,
        files={"file": ("clinical-note.txt", document_text.encode("utf-8"), "text/plain")},
    )

    assert upload.status_code == 200
    uploaded_doc = upload.json()
    assert uploaded_doc["filename"] == "clinical-note.txt"
    assert "Lumbar radiculopathy" in uploaded_doc["extracted_text"]

    run = client.post(f"/cases/{case_id}/autofill", headers=headers)
    assert run.status_code == 200
    payload = run.json()

    populated = [fill for fill in payload["fills"] if fill["status"] != "missing"]
    assert len(populated) >= 5

    for fill in populated:
        assert fill["citations"]
        for citation in fill["citations"]:
            assert citation["doc_id"] == uploaded_doc["id"]
            assert citation["page"] == 1
            assert citation["end"] > citation["start"]

    questionnaire = client.get(f"/cases/{case_id}/questionnaire", headers=headers)
    assert questionnaire.status_code == 200
    answers = questionnaire.json()["answers"]
    assert answers["primary_diagnosis"]["value"] == "lumbar radiculopathy"
    assert answers["primary_diagnosis"]["state"] == "filled"
    assert answers["clinical_rationale"]["value"]


def test_manual_questionnaire_path_works_without_autofill(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    update = client.put(
        f"/cases/{case_id}/questionnaire",
        headers=headers,
        json={
            "answers": {
                "primary_diagnosis": {
                    "value": "Lumbar radiculopathy",
                    "state": "verified",
                    "note": "Manual chart review",
                }
            }
        },
    )

    assert update.status_code == 200
    assert update.json()["answers"]["primary_diagnosis"]["value"] == "Lumbar radiculopathy"


def test_autofill_requires_evidence_documents(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    denial_text = """
Reference ID: DEN-2026-150
Deadline: 03/10/2026
Please provide:
- Updated clinical note
""".strip()
    denial_upload = client.post(
        f"/cases/{case_id}/denial/upload",
        headers=headers,
        files={"file": ("denial-letter.txt", denial_text.encode("utf-8"), "text/plain")},
    )
    assert denial_upload.status_code == 200

    run = client.post(f"/cases/{case_id}/autofill", headers=headers)
    assert run.status_code == 400
    assert "evidence document" in run.json()["detail"]


def test_autofill_ignores_denial_letters_when_evidence_exists(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    evidence_text = """
Primary diagnosis: Lumbar radiculopathy
Symptom duration (weeks): 10
Neurologic deficit present: yes
Conservative therapy duration (weeks): 6
Physical therapy trial documented: yes
Date of prior imaging: 2025-11-05
Clinical rationale: Persistent deficits despite therapy.
""".strip()
    evidence_upload = client.post(
        f"/cases/{case_id}/documents/upload",
        headers=headers,
        files={"file": ("evidence.txt", evidence_text.encode("utf-8"), "text/plain")},
    )
    assert evidence_upload.status_code == 200
    evidence_doc_id = int(evidence_upload.json()["id"])

    denial_text = """
Denial reason: missing documentation
Primary diagnosis: DENIAL-CONTENT-ONLY
Please provide:
- Updated clinical note
""".strip()
    denial_upload = client.post(
        f"/cases/{case_id}/denial/upload",
        headers=headers,
        files={"file": ("denial-letter.txt", denial_text.encode("utf-8"), "text/plain")},
    )
    assert denial_upload.status_code == 200

    run = client.post(f"/cases/{case_id}/autofill", headers=headers)
    assert run.status_code == 200
    payload = run.json()

    populated = [fill for fill in payload["fills"] if fill["status"] != "missing"]
    assert populated
    for fill in populated:
        for citation in fill["citations"]:
            assert citation["doc_id"] == evidence_doc_id


def test_document_upload_rejects_unsupported_file_type(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}

    upload = client.post(
        f"/cases/{case_id}/documents/upload",
        headers=headers,
        files={"file": ("malicious.exe", b"MZ", "application/octet-stream")},
    )

    assert upload.status_code == 400
    assert "Unsupported file extension" in upload.json()["detail"]


def test_document_upload_rejects_oversized_files(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = _bootstrap_and_token(client)
    case_id = _create_case(client, token)
    headers = {"Authorization": f"Bearer {token}"}
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "32")

    upload = client.post(
        f"/cases/{case_id}/documents/upload",
        headers=headers,
        files={"file": ("large-note.txt", ("x" * 64).encode("utf-8"), "text/plain")},
    )

    assert upload.status_code == 413
    assert "File too large" in upload.json()["detail"]
