import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.services.audit_service import record_audit_event


def create_lore(
    db: Session,
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    title: str,
    content: str,
    actor: User,
    event_year: int | None = None,
    tags: list[str] | None = None,
) -> LoreNote:
    person = db.get(Person, person_id)
    if not person or person.workspace_id != workspace_id or person.is_deleted:
        raise ValueError("Person not found in workspace")

    lore = LoreNote(
        workspace_id=workspace_id,
        person_id=person_id,
        title=title,
        content=content,
        author_id=actor.id,
        event_year=event_year,
        tags=tags if tags is not None else [],
    )
    db.add(lore)
    db.flush()
    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "LoreNote",
        lore.id,
        "CREATE",
        {"title": title, "person_id": str(person_id)},
    )
    return lore


def get_lore_by_id(
    db: Session,
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    include_deleted: bool = False,
) -> LoreNote | None:
    lore = db.get(LoreNote, lore_id)
    if not lore or lore.workspace_id != workspace_id:
        return None
    if not include_deleted and lore.is_deleted:
        return None
    return lore


def get_lore_for_person(
    db: Session,
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    include_deleted: bool = False,
) -> list[LoreNote]:
    stmt = select(LoreNote).where(
        LoreNote.workspace_id == workspace_id,
        LoreNote.person_id == person_id,
    )
    if not include_deleted:
        stmt = stmt.where(LoreNote.is_deleted == False)
    stmt = stmt.order_by(LoreNote.event_year.desc().nullslast(), LoreNote.created_at.desc())
    return list(db.scalars(stmt).all())


def update_lore(
    db: Session,
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    updates: dict[str, Any],
    actor: User,
) -> LoreNote:
    lore = db.get(LoreNote, lore_id)
    if not lore or lore.workspace_id != workspace_id or lore.is_deleted:
        raise ValueError("Lore note not found in workspace")

    allowed_fields = {"title", "content", "event_year", "tags"}
    changes: dict[str, Any] = {}
    for key, val in updates.items():
        if key in allowed_fields and val is not None:
            old_val = getattr(lore, key)
            if old_val != val:
                changes[key] = {"old": old_val, "new": val}
                setattr(lore, key, val)

    if changes:
        record_audit_event(
            db,
            workspace_id,
            actor.id,
            actor.display_name,
            actor.email,
            "LoreNote",
            lore.id,
            "UPDATE",
            changes,
        )
    return lore


def soft_delete_lore(
    db: Session,
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    actor: User,
) -> LoreNote:
    lore = db.get(LoreNote, lore_id)
    if not lore or lore.workspace_id != workspace_id or lore.is_deleted:
        raise ValueError("Lore note not found in workspace")

    now = datetime.now(UTC)
    lore.is_deleted = True
    lore.deleted_at = now
    lore.deleted_by_id = actor.id

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "LoreNote",
        lore.id,
        "SOFT_DELETE",
        {"title": lore.title},
    )
    return lore


def soft_delete_person(
    db: Session,
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    actor: User,
) -> Person:
    person = db.get(Person, person_id)
    if not person or person.workspace_id != workspace_id or person.is_deleted:
        raise ValueError("Person not found in workspace")

    now = datetime.now(UTC)
    person.is_deleted = True
    person.deleted_at = now
    person.deleted_by_id = actor.id

    # Cascade soft-delete to child relationships where this person is child
    ch_stmt = select(ChildRelationship).where(
        ChildRelationship.workspace_id == workspace_id,
        ChildRelationship.child_id == person_id,
        ChildRelationship.is_deleted == False,
    )
    for rel in db.scalars(ch_stmt).all():
        rel.is_deleted = True
        rel.deleted_at = now

    # Cascade soft-delete to unions where this person is a partner
    union_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        (FamilyUnion.partner1_id == person_id) | (FamilyUnion.partner2_id == person_id),
        FamilyUnion.is_deleted == False,
    )
    for union in db.scalars(union_stmt).all():
        union.is_deleted = True
        union.deleted_at = now

        # Child relationships belonging to this union
        union_ch_stmt = select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.union_id == union.id,
            ChildRelationship.is_deleted == False,
        )
        for u_rel in db.scalars(union_ch_stmt).all():
            u_rel.is_deleted = True
            u_rel.deleted_at = now

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "Person",
        person.id,
        "SOFT_DELETE",
        {"name": f"{person.first_name} {person.last_name}"},
    )
    return person


