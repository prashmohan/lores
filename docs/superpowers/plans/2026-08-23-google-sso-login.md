# Google SSO Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Single Sign-On (SSO) login to Lores alongside the existing email OTP mechanism to reduce email cost and make login simpler for Google users.

**Architecture:** Frontend loads Google Identity Services (GIS) when Google Client ID is configured, rendering an accessible "Sign in with Google" button above the Email OTP form. The backend verifies the Google ID token, matches or provisions the User by normalized verified email, and issues a standard Lores JWT access token.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic v2, `python-jose`, `httpx`, React 18, TypeScript, Tailwind CSS, Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-23-google-sso-login-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-google-sso-login-design.md)

## Global Constraints

- Backend must use existing Python 3.12+ virtual environment (`.venv`).
- Google ID token verification must validate `aud == GOOGLE_CLIENT_ID`, `iss in ["accounts.google.com", "https://accounts.google.com"]`, `email_verified is True`, and expiration.
- If `GOOGLE_CLIENT_ID` is not configured, Google SSO is gracefully disabled without breaking Email OTP login.
- Zero accessibility violations (WCAG 2.1 AAA, `vitest-axe`).
- All tests must run 100% offline using mocks for Google public key/network calls.

---

### Task 1: Backend Settings & Schema Updates

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/schemas/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: Existing `Settings` in `app.config`, existing schemas in `app.schemas.auth`
- Produces: `settings.GOOGLE_CLIENT_ID`, `GoogleAuthRequest(credential: str)`, `AuthConfigResponse(google_client_id: str | None, google_auth_enabled: bool)`

- [ ] **Step 1: Write the failing test for configuration and schemas**

Add tests to `backend/tests/test_auth.py`:
```python
def test_auth_config_and_google_schemas():
    from app.schemas.auth import AuthConfigResponse, GoogleAuthRequest
    
    req = GoogleAuthRequest(credential="mock_id_token_xyz")
    assert req.credential == "mock_id_token_xyz"
    
    cfg_enabled = AuthConfigResponse(google_client_id="test-client-id.apps.googleusercontent.com", google_auth_enabled=True)
    assert cfg_enabled.google_auth_enabled is True
    assert cfg_enabled.google_client_id == "test-client-id.apps.googleusercontent.com"

    cfg_disabled = AuthConfigResponse(google_client_id=None, google_auth_enabled=False)
    assert cfg_disabled.google_auth_enabled is False
    assert cfg_disabled.google_client_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ../.venv/bin/pytest tests/test_auth.py -k test_auth_config_and_google_schemas -v`
Expected: FAIL with `ImportError: cannot import name 'GoogleAuthRequest'`

- [ ] **Step 3: Implement settings in `app/config.py` and schemas in `app/schemas/auth.py`**

In `backend/app/config.py`:
```python
class Settings(BaseSettings):
    ...
    GOOGLE_CLIENT_ID: str | None = None
```

In `backend/app/schemas/auth.py`:
```python
class GoogleAuthRequest(BaseModel):
    credential: str


class AuthConfigResponse(BaseModel):
    google_client_id: str | None = None
    google_auth_enabled: bool = False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ../.venv/bin/pytest tests/test_auth.py -k test_auth_config_and_google_schemas -v`
Expected: PASS

---

### Task 2: Backend Google ID Token Verification & User Matching in `auth_service`

**Files:**
- Modify: `backend/app/services/auth_service.py`
- Create: `backend/tests/test_google_auth.py`

**Interfaces:**
- Consumes: `Settings.GOOGLE_CLIENT_ID`, `app.models.user.User`, `create_access_token`
- Produces: `auth_service.verify_google_id_token(db: Session, id_token: str) -> tuple[User, str]`

- [ ] **Step 1: Write the failing tests for Google token verification**

