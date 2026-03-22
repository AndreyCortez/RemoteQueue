"""
Form Schema V2 — Pydantic models and validation.

Supports three formats (backwards-compatible):
  - Legacy simple:  {"campo": "string"}
  - Legacy rich:    {"campo": {"type": "string", "label": "...", ...}}
  - V2:            {"version": 2, "elements": [...]}
"""

from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import HTTPException
from pydantic import BaseModel, field_validator


# ── V2 element models ────────────────────────────────────────────────────────

FIELD_TYPES = {"string", "integer", "boolean", "cpf", "date", "select", "poll"}


class SectionElement(BaseModel):
    kind: Literal["section"] = "section"
    id: str
    title: str = ""
    description: str = ""
    image_url: Optional[str] = None


class FieldElement(BaseModel):
    kind: Literal["field"] = "field"
    id: str
    key: str
    type: str
    label: str = ""
    placeholder: str = ""
    required: bool = True
    pattern: Optional[str] = None
    options: Optional[List[str]] = None
    mask: Optional[str] = None

    @field_validator("type")
    @classmethod
    def check_type(cls, v: str) -> str:
        if v not in FIELD_TYPES:
            raise ValueError(f"Unknown field type: {v}. Must be one of {sorted(FIELD_TYPES)}")
        return v

    @field_validator("options")
    @classmethod
    def check_options(cls, v: Optional[List[str]], info) -> Optional[List[str]]:
        field_type = info.data.get("type", "")
        if field_type in ("select", "poll"):
            if not v:
                raise ValueError(f"Field type '{field_type}' requires at least 1 option in 'options'")
        return v

    def model_post_init(self, __context: Any) -> None:
        if self.type in ("select", "poll") and not self.options:
            raise ValueError(f"Field type '{self.type}' requires at least 1 option in 'options'")


FormElement = Union[SectionElement, FieldElement]


class FormSchemaV2(BaseModel):
    version: Literal[2] = 2
    elements: List[FormElement]

    @field_validator("elements")
    @classmethod
    def check_unique_keys(cls, elements: List[FormElement]) -> List[FormElement]:
        keys = [e.key for e in elements if isinstance(e, FieldElement)]
        seen = set()
        for k in keys:
            if k in seen:
                raise ValueError(f"Duplicate field key: '{k}'")
            seen.add(k)
        return elements


# ── Schema detection & validation ────────────────────────────────────────────

def _is_v2(raw: dict) -> bool:
    return raw.get("version") == 2


