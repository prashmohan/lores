import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.schemas.person import PersonCreate, PersonUpdate
from app.services.audit_service import record_audit_event
from app.services.cycle_service import validate_no_cycle


class ConcurrencyConflictError(ValueError):
    """Raised when an optimistic concurrency check fails during person update."""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.details: dict[str, Any] = details or {}


def get_person_by_id(db: Session, workspace_id: uuid.UUID, person_id: uuid.UUID) -> Person | None:
    person = db.get(Person, person_id)
    if not person or person.workspace_id != workspace_id or person.is_deleted:
        return None
    return person


def list_people(
    db: Session,
    workspace_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
    query: str | None = None,
) -> list[Person]:
    stmt = select(Person).where(
        Person.workspace_id == workspace_id,
        Person.is_deleted.is_(False),
    )
    if query:
        search = f"%{query}%"
        stmt = stmt.where(
            or_(
                Person.first_name.ilike(search),
                Person.last_name.ilike(search),
                Person.maiden_name.ilike(search),
            )
        )
    stmt = stmt.order_by(Person.last_name.asc(), Person.first_name.asc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def create_person(
    db: Session,
    workspace_id: uuid.UUID,
    person_data: dict[str, Any] | PersonCreate,
    actor: User,
) -> Person:
    data = person_data.model_dump() if isinstance(person_data, PersonCreate) else dict(person_data)

    person = Person(
        workspace_id=workspace_id,
        first_name=data["first_name"],
        last_name=data["last_name"],
        maiden_name=data.get("maiden_name"),
        gender=data.get("gender", "unknown"),
        is_living=data.get("is_living", True),
        birth_date=data.get("birth_date"),
        birth_date_qualifier=data.get("birth_date_qualifier", "exact"),
        birth_place=data.get("birth_place"),
        death_date=data.get("death_date"),
        death_date_qualifier=data.get("death_date_qualifier", "exact"),
        death_place=data.get("death_place"),
        biography=data.get("biography"),
        avatar_url=data.get("avatar_url"),
    )
    db.add(person)
    db.flush()

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "Person",
        person.id,
        "CREATE",
        {"person": f"{person.first_name} {person.last_name}"},
    )
    return person


