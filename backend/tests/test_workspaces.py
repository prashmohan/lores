import uuid
from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, slugify
from app.schemas.workspace import (
    MapLayoutRead,
    MapLayoutUpdate,
    MapNodePosition,
    UserWorkspaceMembership,
    WorkspaceCreate,
    WorkspaceMemberCreate,
    WorkspaceMemberRead,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceUpdate,
)
from app.services.workspace_service import (
    ROLE_HIERARCHY,
    add_or_update_member,
    create_workspace,
    get_user_role_in_workspace,
    get_workspace_by_id,
    get_workspace_by_slug,
    has_sufficient_permission,
    list_user_workspaces,
    list_workspace_members,
    remove_member,
)

_ = models


@pytest.fixture(name="client")
def fixture_client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


captured_otps: dict[str, str] = {}


@pytest.fixture(autouse=True)
def capture_emails(monkeypatch):
    captured_otps.clear()

    def fake_send_otp_email(to_email: str, otp_code: str) -> bool:
        captured_otps[to_email.lower().strip()] = otp_code
        return True

    monkeypatch.setattr("app.services.email_service.send_otp_email", fake_send_otp_email)


def helper_login(client: TestClient, email: str, display_name: str | None = None) -> dict[str, str]:
    req_res = client.post(
        "/api/v1/auth/request-otp",
        json={"email": email, "display_name": display_name or email.split("@")[0]},
    )
    assert req_res.status_code == 200
    assert "dev_otp" not in req_res.json()
    otp = captured_otps.get(email.lower().strip())
    assert otp is not None

    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "code": otp},
    )
    assert verify_res.status_code == 200
    token = verify_res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_workspace_assigns_admin(db_session):
    user = User(email="dad@example.com", display_name="Dad")
    db_session.add(user)
    db_session.commit()

    workspace = create_workspace(db_session, name="The Miller Family", user_id=user.id)
    db_session.commit()

    assert isinstance(workspace, Workspace)
    assert workspace.name == "The Miller Family"
    assert workspace.slug.startswith("the-miller-family-")
    assert workspace.created_by_user_id == user.id
    assert workspace.created_at is not None
    assert workspace.updated_at is not None
    assert len(workspace.members) == 1
    assert isinstance(workspace.members[0], WorkspaceMember)

    role = get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=user.id)
    assert role == "admin"


def test_add_collaborator_and_viewer(db_session):
    owner = User(email="owner@example.com", display_name="Owner")
    cousin = User(email="cousin@example.com", display_name="Cousin")
    db_session.add_all([owner, cousin])
    db_session.commit()

    workspace = create_workspace(db_session, name="Smith Family", user_id=owner.id)
    db_session.commit()

    member = add_or_update_member(
        db_session,
        workspace_id=workspace.id,
        user_id=cousin.id,
        role="collaborator",
        actor_id=owner.id,
    )
    db_session.commit()

    assert member.id is not None
    assert member.role == "collaborator"
    assert member.invited_by_user_id == owner.id

    role = get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=cousin.id)
    assert role == "collaborator"


def test_update_member_role(db_session):
    owner = User(email="owner2@example.com", display_name="Owner 2")
    member_user = User(email="member2@example.com", display_name="Member 2")
    db_session.add_all([owner, member_user])
    db_session.commit()

    workspace = create_workspace(db_session, name="Jones Family", user_id=owner.id)
    db_session.commit()

    # Add as viewer
    add_or_update_member(
        db_session,
        workspace_id=workspace.id,
        user_id=member_user.id,
        role="viewer",
        actor_id=owner.id,
    )
    db_session.commit()
    assert (
        get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=member_user.id)
        == "viewer"
    )

    # Promote to collaborator
    add_or_update_member(
        db_session,
        workspace_id=workspace.id,
        user_id=member_user.id,
        role="collaborator",
        actor_id=owner.id,
    )
    db_session.commit()
    assert (
        get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=member_user.id)
        == "collaborator"
    )


def test_get_user_role_in_workspace_non_member(db_session):
    owner = User(email="owner3@example.com", display_name="Owner 3")
    stranger = User(email="stranger@example.com", display_name="Stranger")
    db_session.add_all([owner, stranger])
    db_session.commit()

    workspace = create_workspace(db_session, name="Private Family", user_id=owner.id)
    db_session.commit()

    role = get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=stranger.id)
    assert role is None


