import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.models.workspace import Workspace
from app.services import lore_service, person_service, tree_service


@pytest.fixture
def lifecycle_setup(db_session: Session):
    actor = User(
        email=f"actor_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Admin Actor",
    )
    db_session.add(actor)
    db_session.flush()

    workspace = Workspace(
        name="Lifecycle WS",
        slug=f"life-ws-{uuid.uuid4().hex[:8]}",
        created_by_user_id=actor.id,
    )
    db_session.add(workspace)
    db_session.flush()

    return actor, workspace


# ==============================================================================
# 1. Two Parents + Child: Deletion, Purge, and Restoration
# ==============================================================================


def test_soft_delete_one_parent_retains_connection_with_surviving_parent(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    # Soft delete Father
    lore_service.soft_delete_person(db_session, ws.id, father.id, actor)
    db_session.commit()

    # 1. Child focus neighborhood: Mother is still listed as parent; Father is omitted
    child_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    assert len(child_neigh["parents"]) == 1
    assert child_neigh["parents"][0]["id"] == str(mother.id)

    # 2. Mother focus neighborhood: Child is still listed as child; Father is omitted as partner
    mother_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, mother.id, viewer_role="admin"
    )
    assert len(mother_neigh["children"]) == 1
    assert mother_neigh["children"][0]["id"] == str(child.id)
    assert len(mother_neigh["partners"]) == 0

    # 3. Tree overview: Mother -> Child parent_child edge exists; Father edges omitted
    overview = tree_service.get_tree_overview(db_session, ws.id, viewer_role="admin")
    active_person_ids = {p["id"] for p in overview["people"]}
    assert str(father.id) not in active_person_ids
    assert str(mother.id) in active_person_ids
    assert str(child.id) in active_person_ids

    edges = overview["edges"]
    assert any(
        e["edge_type"] == "parent_child"
        and e["source_id"] == str(mother.id)
        and e["target_id"] == str(child.id)
        for e in edges
    )
    assert not any(
        e["source_id"] == str(father.id) or e["target_id"] == str(father.id) for e in edges
    )


def test_purge_trash_one_parent_permanently_retains_surviving_parent_connection(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    # Soft delete Father then purge trash
    lore_service.soft_delete_person(db_session, ws.id, father.id, actor)
    db_session.commit()

    purged_count = lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()
    assert purged_count >= 1

    # Father is completely gone from DB
    assert db_session.get(Person, father.id) is None

    # Child focus neighborhood: Mother MUST still be retained as parent!
    child_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    assert len(child_neigh["parents"]) == 1
    assert child_neigh["parents"][0]["id"] == str(mother.id)

    # Mother focus neighborhood: Child MUST still be retained as child!
    mother_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, mother.id, viewer_role="admin"
    )
    assert len(mother_neigh["children"]) == 1
    assert mother_neigh["children"][0]["id"] == str(child.id)

    # Tree overview: Mother -> Child edge remains active
    overview = tree_service.get_tree_overview(db_session, ws.id, viewer_role="admin")
    edges = overview["edges"]
    assert any(
        e["edge_type"] == "parent_child"
        and e["source_id"] == str(mother.id)
        and e["target_id"] == str(child.id)
        for e in edges
    )


def test_restore_deleted_parent_restores_both_parents_and_partnership(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    # Soft delete Father
    lore_service.soft_delete_person(db_session, ws.id, father.id, actor)
    db_session.commit()

    # Restore Father
    restored = lore_service.restore_from_trash(db_session, ws.id, "Person", father.id, actor)
    db_session.commit()
    assert restored.is_deleted is False

    # Child has both parents restored
    child_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    parent_ids = {p["id"] for p in child_neigh["parents"]}
    assert parent_ids == {str(father.id), str(mother.id)}

    # Mother has Father as partner and Child as child
    mother_neigh = tree_service.get_focus_neighborhood(
        db_session, ws.id, mother.id, viewer_role="admin"
    )
    assert any(p["id"] == str(father.id) for p in mother_neigh["partners"])
    assert any(c["id"] == str(child.id) for c in mother_neigh["children"])


def test_soft_delete_both_parents_sequentially_then_restore_one(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    # Soft-delete Father -> Mother still visible as parent
    lore_service.soft_delete_person(db_session, ws.id, father.id, actor)
    db_session.commit()
    assert len(tree_service.get_focus_neighborhood(db_session, ws.id, child.id)["parents"]) == 1

    # Soft-delete Mother -> Child now has 0 active parents
    lore_service.soft_delete_person(db_session, ws.id, mother.id, actor)
    db_session.commit()
    assert len(tree_service.get_focus_neighborhood(db_session, ws.id, child.id)["parents"]) == 0

    # Restore Mother -> Mother is back as parent
    lore_service.restore_from_trash(db_session, ws.id, "Person", mother.id, actor)
    db_session.commit()
    child_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh["parents"]) == 1
    assert child_neigh["parents"][0]["id"] == str(mother.id)

    # Restore Father -> Both parents back
    lore_service.restore_from_trash(db_session, ws.id, "Person", father.id, actor)
    db_session.commit()
    child_neigh_both = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh_both["parents"]) == 2


