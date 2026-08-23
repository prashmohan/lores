import io
import json
import uuid

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

captured_otps: dict[str, str] = {}


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
    headers = {"Authorization": f"Bearer {token}"}
    return token, headers


def test_admin_export_gedcom_success(client: TestClient):
    _, admin_headers = helper_login(client, "admin_gedcom@example.com", "Admin GEDCOM")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Smith Family Tree", "description": "Ancestry test"},
        headers=admin_headers,
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # Add person & lore
    p_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Eleanor",
            "last_name": "Vance",
            "gender": "female",
            "birth_date": "1920-04-12",
        },
        headers=admin_headers,
    )
    assert p_res.status_code == 200
    person_id = p_res.json()["id"]

    client.post(
        f"/api/v1/workspaces/{ws_id}/lore",
        json={
            "person_id": person_id,
            "title": "Early Life",
            "content": "Born in Hill House.",
        },
        headers=admin_headers,
    )

    # Export GEDCOM
    res = client.get(f"/api/v1/workspaces/{ws_id}/export/gedcom", headers=admin_headers)
    assert res.status_code == 200
    assert "attachment;" in res.headers.get("content-disposition", "")
    assert ".ged" in res.headers.get("content-disposition", "")
    assert "text/plain" in res.headers.get("content-type", "")

    content = res.text
    assert "0 HEAD" in content
    assert "1 SOUR LORES" in content
    assert "0 @I1@ INDI" in content
    assert "1 NAME Eleanor /Vance/" in content
    assert "Early Life: Born in Hill House." in content
    assert "0 TRLR" in content


def test_admin_export_json_success(client: TestClient):
    _, admin_headers = helper_login(client, "admin_json@example.com", "Admin JSON")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "JSON Workspace"},
        headers=admin_headers,
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Arthur", "last_name": "Dent", "gender": "male"},
        headers=admin_headers,
    )

    # Export JSON
    res = client.get(f"/api/v1/workspaces/{ws_id}/export/json", headers=admin_headers)
    assert res.status_code == 200
    assert "attachment;" in res.headers.get("content-disposition", "")
    assert ".json" in res.headers.get("content-disposition", "")
    assert "application/json" in res.headers.get("content-type", "")

    data = res.json()
    assert data["format"] == "lores_backup"
    assert data["version"] == "1.0"
    assert data["workspace"]["name"] == "JSON Workspace"
    assert len(data["people"]) == 1
    assert data["people"][0]["first_name"] == "Arthur"


