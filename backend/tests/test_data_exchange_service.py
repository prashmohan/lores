import uuid

import pytest
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.data_exchange import ImportSummaryRead
from app.services.data_exchange_service import (
    export_json_backup,
    extract_year,
    import_gedcom_to_workspace,
    import_json_to_workspace,
    normalize_name,
)


@pytest.fixture(name="test_user")
def fixture_test_user(db_session: Session) -> User:
    user = User(
        email=f"user-{uuid.uuid4()}@example.com",
        display_name="Data Curator",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture(name="test_workspace")
def fixture_test_workspace(db_session: Session, test_user: User) -> Workspace:
    ws = Workspace(
        name="Exchange Test Family",
        slug=f"exchange-test-{uuid.uuid4().hex[:8]}",
        created_by_user_id=test_user.id,
    )
    db_session.add(ws)
    db_session.commit()
    return ws


def test_normalize_name_and_extract_year():
    assert normalize_name("  Robert-Smith, Jr.  ") == "robertsmith jr"
    assert normalize_name("Mary   O'Connor") == "mary oconnor"
    assert normalize_name(None) == ""
    assert normalize_name("") == ""

    assert extract_year("12 MAY 1945") == 1945
    assert extract_year("ABT 1940") == 1940
    assert extract_year("1940") == 1940
    assert extract_year("1945-05-15") == 1945
    assert extract_year("BET 1910 AND 1915") == 1910
    assert extract_year("CIRCA 1888") == 1888
    assert extract_year(None) is None
    assert extract_year("NO DATE") is None


def test_import_gedcom_fresh_workspace(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    sample_gedcom = """0 HEAD
1 GEDC
2 VERS 7.0
1 CHAR UTF-8
1 SOUR LORES
0 @I1@ INDI
1 NAME Robert /Smith/
1 SEX M
1 BIRT
2 DATE 12 MAY 1940
2 PLAC Boston, MA
1 DEAT
2 DATE 15 OCT 2010
2 PLAC Chicago, IL
1 NOTE Patriarch of the family.
1 OCCU Blacksmith
2 DATE 1965
0 @I2@ INDI
1 NAME Mary /Johnson/
2 _MDN Miller
1 SEX F
1 BIRT
2 DATE ABT 1942
2 PLAC New York, NY
0 @I3@ INDI
1 NAME Alice /Smith/
1 SEX F
1 BIRT
2 DATE 20 JUN 1970
2 PLAC Boston, MA
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 10 JUN 1965
0 TRLR
"""
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="family.ged",
        content=sample_gedcom,
    )

    assert isinstance(summary, ImportSummaryRead)
    assert summary.success is True
    assert summary.filename == "family.ged"
    assert summary.format == "gedcom"
    assert summary.people_created == 3
    assert summary.people_merged == 0
    assert summary.unions_created == 1
    assert summary.children_linked == 1
    assert summary.lore_notes_created >= 1  # 1 OCCU event
    assert summary.warnings == []

    # Check People in DB
    people = db_session.query(Person).filter(Person.workspace_id == test_workspace.id).all()
    assert len(people) == 3

    p_robert = next(p for p in people if p.first_name == "Robert")
    assert p_robert.last_name == "Smith"
    assert p_robert.gender == "male"
    assert p_robert.is_living is False
    assert p_robert.birth_date == "12 MAY 1940"
    assert p_robert.birth_place == "Boston, MA"
    assert p_robert.biography == "Patriarch of the family."

    p_mary = next(p for p in people if p.first_name == "Mary")
    assert p_mary.maiden_name == "Miller"
    assert p_mary.gender == "female"
    assert p_mary.is_living is True

    # Check FamilyUnion & ChildRelationship
    unions = (
        db_session.query(FamilyUnion).filter(FamilyUnion.workspace_id == test_workspace.id).all()
    )
    assert len(unions) == 1
    u = unions[0]
    assert u.partner1_id == p_robert.id
    assert u.partner2_id == p_mary.id

    p_alice = next(p for p in people if p.first_name == "Alice")
    rels = (
        db_session.query(ChildRelationship)
        .filter(ChildRelationship.workspace_id == test_workspace.id)
        .all()
    )
    assert len(rels) == 1
    assert rels[0].union_id == u.id
    assert rels[0].child_id == p_alice.id


def test_import_gedcom_deduplication_and_enrichment(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    # Pre-create existing person with incomplete info
    existing_robert = Person(
        workspace_id=test_workspace.id,
        first_name="Robert",
        last_name="Smith",
        gender="unknown",
        is_living=True,
        birth_date="1940",
        birth_place=None,  # missing
        biography=None,  # missing
    )
    db_session.add(existing_robert)
    db_session.commit()

    sample_gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Robert /Smith/
1 SEX M
1 BIRT
2 DATE 12 MAY 1940
2 PLAC Boston, MA
1 DEAT
2 DATE 15 OCT 2010
2 PLAC Chicago, IL
1 NOTE Pioneer in local trade.
0 TRLR
"""
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="robert_update.ged",
        content=sample_gedcom,
    )

    assert summary.people_created == 0
    assert summary.people_merged == 1

    # Verify existing person was enriched
    db_session.refresh(existing_robert)
    assert existing_robert.gender == "male"
    assert existing_robert.is_living is False
    assert existing_robert.birth_place == "Boston, MA"
    assert existing_robert.death_date == "15 OCT 2010"
    assert existing_robert.death_place == "Chicago, IL"
    assert existing_robert.biography == "Pioneer in local trade."


def test_import_gedcom_prevents_cycle_and_records_warning(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    # Pre-create Father -> Son
    father = Person(
        workspace_id=test_workspace.id,
        first_name="Arthur",
        last_name="Pendleton",
        birth_date="1920",
    )
    son = Person(
        workspace_id=test_workspace.id,
        first_name="David",
        last_name="Pendleton",
        birth_date="1950",
    )
    db_session.add_all([father, son])
    db_session.flush()

    u1 = FamilyUnion(workspace_id=test_workspace.id, partner1_id=father.id)
    db_session.add(u1)
    db_session.flush()

    cr1 = ChildRelationship(workspace_id=test_workspace.id, union_id=u1.id, child_id=son.id)
    db_session.add(cr1)
    db_session.commit()

    # Import GEDCOM where David is parent of Arthur (creating cycle)
    cyclic_gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME David /Pendleton/
1 BIRT
2 DATE 1950
0 @I2@ INDI
1 NAME Arthur /Pendleton/
1 BIRT
2 DATE 1920
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 TRLR
"""
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="cyclic.ged",
        content=cyclic_gedcom,
    )

    assert summary.people_merged == 2
    assert summary.children_linked == 0
    assert len(summary.warnings) == 1
    assert "cyclical ancestry" in summary.warnings[0].lower()


def test_export_and_import_json_backup(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    # Populate workspace
    p1 = Person(
        workspace_id=test_workspace.id,
        first_name="George",
        last_name="Harrison",
        gender="male",
        birth_date="1943-02-25",
        birth_place="Liverpool, UK",
        biography="Musician and songwriter.",
    )
    p2 = Person(
        workspace_id=test_workspace.id,
        first_name="Olivia",
        last_name="Harrison",
        maiden_name="Arias",
        gender="female",
        birth_date="1948-05-18",
    )
    p3 = Person(
        workspace_id=test_workspace.id,
        first_name="Dhani",
        last_name="Harrison",
        gender="male",
        birth_date="1978-08-01",
    )
    db_session.add_all([p1, p2, p3])
    db_session.flush()

    u = FamilyUnion(
        workspace_id=test_workspace.id,
        partner1_id=p1.id,
        partner2_id=p2.id,
        union_type="marriage",
        start_date="1978-09-02",
    )
    db_session.add(u)
    db_session.flush()

    cr = ChildRelationship(
        workspace_id=test_workspace.id,
        union_id=u.id,
        child_id=p3.id,
    )
    db_session.add(cr)

    note = LoreNote(
        workspace_id=test_workspace.id,
        person_id=p1.id,
        author_id=test_user.id,
        title="Friar Park",
        content="George restored Friar Park gardens over several decades.",
        tags=["gardening", "history"],
    )
    db_session.add(note)
    db_session.commit()

    # 1. Export JSON
    backup = export_json_backup(db=db_session, workspace_id=test_workspace.id)

    assert backup["version"] == "1.0"
    assert backup["format"] == "lores_backup"
    assert backup["workspace"]["id"] == str(test_workspace.id)
    assert len(backup["people"]) == 3
    assert len(backup["unions"]) == 1
    assert len(backup["children"]) == 1
    assert len(backup["lore_notes"]) == 1

    # 2. Restore into a new workspace
    new_ws = Workspace(
        name="Restored Family",
        slug=f"restored-family-{uuid.uuid4().hex[:8]}",
        created_by_user_id=test_user.id,
    )
    db_session.add(new_ws)
    db_session.commit()

    import_summary = import_json_to_workspace(
        db=db_session,
        workspace_id=new_ws.id,
        user_id=test_user.id,
        filename="backup.json",
        data=backup,
    )

    assert import_summary.success is True
    assert import_summary.format == "json"
    assert import_summary.people_created == 3
    assert import_summary.people_merged == 0
    assert import_summary.unions_created == 1
    assert import_summary.children_linked == 1
    assert import_summary.lore_notes_created == 1

    # Verify entities in new workspace
    new_people = db_session.query(Person).filter(Person.workspace_id == new_ws.id).all()
    assert len(new_people) == 3

    new_notes = db_session.query(LoreNote).filter(LoreNote.workspace_id == new_ws.id).all()
    assert len(new_notes) == 1
    assert new_notes[0].title == "Friar Park"


def test_import_json_deduplication_and_cycle(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    # Pre-create existing person
    existing = Person(
        workspace_id=test_workspace.id,
        first_name="Paul",
        last_name="McCartney",
        birth_date="1942-06-18",
        gender="male",
    )
    db_session.add(existing)
    db_session.commit()

    data = {
        "people": [
            {
                "id": str(uuid.uuid4()),
                "first_name": "Paul",
                "last_name": "McCartney",
                "birth_date": "18 JUN 1942",
                "birth_place": "Liverpool, England",
                "biography": "Bass guitarist and singer.",
            }
        ],
        "unions": [],
        "children": [],
        "lore_notes": [],
    }

    summary = import_json_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="paul.json",
        data=data,
    )

    assert summary.people_created == 0
    assert summary.people_merged == 1

    db_session.refresh(existing)
    assert existing.birth_place == "Liverpool, England"
    assert existing.biography == "Bass guitarist and singer."


def test_invalid_workspace_raises(db_session: Session, test_user: User):
    bad_ws_id = uuid.uuid4()

    with pytest.raises(ValueError, match="Workspace not found"):
        export_json_backup(db=db_session, workspace_id=bad_ws_id)

    with pytest.raises(ValueError, match="Workspace not found"):
        import_gedcom_to_workspace(
            db=db_session,
            workspace_id=bad_ws_id,
            user_id=test_user.id,
            filename="test.ged",
            content="0 HEAD\n0 TRLR",
        )

    with pytest.raises(ValueError, match="Workspace not found"):
        import_json_to_workspace(
            db=db_session,
            workspace_id=bad_ws_id,
            user_id=test_user.id,
            filename="test.json",
            data={},
        )


def test_self_parent_cycle_prevention(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    self_parent_gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Loop /Person/
1 BIRT
2 DATE 1960
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I1@
0 TRLR
"""
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="self_parent.ged",
        content=self_parent_gedcom,
    )

    assert summary.people_created == 1
    assert summary.children_linked == 0
    assert len(summary.warnings) == 1
    assert "cyclical ancestry" in summary.warnings[0].lower()


def test_multitenant_isolation(db_session: Session, test_user: User):
    ws1 = Workspace(
        name="Workspace 1",
        slug=f"ws1-{uuid.uuid4().hex[:8]}",
        created_by_user_id=test_user.id,
    )
    ws2 = Workspace(
        name="Workspace 2",
        slug=f"ws2-{uuid.uuid4().hex[:8]}",
        created_by_user_id=test_user.id,
    )
    db_session.add_all([ws1, ws2])
    db_session.flush()

    p_ws1 = Person(
        workspace_id=ws1.id,
        first_name="Common",
        last_name="Name",
        birth_date="1950",
    )
    db_session.add(p_ws1)
    db_session.commit()

    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Common /Name/
1 BIRT
2 DATE 1950
0 TRLR
"""
    # Import into ws2 should create a new person in ws2, not merge with ws1
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=ws2.id,
        user_id=test_user.id,
        filename="common.ged",
        content=gedcom,
    )

    assert summary.people_created == 1
    assert summary.people_merged == 0

    p_ws2 = (
        db_session.query(Person)
        .filter(Person.workspace_id == ws2.id, Person.first_name == "Common")
        .first()
    )
    assert p_ws2 is not None
    assert p_ws2.id != p_ws1.id


def test_audit_logging_and_custom_events(
    db_session: Session, test_workspace: Workspace, test_user: User
):
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Explorer /Doe/
1 BIRT
2 DATE 1930
1 RESI Paris, France
2 DATE 1955
1 EDUC Sorbonne
2 DATE 1952
1 NOTE Extra note about research.
0 TRLR
"""
    summary = import_gedcom_to_workspace(
        db=db_session,
        workspace_id=test_workspace.id,
        user_id=test_user.id,
        filename="explorer.ged",
        content=gedcom,
    )

    assert summary.people_created == 1
    # 2 custom events + 0 extra notes (since the 1 note is used as biography)
    assert summary.lore_notes_created == 2

    # Check audit log in DB
    from app.models.audit_log import AuditLog

    log = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.workspace_id == test_workspace.id,
            AuditLog.action == "DATA_IMPORT",
        )
        .first()
    )
    assert log is not None
    assert log.actor_id == test_user.id
    assert log.changes["filename"] == "explorer.ged"
    assert log.changes["format"] == "gedcom"