def test_purge_both_parents_cleans_up_union_and_child_links(db_session: Session, lifecycle_setup):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    # Soft-delete both and purge
    lore_service.soft_delete_person(db_session, ws.id, father.id, actor)
    lore_service.soft_delete_person(db_session, ws.id, mother.id, actor)
    db_session.commit()

    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    assert db_session.get(Person, father.id) is None
    assert db_session.get(Person, mother.id) is None
    assert db_session.get(Person, child.id) is not None

    child_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh["parents"]) == 0


# ==============================================================================
# 2. Single Parent Lifecycle
# ==============================================================================


def test_single_parent_soft_delete_restore_and_purge(db_session: Session, lifecycle_setup):
    actor, ws = lifecycle_setup

    mother = Person(workspace_id=ws.id, first_name="Clara", last_name="Oswald")
    child = Person(workspace_id=ws.id, first_name="Ronald", last_name="Oswald")
    db_session.add_all([mother, child])
    db_session.flush()

    single_union = FamilyUnion(workspace_id=ws.id, partner1_id=mother.id, partner2_id=None)
    db_session.add(single_union)
    db_session.flush()

    db_session.add(
        ChildRelationship(workspace_id=ws.id, union_id=single_union.id, child_id=child.id)
    )
    db_session.commit()

    # 1. Soft-delete single mother
    lore_service.soft_delete_person(db_session, ws.id, mother.id, actor)
    db_session.commit()

    child_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh["parents"]) == 0

    # 2. Restore single mother
    lore_service.restore_from_trash(db_session, ws.id, "Person", mother.id, actor)
    db_session.commit()

    child_neigh_restored = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh_restored["parents"]) == 1
    assert child_neigh_restored["parents"][0]["id"] == str(mother.id)

    # 3. Soft-delete again and purge
    lore_service.soft_delete_person(db_session, ws.id, mother.id, actor)
    db_session.commit()
    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    assert db_session.get(Person, mother.id) is None
    assert db_session.get(FamilyUnion, single_union.id) is None
    child_neigh_purged = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(child_neigh_purged["parents"]) == 0


# ==============================================================================
# 3. Child & Sibling Lifecycle
# ==============================================================================


def test_soft_delete_and_purge_child_preserves_parents_and_siblings(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    father = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller")
    mother = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett")
    child1 = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller")
    child2 = Person(workspace_id=ws.id, first_name="Robert", last_name="Miller")
    db_session.add_all([father, mother, child1, child2])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add_all(
        [
            ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child1.id),
            ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child2.id),
        ]
    )
    db_session.commit()

    # Soft delete Child 1
    lore_service.soft_delete_person(db_session, ws.id, child1.id, actor)
    db_session.commit()

    # Parents still have Child 2
    father_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, father.id)
    assert len(father_neigh["children"]) == 1
    assert father_neigh["children"][0]["id"] == str(child2.id)
    assert any(p["id"] == str(mother.id) for p in father_neigh["partners"])

    # Child 2 has both parents, but 0 active siblings
    child2_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, child2.id)
    assert len(child2_neigh["parents"]) == 2
    assert len(child2_neigh["siblings"]) == 0

    # Restore Child 1 -> Child 2 sees Child 1 as sibling
    lore_service.restore_from_trash(db_session, ws.id, "Person", child1.id, actor)
    db_session.commit()
    child2_neigh_restored = tree_service.get_focus_neighborhood(db_session, ws.id, child2.id)
    assert len(child2_neigh_restored["siblings"]) == 1
    assert child2_neigh_restored["siblings"][0]["id"] == str(child1.id)

    # Soft-delete and purge Child 1
    lore_service.soft_delete_person(db_session, ws.id, child1.id, actor)
    db_session.commit()
    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    # Child 2 still has both parents intact
    child2_neigh_final = tree_service.get_focus_neighborhood(db_session, ws.id, child2.id)
    assert len(child2_neigh_final["parents"]) == 2
    assert len(child2_neigh_final["siblings"]) == 0


