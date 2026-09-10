"""
Tests for password hashing, JWT issuance/verification, and the login endpoint.

Tokens here are minted by the real create_access_token and validated by the real
dependency chain — no mocks — so these also cover the wiring the rest of the suite
relies on.
"""

from datetime import timedelta

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core import auth as auth_module
from app.core.auth import (
    ALGORITHM,
    create_access_token,
    get_password_hash,
    verify_password,
    verify_token,
)


class TestPasswordHashing:
    def test_a_hash_verifies_against_its_password(self, password_hash, test_password):
        assert verify_password(test_password, password_hash) is True

    def test_a_wrong_password_does_not_verify(self, password_hash):
        assert verify_password("not-the-password", password_hash) is False

    def test_the_hash_is_not_the_plaintext(self, password_hash, test_password):
        assert test_password not in password_hash

    def test_hashing_is_salted(self):
        # Two hashes of the same password must differ, or a stolen database would
        # reveal which accounts share a password.
        assert get_password_hash("same") != get_password_hash("same")


class TestAccessTokens:
    def test_a_token_round_trips(self):
        token = create_access_token({"sub": "alice", "user_id": 7})
        data = verify_token(token)
        assert data.username == "alice"
        assert data.user_id == 7

    def test_an_expiry_claim_is_always_set(self):
        token = create_access_token({"sub": "alice", "user_id": 7})
        payload = jwt.decode(token, auth_module.SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload

    def test_an_expired_token_is_rejected(self):
        token = create_access_token(
            {"sub": "alice", "user_id": 7}, expires_delta=timedelta(seconds=-1)
        )
        with pytest.raises(HTTPException) as exc:
            verify_token(token)
        assert exc.value.status_code == 401

    def test_a_token_missing_sub_is_rejected(self):
        token = create_access_token({"user_id": 7})
        with pytest.raises(HTTPException) as exc:
            verify_token(token)
        assert exc.value.status_code == 401

    def test_a_token_missing_user_id_is_rejected(self):
        token = create_access_token({"sub": "alice"})
        with pytest.raises(HTTPException) as exc:
            verify_token(token)
        assert exc.value.status_code == 401

    def test_a_token_signed_with_another_key_is_rejected(self):
        forged = jwt.encode(
            {"sub": "alice", "user_id": 7}, "a-different-secret", algorithm=ALGORITHM
        )
        with pytest.raises(HTTPException) as exc:
            verify_token(forged)
        assert exc.value.status_code == 401

    def test_garbage_is_rejected(self):
        with pytest.raises(HTTPException) as exc:
            verify_token("not-a-jwt")
        assert exc.value.status_code == 401


class TestLoginEndpoint:
    def test_valid_credentials_return_a_usable_token(self, client, doctor_a, test_password):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": doctor_a.username, "password": test_password},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert verify_token(body["access_token"]).username == doctor_a.username

    def test_a_wrong_password_is_401(self, client, doctor_a):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": doctor_a.username, "password": "wrong-password"},
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Incorrect username or password"

    def test_an_unknown_username_is_401(self, client, doctor_a, test_password):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "nobody", "password": test_password},
        )
        assert response.status_code == 401

    def test_an_unknown_username_is_indistinguishable_from_a_wrong_password(
        self, client, doctor_a, test_password
    ):
        # Same status and detail either way, so the endpoint does not confirm
        # whether an account exists.
        unknown = client.post(
            "/api/v1/auth/login", json={"username": "nobody", "password": test_password}
        )
        wrong = client.post(
            "/api/v1/auth/login",
            json={"username": doctor_a.username, "password": "wrong-password"},
        )
        assert unknown.status_code == wrong.status_code
        assert unknown.json()["detail"] == wrong.json()["detail"]

    def test_an_inactive_user_is_400(self, client, inactive_user, test_password):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": inactive_user.username, "password": test_password},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Inactive user"

    def test_a_short_password_is_rejected_before_lookup(self, client):
        # UserLogin enforces min_length=6, so this never reaches the database.
        response = client.post(
            "/api/v1/auth/login", json={"username": "alice", "password": "abc"}
        )
        assert response.status_code == 422


class TestAuthenticatedRequests:
    def test_a_minted_token_is_accepted_by_a_protected_route(
        self, client, doctor_a, auth_headers
    ):
        response = client.get("/api/v1/signals/files", headers=auth_headers(doctor_a))
        assert response.status_code == 200

    def test_no_credentials_is_401(self, client):
        assert client.get("/api/v1/signals/files").status_code == 401

    def test_a_malformed_bearer_token_is_401(self, client):
        response = client.get(
            "/api/v1/signals/files", headers={"Authorization": "Bearer nonsense"}
        )
        assert response.status_code == 401

    def test_a_token_for_a_deleted_user_is_401(self, client, db_session, doctor_a, auth_headers):
        headers = auth_headers(doctor_a)
        db_session.delete(doctor_a)
        db_session.commit()

        assert client.get("/api/v1/signals/files", headers=headers).status_code == 401

    def test_a_token_for_a_deactivated_user_is_rejected(
        self, client, db_session, doctor_a, auth_headers
    ):
        headers = auth_headers(doctor_a)
        doctor_a.is_active = False
        db_session.commit()

        assert client.get("/api/v1/signals/files", headers=headers).status_code == 400
