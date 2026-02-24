from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from app.config import get_settings


def ensure_upload_dir() -> Path:
    settings = get_settings()
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_document_bytes(case_id: int, filename: str, content: bytes) -> str:
    upload_root = ensure_upload_dir()
    extension = Path(filename).suffix or ".bin"
    storage_name = f"case-{case_id}-{uuid4().hex}{extension}"
    destination = upload_root / storage_name
    destination.write_bytes(content)
    return str(destination)


def extract_text(content_type: str | None, filename: str, content: bytes) -> str:
    normalized_type = (content_type or "").lower()
    extension = Path(filename).suffix.lower()

    if normalized_type.startswith("text/") or extension in {".txt", ".md", ".csv"}:
        return content.decode("utf-8", errors="ignore")

    if normalized_type == "application/pdf" or extension == ".pdf":
        return _extract_pdf_text(content)

    if normalized_type.startswith("image/") or extension in {".png", ".jpg", ".jpeg", ".webp"}:
        return "[OCR fallback not yet enabled for image uploads in this demo build.]"

    return content.decode("utf-8", errors="ignore")


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore

        import io

        reader = PdfReader(io.BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
        extracted = "\n".join(pages).strip()
        if extracted:
            return extracted
    except Exception:
        pass

    return "[PDF text extraction fallback: no readable text extracted.]"


def detect_relevant_snippets(text: str, max_snippets: int = 8) -> list[dict[str, int | str]]:
    keywords = [
        "diagnosis",
        "symptom",
        "neurologic",
        "conservative",
        "physical therapy",
        "imaging",
        "clinical rationale",
        "medical necessity",
    ]

    snippets: list[dict[str, int | str]] = []
    lowered = text.lower()

    for keyword in keywords:
        for match in re.finditer(re.escape(keyword), lowered):
            start = max(0, match.start() - 48)
            end = min(len(text), match.end() + 120)
            excerpt = text[start:end].strip().replace("\n", " ")
            snippets.append(
                {
                    "doc_id": 0,
                    "page": 1,
                    "start": start,
                    "end": end,
                    "excerpt": excerpt,
                }
            )
            if len(snippets) >= max_snippets:
                return snippets

    if not snippets and text.strip():
        excerpt = text.strip().replace("\n", " ")[:180]
        snippets.append(
            {
                "doc_id": 0,
                "page": 1,
                "start": 0,
                "end": min(len(text), 180),
                "excerpt": excerpt,
            }
        )

    return snippets
