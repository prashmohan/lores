import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LoreNoteBase(BaseModel):
    title: str
    content: str
    event_year: int | None = None
    tags: list[str] = Field(default_factory=list)


class LoreNoteCreate(LoreNoteBase):
    person_id: uuid.UUID | None = None


class LoreNoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    event_year: int | None = None
    tags: list[str] | None = None


class LoreNoteRead(LoreNoteBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    person_id: uuid.UUID
    author_id: uuid.UUID
    is_deleted: bool = False
    deleted_at: datetime | None = None
    deleted_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrashItemRead(BaseModel):
    id: str
    entity_type: str
    name: str
    deleted_at: str | None = None
    deleted_by_id: str | None = None
    days_remaining: int = 30


class TrashRestoreRequest(BaseModel):
    entity_type: str
    entity_id: uuid.UUID


class TrashPurgeResponse(BaseModel):
    purged_count: int
    message: str = "Trash emptied successfully"


class AuditLogRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    actor_id: uuid.UUID | None = None
    actor_name: str
    actor_email: str
    entity_type: str
    entity_id: uuid.UUID
    action: str
    changes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
