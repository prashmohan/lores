import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[-\s]+", "-", text)


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=False
    )
    map_layout: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)

    members: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # admin, collaborator, viewer
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
