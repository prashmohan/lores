import uuid

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.services.person_service import (
    ConcurrencyConflictError,
    add_relative_atomic,
    create_person,
    get_person_by_id,
    list_people,
    update_person_optimistic,
)


def test_add_parent_and_child_atomically(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    # 1. Add base person
    focus = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    db_session.add(focus)
    db_session.commit()

    # 2. Add Parent atomically
    parent = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="parent",
        base_person_id=focus.id,
        person_data={"first_name": "Arthur", "last_name": "Miller", "gender": "male"},
        actor=actor,
    )
    db_session.commit()
    assert parent.id is not None
    assert parent.first_name == "Arthur"

    # Verify union and child relationship created
    child_rel = db_session.scalar(
        select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == focus.id,
        )
    )
    assert child_rel is not None
    union = db_session.get(FamilyUnion, child_rel.union_id)
    assert union is not None
    assert union.partner1_id == parent.id

    # 3. Add Partner atomically
    partner = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="partner",
        base_person_id=focus.id,
        person_data={"first_name": "George", "last_name": "Vance", "gender": "male"},
        actor=actor,
    )
    db_session.commit()
    assert partner.first_name == "George"

    partner_union = db_session.scalar(
        select(FamilyUnion).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.partner1_id == focus.id,
            FamilyUnion.partner2_id == partner.id,
        )
    )
    assert partner_union is not None


def test_add_child_atomically_reuses_or_creates_union(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    # Base person (Mother)
    mother = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    db_session.add(mother)
    db_session.commit()

    # 1. Add child (creates union with mother as partner1)
    child1 = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="child",
        base_person_id=mother.id,
        person_data={"first_name": "Ronald", "gender": "male"},
        actor=actor,
    )
    db_session.commit()
    assert child1.last_name == "Miller"  # Inherits base last_name if omitted

    # 2. Add second child (reuses existing union)
    child2 = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="child",
        base_person_id=mother.id,
        person_data={"first_name": "Dorothy", "gender": "female"},
        actor=actor,
    )
    db_session.commit()

    # Check both children belong to the same union
    rel1 = db_session.scalar(
        select(ChildRelationship).where(ChildRelationship.child_id == child1.id)
    )
    rel2 = db_session.scalar(
        select(ChildRelationship).where(ChildRelationship.child_id == child2.id)
    )
    assert rel1 is not None and rel2 is not None
    assert rel1.union_id == rel2.union_id


def test_add_sibling_atomically_wires_to_parent_union(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    focus = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    db_session.add(focus)
    db_session.commit()

    # Add sibling when focus has no parent union yet -> auto-creates generic parent union
    sibling = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="sibling",
        base_person_id=focus.id,
        person_data={"first_name": "Robert", "gender": "male"},
        actor=actor,
    )
    db_session.commit()

    focus_rel = db_session.scalar(
        select(ChildRelationship).where(ChildRelationship.child_id == focus.id)
    )
    sib_rel = db_session.scalar(
        select(ChildRelationship).where(ChildRelationship.child_id == sibling.id)
    )
    assert focus_rel is not None
    assert sib_rel is not None
    assert focus_rel.union_id == sib_rel.union_id

    # Add second sibling -> attaches to same existing parent union
    sibling2 = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="sibling",
        base_person_id=focus.id,
        person_data={"first_name": "Carol", "gender": "female"},
        actor=actor,
    )
    db_session.commit()
    sib2_rel = db_session.scalar(
        select(ChildRelationship).where(ChildRelationship.child_id == sibling2.id)
    )
    assert sib2_rel is not None
    assert sib2_rel.union_id == focus_rel.union_id


def test_add_parent_populates_second_partner_slot_in_existing_union(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    child = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    mother = Person(workspace_id=workspace_id, first_name="Clara", last_name="Higgins")
    db_session.add_all([child, mother])
    db_session.commit()

    # Mother is partner1 of parent union
    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=mother.id, partner2_id=None)
    db_session.add(p_union)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=child.id)
    )
    db_session.commit()

    # Add Father atomically
    father = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="parent",
        base_person_id=child.id,
        person_data={"first_name": "Arthur", "last_name": "Miller", "gender": "male"},
        actor=actor,
    )
    db_session.commit()

    # Union now has both mother and father
    updated_union = db_session.get(FamilyUnion, p_union.id)
    assert updated_union is not None
    assert updated_union.partner1_id == mother.id
    assert updated_union.partner2_id == father.id