# ==============================================================================
# 4. Partnership Without Children
# ==============================================================================


def test_partnership_without_children_lifecycle(db_session: Session, lifecycle_setup):
    actor, ws = lifecycle_setup

    p1 = Person(workspace_id=ws.id, first_name="George", last_name="Vance")
    p2 = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller")
    db_session.add_all([p1, p2])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=p1.id, partner2_id=p2.id)
    db_session.add(union)
    db_session.commit()

    # Soft delete p1
    lore_service.soft_delete_person(db_session, ws.id, p1.id, actor)
    db_session.commit()

    p2_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, p2.id)
    assert len(p2_neigh["partners"]) == 0

    # Restore p1
    lore_service.restore_from_trash(db_session, ws.id, "Person", p1.id, actor)
    db_session.commit()

    p2_neigh_restored = tree_service.get_focus_neighborhood(db_session, ws.id, p2.id)
    assert len(p2_neigh_restored["partners"]) == 1
    assert p2_neigh_restored["partners"][0]["id"] == str(p1.id)

    # Soft delete and purge p1
    lore_service.soft_delete_person(db_session, ws.id, p1.id, actor)
    db_session.commit()
    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    assert db_session.get(Person, p1.id) is None
    assert db_session.get(FamilyUnion, union.id) is None
    assert len(tree_service.get_focus_neighborhood(db_session, ws.id, p2.id)["partners"]) == 0


# ==============================================================================
# 5. Multi-Union / Blended Family Lifecycle
# ==============================================================================


def test_parent_with_multiple_unions_and_children_across_partners(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    central_parent = Person(workspace_id=ws.id, first_name="Alex", last_name="Taylor")
    partner1 = Person(workspace_id=ws.id, first_name="Morgan", last_name="Lee")
    partner2 = Person(workspace_id=ws.id, first_name="Jordan", last_name="Smith")
    child1 = Person(workspace_id=ws.id, first_name="Sam", last_name="Taylor")
    child2 = Person(workspace_id=ws.id, first_name="Riley", last_name="Taylor")

    db_session.add_all([central_parent, partner1, partner2, child1, child2])
    db_session.flush()

    union1 = FamilyUnion(workspace_id=ws.id, partner1_id=central_parent.id, partner2_id=partner1.id)
    union2 = FamilyUnion(workspace_id=ws.id, partner1_id=central_parent.id, partner2_id=partner2.id)
    db_session.add_all([union1, union2])
    db_session.flush()

    db_session.add_all(
        [
            ChildRelationship(workspace_id=ws.id, union_id=union1.id, child_id=child1.id),
            ChildRelationship(workspace_id=ws.id, union_id=union2.id, child_id=child2.id),
        ]
    )
    db_session.commit()

    # Soft-delete central parent
    lore_service.soft_delete_person(db_session, ws.id, central_parent.id, actor)
    db_session.commit()

    # Partner 1 retains Child 1
    p1_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, partner1.id)
    assert len(p1_neigh["children"]) == 1
    assert p1_neigh["children"][0]["id"] == str(child1.id)

    # Partner 2 retains Child 2
    p2_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, partner2.id)
    assert len(p2_neigh["children"]) == 1
    assert p2_neigh["children"][0]["id"] == str(child2.id)

    # Purge central parent
    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    # Both surviving partners still retain their respective children!
    p1_neigh_purged = tree_service.get_focus_neighborhood(db_session, ws.id, partner1.id)
    assert len(p1_neigh_purged["children"]) == 1
    assert p1_neigh_purged["children"][0]["id"] == str(child1.id)

    p2_neigh_purged = tree_service.get_focus_neighborhood(db_session, ws.id, partner2.id)
    assert len(p2_neigh_purged["children"]) == 1
    assert p2_neigh_purged["children"][0]["id"] == str(child2.id)


