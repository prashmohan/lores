import json
import re
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.data_exchange import ImportSummaryRead
from app.services import data_exchange_service, gedcom_service

router = APIRouter()


def _sanitize_filename(name: str) -> str:
    """Sanitizes workspace name for safe use in Content-Disposition filename header."""
    cleaned = re.sub(r"[^\w\-_.]+", "_", name.strip())
    return cleaned.strip("_") or "export"


@router.get("/{workspace_id}/export/gedcom")
def export_gedcom(
    workspace_id: uuid.UUID,
    _role: str = Depends(require_role("admin")),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Exports entire workspace family tree as a standard GEDCOM 7.0 file."""
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    gedcom_str = gedcom_service.generate_gedcom(db, workspace_id, workspace.name)
    filename = f"{_sanitize_filename(workspace.name)}.ged"
    return Response(
        content=gedcom_str,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{workspace_id}/export/json")
def export_json(
    workspace_id: uuid.UUID,
    _role: str = Depends(require_role("admin")),
    _current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Exports entire workspace family tree, lore notes, and metadata as a JSON backup."""
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    backup_data = data_exchange_service.export_json_backup(db, workspace_id)
    filename = f"{_sanitize_filename(workspace.name)}.json"
    json_str = json.dumps(backup_data, indent=2)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{workspace_id}/import/gedcom", response_model=ImportSummaryRead)
async def import_gedcom(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    _role: str = Depends(require_role("admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportSummaryRead:
    """Imports GEDCOM file into workspace with deduplication, ancestry validation, and audit logging."""
    if not file or not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file uploaded")

    try:
        raw_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read file: {e}"
        ) from e

    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            content = raw_bytes.decode("latin-1")
        except UnicodeDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to decode file: {e}"
            ) from e

    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )

    try:
        summary = data_exchange_service.import_gedcom_to_workspace(
            db=db,
            workspace_id=workspace_id,
            user_id=current_user.id,
            filename=file.filename,
            content=content,
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid GEDCOM file: {e}"
        ) from e


@router.post("/{workspace_id}/import/json", response_model=ImportSummaryRead)
async def import_json(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    _role: str = Depends(require_role("admin")),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportSummaryRead:
    """Restores or imports JSON backup structure into the workspace."""
    if not file or not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file uploaded")

    try:
        raw_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read file: {e}"
        ) from e

    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to decode file: {e}"
        ) from e

    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )

    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON file: root element must be an object",
            )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON file: {e}"
        ) from e

    try:
        summary = data_exchange_service.import_json_to_workspace(
            db=db,
            workspace_id=workspace_id,
            user_id=current_user.id,
            filename=file.filename,
            data=data,
        )
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid backup data: {e}"
        ) from e
