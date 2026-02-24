from __future__ import annotations

from app.model_service import normalize_fill_status


def test_normalize_fill_status_handles_aliases() -> None:
    assert normalize_fill_status("filled", "lumbar radiculopathy", 0.92) == "autofilled"
    assert normalize_fill_status("verified", "lumbar radiculopathy", 0.92) == "autofilled"
    assert normalize_fill_status("review", "lumbar radiculopathy", 0.92) == "suggested"


def test_normalize_fill_status_downgrades_low_confidence() -> None:
    assert normalize_fill_status("autofilled", "possible finding", 0.4) == "suggested"


def test_normalize_fill_status_requires_value() -> None:
    assert normalize_fill_status("autofilled", "", 0.99) == "missing"
    assert normalize_fill_status("unknown_status", "value", 0.99) == "suggested"
