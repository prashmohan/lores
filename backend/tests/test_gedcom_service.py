import uuid

from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.models.workspace import Workspace
from app.services.gedcom_service import (
    ParsedFamily,
    ParsedGedcomData,
    ParsedIndividual,
    generate_gedcom,
    parse_gedcom,
)


def test_dataclass_structures():
    ind = ParsedIndividual(id_tag="@I1@", first_name="John", last_name="Doe")
    assert ind.id_tag == "@I1@"
    assert ind.first_name == "John"
    assert ind.last_name == "Doe"
    assert ind.gender == "unknown"
    assert ind.is_living is True
    assert ind.birth_date_qualifier == "exact"
    assert ind.notes == []
    assert ind.custom_events == []

    fam = ParsedFamily(id_tag="@F1@", husband_tag="@I1@", wife_tag="@I2@")
    assert fam.id_tag == "@F1@"
    assert fam.husband_tag == "@I1@"
    assert fam.wife_tag == "@I2@"
    assert fam.children_tags == []
    assert fam.union_type == "marriage"

    data = ParsedGedcomData(individuals=[ind], families=[fam], header_info={"source": "LORES"})
    assert len(data.individuals) == 1
    assert len(data.families) == 1
    assert data.header_info["source"] == "LORES"


def test_parse_basic_gedcom():
    sample_gedcom = """0 HEAD
1 GEDC
2 VERS 7.0
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
1 SOUR LORES
2 NAME Test Family
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
2 PLAC Boston, MA
0 TRLR
"""
    data = parse_gedcom(sample_gedcom)

    assert len(data.individuals) == 3
    assert len(data.families) == 1
    assert data.header_info.get("source") == "LORES"
    assert data.header_info.get("version") == "7.0"

    i1 = next(i for i in data.individuals if i.id_tag == "@I1@")
    assert i1.first_name == "Robert"
    assert i1.last_name == "Smith"
    assert i1.gender == "male"
    assert i1.is_living is False
    assert i1.birth_date == "12 MAY 1940"
    assert i1.birth_date_qualifier == "exact"
    assert i1.birth_place == "Boston, MA"
    assert i1.death_date == "15 OCT 2010"
    assert i1.death_date_qualifier == "exact"
    assert i1.death_place == "Chicago, IL"
    assert "Patriarch of the family." in i1.notes
    assert i1.biography == "Patriarch of the family."

    i2 = next(i for i in data.individuals if i.id_tag == "@I2@")
    assert i2.first_name == "Mary"
    assert i2.last_name == "Johnson"
    assert i2.maiden_name == "Miller"
    assert i2.gender == "female"
    assert i2.is_living is True
    assert i2.birth_date == "1942"
    assert i2.birth_date_qualifier == "approximate"
    assert i2.birth_place == "New York, NY"

    i3 = next(i for i in data.individuals if i.id_tag == "@I3@")
    assert i3.first_name == "Alice"
    assert i3.last_name == "Smith"
    assert i3.gender == "female"
    assert i3.is_living is True

    f1 = data.families[0]
    assert f1.id_tag == "@F1@"
    assert f1.husband_tag == "@I1@"
    assert f1.wife_tag == "@I2@"
    assert f1.children_tags == ["@I3@"]
    assert f1.marriage_date == "10 JUN 1965"


