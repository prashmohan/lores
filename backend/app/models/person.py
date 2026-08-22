import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Person(Base, TimestampMixin):
    __tablename__ = "people"
    __table_args__ = (
        Index("ix_people_ws_del", "workspace_id", "is_deleted"),
        Index("ix_people_ws_name", "workspace_id", "last_name", "first_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id"), index=True, nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    maiden_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    is_living: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    birth_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    birth_date_qualifier: Mapped[str] = mapped_column(String(20), default="exact", nullable=False)
    birth_place: Mapped[str | None] = mapped_column(String(255), nullable=True)

    death_date: Mapped[str | None] = mapped_column(String(30), nullable=True)
    death_date_qualifier: Mapped[str] = mapped_column(String(20), default="exact", nullable=False)
    death_place: Mapped[str | None] = mapped_column(String(255), nullable=True)

    biography: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id"), nullable=True
    )