def add_relative_atomic(
    db: Session,
    workspace_id: uuid.UUID,
    relative_type: str,  # "parent", "partner", "child", "sibling"
    base_person_id: uuid.UUID,
    person_data: dict[str, Any] | PersonCreate | None = None,
    existing_person_id: uuid.UUID | None = None,
    other_parent_id: uuid.UUID | None = None,
    actor: User = None,  # type: ignore[assignment]
) -> Person:
    base = db.get(Person, base_person_id)
    if not base or base.workspace_id != workspace_id or base.is_deleted:
        raise ValueError("Base person not found in workspace")

    allowed_types = ("parent", "partner", "child", "sibling")
    if relative_type not in allowed_types:
        raise ValueError(f"Unsupported relative type: {relative_type}")

    # 1. Resolve or create target person
    if existing_person_id:
        target_person = db.get(Person, existing_person_id)
        if (
            not target_person
            or target_person.workspace_id != workspace_id
            or target_person.is_deleted
        ):
            raise ValueError("Existing person not found in workspace")
        if target_person.id == base.id:
            raise ValueError("Cannot link a person to themselves")
    else:
        if not person_data:
            raise ValueError("Either person_data or existing_person_id must be provided")
        data = (
            person_data.model_dump() if isinstance(person_data, PersonCreate) else dict(person_data)
        )
        target_person = Person(
            workspace_id=workspace_id,
            first_name=data["first_name"],
            last_name=data.get("last_name") or base.last_name,
            maiden_name=data.get("maiden_name"),
            gender=data.get("gender", "unknown"),
            is_living=data.get("is_living", True),
            birth_date=data.get("birth_date"),
            birth_date_qualifier=data.get("birth_date_qualifier", "exact"),
            birth_place=data.get("birth_place"),
            death_date=data.get("death_date"),
            death_date_qualifier=data.get("death_date_qualifier", "exact"),
            death_place=data.get("death_place"),
            biography=data.get("biography"),
            avatar_url=data.get("avatar_url"),
        )
        db.add(target_person)
        db.flush()

        if actor:
            record_audit_event(
                db,
                workspace_id,
                actor.id,
                actor.display_name,
                actor.email,
                "Person",
                target_person.id,
                "CREATE",
                {"person": f"{target_person.first_name} {target_person.last_name}"},
            )

    # 2. Connect based on relative_type
    if relative_type == "parent":
        if other_parent_id:
            other_p = db.get(Person, other_parent_id)
            if not other_p or other_p.workspace_id != workspace_id or other_p.is_deleted:
                raise ValueError("Other parent not found in workspace")
            parent_union_stmt = select(FamilyUnion).where(
                FamilyUnion.workspace_id == workspace_id,
                FamilyUnion.is_deleted.is_(False),
                or_(
                    (FamilyUnion.partner1_id == target_person.id)
                    & (FamilyUnion.partner2_id == other_parent_id),
                    (FamilyUnion.partner1_id == other_parent_id)
                    & (FamilyUnion.partner2_id == target_person.id),
                ),
            )
            parent_union = db.scalar(parent_union_stmt)
            if not parent_union:
                parent_union = FamilyUnion(
                    workspace_id=workspace_id,
                    partner1_id=target_person.id,
                    partner2_id=other_parent_id,
                )
                db.add(parent_union)
                db.flush()
            validate_no_cycle(db, workspace_id, parent_union.id, base_person_id)
            existing_rel = db.scalar(
                select(ChildRelationship).where(
                    ChildRelationship.workspace_id == workspace_id,
                    ChildRelationship.union_id == parent_union.id,
                    ChildRelationship.child_id == base_person_id,
                    ChildRelationship.is_deleted.is_(False),
                )
            )
            if not existing_rel:
                db.add(
                    ChildRelationship(
                        workspace_id=workspace_id,
                        union_id=parent_union.id,
                        child_id=base_person_id,
                    )
                )
        else:
            parent_rel_stmt = select(ChildRelationship.union_id).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.child_id == base_person_id,
                ChildRelationship.is_deleted.is_(False),
            )
            existing_union_id = db.scalar(parent_rel_stmt)
            if existing_union_id:
                union = db.get(FamilyUnion, existing_union_id)
                if union and not union.is_deleted:
                    if not union.partner1_id:
                        union.partner1_id = target_person.id
                        validate_no_cycle(db, workspace_id, union.id, base_person_id)
                    elif not union.partner2_id and union.partner1_id != target_person.id:
                        union.partner2_id = target_person.id
                        validate_no_cycle(db, workspace_id, union.id, base_person_id)
                    elif (
                        union.partner1_id != target_person.id
                        and union.partner2_id != target_person.id
                    ):
                        new_union = FamilyUnion(
                            workspace_id=workspace_id, partner1_id=target_person.id
                        )
                        db.add(new_union)
                        db.flush()
                        validate_no_cycle(db, workspace_id, new_union.id, base_person_id)
                        db.add(
                            ChildRelationship(
                                workspace_id=workspace_id,
                                union_id=new_union.id,
                                child_id=base_person_id,
                            )
                        )
                else:
                    new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=target_person.id)
                    db.add(new_union)
                    db.flush()
                    validate_no_cycle(db, workspace_id, new_union.id, base_person_id)
                    db.add(
                        ChildRelationship(
                            workspace_id=workspace_id,
                            union_id=new_union.id,
                            child_id=base_person_id,
                        )
                    )
            else:
                new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=target_person.id)
                db.add(new_union)
                db.flush()
                validate_no_cycle(db, workspace_id, new_union.id, base_person_id)
                db.add(
                    ChildRelationship(
                        workspace_id=workspace_id,
                        union_id=new_union.id,
                        child_id=base_person_id,
                    )
                )

    elif relative_type == "partner":
        existing_partner_union = db.scalar(
            select(FamilyUnion).where(
                FamilyUnion.workspace_id == workspace_id,
                FamilyUnion.is_deleted.is_(False),
                or_(
                    (FamilyUnion.partner1_id == base_person_id)
                    & (FamilyUnion.partner2_id == target_person.id),
                    (FamilyUnion.partner1_id == target_person.id)
                    & (FamilyUnion.partner2_id == base_person_id),
                ),
            )
        )
        if not existing_partner_union:
            partner_union = FamilyUnion(
                workspace_id=workspace_id,
                partner1_id=base_person_id,
                partner2_id=target_person.id,
            )
            db.add(partner_union)
            db.flush()

    elif relative_type == "child":
        if other_parent_id:
            other_p = db.get(Person, other_parent_id)
            if not other_p or other_p.workspace_id != workspace_id or other_p.is_deleted:
                raise ValueError("Other parent not found in workspace")
            child_union_stmt = select(FamilyUnion).where(
                FamilyUnion.workspace_id == workspace_id,
                FamilyUnion.is_deleted.is_(False),
                or_(
                    (FamilyUnion.partner1_id == base_person_id)
                    & (FamilyUnion.partner2_id == other_parent_id),
                    (FamilyUnion.partner1_id == other_parent_id)
                    & (FamilyUnion.partner2_id == base_person_id),
                ),
            )
            child_union = db.scalar(child_union_stmt)
            if not child_union:
                child_union = FamilyUnion(
                    workspace_id=workspace_id,
                    partner1_id=base_person_id,
                    partner2_id=other_parent_id,
                )
                db.add(child_union)
                db.flush()
        else:
            child_union_stmt = select(FamilyUnion).where(
                FamilyUnion.workspace_id == workspace_id,
                FamilyUnion.is_deleted.is_(False),
                (FamilyUnion.partner1_id == base_person_id)
                | (FamilyUnion.partner2_id == base_person_id),
            )
            child_union = db.scalar(child_union_stmt)
            if not child_union:
                child_union = FamilyUnion(workspace_id=workspace_id, partner1_id=base_person_id)
                db.add(child_union)
                db.flush()

        validate_no_cycle(db, workspace_id, child_union.id, target_person.id)
        existing_child_rel = db.scalar(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.union_id == child_union.id,
                ChildRelationship.child_id == target_person.id,
                ChildRelationship.is_deleted.is_(False),
            )
        )
        if not existing_child_rel:
            db.add(
                ChildRelationship(
                    workspace_id=workspace_id,
                    union_id=child_union.id,
                    child_id=target_person.id,
                )
            )

    elif relative_type == "sibling":
        sibling_rel_stmt = select(ChildRelationship.union_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == base_person_id,
            ChildRelationship.is_deleted.is_(False),
        )
        sibling_union_id = db.scalar(sibling_rel_stmt)
        if not sibling_union_id:
            p_union = FamilyUnion(workspace_id=workspace_id)
            db.add(p_union)
            db.flush()
            db.add(
                ChildRelationship(
                    workspace_id=workspace_id,
                    union_id=p_union.id,
                    child_id=base_person_id,
                )
            )
            sibling_union_id = p_union.id
        validate_no_cycle(db, workspace_id, sibling_union_id, target_person.id)
        existing_sib_rel = db.scalar(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.union_id == sibling_union_id,
                ChildRelationship.child_id == target_person.id,
                ChildRelationship.is_deleted.is_(False),
            )
        )
        if not existing_sib_rel:
            db.add(
                ChildRelationship(
                    workspace_id=workspace_id,
                    union_id=sibling_union_id,
                    child_id=target_person.id,
                )
            )

    return target_person


