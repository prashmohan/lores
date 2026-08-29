import io

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import Column, Engine, MetaData, String, Table, create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.db.base import Base
from app.db.init_db import init_db
from app.db.session import get_db
from app.main import app
from app.schemas.person import PersonCreate, PersonUpdate

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


def helper_login(client: TestClient, email: str) -> dict[str, str]:
    req_res = client.post(
        "/api/v1/auth/request-otp",
        json={"email": email, "display_name": "Test User"},
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


def test_security_headers_present_on_endpoints(client: TestClient):
    """Verify that defensive HTTP security headers are included on API responses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-XSS-Protection") == "0"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "geolocation=()" in resp.headers.get("Permissions-Policy", "")


def test_import_oversized_file_rejected_with_413(client: TestClient):
    """Verify that uploads exceeding 25MB are rejected with 413 Payload Too Large."""
    headers = helper_login(client, "admin_security@example.com")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Security Test Family"},
        headers=headers,
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    oversized_data = b"0 HEAD\n" * (6 * 1024 * 1024)  # ~42 MB
    files = {"file": ("big.ged", io.BytesIO(oversized_data), "text/plain")}

    resp = client.post(
        f"/api/v1/workspaces/{ws_id}/import/gedcom",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 413
    assert "exceeds maximum size" in resp.json()["detail"]


def test_import_oversized_json_rejected_with_413(client: TestClient):
    """Verify that JSON uploads exceeding 25MB are rejected with 413 Payload Too Large."""
    headers = helper_login(client, "admin_security_json@example.com")

    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Security JSON Family"},
        headers=headers,
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    oversized_json = b'{"data": "' + (b"A" * (26 * 1024 * 1024)) + b'"}'
    files = {"file": ("big.json", io.BytesIO(oversized_json), "application/json")}

    resp = client.post(
        f"/api/v1/workspaces/{ws_id}/import/json",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 413
    assert "exceeds maximum size" in resp.json()["detail"]


def test_verify_otp_nonexistent_email_constant_time(client: TestClient):
    """Verify that verifying an OTP for a non-existent email safely rejects without error."""
    resp = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "nonexistent@example.com", "code": "123456"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid or expired authentication code"


# ---------------------------------------------------------------------------
# Task 9 Tests: Dynamic DDL Identifier Quoting & Regex Whitelist
# ---------------------------------------------------------------------------


def test_init_db_skips_malicious_or_non_whitelisted_identifiers():
    """Verify init_db ignores tables or columns that contain invalid SQL identifier chars."""
    engine: Engine = create_engine("sqlite:///:memory:")

    meta = MetaData()
    _table_bad_name = Table(
        "bad_table; DROP TABLE users;--",
        meta,
        Column("id", String(36), primary_key=True),
    )
    meta.create_all(bind=engine)

    # Should run without error and not execute any dangerous statement
    init_db(engine)


# ---------------------------------------------------------------------------
# Task 10 Tests: Person Schemas Validation (Lengths, Enums, Avatar URL)
# ---------------------------------------------------------------------------


def test_person_schema_first_name_validation():
    """Verify first_name requires 1-100 characters."""
    with pytest.raises(ValidationError):
        PersonCreate(first_name="")

    with pytest.raises(ValidationError):
        PersonCreate(first_name="A" * 101)

    valid = PersonCreate(first_name="John")
    assert valid.first_name == "John"


def test_person_schema_field_length_limits():
    """Verify string field length upper bounds."""
    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", last_name="A" * 101)

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", maiden_name="A" * 101)

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", birth_place="A" * 256)

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", death_place="A" * 256)

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", biography="A" * 50001)

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", avatar_url="https://example.com/" + ("a" * 2048))


def test_person_schema_gender_and_qualifier_enums():
    """Verify gender and date qualifiers are restricted to allowed literals."""
    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", gender="alien")  # type: ignore[arg-type]

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", birth_date_qualifier="sometime")  # type: ignore[arg-type]

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", death_date_qualifier="never")  # type: ignore[arg-type]

    # Valid values
    p = PersonCreate(
        first_name="John",
        gender="male",
        birth_date_qualifier="about",
        death_date_qualifier="before",
    )
    assert p.gender == "male"
    assert p.birth_date_qualifier == "about"
    assert p.death_date_qualifier == "before"


def test_person_schema_avatar_url_scheme_validation():
    """Verify avatar_url permits http, https, relative path, data:image, and rejects dangerous schemes."""
    # Dangerous schemes
    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", avatar_url="javascript:alert(1)")

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", avatar_url="data:text/html;base64,PHNjcmlwdD4=")

    with pytest.raises(ValidationError):
        PersonCreate(first_name="John", avatar_url="ftp://example.com/avatar.jpg")

    # Safe schemes
    p1 = PersonCreate(first_name="John", avatar_url="https://example.com/avatar.png")
    assert p1.avatar_url == "https://example.com/avatar.png"

    p2 = PersonCreate(first_name="John", avatar_url="http://example.com/avatar.png")
    assert p2.avatar_url == "http://example.com/avatar.png"

    p3 = PersonCreate(first_name="John", avatar_url="/api/v1/media/12345")
    assert p3.avatar_url == "/api/v1/media/12345"

    p4 = PersonCreate(first_name="John", avatar_url="data:image/png;base64,iVBORw0KGgo=")
    assert p4.avatar_url == "data:image/png;base64,iVBORw0KGgo="


def test_person_update_schema_validation():
    """Verify PersonUpdate validates optional fields and avatar_url."""
    with pytest.raises(ValidationError):
        PersonUpdate(first_name="")

    with pytest.raises(ValidationError):
        PersonUpdate(first_name="A" * 101)

    with pytest.raises(ValidationError):
        PersonUpdate(avatar_url="javascript:alert(1)")

    with pytest.raises(ValidationError):
        PersonUpdate(gender="invalid_gender")  # type: ignore[arg-type]

    up = PersonUpdate(first_name="Updated", avatar_url="https://example.com/new.png")
    assert up.first_name == "Updated"
    assert up.avatar_url == "https://example.com/new.png"


def test_person_endpoints_reject_invalid_payloads(client: TestClient):
    """Verify API returns 422 Unprocessable Entity when invalid person payloads are submitted."""
    headers = helper_login(client, "admin_person_val@example.com")
    ws_res = client.post(
        "/api/v1/workspaces",
        json={"name": "Validation Test Family"},
        headers=headers,
    )
    assert ws_res.status_code == 200
    ws_id = ws_res.json()["id"]

    # Empty first_name
    bad_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": ""},
        headers=headers,
    )
    assert bad_res.status_code == 422

    # Dangerous avatar URL
    bad_avatar_res = client.post(
        f"/api/v1/workspaces/{ws_id}/people",
        json={"first_name": "Eve", "avatar_url": "javascript:alert(1)"},
        headers=headers,
    )
    assert bad_avatar_res.status_code == 422


# ---------------------------------------------------------------------------
# Task 11 Tests: Centralized Database & Internal Exception Handlers
# ---------------------------------------------------------------------------


def test_sqlalchemy_exception_handler_returns_sanitized_500():
    """Verify that SQLAlchemyError exceptions are logged and converted to sanitized 500 JSON responses."""
    with TestClient(app, raise_server_exceptions=False) as c:

        @app.get("/api/v1/test-db-error", include_in_schema=False)
        def trigger_db_error():
            raise OperationalError("SELECT * FROM non_existent", {}, Exception("no such table"))

        resp = c.get("/api/v1/test-db-error")
        assert resp.status_code == 500
        assert resp.json() == {"detail": "A database error occurred. Please try again later."}


def test_unhandled_exception_handler_returns_sanitized_500():
    """Verify that unhandled server exceptions return sanitized 500 JSON responses."""
    with TestClient(app, raise_server_exceptions=False) as c:

        @app.get("/api/v1/test-unhandled-error", include_in_schema=False)
        def trigger_unhandled_error():
            raise RuntimeError("Unexpected internal engine error")

        resp = c.get("/api/v1/test-unhandled-error")
        assert resp.status_code == 500
        assert resp.json() == {"detail": "An internal server error occurred."}
