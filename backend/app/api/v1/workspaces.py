import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_workspace_role, require_role
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.workspace import (
    MapLayoutRead,
    MapLayoutUpdate,
    UserWorkspaceMembership,
    WorkspaceCreate,
    WorkspaceMemberCreate,
    WorkspaceMemberRead,
    WorkspaceRead,
)
from app.services import email_service, workspace_service

router = APIRouter()


@router.get("", response_model=list[UserWorkspaceMembership])
@router.get("/", response_model=list[UserWorkspaceMembership], include_in_schema=False)
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    workspaces_with_roles = workspace_service.list_user_workspaces(db, current_user.id)
    return [{"workspace": ws, "role": role} for ws, role in workspaces_with_roles]


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
    stmt = (
        select(WorkspaceMember, User.email, User.display_name)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    rows = db.execute(stmt).all()
    results = []
    for member, email, display_name in rows:
        results.append(
            WorkspaceMemberRead(
                id=member.id,
                workspace_id=member.workspace_id,
                user_id=member.user_id,
                role=member.role,
                email=email,
                display_name=display_name,
                invited_by_user_id=member.invited_by_user_id,
                joined_at=member.joined_at,
            )
        )
    return results


@router.post("/{workspace_id}/members", response_model=WorkspaceMemberRead)
def add_member(
    workspace_id: uuid.UUID,
    req: WorkspaceMemberCreate,
    background_tasks: BackgroundTasks,
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

    # Fetch workspace metadata and dispatch invitation email asynchronously in background
    ws = workspace_service.get_workspace_by_id(db, workspace_id)
    ws_name = ws.name if ws else "Family Tree"
    inviter_name = current_user.display_name or current_user.email
    background_tasks.add_task(
        email_service.send_invitation_email,
        to_email=target_user.email,
        inviter_name=inviter_name,
        workspace_name=ws_name,
        role=req.role,
    )

    return WorkspaceMemberRead(
        id=member.id,
        workspace_id=member.workspace_id,
        user_id=member.user_id,
        role=member.role,
        email=target_user.email,
        display_name=target_user.display_name,
        invited_by_user_id=member.invited_by_user_id,
        joined_at=member.joined_at,
    )


@router.delete("/{workspace_id}/members/{user_id}")
def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    _role: str = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        success = workspace_service.remove_member(db, workspace_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    db.commit()
    return {"message": "Member removed successfully"}


@router.get("/{workspace_id}/map-layout", response_model=MapLayoutRead)
def get_map_layout(
    workspace_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    ws = workspace_service.get_workspace_by_id(db, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return MapLayoutRead(positions=ws.map_layout or {})


@router.put("/{workspace_id}/map-layout", response_model=MapLayoutRead)
def update_map_layout(
    workspace_id: uuid.UUID,
    payload: MapLayoutUpdate,
    _role: str = Depends(require_role("collaborator")),
    db: Session = Depends(get_db),
) -> Any:
    ws = workspace_service.get_workspace_by_id(db, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    ws.map_layout = payload.model_dump()["positions"]
    db.commit()
    db.refresh(ws)
    return MapLayoutRead(positions=ws.map_layout or {})


@router.delete("/{workspace_id}/map-layout")
def reset_map_layout(
    workspace_id: uuid.UUID,
    _role: str = Depends(require_role("collaborator")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    ws = workspace_service.get_workspace_by_id(db, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    ws.map_layout = None
    db.commit()
    return {"message": "Map layout reset to default"}