def test_has_sufficient_permission_hierarchy():
    assert ROLE_HIERARCHY["admin"] > ROLE_HIERARCHY["collaborator"]
    assert ROLE_HIERARCHY["collaborator"] > ROLE_HIERARCHY["viewer"]

    assert has_sufficient_permission("admin", "admin") is True
    assert has_sufficient_permission("admin", "collaborator") is True
    assert has_sufficient_permission("admin", "viewer") is True

    assert has_sufficient_permission("collaborator", "admin") is False
    assert has_sufficient_permission("collaborator", "collaborator") is True
    assert has_sufficient_permission("collaborator", "viewer") is True

    assert has_sufficient_permission("viewer", "admin") is False
    assert has_sufficient_permission("viewer", "collaborator") is False
    assert has_sufficient_permission("viewer", "viewer") is True

    assert has_sufficient_permission("superadmin", "admin") is True
    assert has_sufficient_permission(None, "viewer") is False
    assert has_sufficient_permission("unknown_role", "viewer") is False


def test_slugify_helper():
    assert slugify("The Miller Family") == "the-miller-family"
    assert slugify("  O'Connor - Family & Friends!  ") == "oconnor-family-friends"
    assert slugify("Tree #1 / 2026") == "tree-1-2026"
    assert slugify("   ") == ""


def test_unique_slug_generation(db_session):
    user = User(email="tree_builder@example.com", display_name="Tree Builder")
    db_session.add(user)
    db_session.commit()

    ws1 = create_workspace(db_session, name="Family Tree", user_id=user.id)
    ws2 = create_workspace(db_session, name="Family Tree", user_id=user.id)
    db_session.commit()

    assert ws1.slug != ws2.slug
    assert ws1.slug.startswith("family-tree-")
    assert ws2.slug.startswith("family-tree-")


def test_get_workspace_by_id_and_slug(db_session):
    user = User(email="finder@example.com", display_name="Finder")
    db_session.add(user)
    db_session.commit()

    ws = create_workspace(
        db_session, name="Lookup Tree", user_id=user.id, description="A tree for lookup"
    )
    db_session.commit()

    by_id = get_workspace_by_id(db_session, ws.id)
    assert by_id is not None
    assert by_id.name == "Lookup Tree"
    assert by_id.description == "A tree for lookup"

    by_slug = get_workspace_by_slug(db_session, ws.slug)
    assert by_slug is not None
    assert by_slug.id == ws.id

    assert get_workspace_by_id(db_session, uuid.uuid4()) is None
    assert get_workspace_by_slug(db_session, "non-existent-slug") is None


def test_list_user_workspaces_and_members(db_session):
    user1 = User(email="user1@example.com", display_name="User 1")
    user2 = User(email="user2@example.com", display_name="User 2")
    db_session.add_all([user1, user2])
    db_session.commit()

    ws1 = create_workspace(db_session, name="Alpha Tree", user_id=user1.id)
    ws2 = create_workspace(db_session, name="Beta Tree", user_id=user2.id)
    db_session.commit()

    # Add user1 as collaborator to Beta Tree
    add_or_update_member(
        db_session,
        workspace_id=ws2.id,
        user_id=user1.id,
        role="collaborator",
        actor_id=user2.id,
    )
    db_session.commit()

    user1_workspaces = list_user_workspaces(db_session, user1.id)
    assert len(user1_workspaces) == 2
    roles_map = {ws.id: role for ws, role in user1_workspaces}
    assert roles_map[ws1.id] == "admin"
    assert roles_map[ws2.id] == "collaborator"

    ws2_members = list_workspace_members(db_session, ws2.id)
    assert len(ws2_members) == 2
    member_user_ids = {m.user_id for m in ws2_members}
    assert user1.id in member_user_ids
    assert user2.id in member_user_ids


def test_remove_member(db_session):
    admin = User(email="admin_rm@example.com", display_name="Admin")
    member = User(email="member_rm@example.com", display_name="Member")
    db_session.add_all([admin, member])
    db_session.commit()

    ws = create_workspace(db_session, name="Remove Member Tree", user_id=admin.id)
    db_session.commit()

    add_or_update_member(
        db_session,
        workspace_id=ws.id,
        user_id=member.id,
        role="viewer",
        actor_id=admin.id,
    )
    db_session.commit()

    assert get_user_role_in_workspace(db_session, workspace_id=ws.id, user_id=member.id) == "viewer"

    removed = remove_member(db_session, workspace_id=ws.id, user_id=member.id)
    db_session.commit()
    assert removed is True
    assert get_user_role_in_workspace(db_session, workspace_id=ws.id, user_id=member.id) is None

    # Removing non-member returns False
    assert remove_member(db_session, workspace_id=ws.id, user_id=member.id) is False