def test_add_parent_when_union_is_full_creates_second_parent_union(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    child = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    mother = Person(workspace_id=workspace_id, first_name="Clara", last_name="Higgins")
    father = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller")
    db_session.add_all([child, mother, father])
    db_session.commit()

    # Union with two biological parents
    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=mother.id, partner2_id=father.id)
    db_session.add(p_union)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=child.id)
    )
    db_session.commit()

    # Add Step-mother
    step_mother = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="parent",
        base_person_id=child.id,
        person_data={"first_name": "Eleanor", "last_name": "Roosevelt", "gender": "female"},
        actor=actor,
    )
    db_session.commit()

    # Check child now has 2 parent unions
    child_rels = list(
        db_session.scalars(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.child_id == child.id,
            )
        ).all()
    )
    assert len(child_rels) == 2
    step_union_id = next(r.union_id for r in child_rels if r.union_id != p_union.id)
    step_union = db_session.get(FamilyUnion, step_union_id)
    assert step_union is not None
    assert step_union.partner1_id == step_mother.id


def test_add_relative_cycle_prevention(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    # Grandfather -> Father -> Son
    grandfather = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller")
    father = Person(workspace_id=workspace_id, first_name="Robert", last_name="Miller")
    son = Person(workspace_id=workspace_id, first_name="David", last_name="Miller")
    db_session.add_all([grandfather, father, son])
    db_session.commit()

    u1 = FamilyUnion(workspace_id=workspace_id, partner1_id=grandfather.id)
    db_session.add(u1)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=u1.id, child_id=father.id))

    u2 = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id)
    db_session.add(u2)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=u2.id, child_id=son.id))
    db_session.commit()

    # Adding child to Son works cleanly
    grandson = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="child",
        base_person_id=son.id,
        person_data={"first_name": "Timmy", "last_name": "Miller"},
        actor=actor,
    )
    db_session.commit()
    assert grandson.id is not None


