import logging
from typing import Any
from urllib.parse import quote, urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthConfigResponse,
    GoogleAuthRequest,
    OTPRequest,
    OTPResponse,
    OTPVerifyRequest,
    TokenResponse,
    UserRead,
)
from app.services import auth_service, email_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/config", response_model=AuthConfigResponse)
def get_auth_config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID,
        "google_auth_enabled": bool(settings.GOOGLE_CLIENT_ID),
    }


@router.get("/google/authorize", response_class=RedirectResponse)
def google_authorize(
    request: Request,
    redirect_target: str = "/",
) -> RedirectResponse:
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google SSO is not configured.",
        )

    state = auth_service.generate_oauth_state(redirect_target=redirect_target)
    callback_url = (
        f"{settings.APP_URL.rstrip('/')}/api/v1/auth/google/callback"
        if settings.APP_URL
        else f"{str(request.base_url).rstrip('/')}/api/v1/auth/google/callback"
    )

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    }
    google_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params, quote_via=quote)}"
    )
    return RedirectResponse(url=google_url, status_code=status.HTTP_302_FOUND)



@router.get("/google/callback", response_class=RedirectResponse)
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if error:
        logger.warning("Google OAuth callback received error: %s", error)
        return RedirectResponse(
            url=f"/?error={quote(f'google_auth_failed: {error}')}",
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        logger.warning(
            "Google OAuth callback missing parameter(s): code=%s, state=%s",
            bool(code),
            bool(state),
        )
        return RedirectResponse(
            url="/?error=google_auth_failed", status_code=status.HTTP_302_FOUND
        )

    try:
        state_payload = auth_service.validate_oauth_state(state)
    except ValueError as exc:
        logger.warning("Google OAuth state validation failed: %s", exc)
        return RedirectResponse(
            url=f"/?error={quote(f'invalid_state: {exc}')}",
            status_code=status.HTTP_302_FOUND,
        )

    settings = get_settings()
    callback_url = (
        f"{settings.APP_URL.rstrip('/')}/api/v1/auth/google/callback"
        if settings.APP_URL
        else f"{str(request.base_url).rstrip('/')}/api/v1/auth/google/callback"
    )

    try:
        _user, session_token = await auth_service.exchange_google_code_for_user(
            db, code=code, redirect_uri=callback_url
        )
    except Exception as exc:
        logger.exception(
            "Google OAuth code exchange failed (callback_url=%s): %s", callback_url, exc
        )
        return RedirectResponse(
            url=f"/?error={quote(f'google_exchange_failed: {exc}')}",
            status_code=status.HTTP_302_FOUND,
        )

    db.commit()

    raw_target = str(state_payload.get("target") or "/")
    target = raw_target if raw_target.startswith("/") and not raw_target.startswith("//") else "/"
    sep = "&" if "?" in target else "?"
    frontend_redirect_url = f"{target}{sep}token={session_token}"
    return RedirectResponse(url=frontend_redirect_url, status_code=status.HTTP_302_FOUND)


@router.post("/google", response_model=TokenResponse)
def login_with_google(
    req: GoogleAuthRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        user, token = auth_service.verify_google_id_token(db, id_token=req.credential)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    db.commit()
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": UserRead.model_validate(user),
    }


@router.post("/request-otp", response_model=OTPResponse)
def request_otp(
    req: OTPRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _token, raw_otp = auth_service.request_otp(db, email=req.email, display_name=req.display_name)
    db.commit()

    # Dispatch verification email in background (via SMTP / Resend or console fallback)
    background_tasks.add_task(email_service.send_otp_email, to_email=req.email, otp_code=raw_otp)

    return {
        "message": "OTP sent successfully",
        "email": req.email,
    }


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(
    req: OTPVerifyRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        user, token = auth_service.verify_otp(db, email=req.email, code=req.code)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    db.commit()
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": UserRead.model_validate(user),
    }


@router.get("/me", response_model=UserRead)
def get_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.post("/logout")
def logout(
    _current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    return {"message": "Successfully logged out"}
