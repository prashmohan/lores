import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.data_exchange import ImportSummaryRead
from app.services.audit_service import record_audit_event
from app.services.cycle_service import validate_no_cycle
from app.services.gedcom_service import parse_gedcom


def normalize_name(name: str | None) -> str:
    """
    Normalizes a name string by removing punctuation, converting to lowercase,
    and stripping extra whitespace.
    """
    if not name:
        return ""
    cleaned = re.sub(r"[^\w\s]", "", name.lower())
    return " ".join(cleaned.split())


def extract_year(date_str: str | None) -> int | None:
    """
    Extracts a 4-digit year from a date string (e.g. '12 MAY 1945' -> 1945).
    Returns None if no 4-digit year is present.
    """
    if not date_str:
        return None
    match = re.search(r"\b(\d{4})\b", str(date_str))
    if match:
        return int(match.group(1))
    return None


def is_person_match(
    existing: Person,
    first_name: str,
    last_name: str,
    birth_date: str | None,
) -> bool:
    """
    Determines if an imported person record matches an existing person in the workspace
    based on normalized first name, normalized last name, and extracted birth year.
    """
    if normalize_name(existing.first_name) != normalize_name(first_name):
        return False
    if normalize_name(existing.last_name) != normalize_name(last_name):
        return False
    return extract_year(existing.birth_date) == extract_year(birth_date)


def enrich_person(
    existing: Person,
    maiden_name: str | None = None,
    gender: str | None = None,
    is_living: bool | None = None,
    birth_date: str | None = None,
    birth_date_qualifier: str | None = None,
    birth_place: str | None = None,
    death_date: str | None = None,
    death_date_qualifier: str | None = None,
    death_place: str | None = None,
    biography: str | None = None,
    avatar_url: str | None = None,
) -> None:
    """
    Enriches missing fields on an existing person record with imported information.
    """
    if not existing.maiden_name and maiden_name:
        existing.maiden_name = maiden_name

    if (not existing.gender or existing.gender == "unknown") and gender and gender != "unknown":
        existing.gender = gender

    if is_living is False or death_date or death_place:
        existing.is_living = False
    elif is_living is not None and existing.is_living is None:
        existing.is_living = is_living

    if not existing.birth_date and birth_date:
        existing.birth_date = birth_date
        if birth_date_qualifier:
            existing.birth_date_qualifier = birth_date_qualifier

    if not existing.birth_place and birth_place:
        existing.birth_place = birth_place

    if not existing.death_date and death_date:
        existing.death_date = death_date
        if death_date_qualifier:
            existing.death_date_qualifier = death_date_qualifier

    if not existing.death_place and death_place:
        existing.death_place = death_place

    if not existing.biography and biography:
        existing.biography = biography

    if not existing.avatar_url and avatar_url:
        existing.avatar_url = avatar_url


