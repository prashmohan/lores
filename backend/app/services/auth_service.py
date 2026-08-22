import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt  # type: ignore[import-untyped]
from passlib.context import CryptContext  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.user import MagicAuthToken, User

# Ensure passlib compatibility with modern bcrypt (>=4.1.0 / 5.0.0)
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = type("about", (), {"__version__": bcrypt.__version__})  # type: ignore[attr-defined]

_orig_hashpw = bcrypt.hashpw


def _safe_hashpw(password: bytes, salt: bytes) -> bytes:
    if isinstance(password, (bytes, bytearray)) and len(password) > 72:
        password = password[:72]
    return _orig_hashpw(password, salt)


bcrypt.hashpw = _safe_hashpw  # type: ignore[assignment]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP string of given length."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def request_otp(
    db: Session, email: str, display_name: str | None = None
) -> tuple[MagicAuthToken, str]:
    """Generate a passwordless numeric OTP and associated token secret for email login."""
    clean_email = email.lower().strip()
    now = datetime.now(UTC)

    # Invalidate all active/pending tokens for this email so only the newly generated OTP is valid
    active_tokens_stmt = select(MagicAuthToken).where(
        MagicAuthToken.email == clean_email,
        MagicAuthToken.used_at.is_(None),
    )
    for active_token in db.scalars(active_tokens_stmt).all():
        active_token.used_at = now

    raw_otp = generate_numeric_otp(6)
    code_hash = pwd_context.hash(raw_otp)
    token_secret = secrets.token_urlsafe(32)
    expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    auth_token = MagicAuthToken(
        email=clean_email,
        code_hash=code_hash,
        token_secret=token_secret,
        expires_at=expires_at,
    )
    db.add(auth_token)

    # Ensure user exists or prepare stub
    stmt = select(User).where(User.email == clean_email)
    user = db.scalar(stmt)
    if not user:
        user = User(
            email=clean_email,
            display_name=display_name or clean_email.split("@")[0].capitalize(),
        )
        db.add(user)

    db.flush()
    return auth_token, raw_otp


def verify_otp(db: Session, email: str, code: str) -> tuple[User, str]:
    """Verify an active numeric OTP code and issue a JWT session token."""
    clean_email = email.lower().strip()
    now = datetime.now(UTC)

    stmt = (
        select(MagicAuthToken)
        .where(
            MagicAuthToken.email == clean_email,
            MagicAuthToken.used_at.is_(None),
        )
        .order_by(MagicAuthToken.created_at.desc())
    )

    tokens = list(db.scalars(stmt).all())
    valid_token: MagicAuthToken | None = None

    for t in tokens:
        token_exp = t.expires_at if t.expires_at.tzinfo else t.expires_at.replace(tzinfo=UTC)
        if token_exp > now and pwd_context.verify(code, t.code_hash):
            valid_token = t
            break

    if not valid_token:
        raise ValueError("Invalid or expired authentication code")

    valid_token.used_at = now

    user_stmt = select(User).where(User.email == clean_email)
    user = db.scalar(user_stmt)
    if not user:
        user = User(email=clean_email, display_name=clean_email.split("@")[0].capitalize())
        db.add(user)

    user.last_login_at = now
    db.flush()
    jwt_token = create_access_token({"sub": str(user.id), "email": user.email})
    return user, jwt_token


def create_access_token(data: dict[str, Any]) -> str:
    """Create a signed JWT access token with expiration."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return str(jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM))


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as e:
        raise ValueError("Invalid token") from e
