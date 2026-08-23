import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.models.person import Person
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.auth_service import create_access_token


@pytest.fixture
def admin_setup(db_session: Session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    superadmin = User(
        email="superadmin@example.com",
        display_name="Global SuperAdmin",
        is_superadmin=True,
    )
    regular_user = User(
        email="regular@example.com",
        display_name="Regular User",
        is_superadmin=False,
    )
    ws_admin = User(
        email="ws_admin@example.com",
        display_name="Tree Admin",
        is_superadmin=False,
    )
    db_session.add_all([superadmin, regular_user, ws_admin])
    db_session.flush()

    ws = Workspace(
        name="Admin Test Tree",
        slug=f"admin-tree-{uuid.uuid4().hex[:8]}",
        created_by_user_id=ws_admin.id,
    )
    db_session.add(ws)
    db_session.flush()

    member = WorkspaceMember(
        workspace_id=ws.id,
        user_id=ws_admin.id,
        role="admin",
    )
    db_session.add(member)

    p1 = Person(workspace_id=ws.id, first_name="Margaret", last_name="Miller", gender="female")
    db_session.add(p1)
    db_session.commit()

    yield {
        "superadmin": superadmin,
        "regular_user": regular_user,
        "ws_admin": ws_admin,
        "workspace": ws,
    }

    app.dependency_overrides.clear()


def test_admin_endpoints_require_superadmin(admin_setup):
    client = TestClient(app)
    regular_token = create_access_token({"sub": str(admin_setup["regular_user"].id)})

    # Workspaces list
    resp = client.get(
        "/api/v1/admin/workspaces",
        headers={"Authorization": f"Bearer {regular_token}"},
    )
    assert resp.status_code == 403

    # Stats
    resp = client.get(
        "/api/v1/admin/stats",
        headers={"Authorization": f"Bearer {regular_token}"},
    )
    assert resp.status_code == 403


def test_admin_workspaces_and_stats_success(admin_setup):
    client = TestClient(app)
    super_token = create_access_token({"sub": str(admin_setup["superadmin"].id)})

    # Get workspaces
    resp = client.get(
        "/api/v1/admin/workspaces",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert resp.status_code == 200
    workspaces = resp.json()
    assert len(workspaces) >= 1
    target_ws = next((w for w in workspaces if w["id"] == str(admin_setup["workspace"].id)), None)
    assert target_ws is not None
    assert target_ws["name"] == "Admin Test Tree"
    assert target_ws["member_count"] >= 1
    assert target_ws["people_count"] >= 1
    assert any(a["email"] == "ws_admin@example.com" for a in target_ws["admins"])

    # Get stats
    resp_stats = client.get(
        "/api/v1/admin/stats",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert resp_stats.status_code == 200
    stats = resp_stats.json()
    assert stats["total_workspaces"] >= 1
    assert stats["total_users"] >= 3
    assert stats["total_people"] >= 1