def test_parse_date_qualifiers():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Approx /Person/
1 BIRT
2 DATE ABT 1920
1 DEAT
2 DATE CIRCA 1995
0 @I2@ INDI
1 NAME Before /Person/
1 BIRT
2 DATE BEF 1930-05-01
1 DEAT
2 DATE BEFORE 1980
0 @I3@ INDI
1 NAME After /Person/
1 BIRT
2 DATE AFT 1950
1 DEAT
2 DATE AFTER 2000
0 @I4@ INDI
1 NAME Between /Person/
1 BIRT
2 DATE BET 1910 AND 1915
0 TRLR
"""
    data = parse_gedcom(gedcom)
    assert len(data.individuals) == 4

    p1 = next(i for i in data.individuals if i.id_tag == "@I1@")
    assert p1.birth_date == "1920"
    assert p1.birth_date_qualifier == "approximate"
    assert p1.death_date == "1995"
    assert p1.death_date_qualifier == "approximate"

    p2 = next(i for i in data.individuals if i.id_tag == "@I2@")
    assert p2.birth_date == "1930-05-01"
    assert p2.birth_date_qualifier == "before"
    assert p2.death_date == "1980"
    assert p2.death_date_qualifier == "before"

    p3 = next(i for i in data.individuals if i.id_tag == "@I3@")
    assert p3.birth_date == "1950"
    assert p3.birth_date_qualifier == "after"
    assert p3.death_date == "2000"
    assert p3.death_date_qualifier == "after"

    p4 = next(i for i in data.individuals if i.id_tag == "@I4@")
    assert p4.birth_date == "BET 1910 AND 1915"
    assert p4.birth_date_qualifier == "approximate"


def test_parse_name_variations_and_givn_surn():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME /OnlySurname/
0 @I2@ INDI
1 NAME OnlyFirst
0 @I3@ INDI
1 NAME Arthur /Pendleton-Smith/ Jr.
0 @I4@ INDI
1 NAME Jane /Doe/
2 GIVN Janet
2 SURN Doe
2 _MAIDEN Taylor
0 TRLR
"""
    data = parse_gedcom(gedcom)

    p1 = next(i for i in data.individuals if i.id_tag == "@I1@")
    assert p1.first_name == ""
    assert p1.last_name == "OnlySurname"

    p2 = next(i for i in data.individuals if i.id_tag == "@I2@")
    assert p2.first_name == "OnlyFirst"
    assert p2.last_name == ""

    p3 = next(i for i in data.individuals if i.id_tag == "@I3@")
    assert p3.first_name == "Arthur Jr."
    assert p3.last_name == "Pendleton-Smith"

    p4 = next(i for i in data.individuals if i.id_tag == "@I4@")
    assert p4.first_name == "Janet"
    assert p4.last_name == "Doe"
    assert p4.maiden_name == "Taylor"


def test_parse_gender_variations():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Male /User/
1 SEX M
0 @I2@ INDI
1 NAME Female /User/
1 SEX F
0 @I3@ INDI
1 NAME NonBinary /User/
1 SEX X
0 @I4@ INDI
1 NAME Unknown /User/
1 SEX U
0 @I5@ INDI
1 NAME Default /User/
0 TRLR
"""
    data = parse_gedcom(gedcom)

    assert next(i for i in data.individuals if i.id_tag == "@I1@").gender == "male"
    assert next(i for i in data.individuals if i.id_tag == "@I2@").gender == "female"
    assert next(i for i in data.individuals if i.id_tag == "@I3@").gender == "other"
    assert next(i for i in data.individuals if i.id_tag == "@I4@").gender == "unknown"
    assert next(i for i in data.individuals if i.id_tag == "@I5@").gender == "unknown"


def test_parse_multiline_notes_cont_conc():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Story /Teller/
1 NOTE Line 1 of the story.
2 CONT Line 2 of the story.
2 CONC  Continued line 2.
2 CONT Line 3 of the story.
1 NOTE Second standalone note.
0 @F1@ FAM
1 HUSB @I1@
1 NOTE Family note line 1.
2 CONT Family note line 2.
0 TRLR
"""
    data = parse_gedcom(gedcom)
    p1 = data.individuals[0]
    assert len(p1.notes) == 2
    assert (
        p1.notes[0]
        == "Line 1 of the story.\nLine 2 of the story. Continued line 2.\nLine 3 of the story."
    )
    assert p1.notes[1] == "Second standalone note."
    assert p1.biography == p1.notes[0]

    f1 = data.families[0]
    assert len(f1.notes) == 1
    assert f1.notes[0] == "Family note line 1.\nFamily note line 2."


