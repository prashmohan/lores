import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion


def serialize_person(
    person: Person,
    viewer_role: str,
    relationship_label: str | None = None,
) -> dict[str, Any]:
    # Privacy rule: Living persons have dates and places masked for view-only users
    is_masked = (viewer_role == "viewer") and person.is_living

    return {
        "id": str(person.id),
        "first_name": person.first_name,
        "last_name": person.last_name,
        "maiden_name": person.maiden_name,
        "gender": person.gender,
        "is_living": person.is_living,
        "birth_date": None if is_masked else person.birth_date,
        "birth_place": None if is_masked else person.birth_place,
        "death_date": person.death_date,
        "death_place": person.death_place,
        "avatar_url": person.avatar_url,
        "relationship_label": relationship_label,
    }


def get_focus_neighborhood(
    db: Session,
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    viewer_role: str = "collaborator",
) -> dict[str, Any]:
    focus = db.get(Person, person_id)
    if not focus or focus.workspace_id != workspace_id or focus.is_deleted:
        raise ValueError("Person not found in workspace")

    # 1. Parents & Siblings via ChildRelationship
    parent_union_stmt = select(ChildRelationship.union_id).where(
        ChildRelationship.workspace_id == workspace_id,
        ChildRelationship.child_id == person_id,
        ChildRelationship.is_deleted.is_(False),
    )
    parent_union_ids = list(db.scalars(parent_union_stmt).all())

    parents: list[dict[str, Any]] = []
    siblings: list[dict[str, Any]] = []
    sibling_ids: set[uuid.UUID] = set()

    if parent_union_ids:
        # Fetch parents
        union_stmt = select(FamilyUnion).where(
            FamilyUnion.id.in_(parent_union_ids),
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted.is_(False),
        )
        parent_unions = list(db.scalars(union_stmt).all())
        parent_ids: set[uuid.UUID] = set()
        for u in parent_unions:
            if u.partner1_id:
                parent_ids.add(u.partner1_id)
            if u.partner2_id:
                parent_ids.add(u.partner2_id)

        if parent_ids:
            p_stmt = (
                select(Person)
                .where(
                    Person.id.in_(parent_ids),
                    Person.workspace_id == workspace_id,
                    Person.is_deleted.is_(False),
                )
                .order_by(Person.birth_date.asc().nulls_last(), Person.first_name.asc())
            )
            for p in db.scalars(p_stmt).all():
                parents.append(serialize_person(p, viewer_role, "Parent"))

        # Fetch siblings
        sib_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.union_id.in_(parent_union_ids),
            ChildRelationship.child_id != person_id,
            ChildRelationship.is_deleted.is_(False),
        )
        for s_id in db.scalars(sib_stmt).all():
            sibling_ids.add(s_id)

        if sibling_ids:
            s_stmt = (
                select(Person)
                .where(
                    Person.id.in_(sibling_ids),
                    Person.workspace_id == workspace_id,
                    Person.is_deleted.is_(False),
                )
                .order_by(Person.birth_date.asc().nulls_last(), Person.first_name.asc())
            )
            for s in db.scalars(s_stmt).all():
                siblings.append(serialize_person(s, viewer_role, "Sibling"))

    # 2. Partners & Children
    partner_union_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        FamilyUnion.is_deleted.is_(False),
        (FamilyUnion.partner1_id == person_id) | (FamilyUnion.partner2_id == person_id),
    )
    partner_unions = list(db.scalars(partner_union_stmt).all())

    partners: list[dict[str, Any]] = []
    children: list[dict[str, Any]] = []
    partner_ids: set[uuid.UUID] = set()
    child_ids: set[uuid.UUID] = set()

    for u in partner_unions:
        p_other_id = u.partner2_id if u.partner1_id == person_id else u.partner1_id
        if p_other_id and p_other_id != person_id:
            partner_ids.add(p_other_id)

        ch_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.union_id == u.id,
            ChildRelationship.is_deleted.is_(False),
        )
        for c_id in db.scalars(ch_stmt).all():
            if c_id != person_id:
                child_ids.add(c_id)

    if partner_ids:
        part_stmt = (
            select(Person)
            .where(
                Person.id.in_(partner_ids),
                Person.workspace_id == workspace_id,
                Person.is_deleted.is_(False),
            )
            .order_by(Person.birth_date.asc().nulls_last(), Person.first_name.asc())
        )
        for p in db.scalars(part_stmt).all():
            partners.append(serialize_person(p, viewer_role, "Partner"))

    if child_ids:
        child_person_stmt = (
            select(Person)
            .where(
                Person.id.in_(child_ids),
                Person.workspace_id == workspace_id,
                Person.is_deleted.is_(False),
            )
            .order_by(Person.birth_date.asc().nulls_last(), Person.first_name.asc())
        )
        for c in db.scalars(child_person_stmt).all():
            children.append(serialize_person(c, viewer_role, "Child"))

    return {
        "focus_person": serialize_person(focus, viewer_role, "Focus"),
        "parents": parents,
        "partners": partners,
        "children": children,
        "siblings": siblings,
    }
