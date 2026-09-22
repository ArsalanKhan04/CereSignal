"""
The client log sink (POST /logs/client) and the request-logging middleware.

Input hardening for /logs/client (length caps, newline escaping) lives in
test_hardening.py; this covers level routing and the request id round trip.
"""

import logging

import pytest


@pytest.fixture
def app_log(caplog):
    caplog.set_level(logging.DEBUG, logger="ceresignal")
    return caplog


class TestClientLogs:
    @pytest.mark.parametrize("level, expected", [
        ("debug", logging.DEBUG),
        ("info", logging.INFO),
        ("warn", logging.WARNING),
        ("warning", logging.WARNING),
        ("error", logging.ERROR),
    ])
    def test_each_level_is_routed(self, client, app_log, level, expected):
        response = client.post(
            "/api/v1/logs/client", json={"level": level, "message": f"from-client-{level}"}
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        [record] = [r for r in app_log.records if r.getMessage() == f"from-client-{level}"]
        assert record.levelno == expected
        assert record.source == "client"

    def test_an_unknown_level_is_rejected(self, client):
        response = client.post("/api/v1/logs/client", json={"level": "critical", "message": "x"})
        assert response.status_code == 422

    def test_context_and_request_id_are_attached(self, client, app_log):
        client.post("/api/v1/logs/client", json={
            "level": "info", "message": "with-extras",
            "context": "Upload", "request_id": "req-1", "data": {"k": 1},
        })

        [record] = [r for r in app_log.records if r.getMessage() == "with-extras"]
        assert record.context == "Upload"
        assert record.request_id == "req-1"
        assert record.data == {"k": 1}


class TestRequestIdMiddleware:
    def test_a_supplied_request_id_is_echoed(self, client):
        response = client.get("/health", headers={"X-Request-ID": "trace-me"})
        assert response.headers["X-Request-ID"] == "trace-me"

    def test_one_is_minted_when_absent(self, client):
        first = client.get("/health").headers["X-Request-ID"]
        second = client.get("/health").headers["X-Request-ID"]

        assert first and second
        assert first != second