def import_gedcom_to_workspace(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    content: str,
) -> ImportSummaryRead:
    """
    Ingests GEDCOM text data into the target workspace with person deduplication,
    missing field enrichment, ancestry cycle validation, and audit logging.
    """
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError("Workspace not found")

    actor = db.get(User, user_id)

    parsed_data = parse_gedcom(content)
    summary = ImportSummaryRead(filename=filename, format="gedcom")

    # 1. Fetch active people in workspace
    people_stmt = select(Person).where(
        Person.workspace_id == workspace_id,
        Person.is_deleted.is_(False),
    )
    active_people = list(db.scalars(people_stmt).all())

    tag_to_person_id: dict[str, uuid.UUID] = {}

    # 2. Process Individuals
    for ind in parsed_data.individuals:
        matched = next(
            (
                p
                for p in active_people
                if is_person_match(p, ind.first_name, ind.last_name, ind.birth_date)
            ),
            None,
        )

        if matched:
            enrich_person(
                existing=matched,
                maiden_name=ind.maiden_name,
                gender=ind.gender,
                is_living=ind.is_living,
                birth_date=ind.birth_date,
                birth_date_qualifier=ind.birth_date_qualifier,
                birth_place=ind.birth_place,
                death_date=ind.death_date,
                death_date_qualifier=ind.death_date_qualifier,
                death_place=ind.death_place,
                biography=ind.biography,
            )
            target_person_id = matched.id
            tag_to_person_id[ind.id_tag] = matched.id
            summary.people_merged += 1

            # Create LoreNotes for notes that do not duplicate biography
            for note in ind.notes:
                if note.strip() and note.strip() != (matched.biography or "").strip():
                    title = (
                        f"Imported Note: {matched.first_name} {matched.last_name}".strip()
                        if matched.first_name or matched.last_name
                        else "Imported Note"
                    )
                    lore = LoreNote(
                        workspace_id=workspace_id,
                        person_id=target_person_id,
                        title=title,
                        content=note,
                        author_id=user_id,
                        tags=["gedcom-import"],
                    )
                    db.add(lore)
                    summary.lore_notes_created += 1
        else:
            new_person = Person(
                workspace_id=workspace_id,
                first_name=ind.first_name,
                last_name=ind.last_name,
                maiden_name=ind.maiden_name,
                gender=ind.gender,
                is_living=ind.is_living,
                birth_date=ind.birth_date,
                birth_date_qualifier=ind.birth_date_qualifier,
                birth_place=ind.birth_place,
                death_date=ind.death_date,
                death_date_qualifier=ind.death_date_qualifier,
                death_place=ind.death_place,
                biography=ind.biography,
            )
            db.add(new_person)
            db.flush()
            active_people.append(new_person)
            target_person_id = new_person.id
            tag_to_person_id[ind.id_tag] = new_person.id
            summary.people_created += 1

            # Extra notes beyond biography
            for note in ind.notes:
                if note.strip() and note.strip() != (new_person.biography or "").strip():
                    title = (
                        f"Imported Note: {new_person.first_name} {new_person.last_name}".strip()
                        if new_person.first_name or new_person.last_name
                        else "Imported Note"
                    )
                    lore = LoreNote(
                        workspace_id=workspace_id,
                        person_id=target_person_id,
                        title=title,
                        content=note,
                        author_id=user_id,
                        tags=["gedcom-import"],
                    )
                    db.add(lore)
                    summary.lore_notes_created += 1

        # Process custom events
        for event in ind.custom_events:
            tag = event.get("tag", "EVENT")
            title = f"Imported Event: {tag}"
            content_parts = []
            if event.get("value"):
                content_parts.append(event["value"])
            if event.get("date"):
                content_parts.append(f"Date: {event['date']}")
            if event.get("place"):
                content_parts.append(f"Place: {event['place']}")
            if event.get("note"):
                content_parts.append(f"Note: {event['note']}")
            event_content = "\n".join(content_parts) if content_parts else f"Event: {tag}"

            lore = LoreNote(
                workspace_id=workspace_id,
                person_id=target_person_id,
                title=title,
                content=event_content,
                author_id=user_id,
                event_year=extract_year(event.get("date")),
                tags=["gedcom-import"],
            )
            db.add(lore)
            summary.lore_notes_created += 1

    # 3. Process Families / Unions
    unions_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        FamilyUnion.is_deleted.is_(False),
    )
    active_unions = list(db.scalars(unions_stmt).all())

    for fam in parsed_data.families:
        p1_id = tag_to_person_id.get(fam.husband_tag) if fam.husband_tag else None
        p2_id = tag_to_person_id.get(fam.wife_tag) if fam.wife_tag else None

        if not p1_id and not p2_id:
            continue

        existing_u = next(
            (
                u
                for u in active_unions
                if (u.partner1_id == p1_id and u.partner2_id == p2_id)
                or (u.partner1_id == p2_id and u.partner2_id == p1_id)
            ),
            None,
        )

        if existing_u:
            union = existing_u
        else:
            union = FamilyUnion(
                workspace_id=workspace_id,
                partner1_id=p1_id,
                partner2_id=p2_id,
                union_type=fam.union_type or "marriage",
                start_date=fam.marriage_date,
                notes="\n".join(fam.notes) if fam.notes else None,
            )
            db.add(union)
            db.flush()
            active_unions.append(union)
            summary.unions_created += 1

        # 4. Link Children with Cycle Prevention
        for child_tag in fam.children_tags:
            child_id = tag_to_person_id.get(child_tag)
            if not child_id:
                continue

            existing_cr = db.scalar(
                select(ChildRelationship).where(
                    ChildRelationship.workspace_id == workspace_id,
                    ChildRelationship.union_id == union.id,
                    ChildRelationship.child_id == child_id,
                    ChildRelationship.is_deleted.is_(False),
                )
            )
            if existing_cr:
                continue

            try:
                validate_no_cycle(db, workspace_id, union.id, child_id)
                cr = ChildRelationship(
                    workspace_id=workspace_id,
                    union_id=union.id,
                    child_id=child_id,
                    relationship_type="biological",
                )
                db.add(cr)
                db.flush()
                summary.children_linked += 1
            except ValueError:
                parents = [p for p in [union.partner1_id, union.partner2_id] if p is not None]
                parent_names: list[str] = []
                for pid in parents:
                    p_obj = db.get(Person, pid)
                    if p_obj:
                        parent_names.append(f"{p_obj.first_name} {p_obj.last_name}".strip())
                parent_label = " and ".join(parent_names) if parent_names else "parent"
                child_obj = db.get(Person, child_id)
                child_label = (
                    f"{child_obj.first_name} {child_obj.last_name}".strip()
                    if child_obj
                    else "child"
                )
                summary.warnings.append(
                    f"Skipped parent-child link between {parent_label} and {child_label} to prevent cyclical ancestry"
                )

    # 5. Audit Logging
    if actor:
        record_audit_event(
            db=db,
            workspace_id=workspace_id,
            actor_id=actor.id,
            actor_name=actor.display_name,
            actor_email=actor.email,
            entity_type="Workspace",
            entity_id=workspace_id,
            action="DATA_IMPORT",
            changes={
                "filename": filename,
                "format": "gedcom",
                "summary": summary.model_dump(),
            },
        )

    db.commit()
    return summary


