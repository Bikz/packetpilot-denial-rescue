from __future__ import annotations

import pytest

from app.model_service import (
    MedGemmaModelService,
    ModelDocument,
    normalize_fill_status,
)


def test_normalize_fill_status_handles_aliases() -> None:
    assert normalize_fill_status("filled", "lumbar radiculopathy", 0.92) == "autofilled"
    assert normalize_fill_status("verified", "lumbar radiculopathy", 0.92) == "autofilled"
    assert normalize_fill_status("review", "lumbar radiculopathy", 0.92) == "suggested"


def test_normalize_fill_status_downgrades_low_confidence() -> None:
    assert normalize_fill_status("autofilled", "possible finding", 0.4) == "suggested"


def test_normalize_fill_status_requires_value() -> None:
    assert normalize_fill_status("autofilled", "", 0.99) == "missing"
    assert normalize_fill_status("unknown_status", "value", 0.99) == "suggested"


def test_medgemma_runtime_status_reflects_strict_mode() -> None:
    service = MedGemmaModelService("google/medgemma-1.5-4b-it", "cpu", strict_mode=True)
    status = service.runtime_status()
    assert status["backend"] == "medgemma"
    assert status["strict_mode"] is True
    assert status["initialized"] is False


def test_medgemma_strict_mode_raises_on_unparseable_output() -> None:
    service = MedGemmaModelService("google/medgemma-1.5-4b-it", "cpu", strict_mode=True)

    # Avoid loading real model in unit tests.
    service._initialized = True  # type: ignore[attr-defined]
    service._tokenizer = _FakeTokenizer()  # type: ignore[attr-defined]
    service._model = _FakeModel("not-json")  # type: ignore[attr-defined]

    with pytest.raises(RuntimeError, match="could not be parsed"):
        service.extract_field_fills([ModelDocument(id=1, text="sample")])


class _FakeTokenizer:
    def __call__(self, _: str, return_tensors: str):  # noqa: ANN001
        return {"input_ids": _FakeTensor()}

    def decode(self, value: str, skip_special_tokens: bool):  # noqa: ANN001, ARG002
        return value


class _FakeModel:
    def __init__(self, output: str) -> None:
        self._output = output

    def parameters(self):
        return iter([_FakeParam()])

    def generate(self, **_: dict[str, object]) -> list[str]:
        return [self._output]


class _FakeParam:
    @property
    def device(self) -> str:
        return "cpu"


class _FakeTensor:
    def to(self, _: str) -> "_FakeTensor":
        return self
