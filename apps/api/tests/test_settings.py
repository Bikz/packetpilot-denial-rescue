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


def test_settings_crud_and_audit(client: TestClient) -> None:
    token = _bootstrap_and_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    current = client.get("/settings/current", headers=headers)
    assert current.status_code == 200
    assert current.json()["deployment_mode"] == "standalone"

    update = client.put(
        "/settings/current",
        headers=headers,
        json={
            "deployment_mode": "smart_on_fhir",
            "fhir_base_url": "https://fhir.sandbox.example",
            "fhir_auth_type": "oauth2",
            "fhir_auth_config": "scope=patient/*.read",
            "model_endpoint": "http://localhost:11434/medgemma",
        },
    )

    assert update.status_code == 200
    assert update.json()["deployment_mode"] == "smart_on_fhir"

    refetch = client.get("/settings/current", headers=headers)
    assert refetch.status_code == 200
    assert refetch.json()["fhir_base_url"] == "https://fhir.sandbox.example"

    events = client.get("/audit-events", headers=headers)
    assert events.status_code == 200

    actions = [event["action"] for event in events.json()]
    assert "settings_change" in actions
