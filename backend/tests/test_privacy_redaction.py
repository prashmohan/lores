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


@pytest.fixture(autouse=True)
def capture_emails(monkeypatch):
    captured_otps.clear()

    def fake_send_otp_email(to_email: str, otp_code: str) -> bool:
        captured_otps[to_email.lower().strip()] = otp_code
        return True

    def fake_send_invitation_email(
        to_email: str, inviter_name: str, workspace_name: str, role: str
    ) -> bool:
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
    otp = captured_otps.get(email.lower().strip())
    assert otp is not None

    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": email, "code": otp},
    )
    assert verify_res.status_code == 200
    token = verify_res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_privacy_redaction_for_living_individuals_on_people_api(client: TestClient) -> None:
    admin_headers = helper_login(client, "admin@example.com", "Admin User")
    collab_headers = helper_login(client, "collab@example.com", "Collab User")
    viewer_headers = helper_login(client, "viewer@example.com", "Viewer User")

    # Create workspace
    ws_res = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "Privacy Test WS", "description": "Testing privacy redactions"},
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # Add collaborator and viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "collab@example.com", "role": "collaborator"},
    )
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "viewer@example.com", "role": "viewer"},
    )

    # Admin creates a living person with full details
    living_person_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=admin_headers,
        json={
            "first_name": "Living",
            "last_name": "Person",
            "gender": "female",
            "is_living": True,
            "birth_date": "1990-05-15",
            "birth_place": "New York, NY",
            "biography": "Secret living biography that should be masked.",
        },
    )
    assert living_person_res.status_code == 200
    living_id = living_person_res.json()["id"]

    # Admin creates a deceased person
    deceased_person_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=admin_headers,
        json={
            "first_name": "Deceased",
            "last_name": "Ancestor",
            "gender": "male",
            "is_living": False,
            "birth_date": "1910-01-01",
            "birth_place": "London, UK",
            "death_date": "1985-12-31",
            "death_place": "Oxford, UK",
            "biography": "Public historical biography.",
        },
    )
    assert deceased_person_res.status_code == 200
    deceased_id = deceased_person_res.json()["id"]

    # 1. Viewer GET /people/{person_id} for living person
    viewer_living_res = client.get(
        f"/api/v1/workspaces/{ws_id}/people/{living_id}",
        headers=viewer_headers,
    )
    assert viewer_living_res.status_code == 200
    living_data = viewer_living_res.json()
    assert living_data["birth_date"] is None
    assert living_data["birth_place"] is None
    assert living_data["biography"] == "[Redacted for privacy]"
    assert living_data["first_name"] == "Living"

    # 2. Viewer GET /people list
    viewer_list_res = client.get(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=viewer_headers,
    )
    assert viewer_list_res.status_code == 200
    list_people = viewer_list_res.json()
    p_map = {p["id"]: p for p in list_people}

    assert p_map[living_id]["birth_date"] is None
    assert p_map[living_id]["birth_place"] is None
    assert p_map[living_id]["biography"] == "[Redacted for privacy]"

    # Deceased person should be fully visible to viewer
    assert p_map[deceased_id]["birth_date"] == "1910-01-01"
    assert p_map[deceased_id]["birth_place"] == "London, UK"
    assert p_map[deceased_id]["biography"] == "Public historical biography."

    # 3. Collaborator GET /people and GET /people/{id} should have full access
    collab_living_res = client.get(
        f"/api/v1/workspaces/{ws_id}/people/{living_id}",
        headers=collab_headers,
    )
    assert collab_living_res.status_code == 200
    collab_data = collab_living_res.json()
    assert collab_data["birth_date"] == "1990-05-15"
    assert collab_data["birth_place"] == "New York, NY"
    assert collab_data["biography"] == "Secret living biography that should be masked."

    # 4. Admin GET /people/{id} should have full access
    admin_living_res = client.get(
        f"/api/v1/workspaces/{ws_id}/people/{living_id}",
        headers=admin_headers,
    )
    assert admin_living_res.status_code == 200
    assert admin_living_res.json()["biography"] == "Secret living biography that should be masked."


