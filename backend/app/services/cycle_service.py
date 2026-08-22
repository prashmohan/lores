import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.union import FamilyUnion


def get_descendants_ids(
    db: Session, workspace_id: uuid.UUID, root_person_id: uuid.UUID
) -> set[uuid.UUID]:
    descendants: set[uuid.UUID] = set()
    queue = [root_person_id]

    while queue:
        current_id = queue.pop(0)
        # Find all active unions where current_id is partner1 or partner2
        union_stmt = select(FamilyUnion.id).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted.is_(False),
            (FamilyUnion.partner1_id == current_id) | (FamilyUnion.partner2_id == current_id),
        )
        union_ids = list(db.scalars(union_stmt).all())
        if not union_ids:
            continue

        # Find all active children of these unions
        child_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.is_deleted.is_(False),
            ChildRelationship.union_id.in_(union_ids),
        )
        children_ids = list(db.scalars(child_stmt).all())
        for c_id in children_ids:
            if c_id not in descendants:
                descendants.add(c_id)
                queue.append(c_id)

    return descendants


def validate_no_cycle(
    db: Session, workspace_id: uuid.UUID, union_id: uuid.UUID, child_id: uuid.UUID
) -> None:
    # 1. Fetch union and verify workspace ownership
    union = db.get(FamilyUnion, union_id)
    if not union or union.workspace_id != workspace_id or union.is_deleted:
        raise ValueError("Union not found in workspace")

    parents = [p for p in [union.partner1_id, union.partner2_id] if p is not None]

    # Child cannot be its own parent
    if child_id in parents:
        raise ValueError("Cycle detected: A person cannot be their own parent")

    # 2. Descendants of child cannot include any parent in the target union
    child_descendants = get_descendants_ids(db, workspace_id, child_id)
    for p in parents:
        if p in child_descendants:
            raise ValueError("Cycle detected: A person cannot be their own ancestor")
