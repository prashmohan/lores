import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion


@dataclass
class ParsedIndividual:
    id_tag: str  # e.g. "@I1@"
    first_name: str = ""
    last_name: str = ""
    maiden_name: str | None = None
    gender: str = "unknown"  # male, female, other, unknown
    is_living: bool = True
    birth_date: str | None = None
    birth_date_qualifier: str = "exact"  # exact, approximate, before, after
    birth_place: str | None = None
    death_date: str | None = None
    death_date_qualifier: str = "exact"
    death_place: str | None = None
    biography: str | None = None
    notes: list[str] = field(default_factory=list)
    custom_events: list[dict[str, str]] = field(default_factory=list)


@dataclass
class ParsedFamily:
    id_tag: str  # e.g. "@F1@"
    husband_tag: str | None = None  # e.g. "@I1@"
    wife_tag: str | None = None  # e.g. "@I2@"
    children_tags: list[str] = field(default_factory=list)
    marriage_date: str | None = None
    union_type: str = "marriage"
    notes: list[str] = field(default_factory=list)


@dataclass
class ParsedGedcomData:
    individuals: list[ParsedIndividual] = field(default_factory=list)
    families: list[ParsedFamily] = field(default_factory=list)
    header_info: dict[str, str] = field(default_factory=dict)


def _parse_date_and_qualifier(date_str: str) -> tuple[str, str]:
    """
    Parses a GEDCOM DATE value into (cleaned_date, qualifier).
    Qualifiers: 'exact', 'approximate', 'before', 'after'.
    """
    raw = date_str.strip()
    upper = raw.upper()

    approx_prefixes = [
        "ABT.",
        "ABT",
        "ABOUT",
        "CIRCA",
        "CIR.",
        "CA.",
        "CA",
        "CAL.",
        "CAL",
        "EST.",
        "EST",
        "~",
    ]
    for prefix in approx_prefixes:
        if upper.startswith(prefix + " ") or upper == prefix:
            return raw[len(prefix) :].strip(), "approximate"
    if upper.startswith(("BET ", "BETWEEN ")):
        return raw, "approximate"

    bef_prefixes = ["BEF.", "BEF", "BEFORE", "<"]
    for prefix in bef_prefixes:
        if upper.startswith(prefix + " ") or upper == prefix:
            return raw[len(prefix) :].strip(), "before"

    aft_prefixes = ["AFT.", "AFT", "AFTER", ">"]
    for prefix in aft_prefixes:
        if upper.startswith(prefix + " ") or upper == prefix:
            return raw[len(prefix) :].strip(), "after"

    return raw, "exact"


def _parse_name_line(name_val: str) -> tuple[str, str]:
    """
    Extracts first name and last name from a GEDCOM NAME string.
    e.g. 'John /Doe/' -> ('John', 'Doe')
         '/Smith/' -> ('', 'Smith')
         'Madonna' -> ('Madonna', '')
         'Arthur /Pendleton-Smith/ Jr.' -> ('Arthur Jr.', 'Pendleton-Smith')
    """
    match = re.search(r"/([^/]*)/", name_val)
    if match:
        surname = match.group(1).strip()
        before = name_val[: match.start()].strip()
        after = name_val[match.end() :].strip()
        parts = [p for p in (before, after) if p]
        given_name = " ".join(parts).strip()
        return given_name, surname
    return name_val.strip(), ""


def _format_note_lines(text: str, level: int = 1) -> list[str]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if not lines:
        return []
    result = [f"{level} NOTE {lines[0]}"]
    cont_level = level + 1
    for line in lines[1:]:
        result.append(f"{cont_level} CONT {line}")
    return result


