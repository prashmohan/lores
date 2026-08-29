from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt  # type: ignore[import-untyped]
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import MagicAuthToken
from app.schemas.auth import (
    OTPRequest,
    OTPResponse,
    OTPVerifyRequest,
    TokenPayload,
    TokenResponse,
    UserRead,
)
from app.services.auth_service import (
    decode_token,
    generate_numeric_otp,
    request_otp,
    revoke_user_tokens,
    verify_otp,
)


def test_generate_numeric_otp():
    otp = generate_numeric_otp(6)
    assert len(otp) == 6
    assert otp.isdigit()


def test_otp_flow_generates_and_verifies_code(db_session):
    email = "grandma@example.com"
    token_record, raw_otp = request_otp(db_session, email=email, display_name="Grandma Rose")
    db_session.commit()

    assert len(raw_otp) == 6
    assert raw_otp.isdigit()
    assert token_record.email == email
    assert token_record.used_at is None
    token_exp = (
        token_record.expires_at
        if token_record.expires_at.tzinfo
        else token_record.expires_at.replace(tzinfo=UTC)
    )
    assert token_exp > datetime.now(UTC)

    # Verify with correct code
    user, jwt_token = verify_otp(db_session, email=email, code=raw_otp)
    db_session.commit()

    assert user.email == email
    assert user.display_name == "Grandma Rose"
    assert user.last_login_at is not None
    assert jwt_token is not None

    # Token payload
    payload = decode_token(jwt_token)
    assert payload["sub"] == str(user.id)
    assert payload["email"] == email


def test_otp_rejects_incorrect_code(db_session):
    email = "uncle@example.com"
    request_otp(db_session, email=email, display_name="Uncle Bob")
    db_session.commit()

    with pytest.raises(ValueError, match="Invalid or expired"):
        verify_otp(db_session, email=email, code="000000")


def test_otp_rejects_expired_code(db_session):
    email = "cousin@example.com"
    token_record, raw_otp = request_otp(db_session, email=email, display_name="Cousin Vinny")
    token_record.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    db_session.commit()

    with pytest.raises(ValueError, match="Invalid or expired"):
        verify_otp(db_session, email=email, code=raw_otp)


def test_otp_cannot_be_reused(db_session):
    email = "aunt@example.com"
    _token_record, raw_otp = request_otp(db_session, email=email, display_name="Aunt May")
    db_session.commit()

    # First verification succeeds
    user, _jwt_token = verify_otp(db_session, email=email, code=raw_otp)
    db_session.commit()
    assert user is not None

    # Second verification fails
    with pytest.raises(ValueError, match="Invalid or expired"):
        verify_otp(db_session, email=email, code=raw_otp)


def test_otp_email_normalization(db_session):
    messy_email = "  NePhew@Example.COM  "
    _token_record, raw_otp = request_otp(db_session, email=messy_email, display_name="Nephew Sam")
    db_session.commit()

    user, _jwt_token = verify_otp(db_session, email="nephew@example.com", code=raw_otp)
    assert user.email == "nephew@example.com"
    assert user.display_name == "Nephew Sam"


def test_request_otp_default_display_name(db_session):
    email = "lucy.vanpelt@example.com"
    _token_record, raw_otp = request_otp(db_session, email=email)
    db_session.commit()

    user, _jwt_token = verify_otp(db_session, email=email, code=raw_otp)
    assert user.display_name == "Lucy.vanpelt"


def test_decode_token_invalid():
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token("not.a.valid.jwt.token")


