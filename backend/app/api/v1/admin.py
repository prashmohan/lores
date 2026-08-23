import uuid
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
    if not workspaces:
        return []

    # 1. Batch member counts
    member_counts: dict[uuid.UUID, int] = {
        row[0]: row[1]
        for row in db.execute(
            select(WorkspaceMember.workspace_id, func.count(WorkspaceMember.id)).group_by(
                WorkspaceMember.workspace_id
            )
        ).all()
    }

    # 2. Batch active people counts
    people_counts: dict[uuid.UUID, int] = {
        row[0]: row[1]
        for row in db.execute(
            select(Person.workspace_id, func.count(Person.id))
            .where(Person.is_deleted.is_(False))
            .group_by(Person.workspace_id)
        ).all()
    }

    # 3. Batch admin members & users
    admin_members = list(
        db.scalars(
            select(WorkspaceMember).where(
                WorkspaceMember.role.in_(["admin", "owner"]),
            )
        ).all()
    )
    ws_admin_map: dict[uuid.UUID, set[uuid.UUID]] = {}
    all_admin_user_ids: set[uuid.UUID] = set()

    for m in admin_members:
        ws_admin_map.setdefault(m.workspace_id, set()).add(m.user_id)
        all_admin_user_ids.add(m.user_id)

    for ws in workspaces:
        ws_admin_map.setdefault(ws.id, set()).add(ws.created_by_user_id)
        all_admin_user_ids.add(ws.created_by_user_id)

    user_map = (
        {u.id: u for u in db.scalars(select(User).where(User.id.in_(all_admin_user_ids))).all()}
        if all_admin_user_ids
        else {}
    )

    result = []
    for ws in workspaces:
        admin_uids = ws_admin_map.get(ws.id, set())
        admins_summary = [
            AdminUserSummary(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
            )
            for uid in admin_uids
            if (u := user_map.get(uid)) is not None
        ]
        result.append(
            AdminWorkspaceItem(
                id=ws.id,
                name=ws.name,
                slug=ws.slug,
                description=ws.description,
                created_at=ws.created_at,
                member_count=member_counts.get(ws.id, 0),
                people_count=people_counts.get(ws.id, 0),
                admins=admins_summary,
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
