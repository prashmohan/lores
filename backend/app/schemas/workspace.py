import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class WorkspaceBase(BaseModel):
    name: str
    description: str | None = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class WorkspaceRead(WorkspaceBase):
    id: uuid.UUID
    slug: str
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkspaceMemberBase(BaseModel):
    role: str


class WorkspaceMemberCreate(BaseModel):
    email: EmailStr
    role: str = "collaborator"


class WorkspaceMemberUpdate(BaseModel):
    role: str


class WorkspaceMemberRead(WorkspaceMemberBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    invited_by_user_id: uuid.UUID | None = None
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserWorkspaceMembership(BaseModel):
    workspace: WorkspaceRead
    role: str

    model_config = ConfigDict(from_attributes=True)
