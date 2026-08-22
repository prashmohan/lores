from fastapi import APIRouter

from app.api.v1 import audit_trash, auth, lore, people, tree, workspaces

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(tree.router, prefix="/workspaces/{workspace_id}/tree", tags=["tree"])
api_router.include_router(people.router, prefix="/workspaces/{workspace_id}/people", tags=["people"])
api_router.include_router(lore.router, prefix="/workspaces/{workspace_id}/lore", tags=["lore"])
api_router.include_router(
    audit_trash.router, prefix="/workspaces/{workspace_id}", tags=["audit-trash"]
)
