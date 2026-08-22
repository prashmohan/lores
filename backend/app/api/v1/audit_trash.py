import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.lore import AuditLogRead, TrashItemRead, TrashPurgeResponse, TrashRestoreRequest
from app.services import audit_service, lore_service

router = APIRouter()


@router.get("/trash", response_model=list[TrashItemRead])
def get_trash(
    workspace_id: uuid.UUID,
    max_age_days: int = Query(30, ge=1, le=365),
    _role: str = Depends(require_role("collaborator")),
    db: Session = Depends(get_db),
) -> Any:
    return lore_service.get_trash_items(db, workspace_id=workspace_id, max_age_days=max_age_days)


@router.post("/trash/restore")
def restore_trash_item(
    workspace_id: uuid.UUID,
    req: TrashRestoreRequest,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        lore_service.restore_from_trash(
            db,
            workspace_id=workspace_id,
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            actor=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    return {
        "message": f"{req.entity_type} restored successfully",
        "entity_id": str(req.entity_id),
    }


@router.post("/trash/purge", response_model=TrashPurgeResponse)
def purge_trash_items(
    workspace_id: uuid.UUID,
    _role: str = Depends(require_role("admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    purged_count = lore_service.purge_trash(
        db, workspace_id=workspace_id, actor=current_user
    )
    db.commit()
    return TrashPurgeResponse(
        purged_count=purged_count,
        message="Trash emptied successfully",
    )


@router.get("/audit-logs", response_model=list[AuditLogRead])
def get_audit_logs(
    workspace_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    entity_id: uuid.UUID | None = Query(None),
    _role: str = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> Any:
    if entity_id:
        return audit_service.get_entity_audit_logs(
            db, workspace_id=workspace_id, entity_id=entity_id
        )
    return audit_service.get_workspace_audit_logs(
        db, workspace_id=workspace_id, limit=limit
    )
