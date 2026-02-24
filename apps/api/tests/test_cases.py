from __future__ import annotations

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


def test_case_creation_and_fhir_snapshot_flow(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    patients = client.get("/fhir/patients", headers=headers)
    assert patients.status_code == 200
    assert len(patients.json()) >= 1

    patient_id = patients.json()[0]["id"]

    create_case = client.post(
        "/cases",
        headers=headers,
        json={
            "patient_id": patient_id,
            "payer_label": "Aetna Gold",
            "service_line_template_id": "imaging-mri-lumbar-spine",
        },
    )

    assert create_case.status_code == 201
    created = create_case.json()
    assert created["patient_id"] == patient_id
    assert created["status"] == "draft"

    listed = client.get("/cases", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())

    snapshot = client.get(f"/fhir/patients/{patient_id}/snapshot", headers=headers)
    assert snapshot.status_code == 200
    body = snapshot.json()
    assert body["patient"]["id"] == patient_id
    assert isinstance(body["coverage"], list)
    assert isinstance(body["conditions"], list)
    assert isinstance(body["observations"], list)
    assert isinstance(body["medicationRequests"], list)
    assert isinstance(body["serviceRequests"], list)
    assert isinstance(body["documentReferences"], list)


def test_case_status_update_writes_audit_event(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post(
        "/cases",
        headers=headers,
        json={
            "patient_id": "pat-001",
            "payer_label": "Aetna Gold",
            "service_line_template_id": "imaging-mri-lumbar-spine",
        },
    )
    assert created.status_code == 201
    case_id = created.json()["id"]

    update = client.patch(f"/cases/{case_id}/status", headers=headers, json={"status": "in_review"})
    assert update.status_code == 200
    assert update.json()["status"] == "in_review"

    events = client.get("/audit-events", headers=headers)
    assert events.status_code == 200

    actions = [event["action"] for event in events.json()]
    assert "case_create" in actions
    assert "case_status_change" in actions
