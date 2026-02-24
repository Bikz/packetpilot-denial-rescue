from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz_returns_expected_payload(client: TestClient) -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "packetpilot-api"
