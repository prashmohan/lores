import time
from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import (
    decode_token,
    exchange_google_code_for_user,
    generate_oauth_state,
    validate_oauth_state,
)

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


def test_generate_and_validate_oauth_state_default_target():
    state = generate_oauth_state()
    assert isinstance(state, str)
    payload = validate_oauth_state(state)
    assert payload["target"] == "/"
    assert payload["type"] == "oauth_state"
    assert "nonce" in payload
    assert len(payload["nonce"]) > 0
    assert "exp" in payload


def test_generate_and_validate_oauth_state_custom_target():
    state = generate_oauth_state(redirect_target="/workspace/123/tree?focus=456")
    assert isinstance(state, str)
    payload = validate_oauth_state(state)
    assert payload["target"] == "/workspace/123/tree?focus=456"
    assert payload["type"] == "oauth_state"


def test_validate_oauth_state_tampered_fails():
    state = generate_oauth_state(redirect_target="/tree")
    parts = state.split(".")
    # Tamper with payload
    tampered_state = f"{parts[0]}.{parts[1]}xyz.{parts[2]}"
    with pytest.raises(ValueError, match="Invalid state token"):
        validate_oauth_state(tampered_state)


def test_validate_oauth_state_invalid_string_fails():
    with pytest.raises(ValueError, match="Invalid state token"):
        validate_oauth_state("not-a-valid-jwt-token")


