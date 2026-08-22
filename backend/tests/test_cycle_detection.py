import uuid

import pytest

from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.services.cycle_service import get_descendants_ids, validate_no_cycle


def test_detects_and_prevents_ancestor_cycle(db_session):
    workspace_id = uuid.uuid4()

    # Create Gen 1: Grandfather
    grandfather = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller")
    # Create Gen 2: Father
    father = Person(workspace_id=workspace_id, first_name="Robert", last_name="Miller")
    # Create Gen 3: Son
    son = Person(workspace_id=workspace_id, first_name="David", last_name="Miller")

    db_session.add_all([grandfather, father, son])
    db_session.commit()

    # Grandfather Union -> Father
    union_1 = FamilyUnion(workspace_id=workspace_id, partner1_id=grandfather.id)
    db_session.add(union_1)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=union_1.id, child_id=father.id)
    )

    # Father Union -> Son
    union_2 = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id)
    db_session.add(union_2)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=union_2.id, child_id=son.id)
    )
    db_session.commit()

    # Attempting to make Son a parent of Grandfather (Union 3 with partner=Son, child=Grandfather)
    union_3 = FamilyUnion(workspace_id=workspace_id, partner1_id=son.id)
    db_session.add(union_3)
    db_session.flush()

    with pytest.raises(ValueError, match="Cycle detected: A person cannot be their own ancestor"):
        validate_no_cycle(
            db_session, workspace_id=workspace_id, union_id=union_3.id, child_id=grandfather.id
        )


def test_detects_and_prevents_self_parent_cycle(db_session):
    workspace_id = uuid.uuid4()
    person = Person(workspace_id=workspace_id, first_name="Alice", last_name="Smith")
    db_session.add(person)
    db_session.commit()

    # Union with Alice as partner1
    union = FamilyUnion(workspace_id=workspace_id, partner1_id=person.id)
    db_session.add(union)
    db_session.flush()

    with pytest.raises(ValueError, match="Cycle detected: A person cannot be their own parent"):
        validate_no_cycle(
            db_session, workspace_id=workspace_id, union_id=union.id, child_id=person.id
        )

    # Union with Alice as partner2
    partner = Person(workspace_id=workspace_id, first_name="Bob", last_name="Smith")
    db_session.add(partner)
    db_session.commit()

    union_p2 = FamilyUnion(workspace_id=workspace_id, partner1_id=partner.id, partner2_id=person.id)
    db_session.add(union_p2)
    db_session.flush()

    with pytest.raises(ValueError, match="Cycle detected: A person cannot be their own parent"):
        validate_no_cycle(
            db_session, workspace_id=workspace_id, union_id=union_p2.id, child_id=person.id
        )


def test_validate_no_cycle_raises_on_invalid_union_or_workspace(db_session):
    workspace_id = uuid.uuid4()
    other_workspace_id = uuid.uuid4()

    person = Person(workspace_id=workspace_id, first_name="Alice", last_name="Smith")
    union = FamilyUnion(workspace_id=other_workspace_id)
    db_session.add_all([person, union])
    db_session.commit()

    with pytest.raises(ValueError, match="Union not found in workspace"):
        validate_no_cycle(
            db_session, workspace_id=workspace_id, union_id=union.id, child_id=person.id
        )

    non_existent_union_id = uuid.uuid4()
    with pytest.raises(ValueError, match="Union not found in workspace"):
        validate_no_cycle(
            db_session,
            workspace_id=workspace_id,
            union_id=non_existent_union_id,
            child_id=person.id,
        )


def test_get_descendants_ids_and_valid_lineage(db_session):
    workspace_id = uuid.uuid4()

    # G1: Gen 1
    p1 = Person(workspace_id=workspace_id, first_name="G1_A", last_name="Miller")
    p2 = Person(workspace_id=workspace_id, first_name="G1_B", last_name="Miller")
    # G2: Gen 2
    c1 = Person(workspace_id=workspace_id, first_name="G2_A", last_name="Miller")
    c2 = Person(workspace_id=workspace_id, first_name="G2_B", last_name="Miller")
    # G3: Gen 3
    gc1 = Person(workspace_id=workspace_id, first_name="G3_A", last_name="Miller")

    db_session.add_all([p1, p2, c1, c2, gc1])
    db_session.commit()

    # Union 1: p1 + p2 -> c1, c2
    u1 = FamilyUnion(workspace_id=workspace_id, partner1_id=p1.id, partner2_id=p2.id)
    db_session.add(u1)
    db_session.flush()
    db_session.add_all(
        [
            ChildRelationship(workspace_id=workspace_id, union_id=u1.id, child_id=c1.id),
            ChildRelationship(workspace_id=workspace_id, union_id=u1.id, child_id=c2.id),
        ]
    )

    # Union 2: c1 -> gc1
    u2 = FamilyUnion(workspace_id=workspace_id, partner1_id=c1.id)
    db_session.add(u2)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=u2.id, child_id=gc1.id))
    db_session.commit()

    # Descendants of p1 should be {c1, c2, gc1}
    descendants_p1 = get_descendants_ids(
        db_session, workspace_id=workspace_id, root_person_id=p1.id
    )
    assert descendants_p1 == {c1.id, c2.id, gc1.id}

    # Descendants of c1 should be {gc1}
    descendants_c1 = get_descendants_ids(
        db_session, workspace_id=workspace_id, root_person_id=c1.id
    )
    assert descendants_c1 == {gc1.id}

    # Descendants of gc1 should be empty set
    descendants_gc1 = get_descendants_ids(
        db_session, workspace_id=workspace_id, root_person_id=gc1.id
    )
    assert descendants_gc1 == set()

    # Adding a new unrelated person as child of u2 is valid
    new_child = Person(workspace_id=workspace_id, first_name="G3_B", last_name="Miller")
    db_session.add(new_child)
    db_session.commit()
    # Should not raise
    validate_no_cycle(db_session, workspace_id=workspace_id, union_id=u2.id, child_id=new_child.id)


def test_ignores_soft_deleted_unions_and_relationships(db_session):
    workspace_id = uuid.uuid4()

    p1 = Person(workspace_id=workspace_id, first_name="A", last_name="Test")
    p2 = Person(workspace_id=workspace_id, first_name="B", last_name="Test")
    db_session.add_all([p1, p2])
    db_session.commit()

    # Union 1: p1 -> p2 (but soft deleted)
    u1 = FamilyUnion(workspace_id=workspace_id, partner1_id=p1.id, is_deleted=True)
    db_session.add(u1)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=u1.id, child_id=p2.id))
    db_session.commit()

    # p2 is not considered a descendant of p1 because union is deleted
    assert get_descendants_ids(db_session, workspace_id=workspace_id, root_person_id=p1.id) == set()

    # Now make union active, but child relationship soft deleted
    u2 = FamilyUnion(workspace_id=workspace_id, partner1_id=p1.id, is_deleted=False)
    db_session.add(u2)
    db_session.flush()
    db_session.add(
        ChildRelationship(
            workspace_id=workspace_id, union_id=u2.id, child_id=p2.id, is_deleted=True
        )
    )
    db_session.commit()

    assert get_descendants_ids(db_session, workspace_id=workspace_id, root_person_id=p1.id) == set()