def test_parse_custom_events():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Adventurer /Smith/
1 OCCU Blacksmith
2 DATE 1890
2 PLAC London, UK
1 RESI New York, NY
2 DATE 1910
1 EDUC Oxford University
0 TRLR
"""
    data = parse_gedcom(gedcom)
    p1 = data.individuals[0]
    assert len(p1.custom_events) == 3

    occu = next(e for e in p1.custom_events if e["tag"] == "OCCU")
    assert occu["value"] == "Blacksmith"
    assert occu["date"] == "1890"
    assert occu["place"] == "London, UK"

    resi = next(e for e in p1.custom_events if e["tag"] == "RESI")
    assert resi["value"] == "New York, NY"
    assert resi["date"] == "1910"

    educ = next(e for e in p1.custom_events if e["tag"] == "EDUC")
    assert educ["value"] == "Oxford University"


def test_parse_empty_and_edge_cases():
    # Empty string
    data_empty = parse_gedcom("")
    assert data_empty.individuals == []
    assert data_empty.families == []

    # Whitespace and comments
    data_ws = parse_gedcom("\n\n   \r\n")
    assert data_ws.individuals == []
    assert data_ws.families == []

    # UTF-8 BOM
    bom_gedcom = "\ufeff0 HEAD\n1 SOUR LORES\n0 @I1@ INDI\n1 NAME BOM /User/\n0 TRLR"
    data_bom = parse_gedcom(bom_gedcom)
    assert len(data_bom.individuals) == 1
    assert data_bom.individuals[0].first_name == "BOM"
    assert data_bom.individuals[0].last_name == "User"


def test_generate_gedcom_empty_workspace(db_session: Session):
    workspace_id = uuid.uuid4()
    gedcom_str = generate_gedcom(db_session, workspace_id, "Empty Family")

    assert "0 HEAD" in gedcom_str
    assert "1 GEDC" in gedcom_str
    assert "2 VERS 7.0" in gedcom_str
    assert "1 CHAR UTF-8" in gedcom_str
    assert "1 SOUR LORES" in gedcom_str
    assert "2 NAME Empty Family" in gedcom_str
    assert "0 TRLR" in gedcom_str
    assert "INDI" not in gedcom_str
    assert "FAM" not in gedcom_str


def test_generate_gedcom_full_tree_and_roundtrip(db_session: Session):
    # Setup test workspace, user, and tree
    user = User(
        email=f"author-{uuid.uuid4()}@example.com",
        display_name="Test Author",
    )
    db_session.add(user)
    db_session.flush()

    ws = Workspace(
        name="The Miller Heritage",
        slug=f"the-miller-heritage-{uuid.uuid4().hex[:8]}",
        created_by_user_id=user.id,
    )
    db_session.add(ws)
    db_session.flush()

    # Create Grandpa (Deceased, approximate birth date, death place)
    grandpa = Person(
        workspace_id=ws.id,
        first_name="Arthur",
        last_name="Miller",
        maiden_name=None,
        gender="male",
        is_living=False,
        birth_date="1910",
        birth_date_qualifier="approximate",
        birth_place="Boston, MA",
        death_date="1985-04-12",
        death_date_qualifier="exact",
        death_place="New York, NY",
        biography="Arthur was an architect who loved jazz.\nHe built several landmarks.",
    )
    # Grandma (Deceased, maiden name)
    grandma = Person(
        workspace_id=ws.id,
        first_name="Clara",
        last_name="Miller",
        maiden_name="Higgins",
        gender="female",
        is_living=False,
        birth_date="1915-08-20",
        birth_date_qualifier="exact",
        birth_place="Chicago, IL",
        death_date="1990",
        death_date_qualifier="before",
        death_place="New York, NY",
        biography="Clara was a schoolteacher and botanist.",
    )
    # Daughter (Living)
    daughter = Person(
        workspace_id=ws.id,
        first_name="Margaret",
        last_name="Miller",
        maiden_name=None,
        gender="female",
        is_living=True,
        birth_date="1945-05-15",
        birth_date_qualifier="exact",
        birth_place="New York, NY",
        biography="Margaret is a painter living in Hudson Valley.",
    )
    # Partner of daughter (Living, non-binary)
    partner = Person(
        workspace_id=ws.id,
        first_name="Alex",
        last_name="Rivera",
        gender="other",
        is_living=True,
        birth_date="1948-02-10",
        birth_date_qualifier="exact",
        birth_place="San Juan, PR",
    )
    # Child of daughter & partner
    grandchild = Person(
        workspace_id=ws.id,
        first_name="Leo",
        last_name="Rivera-Miller",
        gender="male",
        is_living=True,
        birth_date="1980-11-04",
        birth_date_qualifier="exact",
        birth_place="Brooklyn, NY",
    )

    db_session.add_all([grandpa, grandma, daughter, partner, grandchild])
    db_session.flush()

    # Add Lore note to Grandpa
    note1 = LoreNote(
        workspace_id=ws.id,
        person_id=grandpa.id,
        author_id=user.id,
        title="Jazz Club Story",
        content="Grandpa Arthur frequented the Village Vanguard in the 1940s.\nHe met Duke Ellington once.",
    )
    db_session.add(note1)

    # Union 1: Grandpa & Grandma
    union1 = FamilyUnion(
        workspace_id=ws.id,
        partner1_id=grandpa.id,
        partner2_id=grandma.id,
        union_type="marriage",
        start_date="1938-06-18",
        notes="Married in Boston First Church.",
    )
    db_session.add(union1)
    db_session.flush()

    # Child relationship 1: daughter in union1
    cr1 = ChildRelationship(
        workspace_id=ws.id,
        union_id=union1.id,
        child_id=daughter.id,
        relationship_type="biological",
    )
    db_session.add(cr1)

    # Union 2: Daughter & Alex (domestic partnership)
    union2 = FamilyUnion(
        workspace_id=ws.id,
        partner1_id=daughter.id,
        partner2_id=partner.id,
        union_type="domestic_partnership",
        start_date="1975-09-01",
    )
    db_session.add(union2)
    db_session.flush()

    # Child relationship 2: grandchild in union2
    cr2 = ChildRelationship(
        workspace_id=ws.id,
        union_id=union2.id,
        child_id=grandchild.id,
        relationship_type="biological",
    )
    db_session.add(cr2)
    db_session.commit()

    # 1. Generate GEDCOM
    gedcom_str = generate_gedcom(db_session, ws.id, ws.name)
    assert gedcom_str.startswith("0 HEAD\n")
    assert gedcom_str.endswith("0 TRLR\n")
    assert "2 NAME The Miller Heritage" in gedcom_str
    assert "1 NAME Arthur /Miller/" in gedcom_str
    assert "1 SEX M" in gedcom_str
    assert "2 DATE ABT 1910" in gedcom_str
    assert "2 DATE 1985-04-12" in gedcom_str
    assert "2 PLAC New York, NY" in gedcom_str
    assert "1 NOTE Arthur was an architect who loved jazz." in gedcom_str
    assert "2 CONT He built several landmarks." in gedcom_str
    assert (
        "1 NOTE Jazz Club Story: Grandpa Arthur frequented the Village Vanguard in the 1940s."
        in gedcom_str
    )
    assert "1 NAME Clara /Miller/" in gedcom_str
    assert (
        "2 _MDN Higgins" in gedcom_str
        or "2 _MAIDEN Higgins" in gedcom_str
        or "Higgins" in gedcom_str
    )
    assert "1 SEX F" in gedcom_str
    assert "2 DATE BEF 1990" in gedcom_str
    assert "1 NAME Alex /Rivera/" in gedcom_str
    assert "1 SEX X" in gedcom_str
    assert "1 MARR" in gedcom_str
    assert "2 TYPE domestic_partnership" in gedcom_str

    # 2. Parse back the generated GEDCOM
    parsed = parse_gedcom(gedcom_str)
    assert len(parsed.individuals) == 5
    assert len(parsed.families) == 2

    # Check grandpa
    p_grandpa = next(
        i for i in parsed.individuals if i.first_name == "Arthur" and i.last_name == "Miller"
    )
    assert p_grandpa.gender == "male"
    assert p_grandpa.is_living is False
    assert p_grandpa.birth_date == "1910"
    assert p_grandpa.birth_date_qualifier == "approximate"
    assert p_grandpa.birth_place == "Boston, MA"
    assert p_grandpa.death_date == "1985-04-12"
    assert p_grandpa.death_date_qualifier == "exact"
    assert p_grandpa.death_place == "New York, NY"
    assert "Arthur was an architect who loved jazz.\nHe built several landmarks." in p_grandpa.notes

    # Check grandma
    p_grandma = next(i for i in parsed.individuals if i.first_name == "Clara")
    assert p_grandma.maiden_name == "Higgins"
    assert p_grandma.gender == "female"
    assert p_grandma.is_living is False
    assert p_grandma.death_date_qualifier == "before"

    # Check non-binary partner
    p_alex = next(i for i in parsed.individuals if i.first_name == "Alex")
    assert p_alex.gender == "other"
    assert p_alex.is_living is True

    # Check families
    f_grand = next(f for f in parsed.families if f.marriage_date == "1938-06-18")
    assert f_grand.husband_tag == p_grandpa.id_tag
    assert f_grand.wife_tag == p_grandma.id_tag
    p_daughter = next(i for i in parsed.individuals if i.first_name == "Margaret")
    assert p_daughter.id_tag in f_grand.children_tags
    assert "Married in Boston First Church." in f_grand.notes[0]

    f_daughter = next(f for f in parsed.families if f.marriage_date == "1975-09-01")
    assert f_daughter.union_type == "domestic_partnership"
    p_grandchild = next(i for i in parsed.individuals if i.first_name == "Leo")
    assert p_grandchild.id_tag in f_daughter.children_tags


def test_generate_gedcom_soft_deleted_excluded(db_session: Session):
    ws_id = uuid.uuid4()
    active_p = Person(workspace_id=ws_id, first_name="Active", last_name="Person", is_deleted=False)
    deleted_p = Person(
        workspace_id=ws_id, first_name="Deleted", last_name="Person", is_deleted=True
    )
    db_session.add_all([active_p, deleted_p])
    db_session.flush()

    active_union = FamilyUnion(workspace_id=ws_id, partner1_id=active_p.id, is_deleted=False)
    deleted_union = FamilyUnion(workspace_id=ws_id, partner1_id=deleted_p.id, is_deleted=True)
    db_session.add_all([active_union, deleted_union])
    db_session.flush()

    deleted_cr = ChildRelationship(
        workspace_id=ws_id, union_id=active_union.id, child_id=deleted_p.id, is_deleted=True
    )
    db_session.add(deleted_cr)
    db_session.commit()

    gedcom_str = generate_gedcom(db_session, ws_id, "Test Soft Delete")
    parsed = parse_gedcom(gedcom_str)

    assert len(parsed.individuals) == 1
    assert parsed.individuals[0].first_name == "Active"
    assert len(parsed.families) == 1
    assert parsed.families[0].children_tags == []


def test_generate_gedcom_same_sex_and_single_parent(db_session: Session):
    user = User(
        email=f"author-{uuid.uuid4()}@example.com",
        display_name="Test Author",
    )
    db_session.add(user)
    db_session.flush()

    ws = Workspace(
        name="Same Sex Family",
        slug=f"same-sex-family-{uuid.uuid4().hex[:8]}",
        created_by_user_id=user.id,
    )
    db_session.add(ws)
    db_session.flush()

    mother1 = Person(workspace_id=ws.id, first_name="Sarah", last_name="Connor", gender="female")
    mother2 = Person(workspace_id=ws.id, first_name="Emily", last_name="Connor", gender="female")
    child = Person(workspace_id=ws.id, first_name="John", last_name="Connor", gender="male")
    db_session.add_all([mother1, mother2, child])
    db_session.flush()

    union = FamilyUnion(
        workspace_id=ws.id,
        partner1_id=mother1.id,
        partner2_id=mother2.id,
        union_type="marriage",
        start_date="2015-05-20",
    )
    db_session.add(union)
    db_session.flush()

    cr = ChildRelationship(workspace_id=ws.id, union_id=union.id, child_id=child.id)
    db_session.add(cr)
    db_session.commit()

    gedcom_str = generate_gedcom(db_session, ws.id, ws.name)
    assert "1 NAME Sarah /Connor/" in gedcom_str
    assert "1 NAME Emily /Connor/" in gedcom_str
    assert "1 NAME John /Connor/" in gedcom_str
    assert "1 MARR" in gedcom_str
    assert "2 DATE 2015-05-20" in gedcom_str

    parsed = parse_gedcom(gedcom_str)
    assert len(parsed.individuals) == 3
    assert len(parsed.families) == 1
    f = parsed.families[0]
    assert len(f.children_tags) == 1


def test_parse_death_tags_and_living_status():
    gedcom = """0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Deceased /NoDate/
1 DEAT Y
0 @I2@ INDI
1 NAME Living /ExplicitN/
1 DEAT N
0 @I3@ INDI
1 NAME Deceased /EmptyTag/
1 DEAT
0 @I4@ INDI
1 NAME Living /NoDeat/
0 TRLR
"""
    data = parse_gedcom(gedcom)
    p1 = next(i for i in data.individuals if i.id_tag == "@I1@")
    assert p1.is_living is False

    p2 = next(i for i in data.individuals if i.id_tag == "@I2@")
    assert p2.is_living is True

    p3 = next(i for i in data.individuals if i.id_tag == "@I3@")
    assert p3.is_living is False

    p4 = next(i for i in data.individuals if i.id_tag == "@I4@")
    assert p4.is_living is True