def test_add_relative_validations_and_errors(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    fake_id = uuid.uuid4()

    # 1. Non-existent base person
    with pytest.raises(ValueError, match="Base person not found in workspace"):
        add_relative_atomic(
            db=db_session,
            workspace_id=workspace_id,
            relative_type="child",
            base_person_id=fake_id,
            person_data={"first_name": "NoBase"},
            actor=actor,
        )

    # 2. Base person in different workspace
    other_ws = uuid.uuid4()
    person_other = Person(workspace_id=other_ws, first_name="Foreign", last_name="Person")
    db_session.add(person_other)
    db_session.commit()

    with pytest.raises(ValueError, match="Base person not found in workspace"):
        add_relative_atomic(
            db=db_session,
            workspace_id=workspace_id,
            relative_type="parent",
            base_person_id=person_other.id,
            person_data={"first_name": "Parent"},
            actor=actor,
        )

    # 3. Base person is deleted
    person_del = Person(
        workspace_id=workspace_id,
        first_name="Deleted",
        last_name="Person",
        is_deleted=True,
    )
    db_session.add(person_del)
    db_session.commit()

    with pytest.raises(ValueError, match="Base person not found in workspace"):
        add_relative_atomic(
            db=db_session,
            workspace_id=workspace_id,
            relative_type="parent",
            base_person_id=person_del.id,
            person_data={"first_name": "Parent"},
            actor=actor,
        )

    # 4. Invalid relative type
    focus = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    db_session.add(focus)
    db_session.commit()

    with pytest.raises(ValueError, match="Unsupported relative type"):
        add_relative_atomic(
            db=db_session,
            workspace_id=workspace_id,
            relative_type="second_cousin",
            base_person_id=focus.id,
            person_data={"first_name": "Cousin"},
            actor=actor,
        )


def test_update_person_optimistic_success(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    person = Person(
        workspace_id=workspace_id,
        first_name="Margaret",
        last_name="Miller",
        birth_place="Boston",
    )
    db_session.add(person)
    db_session.commit()

    initial_updated_at = person.updated_at

    # Update person with expected_updated_at matching
    updated = update_person_optimistic(
        db=db_session,
        workspace_id=workspace_id,
        person_id=person.id,
        updates={"birth_place": "Chicago", "biography": "Loved gardening."},
        expected_updated_at=initial_updated_at,
        actor=actor,
    )
    db_session.commit()

    assert updated.birth_place == "Chicago"
    assert updated.biography == "Loved gardening."

    # Verify audit log was recorded with exact changes
    logs = list(
        db_session.scalars(
            select(AuditLog).where(
                AuditLog.workspace_id == workspace_id,
                AuditLog.entity_id == person.id,
                AuditLog.action == "UPDATE",
            )
        ).all()
    )
    assert len(logs) == 1
    assert logs[0].changes["birth_place"]["old"] == "Boston"
    assert logs[0].changes["birth_place"]["new"] == "Chicago"
    assert logs[0].changes["biography"]["new"] == "Loved gardening."


def test_update_person_optimistic_conflict_detection(db_session):
    workspace_id = uuid.uuid4()
    actor1 = User(email="alice@example.com", display_name="Alice")
    actor2 = User(email="bob@example.com", display_name="Bob")
    db_session.add_all([actor1, actor2])
    db_session.commit()

    person = Person(
        workspace_id=workspace_id,
        first_name="Margaret",
        last_name="Miller",
        birth_date="1942-05-15",
    )
    db_session.add(person)
    db_session.commit()

    # User A and User B both read the record at time T0
    stale_timestamp = person.updated_at

    # User A updates the record first at time T1
    update_person_optimistic(
        db=db_session,
        workspace_id=workspace_id,
        person_id=person.id,
        updates={"birth_date": "1942-05-16"},
        expected_updated_at=stale_timestamp,
        actor=actor1,
    )
    db_session.commit()

    # User B now attempts to update with stale T0 timestamp
    with pytest.raises(ConcurrencyConflictError) as exc_info:
        update_person_optimistic(
            db=db_session,
            workspace_id=workspace_id,
            person_id=person.id,
            updates={"birth_date": "1942-05-20"},
            expected_updated_at=stale_timestamp,
            actor=actor2,
        )

    conflict_err = exc_info.value
    assert conflict_err.details["conflict"] is True
    assert conflict_err.details["field"] == "birth_date"
    assert conflict_err.details["current_value"] == "1942-05-16"
    assert conflict_err.details["updated_by"] == "Alice"


def test_update_person_not_found_raises(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    fake_id = uuid.uuid4()
    with pytest.raises(ValueError, match="Person not found in workspace"):
        update_person_optimistic(
            db=db_session,
            workspace_id=workspace_id,
            person_id=fake_id,
            updates={"first_name": "Ghost"},
            expected_updated_at=None,
            actor=actor,
        )


def test_person_service_crud_helpers(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    # Create Person
    p1 = create_person(
        db=db_session,
        workspace_id=workspace_id,
        person_data={"first_name": "Arthur", "last_name": "Miller", "gender": "male"},
        actor=actor,
    )
    p2 = create_person(
        db=db_session,
        workspace_id=workspace_id,
        person_data={"first_name": "Margaret", "last_name": "Miller", "gender": "female"},
        actor=actor,
    )
    p3 = create_person(
        db=db_session,
        workspace_id=workspace_id,
        person_data={"first_name": "George", "last_name": "Vance", "gender": "male"},
        actor=actor,
    )
    db_session.commit()

    # Get by ID
    fetched = get_person_by_id(db_session, workspace_id, p1.id)
    assert fetched is not None
    assert fetched.first_name == "Arthur"

    # List people
    all_people = list_people(db_session, workspace_id)
    assert len(all_people) == 3
    assert p3.id in [p.id for p in all_people]

    # Search query
    miller_people = list_people(db_session, workspace_id, query="Miller")
    assert len(miller_people) == 2

    margaret_people = list_people(db_session, workspace_id, query="Margaret")
    assert len(margaret_people) == 1
    assert margaret_people[0].id == p2.id


def test_add_child_with_both_parents(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    mother = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    father = Person(workspace_id=workspace_id, first_name="George", last_name="Vance")
    db_session.add_all([mother, father])
    db_session.commit()

    # Add child specifying mother as base and father as other_parent_id
    child = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="child",
        base_person_id=mother.id,
        other_parent_id=father.id,
        person_data={"first_name": "David", "last_name": "Vance", "gender": "male"},
        actor=actor,
    )
    db_session.commit()

    # Verify union contains both mother and father
    child_rel = db_session.scalar(
        select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == child.id,
        )
    )
    assert child_rel is not None
    union = db_session.get(FamilyUnion, child_rel.union_id)
    assert union is not None
    assert {union.partner1_id, union.partner2_id} == {mother.id, father.id}


def test_add_parent_linking_existing_person(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()

    child = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    mother = Person(workspace_id=workspace_id, first_name="Clara", last_name="Higgins")
    father = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller")
    db_session.add_all([child, mother, father])
    db_session.commit()

    # Mother already linked as partner1
    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=mother.id)
    db_session.add(p_union)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=child.id)
    )
    db_session.commit()

    # Link existing father into child's parents
    linked_father = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="parent",
        base_person_id=child.id,
        existing_person_id=father.id,
        actor=actor,
    )
    db_session.commit()
    assert linked_father.id == father.id

    # Union now has both Clara and Arthur
    updated_union = db_session.get(FamilyUnion, p_union.id)
    assert updated_union is not None
    assert updated_union.partner1_id == mother.id
    assert updated_union.partner2_id == father.id