def parse_gedcom(content: str) -> ParsedGedcomData:
    """
    Parses a standard GEDCOM (5.5 / 7.0) string into structured ParsedGedcomData.
    """
    cleaned = content.lstrip("\ufeff")
    raw_lines = cleaned.splitlines()

    # Tokenize lines: (level, xref, tag, value)
    line_pattern = re.compile(r"^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$")
    parsed_lines: list[tuple[int, str | None, str, str]] = []
    for line in raw_lines:
        if not line.strip():
            continue
        m = line_pattern.match(line)
        if m:
            level = int(m.group(1))
            xref = m.group(2)
            tag = m.group(3).upper()
            val = m.group(4) or ""
            parsed_lines.append((level, xref, tag, val))

    data = ParsedGedcomData()

    idx = 0
    total = len(parsed_lines)

    while idx < total:
        level, xref, tag, val = parsed_lines[idx]

        if level == 0:
            if tag == "HEAD":
                idx += 1
                curr_h_tag = ""
                while idx < total and parsed_lines[idx][0] > 0:
                    h_level, _, h_tag, h_val = parsed_lines[idx]
                    if h_level == 1:
                        curr_h_tag = h_tag
                        if h_tag == "SOUR":
                            data.header_info["source"] = h_val.strip()
                        elif h_tag == "CHAR":
                            data.header_info["charset"] = h_val.strip()
                        elif h_tag == "DATE":
                            data.header_info["date"] = h_val.strip()
                    elif h_level == 2:
                        if curr_h_tag == "GEDC" and h_tag == "VERS":
                            data.header_info["version"] = h_val.strip()
                        elif curr_h_tag == "SOUR" and h_tag == "NAME":
                            data.header_info["name"] = h_val.strip()
                        elif curr_h_tag == "SOUR" and h_tag == "VERS":
                            data.header_info["source_version"] = h_val.strip()
                    idx += 1
                continue

            elif tag == "INDI" and xref:
                ind = ParsedIndividual(id_tag=xref)
                idx += 1
                curr_tag = ""
                curr_event: dict[str, str] | None = None

                while idx < total and parsed_lines[idx][0] > 0:
                    l_level, _, l_tag, l_val = parsed_lines[idx]
                    if l_level == 1:
                        curr_tag = l_tag
                        curr_event = None
                        if l_tag == "NAME":
                            given, surname = _parse_name_line(l_val)
                            ind.first_name = given
                            ind.last_name = surname
                        elif l_tag == "SEX":
                            s = l_val.strip().upper()
                            if s in ("M", "MALE"):
                                ind.gender = "male"
                            elif s in ("F", "FEMALE"):
                                ind.gender = "female"
                            elif s in ("X", "OTHER"):
                                ind.gender = "other"
                            else:
                                ind.gender = "unknown"
                        elif l_tag == "BIRT":
                            pass
                        elif l_tag == "DEAT":
                            if l_val.strip().upper() == "N":
                                ind.is_living = True
                            else:
                                ind.is_living = False
                        elif l_tag == "NOTE":
                            ind.notes.append(l_val)
                        elif l_tag == "DSCR":
                            if not ind.biography:
                                ind.biography = l_val.strip()
                        elif l_tag in (
                            "OCCU",
                            "RESI",
                            "EDUC",
                            "BAPM",
                            "BURI",
                            "EVEN",
                            "EMIG",
                            "IMMI",
                        ):
                            curr_event = {"tag": l_tag, "value": l_val.strip()}
                            ind.custom_events.append(curr_event)

                    elif l_level >= 2:
                        if curr_tag == "NAME":
                            if l_tag == "GIVN":
                                ind.first_name = l_val.strip()
                            elif l_tag == "SURN":
                                ind.last_name = l_val.strip()
                            elif l_tag in ("_MDN", "_MAIDEN"):
                                ind.maiden_name = l_val.strip()
                            elif l_tag == "_MARNM":
                                if not ind.maiden_name and ind.last_name:
                                    ind.maiden_name = ind.last_name
                                    ind.last_name = l_val.strip()
                                else:
                                    ind.maiden_name = l_val.strip()
                        elif curr_tag == "BIRT":
                            if l_tag == "DATE":
                                d, q = _parse_date_and_qualifier(l_val)
                                ind.birth_date = d
                                ind.birth_date_qualifier = q
                            elif l_tag == "PLAC":
                                ind.birth_place = l_val.strip()
                        elif curr_tag == "DEAT":
                            ind.is_living = False
                            if l_tag == "DATE":
                                d, q = _parse_date_and_qualifier(l_val)
                                ind.death_date = d
                                ind.death_date_qualifier = q
                            elif l_tag == "PLAC":
                                ind.death_place = l_val.strip()
                        elif curr_tag == "NOTE" and ind.notes:
                            if l_tag == "CONT":
                                ind.notes[-1] += "\n" + l_val
                            elif l_tag == "CONC":
                                ind.notes[-1] += l_val
                        elif curr_event is not None:
                            if l_tag == "DATE":
                                curr_event["date"] = l_val.strip()
                            elif l_tag == "PLAC":
                                curr_event["place"] = l_val.strip()
                            elif l_tag == "TYPE":
                                curr_event["type"] = l_val.strip()
                            elif l_tag == "NOTE":
                                curr_event["note"] = l_val.strip()

                    idx += 1

                if not ind.biography and ind.notes:
                    ind.biography = ind.notes[0]

                data.individuals.append(ind)
                continue

            elif tag == "FAM" and xref:
                fam = ParsedFamily(id_tag=xref)
                idx += 1
                curr_tag = ""

                while idx < total and parsed_lines[idx][0] > 0:
                    l_level, _, l_tag, l_val = parsed_lines[idx]
                    if l_level == 1:
                        curr_tag = l_tag
                        if l_tag == "HUSB":
                            fam.husband_tag = l_val.strip()
                        elif l_tag == "WIFE":
                            fam.wife_tag = l_val.strip()
                        elif l_tag == "CHIL":
                            fam.children_tags.append(l_val.strip())
                        elif l_tag in ("_TYPE", "TYPE"):
                            fam.union_type = l_val.strip().lower()
                        elif l_tag == "MARR":
                            pass
                        elif l_tag == "NOTE":
                            fam.notes.append(l_val)

                    elif l_level >= 2:
                        if curr_tag == "MARR":
                            if l_tag == "DATE":
                                fam.marriage_date = l_val.strip()
                            elif l_tag == "TYPE":
                                fam.union_type = l_val.strip().lower()
                        elif curr_tag == "NOTE" and fam.notes:
                            if l_tag == "CONT":
                                fam.notes[-1] += "\n" + l_val
                            elif l_tag == "CONC":
                                fam.notes[-1] += l_val

                    idx += 1

                data.families.append(fam)
                continue

        idx += 1

    return data


