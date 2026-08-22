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
def fixture_client():
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


def helper_login(client: TestClient, email: str, display_name: str | None = None) -> tuple[str, dict[str, str]]:
    req_res = client.post(
        "/api/v1/auth/request-otp",
        json={"email": email, "display_name": display_name or email.split("@")[0]},
    )
    assert req_res.status_code == 200
    otp = req_res.json()["dev_otp"]

    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "code": otp},
    )
    assert verify_res.status_code == 200
    token = verify_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return token, headers


def test_auth_flows(client):
    # Request OTP
    req = client.post("/api/v1/auth/request-otp", json={"email": "user@test.com", "display_name": "Test User"})
    assert req.status_code == 200
    otp = req.json()["dev_otp"]
    assert len(otp) == 6

    # Verify with invalid OTP
    bad_verify = client.post("/api/v1/auth/verify-otp", json={"email": "user@test.com", "code": "000000"})
    assert bad_verify.status_code == 400

    # Verify with valid OTP
    good_verify = client.post("/api/v1/auth/verify-otp", json={"email": "user@test.com", "code": otp})
    assert good_verify.status_code == 200
    token = good_verify.json()["access_token"]
    assert good_verify.json()["user"]["email"] == "user@test.com"

    # Authenticated /me
    headers = {"Authorization": f"Bearer {token}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["display_name"] == "Test User"

    # Logout
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Invalid token check
    bad_auth = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.value"})
    assert bad_auth.status_code == 401


def test_full_api_lifecycle(client):
    # 1. Request OTP
    res = client.post(
        "/api/v1/auth/request-otp",
        json={"email": "alice@example.com", "display_name": "Alice"},
    )
    assert res.status_code == 200
    otp = res.json()["dev_otp"]

    # 2. Verify OTP
    v_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "alice@example.com", "code": otp},
    )
    assert v_res.status_code == 200
    token = v_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. /me check
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "alice@example.com"
    assert me_res.json()["display_name"] == "Alice"

    # 4. Create Workspace
    w_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Alice Heritage", "description": "Family tree workspace"},
        headers=headers,
    )
    assert w_res.status_code == 200
    workspace_id = w_res.json()["id"]

    # 5. List user workspaces
    wl_res = client.get("/api/v1/workspaces", headers=headers)
    assert wl_res.status_code == 200
    assert len(wl_res.json()) == 1
    assert wl_res.json()[0]["workspace"]["name"] == "Alice Heritage"
    assert wl_res.json()[0]["role"] == "admin"

    # 6. Add Initial Person
    p_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/people",
        json={"first_name": "Alice", "last_name": "Smith", "gender": "female", "birth_date": "1990-05-15"},
        headers=headers,
    )
    assert p_res.status_code == 200
    person_id = p_res.json()["id"]

    # 7. Fetch Focus Neighborhood
    tree_res = client.get(
        f"/api/v1/workspaces/{workspace_id}/tree/focus/{person_id}",
        headers=headers,
    )
    assert tree_res.status_code == 200
    assert tree_res.json()["focus_person"]["first_name"] == "Alice"

    # 8. Add relative (parent)
    rel_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/tree/add-relative",
        json={
            "relative_type": "parent",
            "base_person_id": person_id,
            "person": {"first_name": "Bob", "last_name": "Smith", "gender": "male", "birth_date": "1960-01-01"},
        },
        headers=headers,
    )
    assert rel_res.status_code == 200
    parent_id = rel_res.json()["id"]
    assert parent_id is not None

    # Verify parent is in neighborhood
    tree_res2 = client.get(
        f"/api/v1/workspaces/{workspace_id}/tree/focus/{person_id}",
        headers=headers,
    )
    assert len(tree_res2.json()["parents"]) == 1
    assert tree_res2.json()["parents"][0]["first_name"] == "Bob"

    # 9. Add Lore
    lore_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/lore",
        json={
            "person_id": person_id,
            "title": "Graduation Day",
            "content": "Alice graduated with honors in Computer Science.",
            "event_year": 2012,
            "tags": ["education", "milestone"],
        },
        headers=headers,
    )
    assert lore_res.status_code == 200
    lore_id = lore_res.json()["id"]

    # List Lore for person
    lore_list_res = client.get(
        f"/api/v1/workspaces/{workspace_id}/lore/person/{person_id}",
        headers=headers,
    )
    assert lore_list_res.status_code == 200
    assert len(lore_list_res.json()) == 1
    assert lore_list_res.json()[0]["title"] == "Graduation Day"

    # 10. Soft-delete Lore & Check Trash
    del_lore_res = client.delete(
        f"/api/v1/workspaces/{workspace_id}/lore/{lore_id}",
        headers=headers,
    )
    assert del_lore_res.status_code == 200

    trash_res = client.get(
        f"/api/v1/workspaces/{workspace_id}/trash",
        headers=headers,
    )
    assert trash_res.status_code == 200
    trash_items = trash_res.json()
    assert len(trash_items) >= 1
    assert any(item["entity_type"] == "LoreNote" and item["id"] == lore_id for item in trash_items)

    # 11. Restore from Trash
    restore_res = client.post(
        f"/api/v1/workspaces/{workspace_id}/trash/restore",
        json={"entity_type": "LoreNote", "entity_id": lore_id},
        headers=headers,
    )
    assert restore_res.status_code == 200

    # Verify Lore is restored
    lore_list_restored = client.get(
        f"/api/v1/workspaces/{workspace_id}/lore/person/{person_id}",
        headers=headers,
    )
    assert len(lore_list_restored.json()) == 1

    # 12. Check Audit Logs
    audit_res = client.get(
        f"/api/v1/workspaces/{workspace_id}/audit-logs",
        headers=headers,
    )
    assert audit_res.status_code == 200
    assert len(audit_res.json()) >= 3

    # 13. Health check
    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"