def test_workspace_cascade_delete_members(db_session):
    admin = User(email="admin_cas@example.com", display_name="Admin Cas")
    db_session.add(admin)
    db_session.commit()

    ws = create_workspace(db_session, name="Cascade Tree", user_id=admin.id)
    db_session.commit()

    ws_id = ws.id
    db_session.delete(ws)
    db_session.commit()

    members = list_workspace_members(db_session, ws_id)
    assert len(members) == 0


def test_invalid_role_raises_error(db_session):
    user = User(email="invalid_role@example.com", display_name="User")
    db_session.add(user)
    db_session.commit()

    ws = create_workspace(db_session, name="Role Test Tree", user_id=user.id)
    db_session.commit()

    with pytest.raises(ValueError, match="Invalid.*role"):
        add_or_update_member(
            db_session,
            workspace_id=ws.id,
            user_id=user.id,
            role="non_existent_role",
            actor_id=user.id,
        )


def test_empty_workspace_name_raises_error(db_session):
    user = User(email="empty_name@example.com", display_name="User")
    db_session.add(user)
    db_session.commit()

    with pytest.raises(ValueError, match="Workspace name cannot be empty"):
        create_workspace(db_session, name="   ", user_id=user.id)


def test_workspace_schemas():
    create_req = WorkspaceCreate(name="My Family", description="A wonderful family")
    assert create_req.name == "My Family"
    assert create_req.description == "A wonderful family"

    update_req = WorkspaceUpdate(name="Renamed Family")
    assert update_req.name == "Renamed Family"
    assert update_req.description is None

    ws_id = uuid.uuid4()
    user_id = uuid.uuid4()
    now = datetime.now(UTC)

    read_data = {
        "id": ws_id,
        "name": "My Family",
        "slug": "my-family-123456",
        "description": "Desc",
        "created_by_user_id": user_id,
        "created_at": now,
        "updated_at": now,
    }
    ws_read = WorkspaceRead.model_validate(read_data)
    assert ws_read.id == ws_id
    assert ws_read.slug == "my-family-123456"

    member_create = WorkspaceMemberCreate(email="relative@example.com", role="collaborator")
    assert member_create.email == "relative@example.com"
    assert member_create.role == "collaborator"

    member_update = WorkspaceMemberUpdate(role="admin")
    assert member_update.role == "admin"

    member_data = {
        "id": uuid.uuid4(),
        "workspace_id": ws_id,
        "user_id": user_id,
        "role": "admin",
        "invited_by_user_id": None,
        "joined_at": now,
    }
    member_read = WorkspaceMemberRead.model_validate(member_data)
    assert member_read.role == "admin"

    membership = UserWorkspaceMembership(workspace=ws_read, role="admin")
    assert membership.role == "admin"
    assert membership.workspace.name == "My Family"


def test_cannot_assign_superadmin_role_to_workspace_member(db_session):
    user = User(email="super_attempt@example.com", display_name="User")
    db_session.add(user)
    db_session.commit()

    ws = create_workspace(db_session, name="Escalation Test", user_id=user.id)
    db_session.commit()

    with pytest.raises(ValueError, match="Invalid.*role"):
        add_or_update_member(
            db_session,
            workspace_id=ws.id,
            user_id=user.id,
            role="superadmin",
            actor_id=user.id,
        )


def test_sole_admin_cannot_be_removed_or_demoted(db_session):
    admin = User(email="only_admin@example.com", display_name="Sole Admin")
    db_session.add(admin)
    db_session.commit()

    ws = create_workspace(db_session, name="Solo Admin Tree", user_id=admin.id)
    db_session.commit()

    # 1. Demoting sole admin to viewer must fail
    with pytest.raises(ValueError, match="Cannot demote the sole administrator"):
        add_or_update_member(
            db_session,
            workspace_id=ws.id,
            user_id=admin.id,
            role="viewer",
            actor_id=admin.id,
        )

    # 2. Removing sole admin must fail
    with pytest.raises(ValueError, match="Cannot remove the sole administrator"):
        remove_member(db_session, workspace_id=ws.id, user_id=admin.id)

    # 3. Add second admin -> removal of first admin now succeeds
    admin2 = User(email="admin2@example.com", display_name="Admin Two")
    db_session.add(admin2)
    db_session.commit()

    add_or_update_member(
        db_session,
        workspace_id=ws.id,
        user_id=admin2.id,
        role="admin",
        actor_id=admin.id,
    )
    db_session.commit()

    assert remove_member(db_session, workspace_id=ws.id, user_id=admin.id) is True