def test_middle_generation_person_deleted_preserves_grandparent_and_child(
    db_session: Session, lifecycle_setup
):
    actor, ws = lifecycle_setup

    grandparent = Person(workspace_id=ws.id, first_name="Grandpa", last_name="Miller")
    parent = Person(workspace_id=ws.id, first_name="Father", last_name="Miller")
    spouse = Person(workspace_id=ws.id, first_name="Mother", last_name="Miller")
    child = Person(workspace_id=ws.id, first_name="Child", last_name="Miller")
    db_session.add_all([grandparent, parent, spouse, child])
    db_session.flush()

    # Grandparent single union -> Parent
    g_union = FamilyUnion(workspace_id=ws.id, partner1_id=grandparent.id, partner2_id=None)
    db_session.add(g_union)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=g_union.id, child_id=parent.id))

    # Parent + Spouse -> Child
    p_union = FamilyUnion(workspace_id=ws.id, partner1_id=parent.id, partner2_id=spouse.id)
    db_session.add(p_union)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=p_union.id, child_id=child.id))
    db_session.commit()

    # Soft-delete middle parent
    lore_service.soft_delete_person(db_session, ws.id, parent.id, actor)
    db_session.commit()

    # Grandparent still exists, Child still has Mother
    c_neigh = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(c_neigh["parents"]) == 1
    assert c_neigh["parents"][0]["id"] == str(spouse.id)

    # Purge middle parent
    lore_service.purge_trash(db_session, ws.id, actor)
    db_session.commit()

    assert db_session.get(Person, grandparent.id) is not None
    assert db_session.get(Person, spouse.id) is not None
    assert db_session.get(Person, child.id) is not None

    c_neigh_after = tree_service.get_focus_neighborhood(db_session, ws.id, child.id)
    assert len(c_neigh_after["parents"]) == 1
    assert c_neigh_after["parents"][0]["id"] == str(spouse.id)


# ==============================================================================
# 6. Service Branch Coverage & Edge Case Tests
# ==============================================================================


def test_lore_service_edge_cases_and_branch_coverage(db_session: Session, lifecycle_setup):
    actor, ws = lifecycle_setup
    other_ws_id = uuid.uuid4()

    person = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller")
    db_session.add(person)
    db_session.flush()

    lore = lore_service.create_lore(
        db_session,
        ws.id,
        person.id,
        "Original Title",
        "Some content",
        actor,
    )
    db_session.commit()

    # 1. get_lore_by_id with mismatching workspace_id returns None
    assert lore_service.get_lore_by_id(db_session, other_ws_id, lore.id) is None

    # 2. get_lore_by_id for soft-deleted lore without include_deleted returns None
    lore_service.soft_delete_lore(db_session, ws.id, lore.id, actor)
    db_session.commit()
    assert lore_service.get_lore_by_id(db_session, ws.id, lore.id, include_deleted=False) is None
    assert lore_service.get_lore_by_id(db_session, ws.id, lore.id, include_deleted=True) is not None

    # 3. update_lore with deleted or mismatching lore raises ValueError
    with pytest.raises(ValueError, match="Lore note not found in workspace"):
        lore_service.update_lore(db_session, ws.id, lore.id, {"title": "New"}, actor)

    # 4. get_trash_items filters out lore notes deleted past max_age_days cutoff
    old_lore = lore_service.create_lore(
        db_session,
        ws.id,
        person.id,
        "Ancient Note",
        "Ancient content",
        actor,
    )
    db_session.commit()
    lore_service.soft_delete_lore(db_session, ws.id, old_lore.id, actor)
    db_session.commit()

    old_lore.deleted_at = datetime.now(UTC) - timedelta(days=45)
    db_session.commit()

    trash_30 = lore_service.get_trash_items(db_session, ws.id, max_age_days=30)
    trash_lore_ids = [item["id"] for item in trash_30 if item["entity_type"] == "LoreNote"]
    assert str(old_lore.id) not in trash_lore_ids