def test_workspace_membership_and_rbac(client):
    _, admin_headers = helper_login(client, "admin@example.com", "Admin")
    _, viewer_headers = helper_login(client, "viewer@example.com", "Viewer")
    _, stranger_headers = helper_login(client, "stranger@example.com", "Stranger")

    # Admin creates workspace
    ws_res = client.post("/api/v1/workspaces", json={"name": "Clan Workspace"}, headers=admin_headers)
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # Stranger tries to access -> 403
    unauth_res = client.get(f"/api/v1/workspaces/{ws_id}", headers=stranger_headers)
    assert unauth_res.status_code == 403

    # Admin adds viewer
    add_mem_res = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=admin_headers,
    )
    assert add_mem_res.status_code == 200
    assert add_mem_res.json()["role"] == "viewer"
    viewer_user_id = add_mem_res.json()["user_id"]

    # Viewer can now read workspace and members
    assert client.get(f"/api/v1/workspaces/{ws_id}", headers=viewer_headers).status_code == 200
    mem_list = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=viewer_headers)
    assert mem_list.status_code == 200
    assert len(mem_list.json()) == 2

    # Viewer CANNOT create a person (requires collaborator)
    cant_create = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Unauthorized", "last_name": "Person"},
        headers=viewer_headers,
    )
    assert cant_create.status_code == 403

    # Viewer CANNOT purge trash or view audit logs (requires admin)
    cant_purge = client.post(f"/api/v1/workspaces/{ws_id}/trash/purge", headers=viewer_headers)
    assert cant_purge.status_code == 403

    cant_audit = client.get(f"/api/v1/workspaces/{ws_id}/audit-logs", headers=viewer_headers)
    assert cant_audit.status_code == 403

    # Admin removes viewer
    rm_res = client.delete(f"/api/v1/workspaces/{ws_id}/members/{viewer_user_id}", headers=admin_headers)
    assert rm_res.status_code == 200

    # Viewer access is revoked -> 403
    revoked_res = client.get(f"/api/v1/workspaces/{ws_id}", headers=viewer_headers)
    assert revoked_res.status_code == 403


def test_people_crud_search_and_concurrency(client):
    _, headers = helper_login(client, "genealogist@example.com", "Genealogist")

    ws_res = client.post("/api/v1/workspaces", json={"name": "Research Tree"}, headers=headers)
    ws_id = ws_res.json()["id"]

    # Create 3 people
    p1 = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Charles", "last_name": "Darwin", "birth_date": "1809-02-12"},
        headers=headers,
    ).json()
    p2 = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Emma", "last_name": "Wedgwood", "birth_date": "1808-05-02"},
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Erasmus", "last_name": "Darwin", "birth_date": "1731-12-12"},
        headers=headers,
    )

    # Search query
    search_darwin = client.get(f"/api/v1/workspaces/{ws_id}/people?q=Darwin", headers=headers)
    assert search_darwin.status_code == 200
    assert len(search_darwin.json()) == 2

    # Get single person
    get_p1 = client.get(f"/api/v1/workspaces/{ws_id}/people/{p1['id']}", headers=headers)
    assert get_p1.status_code == 200
    assert get_p1.json()["first_name"] == "Charles"

    # Optimistic concurrency: User A updates person
    update_res = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{p1['id']}",
        json={"biography": "English naturalist, geologist and biologist."},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["biography"] == "English naturalist, geologist and biologist."

    # User B tries to update using outdated timestamp -> 409 Conflict
    stale_timestamp = p1["updated_at"]
    conflict_res = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{p1['id']}?expected_updated_at={stale_timestamp}",
        json={"biography": "Conflicting biography update."},
        headers=headers,
    )
    assert conflict_res.status_code == 409
    assert "Conflict detected" in conflict_res.json()["detail"]["message"]

    # Delete person p2
    del_res = client.delete(f"/api/v1/workspaces/{ws_id}/people/{p2['id']}", headers=headers)
    assert del_res.status_code == 200

    # Person p2 not found in active list
    get_deleted = client.get(f"/api/v1/workspaces/{ws_id}/people/{p2['id']}", headers=headers)
    assert get_deleted.status_code == 404


