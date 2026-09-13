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

from fastapi import Path, Query
from pydantic import BeforeValidator, Field

from app.schemas.email_types import LenientEmailStr

#: Largest value a 64-bit signed integer column can hold.
_MAX_DB_INT = 2**63 - 1


def _blank_to_none(v: Any) -> Any:
    """Treat a blank or whitespace-only string as absent."""
    if isinstance(v, str) and not v.strip():
        return None
    return v


#: Optional string whose constraints are skipped for blank input.
BlankAsNone = Annotated[Optional[str], BeforeValidator(_blank_to_none)]

#: Optional email whose validation is skipped for blank input.
BlankAsNoneEmail = Annotated[Optional[LenientEmailStr], BeforeValidator(_blank_to_none)]


#: A resource id taken from the URL path.
#:
#: Python ints are unbounded, so a bare `file_id: int` happily accepts a 20-digit
#: number, which then reaches the database and raises — `OverflowError: Python int
#: too large to convert to SQLite INTEGER` locally, and a numeric-range DataError on
#: Postgres. Either way the caller gets a 500 from a request that should simply not
#: match anything. Bounding it here rejects the value at the edge with a 422, before
#: any query runs, and documents the range in the OpenAPI schema.
#:
#: `ge=1` matches the fact that ids are positive autoincrement keys; a negative id
#: already returned 404, so nothing that used to work stops working.
ResourceId = Annotated[int, Path(ge=1, le=_MAX_DB_INT)]


#: A resource id arriving in a request *body* rather than the path.
#:
#: Same overflow as ``ResourceId`` — ``file_id`` on a report create went straight
#: into a query — but body fields are validated by Pydantic, so the bound is a
#: ``Field`` rather than a ``Path``.
BodyResourceId = Annotated[int, Field(ge=1, le=_MAX_DB_INT)]

#: Optional variant of :data:`BodyResourceId`.
OptionalBodyResourceId = Annotated[Optional[int], Field(ge=1, le=_MAX_DB_INT)]

#: ``skip``/``offset`` pagination parameter.
#:
#: ``skip: int = 0`` accepted a 20-digit number that reached ``.offset()`` and
#: raised the same OverflowError as the path ids.
PageOffset = Annotated[int, Query(ge=0, le=_MAX_DB_INT)]

#: ``limit`` pagination parameter.
#:
#: Bounded at both ends: ``le`` also stops a single request asking for the entire
#: table, which is a cheap way to make the API do expensive work.
PageLimit = Annotated[int, Query(ge=1, le=500)]

#: Optional resource id arriving as a *query* filter (``?patient_id=``).
#:
#: Same overflow again: the value goes straight into a ``.filter()`` comparison.
#: The default belongs at the call site (``= None``); FastAPI rejects one set inside
#: ``Annotated``.
OptionalQueryResourceId = Annotated[Optional[int], Query(ge=1, le=_MAX_DB_INT)]
