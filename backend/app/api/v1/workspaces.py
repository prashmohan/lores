import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_workspace_role, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.workspace import (
    UserWorkspaceMembership,
    WorkspaceCreate,
    WorkspaceMemberCreate,
    WorkspaceMemberRead,
    WorkspaceRead,
)
from app.services import workspace_service

router = APIRouter()


@router.get("", response_model=list[UserWorkspaceMembership])
@router.get("/", response_model=list[UserWorkspaceMembership], include_in_schema=False)
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    workspaces_with_roles = workspace_service.list_user_workspaces(db, current_user.id)
    return [
        {"workspace": ws, "role": role}
        for ws, role in workspaces_with_roles
    ]


@router.post("", response_model=WorkspaceRead)
@router.post("/", response_model=WorkspaceRead, include_in_schema=False)
def create_workspace(
    req: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    try:
        ws = workspace_service.create_workspace(
            db, name=req.name, user_id=current_user.id, description=req.description
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    db.commit()
    db.refresh(ws)
    return ws


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    ws = workspace_service.get_workspace_by_id(db, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return ws


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberRead])
def list_members(
    workspace_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    return workspace_service.list_workspace_members(db, workspace_id)


@router.post("/{workspace_id}/members", response_model=WorkspaceMemberRead)
def add_member(
    workspace_id: uuid.UUID,
    req: WorkspaceMemberCreate,
    _role: str = Depends(require_role("admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    clean_email = req.email.lower().strip()
    target_user = db.scalar(select(User).where(User.email == clean_email))
    if not target_user:
        target_user = User(
            email=clean_email,
            display_name=clean_email.split("@")[0].capitalize(),
        )
        db.add(target_user)
        db.flush()

    try:
        member = workspace_service.add_or_update_member(
            db,
            workspace_id=workspace_id,
            user_id=target_user.id,
            role=req.role,
            actor_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    db.commit()
    db.refresh(member)
    return member


@router.delete("/{workspace_id}/members/{user_id}")
def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    _role: str = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    success = workspace_service.remove_member(db, workspace_id, user_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    db.commit()
    return {"message": "Member removed successfully"}
