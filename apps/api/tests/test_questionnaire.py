from __future__ import annotations

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


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_questionnaire_validation_rejects_unknown_fields(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    case_id = _create_case(client, admin_token)

    response = client.put(
        f"/cases/{case_id}/questionnaire",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "answers": {
                "unknown_field": {
                    "value": "something",
                    "state": "filled",
                    "note": None,
                }
            }
        },
    )

    assert response.status_code == 422
    assert "Unknown field IDs" in response.json()["detail"]


def test_questionnaire_requires_value_for_filled_state(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    case_id = _create_case(client, admin_token)

    response = client.put(
        f"/cases/{case_id}/questionnaire",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "answers": {
                "primary_diagnosis": {
                    "value": "",
                    "state": "filled",
                    "note": None,
                }
            }
        },
    )

    assert response.status_code == 422
    assert "must include a value" in response.json()["detail"]


def test_clinician_attestation_enables_export(client: TestClient) -> None:
    admin_token = _bootstrap_and_token(client)
    _create_clinician_user()
    clinician_token = _login(client, "clinician@northwind.com", "clinician-secret-123")

    case_id = _create_case(client, admin_token)

    initial = client.get(
        f"/cases/{case_id}/questionnaire",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert initial.status_code == 200
    payload = initial.json()

    answers = {
        field_id: {"value": f"answer-{index}", "state": "filled", "note": None}
        for index, field_id in enumerate(payload["required_field_ids"], start=1)
    }

    saved = client.put(
        f"/cases/{case_id}/questionnaire",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"answers": answers},
    )
    assert saved.status_code == 200
    assert saved.json()["export_enabled"] is False

    denied = client.post(
        f"/cases/{case_id}/attest", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert denied.status_code == 403

    attested = client.post(
        f"/cases/{case_id}/attest",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert attested.status_code == 200
    assert attested.json()["export_enabled"] is True
    assert attested.json()["attested_by_email"] == "clinician@northwind.com"
