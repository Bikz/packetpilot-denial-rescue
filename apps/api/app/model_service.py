from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from app.config import get_settings


@dataclass
class Citation:
    doc_id: int
    page: int
    start: int
    end: int
    excerpt: str


@dataclass
class FieldFill:
    field_id: str
    value: str
    confidence: float
    status: Literal["autofilled", "suggested", "missing"]
    citations: list[Citation]


@dataclass
class ModelDocument:
    id: int
    text: str


TARGET_FIELDS = [
    "primary_diagnosis",
    "symptom_duration_weeks",
    "neurologic_deficit",
    "conservative_therapy_weeks",
    "pt_trial_documented",
    "prior_imaging_date",
    "clinical_rationale",
]

ALIASED_AUTOFILLED_STATUSES = {"autofilled", "filled", "verified", "complete"}
ALIASED_SUGGESTED_STATUSES = {"suggested", "review", "partial", "uncertain", "needs_review"}


def normalize_fill_status(
    status: str | None, value: str, confidence: float
) -> Literal["autofilled", "suggested", "missing"]:
    has_value = bool(value.strip())
    if not has_value:
        return "missing"

    normalized = (status or "").strip().lower()
    if normalized in ALIASED_AUTOFILLED_STATUSES:
        if confidence < 0.85:
            return "suggested"
        return "autofilled"
    if normalized in ALIASED_SUGGESTED_STATUSES:
        return "suggested"
    if normalized == "missing":
        return "missing"

    return "suggested"


class BaseModelService:
    def extract_field_fills(self, documents: list[ModelDocument]) -> list[FieldFill]:
        raise NotImplementedError


class MockModelService(BaseModelService):
    _regex_map: dict[str, list[str]] = {
        "primary_diagnosis": [
            r"primary diagnosis\s*[:=-]\s*(?P<value>[^\n\.]+)",
            r"diagnosis\s*[:=-]\s*(?P<value>[^\n\.]+)",
        ],
        "symptom_duration_weeks": [
            r"symptom duration\s*\(weeks\)\s*[:=-]\s*(?P<value>\d+)",
            r"duration\s*[:=-]\s*(?P<value>\d+)\s*weeks",
        ],
        "neurologic_deficit": [
            r"neurologic deficit\s*present\s*[:=-]\s*(?P<value>yes|no|unknown)",
            r"neurologic deficit\s*[:=-]\s*(?P<value>yes|no|unknown)",
        ],
        "conservative_therapy_weeks": [
            r"conservative therapy duration\s*\(weeks\)\s*[:=-]\s*(?P<value>\d+)",
            r"conservative therapy\s*[:=-]\s*(?P<value>\d+)\s*weeks",
        ],
        "pt_trial_documented": [r"physical therapy trial documented\s*[:=-]\s*(?P<value>yes|no)"],
        "prior_imaging_date": [
            r"date of prior imaging\s*[:=-]\s*(?P<value>\d{4}-\d{2}-\d{2})",
            r"prior imaging date\s*[:=-]\s*(?P<value>\d{4}-\d{2}-\d{2})",
        ],
        "clinical_rationale": [
            r"clinical rationale\s*[:=-]\s*(?P<value>[^\n]+)",
            r"medical necessity\s*[:=-]\s*(?P<value>[^\n]+)",
        ],
    }

    def extract_field_fills(self, documents: list[ModelDocument]) -> list[FieldFill]:
        fills: list[FieldFill] = []

        for field_id in TARGET_FIELDS:
            fill = self._extract_for_field(field_id, documents)
            fills.append(fill)

        return fills

    def _extract_for_field(self, field_id: str, documents: list[ModelDocument]) -> FieldFill:
        patterns = self._regex_map.get(field_id, [])
        for document in documents:
            lowered = document.text.lower()
            for pattern in patterns:
                match = re.search(pattern, lowered, re.IGNORECASE)
                if not match:
                    continue

                raw_value = match.group("value").strip()
                value = raw_value
                confidence = 0.92
                if len(value) < 3:
                    confidence = 0.78

                status = normalize_fill_status("autofilled", value, confidence)
                start = max(0, match.start("value") - 40)
                end = min(len(document.text), match.end("value") + 120)
                excerpt = document.text[start:end].replace("\n", " ").strip()

                return FieldFill(
                    field_id=field_id,
                    value=value,
                    confidence=confidence,
                    status=status,
                    citations=[
                        Citation(
                            doc_id=document.id,
                            page=1,
                            start=match.start("value"),
                            end=match.end("value"),
                            excerpt=excerpt,
                        )
                    ],
                )

        return FieldFill(
            field_id=field_id, value="", confidence=0.0, status="missing", citations=[]
        )


