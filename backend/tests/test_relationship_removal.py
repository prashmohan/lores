import uuid

import pytest
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.models.workspace import Workspace
from app.services import person_service, tree_service


@pytest.fixture
def test_setup(db_session: Session):
    user = User(
        email="test_rel_remover@example.com",
        display_name="Tester",
    )
    db_session.add(user)
    db_session.flush()

    workspace = Workspace(
        name="Relationship Test WS",
        slug=f"rel-test-{uuid.uuid4().hex[:8]}",
        created_by_user_id=user.id,
    )
    db_session.add(workspace)
    db_session.flush()

    return user, workspace


def test_remove_partner_without_children(db_session: Session, test_setup):
    user, ws = test_setup

    p1 = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    p2 = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    db_session.add_all([p1, p2])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=p1.id, partner2_id=p2.id)
    db_session.add(union)
    db_session.commit()

    result = person_service.remove_relationship_atomic(
        db_session,
        workspace_id=ws.id,
        base_person_id=p1.id,
        target_person_id=p2.id,
        relationship_type="partner",
        actor=user,
    )
    db_session.commit()

    assert result["status"] == "success"
    db_session.refresh(union)
    assert union.is_deleted is True

    neigh = tree_service.get_focus_neighborhood(db_session, ws.id, p1.id, viewer_role="admin")
    assert len(neigh["partners"]) == 0


def test_remove_partner_with_children_preserves_child_links(db_session: Session, test_setup):
    user, ws = test_setup

    p1 = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    p2 = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    child = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    db_session.add_all([p1, p2, child])
    db_session.flush()

    joint_union = FamilyUnion(workspace_id=ws.id, partner1_id=p1.id, partner2_id=p2.id)
    db_session.add(joint_union)
    db_session.flush()

    db_session.add(
        ChildRelationship(workspace_id=ws.id, union_id=joint_union.id, child_id=child.id)
    )
    db_session.commit()

    result = person_service.remove_relationship_atomic(
        db_session,
        workspace_id=ws.id,
        base_person_id=p1.id,
        target_person_id=p2.id,
        relationship_type="partner",
        actor=user,
    )
    db_session.commit()

    assert result["status"] == "success"
    db_session.refresh(joint_union)
    assert joint_union.is_deleted is True

    neigh_p1 = tree_service.get_focus_neighborhood(db_session, ws.id, p1.id, viewer_role="admin")
    assert len(neigh_p1["partners"]) == 0
    assert any(c["id"] == str(child.id) for c in neigh_p1["children"])

    neigh_p2 = tree_service.get_focus_neighborhood(db_session, ws.id, p2.id, viewer_role="admin")
    assert len(neigh_p2["partners"]) == 0
    assert any(c["id"] == str(child.id) for c in neigh_p2["children"])

    neigh_child = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    assert len(neigh_child["parents"]) == 2


def test_remove_child_relationship(db_session: Session, test_setup):
    user, ws = test_setup

    father = Person(workspace_id=ws.id, first_name="George", last_name="Vance", gender="male")
    mother = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    child = Person(workspace_id=ws.id, first_name="Ronald", last_name="Vance", gender="male")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    result = person_service.remove_relationship_atomic(
        db_session,
        workspace_id=ws.id,
        base_person_id=father.id,
        target_person_id=child.id,
        relationship_type="child",
        actor=user,
    )
    db_session.commit()

    assert result["status"] == "success"

    neigh_father = tree_service.get_focus_neighborhood(
        db_session, ws.id, father.id, viewer_role="admin"
    )
    assert len(neigh_father["children"]) == 0

    neigh_mother = tree_service.get_focus_neighborhood(
        db_session, ws.id, mother.id, viewer_role="admin"
    )
    assert any(c["id"] == str(child.id) for c in neigh_mother["children"])

    neigh_child = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    assert len(neigh_child["parents"]) == 1
    assert neigh_child["parents"][0]["id"] == str(mother.id)


def test_remove_parent_relationship(db_session: Session, test_setup):
    user, ws = test_setup

    mother = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    child = Person(workspace_id=ws.id, first_name="Ronald", last_name="Vance", gender="male")
    db_session.add_all([mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=ws.id, partner1_id=mother.id, partner2_id=None)
    db_session.add(union)
    db_session.flush()

    db_session.add(ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id))
    db_session.commit()

    result = person_service.remove_relationship_atomic(
        db_session,
        workspace_id=ws.id,
        base_person_id=child.id,
        target_person_id=mother.id,
        relationship_type="parent",
        actor=user,
    )
    db_session.commit()

    assert result["status"] == "success"

    neigh_child = tree_service.get_focus_neighborhood(
        db_session, ws.id, child.id, viewer_role="admin"
    )
    assert len(neigh_child["parents"]) == 0


def test_remove_relationship_validation_errors(db_session: Session, test_setup):
    user, ws = test_setup

    p1 = Person(workspace_id=ws.id, first_name="Arthur", last_name="Miller", gender="male")
    p2 = Person(workspace_id=ws.id, first_name="Augusta", last_name="Barnett", gender="female")
    db_session.add_all([p1, p2])
    db_session.commit()

    with pytest.raises(ValueError, match="Unsupported relationship type"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=p1.id,
            target_person_id=p2.id,
            relationship_type="cousin",
            actor=user,
        )

    with pytest.raises(ValueError, match="Active partnership not found"):
        person_service.remove_relationship_atomic(
            db_session,
            workspace_id=ws.id,
            base_person_id=p1.id,
            target_person_id=p2.id,
            relationship_type="partner",
            actor=user,
        )