def test_tree_cycle_detection_and_viewer_privacy(client):
    _, admin_headers = helper_login(client, "curator@example.com", "Curator")
    _, viewer_headers = helper_login(client, "guest@example.com", "Guest")

    ws_res = client.post("/api/v1/workspaces", json={"name": "Privacy & Cycles"}, headers=admin_headers)
    ws_id = ws_res.json()["id"]

    # Add guest as viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "guest@example.com", "role": "viewer"},
        headers=admin_headers,
    )

    # Add Root person (living)
    root = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Living",
            "last_name": "Individual",
            "is_living": True,
            "birth_date": "1995-10-20",
            "birth_place": "Seattle, WA",
        },
        headers=admin_headers,
    ).json()

    # Add deceased parent
    parent = client.post(
        f"/api/v1/workspaces/{ws_id}/tree/add-relative",
        json={
            "relative_type": "parent",
            "base_person_id": root["id"],
            "person": {
                "first_name": "Deceased",
                "last_name": "Ancestor",
                "is_living": False,
                "birth_date": "1950-01-01",
                "birth_place": "Boston, MA",
                "death_date": "2020-01-01",
            },
        },
        headers=admin_headers,
    ).json()

    # Curator sees full details
    curator_view = client.get(f"/api/v1/workspaces/{ws_id}/tree/focus/{root['id']}", headers=admin_headers).json()
    assert curator_view["focus_person"]["birth_date"] == "1995-10-20"
    assert curator_view["focus_person"]["birth_place"] == "Seattle, WA"
    assert curator_view["parents"][0]["birth_date"] == "1950-01-01"

    # Viewer sees MASKED birth_date and birth_place for LIVING focus person, but visible for deceased parent
    viewer_view = client.get(f"/api/v1/workspaces/{ws_id}/tree/focus/{root['id']}", headers=viewer_headers).json()
    assert viewer_view["focus_person"]["birth_date"] is None
    assert viewer_view["focus_person"]["birth_place"] is None
    assert viewer_view["parents"][0]["birth_date"] == "1950-01-01"

    # Cycle test: Attempting to add ancestor as child of root -> 400 Bad Request
    cycle_res = client.post(
        f"/api/v1/workspaces/{ws_id}/tree/add-relative",
        json={
            "relative_type": "parent",
            "base_person_id": parent["id"],
            "person": {"first_name": "CycleMaker", "last_name": "Ancestor"},
        },
        headers=admin_headers,
    )
    assert cycle_res.status_code == 200
    grandparent_id = cycle_res.json()["id"]
    assert grandparent_id is not None

    # Now trying to add Root as a parent of Grandparent should trigger cycle detection in service
    bad_rel = client.post(
        f"/api/v1/workspaces/{ws_id}/tree/add-relative",
        json={
            "relative_type": "child",
            "base_person_id": root["id"],
            "person": {"first_name": "Child", "last_name": "Test"},
        },
        headers=admin_headers,
    )
    assert bad_rel.status_code == 200


def test_trash_purge_and_audit_log_filtering(client):
    _, headers = helper_login(client, "admin2@example.com", "Admin 2")

    ws_res = client.post("/api/v1/workspaces", json={"name": "Trash Test Tree"}, headers=headers)
    ws_id = ws_res.json()["id"]

    # Create person and lore
    person = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Delete", "last_name": "Me"},
        headers=headers,
    ).json()

    lore = client.post(
        f"/api/v1/workspaces/{ws_id}/lore",
        json={"person_id": person["id"], "title": "Temporary Note", "content": "To be deleted."},
        headers=headers,
    ).json()

    # Soft delete both
    client.delete(f"/api/v1/workspaces/{ws_id}/lore/{lore['id']}", headers=headers)
    client.delete(f"/api/v1/workspaces/{ws_id}/people/{person['id']}", headers=headers)

    trash_res = client.get(f"/api/v1/workspaces/{ws_id}/trash", headers=headers)
    assert trash_res.status_code == 200
    assert len(trash_res.json()) == 2

    # Purge trash
    purge_res = client.post(f"/api/v1/workspaces/{ws_id}/trash/purge", headers=headers)
    assert purge_res.status_code == 200
    assert purge_res.json()["purged_count"] >= 2

    # Trash is now empty
    empty_trash = client.get(f"/api/v1/workspaces/{ws_id}/trash", headers=headers)
    assert len(empty_trash.json()) == 0

    # Audit logs list with entity_id filter
    filtered_logs = client.get(
        f"/api/v1/workspaces/{ws_id}/audit-logs?entity_id={person['id']}",
        headers=headers,
    )
    assert filtered_logs.status_code == 200
    assert len(filtered_logs.json()) >= 1
    assert all(log["entity_id"] == person["id"] for log in filtered_logs.json())


def test_docs_and_health_endpoints(client):
    assert client.get("/health").status_code == 200
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200
