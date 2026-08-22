from pydantic import BaseModel, ConfigDict


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
