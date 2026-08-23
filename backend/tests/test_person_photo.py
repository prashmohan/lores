import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.db.base import Base
from app.db.init_db import init_db
from app.db.session import get_db
from app.main import app

_ = models

SAMPLE_AVATAR_DATA_URL = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////"
    "////////////////////////////////////////////////////wgALCAAEAAQBAREA/8QAFBABAAAAAAAAAAAA"
    "AAAAAAAAAP/aAAgBAQABPxA="
)

SAMPLE_AVATAR_DATA_URL_2 = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=="


@pytest.fixture(name="client")
def fixture_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    init_db(engine)
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


def helper_login(
    client: TestClient, email: str, display_name: str | None = None
) -> tuple[str, dict[str, str]]:
    client.post(
        "/api/v1/auth/request-otp",
        json={"email": email, "display_name": display_name or email.split("@")[0]},
    )
    otp = captured_otps.get(email.lower().strip())
    assert otp is not None
    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "code": otp},
    )
    token = verify_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    return token, headers


def test_create_and_update_person_with_avatar(client: TestClient):
    _, headers = helper_login(client, "alice@family.org", "Alice")
    ws_res = client.post("/api/v1/workspaces", json={"name": "Alice's Tree"}, headers=headers)
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # 1. Create a person with an avatar data URL
    create_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Eleanor",
            "last_name": "Vance",
            "gender": "female",
            "is_living": True,
            "avatar_url": SAMPLE_AVATAR_DATA_URL,
        },
        headers=headers,
    )
    assert create_res.status_code == 200
    person_data = create_res.json()
    person_id = person_data["id"]
    assert person_data["first_name"] == "Eleanor"
    assert person_data["avatar_url"] == SAMPLE_AVATAR_DATA_URL

    # 2. Get the person and check avatar_url
    get_res = client.get(f"/api/v1/workspaces/{ws_id}/people/{person_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["avatar_url"] == SAMPLE_AVATAR_DATA_URL

    # 3. Update the person's avatar to a new photo
    update_res = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{person_id}",
        json={"avatar_url": SAMPLE_AVATAR_DATA_URL_2},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["avatar_url"] == SAMPLE_AVATAR_DATA_URL_2

    # 4. Check Tree Focus Neighborhood includes avatar_url
    focus_res = client.get(
        f"/api/v1/workspaces/{ws_id}/tree/focus/{person_id}",
        headers=headers,
    )
    assert focus_res.status_code == 200
    focus_data = focus_res.json()
    assert focus_data["focus_person"]["avatar_url"] == SAMPLE_AVATAR_DATA_URL_2

    # 5. Check Overview Tree includes avatar_url
    overview_res = client.get(
        f"/api/v1/workspaces/{ws_id}/tree/overview",
        headers=headers,
    )
    assert overview_res.status_code == 200
    overview_data = overview_res.json()
    person_summary = next(p for p in overview_data["people"] if p["id"] == person_id)
    assert person_summary["avatar_url"] == SAMPLE_AVATAR_DATA_URL_2

    # 6. Remove the avatar (set to null)
    clear_res = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{person_id}",
        json={"avatar_url": None},
        headers=headers,
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["avatar_url"] is None

    # 7. Verify Audit Log contains avatar change events
    audit_res = client.get(
        f"/api/v1/workspaces/{ws_id}/audit-logs?entity_id={person_id}",
        headers=headers,
    )
    assert audit_res.status_code == 200
    audit_entries = audit_res.json()
    assert len(audit_entries) >= 2


def test_viewer_access_to_person_avatar(client: TestClient):
    _, owner_headers = helper_login(client, "owner@family.org", "Owner")
    ws_res = client.post("/api/v1/workspaces", json={"name": "Photo Tree"}, headers=owner_headers)
    ws_id = ws_res.json()["id"]

    # Create person
    create_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Arthur",
            "last_name": "Pendelton",
            "is_living": True,
            "birth_date": "1950",
            "birth_place": "London",
            "avatar_url": SAMPLE_AVATAR_DATA_URL,
        },
        headers=owner_headers,
    )
    person_id = create_res.json()["id"]

    # Add a viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "viewer@family.org", "role": "viewer"},
        headers=owner_headers,
    )

    _, viewer_headers = helper_login(client, "viewer@family.org", "Viewer")

    # Viewer gets person: birth info is redacted because is_living=True, but avatar_url is visible
    get_res = client.get(f"/api/v1/workspaces/{ws_id}/people/{person_id}", headers=viewer_headers)
    assert get_res.status_code == 200
    person_data = get_res.json()
    assert person_data["birth_date"] is None
    assert person_data["birth_place"] is None
    assert person_data["avatar_url"] == SAMPLE_AVATAR_DATA_URL


def test_create_and_update_person_optional_last_name(client: TestClient):
    _, headers = helper_login(client, "mononym@family.org", "Mononym")
    ws_res = client.post("/api/v1/workspaces", json={"name": "Ancient Lineage"}, headers=headers)
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # 1. Create a person with only a first name (no last_name key)
    create_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Aristotle",
            "gender": "male",
            "is_living": False,
        },
        headers=headers,
    )
    assert create_res.status_code == 200
    person = create_res.json()
    assert person["first_name"] == "Aristotle"
    assert person["last_name"] is None
    person_id = person["id"]

    # 2. Add relative (child) without last name
    child_res = client.post(
        f"/api/v1/workspaces/{ws_id}/tree/add-relative",
        json={
            "relative_type": "child",
            "base_person_id": person_id,
            "person": {
                "first_name": "Nicomachus",
                "gender": "male",
                "is_living": False,
            },
        },
        headers=headers,
    )
    assert child_res.status_code == 200
    child = child_res.json()
    assert child["first_name"] == "Nicomachus"
    assert child["last_name"] is None

    # 3. Update person: set last_name to a string, then back to None
    up_res = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{person_id}",
        json={"last_name": "of Stagira"},
        headers=headers,
    )
    assert up_res.status_code == 200
    assert up_res.json()["last_name"] == "of Stagira"

    up_res2 = client.patch(
        f"/api/v1/workspaces/{ws_id}/people/{person_id}",
        json={"last_name": None},
        headers=headers,
    )
    assert up_res2.status_code == 200
    assert up_res2.json()["last_name"] is None

    # 4. Check focus neighborhood serialization
    focus_res = client.get(
        f"/api/v1/workspaces/{ws_id}/tree/focus/{person_id}",
        headers=headers,
    )
    assert focus_res.status_code == 200
    focus_data = focus_res.json()
    assert focus_data["focus_person"]["first_name"] == "Aristotle"
    assert focus_data["focus_person"]["last_name"] is None
    assert len(focus_data["children"]) == 1
    assert focus_data["children"][0]["first_name"] == "Nicomachus"
    assert focus_data["children"][0]["last_name"] is None
