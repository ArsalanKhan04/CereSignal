"""
Regression tests for out-of-range resource ids in the URL path.

Found by ``tests/test_contract.py`` on its first run. Python ints are unbounded,
so a bare ``file_id: int`` accepted a 20-digit number, which then reached the
database and raised ``OverflowError: Python int too large to convert to SQLite
INTEGER`` — a 500 on every integer path parameter in the API. On Postgres the same
request raises a numeric-range ``DataError``, so this was a deployment bug, not a
SQLite artefact.

The fix is ``ResourceId`` in ``app/schemas/field_types.py``: the bound is declared
on the parameter, so the value is rejected at the edge with a 422 before any query
runs, and the range is published in the OpenAPI schema.
"""

import pytest

# One past the largest value a 64-bit signed column holds.
TOO_BIG = 2**63
HUGE = 99999999999999999999

ROUTES = [
    ("get", "/api/v1/users/{}", "doctor_a"),
    ("put", "/api/v1/users/{}", "doctor_a"),
    ("delete", "/api/v1/users/{}", "doctor_a"),
    ("get", "/api/v1/signals/files/{}", "doctor_a"),
    ("delete", "/api/v1/signals/files/{}", "doctor_a"),
    ("get", "/api/v1/reports/{}", "doctor_a"),
    ("get", "/api/v1/reports/{}/versions", "doctor_a"),
    ("post", "/api/v1/notifications/{}/read", "doctor_a"),
    ("put", "/api/v1/admin/staff/{}/toggle-active", "admin_a"),
    ("delete", "/api/v1/admin/invitations/{}", "admin_a"),
]


@pytest.mark.parametrize("method,template,who", ROUTES)
@pytest.mark.parametrize("bad_id", [HUGE, TOO_BIG], ids=["twenty-digits", "int64-overflow"])
def test_an_oversize_id_is_refused_not_crashed(
    client, auth_headers, request, method, template, who, bad_id
):
    user = request.getfixturevalue(who)

    r = getattr(client, method)(template.format(bad_id), headers=auth_headers(user))

    assert r.status_code == 422, f"{method.upper()} {template} returned {r.status_code}"


@pytest.mark.parametrize("method,template,who", ROUTES)
def test_a_negative_id_is_refused(client, auth_headers, request, method, template, who):
    """Ids are positive autoincrement keys; a negative one cannot name a row."""
    user = request.getfixturevalue(who)

    r = getattr(client, method)(template.format(-1), headers=auth_headers(user))

    assert r.status_code == 422


@pytest.mark.parametrize("method,template,who", ROUTES)
def test_an_in_range_unknown_id_is_still_a_404(
    client, auth_headers, request, method, template, who
):
    """
    The bound must not swallow the ordinary case: a plausible id that simply does
    not exist has to keep returning 404, which is what the tenancy tests rely on.
    """
    user = request.getfixturevalue(who)

    r = getattr(client, method)(template.format(999999), headers=auth_headers(user))

    assert r.status_code in (404, 422) and r.status_code != 500
    assert r.status_code == 404


def test_the_bound_is_published_in_the_openapi_schema(client):
    """A documented range is what lets the contract fuzzer stop generating these."""
    spec = client.get("/api/v1/openapi.json").json()

    params = spec["paths"]["/api/v1/reports/{report_id}"]["get"]["parameters"]
    report_id = next(p for p in params if p["name"] == "report_id")

    assert report_id["schema"]["maximum"] == 2**63 - 1
    assert report_id["schema"]["minimum"] == 1