def test_privacy_redaction_for_lore_notes(client: TestClient) -> None:
    admin_headers = helper_login(client, "admin2@example.com", "Admin User")
    collab_headers = helper_login(client, "collab2@example.com", "Collab User")
    viewer_headers = helper_login(client, "viewer2@example.com", "Viewer User")

    # Create workspace
    ws_res = client.post(
        "/api/v1/workspaces",
        headers=admin_headers,
        json={"name": "Lore Privacy WS", "description": "Testing lore redaction"},
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # Add collaborator and viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "collab2@example.com", "role": "collaborator"},
    )
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        headers=admin_headers,
        json={"email": "viewer2@example.com", "role": "viewer"},
    )

    # Create living person and deceased person
    living_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=admin_headers,
        json={"first_name": "Living", "last_name": "Hero", "is_living": True},
    )
    living_id = living_res.json()["id"]

    deceased_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        headers=admin_headers,
        json={"first_name": "Ancient", "last_name": "Ancestor", "is_living": False},
    )
    deceased_id = deceased_res.json()["id"]

    # Create lore for living person
    lore_living_res = client.post(
        f"/api/v1/workspaces/{ws_id}/lore",
        headers=collab_headers,
        json={
            "person_id": living_id,
            "title": "Childhood memory",
            "content": "Sensitive personal anecdote about living individual.",
            "event_year": 2005,
            "tags": ["childhood", "private"],
        },
    )
    assert lore_living_res.status_code == 200
    living_lore_id = lore_living_res.json()["id"]

    # Create lore for deceased person
    lore_deceased_res = client.post(
        f"/api/v1/workspaces/{ws_id}/lore",
        headers=collab_headers,
        json={
            "person_id": deceased_id,
            "title": "Historical journey",
            "content": "Migrated across the ocean in 1920.",
            "event_year": 1920,
            "tags": ["history"],
        },
    )
    assert lore_deceased_res.status_code == 200
    deceased_lore_id = lore_deceased_res.json()["id"]

    # 1. Viewer GET /lore/person/{person_id} for living person
    v_lore_person_res = client.get(
        f"/api/v1/workspaces/{ws_id}/lore/person/{living_id}",
        headers=viewer_headers,
    )
    assert v_lore_person_res.status_code == 200
    notes = v_lore_person_res.json()
    assert len(notes) == 1
    assert notes[0]["title"] == "Childhood memory"
    assert notes[0]["content"] == "[Redacted for privacy]"

    # 2. Viewer GET /lore/{lore_id} for living person lore
    v_lore_single_res = client.get(
        f"/api/v1/workspaces/{ws_id}/lore/{living_lore_id}",
        headers=viewer_headers,
    )
    assert v_lore_single_res.status_code == 200
    assert v_lore_single_res.json()["content"] == "[Redacted for privacy]"
    assert v_lore_single_res.json()["title"] == "Childhood memory"

    # 3. Viewer GET /lore/person/{person_id} for deceased person
    v_dec_person_res = client.get(
        f"/api/v1/workspaces/{ws_id}/lore/person/{deceased_id}",
        headers=viewer_headers,
    )
    assert v_dec_person_res.status_code == 200
    dec_notes = v_dec_person_res.json()
    assert len(dec_notes) == 1
    assert dec_notes[0]["content"] == "Migrated across the ocean in 1920."

    # 4. Viewer GET /lore (list all lore notes in workspace)
    v_all_lore_res = client.get(
        f"/api/v1/workspaces/{ws_id}/lore",
        headers=viewer_headers,
    )
    assert v_all_lore_res.status_code == 200
    all_notes = v_all_lore_res.json()
    lore_map = {n["id"]: n for n in all_notes}
    assert lore_map[living_lore_id]["content"] == "[Redacted for privacy]"
    assert lore_map[deceased_lore_id]["content"] == "Migrated across the ocean in 1920."

    # 5. Collaborator & Admin have full unredacted access
    c_lore_res = client.get(
        f"/api/v1/workspaces/{ws_id}/lore/{living_lore_id}",
        headers=collab_headers,
    )
    assert c_lore_res.status_code == 200
    assert c_lore_res.json()["content"] == "Sensitive personal anecdote about living individual."