def export_json_backup(db: Session, workspace_id: uuid.UUID) -> dict[str, Any]:
    """
    Exports full workspace structure (metadata, people, unions, children, lore notes)
    into a standardized JSON-compatible dictionary.
    """
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError("Workspace not found")

    people = list(
        db.scalars(
            select(Person)
            .where(Person.workspace_id == workspace_id, Person.is_deleted.is_(False))
            .order_by(Person.created_at.asc(), Person.id.asc())
        ).all()
    )

    unions = list(
        db.scalars(
            select(FamilyUnion)
            .where(FamilyUnion.workspace_id == workspace_id, FamilyUnion.is_deleted.is_(False))
            .order_by(FamilyUnion.created_at.asc(), FamilyUnion.id.asc())
        ).all()
    )

    children = list(
        db.scalars(
            select(ChildRelationship)
            .where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.is_deleted.is_(False),
            )
            .order_by(ChildRelationship.created_at.asc(), ChildRelationship.id.asc())
        ).all()
    )

    lore_notes = list(
        db.scalars(
            select(LoreNote)
            .where(LoreNote.workspace_id == workspace_id, LoreNote.is_deleted.is_(False))
            .order_by(LoreNote.created_at.asc(), LoreNote.id.asc())
        ).all()
    )

    return {
        "version": "1.0",
        "format": "lores_backup",
        "exported_at": datetime.now(UTC).isoformat(),
        "workspace": {
            "id": str(workspace.id),
            "name": workspace.name,
            "description": workspace.description,
        },
        "people": [
            {
                "id": str(p.id),
                "first_name": p.first_name,
                "last_name": p.last_name,
                "maiden_name": p.maiden_name,
                "gender": p.gender,
                "is_living": p.is_living,
                "birth_date": p.birth_date,
                "birth_date_qualifier": p.birth_date_qualifier,
                "birth_place": p.birth_place,
                "death_date": p.death_date,
                "death_date_qualifier": p.death_date_qualifier,
                "death_place": p.death_place,
                "biography": p.biography,
                "avatar_url": p.avatar_url,
            }
            for p in people
        ],
        "unions": [
            {
                "id": str(u.id),
                "partner1_id": str(u.partner1_id) if u.partner1_id else None,
                "partner2_id": str(u.partner2_id) if u.partner2_id else None,
                "union_type": u.union_type,
                "is_current": u.is_current,
                "start_date": u.start_date,
                "end_date": u.end_date,
                "notes": u.notes,
            }
            for u in unions
        ],
        "children": [
            {
                "id": str(c.id),
                "union_id": str(c.union_id),
                "child_id": str(c.child_id),
                "relationship_type": c.relationship_type,
            }
            for c in children
        ],
        "lore_notes": [
            {
                "id": str(n.id),
                "person_id": str(n.person_id),
                "title": n.title,
                "content": n.content,
                "event_year": n.event_year,
                "tags": n.tags,
            }
            for n in lore_notes
        ],
    }


