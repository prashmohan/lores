from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_superadmin
from app.db.session import get_db
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.admin import AdminSystemStats, AdminUserSummary, AdminWorkspaceItem

router = APIRouter()


@router.get("/workspaces", response_model=list[AdminWorkspaceItem])
def get_all_workspaces(
    _superadmin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    workspaces = list(db.scalars(select(Workspace).order_by(Workspace.created_at.desc())).all())

    result = []
    for ws in workspaces:
        # Count members
        member_count = (
            db.scalar(
                select(func.count(WorkspaceMember.id)).where(WorkspaceMember.workspace_id == ws.id)
            )
            or 0
        )

        # Count active people
        people_count = (
            db.scalar(
                select(func.count(Person.id)).where(
                    Person.workspace_id == ws.id,
                    Person.is_deleted.is_(False),
                )
            )
            or 0
        )

        # Get admins
        admin_members = list(
            db.scalars(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws.id,
                    WorkspaceMember.role.in_(["admin", "owner"]),
                )
            ).all()
        )
        admin_user_ids = [m.user_id for m in admin_members]
        if ws.created_by_user_id not in admin_user_ids:
            admin_user_ids.append(ws.created_by_user_id)

        admin_users = (
            list(db.scalars(select(User).where(User.id.in_(admin_user_ids))).all())
            if admin_user_ids
            else []
        )

        result.append(
            AdminWorkspaceItem(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
                description=ws.description,
                created_at=ws.created_at,
                member_count=member_count,
                people_count=people_count,
                admins=[
                    AdminUserSummary(
                        id=u.id,
                        email=u.email,
                        display_name=u.display_name,
                    )
                    for u in admin_users
                ],
            )
        )

    return result


@router.get("/stats", response_model=AdminSystemStats)
def get_system_stats(
    _superadmin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> Any:
    total_workspaces = db.scalar(select(func.count(Workspace.id))) or 0
    total_users = db.scalar(select(func.count(User.id))) or 0
    total_people = db.scalar(select(func.count(Person.id)).where(Person.is_deleted.is_(False))) or 0
    total_lore_notes = (
        db.scalar(select(func.count(LoreNote.id)).where(LoreNote.is_deleted.is_(False))) or 0
    )

    return AdminSystemStats(
        total_workspaces=total_workspaces,
        total_users=total_users,
        total_people=total_people,
        total_lore_notes=total_lore_notes,
    )
