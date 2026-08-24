import secrets
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import httpx
from jose import JWTError, jwk, jwt  # type: ignore[import-untyped]
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


_DUMMY_BCRYPT_HASH = "$2b$12$e8Y6/5M5p4m/5dG5wQyQeeVbZ81ZpA.Jq8uM2W3w2bZ81ZpA.Jq8u"


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
    if not tokens:
        # Constant-time dummy verification to mitigate timing-based account enumeration
        pwd_context.verify(code, _DUMMY_BCRYPT_HASH)
        raise ValueError("Invalid or expired authentication code")

    valid_token: MagicAuthToken | None = None

    for t in tokens:
        token_exp = t.expires_at if t.expires_at.tzinfo else t.expires_at.replace(tzinfo=UTC)
        if token_exp <= now:
            t.used_at = now
            continue

        if t.failed_attempts >= 5:
            t.used_at = now
            continue

        if pwd_context.verify(code, t.code_hash):
            valid_token = t
            break
        else:
            t.failed_attempts += 1
            if t.failed_attempts >= 5:
                t.used_at = now
                db.flush()
                raise ValueError(
                    "Too many failed attempts. This code is now invalidated. Please request a new code."
                )
            db.flush()

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


_google_jwks_cache: dict[str, Any] = {"keys": [], "expires_at": 0.0}


def _verify_google_token_payload(id_token: str, client_id: str) -> dict[str, Any]:
    """Verify Google ID token against Google's public JWKS certs."""
    # 1. Fetch unverified header to get kid
    unverified_header = jwt.get_unverified_header(id_token)
    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Invalid Google token: missing key id")

    # 2. Fetch Google public JWKS certs (using in-memory cache)
    now_ts = time.time()
    keys: list[dict[str, Any]] = _google_jwks_cache.get("keys", [])
    expires_at: float = float(_google_jwks_cache.get("expires_at", 0.0))

    key_dict = next((k for k in keys if k.get("kid") == kid), None) if now_ts < expires_at else None

    if not key_dict:
        resp = httpx.get("https://www.googleapis.com/oauth2/v3/certs", timeout=10.0)
        if resp.status_code != 200:
            raise ValueError("Failed to fetch Google authentication certificates")
        keys = resp.json().get("keys", [])
        _google_jwks_cache["keys"] = keys
        _google_jwks_cache["expires_at"] = now_ts + 3600.0
        key_dict = next((k for k in keys if k.get("kid") == kid), None)

    if not key_dict:
        raise ValueError("Google authentication key not found")

    public_key = jwk.construct(key_dict)

    # 3. Decode & verify claims
    payload: dict[str, Any] = jwt.decode(
        id_token,
        public_key.to_pem().decode("utf-8"),
        algorithms=["RS256"],
        audience=client_id,
        issuer=["accounts.google.com", "https://accounts.google.com"],
    )
    return payload


def verify_google_id_token(db: Session, id_token: str) -> tuple[User, str]:
    """Verify a Google ID token and return/provision the User and a Lores JWT session."""
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google SSO is not configured on this server")

    try:
        payload = _verify_google_token_payload(id_token, settings.GOOGLE_CLIENT_ID)
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Invalid Google ID token: {e}") from e

    if not payload.get("email_verified"):
        raise ValueError("Google email is not verified")

    email = str(payload.get("email") or "").lower().strip()
    if not email:
        raise ValueError("Google ID token missing email claim")

    now = datetime.now(UTC)
    stmt = select(User).where(User.email == email)
    user = db.scalar(stmt)

    if not user:
        name = payload.get("name") or email.split("@")[0].capitalize()
        user = User(email=email, display_name=name)
        db.add(user)

    user.last_login_at = now
    db.flush()

    jwt_token = create_access_token({"sub": str(user.id), "email": user.email})
    return user, jwt_token


def generate_oauth_state(redirect_target: str = "/") -> str:
    """Generate a signed, short-lived JWT state token with anti-CSRF nonce and redirect target."""
    current_settings = get_settings()
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "target": redirect_target,
        "exp": datetime.now(UTC) + timedelta(minutes=10),
        "type": "oauth_state",
    }
    return str(
        jwt.encode(payload, current_settings.JWT_SECRET, algorithm=current_settings.JWT_ALGORITHM)
    )


def validate_oauth_state(state: str) -> dict[str, Any]:
    """Validate and decode a signed OAuth state token."""
    current_settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            state,
            current_settings.JWT_SECRET,
            algorithms=[current_settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "oauth_state":
            raise ValueError("Invalid state token")
        return payload
    except (JWTError, ValueError) as err:
        raise ValueError("Invalid state token") from err


async def exchange_google_code_for_user(
    db: Session, code: str, redirect_uri: str
) -> tuple[User, str]:
    """Exchange Google OAuth authorization code for an ID token, verify it, and issue a Lores session."""
    current_settings = get_settings()
    if not current_settings.GOOGLE_CLIENT_ID or not current_settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("Google OAuth is not configured on this server")

    token_endpoint = "https://oauth2.googleapis.com/token"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                token_endpoint,
                data={
                    "code": code,
                    "client_id": current_settings.GOOGLE_CLIENT_ID,
                    "client_secret": current_settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
        except httpx.HTTPError as exc:
            raise ValueError(f"Google token exchange failed: {exc}") from exc

    if response.status_code != 200:
        raise ValueError(f"Google token exchange failed: {response.text}")

    data = response.json()
    id_token_jwt = data.get("id_token")
    if not id_token_jwt:
        raise ValueError("Google did not return an id_token")

    user, session_token = verify_google_id_token(db, id_token_jwt)
    return user, session_token