Create `backend/tests/test_google_auth.py`:
```python
from unittest.mock import patch
import pytest
from app.config import get_settings
from app.models.user import User
from app.services.auth_service import verify_google_id_token, decode_token

def test_verify_google_id_token_new_user(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"
    
    mock_payload = {
        "email": "new_google_user@example.com",
        "name": "Jane Doe",
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "https://accounts.google.com",
    }
    
    with patch("app.services.auth_service._verify_google_token_payload", return_value=mock_payload):
        user, token = verify_google_id_token(db_session, "valid_mock_id_token")
        db_session.commit()
        
        assert user.email == "new_google_user@example.com"
        assert user.display_name == "Jane Doe"
        assert user.last_login_at is not None
        
        payload = decode_token(token)
        assert payload["sub"] == str(user.id)
        assert payload["email"] == "new_google_user@example.com"

def test_verify_google_id_token_existing_user_matching(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"
    
    existing = User(email="existing@example.com", display_name="Original Name")
    db_session.add(existing)
    db_session.commit()
    
    mock_payload = {
        "email": "EXISTING@example.COM",
        "name": "Ignored Name",
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "accounts.google.com",
    }
    
    with patch("app.services.auth_service._verify_google_token_payload", return_value=mock_payload):
        user, token = verify_google_id_token(db_session, "valid_mock_id_token")
        db_session.commit()
        
        assert user.id == existing.id
        assert user.email == "existing@example.com"
        assert user.display_name == "Original Name"

def test_verify_google_id_token_unverified_email_fails(db_session):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com"
    
    mock_payload = {
        "email": "unverified@example.com",
        "email_verified": False,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "https://accounts.google.com",
    }
    
    with patch("app.services.auth_service._verify_google_token_payload", return_value=mock_payload):
        with pytest.raises(ValueError, match="Google email is not verified"):
            verify_google_id_token(db_session, "unverified_id_token")

def test_verify_google_id_token_not_configured(db_session):
    settings = get_settings()
    orig = settings.GOOGLE_CLIENT_ID
    try:
        settings.GOOGLE_CLIENT_ID = None
        with pytest.raises(ValueError, match="Google SSO is not configured on this server"):
            verify_google_id_token(db_session, "any_token")
    finally:
        settings.GOOGLE_CLIENT_ID = orig
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_auth.py -v`
Expected: FAIL with `ImportError: cannot import name 'verify_google_id_token'`

- [ ] **Step 3: Implement `verify_google_id_token` in `backend/app/services/auth_service.py`**

Add helper `_verify_google_token_payload(id_token: str, client_id: str) -> dict[str, Any]` and `verify_google_id_token(db: Session, id_token: str) -> tuple[User, str]`:
```python
def _verify_google_token_payload(id_token: str, client_id: str) -> dict[str, Any]:
    """Verify Google ID token against Google's public JWKS certs."""
    import httpx
    from jose import jwk
    
    # 1. Fetch unverified header to get kid
    unverified_header = jwt.get_unverified_header(id_token)
    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Invalid Google token: missing key id")

    # 2. Fetch Google public JWKS certs
    resp = httpx.get("https://www.googleapis.com/oauth2/v3/certs", timeout=10.0)
    if resp.status_code != 200:
        raise ValueError("Failed to fetch Google authentication certificates")
    
    keys = resp.json().get("keys", [])
    key_dict = next((k for k in keys if k.get("kid") == kid), None)
    if not key_dict:
        raise ValueError("Google authentication key not found")

    public_key = jwk.construct(key_dict)
    
    # 3. Decode & verify claims
    payload: dict[str, Any] = jwt.decode(
        id_token,
        public_key.to_pem().decode("utf-8"),
        algorithms=["RS256"],
        audience=client_id,
        issuer=["accounts.google.com", "https://accounts.google.com"],
    )
    return payload


def verify_google_id_token(db: Session, id_token: str) -> tuple[User, str]:
    """Verify a Google ID token and return/provision the User and a Lores JWT session."""
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("Google SSO is not configured on this server")

    try:
        payload = _verify_google_token_payload(id_token, settings.GOOGLE_CLIENT_ID)
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Invalid Google ID token: {e}") from e

    if not payload.get("email_verified"):
        raise ValueError("Google email is not verified")

    email = str(payload.get("email", "")).lower().strip()
    if not email:
        raise ValueError("Google ID token missing email claim")

    now = datetime.now(UTC)
    stmt = select(User).where(User.email == email)
    user = db.scalar(stmt)

    if not user:
        name = payload.get("name") or email.split("@")[0].capitalize()
        user = User(email=email, display_name=name)
        db.add(user)

    user.last_login_at = now
    db.flush()

    jwt_token = create_access_token({"sub": str(user.id), "email": user.email})
    return user, jwt_token
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_auth.py -v`
Expected: PASS

