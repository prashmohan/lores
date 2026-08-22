import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.services.audit_service import get_workspace_audit_logs
from app.services.lore_service import (
    create_lore,
    get_lore_by_id,
    get_lore_for_person,
    get_trash_items,
    purge_trash,
    restore_from_trash,
    soft_delete_lore,
    soft_delete_person,
    update_lore,
)


def _setup_workspace_and_actor(db_session):
    actor = User(email=f"storyteller_{uuid.uuid4().hex[:6]}@example.com", display_name="Grandma")
    db_session.add(actor)
    db_session.commit()
    workspace_id = uuid.uuid4()
    return workspace_id, actor


def test_lore_creation_and_soft_delete_restore(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    person = Person(workspace_id=workspace_id, first_name="George", last_name="Vance")
    db_session.add(person)
    db_session.commit()

    # Add Lore
    lore = create_lore(
        db_session,
        workspace_id,
        person.id,
        "The Fishing Trip",
        "Grandpa caught a 10lb bass in 1954.",
        actor,
    )
    db_session.commit()
    assert lore.id is not None

    # Soft delete person
    soft_delete_person(db_session, workspace_id, person.id, actor)
    db_session.commit()

    trash = get_trash_items(db_session, workspace_id)
    assert len(trash) == 1
    assert trash[0]["id"] == str(person.id)

    # Restore from trash
    restored = restore_from_trash(db_session, workspace_id, "Person", person.id, actor)
    db_session.commit()
    assert restored.is_deleted is False


def test_lore_crud_and_tags_and_event_year(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    person = Person(workspace_id=workspace_id, first_name="Clara", last_name="Oswald")
    db_session.add(person)
    db_session.commit()

    # Create lore with tags and event_year
    lore = create_lore(
        db_session,
        workspace_id=workspace_id,
        person_id=person.id,
        title="The Souffle Girl",
        content="Clara baked wonderful souffles in London.",
        actor=actor,
        event_year=2012,
        tags=["baking", "london", "memories"],
    )
    db_session.commit()

    assert lore.event_year == 2012
    assert lore.tags == ["baking", "london", "memories"]
    assert lore.author_id == actor.id

    # Retrieve lore by ID and for person
    fetched = get_lore_by_id(db_session, workspace_id, lore.id)
    assert fetched is not None
    assert fetched.title == "The Souffle Girl"

    notes = get_lore_for_person(db_session, workspace_id, person.id)
    assert len(notes) == 1
    assert notes[0].id == lore.id

    # Update lore
    updated = update_lore(
        db_session,
        workspace_id=workspace_id,
        lore_id=lore.id,
        updates={
            "title": "The Dalek Asylum Souffle",
            "event_year": 2013,
            "tags": ["asylum", "souffle"],
        },
        actor=actor,
    )
    db_session.commit()
    assert updated.title == "The Dalek Asylum Souffle"
    assert updated.event_year == 2013
    assert updated.tags == ["asylum", "souffle"]

    # Soft delete lore
    deleted_lore = soft_delete_lore(db_session, workspace_id, lore.id, actor)
    db_session.commit()
    assert deleted_lore.is_deleted is True
    assert deleted_lore.deleted_at is not None

    # Should not appear in active person lore notes
    active_notes = get_lore_for_person(db_session, workspace_id, person.id)
    assert len(active_notes) == 0

    # Should appear with include_deleted=True
    all_notes = get_lore_for_person(db_session, workspace_id, person.id, include_deleted=True)
    assert len(all_notes) == 1

    # Should appear in trash
    trash = get_trash_items(db_session, workspace_id)
    assert len(trash) == 1
    assert trash[0]["entity_type"] == "LoreNote"
    assert trash[0]["id"] == str(lore.id)
    assert trash[0]["name"] == "The Dalek Asylum Souffle"

    # Restore lore from trash
    restored_lore = restore_from_trash(db_session, workspace_id, "LoreNote", lore.id, actor)
    db_session.commit()
    assert restored_lore.is_deleted is False
    assert restored_lore.deleted_at is None

    active_notes_after = get_lore_for_person(db_session, workspace_id, person.id)
    assert len(active_notes_after) == 1


def test_person_cascade_soft_delete_and_restore(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    father = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Weasley")
    mother = Person(workspace_id=workspace_id, first_name="Molly", last_name="Weasley")
    child = Person(workspace_id=workspace_id, first_name="Ron", last_name="Weasley")
    db_session.add_all([father, mother, child])
    db_session.flush()

    union = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(union)
    db_session.flush()

    rel = ChildRelationship(workspace_id=workspace_id, union_id=union.id, child_id=child.id)
    db_session.add(rel)
    db_session.commit()

    # Soft delete child
    soft_delete_person(db_session, workspace_id, child.id, actor)
    db_session.commit()

    db_session.refresh(rel)
    assert rel.is_deleted is True

    # Restore child
    restore_from_trash(db_session, workspace_id, "Person", child.id, actor)
    db_session.commit()

    db_session.refresh(child)
    db_session.refresh(rel)
    assert child.is_deleted is False
    assert rel.is_deleted is False

    # Soft delete father (union should cascade)
    soft_delete_person(db_session, workspace_id, father.id, actor)
    db_session.commit()

    db_session.refresh(union)
    db_session.refresh(rel)
    assert union.is_deleted is True
    assert rel.is_deleted is True

    # Restore father (union and child relationship reactivated)
    restore_from_trash(db_session, workspace_id, "Person", father.id, actor)
    db_session.commit()

    db_session.refresh(father)
    db_session.refresh(union)
    db_session.refresh(rel)
    assert father.is_deleted is False
    assert union.is_deleted is False
    assert rel.is_deleted is False


def test_trash_days_filter_and_purging(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    p1 = Person(workspace_id=workspace_id, first_name="Old", last_name="Item")
    p2 = Person(workspace_id=workspace_id, first_name="Recent", last_name="Item")
    db_session.add_all([p1, p2])
    db_session.flush()

    soft_delete_person(db_session, workspace_id, p1.id, actor)
    soft_delete_person(db_session, workspace_id, p2.id, actor)
    db_session.commit()

    # Artificially age p1 deletion to 45 days ago
    p1.deleted_at = datetime.now(UTC) - timedelta(days=45)
    db_session.commit()

    # 30-day window check
    trash_30 = get_trash_items(db_session, workspace_id, max_age_days=30)
    assert len(trash_30) == 1
    assert trash_30[0]["id"] == str(p2.id)

    # All trash check (e.g. 60 days)
    trash_all = get_trash_items(db_session, workspace_id, max_age_days=60)
    assert len(trash_all) == 2

    # Purge trash permanently
    purged_count = purge_trash(db_session, workspace_id, actor)
    db_session.commit()
    assert purged_count >= 2

    remaining_trash = get_trash_items(db_session, workspace_id, max_age_days=100)
    assert len(remaining_trash) == 0

    assert db_session.get(Person, p1.id) is None
    assert db_session.get(Person, p2.id) is None


def test_lore_and_trash_validation_errors(db_session):
    workspace1_id, actor = _setup_workspace_and_actor(db_session)
    workspace2_id, _ = _setup_workspace_and_actor(db_session)

    p1 = Person(workspace_id=workspace1_id, first_name="Harry", last_name="Potter")
    db_session.add(p1)
    db_session.commit()

    # Invalid person id for lore creation
    with pytest.raises(ValueError, match="Person not found in workspace"):
        create_lore(db_session, workspace1_id, uuid.uuid4(), "Title", "Content", actor)

    # Cross-workspace person for lore creation
    with pytest.raises(ValueError, match="Person not found in workspace"):
        create_lore(db_session, workspace2_id, p1.id, "Title", "Content", actor)

    # Valid lore
    lore = create_lore(
        db_session, workspace1_id, p1.id, "The Boy Who Lived", "Under the stairs.", actor
    )
    db_session.commit()

    # Soft delete in wrong workspace
    with pytest.raises(ValueError, match="Lore note not found in workspace"):
        soft_delete_lore(db_session, workspace2_id, lore.id, actor)

    # Soft delete non-existent person
    with pytest.raises(ValueError, match="Person not found in workspace"):
        soft_delete_person(db_session, workspace1_id, uuid.uuid4(), actor)

    # Restore item not in trash
    with pytest.raises(ValueError, match="Item not found in trash"):
        restore_from_trash(db_session, workspace1_id, "Person", p1.id, actor)

    with pytest.raises(ValueError, match="Item not found in trash"):
        restore_from_trash(db_session, workspace1_id, "LoreNote", lore.id, actor)

    # Restore unknown entity type
    with pytest.raises(ValueError, match="Unknown entity type"):
        restore_from_trash(db_session, workspace1_id, "AlienEntity", uuid.uuid4(), actor)


def test_audit_logs_recorded(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    p = Person(workspace_id=workspace_id, first_name="Neville", last_name="Longbottom")
    db_session.add(p)
    db_session.commit()

    lore = create_lore(
        db_session, workspace_id, p.id, "Herbology Tale", "Found a Mimbulus mimbletonia.", actor
    )
    db_session.commit()

    update_lore(db_session, workspace_id, lore.id, {"title": "Rare Herbology Tale"}, actor)
    db_session.commit()

    soft_delete_lore(db_session, workspace_id, lore.id, actor)
    db_session.commit()

    restore_from_trash(db_session, workspace_id, "LoreNote", lore.id, actor)
    db_session.commit()

    soft_delete_person(db_session, workspace_id, p.id, actor)
    db_session.commit()

    restore_from_trash(db_session, workspace_id, "Person", p.id, actor)
    db_session.commit()

    purge_trash(db_session, workspace_id, actor)
    db_session.commit()

    logs = get_workspace_audit_logs(db_session, workspace_id, limit=50)
    actions = [log.action for log in logs]
    assert "CREATE" in actions
    assert "UPDATE" in actions
    assert "SOFT_DELETE" in actions
    assert "RESTORE" in actions
    assert "PURGE" in actions


def test_purge_trash_cascades_active_lore_notes_for_soft_deleted_person(db_session):
    workspace_id, actor = _setup_workspace_and_actor(db_session)

    person = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Dent")
    db_session.add(person)
    db_session.commit()

    # Create an active lore note for Arthur (not soft-deleted)
    lore = create_lore(
        db_session,
        workspace_id=workspace_id,
        person_id=person.id,
        title="Towel Story",
        content="Always know where your towel is.",
        actor=actor,
    )
    db_session.commit()

    # Soft delete Arthur only (lore note remains is_deleted=False)
    soft_delete_person(db_session, workspace_id, person.id, actor)
    db_session.commit()

    assert lore.is_deleted is False

    # Purge trash - should purge Arthur and cascade delete Arthur's lore notes
    purged_count = purge_trash(db_session, workspace_id, actor)
    db_session.commit()

    assert purged_count >= 1
    assert db_session.get(Person, person.id) is None
    assert db_session.get(LoreNote, lore.id) is None
