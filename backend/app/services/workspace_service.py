import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.workspace import Workspace, WorkspaceMember, slugify

VALID_WORKSPACE_ROLES = {"viewer", "collaborator", "admin"}

ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 1,
    "collaborator": 2,
    "admin": 3,
    "superadmin": 4,
}


def create_workspace(
    db: Session,
    name: str,
    user_id: uuid.UUID,
    description: str | None = None,
) -> Workspace:
    if not name or not name.strip():
        raise ValueError("Workspace name cannot be empty")

    clean_name = name.strip()
    base_slug = slugify(clean_name) or "workspace"
    slug = f"{base_slug}-{uuid.uuid4().hex[:10]}"

    workspace = Workspace(
        name=clean_name,
        slug=slug,
        description=description,
        created_by_user_id=user_id,
    )
    db.add(workspace)
    db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user_id,
        role="admin",
    )
    db.add(member)
    db.flush()
    return workspace


def get_user_role_in_workspace(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
) -> str | None:
    stmt = select(WorkspaceMember.role).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    return db.scalar(stmt)


def add_or_update_member(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    actor_id: uuid.UUID | None = None,
) -> WorkspaceMember:
    if role not in VALID_WORKSPACE_ROLES:
        raise ValueError(
            f"Invalid workspace role: {role}. Must be one of {sorted(VALID_WORKSPACE_ROLES)}"
        )

    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    member = db.scalar(stmt)
    if member:
        if member.role == "admin" and role != "admin":
            admin_count = (
                db.scalar(
                    select(func.count(WorkspaceMember.id)).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.role == "admin",
                    )
                )
                or 0
            )
            if admin_count <= 1:
                raise ValueError("Cannot demote the sole administrator of the workspace")
        member.role = role
    else:
        member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            invited_by_user_id=actor_id,
        )
        db.add(member)
    db.flush()
    return member


def remove_member(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    member = db.scalar(stmt)
    if not member:
        return False

    if member.role == "admin":
        admin_count = (
            db.scalar(
                select(func.count(WorkspaceMember.id)).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.role == "admin",
                )
            )
            or 0
        )
        if admin_count <= 1:
            raise ValueError("Cannot remove the sole administrator of the workspace")

    db.delete(member)
    db.flush()
    return True


def get_workspace_by_id(
    db: Session,
    workspace_id: uuid.UUID,
) -> Workspace | None:
    stmt = select(Workspace).where(Workspace.id == workspace_id)
    return db.scalar(stmt)


def get_workspace_by_slug(
    db: Session,
    slug: str,
) -> Workspace | None:
    stmt = select(Workspace).where(Workspace.slug == slug)
    return db.scalar(stmt)


def list_user_workspaces(
    db: Session,
    user_id: uuid.UUID,
) -> list[tuple[Workspace, str]]:
    stmt = (
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(Workspace.name.asc())
    )
    return list(db.execute(stmt).tuples().all())


def list_workspace_members(
    db: Session,
    workspace_id: uuid.UUID,
) -> list[WorkspaceMember]:
    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    return list(db.scalars(stmt).all())


def has_sufficient_permission(user_role: str | None, required_role: str) -> bool:
    if not user_role:
        return False
    return ROLE_HIERARCHY.get(user_role, 0) >= ROLE_HIERARCHY.get(required_role, 0)
