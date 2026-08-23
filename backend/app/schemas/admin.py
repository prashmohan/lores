import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str


class AdminWorkspaceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    created_at: datetime
    member_count: int
    people_count: int
    admins: list[AdminUserSummary]


class AdminSystemStats(BaseModel):
    total_workspaces: int
    total_users: int
    total_people: int
    total_lore_notes: int
