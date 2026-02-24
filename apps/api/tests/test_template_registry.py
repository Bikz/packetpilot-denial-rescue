from __future__ import annotations

from app.template_registry import get_service_line_template, validate_answers


def test_template_registry_loads_mri_template() -> None:
    template = get_service_line_template("imaging-mri-lumbar-spine")
    assert template is not None
    assert template["id"] == "imaging-mri-lumbar-spine"


def test_validate_answers_flags_invalid_state() -> None:
    template = get_service_line_template("imaging-mri-lumbar-spine")
    assert template is not None

    errors = validate_answers(
        template,
        {
            "primary_diagnosis": {
                "value": "Lumbar radiculopathy",
                "state": "bad_state",
                "note": None,
            }
        },
    )

    assert len(errors) == 1
    assert "Invalid state" in errors[0]
