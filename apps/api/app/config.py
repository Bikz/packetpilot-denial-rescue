from __future__ import annotations

import os
import secrets

DEFAULT_SQLITE_URL = "sqlite:///./data/packetpilot.db"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
DEFAULT_FHIR_BASE_URL = "http://127.0.0.1:8080/fhir"
DEFAULT_UPLOAD_DIR = "./data/uploads"
DEFAULT_ALLOWED_UPLOAD_EXTENSIONS = ".txt,.md,.csv,.pdf,.png,.jpg,.jpeg"
DEFAULT_ALLOWED_UPLOAD_CONTENT_TYPES = (
    "text/plain,text/markdown,text/csv,application/pdf,image/png,image/jpeg"
)
DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024

_PROCESS_EPHEMERAL_SECRET = secrets.token_urlsafe(48)


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)
        configured_secret = os.getenv("APP_SECRET", "").strip()
        self.jwt_secret = configured_secret or _PROCESS_EPHEMERAL_SECRET
        self.jwt_algorithm = "HS256"
        self.jwt_exp_minutes = int(os.getenv("JWT_EXP_MINUTES", "1440"))
        self.fhir_base_url = os.getenv("FHIR_BASE_URL", DEFAULT_FHIR_BASE_URL).rstrip("/")
        self.fhir_timeout_seconds = float(os.getenv("FHIR_TIMEOUT_SECONDS", "10"))
        self.upload_dir = os.getenv("UPLOAD_DIR", DEFAULT_UPLOAD_DIR)
        self.max_upload_bytes = int(os.getenv("MAX_UPLOAD_BYTES", str(DEFAULT_MAX_UPLOAD_BYTES)))
        self.allowed_upload_extensions = {
            item.strip().lower()
            for item in os.getenv(
                "ALLOWED_UPLOAD_EXTENSIONS", DEFAULT_ALLOWED_UPLOAD_EXTENSIONS
            ).split(",")
            if item.strip()
        }
        self.allowed_upload_content_types = {
            item.strip().lower()
            for item in os.getenv(
                "ALLOWED_UPLOAD_CONTENT_TYPES", DEFAULT_ALLOWED_UPLOAD_CONTENT_TYPES
            ).split(",")
            if item.strip()
        }
        self.model_mode = os.getenv("MODEL_MODE", "mock").lower().strip()
        self.model_id = os.getenv("MODEL_ID", "google/medgemma-1.5-4b-it")
        self.model_device = os.getenv("MODEL_DEVICE", "cpu")
        self.model_strict = os.getenv("MODEL_STRICT", "0").lower().strip() in {
            "1",
            "true",
            "yes",
            "on",
        }
        self.allowed_origins = [
            origin.strip()
            for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
            if origin.strip()
        ]


def get_settings() -> Settings:
    return Settings()