def validate_form_schema(raw: Dict[str, Any]) -> FormSchemaV2:
    """Validate a form_schema dict. Accepts both legacy and v2 formats.
    Returns a validated FormSchemaV2 model. Raises HTTPException(422) on error."""
    try:
        if _is_v2(raw):
            return FormSchemaV2(**raw)
        return _legacy_to_v2(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid form_schema: {e}")


def _legacy_to_v2(raw: Dict[str, Any]) -> FormSchemaV2:
    """Convert a legacy dict-based schema to V2 format."""
    elements: List[FormElement] = []
    for key, definition in raw.items():
        if isinstance(definition, str):
            field_type = definition
            elem = FieldElement(
                id=str(uuid.uuid4()),
                key=key,
                type=field_type if field_type in FIELD_TYPES else "string",
                label=key.replace("_", " ").title(),
                required=True,
            )
        else:
            elem = FieldElement(
                id=str(uuid.uuid4()),
                key=key,
                type=definition.get("type", "string"),
                label=definition.get("label", key.replace("_", " ").title()),
                placeholder=definition.get("placeholder", ""),
                required=definition.get("required", True),
                pattern=definition.get("pattern"),
                options=definition.get("options"),
                mask=definition.get("mask"),
            )
        elements.append(elem)
    return FormSchemaV2(version=2, elements=elements)


# ── CPF check-digit validation ───────────────────────────────────────────────

_CPF_RE = re.compile(r"^\d{3}\.\d{3}\.\d{3}-\d{2}$")


def _validate_cpf(value: str) -> bool:
    """Validates CPF format (###.###.###-##) and check digits (modulo 11)."""
    if not _CPF_RE.fullmatch(value):
        return False
    digits = [int(c) for c in value if c.isdigit()]
    if len(digits) != 11:
        return False
    # Reject known invalid CPFs (all same digit)
    if len(set(digits)) == 1:
        return False
    # First check digit
    total = sum(d * w for d, w in zip(digits[:9], range(10, 1, -1)))
    rest = total % 11
    expected = 0 if rest < 2 else 11 - rest
    if digits[9] != expected:
        return False
    # Second check digit
    total = sum(d * w for d, w in zip(digits[:10], range(11, 1, -1)))
    rest = total % 11
    expected = 0 if rest < 2 else 11 - rest
    if digits[10] != expected:
        return False
    return True


# ── Payload validation against schema ────────────────────────────────────────

_TYPE_CHECKERS = {
    "string": lambda v: isinstance(v, str),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "cpf": lambda v: isinstance(v, str),
    "date": lambda v: isinstance(v, str),
    "select": lambda v: isinstance(v, str),
    "poll": lambda v: isinstance(v, str),
}


def validate_payload_against_schema(payload: dict, schema: dict):
    """Validate B2C user_data against form_schema. Supports legacy and v2 formats."""
    if _is_v2(schema):
        _validate_payload_v2(payload, schema)
    else:
        _validate_payload_legacy(payload, schema)


def _validate_payload_v2(payload: dict, schema: dict):
    """Validate payload against a v2 schema."""
    for element in schema.get("elements", []):
        if element.get("kind") != "field":
            continue

        key = element["key"]
        field_type = element.get("type", "string")
        required = element.get("required", True)
        pattern = element.get("pattern")
        options = element.get("options")

        value = payload.get(key)

        if value is None:
            if required:
                raise HTTPException(status_code=422, detail=f"Missing required field: {key}")
            continue

        # Type check
        checker = _TYPE_CHECKERS.get(field_type)
        if checker and not checker(value):
            raise HTTPException(status_code=422, detail=f"Field {key} must be a {field_type}")

        # CPF validation
        if field_type == "cpf":
            if not _validate_cpf(value):
                raise HTTPException(status_code=422, detail=f"Field {key} is not a valid CPF")

        # Date validation (YYYY-MM-DD)
        if field_type == "date":
            try:
                date.fromisoformat(value)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Field {key} must be a valid date (YYYY-MM-DD)")

        # Select/poll: value must be in options
        if field_type in ("select", "poll") and options:
            if value not in options:
                raise HTTPException(
                    status_code=422,
                    detail=f"Field {key} must be one of: {', '.join(options)}"
                )

        # Regex pattern
        if pattern and isinstance(value, str) and not re.fullmatch(pattern, value):
            raise HTTPException(status_code=422, detail=f"Field {key} does not match required pattern")


def _validate_payload_legacy(payload: dict, schema: dict):
    """Validate payload against a legacy dict-based schema (backwards-compatible)."""
    for field, definition in schema.items():
        if isinstance(definition, str):
            field_type = definition
            required = True
            pattern = None
        else:
            field_type = definition.get("type", "string")
            required = definition.get("required", True)
            pattern = definition.get("pattern")

        value = payload.get(field)

        if value is None:
            if required:
                raise HTTPException(status_code=422, detail=f"Missing required field: {field}")
            continue

        checker = _TYPE_CHECKERS.get(field_type)
        if checker and not checker(value):
            raise HTTPException(status_code=422, detail=f"Field {field} must be a {field_type}")

        if pattern and isinstance(value, str) and not re.fullmatch(pattern, value):
            raise HTTPException(status_code=422, detail=f"Field {field} does not match required pattern")