def test_map_layout_schemas():
    pos = MapNodePosition(x=120.5, y=340.0)
    assert pos.x == 120.5
    assert pos.y == 340.0

    read = MapLayoutRead(positions={"node-1": pos})
    assert "node-1" in read.positions
    assert read.positions["node-1"].x == 120.5
    assert read.positions["node-1"].y == 340.0

    empty_read = MapLayoutRead()
    assert empty_read.positions == {}

    update = MapLayoutUpdate(positions={"node-1": pos})
    assert update.positions["node-1"].y == 340.0


def test_workspace_model_map_layout_field(db_session):
    user = User(email="layout_model@example.com", display_name="Layout Model User")
    db_session.add(user)
    db_session.commit()

    ws = create_workspace(db_session, name="Layout Model Tree", user_id=user.id)
    db_session.commit()

    assert ws.map_layout == {} or ws.map_layout is None

    ws.map_layout = {"person-abc": {"x": 50.0, "y": 150.0}}
    db_session.commit()
    db_session.refresh(ws)

    assert ws.map_layout == {"person-abc": {"x": 50.0, "y": 150.0}}


def test_map_layout_api_lifecycle_and_rbac(client: TestClient) -> None:
    admin_headers = helper_login(client, "layout_admin@example.com", "Layout Admin")
    collab_headers = helper_login(client, "layout_collab@example.com", "Layout Collab")
    viewer_headers = helper_login(client, "layout_viewer@example.com", "Layout Viewer")

    # 1. Admin creates workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "Layout Workspace", "description": "Testing map layout"},
    )
    assert ws_resp.status_code == 200
    ws_id = ws_resp.json()["id"]

    # 2. Add collaborator and viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "layout_collab@example.com", "role": "collaborator"},
    )
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "layout_viewer@example.com", "role": "viewer"},
    )

    # 3. GET returns empty dict when no layout saved (for admin, collab, viewer)
    get_empty_admin = client.get(f"/api/v1/workspaces/{ws_id}/map-layout", headers=admin_headers)
    assert get_empty_admin.status_code == 200
    assert get_empty_admin.json() == {"positions": {}}

    get_empty_viewer = client.get(f"/api/v1/workspaces/{ws_id}/map-layout", headers=viewer_headers)
    assert get_empty_viewer.status_code == 200
    assert get_empty_viewer.json() == {"positions": {}}

    # 4. Viewer receives 403 on PUT and DELETE
    put_payload = {
        "positions": {
            "person-1": {"x": 100.0, "y": 200.0},
            "union-1": {"x": 300.5, "y": 400.25},
        }
    }
    viewer_put = client.put(
        f"/api/v1/workspaces/{ws_id}/map-layout",
        headers=viewer_headers,
        json=put_payload,
    )
    assert viewer_put.status_code == 403

    viewer_del = client.delete(
        f"/api/v1/workspaces/{ws_id}/map-layout",
        headers=viewer_headers,
    )
    assert viewer_del.status_code == 403

    # 5. Collaborator PUT saves node coordinates and returns them
    collab_put = client.put(
        f"/api/v1/workspaces/{ws_id}/map-layout",
        headers=collab_headers,
        json=put_payload,
    )
    assert collab_put.status_code == 200
    saved_data = collab_put.json()
    assert "positions" in saved_data
    assert saved_data["positions"]["person-1"] == {"x": 100.0, "y": 200.0}
    assert saved_data["positions"]["union-1"] == {"x": 300.5, "y": 400.25}

    # 6. GET returns saved coordinates for viewer
    viewer_get_saved = client.get(f"/api/v1/workspaces/{ws_id}/map-layout", headers=viewer_headers)
    assert viewer_get_saved.status_code == 200
    assert viewer_get_saved.json()["positions"]["person-1"] == {"x": 100.0, "y": 200.0}
    assert viewer_get_saved.json()["positions"]["union-1"] == {"x": 300.5, "y": 400.25}

    # 7. Collaborator DELETE clears coordinates
    collab_del = client.delete(
        f"/api/v1/workspaces/{ws_id}/map-layout",
        headers=collab_headers,
    )
    assert collab_del.status_code == 200
    assert collab_del.json() == {"message": "Map layout reset to default"}

    # 8. GET after DELETE returns empty dict
    get_after_del = client.get(f"/api/v1/workspaces/{ws_id}/map-layout", headers=viewer_headers)
    assert get_after_del.status_code == 200
    assert get_after_del.json() == {"positions": {}}
