"""
OpenAPI contract fuzzing.

Every other test in this suite asserts a behaviour somebody thought to write down.
This one generates inputs from the app's own published schema and asserts the one
property that should hold for all of them: **no request that the documented schema
says is well-formed may produce a 500.**

How it runs
-----------
``schemathesis.openapi.from_asgi`` drives the FastAPI app in-process over ASGI.
There is no server, no socket and no network — the same constraint the rest of the
suite runs under. The database is the usual in-memory SQLite, wired through the
same ``get_db`` override ``conftest.client`` uses, and storage is redirected to the
``local_storage`` tmp_path backend.

Why only ``not_a_server_error``
-------------------------------
Schemathesis 4 enables every check by default. On a FastAPI app that has never been
fuzzed, ``status_code_conformance`` fails on essentially every operation, because
FastAPI does not document 401/403 in the generated schema even though every
authenticated route returns them. That is a schema-annotation backlog, not a defect,
and starting there would bury the finding that matters. Ratchet toward
``response_schema_conformance`` once the annotations are filled in.

What it caught on its first run
-------------------------------
Every integer parameter in the API returned a 500 for an out-of-range value.
``file_id: int`` accepts a 20-digit number because Python ints are unbounded, and
it then reached the database as ``OverflowError: Python int too large to convert
to SQLite INTEGER`` (a numeric-range ``DataError`` on Postgres). It affected path
ids, ``skip``/``limit`` pagination, ``?patient_id=`` filters and body fields alike.
Fixed by the bounded annotations in ``app/schemas/field_types.py``; pinned by
``tests/test_resource_ids.py``.

That is also why this file is quick now: Hypothesis shrinking against those
failures is what made an early run take ten minutes. A green run is ~30s.

Determinism
-----------
``derandomize=True`` is what makes this safe to block a PR: no random seed means no
"passed on main, failed on your branch for unrelated reasons". ``max_examples`` is
deliberately modest — the value here is breadth across ~50 operations, not depth on
any one of them.
"""

import pytest
import schemathesis
from hypothesis import HealthCheck, settings
from schemathesis.checks import not_a_server_error

from app.core.auth import create_access_token
from app.core.database import get_db
from app.main import app as fastapi_app

# Excluded because they reach something the test process deliberately does not have.
# Each of these already has targeted coverage elsewhere in the suite.
_EXCLUDED_PATHS = (
    r"/signals/upload"                       # multipart + storage + celery dispatch
    r"|/generate-pdf|/download"              # storage + reportlab (also /download-pdf)
    r"|/signal-data|/plot-data|/topomap|/events"  # reads an EDF back off storage
    r"|/send-portal-email|/contact/|/admin/invite|/register/hospital"  # email side effects
)

schema = (
    schemathesis.openapi
    .from_asgi("/api/v1/openapi.json", fastapi_app)
    .exclude(path_regex=_EXCLUDED_PATHS)
)

CONTRACT_SETTINGS = settings(
    max_examples=15,
    deadline=None,
    derandomize=True,
    # Mandatory: the schema needs the function-scoped db/storage fixtures below, and
    # Hypothesis health-checks that combination by default.
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
        HealthCheck.filter_too_much,
    ],
)


@pytest.fixture
def contract_env(db_session, local_storage):
    """Point the app at the in-memory database for the duration of one test."""
    fastapi_app.dependency_overrides[get_db] = lambda: db_session
    yield
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def doctor_token(doctor_a):
    """
    A real token via the same path conftest.auth_headers uses, so the fuzzer
    exercises handler bodies rather than bouncing off the auth dependency.
    """
    return create_access_token({"sub": doctor_a.username, "user_id": doctor_a.id})


@pytest.mark.contract
@CONTRACT_SETTINGS
@schema.parametrize()
def test_no_authenticated_request_causes_a_server_error(case, contract_env, doctor_token):
    case.call_and_validate(
        headers={"Authorization": f"Bearer {doctor_token}"},
        checks=[not_a_server_error],
    )


@pytest.mark.contract
@CONTRACT_SETTINGS
@schema.parametrize()
def test_no_anonymous_request_causes_a_server_error(case, contract_env):
    """
    An unauthenticated caller must be turned away cleanly. A 500 here would mean an
    auth failure is crashing rather than refusing.
    """
    case.call_and_validate(checks=[not_a_server_error])
