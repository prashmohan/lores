import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

GenderType = Literal["male", "female", "other", "unknown"]
DateQualifier = Literal["exact", "about", "approximate", "before", "after", "unknown"]


def _validate_avatar_url(v: str | None) -> str | None:
    if v is None:
        return None
    v_clean = v.strip()
    if not v_clean:
        return None
    lower = v_clean.lower()
    if lower.startswith(("http://", "https://", "/", "data:image/")):
        return v_clean
    raise ValueError("avatar_url must start with http://, https://, /, or data:image/")


class PersonBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    maiden_name: str | None = Field(None, max_length=100)
    gender: GenderType = "unknown"
    is_living: bool = True
    birth_date: str | None = Field(None, max_length=30)
    birth_date_qualifier: DateQualifier = "exact"
    birth_place: str | None = Field(None, max_length=255)
    death_date: str | None = Field(None, max_length=30)
    death_date_qualifier: DateQualifier = "exact"
    death_place: str | None = Field(None, max_length=255)
    biography: str | None = Field(None, max_length=50000)
    avatar_url: str | None = Field(None, max_length=2048)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        return _validate_avatar_url(v)


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    maiden_name: str | None = Field(None, max_length=100)
    gender: GenderType | None = None
    is_living: bool | None = None
    birth_date: str | None = Field(None, max_length=30)
    birth_date_qualifier: DateQualifier | None = None
    birth_place: str | None = Field(None, max_length=255)
    death_date: str | None = Field(None, max_length=30)
    death_date_qualifier: DateQualifier | None = None
    death_place: str | None = Field(None, max_length=255)
    biography: str | None = Field(None, max_length=50000)
    avatar_url: str | None = Field(None, max_length=2048)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        return _validate_avatar_url(v)


class PersonRead(PersonBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    is_deleted: bool = False
    deleted_at: datetime | None = None
    deleted_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
