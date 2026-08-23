from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
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

router = APIRouter()


@router.get("/config", response_model=AuthConfigResponse)
def get_auth_config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID,
        "google_auth_enabled": bool(settings.GOOGLE_CLIENT_ID),
    }


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
