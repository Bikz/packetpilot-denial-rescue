from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ParsedDenial:
    reasons: list[str]
    missing_items: list[str]
    reference_id: str | None
    deadline_text: str | None
    citations: list[dict[str, int | str]]


REASON_PATTERNS: list[tuple[str, str]] = [
    ("Medical necessity not established", r"medical necessity"),
    ("Insufficient conservative therapy documentation", r"conservative therapy|physical therapy"),
    ("Prior imaging details missing", r"prior imaging|imaging report"),
    ("Clinical documentation incomplete", r"incomplete documentation|missing documentation"),
]

MISSING_ITEM_HINTS: list[tuple[str, str]] = [
    ("Updated clinical note", r"clinical note"),
    ("Conservative therapy trial details", r"conservative therapy|physical therapy"),
    ("Prior imaging report", r"prior imaging|imaging report"),
    ("Neurologic exam findings", r"neurologic exam|deficit"),
]

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "your",
    "please",
    "details",
    "documentation",
    "document",
    "report",
    "updated",
}

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def _find_citation(doc_id: int, text: str, pattern: str) -> dict[str, int | str] | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    start = match.start()
    end = match.end()
    excerpt_start = max(0, start - 50)
    excerpt_end = min(len(text), end + 140)
    return {
        "doc_id": doc_id,
        "page": 1,
        "start": start,
        "end": end,
        "excerpt": text[excerpt_start:excerpt_end].replace("\n", " ").strip(),
    }


def parse_denial_letter(doc_id: int, text: str) -> ParsedDenial:
    normalized_text = text or ""

    reasons: list[str] = []
    citations: list[dict[str, int | str]] = []
    for label, pattern in REASON_PATTERNS:
        citation = _find_citation(doc_id, normalized_text, pattern)
        if citation:
            reasons.append(label)
            citations.append(citation)

    if not reasons:
        reasons.append("Payer requested additional documentation")
        excerpt = normalized_text.strip().replace("\n", " ")[:180]
        citations.append(
            {
                "doc_id": doc_id,
                "page": 1,
                "start": 0,
                "end": min(len(normalized_text), 180),
                "excerpt": excerpt or "No denial content parsed.",
            }
        )

    missing_items: list[str] = []
    for label, pattern in MISSING_ITEM_HINTS:
        if re.search(pattern, normalized_text, flags=re.IGNORECASE):
            missing_items.append(label)

    if not missing_items:
        missing_items = [
            "Updated clinical note",
            "Conservative therapy trial details",
        ]

    # Capture list-like missing documentation blocks.
    block_match = re.search(
        r"(missing documentation|please provide|required documents?)\s*[:\-]?\s*(.+)",
        normalized_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if block_match:
        block = block_match.group(2).split("\n")
        for line in block:
            cleaned = re.sub(r"^[\-\*\d\.\)\s]+", "", line).strip()
            if cleaned and len(cleaned) > 4:
                if cleaned not in missing_items:
                    missing_items.append(cleaned[:120])

    reference_match = re.search(
        r"(?:reference|ref(?:erence)?\s*id)\s*[:#\-]?\s*([A-Za-z0-9\-]+)",
        normalized_text,
        flags=re.IGNORECASE,
    )
    deadline_match = re.search(
        r"(?:deadline|due(?:\s+date)?)\s*[:\-]?\s*"
        r"([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})",
        normalized_text,
        flags=re.IGNORECASE,
    )

    return ParsedDenial(
        reasons=reasons,
        missing_items=sorted(dict.fromkeys(missing_items)),
        reference_id=reference_match.group(1) if reference_match else None,
        deadline_text=deadline_match.group(1) if deadline_match else None,
        citations=citations,
    )


def _keyword_tokens(value: str) -> list[str]:
    tokens = [token for token in TOKEN_PATTERN.findall(value.lower()) if len(token) >= 3]
    return [token for token in tokens if token not in STOPWORDS]


def build_gap_report(
    missing_items: list[str], context_text: str | None = None
) -> list[dict[str, str]]:
    normalized_context = (context_text or "").lower()
    report: list[dict[str, str]] = []
    for item in missing_items:
        keywords = _keyword_tokens(item)
        if not keywords or not normalized_context:
            report.append({"item": item, "status": "missing"})
            continue

        matched_count = sum(1 for keyword in keywords if keyword in normalized_context)
        required_matches = 1 if len(keywords) == 1 else 2
        status = "resolved" if matched_count >= required_matches else "missing"
        report.append({"item": item, "status": status})
    return report


def build_appeal_letter(
    case_id: int,
    payer_label: str,
    reasons: list[str],
    missing_items: list[str],
    clinical_rationale: str,
    citations: list[dict[str, Any]],
) -> str:
    reason_lines = (
        "\n".join([f"- {reason}" for reason in reasons]) or "- Additional review requested"
    )
    missing_lines = (
        "\n".join([f"- {item}" for item in missing_items]) or "- Supplemental evidence attached"
    )

    citation_lines = "\n".join(
        [
            f"- Doc #{int(item.get('doc_id', 0))}, page {int(item.get('page', 1))}: "
            f"{str(item.get('excerpt', '')).strip()[:140]}"
            for item in citations
        ]
    )

    return (
        f"Appeal Request — Case #{case_id}\n"
        f"Payer: {payer_label}\n\n"
        "Dear Prior Authorization Reviewer,\n\n"
        "We respectfully request reconsideration of this denial. "
        "The packet has been updated to address each identified gap.\n\n"
        "Denial reasons noted:\n"
        f"{reason_lines}\n\n"
        "Submitted missing items:\n"
        f"{missing_lines}\n\n"
        "Updated clinical rationale:\n"
        f"{clinical_rationale.strip() or 'Clinical rationale included in attached packet.'}\n\n"
        "Supporting citations:\n"
        f"{citation_lines or '- Evidence references are included in packet attachments.'}\n\n"
        "Thank you for your reconsideration."
    )