---

### Task 3: Backend API Endpoints for Google SSO

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/tests/test_google_auth.py`

**Interfaces:**
- Consumes: `auth_service.verify_google_id_token`, `AuthConfigResponse`, `GoogleAuthRequest`, `TokenResponse`
- Produces: `GET /api/v1/auth/config`, `POST /api/v1/auth/google`

- [ ] **Step 1: Write the failing API endpoint tests**

Add to `backend/tests/test_google_auth.py`:
```python
def test_api_auth_config(client):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
    
    resp = client.get("/api/v1/auth/config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["google_auth_enabled"] is True
    assert data["google_client_id"] == "test-client-id.apps.googleusercontent.com"

def test_api_auth_google_success(client):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
    
    mock_payload = {
        "email": "api_google@example.com",
        "name": "API Google User",
        "email_verified": True,
        "aud": settings.GOOGLE_CLIENT_ID,
        "iss": "accounts.google.com",
    }
    
    with patch("app.services.auth_service._verify_google_token_payload", return_value=mock_payload):
        resp = client.post("/api/v1/auth/google", json={"credential": "mock_valid_token"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "api_google@example.com"
        assert data["user"]["display_name"] == "API Google User"

def test_api_auth_google_invalid_token(client):
    settings = get_settings()
    settings.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com"
    
    with patch("app.services.auth_service._verify_google_token_payload", side_effect=ValueError("Invalid signature")):
        resp = client.post("/api/v1/auth/google", json={"credential": "bad_token"})
        assert resp.status_code == 400
        assert "Invalid signature" in resp.json()["detail"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_auth.py -k "test_api_auth" -v`
Expected: FAIL with 404 or 405 Method Not Allowed

- [ ] **Step 3: Implement endpoints in `backend/app/api/v1/auth.py`**

In `backend/app/api/v1/auth.py`:
```python
from app.config import get_settings
from app.schemas.auth import (
    AuthConfigResponse,
    GoogleAuthRequest,
    OTPRequest,
    OTPResponse,
    OTPVerifyRequest,
    TokenResponse,
    UserRead,
)

settings = get_settings()


@router.get("/config", response_model=AuthConfigResponse)
def get_auth_config() -> dict[str, Any]:
    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID,
        "google_auth_enabled": bool(settings.GOOGLE_CLIENT_ID),
    }


@router.post("/google", response_model=TokenResponse)
def login_with_google(
    req: GoogleAuthRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        user, token = auth_service.verify_google_id_token(db, id_token=req.credential)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    db.commit()
    return {
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": UserRead.model_validate(user),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_auth.py -v`
Expected: PASS

---

### Task 4: Frontend API Client & Types

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/tests/api.test.ts`

**Interfaces:**
- Consumes: Backend endpoints `/api/v1/auth/config` and `/api/v1/auth/google`
- Produces: `api.auth.getConfig()`, `api.auth.loginWithGoogle(credential)`

- [ ] **Step 1: Write failing unit test for `api.auth.getConfig` and `api.auth.loginWithGoogle`**

Add tests to `frontend/tests/api.test.ts`:
```typescript
describe('api.auth extensions', () => {
  it('fetches auth configuration', async () => {
    const mockConfig = { google_client_id: 'test-client-id', google_auth_enabled: true };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockConfig,
    } as Response);

    const config = await api.auth.getConfig();
    expect(config.google_auth_enabled).toBe(true);
    expect(config.google_client_id).toBe('test-client-id');
  });

  it('logs in with Google credential and stores token', async () => {
    const mockToken = {
      access_token: 'google_jwt_token',
      token_type: 'bearer',
      user: { id: 'u1', email: 'test@example.com', display_name: 'Test' },
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockToken,
    } as Response);

    const res = await api.auth.loginWithGoogle('mock_google_credential');
    expect(res.access_token).toBe('google_jwt_token');
    expect(tokenStorage.get()).toBe('google_jwt_token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tests/api.test.ts`
Expected: FAIL with `api.auth.getConfig is not a function`

- [ ] **Step 3: Add types in `frontend/src/types/api.ts` and methods in `frontend/src/lib/api.ts`**

In `frontend/src/types/api.ts`:
```typescript
export interface AuthConfigResponse {
  google_client_id: string | null;
  google_auth_enabled: bool;
}

export interface GoogleAuthRequest {
  credential: string;
}
```

In `frontend/src/lib/api.ts`:
```typescript
    getConfig: (): Promise<AuthConfigResponse> => request<AuthConfigResponse>('/auth/config'),

    loginWithGoogle: async (credential: string): Promise<TokenResponse> => {
      const result = await request<TokenResponse>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      });
      if (result.access_token) {
        tokenStorage.set(result.access_token);
      }
      return result;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- tests/api.test.ts`
Expected: PASS

---

### Task 5: Frontend Google SSO Login UI Integration & Accessibility

**Files:**
- Modify: `frontend/src/components/auth/LoginForm.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/tests/LoginForm.test.tsx`
- Modify: `frontend/tests/a11y-components.test.tsx`

**Interfaces:**
- Consumes: `api.auth.getConfig`, `api.auth.loginWithGoogle`, Google Identity Services JS
- Produces: Google Sign-In button, callback handling, smooth login completion to `App.tsx`

- [ ] **Step 1: Write failing component tests for `LoginForm` with Google SSO**

In `frontend/tests/LoginForm.test.tsx`:
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from '../src/components/auth/LoginForm';
import { api } from '../src/lib/api';

describe('LoginForm with Google SSO', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Google sign in button when Google auth is enabled', async () => {
    vi.spyOn(api.auth, 'getConfig').mockResolvedValueOnce({
      google_client_id: 'mock-client-id.apps.googleusercontent.com',
      google_auth_enabled: true,
    });

    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('google-sso-button')).toBeInTheDocument();
      expect(screen.getByText(/or continue with email/i)).toBeInTheDocument();
    });
  });

  it('hides Google button when Google auth is disabled', async () => {
    vi.spyOn(api.auth, 'getConfig').mockResolvedValueOnce({
      google_client_id: null,
      google_auth_enabled: false,
    });

    render(<LoginForm onOtpRequested={vi.fn()} onLoginSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByTestId('google-sso-button')).not.toBeInTheDocument();
      expect(screen.queryByText(/or continue with email/i)).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- tests/LoginForm.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `LoginForm.tsx` and `App.tsx`**

1. In `LoginForm.tsx`:
   - Accept `onLoginSuccess?: (user: UserRead) => void`.
   - Call `api.auth.getConfig()` on mount.
   - If enabled, initialize Google GIS client with script loading.
   - Render the Google SSO button with Google icon SVG, clean accessible styling, and divider `or continue with email`.
   - Handle Google sign-in responses by calling `api.auth.loginWithGoogle(response.credential)`.
   - Handle error messaging gracefully with `role="alert"`.
2. In `App.tsx`:
   - Pass `onLoginSuccess={loadUserData}` to `LoginForm`.

- [ ] **Step 4: Run component & accessibility tests to verify they pass**

Run: `cd frontend && npm test`
Expected: All tests pass including `vitest-axe` checks on `LoginForm`.

---

### Task 6: Full Verification Pipeline

**Files:**
- Verification only

- [ ] **Step 1: Run complete backend verification suite**

```bash
cd backend
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
../.venv/bin/mypy app
../.venv/bin/pytest -v
```
Expected: 0 ruff errors, 0 format warnings, 0 mypy errors, 100% passing pytests.

- [ ] **Step 2: Run complete frontend verification suite**

```bash
cd frontend
npm run lint
npm run build
npm test
```
Expected: 0 lint errors, clean TypeScript build, 100% passing tests.
