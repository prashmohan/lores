from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import decode_token, verify_google_id_token

_ = models


@pytest.fixture(name="client")
def fixture_client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_verify_google_id_token_new_user(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"

    mock_payload = {
        "email": "new_google_user@example.com",
        "name": "Jane Doe",
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "https://accounts.google.com",
    }

    with patch(
        "app.services.auth_service._verify_google_token_payload",
        return_value=mock_payload,
    ):
        user, token = verify_google_id_token(db_session, "valid_mock_id_token")
        db_session.commit()

        assert user.email == "new_google_user@example.com"
        assert user.display_name == "Jane Doe"
        assert user.last_login_at is not None

        payload = decode_token(token)
        assert payload["sub"] == str(user.id)
        assert payload["email"] == "new_google_user@example.com"


def test_verify_google_id_token_existing_user_matching(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"

    existing = User(email="existing@example.com", display_name="Original Name")
    db_session.add(existing)
    db_session.commit()

    mock_payload = {
        "email": "EXISTING@example.COM",
        "name": "Ignored Name",
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "accounts.google.com",
    }

    with patch(
        "app.services.auth_service._verify_google_token_payload",
        return_value=mock_payload,
    ):
        user, token = verify_google_id_token(db_session, "valid_mock_id_token")
        db_session.commit()

        assert user.id == existing.id
        assert user.email == "existing@example.com"
        assert user.display_name == "Original Name"
        assert token is not None


def test_verify_google_id_token_unverified_email_fails(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"

    mock_payload = {
        "email": "unverified@example.com",
        "email_verified": False,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "https://accounts.google.com",
    }

    with (
        patch(
            "app.services.auth_service._verify_google_token_payload",
            return_value=mock_payload,
        ),
        pytest.raises(ValueError, match="Google email is not verified"),
    ):
        verify_google_id_token(db_session, "unverified_id_token")


@pytest.mark.parametrize("email_val", [None, ""])
def test_verify_google_id_token_missing_email_fails(db_session, email_val):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"

    mock_payload = {
        "email": email_val,
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "https://accounts.google.com",
    }

    with (
        patch(
            "app.services.auth_service._verify_google_token_payload",
            return_value=mock_payload,
        ),
        pytest.raises(ValueError, match="Google ID token missing email claim"),
    ):
        verify_google_id_token(db_session, "missing_email_token")


def test_verify_google_id_token_not_configured(db_session):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = None
        with pytest.raises(ValueError, match="Google SSO is not configured on this server"):
            verify_google_id_token(db_session, "any_token")
    finally:
        settings.GOOGLE_CLIENT_ID = orig


def test_api_auth_config_enabled(client):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
        resp = client.get("/api/v1/auth/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["google_auth_enabled"] is True
        assert data["google_client_id"] == "test-client-id.apps.googleusercontent.com"
    finally:
        settings.GOOGLE_CLIENT_ID = orig


def test_api_auth_config_disabled(client):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = None
        resp = client.get("/api/v1/auth/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["google_auth_enabled"] is False
        assert data["google_client_id"] is None
    finally:
        settings.GOOGLE_CLIENT_ID = orig


def test_api_auth_google_success(client):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"

        mock_payload = {
            "email": "api_google@example.com",
            "name": "API Google User",
            "email_verified": True,
            "aud": settings.GOOGLE_CLIENT_ID,
            "iss": "accounts.google.com",
        }

        with patch(
            "app.services.auth_service._verify_google_token_payload",
            return_value=mock_payload,
        ):
            resp = client.post("/api/v1/auth/google", json={"credential": "mock_valid_token"})
            assert resp.status_code == 200
            data = resp.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"
            assert data["user"]["email"] == "api_google@example.com"
            assert data["user"]["display_name"] == "API Google User"
    finally:
        settings.GOOGLE_CLIENT_ID = orig


def test_api_auth_google_invalid_token(client):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"

        with patch(
            "app.services.auth_service._verify_google_token_payload",
            side_effect=ValueError("Invalid signature"),
        ):
            resp = client.post("/api/v1/auth/google", json={"credential": "bad_token"})
            assert resp.status_code == 400
            assert "Invalid signature" in resp.json()["detail"]
    finally:
        settings.GOOGLE_CLIENT_ID = orig


def test_verify_google_token_payload_jwks_caching():
    import base64
    from unittest.mock import MagicMock

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from jose import jwt

    from app.services import auth_service

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()

    def int_to_b64(val: int) -> str:
        s = val.to_bytes((val.bit_length() + 7) // 8, byteorder="big")
        return base64.urlsafe_b64encode(s).decode("utf-8").rstrip("=")

    jwk_dict = {
        "kty": "RSA",
        "kid": "test-kid-123",
        "use": "sig",
        "alg": "RS256",
        "n": int_to_b64(public_numbers.n),
        "e": int_to_b64(public_numbers.e),
    }

    pem_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    token = jwt.encode(
        {
            "aud": "test-client-id",
            "iss": "https://accounts.google.com",
            "email": "test@example.com",
        },
        pem_bytes.decode("utf-8"),
        algorithm="RS256",
        headers={"kid": "test-kid-123"},
    )

    auth_service._google_jwks_cache = {"keys": [], "expires_at": 0.0}

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"keys": [jwk_dict]}

    with patch("httpx.get", return_value=mock_resp) as mock_get:
        # First call: cache miss, calls httpx.get
        payload = auth_service._verify_google_token_payload(token, "test-client-id")
        assert payload["email"] == "test@example.com"
        assert mock_get.call_count == 1

        # Second call: cache hit, doesn't call httpx.get
        payload2 = auth_service._verify_google_token_payload(token, "test-client-id")
        assert payload2["email"] == "test@example.com"
        assert mock_get.call_count == 1
