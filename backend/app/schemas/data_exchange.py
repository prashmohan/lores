from pydantic import BaseModel, ConfigDict, Field


class ImportSummaryRead(BaseModel):
    success: bool = True
    filename: str
    format: str  # "gedcom" or "json"
    people_created: int = 0
    people_merged: int = 0
    unions_created: int = 0
    children_linked: int = 0
    lore_notes_created: int = 0
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
