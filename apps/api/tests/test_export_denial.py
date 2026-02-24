from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from app.db import get_session_local
from app.models import User
from app.security import hash_password


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


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _create_clinician_user() -> None:
    session_local = get_session_local()
    db = session_local()
    try:
        admin = db.query(User).filter(User.email == "admin@northwind.com").first()
        assert admin is not None

        existing = db.query(User).filter(User.email == "clinician@northwind.com").first()
        if existing:
            return

        clinician = User(
            org_id=admin.org_id,
            email="clinician@northwind.com",
            full_name="Case Clinician",
            role="clinician",
            password_hash=hash_password("clinician-secret-123"),
        )
        db.add(clinician)
        db.commit()
    finally:
        db.close()


def _create_case(client: TestClient, token: str) -> int:
    response = client.post(
        "/cases",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "patient_id": "pat-001",
            "payer_label": "Aetna Gold",
            "service_line_template_id": "imaging-mri-lumbar-spine",
        },
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _upload_evidence(client: TestClient, token: str, case_id: int) -> None:
    document_text = """
Primary diagnosis: Lumbar radiculopathy
Symptom duration (weeks): 12
Neurologic deficit present: yes
Conservative therapy duration (weeks): 8
Physical therapy trial documented: yes
Date of prior imaging: 2025-10-22
Clinical rationale: Persistent neurologic deficits and failed conservative treatment justify MRI authorization.
""".strip()
    response = client.post(
        f"/cases/{case_id}/documents/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("clinical-note.txt", document_text.encode("utf-8"), "text/plain")},
    )
    assert response.status_code == 200


def _attest_case(client: TestClient, clinician_token: str, case_id: int) -> None:
    response = client.post(
        f"/cases/{case_id}/attest",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert response.status_code == 200


def test_generate_initial_export_schema(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    _create_clinician_user()
    clinician_token = _login(client, "clinician@northwind.com", "clinician-secret-123")
    case_id = _create_case(client, admin_token)

    _upload_evidence(client, admin_token, case_id)
    run = client.post(
        f"/cases/{case_id}/autofill", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert run.status_code == 200

    _attest_case(client, clinician_token, case_id)

    export = client.post(
        f"/cases/{case_id}/exports/generate",
        headers={"Authorization": f"Bearer {clinician_token}"},
        json={"export_type": "initial"},
    )
    assert export.status_code == 200
    payload = export.json()

    assert payload["case_id"] == case_id
    assert payload["export_type"] == "initial"
    assert "case_header" in payload["packet_json"]
    assert "questionnaire" in payload["packet_json"]
    assert "audit_log_summary" in payload["packet_json"]
    assert "completeness_score" in payload["metrics_json"]
    assert "instrumentation_events" in payload["metrics_json"]

    pdf_bytes = base64.b64decode(payload["pdf_base64"])
    assert pdf_bytes.startswith(b"%PDF")

    listed = client.get(
        f"/cases/{case_id}/exports",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert listed.status_code == 200
    listed_payload = listed.json()
    assert listed_payload
    first = listed_payload[0]
    assert "pdf_base64" not in first
    assert "packet_json" not in first
    assert first["export_id"] == payload["export_id"]

    detail = client.get(
        f"/cases/{case_id}/exports/{payload['export_id']}",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["export_id"] == payload["export_id"]
    assert detail_payload["packet_json"] == payload["packet_json"]
    assert detail_payload["pdf_base64"] == payload["pdf_base64"]

    repeat = client.post(
        f"/cases/{case_id}/exports/generate",
        headers={"Authorization": f"Bearer {clinician_token}"},
        json={"export_type": "initial"},
    )
    assert repeat.status_code == 200
    repeat_payload = repeat.json()
    assert repeat_payload["packet_json"] == payload["packet_json"]
    assert repeat_payload["metrics_json"] == payload["metrics_json"]
    assert repeat_payload["pdf_base64"] == payload["pdf_base64"]


def test_denial_to_appeal_export_schema(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    _create_clinician_user()
    clinician_token = _login(client, "clinician@northwind.com", "clinician-secret-123")
    case_id = _create_case(client, admin_token)

    _upload_evidence(client, admin_token, case_id)
    run = client.post(
        f"/cases/{case_id}/autofill", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert run.status_code == 200
    _attest_case(client, clinician_token, case_id)

    denial_text = """
Reference ID: DEN-2026-041
Deadline: 03/10/2026
Denial reason: Medical necessity was not established due to missing documentation.
Please provide:
- Updated clinical note
- Prior imaging report
- Conservative therapy documentation
""".strip()
    denial = client.post(
        f"/cases/{case_id}/denial/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("denial-letter.txt", denial_text.encode("utf-8"), "text/plain")},
    )
    assert denial.status_code == 200
    denial_payload = denial.json()
    assert denial_payload["reasons"]
    assert denial_payload["missing_items"]
    assert denial_payload["appeal_letter_draft"]
    assert denial_payload["deadline_text"] == "03/10/2026"
    assert any(item["status"] == "resolved" for item in denial_payload["gap_report"])

    appeal = client.post(
        f"/cases/{case_id}/exports/generate",
        headers={"Authorization": f"Bearer {clinician_token}"},
        json={"export_type": "appeal"},
    )
    assert appeal.status_code == 200
    appeal_payload = appeal.json()

    assert appeal_payload["export_type"] == "appeal"
    assert "denial" in appeal_payload["packet_json"]
    assert appeal_payload["packet_json"]["denial"]["appeal_letter_draft"]


def test_appeal_draft_refreshes_with_latest_clinical_rationale(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    _create_clinician_user()
    clinician_token = _login(client, "clinician@northwind.com", "clinician-secret-123")
    case_id = _create_case(client, admin_token)

    _upload_evidence(client, admin_token, case_id)
    run = client.post(
        f"/cases/{case_id}/autofill", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert run.status_code == 200
    _attest_case(client, clinician_token, case_id)

    denial_text = """
Reference ID: DEN-2026-900
Deadline: 03/21/2026
Denial reason: Medical necessity was not established due to missing documentation.
Please provide:
- Updated clinical note
""".strip()
    denial = client.post(
        f"/cases/{case_id}/denial/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("denial-letter.txt", denial_text.encode("utf-8"), "text/plain")},
    )
    assert denial.status_code == 200

    updated_rationale = "Updated rationale with neurologic deficits documented at follow-up."
    update_answers = client.put(
        f"/cases/{case_id}/questionnaire",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "answers": {
                "clinical_rationale": {
                    "value": updated_rationale,
                    "state": "verified",
                    "note": "Updated after denial review",
                }
            }
        },
    )
    assert update_answers.status_code == 200

    _attest_case(client, clinician_token, case_id)
    appeal = client.post(
        f"/cases/{case_id}/exports/generate",
        headers={"Authorization": f"Bearer {clinician_token}"},
        json={"export_type": "appeal"},
    )
    assert appeal.status_code == 200
    draft = appeal.json()["packet_json"]["denial"]["appeal_letter_draft"]
    assert updated_rationale in draft
