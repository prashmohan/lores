import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PersonBase(BaseModel):
    first_name: str
    last_name: str
    maiden_name: str | None = None
    gender: str = "unknown"
    is_living: bool = True
    birth_date: str | None = None
    birth_date_qualifier: str = "exact"
    birth_place: str | None = None
    death_date: str | None = None
    death_date_qualifier: str = "exact"
    death_place: str | None = None
    biography: str | None = None
    avatar_url: str | None = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    maiden_name: str | None = None
    gender: str | None = None
    is_living: bool | None = None
    birth_date: str | None = None
    birth_date_qualifier: str | None = None
    birth_place: str | None = None
    death_date: str | None = None
    death_date_qualifier: str | None = None
    death_place: str | None = None
    biography: str | None = None
    avatar_url: str | None = None


class PersonRead(PersonBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    is_deleted: bool = False
    deleted_at: datetime | None = None
    deleted_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
