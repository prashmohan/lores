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
    person_data: dict[str, Any] | PersonCreate,
    actor: User,
) -> Person:
    base = db.get(Person, base_person_id)
    if not base or base.workspace_id != workspace_id or base.is_deleted:
        raise ValueError("Base person not found in workspace")

    allowed_types = ("parent", "partner", "child", "sibling")
    if relative_type not in allowed_types:
        raise ValueError(f"Unsupported relative type: {relative_type}")

    data = person_data.model_dump() if isinstance(person_data, PersonCreate) else dict(person_data)

    # 1. Create new person record
    new_person = Person(
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
    db.add(new_person)
    db.flush()

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "Person",
        new_person.id,
        "CREATE",
        {"person": f"{new_person.first_name} {new_person.last_name}"},
    )

    # 2. Connect based on relative_type
    if relative_type == "parent":
        # Check if base person already has a parent union
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
                    union.partner1_id = new_person.id
                    validate_no_cycle(db, workspace_id, union.id, base_person_id)
                elif not union.partner2_id and union.partner1_id != new_person.id:
                    union.partner2_id = new_person.id
                    validate_no_cycle(db, workspace_id, union.id, base_person_id)
                else:
                    new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=new_person.id)
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
                new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=new_person.id)
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
            new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=new_person.id)
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
        partner_union = FamilyUnion(
            workspace_id=workspace_id,
            partner1_id=base_person_id,
            partner2_id=new_person.id,
        )
        db.add(partner_union)
        db.flush()

    elif relative_type == "child":
        # Find or create a union for base_person
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
        validate_no_cycle(db, workspace_id, child_union.id, new_person.id)
        db.add(
            ChildRelationship(
                workspace_id=workspace_id, union_id=child_union.id, child_id=new_person.id
            )
        )

    elif relative_type == "sibling":
        # Attach to same parent union as base_person
        sibling_rel_stmt = select(ChildRelationship.union_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == base_person_id,
            ChildRelationship.is_deleted.is_(False),
        )
        sibling_union_id = db.scalar(sibling_rel_stmt)
        if not sibling_union_id:
            # Create a generic parent union
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
        validate_no_cycle(db, workspace_id, sibling_union_id, new_person.id)
        db.add(
            ChildRelationship(
                workspace_id=workspace_id,
                union_id=sibling_union_id,
                child_id=new_person.id,
            )
        )

    return new_person


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
