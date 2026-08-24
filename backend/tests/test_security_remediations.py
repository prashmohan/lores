import io

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


def test_verify_otp_nonexistent_email_constant_time(client: TestClient):
    """Verify that verifying an OTP for a non-existent email safely rejects without error."""
    resp = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "nonexistent@example.com", "code": "123456"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid or expired authentication code"
