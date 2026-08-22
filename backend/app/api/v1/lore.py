import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_workspace_role, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.lore import LoreNoteCreate, LoreNoteRead, LoreNoteUpdate
from app.services import lore_service

router = APIRouter()


@router.post("", response_model=LoreNoteRead)
@router.post("/", response_model=LoreNoteRead, include_in_schema=False)
def create_lore(
    workspace_id: uuid.UUID,
    req: LoreNoteCreate,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    if not req.person_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="person_id is required to create a lore note",
        )
    try:
        lore = lore_service.create_lore(
            db,
            workspace_id=workspace_id,
            person_id=req.person_id,
            title=req.title,
            content=req.content,
            actor=current_user,
            event_year=req.event_year,
            tags=req.tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    db.refresh(lore)
    return lore


@router.get("/person/{person_id}", response_model=list[LoreNoteRead])
def get_lore_for_person(
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    return lore_service.get_lore_for_person(db, workspace_id=workspace_id, person_id=person_id)


@router.get("/{lore_id}", response_model=LoreNoteRead)
def get_lore(
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    lore = lore_service.get_lore_by_id(db, workspace_id=workspace_id, lore_id=lore_id)
    if not lore:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lore note not found")
    return lore


@router.patch("/{lore_id}", response_model=LoreNoteRead)
def update_lore(
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    req: LoreNoteUpdate,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    try:
        lore = lore_service.update_lore(
            db,
            workspace_id=workspace_id,
            lore_id=lore_id,
            updates=req.model_dump(exclude_unset=True),
            actor=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    db.refresh(lore)
    return lore


@router.delete("/{lore_id}")
def delete_lore(
    workspace_id: uuid.UUID,
    lore_id: uuid.UUID,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        lore_service.soft_delete_lore(
            db, workspace_id=workspace_id, lore_id=lore_id, actor=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    return {"message": "Lore note deleted successfully"}
