import uuid

import pytest

from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.schemas.tree import FocusNeighborhoodResponse, PersonSummary, TreeOverviewResponse
from app.services.tree_service import get_focus_neighborhood, get_tree_overview, serialize_person


def test_focus_neighborhood_resolves_all_relatives_and_masks_living(db_session):
    workspace_id = uuid.uuid4()

    # Parents (Deceased)
    father = Person(
        workspace_id=workspace_id,
        first_name="Arthur",
        last_name="Miller",
        gender="male",
        is_living=False,
        birth_date="1900-01-01",
        birth_place="Boston, MA",
        death_date="1980-04-10",
        death_place="New York, NY",
    )
    mother = Person(
        workspace_id=workspace_id,
        first_name="Clara",
        last_name="Higgins",
        gender="female",
        is_living=False,
        birth_date="1905-02-02",
        birth_place="Chicago, IL",
        death_date="1985-06-15",
        death_place="New York, NY",
    )
    # Focus Person (Living)
    focus = Person(
        workspace_id=workspace_id,
        first_name="Margaret",
        last_name="Miller",
        gender="female",
        is_living=True,
        birth_date="1942-05-15",
        birth_place="New York, NY",
    )
    # Sibling (Living)
    sibling = Person(
        workspace_id=workspace_id,
        first_name="Robert",
        last_name="Miller",
        gender="male",
        is_living=True,
        birth_date="1945-08-20",
        birth_place="New York, NY",
    )
    # Partner (Living)
    partner = Person(
        workspace_id=workspace_id,
        first_name="George",
        last_name="Vance",
        gender="male",
        is_living=True,
        birth_date="1940-03-10",
        birth_place="Philadelphia, PA",
    )
    # Child (Living)
    child = Person(
        workspace_id=workspace_id,
        first_name="Ronald",
        last_name="Vance",
        gender="male",
        is_living=True,
        birth_date="1970-11-25",
        birth_place="Los Angeles, CA",
    )

    db_session.add_all([father, mother, focus, sibling, partner, child])
    db_session.commit()

    # Parent Union -> Focus & Sibling
    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(p_union)
    db_session.flush()
    db_session.add_all(
        [
            ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=focus.id),
            ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=sibling.id),
        ]
    )

    # Focus Union -> Child
    f_union = FamilyUnion(workspace_id=workspace_id, partner1_id=focus.id, partner2_id=partner.id)
    db_session.add(f_union)
    db_session.flush()
    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=f_union.id, child_id=child.id)
    )
    db_session.commit()

    # 1. As Collaborator -> full details visible
    hood_collab = get_focus_neighborhood(
        db_session, workspace_id, focus.id, viewer_role="collaborator"
    )
    assert hood_collab["focus_person"]["id"] == str(focus.id)
    assert len(hood_collab["parents"]) == 2
    assert len(hood_collab["siblings"]) == 1
    assert len(hood_collab["partners"]) == 1
    assert len(hood_collab["children"]) == 1
    assert hood_collab["focus_person"]["birth_date"] == "1942-05-15"
    assert hood_collab["focus_person"]["birth_place"] == "New York, NY"

    # Schema validation
    validated_collab = FocusNeighborhoodResponse.model_validate(hood_collab)
    assert validated_collab.focus_person.id == str(focus.id)
    assert len(validated_collab.parents) == 2

    # 2. As Viewer -> living person dates redacted
    hood_viewer = get_focus_neighborhood(db_session, workspace_id, focus.id, viewer_role="viewer")
    assert hood_viewer["focus_person"]["birth_date"] is None  # Masked because is_living=True
    assert hood_viewer["focus_person"]["birth_place"] is None  # Masked because is_living=True
    assert hood_viewer["siblings"][0]["birth_date"] is None  # Masked because is_living=True
    assert hood_viewer["partners"][0]["birth_date"] is None  # Masked because is_living=True
    assert hood_viewer["children"][0]["birth_date"] is None  # Masked because is_living=True

    # Deceased parents remain visible
    parent_birth_dates = {p["birth_date"] for p in hood_viewer["parents"]}
    assert parent_birth_dates == {"1900-01-01", "1905-02-02"}

    validated_viewer = FocusNeighborhoodResponse.model_validate(hood_viewer)
    assert validated_viewer.focus_person.birth_date is None


