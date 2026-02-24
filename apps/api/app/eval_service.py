from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.models import AuditEvent, Case, CaseAutofill, CaseDocument, CaseQuestionnaire
from app.template_registry import get_template_required_field_ids


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _latest_timestamp(values: list[datetime | None]) -> datetime | None:
    timestamps = [_as_utc(item) for item in values if item is not None]
    if not timestamps:
        return None
    return max(timestamps)


def compute_case_metrics(
    case: Case,
    template: dict[str, Any],
    questionnaire: CaseQuestionnaire,
    autofills: list[CaseAutofill],
    documents: list[CaseDocument],
    audit_events: list[AuditEvent],
) -> dict[str, Any]:
    answers = questionnaire.answers_json or {}
    required_field_ids = get_template_required_field_ids(template)
    required_total = len(required_field_ids)

    required_filled = 0
    for field_id in required_field_ids:
        answer = answers.get(field_id, {})
        value = str(answer.get("value") or "").strip()
        state = str(answer.get("state") or "missing")
        if state != "missing" and value:
            required_filled += 1

    citation_by_field = {
        fill.field_id: bool(fill.citations_json)
        for fill in autofills
        if fill.status != "missing" and str(fill.value or "").strip()
    }
    required_with_citations = sum(
        1 for field_id in required_field_ids if citation_by_field.get(field_id)
    )

    required_filled_pct = (required_filled / required_total) if required_total else 0.0
    required_with_citations_pct = (
        (required_with_citations / required_total) if required_total else 0.0
    )
    completeness_score = round(((required_filled_pct + required_with_citations_pct) / 2) * 100, 2)

    first_evidence_uploaded_at = min(
        (item.created_at for item in documents if item.document_kind == "evidence"),
        default=None,
    )
    first_denial_uploaded_at = min(
        (item.created_at for item in documents if item.document_kind == "denial_letter"),
        default=None,
    )
    autofill_event_at = min(
        (event.created_at for event in audit_events if event.action == "autofill_run"),
        default=None,
    )
    packet_export_anchor = _latest_timestamp(
        [
            case.created_at,
            first_evidence_uploaded_at,
            autofill_event_at,
            questionnaire.clinician_attested_at,
            first_denial_uploaded_at,
        ]
    )

    instrumentation_events = [
        {"name": "case_created", "timestamp": _iso(case.created_at)},
        {"name": "first_evidence_uploaded", "timestamp": _iso(first_evidence_uploaded_at)},
        {"name": "autofill_run", "timestamp": _iso(autofill_event_at)},
        {"name": "attested", "timestamp": _iso(questionnaire.clinician_attested_at)},
        {"name": "first_denial_uploaded", "timestamp": _iso(first_denial_uploaded_at)},
        {"name": "packet_exported", "timestamp": _iso(packet_export_anchor)},
    ]

    case_created_at = _as_utc(case.created_at)
    export_at = _as_utc(packet_export_anchor or case.created_at)
    time_to_packet_seconds = int((export_at - case_created_at).total_seconds())
    if time_to_packet_seconds < 0:
        time_to_packet_seconds = 0

    return {
        "case_id": case.id,
        "required_fields_total": required_total,
        "required_fields_filled": required_filled,
        "required_fields_with_citations": required_with_citations,
        "required_fields_filled_pct": round(required_filled_pct * 100, 2),
        "required_fields_with_citations_pct": round(required_with_citations_pct * 100, 2),
        "completeness_score": completeness_score,
        "time_to_packet_seconds": time_to_packet_seconds,
        "time_to_packet_minutes": round(time_to_packet_seconds / 60, 2),
        "instrumentation_events": instrumentation_events,
    }