class MedGemmaModelService(BaseModelService):
    def __init__(self, model_id: str, device: str) -> None:
        self.model_id = model_id
        self.device = device
        self._initialized = False
        self._model: Any | None = None
        self._tokenizer: Any | None = None

    def _initialize(self) -> None:
        if self._initialized:
            return

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "transformers is required for MODEL_MODE=medgemma. Install optional deps to enable real inference."
            ) from exc

        self._tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        self._model = AutoModelForCausalLM.from_pretrained(self.model_id)

        if self.device and self.device != "cpu":
            try:  # pragma: no cover
                self._model.to(self.device)
            except Exception:
                pass

        self._initialized = True

    def extract_field_fills(self, documents: list[ModelDocument]) -> list[FieldFill]:
        self._initialize()

        prompt = self._build_prompt(documents)

        assert self._tokenizer is not None
        assert self._model is not None

        inputs = self._tokenizer(prompt, return_tensors="pt")
        outputs = self._model.generate(**inputs, max_new_tokens=400, do_sample=False)
        decoded = self._tokenizer.decode(outputs[0], skip_special_tokens=True)

        parsed = self._parse_output(decoded)
        if parsed is None:
            # Fall back to deterministic mock parsing to keep workflow resilient.
            return MockModelService().extract_field_fills(documents)

        return parsed

    def _build_prompt(self, documents: list[ModelDocument]) -> str:
        combined = "\n\n".join([f"[DOC {doc.id}]\n{doc.text[:3000]}" for doc in documents])
        return (
            "Extract prior authorization questionnaire fields from the provided clinical documents. "
            "Return strict JSON object with key 'fills' containing list of objects: "
            "{field_id, value, confidence, status, citations:[{doc_id,page,start,end,excerpt}]}. "
            f"Target fields: {', '.join(TARGET_FIELDS)}. "
            "Use status values autofilled, suggested, or missing.\n\n"
            f"Documents:\n{combined}"
        )

    def _parse_output(self, output_text: str) -> list[FieldFill] | None:
        match = re.search(r"\{.*\}", output_text, re.DOTALL)
        if not match:
            return None

        try:
            payload = json.loads(match.group(0))
            fills = payload.get("fills", [])
        except Exception:
            return None

        normalized: list[FieldFill] = []
        for fill in fills:
            citations = [
                Citation(
                    doc_id=int(citation.get("doc_id", 0)),
                    page=int(citation.get("page", 1)),
                    start=int(citation.get("start", 0)),
                    end=int(citation.get("end", 0)),
                    excerpt=str(citation.get("excerpt", "")),
                )
                for citation in fill.get("citations", [])
            ]
            normalized.append(
                FieldFill(
                    field_id=str(fill.get("field_id", "")),
                    value=str(fill.get("value", "")).strip(),
                    confidence=float(fill.get("confidence", 0.0)),
                    status=normalize_fill_status(
                        str(fill.get("status", "missing")),
                        str(fill.get("value", "")).strip(),
                        float(fill.get("confidence", 0.0)),
                    ),
                    citations=citations,
                )
            )

        if not normalized:
            return None

        by_field = {fill.field_id: fill for fill in normalized}
        result: list[FieldFill] = []
        for field_id in TARGET_FIELDS:
            result.append(by_field.get(field_id) or FieldFill(field_id, "", 0.0, "missing", []))

        return result


def get_model_service() -> BaseModelService:
    settings = get_settings()
    if settings.model_mode == "medgemma":
        return MedGemmaModelService(settings.model_id, settings.model_device)
    return MockModelService()
