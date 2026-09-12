"""
Shared annotated field types.

`BlankAsNone` exists because Pydantic v2 applies `pattern` (and any other
constraint) to *every* non-None value, including "". So a field declared

    phone: Optional[str] = Field(None, pattern=r"^\\+?[\\d\\s\\-\\(\\)\\.]{7,20}$")

is optional only if the client omits it entirely: an HTML form that serialises an
untouched input as "" gets a 422 naming a field the user deliberately left blank.
Annotating the field with `BlankAsNone` normalises blank (and whitespace-only)
input to None *before* the constraints run, so "" means "not provided" — while a
malformed value is still rejected.
"""

from typing import Annotated, Any, Optional

from pydantic import BeforeValidator

from app.schemas.email_types import LenientEmailStr


def _blank_to_none(v: Any) -> Any:
    """Treat a blank or whitespace-only string as absent."""
    if isinstance(v, str) and not v.strip():
        return None
    return v


#: Optional string whose constraints are skipped for blank input.
BlankAsNone = Annotated[Optional[str], BeforeValidator(_blank_to_none)]

#: Optional email whose validation is skipped for blank input.
BlankAsNoneEmail = Annotated[Optional[LenientEmailStr], BeforeValidator(_blank_to_none)]