def update_person_optimistic(
    db: Session,
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    updates: dict[str, Any] | PersonUpdate,
    expected_updated_at: datetime | str | None,
    actor: User,
) -> Person:
    person = db.get(Person, person_id)
    if not person or person.workspace_id != workspace_id or person.is_deleted:
        raise ValueError("Person not found in workspace")

    update_dict = (
        updates.model_dump(exclude_unset=True)
        if isinstance(updates, PersonUpdate)
        else dict(updates)
    )

    # Optimistic concurrency conflict check
    if expected_updated_at is not None and person.updated_at is not None:
        if isinstance(expected_updated_at, str):
            try:
                expected_dt = datetime.fromisoformat(expected_updated_at)
            except ValueError:
                expected_dt = None
        else:
            expected_dt = expected_updated_at

        if expected_dt is not None:
            p_dt = person.updated_at
            e_dt = expected_dt
            if p_dt.tzinfo is not None and e_dt.tzinfo is None:
                e_dt = e_dt.replace(tzinfo=UTC)
            elif p_dt.tzinfo is None and e_dt.tzinfo is not None:
                p_dt = p_dt.replace(tzinfo=UTC)

            # Check if record has been updated since expected timestamp (with 1ms tolerance)
            if (p_dt - e_dt).total_seconds() > 0.001:
                # Find most recent audit log to detect actor & field
                log_stmt = (
                    select(AuditLog)
                    .where(
                        AuditLog.workspace_id == workspace_id,
                        AuditLog.entity_id == person_id,
                    )
                    .order_by(AuditLog.created_at.desc())
                )
                last_log = db.scalars(log_stmt).first()

                conflicted_field = None
                current_val = None
                if last_log and last_log.changes:
                    for f in update_dict:
                        if f in last_log.changes:
                            conflicted_field = f
                            current_val = getattr(person, f, None)
                            break

                if not conflicted_field and update_dict:
                    conflicted_field = next(iter(update_dict))
                    current_val = getattr(person, conflicted_field, None)

                details = {
                    "conflict": True,
                    "field": conflicted_field,
                    "current_value": current_val,
                    "updated_by": last_log.actor_name if last_log else "Another user",
                    "updated_at": (
                        last_log.created_at.isoformat()
                        if last_log and last_log.created_at
                        else person.updated_at.isoformat()
                    ),
                    "current_updated_at": person.updated_at.isoformat(),
                    "expected_updated_at": expected_dt.isoformat(),
                }
                raise ConcurrencyConflictError(
                    f"Conflict detected on person {person.id}: field '{conflicted_field}' was updated concurrently",
                    details=details,
                )

    changes: dict[str, Any] = {}
    for k, v in update_dict.items():
        if hasattr(person, k) and k not in (
            "id",
            "workspace_id",
            "created_at",
            "is_deleted",
            "deleted_at",
            "deleted_by_id",
        ):
            old_v = getattr(person, k)
            if old_v != v:
                changes[k] = {"old": old_v, "new": v}
                setattr(person, k, v)

    if changes:
        person.updated_at = datetime.now(UTC)
        record_audit_event(
            db,
            workspace_id,
            actor.id,
            actor.display_name,
            actor.email,
            "Person",
            person.id,
            "UPDATE",
            changes,
        )

    return person


