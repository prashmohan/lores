import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def record_audit_event(
    db: Session,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    actor_name: str,
    actor_email: str,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    changes: dict[str, Any],
) -> AuditLog:
    log = AuditLog(
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_email=actor_email,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changes=changes,
    )
    db.add(log)
    return log


def get_workspace_audit_logs(
    db: Session, workspace_id: uuid.UUID, limit: int = 50
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.workspace_id == workspace_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def get_entity_audit_logs(
    db: Session, workspace_id: uuid.UUID, entity_id: uuid.UUID
) -> list[AuditLog]:
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.workspace_id == workspace_id,
            AuditLog.entity_id == entity_id,
        )
        .order_by(AuditLog.created_at.desc())
    )
    return list(db.scalars(stmt).all())