def test_focus_neighborhood_raises_for_invalid_or_deleted_person(db_session):
    workspace_id = uuid.uuid4()
    other_workspace_id = uuid.uuid4()

    person = Person(workspace_id=other_workspace_id, first_name="Other", last_name="WS")
    deleted_person = Person(
        workspace_id=workspace_id, first_name="Deleted", last_name="Person", is_deleted=True
    )
    db_session.add_all([person, deleted_person])
    db_session.commit()

    # Non-existent person
    with pytest.raises(ValueError, match="Person not found in workspace"):
        get_focus_neighborhood(db_session, workspace_id, uuid.uuid4())

    # Person in different workspace
    with pytest.raises(ValueError, match="Person not found in workspace"):
        get_focus_neighborhood(db_session, workspace_id, person.id)

    # Soft-deleted person
    with pytest.raises(ValueError, match="Person not found in workspace"):
        get_focus_neighborhood(db_session, workspace_id, deleted_person.id)


def test_focus_neighborhood_ignores_soft_deleted_relatives_and_unions(db_session):
    workspace_id = uuid.uuid4()

    father = Person(workspace_id=workspace_id, first_name="Father", last_name="Active")
    deleted_mother = Person(
        workspace_id=workspace_id, first_name="Mother", last_name="Deleted", is_deleted=True
    )
    focus = Person(workspace_id=workspace_id, first_name="Focus", last_name="Person")
    deleted_sibling = Person(
        workspace_id=workspace_id, first_name="Sibling", last_name="Deleted", is_deleted=True
    )
    active_sibling = Person(workspace_id=workspace_id, first_name="Sibling", last_name="Active")

    partner = Person(workspace_id=workspace_id, first_name="Partner", last_name="Active")
    deleted_partner = Person(
        workspace_id=workspace_id, first_name="Partner", last_name="Deleted", is_deleted=True
    )
    child = Person(workspace_id=workspace_id, first_name="Child", last_name="Active")

    db_session.add_all(
        [
            father,
            deleted_mother,
            focus,
            deleted_sibling,
            active_sibling,
            partner,
            deleted_partner,
            child,
        ]
    )
    db_session.commit()

    # Active parent union with 1 active parent and 1 deleted parent
    p_union = FamilyUnion(
        workspace_id=workspace_id, partner1_id=father.id, partner2_id=deleted_mother.id
    )
    # Deleted parent union
    deleted_p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id, is_deleted=True)
    db_session.add_all([p_union, deleted_p_union])
    db_session.flush()

    # Add focus and siblings
    db_session.add_all(
        [
            ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=focus.id),
            ChildRelationship(
                workspace_id=workspace_id, union_id=p_union.id, child_id=deleted_sibling.id
            ),
            ChildRelationship(
                workspace_id=workspace_id, union_id=p_union.id, child_id=active_sibling.id
            ),
            # Child relationship in deleted parent union
            ChildRelationship(
                workspace_id=workspace_id, union_id=deleted_p_union.id, child_id=focus.id
            ),
        ]
    )

    # Active partner union
    f_union = FamilyUnion(workspace_id=workspace_id, partner1_id=focus.id, partner2_id=partner.id)
    # Deleted partner union
    deleted_f_union = FamilyUnion(
        workspace_id=workspace_id,
        partner1_id=focus.id,
        partner2_id=deleted_partner.id,
        is_deleted=True,
    )
    db_session.add_all([f_union, deleted_f_union])
    db_session.flush()

    # Active child in f_union, and deleted child relationship in f_union
    deleted_child_rel_person = Person(
        workspace_id=workspace_id, first_name="Child", last_name="RelDeleted"
    )
    db_session.add(deleted_child_rel_person)
    db_session.flush()

    db_session.add_all(
        [
            ChildRelationship(workspace_id=workspace_id, union_id=f_union.id, child_id=child.id),
            ChildRelationship(
                workspace_id=workspace_id,
                union_id=f_union.id,
                child_id=deleted_child_rel_person.id,
                is_deleted=True,
            ),
        ]
    )
    db_session.commit()

    hood = get_focus_neighborhood(db_session, workspace_id, focus.id, viewer_role="collaborator")
    assert len(hood["parents"]) == 1
    assert hood["parents"][0]["id"] == str(father.id)
    assert len(hood["siblings"]) == 1
    assert hood["siblings"][0]["id"] == str(active_sibling.id)
    assert len(hood["partners"]) == 1
    assert hood["partners"][0]["id"] == str(partner.id)
    assert len(hood["children"]) == 1
    assert hood["children"][0]["id"] == str(child.id)


