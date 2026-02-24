from __future__ import annotations

from fastapi.testclient import TestClient


def test_model_status_endpoint(client: TestClient) -> None:
    response = client.get("/model/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["backend"] in {"mock", "medgemma"}
    assert "strict_mode" in payload
    assert "initialized" in payload