def test_decode_token_expired():
    settings = get_settings()
    past_payload = {
        "sub": "user-123",
        "email": "test@example.com",
        "exp": datetime.now(UTC) - timedelta(hours=1),
    }
    raw_expired = jwt.encode(past_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    with pytest.raises(ValueError, match="Invalid token"):
        decode_token(raw_expired)


def test_auth_schemas():
    req = OTPRequest(email="test@example.com", display_name="Tester")
    assert req.email == "test@example.com"
    assert req.display_name == "Tester"

    resp = OTPResponse(message="Code sent", email="test@example.com")
    assert resp.email == "test@example.com"

    verify_req = OTPVerifyRequest(email="test@example.com", code="123456")
    assert verify_req.code == "123456"

    token_resp = TokenResponse(access_token="abc.def.ghi")
    assert token_resp.token_type == "bearer"

    payload = TokenPayload(sub="123", email="test@example.com")
    assert payload.sub == "123"

    user_data = {
        "id": "12345678-1234-5678-1234-567812345678",
        "email": "user@example.com",
        "display_name": "Test User",
        "is_superadmin": True,
        "created_at": datetime.now(UTC),
        "last_login_at": datetime.now(UTC),
    }
    user_read = UserRead.model_validate(user_data)
    assert user_read.email == "user@example.com"
    assert user_read.is_superadmin is True


def test_request_new_otp_invalidates_prior_pending_otp(db_session):
    email = "grandpa@example.com"
    token1, otp1 = request_otp(db_session, email=email, display_name="Grandpa Joe")
    db_session.commit()

    # Simulate 65 seconds passed so the second request passes the cooldown check
    token1.created_at = datetime.now(UTC) - timedelta(seconds=65)
    db_session.commit()

    token2, otp2 = request_otp(db_session, email=email, display_name="Grandpa Joe")
    db_session.commit()

    db_session.refresh(token1)
    db_session.refresh(token2)
    assert token1.used_at is not None
    assert token2.used_at is None

    # First OTP must fail because it was invalidated by the second request
    with pytest.raises(ValueError, match="Invalid or expired"):
        verify_otp(db_session, email=email, code=otp1)

    # Second OTP succeeds
    user, jwt_token = verify_otp(db_session, email=email, code=otp2)
    assert user.email == email
    assert jwt_token is not None


def test_otp_lockout_after_5_failed_attempts(db_session):
    email = "lockout_target@example.com"
    token, valid_otp = request_otp(db_session, email=email, display_name="Target")
    db_session.commit()

    # 4 incorrect attempts
    for _ in range(4):
        with pytest.raises(ValueError, match="Invalid or expired"):
            verify_otp(db_session, email=email, code="000000")
        db_session.commit()

    db_session.refresh(token)
    assert token.failed_attempts == 4
    assert token.used_at is None

    # 5th incorrect attempt -> triggers lockout and invalidates token
    with pytest.raises(ValueError, match="Too many failed attempts"):
        verify_otp(db_session, email=email, code="000000")
    db_session.commit()

    db_session.refresh(token)
    assert token.failed_attempts == 5
    assert token.used_at is not None

    # Subsequent attempt even with the correct valid OTP must fail
    with pytest.raises(ValueError, match="Invalid or expired"):
        verify_otp(db_session, email=email, code=valid_otp)


def test_auth_config_and_google_schemas():
    from app.schemas.auth import AuthConfigResponse, GoogleAuthRequest

    req = GoogleAuthRequest(credential="mock_id_token_xyz")
    assert req.credential == "mock_id_token_xyz"

    cfg_enabled = AuthConfigResponse(
        google_client_id="test-client-id.apps.googleusercontent.com", google_auth_enabled=True
    )
    assert cfg_enabled.google_auth_enabled is True
    assert cfg_enabled.google_client_id == "test-client-id.apps.googleusercontent.com"

    cfg_disabled = AuthConfigResponse(google_client_id=None, google_auth_enabled=False)
    assert cfg_disabled.google_auth_enabled is False
    assert cfg_disabled.google_client_id is None


def test_google_client_secret_setting(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    settings = Settings(_env_file=None)
    assert settings.GOOGLE_CLIENT_SECRET is None

    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-secret-12345")
    settings_with_secret = Settings(_env_file=None)
    assert settings_with_secret.GOOGLE_CLIENT_SECRET == "test-secret-12345"


def test_request_otp_cooldown_rate_limit(db_session):
    email = "rapid_requester@example.com"
    _token1, _otp1 = request_otp(db_session, email=email, display_name="Rapid User")
    db_session.commit()

    # Consecutive request within 60 seconds raises ValueError
    with pytest.raises(ValueError, match="Please wait 60 seconds before requesting another OTP."):
        request_otp(db_session, email=email, display_name="Rapid User")


def test_api_request_otp_rate_limiting_429():
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
        # First request succeeds with 200
        res1 = c.post(
            "/api/v1/auth/request-otp",
            json={"email": "cooldown_test@example.com", "display_name": "Cooldown Tester"},
        )
        assert res1.status_code == 200

        # Rapid consecutive request returns 429 Too Many Requests
        res2 = c.post(
            "/api/v1/auth/request-otp",
            json={"email": "cooldown_test@example.com", "display_name": "Cooldown Tester"},
        )
        assert res2.status_code == 429
        assert "Please wait 60 seconds" in res2.json()["detail"]

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_token_version_and_token_revocation():
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
        db = TestingSessionLocal()
        _tok, otp = request_otp(db, email="revokeme@example.com", display_name="Revoke Me")
        db.commit()

        user, token = verify_otp(db, email="revokeme@example.com", code=otp)
        db.commit()

        # Check payload contains token_version
        payload = decode_token(token)
        assert payload.get("token_version") == 1
        assert user.token_version == 1

        # Access protected endpoint succeeds
        headers = {"Authorization": f"Bearer {token}"}
        resp = c.get("/api/v1/auth/me", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == "revokeme@example.com"

        # Revoke user tokens by incrementing token_version
        revoke_user_tokens(db, user)
        db.commit()
        assert user.token_version == 2

        # Access with old token fails with 401 Unauthorized
        resp_revoked = c.get("/api/v1/auth/me", headers=headers)
        assert resp_revoked.status_code == 401
        assert resp_revoked.json()["detail"] == "Token has been revoked or expired"

        # Simulate cooldown passed for next login
        tokens = db.query(MagicAuthToken).filter_by(email="revokeme@example.com").all()
        for t in tokens:
            t.created_at = datetime.now(UTC) - timedelta(seconds=70)
        db.commit()

        # New login generates token with updated token_version == 2 and succeeds
        _tok2, otp2 = request_otp(db, email="revokeme@example.com", display_name="Revoke Me")
        db.commit()
        _user2, new_token = verify_otp(db, email="revokeme@example.com", code=otp2)
        db.commit()

        new_payload = decode_token(new_token)
        assert new_payload.get("token_version") == 2

        resp_new = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        assert resp_new.status_code == 200
        assert resp_new.json()["email"] == "revokeme@example.com"

        # Calling logout endpoint revokes the token
        logout_resp = c.post(
            "/api/v1/auth/logout", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert logout_resp.status_code == 200
        assert logout_resp.json()["message"] == "Successfully logged out"

        # After logout, the token is now revoked
        resp_after_logout = c.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert resp_after_logout.status_code == 401
        assert resp_after_logout.json()["detail"] == "Token has been revoked or expired"

        db.close()

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
