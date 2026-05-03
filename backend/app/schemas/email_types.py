import re
from typing import Annotated, Any
from pydantic import BeforeValidator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def _lenient_email(v: Any) -> str:
    if isinstance(v, bytes):
        v = v.decode()
    if not isinstance(v, str):
        raise ValueError("Email address must be a string")
    v = v.strip()
    if not _EMAIL_RE.match(v):
        raise ValueError("Please enter a valid email address.")
    return v.lower()

LenientEmailStr = Annotated[str, BeforeValidator(_lenient_email)]