def import_json_to_workspace(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    data: dict[str, Any],
) -> ImportSummaryRead:
    """
    Restores or imports JSON backup structure into the workspace with deduplication,
    relationship remapping, cycle validation, and audit logging.
    """
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise ValueError("Workspace not found")

    actor = db.get(User, user_id)
    summary = ImportSummaryRead(filename=filename, format="json")

    # 1. Fetch active people in workspace
    people_stmt = select(Person).where(
        Person.workspace_id == workspace_id,
        Person.is_deleted.is_(False),
    )
    active_people = list(db.scalars(people_stmt).all())

    id_map: dict[str, uuid.UUID] = {}

    # 2. Ingest People
    for p_dict in data.get("people", []):
        first_name = p_dict.get("first_name", "")
        last_name = p_dict.get("last_name", "")
        birth_date = p_dict.get("birth_date")

        matched = next(
            (p for p in active_people if is_person_match(p, first_name, last_name, birth_date)),
            None,
        )

        if matched:
            enrich_person(
                existing=matched,
                maiden_name=p_dict.get("maiden_name"),
                gender=p_dict.get("gender"),
                is_living=p_dict.get("is_living"),
                birth_date=p_dict.get("birth_date"),
                birth_date_qualifier=p_dict.get("birth_date_qualifier"),
                birth_place=p_dict.get("birth_place"),
                death_date=p_dict.get("death_date"),
                death_date_qualifier=p_dict.get("death_date_qualifier"),
                death_place=p_dict.get("death_place"),
                biography=p_dict.get("biography"),
                avatar_url=p_dict.get("avatar_url"),
            )
            resolved_id = matched.id
            summary.people_merged += 1
        else:
            new_p = Person(
                workspace_id=workspace_id,
                first_name=first_name,
                last_name=last_name,
                maiden_name=p_dict.get("maiden_name"),
                gender=p_dict.get("gender", "unknown"),
                is_living=p_dict.get("is_living", True),
                birth_date=birth_date,
                birth_date_qualifier=p_dict.get("birth_date_qualifier", "exact"),
                birth_place=p_dict.get("birth_place"),
                death_date=p_dict.get("death_date"),
                death_date_qualifier=p_dict.get("death_date_qualifier", "exact"),
                death_place=p_dict.get("death_place"),
                biography=p_dict.get("biography"),
                avatar_url=p_dict.get("avatar_url"),
            )
            db.add(new_p)
            db.flush()
            active_people.append(new_p)
            resolved_id = new_p.id
            summary.people_created += 1

        orig_id = str(p_dict.get("id"))
        id_map[orig_id] = resolved_id

    # 3. Ingest Unions
    unions_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        FamilyUnion.is_deleted.is_(False),
    )
    active_unions = list(db.scalars(unions_stmt).all())
    union_id_map: dict[str, uuid.UUID] = {}

    for u_dict in data.get("unions", []):
        p1_raw = u_dict.get("partner1_id")
        p2_raw = u_dict.get("partner2_id")
        p1_id = id_map.get(str(p1_raw)) if p1_raw else None
        p2_id = id_map.get(str(p2_raw)) if p2_raw else None

        if not p1_id and not p2_id:
            continue

        existing_u = next(
            (
                u
                for u in active_unions
                if (u.partner1_id == p1_id and u.partner2_id == p2_id)
                or (u.partner1_id == p2_id and u.partner2_id == p1_id)
            ),
            None,
        )

        if existing_u:
            union = existing_u
        else:
            union = FamilyUnion(
                workspace_id=workspace_id,
                partner1_id=p1_id,
                partner2_id=p2_id,
                union_type=u_dict.get("union_type", "marriage"),
                is_current=u_dict.get("is_current", True),
                start_date=u_dict.get("start_date"),
                end_date=u_dict.get("end_date"),
                notes=u_dict.get("notes"),
            )
            db.add(union)
            db.flush()
            active_unions.append(union)
            summary.unions_created += 1

        orig_u_id = str(u_dict.get("id"))
        union_id_map[orig_u_id] = union.id

    # 4. Ingest Children
    for c_dict in data.get("children", []):
        u_id = union_id_map.get(str(c_dict.get("union_id")))
        c_id = id_map.get(str(c_dict.get("child_id")))

        if not u_id or not c_id:
            continue

        existing_cr = db.scalar(
            select(ChildRelationship).where(
                ChildRelationship.workspace_id == workspace_id,
                ChildRelationship.union_id == u_id,
                ChildRelationship.child_id == c_id,
                ChildRelationship.is_deleted.is_(False),
            )
        )
        if existing_cr:
            continue

        try:
            validate_no_cycle(db, workspace_id, u_id, c_id)
            cr = ChildRelationship(
                workspace_id=workspace_id,
                union_id=u_id,
                child_id=c_id,
                relationship_type=c_dict.get("relationship_type", "biological"),
            )
            db.add(cr)
            db.flush()
            summary.children_linked += 1
        except ValueError:
            target_u = db.get(FamilyUnion, u_id)
            parents = (
                [p for p in [target_u.partner1_id, target_u.partner2_id] if p is not None]
                if target_u
                else []
            )
            parent_names: list[str] = []
            for pid in parents:
                p_obj = db.get(Person, pid)
                if p_obj:
                    parent_names.append(f"{p_obj.first_name} {p_obj.last_name}".strip())
            parent_label = " and ".join(parent_names) if parent_names else "parent"
            child_obj = db.get(Person, c_id)
            child_label = (
                f"{child_obj.first_name} {child_obj.last_name}".strip() if child_obj else "child"
            )
            summary.warnings.append(
                f"Skipped parent-child link between {parent_label} and {child_label} to prevent cyclical ancestry"
            )

    # 5. Ingest LoreNotes
    for n_dict in data.get("lore_notes", []):
        p_id = id_map.get(str(n_dict.get("person_id")))
        if not p_id:
            continue

        lore = LoreNote(
            workspace_id=workspace_id,
            person_id=p_id,
            title=n_dict.get("title", "Imported Note"),
            content=n_dict.get("content", ""),
            author_id=user_id,
            event_year=n_dict.get("event_year"),
            tags=n_dict.get("tags", ["json-import"]),
        )
        db.add(lore)
        summary.lore_notes_created += 1

    # 6. Audit Logging
    if actor:
        record_audit_event(
            db=db,
            workspace_id=workspace_id,
            actor_id=actor.id,
            actor_name=actor.display_name,
            actor_email=actor.email,
            entity_type="Workspace",
            entity_id=workspace_id,
            action="DATA_IMPORT",
            changes={
                "filename": filename,
                "format": "json",
                "summary": summary.model_dump(),
            },
        )

    db.commit()
    return summary