def test_validate_oauth_state_expired_fails():
    settings = get_settings()
    expired_payload = {
        "nonce": "testnonce",
        "target": "/tree",
        "exp": int(time.time()) - 60,  # 1 minute in the past
        "type": "oauth_state",
    }
    expired_state = jwt.encode(
        expired_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    with pytest.raises(ValueError, match="Invalid state token"):
        validate_oauth_state(expired_state)


def test_validate_oauth_state_wrong_type_fails():
    settings = get_settings()
    wrong_type_payload = {
        "nonce": "testnonce",
        "target": "/tree",
        "exp": int(time.time()) + 600,
        "type": "access_token",
    }
    wrong_state = jwt.encode(
        wrong_type_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    with pytest.raises(ValueError, match="Invalid state token"):
        validate_oauth_state(wrong_state)


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_not_configured_missing_client_id(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = None
        settings.GOOGLE_CLIENT_SECRET = "some-secret"
        with pytest.raises(ValueError, match="Google OAuth is not configured on this server"):
            await exchange_google_code_for_user(
                db_session, "auth-code", "http://localhost/callback"
            )
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_not_configured_missing_client_secret(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "some-client-id"
        settings.GOOGLE_CLIENT_SECRET = None
        with pytest.raises(ValueError, match="Google OAuth is not configured on this server"):
            await exchange_google_code_for_user(
                db_session, "auth-code", "http://localhost/callback"
            )
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_google_error_status(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "mock-client-secret"

        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.text = '{"error": "invalid_grant", "error_description": "Bad Request"}'

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            with pytest.raises(ValueError, match="Google token exchange failed"):
                await exchange_google_code_for_user(
                    db_session, "invalid-code", "http://localhost/callback"
                )
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_missing_id_token(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "mock-client-secret"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"access_type": "bearer", "expires_in": 3600}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            with pytest.raises(ValueError, match="Google did not return an id_token"):
                await exchange_google_code_for_user(
                    db_session, "valid-code", "http://localhost/callback"
                )
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_success_new_user(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "mock-client-secret"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "access_token": "ya29.mock-access-token",
            "id_token": "mock-id-token-jwt",
            "token_type": "Bearer",
            "expires_in": 3599,
        }

        mock_id_payload = {
            "email": "redirect_user@example.com",
            "name": "Redirect User",
            "email_verified": True,
            "aud": settings.GOOGLE_CLIENT_ID,
            "iss": "https://accounts.google.com",
        }

        with (
            patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
            patch(
                "app.services.auth_service._verify_google_token_payload",
                return_value=mock_id_payload,
            ),
        ):
            mock_post.return_value = mock_resp

            user, session_token = await exchange_google_code_for_user(
                db_session,
                code="mock-valid-auth-code",
                redirect_uri="http://localhost:8000/api/v1/auth/google/callback",
            )
            db_session.commit()

            assert user.email == "redirect_user@example.com"
            assert user.display_name == "Redirect User"
            assert user.last_login_at is not None

            # Verify session token
            decoded = decode_token(session_token)
            assert decoded["sub"] == str(user.id)
            assert decoded["email"] == "redirect_user@example.com"

            # Check post call parameters
            mock_post.assert_called_once()
            call_kwargs = mock_post.call_args.kwargs
            assert call_kwargs["data"]["code"] == "mock-valid-auth-code"
            assert call_kwargs["data"]["client_id"] == "mock-client-id.apps.googleusercontent.com"
            assert call_kwargs["data"]["client_secret"] == "mock-client-secret"
            assert (
                call_kwargs["data"]["redirect_uri"]
                == "http://localhost:8000/api/v1/auth/google/callback"
            )
            assert call_kwargs["data"]["grant_type"] == "authorization_code"
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


@pytest.mark.asyncio
async def test_exchange_google_code_for_user_success_existing_user(db_session):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "mock-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "mock-client-secret"

        existing_user = User(email="existing_redirect@example.com", display_name="Old Name")
        db_session.add(existing_user)
        db_session.commit()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "access_token": "ya29.mock-access-token",
            "id_token": "mock-id-token-jwt",
        }

        mock_id_payload = {
            "email": "EXISTING_REDIRECT@EXAMPLE.COM",
            "name": "Ignored New Name",
            "email_verified": True,
            "aud": settings.GOOGLE_CLIENT_ID,
            "iss": "https://accounts.google.com",
        }

        with (
            patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post,
            patch(
                "app.services.auth_service._verify_google_token_payload",
                return_value=mock_id_payload,
            ),
        ):
            mock_post.return_value = mock_resp

            user, session_token = await exchange_google_code_for_user(
                db_session,
                code="mock-code",
                redirect_uri="http://localhost:8000/api/v1/auth/google/callback",
            )
            db_session.commit()

            assert user.id == existing_user.id
            assert user.email == "existing_redirect@example.com"
            assert user.display_name == "Old Name"
            assert session_token is not None
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


def test_api_google_authorize_redirect_success(client):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "test-client-secret"

        response = client.get("/api/v1/auth/google/authorize", follow_redirects=False)
        assert response.status_code == 302
        location = response.headers["location"]
        assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")

        parsed = urlparse(location)
        params = parse_qs(parsed.query)

        assert params["client_id"] == ["test-client-id.apps.googleusercontent.com"]
        assert params["response_type"] == ["code"]
        assert params["scope"] == ["openid email profile"]
        assert params["prompt"] == ["select_account"]
        assert params["access_type"] == ["online"]
        assert params["redirect_uri"] == [
            f"{settings.APP_URL.rstrip('/')}/api/v1/auth/google/callback"
        ]

        state_token = params["state"][0]
        state_payload = validate_oauth_state(state_token)
        assert state_payload["target"] == "/"
        assert state_payload["type"] == "oauth_state"
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


def test_api_google_authorize_custom_redirect_target(client):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "test-client-secret"

        response = client.get(
            "/api/v1/auth/google/authorize?redirect_target=/workspace/123/tree?focus=456",
            follow_redirects=False,
        )
        assert response.status_code == 302
        location = response.headers["location"]

        parsed = urlparse(location)
        params = parse_qs(parsed.query)
        state_token = params["state"][0]
        state_payload = validate_oauth_state(state_token)
        assert state_payload["target"] == "/workspace/123/tree?focus=456"
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


def test_api_google_authorize_not_configured_missing_client_id(client):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = None
        settings.GOOGLE_CLIENT_SECRET = "test-client-secret"

        response = client.get("/api/v1/auth/google/authorize", follow_redirects=False)
        assert response.status_code == 503
        assert response.json()["detail"] == "Google SSO is not configured."
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


def test_api_google_authorize_not_configured_missing_client_secret(client):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = None

        response = client.get("/api/v1/auth/google/authorize", follow_redirects=False)
        assert response.status_code == 503
        assert response.json()["detail"] == "Google SSO is not configured."
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret


def test_api_google_authorize_fallback_to_request_base_url(client):
    settings = get_settings()
    orig_id = settings.GOOGLE_CLIENT_ID
    orig_secret = settings.GOOGLE_CLIENT_SECRET
    orig_app_url = settings.APP_URL
    try:
        settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
        settings.GOOGLE_CLIENT_SECRET = "test-client-secret"
        settings.APP_URL = ""

        response = client.get("/api/v1/auth/google/authorize", follow_redirects=False)
        assert response.status_code == 302
        location = response.headers["location"]

        parsed = urlparse(location)
        params = parse_qs(parsed.query)
        assert params["redirect_uri"] == ["http://testserver/api/v1/auth/google/callback"]
    finally:
        settings.GOOGLE_CLIENT_ID = orig_id
        settings.GOOGLE_CLIENT_SECRET = orig_secret
        settings.APP_URL = orig_app_url


def test_api_google_callback_with_error_query_param(client):
    response = client.get(
        "/api/v1/auth/google/callback?error=access_denied", follow_redirects=False
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/?error=google_auth_failed"


def test_api_google_callback_missing_code_or_state(client):
    # Missing all
    resp1 = client.get("/api/v1/auth/google/callback", follow_redirects=False)
    assert resp1.status_code == 302
    assert resp1.headers["location"] == "/?error=google_auth_failed"

    # Missing state
    resp2 = client.get("/api/v1/auth/google/callback?code=mock_code", follow_redirects=False)
    assert resp2.status_code == 302
    assert resp2.headers["location"] == "/?error=google_auth_failed"

    # Missing code
    resp3 = client.get("/api/v1/auth/google/callback?state=mock_state", follow_redirects=False)
    assert resp3.status_code == 302
    assert resp3.headers["location"] == "/?error=google_auth_failed"


def test_api_google_callback_invalid_or_expired_state(client):
    # Invalid JWT
    resp1 = client.get(
        "/api/v1/auth/google/callback?code=mock_code&state=invalid.jwt.token",
        follow_redirects=False,
    )
    assert resp1.status_code == 302
    assert resp1.headers["location"] == "/?error=invalid_state"

    # Expired state
    settings = get_settings()
    expired_payload = {
        "nonce": "testnonce",
        "target": "/tree",
        "exp": int(time.time()) - 60,
        "type": "oauth_state",
    }
    expired_state = jwt.encode(
        expired_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )
    resp2 = client.get(
        f"/api/v1/auth/google/callback?code=mock_code&state={expired_state}", follow_redirects=False
    )
    assert resp2.status_code == 302
    assert resp2.headers["location"] == "/?error=invalid_state"


def test_api_google_callback_exchange_failure(client):
    valid_state = generate_oauth_state("/tree")
    with patch(
        "app.services.auth_service.exchange_google_code_for_user",
        new_callable=AsyncMock,
        side_effect=ValueError("Exchange failed"),
    ):
        response = client.get(
            f"/api/v1/auth/google/callback?code=bad_code&state={valid_state}",
            follow_redirects=False,
        )
        assert response.status_code == 302
        assert response.headers["location"] == "/?error=google_exchange_failed"


def test_api_google_callback_success_default_target(client):
    valid_state = generate_oauth_state("/")
    mock_user = User(email="callback_user@example.com", display_name="Callback User")
    mock_user.id = "user-12345"

    with patch(
        "app.services.auth_service.exchange_google_code_for_user",
        new_callable=AsyncMock,
        return_value=(mock_user, "mock_jwt_session_token_123"),
    ):
        response = client.get(
            f"/api/v1/auth/google/callback?code=valid_code&state={valid_state}",
            follow_redirects=False,
        )
        assert response.status_code == 302
        assert response.headers["location"] == "/?token=mock_jwt_session_token_123"


def test_api_google_callback_success_custom_target_with_query_params(client):
    valid_state = generate_oauth_state("/workspace/123/tree?focus=456")
    mock_user = User(email="callback_user@example.com", display_name="Callback User")
    mock_user.id = "user-12345"

    with patch(
        "app.services.auth_service.exchange_google_code_for_user",
        new_callable=AsyncMock,
        return_value=(mock_user, "mock_jwt_session_token_xyz"),
    ):
        response = client.get(
            f"/api/v1/auth/google/callback?code=valid_code&state={valid_state}",
            follow_redirects=False,
        )
        assert response.status_code == 302
        assert (
            response.headers["location"]
            == "/workspace/123/tree?focus=456&token=mock_jwt_session_token_xyz"
        )
