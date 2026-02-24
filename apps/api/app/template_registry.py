from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

FieldAnswer = dict[str, Any]
ServiceLineTemplate = dict[str, Any]

VALID_FIELD_STATES = {"missing", "filled", "verified"}


def _templates_dir() -> Path:
    candidate_dirs = [
        Path(__file__).resolve().parents[3] / "packages" / "templates" / "data",
        Path.cwd() / "packages" / "templates" / "data",
        Path(__file__).resolve().parent / "templates" / "data",
        Path(__file__).resolve().parent.parent / "templates" / "data",
        Path("/workspace/packages/templates/data"),
        Path("/workspace/apps/api/templates/data"),
    ]

    for directory in candidate_dirs:
        if directory.exists():
            return directory

    raise RuntimeError(
        "Templates not found. Checked: " + ", ".join(str(path) for path in candidate_dirs)
    )


@lru_cache(maxsize=1)
def _template_map() -> dict[str, ServiceLineTemplate]:
    templates: dict[str, ServiceLineTemplate] = {}
    for path in _templates_dir().glob("*.json"):
        payload = json.loads(path.read_text(encoding="utf-8"))
        template_id = payload.get("id")
        if isinstance(template_id, str) and template_id:
            templates[template_id] = payload

    return templates


def get_service_line_template(template_id: str) -> ServiceLineTemplate | None:
    return _template_map().get(template_id)


def get_template_field_ids(template: ServiceLineTemplate) -> list[str]:
    sections = template.get("questionnaire", {}).get("sections", [])
    field_ids: list[str] = []
    for section in sections:
        for item in section.get("items", []):
            field_id = item.get("fieldId")
            if isinstance(field_id, str) and field_id:
                field_ids.append(field_id)

    return field_ids


def get_template_required_field_ids(template: ServiceLineTemplate) -> list[str]:
    required = template.get("requiredFieldIds", [])
    return [field_id for field_id in required if isinstance(field_id, str) and field_id]


def default_answers(template: ServiceLineTemplate) -> dict[str, FieldAnswer]:
    return {
        field_id: {"value": None, "state": "missing", "note": None}
        for field_id in get_template_field_ids(template)
    }


def validate_answers(template: ServiceLineTemplate, answers: dict[str, FieldAnswer]) -> list[str]:
    errors: list[str] = []

    template_field_ids = set(get_template_field_ids(template))
    unknown_field_ids = [field_id for field_id in answers if field_id not in template_field_ids]
    if unknown_field_ids:
        errors.append(f"Unknown field IDs: {', '.join(sorted(unknown_field_ids))}")

    for field_id, answer in answers.items():
        state = answer.get("state")
        value = answer.get("value")

        if state not in VALID_FIELD_STATES:
            errors.append(f"Invalid state for '{field_id}': {state}")
            continue

        if state == "missing":
            if isinstance(value, str) and value.strip():
                errors.append(f"Field '{field_id}' is marked missing but has a value")
            continue

        if not isinstance(value, str) or not value.strip():
            errors.append(f"Field '{field_id}' must include a value when state is '{state}'")

    return errors


def missing_required_fields(
    template: ServiceLineTemplate, answers: dict[str, FieldAnswer]
) -> list[str]:
    missing: list[str] = []

    for field_id in get_template_required_field_ids(template):
        answer = answers.get(field_id)
        if not answer:
            missing.append(field_id)
            continue

        state = answer.get("state")
        value = answer.get("value")

        if state == "missing":
            missing.append(field_id)
            continue

        if not isinstance(value, str) or not value.strip():
            missing.append(field_id)

    return missing