def generate_gedcom(db: Session, workspace_id: uuid.UUID, workspace_name: str) -> str:
    """
    Generates a valid standard GEDCOM (7.0) representation of all people,
    unions, child relationships, and lore notes in a workspace.
    """
    people_stmt = (
        select(Person)
        .where(Person.workspace_id == workspace_id, Person.is_deleted.is_(False))
        .order_by(Person.created_at.asc(), Person.id.asc())
    )
    people = list(db.scalars(people_stmt).all())

    unions_stmt = (
        select(FamilyUnion)
        .where(FamilyUnion.workspace_id == workspace_id, FamilyUnion.is_deleted.is_(False))
        .order_by(FamilyUnion.created_at.asc(), FamilyUnion.id.asc())
    )
    unions = list(db.scalars(unions_stmt).all())

    child_rels_stmt = (
        select(ChildRelationship)
        .where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.is_deleted.is_(False),
        )
        .order_by(ChildRelationship.created_at.asc(), ChildRelationship.id.asc())
    )
    child_rels = list(db.scalars(child_rels_stmt).all())

    lore_notes_stmt = (
        select(LoreNote)
        .where(LoreNote.workspace_id == workspace_id, LoreNote.is_deleted.is_(False))
        .order_by(LoreNote.created_at.asc(), LoreNote.id.asc())
    )
    lore_notes = list(db.scalars(lore_notes_stmt).all())

    person_id_to_tag: dict[uuid.UUID, str] = {}
    person_by_id: dict[uuid.UUID, Person] = {}
    for idx, p in enumerate(people, start=1):
        tag = f"@I{idx}@"
        person_id_to_tag[p.id] = tag
        person_by_id[p.id] = p

    union_id_to_tag: dict[uuid.UUID, str] = {}
    for idx, u in enumerate(unions, start=1):
        tag = f"@F{idx}@"
        union_id_to_tag[u.id] = tag

    union_to_children: dict[uuid.UUID, list[uuid.UUID]] = {u.id: [] for u in unions}
    person_to_child_unions: dict[uuid.UUID, list[uuid.UUID]] = {p.id: [] for p in people}
    for cr in child_rels:
        if cr.union_id in union_to_children and cr.child_id in person_id_to_tag:
            union_to_children[cr.union_id].append(cr.child_id)
        if cr.child_id in person_to_child_unions and cr.union_id in union_id_to_tag:
            person_to_child_unions[cr.child_id].append(cr.union_id)

    person_to_spouse_unions: dict[uuid.UUID, list[uuid.UUID]] = {p.id: [] for p in people}
    for u in unions:
        if u.partner1_id and u.partner1_id in person_to_spouse_unions:
            person_to_spouse_unions[u.partner1_id].append(u.id)
        if u.partner2_id and u.partner2_id in person_to_spouse_unions:
            person_to_spouse_unions[u.partner2_id].append(u.id)

    person_to_lore_notes: dict[uuid.UUID, list[LoreNote]] = {p.id: [] for p in people}
    for note in lore_notes:
        if note.person_id in person_to_lore_notes:
            person_to_lore_notes[note.person_id].append(note)

    lines: list[str] = [
        "0 HEAD",
        "1 GEDC",
        "2 VERS 7.0",
        "2 FORM LINEAGE-LINKED",
        "1 CHAR UTF-8",
        "1 SOUR LORES",
    ]
    if workspace_name:
        clean_name = workspace_name.strip().replace("\n", " ")
        lines.append(f"2 NAME {clean_name}")

    for p in people:
        tag = person_id_to_tag[p.id]
        lines.append(f"0 {tag} INDI")
        last_str = f"/{p.last_name}/" if p.last_name else ""
        name_str = f"{p.first_name} {last_str}".strip()
        lines.append(f"1 NAME {name_str}")

        if p.maiden_name:
            lines.append(f"2 _MDN {p.maiden_name}")

        if p.gender == "male":
            lines.append("1 SEX M")
        elif p.gender == "female":
            lines.append("1 SEX F")
        elif p.gender == "other":
            lines.append("1 SEX X")
        else:
            lines.append("1 SEX U")

        if p.birth_date or p.birth_place:
            lines.append("1 BIRT")
            if p.birth_date:
                qual = (p.birth_date_qualifier or "exact").lower()
                if qual == "approximate":
                    lines.append(f"2 DATE ABT {p.birth_date}")
                elif qual == "before":
                    lines.append(f"2 DATE BEF {p.birth_date}")
                elif qual == "after":
                    lines.append(f"2 DATE AFT {p.birth_date}")
                else:
                    lines.append(f"2 DATE {p.birth_date}")
            if p.birth_place:
                lines.append(f"2 PLAC {p.birth_place}")

        if not p.is_living:
            lines.append("1 DEAT")
            if p.death_date:
                qual = (p.death_date_qualifier or "exact").lower()
                if qual == "approximate":
                    lines.append(f"2 DATE ABT {p.death_date}")
                elif qual == "before":
                    lines.append(f"2 DATE BEF {p.death_date}")
                elif qual == "after":
                    lines.append(f"2 DATE AFT {p.death_date}")
                else:
                    lines.append(f"2 DATE {p.death_date}")
            if p.death_place:
                lines.append(f"2 PLAC {p.death_place}")

        if p.biography:
            lines.extend(_format_note_lines(p.biography, level=1))

        for ln in person_to_lore_notes[p.id]:
            note_content = f"{ln.title}: {ln.content}" if ln.title else ln.content
            lines.extend(_format_note_lines(note_content, level=1))

        for u_id in person_to_child_unions[p.id]:
            lines.append(f"1 FAMC {union_id_to_tag[u_id]}")

        for u_id in person_to_spouse_unions[p.id]:
            lines.append(f"1 FAMS {union_id_to_tag[u_id]}")

    for u in unions:
        fam_tag = union_id_to_tag[u.id]
        lines.append(f"0 {fam_tag} FAM")

        p1 = person_by_id.get(u.partner1_id) if u.partner1_id else None
        p2 = person_by_id.get(u.partner2_id) if u.partner2_id else None

        if p1 and p1.gender == "female" and p2 and p2.gender == "male":
            lines.append(f"1 HUSB {person_id_to_tag[p2.id]}")
            lines.append(f"1 WIFE {person_id_to_tag[p1.id]}")
        else:
            if p1:
                if p1.gender == "female" and not p2:
                    lines.append(f"1 WIFE {person_id_to_tag[p1.id]}")
                else:
                    lines.append(f"1 HUSB {person_id_to_tag[p1.id]}")
            if p2:
                lines.append(f"1 WIFE {person_id_to_tag[p2.id]}")

        for child_id in union_to_children[u.id]:
            lines.append(f"1 CHIL {person_id_to_tag[child_id]}")

        if u.start_date or (u.union_type and u.union_type != "marriage"):
            lines.append("1 MARR")
            if u.union_type and u.union_type != "marriage":
                lines.append(f"2 TYPE {u.union_type}")
            if u.start_date:
                lines.append(f"2 DATE {u.start_date}")

        if u.end_date:
            lines.append("1 DIV")
            lines.append(f"2 DATE {u.end_date}")

        if u.notes:
            lines.extend(_format_note_lines(u.notes, level=1))

    lines.append("0 TRLR")
    return "\n".join(lines) + "\n"
