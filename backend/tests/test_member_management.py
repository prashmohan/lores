from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.db.base import Base
from app.db.session import get_db
from app.main import app

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
captured_invitations: list[dict[str, str]] = []


@pytest.fixture(autouse=True)
def capture_emails(monkeypatch):
    captured_otps.clear()
    captured_invitations.clear()

    def fake_send_otp_email(to_email: str, otp_code: str) -> bool:
        captured_otps[to_email.lower().strip()] = otp_code
        return True

    def fake_send_invitation_email(
        to_email: str, inviter_name: str, workspace_name: str, role: str
    ) -> bool:
        captured_invitations.append(
            {
                "to_email": to_email,
                "inviter_name": inviter_name,
                "workspace_name": workspace_name,
                "role": role,
            }
        )
        return True

    monkeypatch.setattr("app.services.email_service.send_otp_email", fake_send_otp_email)
    monkeypatch.setattr(
        "app.services.email_service.send_invitation_email", fake_send_invitation_email
    )


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


def test_creator_automatically_admin_and_can_invite_members(client: TestClient) -> None:
    admin_headers = helper_login(client, "admin@example.com", "Admin User")

    # 1. Admin creates a family workspace
    resp = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "The Miller Family Tree", "description": "Our lineage"},
    )
    assert resp.status_code == 200
    ws_id = resp.json()["id"]

    # Verify creator is admin
    members_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
    )
    assert members_resp.status_code == 200
    members = members_resp.json()
    assert len(members) == 1
    assert members[0]["email"] == "admin@example.com"
    assert members[0]["role"] == "admin"

    # 2. Admin invites a collaborator
    invite_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "collab@example.com", "role": "collaborator"},
    )
    assert invite_resp.status_code == 200
    invite_data = invite_resp.json()
    assert invite_data["email"] == "collab@example.com"
    assert invite_data["role"] == "collaborator"

    # 3. Admin invites a viewer
    viewer_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "viewer@example.com", "role": "viewer"},
    )
    assert viewer_resp.status_code == 200
    assert viewer_resp.json()["role"] == "viewer"

    # Verify all 3 members listed
    list_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
    )
    assert len(list_resp.json()) == 3

    # Verify invitation emails were sent to both invited members
    assert len(captured_invitations) == 2
    assert captured_invitations[0] == {
        "to_email": "collab@example.com",
        "inviter_name": "Admin User",
        "workspace_name": "The Miller Family Tree",
        "role": "collaborator",
    }
    assert captured_invitations[1] == {
        "to_email": "viewer@example.com",
        "inviter_name": "Admin User",
        "workspace_name": "The Miller Family Tree",
        "role": "viewer",
    }


def test_collaborator_can_edit_tree_but_cannot_manage_users(client: TestClient) -> None:
    admin_headers = helper_login(client, "admin@example.com", "Admin User")
    collab_headers = helper_login(client, "collab@example.com", "Collab User")

    # Admin creates workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "Vance Family"},
    )
    ws_id = ws_resp.json()["id"]

    # Admin adds collab as collaborator
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "collab@example.com", "role": "collaborator"},
    )

    # Collaborator can add a person to the tree
    person_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=collab_headers,
        json={"first_name": "George", "last_name": "Vance", "gender": "male", "is_living": True},
    )
    assert person_resp.status_code == 200

    # Collaborator ATTEMPTS to invite another member -> Should fail with 403 Forbidden
    invite_attempt = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=collab_headers,
        json={"email": "outsider@example.com", "role": "viewer"},
    )
    assert invite_attempt.status_code == 403

    # Collaborator ATTEMPTS to remove member -> Should fail with 403 Forbidden
    delete_attempt = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/00000000-0000-0000-0000-000000000000",
        headers=collab_headers,
    )
    assert delete_attempt.status_code == 403


def test_admin_can_remove_members(client: TestClient) -> None:
    admin_headers = helper_login(client, "admin@example.com", "Admin User")
    _viewer_headers = helper_login(client, "viewer@example.com", "Viewer User")

    # Admin creates workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "Higgins Family"},
    )
    ws_id = ws_resp.json()["id"]

    # Admin adds viewer
    viewer_member_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "viewer@example.com", "role": "viewer"},
    )
    viewer_user_id = viewer_member_resp.json()["user_id"]

    # Verify 2 members
    list_resp = client.get(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
    )
    assert len(list_resp.json()) == 2

    # Admin removes viewer
    del_resp = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/{viewer_user_id}",
        headers=admin_headers,
    )
    assert del_resp.status_code == 200

    # Verify only 1 member left
    list_after = client.get(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
    )
    assert len(list_after.json()) == 1
    assert list_after.json()[0]["role"] == "admin"
