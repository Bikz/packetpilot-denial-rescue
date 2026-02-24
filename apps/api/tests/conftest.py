from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "packetpilot-test.db"

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("APP_SECRET", "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz")

    from app.db import init_db, reset_db_engine

    reset_db_engine()
    init_db()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    reset_db_engine()
