import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class FamilyUnion(Base, TimestampMixin):
    __tablename__ = "family_unions"
    __table_args__ = (
        Index("ix_unions_ws_p1", "workspace_id", "partner1_id"),
        Index("ix_unions_ws_p2", "workspace_id", "partner2_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    partner1_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("people.id"), nullable=True
    )
    partner2_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("people.id"), nullable=True
    )
    union_type: Mapped[str] = mapped_column(
        String(30), default="marriage", nullable=False
    )
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    end_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