def test_person_service_edge_cases_and_branch_coverage(db_session: Session, lifecycle_setup):
    actor, ws = lifecycle_setup

    p1 = Person(workspace_id=ws.id, first_name="John", last_name="Doe")
    p2 = Person(workspace_id=ws.id, first_name="Jane", last_name="Doe")
    p3 = Person(workspace_id=ws.id, first_name="Jack", last_name="Doe")
    db_session.add_all([p1, p2, p3])
    db_session.flush()

    # 1. add_relative with non-existent existing_person_id
    with pytest.raises(ValueError, match="Existing person not found in workspace"):
        person_service.add_relative_atomic(
            db_session,
            workspace_id=ws.id,
            relative_type="parent",
            base_person_id=p1.id,
            existing_person_id=uuid.uuid4(),
            actor=actor,
        )

    # 2. add_relative linking person to themselves
    with pytest.raises(ValueError, match="Cannot link a person to themselves"):
        person_service.add_relative_atomic(
            db_session,
            workspace_id=ws.id,
            relative_type="parent",
            base_person_id=p1.id,
            existing_person_id=p1.id,
            actor=actor,
        )

    # 3. add_relative without person_data or existing_person_id
    with pytest.raises(
        ValueError, match="Either person_data or existing_person_id must be provided"
    ):
        person_service.add_relative_atomic(
            db_session,
            workspace_id=ws.id,
            relative_type="parent",
            base_person_id=p1.id,
            person_data=None,
            existing_person_id=None,
            actor=actor,
        )

    # 4. add_relative parent with other_parent_id not found
    with pytest.raises(ValueError, match="Other parent not found in workspace"):
        person_service.add_relative_atomic(
            db_session,
            workspace_id=ws.id,
            relative_type="parent",
            base_person_id=p1.id,
            existing_person_id=p2.id,
            other_parent_id=uuid.uuid4(),
            actor=actor,
        )

    # 5. add_relative parent with valid other_parent_id creates joint union and child relationship
    parent_res = person_service.add_relative_atomic(
        db_session,
        workspace_id=ws.id,
        relative_type="parent",
        base_person_id=p1.id,
        existing_person_id=p2.id,
        other_parent_id=p3.id,
        actor=actor,
    )
    db_session.commit()
    assert parent_res.id == p2.id

    # 6. add_relative child with other_parent_id not found
    with pytest.raises(ValueError, match="Other parent not found in workspace"):
        person_service.add_relative_atomic(
            db_session,
            workspace_id=ws.id,
            relative_type="child",
            base_person_id=p1.id,
            person_data={"first_name": "Baby", "last_name": "Doe"},
            other_parent_id=uuid.uuid4(),
            actor=actor,
        )

    # 7. add_relative parent when union has partner1_id=None
    orphan_child = Person(workspace_id=ws.id, first_name="Oliver", last_name="Twist")
    db_session.add(orphan_child)
    db_session.flush()

    empty_union = FamilyUnion(workspace_id=ws.id, partner1_id=None, partner2_id=None)
    db_session.add(empty_union)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=ws.id, union_id=empty_union.id, child_id=orphan_child.id)
    )
    db_session.commit()

    new_parent = person_service.add_relative_atomic(
        db_session,
        workspace_id=ws.id,
        relative_type="parent",
        base_person_id=orphan_child.id,
        person_data={"first_name": "Adoptive", "last_name": "Parent"},
        actor=actor,
    )
    db_session.commit()
    db_session.refresh(empty_union)
    assert empty_union.partner1_id == new_parent.id

    # 8. add_relative parent when existing parent union was soft-deleted creates new union
    empty_union.is_deleted = True
    db_session.commit()

    another_parent = person_service.add_relative_atomic(
        db_session,
        workspace_id=ws.id,
        relative_type="parent",
        base_person_id=orphan_child.id,
        person_data={"first_name": "Second", "last_name": "Parent"},
        actor=actor,
    )
    db_session.commit()
    assert another_parent.id is not None

    # 9. Concurrency checks: invalid date format string and naive datetime comparisons
    person_service.update_person_optimistic(
        db_session,
        workspace_id=ws.id,
        person_id=p1.id,
        updates={"biography": "New bio"},
        expected_updated_at="invalid-date-format",
        actor=actor,
    )
    db_session.commit()

    naive_dt = datetime.now(UTC).replace(tzinfo=None)
    person_service.update_person_optimistic(
        db_session,
        workspace_id=ws.id,
        person_id=p1.id,
        updates={"biography": "Another bio"},
        expected_updated_at=naive_dt,
        actor=actor,
    )
    db_session.commit()

    # 10. remove_relationship_atomic with invalid persons or invalid parent-child
    with pytest.raises(ValueError, match="Base person not found in workspace"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=uuid.uuid4(),
            target_person_id=p1.id,
            relationship_type="partner",
            actor=actor,
        )

    with pytest.raises(ValueError, match="Target person not found in workspace"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=p1.id,
            target_person_id=uuid.uuid4(),
            relationship_type="partner",
            actor=actor,
        )

    with pytest.raises(ValueError, match="No active parent unions found for the specified parent"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=orphan_child.id,
            target_person_id=p1.id,
            relationship_type="parent",
            actor=actor,
        )

    # 11. remove_relationship_atomic when parent has a union with child_person not linked
    fake_parent = Person(workspace_id=ws.id, first_name="Fake", last_name="Parent")
    db_session.add(fake_parent)
    db_session.flush()
    fake_union = FamilyUnion(workspace_id=ws.id, partner1_id=fake_parent.id, partner2_id=None)
    db_session.add(fake_union)
    db_session.commit()

    with pytest.raises(ValueError, match="Parent-child relationship not found"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=orphan_child.id,
            target_person_id=fake_parent.id,
            relationship_type="parent",
            actor=actor,
        )

    # 12. Concurrency conflict with naive datetime and non-overlapping fields (fallback to first field)
    p_confl = Person(
        workspace_id=ws.id,
        first_name="Confl",
        last_name="Person",
        birth_date="1950-01-01",
    )
    db_session.add(p_confl)
    db_session.commit()

    # Case A: p_dt is aware, e_dt is naive
    p_confl.updated_at = datetime.now(UTC)
    past_naive = (datetime.now(UTC) - timedelta(hours=2)).replace(tzinfo=None)
    with pytest.raises(person_service.ConcurrencyConflictError) as exc:
        person_service.update_person_optimistic(
            db_session,
            workspace_id=ws.id,
            person_id=p_confl.id,
            updates={"biography": "Different field entirely"},
            expected_updated_at=past_naive,
            actor=actor,
        )
    assert exc.value.details["field"] == "biography"

    # Case B: p_dt is naive, e_dt is aware
    p_confl.updated_at = (datetime.now(UTC) - timedelta(minutes=5)).replace(tzinfo=None)
    past_aware = datetime.now(UTC) - timedelta(hours=2)
    with pytest.raises(person_service.ConcurrencyConflictError):
        person_service.update_person_optimistic(
            db_session,
            workspace_id=ws.id,
            person_id=p_confl.id,
            updates={"biography": "Another update"},
            expected_updated_at=past_aware,
            actor=actor,
        )


def test_tree_service_overview_child_without_active_union(db_session: Session, lifecycle_setup):
    _actor, ws = lifecycle_setup

    c = Person(workspace_id=ws.id, first_name="Independent", last_name="Child")
    deleted_child = Person(
        workspace_id=ws.id, first_name="Deleted", last_name="Child", is_deleted=True
    )
    db_session.add_all([c, deleted_child])
    db_session.flush()

    # Create ChildRelationship pointing to a non-existent/deleted union
    missing_union_id = uuid.uuid4()
    db_session.add(
        ChildRelationship(
            workspace_id=ws.id,
            union_id=missing_union_id,
            child_id=c.id,
        )
    )
    # Create ChildRelationship for a deleted child
    u = FamilyUnion(workspace_id=ws.id, partner1_id=c.id, partner2_id=None)
    db_session.add(u)
    db_session.flush()
    db_session.add(
        ChildRelationship(
            workspace_id=ws.id,
            union_id=u.id,
            child_id=deleted_child.id,
        )
    )
    db_session.commit()

    overview = tree_service.get_tree_overview(db_session, ws.id, viewer_role="admin")
    assert any(p["id"] == str(c.id) for p in overview["people"])
