import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ChildRelationship(Base, TimestampMixin):
    __tablename__ = "child_relationships"
    __table_args__ = (
        Index("ix_child_ws_union", "workspace_id", "union_id"),
        Index("ix_child_ws_child", "workspace_id", "child_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    union_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("family_unions.id"), nullable=False
    )
    child_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("people.id"), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(30), default="biological", nullable=False)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
