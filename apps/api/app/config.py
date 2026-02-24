from __future__ import annotations

import os

DEFAULT_SQLITE_URL = "sqlite:///./data/packetpilot.db"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
DEFAULT_FHIR_BASE_URL = "http://127.0.0.1:8080/fhir"


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)
        self.jwt_secret = os.getenv("APP_SECRET", "packetpilot-dev-secret")
        self.jwt_algorithm = "HS256"
        self.jwt_exp_minutes = int(os.getenv("JWT_EXP_MINUTES", "1440"))
        self.fhir_base_url = os.getenv("FHIR_BASE_URL", DEFAULT_FHIR_BASE_URL).rstrip("/")
        self.fhir_timeout_seconds = float(os.getenv("FHIR_TIMEOUT_SECONDS", "10"))
        self.allowed_origins = [
            origin.strip()
            for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
            if origin.strip()
        ]


def get_settings() -> Settings:
    return Settings()
