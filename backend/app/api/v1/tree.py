import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_workspace_role, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.person import PersonRead
from app.schemas.tree import (
    AddRelativeRequest,
    FocusNeighborhoodResponse,
    RemoveRelationshipRequest,
    TreeOverviewResponse,
)
from app.services import person_service, tree_service

router = APIRouter()


@router.get("/overview", response_model=TreeOverviewResponse)
def get_tree_overview(
    workspace_id: uuid.UUID,
    role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    return tree_service.get_tree_overview(db, workspace_id=workspace_id, viewer_role=role)


@router.get("/focus/{person_id}", response_model=FocusNeighborhoodResponse)
def get_focus_neighborhood(
    workspace_id: uuid.UUID,
    person_id: uuid.UUID,
    role: str = Depends(get_workspace_role),
    db: Session = Depends(get_db),
) -> Any:
    try:
        neighborhood = tree_service.get_focus_neighborhood(
            db, workspace_id=workspace_id, person_id=person_id, viewer_role=role
        )
        return neighborhood
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/add-relative", response_model=PersonRead)
def add_relative(
    workspace_id: uuid.UUID,
    req: AddRelativeRequest,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    try:
        new_person = person_service.add_relative_atomic(
            db,
            workspace_id=workspace_id,
            relative_type=req.relative_type,
            base_person_id=req.base_person_id,
            person_data=req.person_payload,
            existing_person_id=req.existing_person_id,
            other_parent_id=req.other_parent_id,
            actor=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    db.commit()
    db.refresh(new_person)
    return new_person


@router.post("/remove-relationship")
def remove_relationship(
    workspace_id: uuid.UUID,
    req: RemoveRelationshipRequest,
    _role: str = Depends(require_role("collaborator")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    try:
        result = person_service.remove_relationship_atomic(
            db,
            workspace_id=workspace_id,
            base_person_id=req.base_person_id,
            target_person_id=req.target_person_id,
            relationship_type=req.relationship_type,
            actor=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    db.commit()
    return result