def test_serialize_person_custom_fields():
    p = Person(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        first_name="Jane",
        last_name="Doe",
        maiden_name="Smith",
        gender="female",
        is_living=True,
        birth_date="1980-01-01",
        birth_place="Seattle, WA",
        death_date=None,
        death_place=None,
        avatar_url="https://example.com/avatar.jpg",
    )

    data_collab = serialize_person(p, viewer_role="admin", relationship_label="Self")
    assert data_collab["relationship_label"] == "Self"
    assert data_collab["birth_date"] == "1980-01-01"
    assert data_collab["birth_place"] == "Seattle, WA"
    assert data_collab["avatar_url"] == "https://example.com/avatar.jpg"
    assert data_collab["maiden_name"] == "Smith"

    data_viewer = serialize_person(p, viewer_role="viewer")
    assert data_viewer["relationship_label"] is None
    assert data_viewer["birth_date"] is None
    assert data_viewer["birth_place"] is None
    assert data_viewer["avatar_url"] == "https://example.com/avatar.jpg"
    assert data_viewer["maiden_name"] == "Smith"

    summary = PersonSummary.model_validate(data_viewer)
    assert summary.first_name == "Jane"
    assert summary.birth_date is None


def test_get_tree_overview_with_distinct_partner_and_parent_child_edges(db_session):
    workspace_id = uuid.uuid4()

    # 3 generations:
    # Gen 1: Grandfather & Grandmother (partners)
    gf = Person(workspace_id=workspace_id, first_name="Grandpa", last_name="Miller")
    gm = Person(workspace_id=workspace_id, first_name="Grandma", last_name="Miller")
    db_session.add_all([gf, gm])
    db_session.flush()

    g_union = FamilyUnion(workspace_id=workspace_id, partner1_id=gf.id, partner2_id=gm.id)
    db_session.add(g_union)
    db_session.flush()

    # Gen 2: Father (child of g_union) & Mother (partner)
    father = Person(workspace_id=workspace_id, first_name="Father", last_name="Miller")
    mother = Person(workspace_id=workspace_id, first_name="Mother", last_name="Miller")
    db_session.add_all([father, mother])
    db_session.flush()

    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=g_union.id, child_id=father.id)
    )

    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(p_union)
    db_session.flush()

    # Gen 3: Child (child of p_union)
    child = Person(workspace_id=workspace_id, first_name="Child", last_name="Miller")
    db_session.add(child)
    db_session.flush()

    db_session.add(
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=child.id)
    )
    db_session.commit()

    overview = get_tree_overview(db_session, workspace_id, viewer_role="collaborator")
    validated = TreeOverviewResponse.model_validate(overview)

    assert len(validated.people) == 5
    # Edges:
    # 1. Partner edge between gf and gm
    # 2. Partner edge between father and mother
    # 3. Parent-child edge gf -> father
    # 4. Parent-child edge gm -> father
    # 5. Parent-child edge father -> child
    # 6. Parent-child edge mother -> child
    # ZERO edges between gf and child (great-grandfather to grandchild)
    partner_edges = [e for e in validated.edges if e.edge_type == "partner"]
    pc_edges = [e for e in validated.edges if e.edge_type == "parent_child"]

    assert len(partner_edges) == 2
    assert len(pc_edges) == 4

    # Verify no edge connects gf directly to child
    for e in validated.edges:
        assert not (e.source_id == str(gf.id) and e.target_id == str(child.id))
        assert not (e.source_id == str(child.id) and e.target_id == str(gf.id))
