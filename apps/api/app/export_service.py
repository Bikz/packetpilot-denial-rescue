from __future__ import annotations

import base64
import io
import json
from datetime import datetime
from typing import Any

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

from app.models import (
    AuditEvent,
    Case,
    CaseAutofill,
    CaseDenial,
    CaseDocument,
    CaseQuestionnaire,
    User,
)


def _case_audit_summary(
    case: Case, audit_events: list[AuditEvent], users_by_id: dict[int, User]
) -> list[dict[str, Any]]:
    summary: list[dict[str, Any]] = []
    for event in audit_events:
        event_case_id = None
        if event.metadata_json and isinstance(event.metadata_json, dict):
            raw_case_id = event.metadata_json.get("case_id")
            if raw_case_id is not None:
                try:
                    event_case_id = int(raw_case_id)
                except (TypeError, ValueError):
                    event_case_id = None

        matches_case = (
            event.entity_type == "case" and str(case.id) == str(event.entity_id)
        ) or event_case_id == case.id
        if not matches_case:
            continue

        summary.append(
            {
                "id": event.id,
                "action": event.action,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "actor_email": (
                    users_by_id.get(event.user_id).email if event.user_id in users_by_id else None
                ),
                "created_at": event.created_at.isoformat(),
            }
        )

    return sorted(summary, key=lambda item: (item["created_at"], item["id"]))


def build_packet_json(
    case: Case,
    questionnaire: CaseQuestionnaire,
    documents: list[CaseDocument],
    autofills: list[CaseAutofill],
    audit_events: list[AuditEvent],
    users_by_id: dict[int, User],
    export_type: str,
    denial: CaseDenial | None,
) -> dict[str, Any]:
    answers = questionnaire.answers_json or {}
    answer_items = []
    for field_id in sorted(answers.keys()):
        answer = answers[field_id]
        answer_items.append(
            {
                "field_id": field_id,
                "value": answer.get("value"),
                "state": answer.get("state"),
                "note": answer.get("note"),
            }
        )

    evidence_documents = [
        {
            "document_id": item.id,
            "filename": item.filename,
            "content_type": item.content_type,
            "document_kind": item.document_kind,
            "snippets": item.snippets_json or [],
        }
        for item in sorted(documents, key=lambda document: document.id)
    ]

    citation_map = []
    for fill in sorted(autofills, key=lambda item: item.field_id):
        citation_map.append(
            {
                "field_id": fill.field_id,
                "value": fill.value,
                "status": fill.status,
                "confidence": fill.confidence,
                "citations": fill.citations_json,
            }
        )

    packet: dict[str, Any] = {
        "case_header": {
            "case_id": case.id,
            "patient_id": case.patient_id,
            "payer_label": case.payer_label,
            "service_line_template_id": case.service_line_template_id,
            "status": case.status,
            "created_at": case.created_at.isoformat(),
            "updated_at": case.updated_at.isoformat(),
            "export_type": export_type,
        },
        "questionnaire": answer_items,
        "clinical_rationale_draft": str(
            (answers.get("clinical_rationale") or {}).get("value") or ""
        ).strip(),
        "evidence_documents": evidence_documents,
        "citation_map": citation_map,
        "audit_log_summary": _case_audit_summary(case, audit_events, users_by_id),
    }

    if denial is not None:
        packet["denial"] = {
            "reasons": denial.reasons_json,
            "missing_items": denial.missing_items_json,
            "reference_id": denial.reference_id,
            "deadline_text": denial.deadline_text,
            "appeal_letter_draft": denial.appeal_letter_draft,
            "citations": denial.citations_json,
        }

    return packet


def _draw_wrapped_text(
    c: canvas.Canvas,
    lines: list[str],
    *,
    x: int = 50,
    y_start: int = 740,
    line_height: int = 14,
    page_bottom: int = 60,
) -> None:
    y = y_start
    for line in lines:
        if y < page_bottom:
            c.showPage()
            c.setFont("Helvetica", 10)
            y = y_start
        c.drawString(x, y, line[:1200])
        y -= line_height


def build_packet_pdf_bytes(packet: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=LETTER, pageCompression=0)
    c.setTitle("PacketPilot Prior Authorization Packet")
    c.setAuthor("PacketPilot")
    c.setCreator("PacketPilot")
    c.setSubject("Prior Authorization Packet")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, 770, "PacketPilot Prior Authorization Packet")
    c.setFont("Helvetica", 10)

    header = packet.get("case_header", {})
    lines = [
        f"Case ID: {header.get('case_id')}",
        f"Patient ID: {header.get('patient_id')}",
        f"Payer: {header.get('payer_label')}",
        f"Template: {header.get('service_line_template_id')}",
        f"Export Type: {header.get('export_type')}",
        "",
        "Questionnaire",
    ]

    for item in packet.get("questionnaire", []):
        lines.append(
            f"- {item.get('field_id')}: {item.get('value') or '(empty)'} "
            f"[{item.get('state') or 'missing'}]"
        )

    lines.extend(
        [
            "",
            "Clinical Rationale Draft",
            packet.get("clinical_rationale_draft") or "(empty)",
            "",
            "Evidence List with Citations",
        ]
    )

    for item in packet.get("citation_map", []):
        lines.append(f"- Field {item.get('field_id')}: {item.get('value') or '(empty)'}")
        for citation in item.get("citations", []):
            lines.append(
                f"  • Doc #{citation.get('doc_id')} p{citation.get('page')}: "
                f"{str(citation.get('excerpt') or '').strip()[:120]}"
            )

    if "denial" in packet:
        denial = packet["denial"]
        lines.extend(["", "Denial / Appeal"])
        lines.extend([f"- Reason: {reason}" for reason in denial.get("reasons", [])])
        lines.extend([f"- Missing: {item}" for item in denial.get("missing_items", [])])
        lines.extend(["", "Appeal Letter Draft", denial.get("appeal_letter_draft") or "(empty)"])

    _draw_wrapped_text(c, lines)
    c.save()
    return buffer.getvalue()


def encode_pdf_base64(pdf_bytes: bytes) -> str:
    return base64.b64encode(pdf_bytes).decode("utf-8")


def stable_json(data: dict[str, Any]) -> dict[str, Any]:
    # Round-trip with sorted keys to produce deterministic structure ordering.
    return json.loads(json.dumps(data, sort_keys=True, ensure_ascii=True))


def now_utc() -> datetime:
    return datetime.utcnow()