def test_admin_import_gedcom_file_success(client: TestClient):
    _, admin_headers = helper_login(client, "admin_import_ged@example.com", "Admin Import")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "GEDCOM Target"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    gedcom_sample = (
        "0 HEAD\n"
        "1 CHAR UTF-8\n"
        "0 @I1@ INDI\n"
        "1 NAME Henry /Miller/\n"
        "1 SEX M\n"
        "1 BIRT\n"
        "2 DATE 1891-12-26\n"
        "0 @I2@ INDI\n"
        "1 NAME June /Mansfield/\n"
        "1 SEX F\n"
        "0 @F1@ FAM\n"
        "1 HUSB @I1@\n"
        "1 WIFE @I2@\n"
        "1 MARR\n"
        "2 DATE 1924\n"
        "0 TRLR\n"
    )

    files = {"file": ("miller_family.ged", io.BytesIO(gedcom_sample.encode("utf-8")), "text/plain")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/gedcom",
        files=files,
        headers=admin_headers,
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["success"] is True
    assert summary["filename"] == "miller_family.ged"
    assert summary["format"] == "gedcom"
    assert summary["people_created"] == 2
    assert summary["unions_created"] == 1

    # Verify people in workspace
    people_res = client.get(f"/api/v1/workspaces/{ws_id}/people", headers=admin_headers)
    assert people_res.status_code == 200
    names = [p["first_name"] for p in people_res.json()]
    assert "Henry" in names
    assert "June" in names


def test_admin_import_json_file_success(client: TestClient):
    _, admin_headers = helper_login(client, "admin_import_json@example.com", "Admin Import JSON")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "JSON Target"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    person1_id = str(uuid.uuid4())
    person2_id = str(uuid.uuid4())
    union_id = str(uuid.uuid4())
    child_id = str(uuid.uuid4())

    json_payload = {
        "version": "1.0",
        "format": "lores_backup",
        "people": [
            {
                "id": person1_id,
                "first_name": "George",
                "last_name": "Bailey",
                "gender": "male",
                "birth_date": "1907-05-08",
            },
            {
                "id": person2_id,
                "first_name": "Mary",
                "last_name": "Hatch",
                "gender": "female",
                "birth_date": "1910-07-16",
            },
            {
                "id": child_id,
                "first_name": "Zuzu",
                "last_name": "Bailey",
                "gender": "female",
                "birth_date": "1940-08-01",
            },
        ],
        "unions": [
            {
                "id": union_id,
                "partner1_id": person1_id,
                "partner2_id": person2_id,
                "union_type": "marriage",
                "start_date": "1932",
            }
        ],
        "children": [
            {
                "id": str(uuid.uuid4()),
                "union_id": union_id,
                "child_id": child_id,
                "relationship_type": "biological",
            }
        ],
        "lore_notes": [
            {
                "id": str(uuid.uuid4()),
                "person_id": child_id,
                "title": "Petals",
                "content": "Look daddy, paste it!",
            }
        ],
    }

    raw_bytes = json.dumps(json_payload).encode("utf-8")
    files = {"file": ("it_is_a_wonderful_life.json", io.BytesIO(raw_bytes), "application/json")}

    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        files=files,
        headers=admin_headers,
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["success"] is True
    assert summary["filename"] == "it_is_a_wonderful_life.json"
    assert summary["format"] == "json"
    assert summary["people_created"] == 3
    assert summary["unions_created"] == 1
    assert summary["children_linked"] == 1
    assert summary["lore_notes_created"] == 1


def test_rbac_protection_collaborator_and_viewer_forbidden(client: TestClient):
    _, admin_headers = helper_login(client, "admin_rbac@example.com", "Admin RBAC")
    _, collab_headers = helper_login(client, "collab_rbac@example.com", "Collab RBAC")
    _, viewer_headers = helper_login(client, "viewer_rbac@example.com", "Viewer RBAC")
    _, stranger_headers = helper_login(client, "stranger_rbac@example.com", "Stranger RBAC")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "RBAC Protection Workspace"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    # Add collaborator and viewer
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "collab_rbac@example.com", "role": "collaborator"},
        headers=admin_headers,
    )
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "viewer_rbac@example.com", "role": "viewer"},
        headers=admin_headers,
    )

    gedcom_file = {"file": ("test.ged", io.BytesIO(b"0 HEAD\n0 TRLR\n"), "text/plain")}
    json_file = {"file": ("test.json", io.BytesIO(b'{"people":[]}'), "application/json")}

    # Test Collaborator (403 Forbidden on all 4 endpoints)
    assert (
        client.get(f"/api/v1/workspaces/{ws_id}/export/gedcom", headers=collab_headers).status_code
        == 403
    )
    assert (
        client.get(f"/api/v1/workspaces/{ws_id}/export/json", headers=collab_headers).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/gedcom",
            files={"file": ("test.ged", io.BytesIO(b"0 HEAD\n0 TRLR\n"), "text/plain")},
            headers=collab_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/json",
            files={"file": ("test.json", io.BytesIO(b'{"people":[]}'), "application/json")},
            headers=collab_headers,
        ).status_code
        == 403
    )

    # Test Viewer (403 Forbidden on all 4 endpoints)
    assert (
        client.get(f"/api/v1/workspaces/{ws_id}/export/gedcom", headers=viewer_headers).status_code
        == 403
    )
    assert (
        client.get(f"/api/v1/workspaces/{ws_id}/export/json", headers=viewer_headers).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/gedcom",
            files=gedcom_file,
            headers=viewer_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/json",
            files=json_file,
            headers=viewer_headers,
        ).status_code
        == 403
    )

    # Test Stranger (403 Forbidden)
    assert (
        client.get(
            f"/api/v1/workspaces/{ws_id}/export/gedcom", headers=stranger_headers
        ).status_code
        == 403
    )
    assert (
        client.get(f"/api/v1/workspaces/{ws_id}/export/json", headers=stranger_headers).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/gedcom",
            files={"file": ("test.ged", io.BytesIO(b"0 HEAD\n0 TRLR\n"), "text/plain")},
            headers=stranger_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/workspaces/{ws_id}/import/json",
            files={"file": ("test.json", io.BytesIO(b'{"people":[]}'), "application/json")},
            headers=stranger_headers,
        ).status_code
        == 403
    )


