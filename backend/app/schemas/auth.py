import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class OTPRequest(BaseModel):
    email: EmailStr
    display_name: str | None = None


class OTPResponse(BaseModel):
    message: str
    email: str
    dev_otp: str | None = None


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    code: str


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    is_superadmin: bool = False
    created_at: datetime | None = None
    last_login_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token: str = ""
    token_type: str = "bearer"
    user: UserRead | None = None


class TokenPayload(BaseModel):
    sub: str
    email: str
    exp: int | None = None
