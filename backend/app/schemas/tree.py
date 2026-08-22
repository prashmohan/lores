import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.person import PersonCreate


class PersonSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    maiden_name: str | None = None
    gender: str
    is_living: bool
    birth_date: str | None = None
    birth_place: str | None = None
    death_date: str | None = None
    death_place: str | None = None
    avatar_url: str | None = None
    relationship_label: str | None = None


class FocusNeighborhoodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    focus_person: PersonSummary
    parents: list[PersonSummary]
    partners: list[PersonSummary]
    children: list[PersonSummary]
    siblings: list[PersonSummary]


class AddRelativeRequest(BaseModel):
    relative_type: str
    base_person_id: uuid.UUID
    existing_person_id: uuid.UUID | None = None
    other_parent_id: uuid.UUID | None = None
    person: PersonCreate | None = None
    person_data: PersonCreate | None = None

    model_config = ConfigDict(populate_by_name=True)

    @property
    def person_payload(self) -> PersonCreate | None:
        return self.person or self.person_data