def remove_relationship_atomic(
    db: Session,
    workspace_id: uuid.UUID,
    base_person_id: uuid.UUID,
    target_person_id: uuid.UUID,
    relationship_type: str,  # "partner", "parent", "child"
    actor: User,
) -> dict[str, Any]:
    base = db.get(Person, base_person_id)
    if not base or base.workspace_id != workspace_id or base.is_deleted:
        raise ValueError("Base person not found in workspace")

    target = db.get(Person, target_person_id)
    if not target or target.workspace_id != workspace_id or target.is_deleted:
        raise ValueError("Target person not found in workspace")

    allowed_types = ("partner", "parent", "child")
    if relationship_type not in allowed_types:
        raise ValueError(f"Unsupported relationship type for removal: {relationship_type}")

    now = datetime.now(UTC)

    if relationship_type == "partner":
        # Find active union between base and target
        union_stmt = select(FamilyUnion).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted.is_(False),
            or_(
                (FamilyUnion.partner1_id == base.id) & (FamilyUnion.partner2_id == target.id),
                (FamilyUnion.partner1_id == target.id) & (FamilyUnion.partner2_id == base.id),
            ),
        )
        union = db.scalar(union_stmt)
        if not union:
            raise ValueError("Active partnership not found between the specified individuals")

        # Check for children attached to this union
        children_stmt = select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.union_id == union.id,
            ChildRelationship.is_deleted.is_(False),
        )
        children = list(db.scalars(children_stmt).all())

        if children:
            # Preserve individual parental connections for each child
            for p_id in [union.partner1_id, union.partner2_id]:
                if not p_id:
                    continue
                # Find or create single parent union
                single_union_stmt = select(FamilyUnion).where(
                    FamilyUnion.workspace_id == workspace_id,
                    FamilyUnion.is_deleted.is_(False),
                    or_(
                        (FamilyUnion.partner1_id == p_id) & (FamilyUnion.partner2_id.is_(None)),
                        (FamilyUnion.partner2_id == p_id) & (FamilyUnion.partner1_id.is_(None)),
                    ),
                )
                single_union = db.scalar(single_union_stmt)
                if not single_union:
                    single_union = FamilyUnion(
                        workspace_id=workspace_id,
                        partner1_id=p_id,
                        partner2_id=None,
                    )
                    db.add(single_union)
                    db.flush()

                for c in children:
                    # Add child relationship to single parent union if not existing
                    exists = db.scalar(
                        select(ChildRelationship).where(
                            ChildRelationship.workspace_id == workspace_id,
                            ChildRelationship.union_id == single_union.id,
                            ChildRelationship.child_id == c.child_id,
                            ChildRelationship.is_deleted.is_(False),
                        )
                    )
                    if not exists:
                        db.add(
                            ChildRelationship(
                                workspace_id=workspace_id,
                                union_id=single_union.id,
                                child_id=c.child_id,
                                relationship_type=c.relationship_type,
                            )
                        )

            # Soft-delete the original joint child relationships
            for c in children:
                c.is_deleted = True
                c.deleted_at = now

        # Soft-delete the joint union
        union.is_deleted = True
        union.deleted_at = now

        record_audit_event(
            db,
            workspace_id,
            actor.id,
            actor.display_name,
            actor.email,
            "FamilyUnion",
            union.id,
            "DELETE",
            {
                "action": "disconnect_partner",
                "partner1": f"{base.first_name} {base.last_name}",
                "partner2": f"{target.first_name} {target.last_name}",
            },
        )
        return {
            "status": "success",
            "message": f"Disconnected partnership between {base.first_name} and {target.first_name}",
        }

    # If parent/child relationship:
    # Identify which person is parent and which is child
    parent_person = target if relationship_type == "parent" else base
    child_person = base if relationship_type == "parent" else target

    # Find unions that include parent_person
    parent_unions_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        FamilyUnion.is_deleted.is_(False),
        or_(
            FamilyUnion.partner1_id == parent_person.id,
            FamilyUnion.partner2_id == parent_person.id,
        ),
    )
    parent_unions = list(db.scalars(parent_unions_stmt).all())
    union_ids = [u.id for u in parent_unions]

    if not union_ids:
        raise ValueError("No active parent unions found for the specified parent")

    # Find the ChildRelationship linking this child to one of the parent's unions
    child_rel_stmt = select(ChildRelationship).where(
        ChildRelationship.workspace_id == workspace_id,
        ChildRelationship.union_id.in_(union_ids),
        ChildRelationship.child_id == child_person.id,
        ChildRelationship.is_deleted.is_(False),
    )
    child_rel = db.scalar(child_rel_stmt)
    if not child_rel:
        raise ValueError("Parent-child relationship not found")

    # Find the specific union for this relationship
    target_union = next(u for u in parent_unions if u.id == child_rel.union_id)

    # Check if there is another parent in this union
    other_parent_id = (
        target_union.partner2_id
        if target_union.partner1_id == parent_person.id
        else target_union.partner1_id
    )

    if other_parent_id:
        # Transfer the child to a single-parent union with other_parent_id
        single_union_stmt = select(FamilyUnion).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted.is_(False),
            or_(
                (FamilyUnion.partner1_id == other_parent_id) & (FamilyUnion.partner2_id.is_(None)),
                (FamilyUnion.partner2_id == other_parent_id) & (FamilyUnion.partner1_id.is_(None)),
            ),
        )
        single_union = db.scalar(single_union_stmt)
        if not single_union:
            single_union = FamilyUnion(
                workspace_id=workspace_id,
                partner1_id=other_parent_id,
                partner2_id=None,
            )
            db.add(single_union)
            db.flush()

        exists = db.scalar(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.union_id == single_union.id,
                ChildRelationship.child_id == child_person.id,
                ChildRelationship.is_deleted.is_(False),
            )
        )
        if not exists:
            db.add(
                ChildRelationship(
                    workspace_id=workspace_id,
                    union_id=single_union.id,
                    child_id=child_person.id,
                    relationship_type=child_rel.relationship_type,
                )
            )

    # Soft-delete the child relationship to the removed parent's union
    child_rel.is_deleted = True
    child_rel.deleted_at = now

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "ChildRelationship",
        child_rel.id,
        "DELETE",
        {
            "action": "disconnect_parent_child",
            "parent": f"{parent_person.first_name} {parent_person.last_name}",
            "child": f"{child_person.first_name} {child_person.last_name}",
        },
    )

    return {
        "status": "success",
        "message": f"Disconnected {parent_person.first_name} as parent of {child_person.first_name}",
    }
