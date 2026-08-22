from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt  # type: ignore[import-untyped]

from app.config import get_settings
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
