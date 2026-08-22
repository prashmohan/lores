import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_workspace_role, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.person import PersonCreate, PersonRead, PersonUpdate
from app.services import lore_service, person_service
from app.services.person_service import ConcurrencyConflictError

router = APIRouter()


@router.get("", response_model=list[PersonRead])
@router.get("/", response_model=list[PersonRead], include_in_schema=False)
def list_people(
    workspace_id: uuid.UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    q: str | None = Query(None),
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    return person_service.list_people(
        db, workspace_id=workspace_id, skip=skip, limit=limit, query=q
    )


@router.post("", response_model=PersonRead)
@router.post("/", response_model=PersonRead, include_in_schema=False)
def create_person(
    workspace_id: uuid.UUID,
    req: PersonCreate,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    person = person_service.create_person(
        db, workspace_id=workspace_id, person_data=req, actor=current_user
    )
    db.commit()
    db.refresh(person)
    return person


@router.get("/{person_id}", response_model=PersonRead)
def get_person(
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    _role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    person = person_service.get_person_by_id(db, workspace_id=workspace_id, person_id=person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    return person


@router.patch("/{person_id}", response_model=PersonRead)
def update_person(
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    req: PersonUpdate,
    if_unmodified_since: str | None = Header(None, alias="If-Unmodified-Since"),
    expected_updated_at: str | None = Query(None),
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    expected_ts = expected_updated_at or if_unmodified_since
    try:
        person = person_service.update_person_optimistic(
            db,
            workspace_id=workspace_id,
            person_id=person_id,
            updates=req,
            expected_updated_at=expected_ts,
            actor=current_user,
        )
    except ConcurrencyConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": str(e), **e.details},
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}")
def delete_person(
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    try:
        lore_service.soft_delete_person(
            db, workspace_id=workspace_id, person_id=person_id, actor=current_user
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    db.commit()
    return {"message": "Person deleted successfully"}
