import uuid
from datetime import datetime

from sqlalchemy import String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.session import get_db
from app.services.audit_service import (
    get_entity_audit_logs,
    get_workspace_audit_logs,
    record_audit_event,
)


class SampleTimestampedModel(Base, TimestampMixin):
    __tablename__ = "sample_timestamped_models"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50), nullable=False)


def test_record_and_retrieve_audit_log(db_session):
    workspace_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    entity_id = uuid.uuid4()

    log = record_audit_event(
        db=db_session,
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_name="Aunt Sarah",
        actor_email="sarah@example.com",
        entity_type="Person",
        entity_id=entity_id,
        action="UPDATE",
        changes={"birth_place": {"old": "Boston", "new": "Chicago"}},
    )
    db_session.commit()

    assert log.id is not None
    logs = get_workspace_audit_logs(db_session, workspace_id)
    assert len(logs) == 1
    assert logs[0].actor_name == "Aunt Sarah"
    assert logs[0].actor_email == "sarah@example.com"
    assert logs[0].entity_type == "Person"
    assert logs[0].entity_id == entity_id
    assert logs[0].action == "UPDATE"
    assert logs[0].changes["birth_place"]["new"] == "Chicago"
    assert logs[0].created_at is not None


def test_get_entity_audit_logs(db_session):
    workspace_id = uuid.uuid4()
    entity1_id = uuid.uuid4()
    entity2_id = uuid.uuid4()

    record_audit_event(
        db=db_session,
        workspace_id=workspace_id,
        actor_id=None,
        actor_name="System",
        actor_email="system@lores.local",
        entity_type="Person",
        entity_id=entity1_id,
        action="CREATE",
        changes={"full_name": {"old": None, "new": "Grandpa Joe"}},
    )
    record_audit_event(
        db=db_session,
        workspace_id=workspace_id,
        actor_id=None,
        actor_name="System",
        actor_email="system@lores.local",
        entity_type="Person",
        entity_id=entity2_id,
        action="CREATE",
        changes={"full_name": {"old": None, "new": "Grandma Mary"}},
    )
    record_audit_event(
        db=db_session,
        workspace_id=workspace_id,
        actor_id=None,
        actor_name="System",
        actor_email="system@lores.local",
        entity_type="Person",
        entity_id=entity1_id,
        action="UPDATE",
        changes={"death_date": {"old": None, "new": "1998-05-12"}},
    )
    db_session.commit()

    entity1_logs = get_entity_audit_logs(db_session, workspace_id, entity1_id)
    assert len(entity1_logs) == 2
    assert entity1_logs[0].action == "UPDATE"
    assert entity1_logs[1].action == "CREATE"

    entity2_logs = get_entity_audit_logs(db_session, workspace_id, entity2_id)
    assert len(entity2_logs) == 1
    assert entity2_logs[0].action == "CREATE"


def test_workspace_audit_logs_limit(db_session):
    workspace_id = uuid.uuid4()
    for i in range(10):
        record_audit_event(
            db=db_session,
            workspace_id=workspace_id,
            actor_id=None,
            actor_name="User",
            actor_email="user@example.com",
            entity_type="Person",
            entity_id=uuid.uuid4(),
            action="CREATE",
            changes={"index": {"new": i}},
        )
    db_session.commit()

    logs = get_workspace_audit_logs(db_session, workspace_id, limit=5)
    assert len(logs) == 5


def test_timestamp_mixin(db_session):
    Base.metadata.create_all(bind=db_session.bind)
    model = SampleTimestampedModel(name="Test Item")
    db_session.add(model)
    db_session.commit()

    assert model.id is not None
    assert model.created_at is not None
    assert model.updated_at is not None
    assert isinstance(model.created_at, datetime)
    assert isinstance(model.updated_at, datetime)


def test_get_db_yields_session():
    gen = get_db()
    session = next(gen)
    assert session is not None
    try:
        pass
    finally:
        try:
            next(gen)
        except StopIteration:
            pass
