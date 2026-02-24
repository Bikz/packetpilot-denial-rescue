from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Base

_engine = None
_SessionLocal = None


def _ensure_sqlite_parent(url: str) -> None:
    if not url.startswith("sqlite:///"):
        return

    path = url.replace("sqlite:///", "", 1)
    if path in {":memory:", ""}:
        return

    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def get_engine():
    global _engine, _SessionLocal

    if _engine is None:
        settings = get_settings()
        _ensure_sqlite_parent(settings.database_url)

        connect_args = {}
        if settings.database_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}

        _engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
        _SessionLocal = sessionmaker(
            bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False
        )

    return _engine


def get_session_local():
    get_engine()
    return _SessionLocal


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    _apply_sqlite_compat_migrations(engine)


def _apply_sqlite_compat_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "case_documents" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("case_documents")}
    if "document_kind" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE case_documents "
                "ADD COLUMN document_kind VARCHAR(64) NOT NULL DEFAULT 'evidence'"
            )
        )


def reset_db_engine() -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    session_local = get_session_local()
    db = session_local()
    try:
        yield db
    finally:
        db.close()