def get_trash_items(
    db: Session,
    workspace_id: uuid.UUID,
    max_age_days: int = 30,
) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=max_age_days)

    items: list[dict[str, Any]] = []

    # Deleted People
    person_stmt = select(Person).where(
        Person.workspace_id == workspace_id,
        Person.is_deleted == True,
    )
    for p in db.scalars(person_stmt).all():
        p_deleted_at = p.deleted_at
        if p_deleted_at and p_deleted_at.tzinfo is None:
            p_deleted_at = p_deleted_at.replace(tzinfo=UTC)
        if p_deleted_at and p_deleted_at < cutoff:
            continue
        days_ago = (now - p_deleted_at).days if p_deleted_at else 0
        days_remaining = max(0, max_age_days - days_ago)
        items.append(
            {
                "id": str(p.id),
                "entity_type": "Person",
                "name": f"{p.first_name} {p.last_name}",
                "deleted_at": p.deleted_at.isoformat() if p.deleted_at else None,
                "deleted_by_id": str(p.deleted_by_id) if p.deleted_by_id else None,
                "days_remaining": days_remaining,
            }
        )

    # Deleted LoreNotes
    lore_stmt = select(LoreNote).where(
        LoreNote.workspace_id == workspace_id,
        LoreNote.is_deleted == True,
    )
    for lore in db.scalars(lore_stmt).all():
        l_deleted_at = lore.deleted_at
        if l_deleted_at and l_deleted_at.tzinfo is None:
            l_deleted_at = l_deleted_at.replace(tzinfo=UTC)
        if l_deleted_at and l_deleted_at < cutoff:
            continue
        days_ago = (now - l_deleted_at).days if l_deleted_at else 0
        days_remaining = max(0, max_age_days - days_ago)
        items.append(
            {
                "id": str(lore.id),
                "entity_type": "LoreNote",
                "name": lore.title,
                "deleted_at": lore.deleted_at.isoformat() if lore.deleted_at else None,
                "deleted_by_id": str(lore.deleted_by_id) if lore.deleted_by_id else None,
                "days_remaining": days_remaining,
            }
        )

    items.sort(key=lambda x: x["deleted_at"] or "", reverse=True)
    return items


def restore_from_trash(
    db: Session,
    workspace_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    actor: User,
) -> Any:
    if entity_type == "Person":
        person = db.get(Person, entity_id)
        if not person or person.workspace_id != workspace_id or not person.is_deleted:
            raise ValueError("Item not found in trash")

        person.is_deleted = False
        person.deleted_at = None
        person.deleted_by_id = None

        # Reactivate child relationships
        ch_stmt = select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == entity_id,
        )
        for rel in db.scalars(ch_stmt).all():
            rel.is_deleted = False
            rel.deleted_at = None

        # Reactivate unions where person was a partner
        union_stmt = select(FamilyUnion).where(
            FamilyUnion.workspace_id == workspace_id,
            (FamilyUnion.partner1_id == entity_id) | (FamilyUnion.partner2_id == entity_id),
        )
        for union in db.scalars(union_stmt).all():
            union.is_deleted = False
            union.deleted_at = None

            union_ch_stmt = select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.union_id == union.id,
            )
            for u_rel in db.scalars(union_ch_stmt).all():
                u_rel.is_deleted = False
                u_rel.deleted_at = None

        record_audit_event(
            db,
            workspace_id,
            actor.id,
            actor.display_name,
            actor.email,
            "Person",
            person.id,
            "RESTORE",
            {"name": f"{person.first_name} {person.last_name}"},
        )
        return person

    elif entity_type == "LoreNote":
        lore = db.get(LoreNote, entity_id)
        if not lore or lore.workspace_id != workspace_id or not lore.is_deleted:
            raise ValueError("Item not found in trash")

        lore.is_deleted = False
        lore.deleted_at = None
        lore.deleted_by_id = None

        record_audit_event(
            db,
            workspace_id,
            actor.id,
            actor.display_name,
            actor.email,
            "LoreNote",
            lore.id,
            "RESTORE",
            {"title": lore.title},
        )
        return lore

    raise ValueError(f"Unknown entity type: {entity_type}")


def purge_trash(
    db: Session,
    workspace_id: uuid.UUID,
    actor: User,
) -> int:
    deleted_lores = list(
        db.scalars(
            select(LoreNote).where(
                LoreNote.workspace_id == workspace_id,
                LoreNote.is_deleted == True,
            )
        ).all()
    )
    for lore in deleted_lores:
        db.delete(lore)

    deleted_rels = list(
        db.scalars(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.is_deleted == True,
            )
        ).all()
    )
    for r in deleted_rels:
        db.delete(r)

    deleted_unions = list(
        db.scalars(
            select(FamilyUnion).where(
                FamilyUnion.workspace_id == workspace_id,
                FamilyUnion.is_deleted == True,
            )
        ).all()
    )
    for u in deleted_unions:
        db.delete(u)

    deleted_people = list(
        db.scalars(
            select(Person).where(
                Person.workspace_id == workspace_id,
                Person.is_deleted == True,
            )
        ).all()
    )
    for p in deleted_people:
        db.delete(p)

    total_purged = (
        len(deleted_lores) + len(deleted_rels) + len(deleted_unions) + len(deleted_people)
    )
    db.flush()

    record_audit_event(
        db,
        workspace_id,
        actor.id,
        actor.display_name,
        actor.email,
        "Trash",
        workspace_id,
        "PURGE",
        {"purged_count": total_purged},
    )
    return total_purged