def test_import_invalid_and_corrupted_files(client: TestClient):
    _, admin_headers = helper_login(client, "admin_errors@example.com", "Admin Errors")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Error Handling Workspace"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    # Empty GEDCOM
    empty_ged = {"file": ("empty.ged", io.BytesIO(b"   "), "text/plain")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/gedcom",
        files=empty_ged,
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()

    # Corrupted JSON
    bad_json = {"file": ("bad.json", io.BytesIO(b"{invalid json content"), "application/json")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        files=bad_json,
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "invalid" in res.json()["detail"].lower()

    # Empty JSON
    empty_json = {"file": ("empty.json", io.BytesIO(b""), "application/json")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        files=empty_json,
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()

    # Non-dictionary JSON root
    array_json = {"file": ("array.json", io.BytesIO(b"[1, 2, 3]"), "application/json")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        files=array_json,
        headers=admin_headers,
    )
    assert res.status_code == 400


def test_import_gedcom_with_cycles_returns_warnings_in_summary(client: TestClient):
    _, admin_headers = helper_login(client, "admin_cycle@example.com", "Admin Cycle")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Cycle Warning Workspace"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    # GEDCOM where I1 is parent of I2, and I2 is parent of I1
    cyclic_gedcom = (
        "0 HEAD\n"
        "1 CHAR UTF-8\n"
        "0 @I1@ INDI\n"
        "1 NAME Parent /One/\n"
        "0 @I2@ INDI\n"
        "1 NAME Child /Two/\n"
        "0 @F1@ FAM\n"
        "1 HUSB @I1@\n"
        "1 CHIL @I2@\n"
        "0 @F2@ FAM\n"
        "1 HUSB @I2@\n"
        "1 CHIL @I1@\n"
        "0 TRLR\n"
    )

    files = {"file": ("cycle.ged", io.BytesIO(cyclic_gedcom.encode("utf-8")), "text/plain")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/gedcom",
        files=files,
        headers=admin_headers,
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["success"] is True
    assert summary["children_linked"] == 1
    assert len(summary["warnings"]) == 1
    assert "cyclical ancestry" in summary["warnings"][0]


def test_admin_import_gedcom_merge_and_audit_logging(client: TestClient):
    _, admin_headers = helper_login(client, "admin_audit_import@example.com", "Admin Audit")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Merge & Audit Workspace"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    # Pre-create person
    client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={
            "first_name": "Ernest",
            "last_name": "Hemingway",
            "birth_date": "1899-07-21",
            "biography": "American novelist and short-story writer.",
        },
        headers=admin_headers,
    )

    gedcom_data = (
        "0 HEAD\n"
        "1 CHAR UTF-8\n"
        "0 @I1@ INDI\n"
        "1 NAME Ernest /Hemingway/\n"
        "1 SEX M\n"
        "1 BIRT\n"
        "2 DATE 21 JUL 1899\n"
        "2 PLAC Oak Park, Illinois\n"
        "1 DEAT\n"
        "2 DATE 2 JUL 1961\n"
        "2 PLAC Ketchum, Idaho\n"
        "1 NOTE Won Nobel Prize in Literature in 1954.\n"
        "0 TRLR\n"
    )

    files = {"file": ("hemingway.ged", io.BytesIO(gedcom_data.encode("utf-8")), "text/plain")}
    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/gedcom",
        files=files,
        headers=admin_headers,
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["people_merged"] == 1
    assert summary["people_created"] == 0
    assert summary["lore_notes_created"] == 1

    # Check audit log
    audit_res = client.get(f"/api/v1/workspaces/{ws_id}/audit-logs", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    import_log = next((l for l in logs if l.get("action") == "DATA_IMPORT"), None)
    assert import_log is not None
    assert import_log["changes"]["filename"] == "hemingway.ged"
    assert import_log["changes"]["format"] == "gedcom"


def test_import_json_cycle_prevention(client: TestClient):
    _, admin_headers = helper_login(client, "admin_json_cycle@example.com", "Admin JSON Cycle")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "JSON Cycle Workspace"},
        headers=admin_headers,
    )
    ws_id = ws_res.json()["id"]

    p1 = str(uuid.uuid4())
    p2 = str(uuid.uuid4())
    u1 = str(uuid.uuid4())
    u2 = str(uuid.uuid4())

    json_payload = {
        "version": "1.0",
        "format": "lores_backup",
        "people": [
            {"id": p1, "first_name": "Parent", "last_name": "One"},
            {"id": p2, "first_name": "Child", "last_name": "Two"},
        ],
        "unions": [
            {"id": u1, "partner1_id": p1, "union_type": "single_parent"},
            {"id": u2, "partner1_id": p2, "union_type": "single_parent"},
        ],
        "children": [
            {"id": str(uuid.uuid4()), "union_id": u1, "child_id": p2},
            {"id": str(uuid.uuid4()), "union_id": u2, "child_id": p1},
        ],
    }

    raw_bytes = json.dumps(json_payload).encode("utf-8")
    files = {"file": ("cycle.json", io.BytesIO(raw_bytes), "application/json")}

    res = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        files=files,
        headers=admin_headers,
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["children_linked"] == 1
    assert len(summary["warnings"]) == 1
    assert "cyclical ancestry" in summary["warnings"][0]
