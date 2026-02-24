from __future__ import annotations

from fastapi.testclient import TestClient


def test_bootstrap_creates_first_admin(client: TestClient) -> None:
    status_before = client.get("/auth/bootstrap-status")
    assert status_before.status_code == 200
    assert status_before.json()["needs_bootstrap"] is True

    bootstrap = client.post(
        "/auth/bootstrap",
        json={
            "organization_name": "Northwind Clinic",
            "full_name": "Alex Kim",
            "email": "admin@northwind.com",
            "password": "super-secret-123",
        },
    )

    assert bootstrap.status_code == 200
    body = bootstrap.json()
    assert body["user"]["role"] == "admin"
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    status_after = client.get("/auth/bootstrap-status")
    assert status_after.status_code == 200
    assert status_after.json()["needs_bootstrap"] is False


def test_login_records_audit_event(client: TestClient) -> None:
    client.post(
        "/auth/bootstrap",
        json={
            "organization_name": "Northwind Clinic",
            "full_name": "Alex Kim",
            "email": "admin@northwind.com",
            "password": "super-secret-123",
        },
    )

    login = client.post(
        "/auth/login",
        json={"email": "admin@northwind.com", "password": "super-secret-123"},
    )
    assert login.status_code == 200

    token = login.json()["access_token"]
    events = client.get("/audit-events", headers={"Authorization": f"Bearer {token}"})

    assert events.status_code == 200
    assert any(event["action"] == "login" for event in events.json())
