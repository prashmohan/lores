# Universal Google OAuth 2.0 Redirect Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Google Single Sign-On from client-side Google Identity Services (GIS/One-Tap) to a universal, server-side OAuth 2.0 Authorization Code redirect flow that is 100% immune to Firefox Enhanced Tracking Protection, Safari ITP, and content blockers.

**Architecture:** A zero-external-JS frontend button links directly to FastAPI's `/api/v1/auth/google/authorize`, which attaches a signed CSRF state token and redirects to Google's standard OAuth authorization page. Upon consent, Google redirects to `/api/v1/auth/google/callback`, where FastAPI exchanges the code for verified user identity, creates/matches the user account, and redirects to the frontend with a signed Lores session JWT.

**Tech Stack:** FastAPI, Pydantic v2, `python-jose[cryptography]`, `httpx` (async HTTP client), React 18, TypeScript, Tailwind CSS, Vitest, Vitest-Axe.

**Spec:** [`docs/superpowers/specs/2026-08-25-google-oauth-redirect-flow-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-25-google-oauth-redirect-flow-design.md)

## Global Constraints

- **Python Environment:** All backend commands MUST run using `.venv/bin/` (e.g. `../.venv/bin/pytest -v`).
- **Offline Tests:** 100% offline unit/integration test suites using mocks for Google OAuth HTTP endpoints.
- **Accessibility:** Zero WCAG 2.1 AAA violations (`vitest-axe`), $\ge 44 \times 44\text{px}$ touch targets, full keyboard accessibility.
- **Zero Third-Party Client JS:** No external `<script>` tags injected from `accounts.google.com`.
- **Anti-CSRF:** The `state` parameter must be cryptographically signed with `JWT_SECRET` and have a 5-minute expiration.

---

### Task 1: Backend Settings & Environment Configuration

**Files:**
- Modify: [`backend/app/config.py`](file:///home/prmohan/projects/lores/backend/app/config.py)
- Modify: [`backend/tests/test_auth.py`](file:///home/prmohan/projects/lores/backend/tests/test_auth.py)
- Modify: [`docker-compose.yml`](file:///home/prmohan/projects/lores/docker-compose.yml)
- Modify: [`docker-compose.dev.yml`](file:///home/prmohan/projects/lores/docker-compose.dev.yml)
- Modify: [`.env.example`](file:///home/prmohan/projects/lores/.env.example)
- Modify: [`backend/.env`](file:///home/prmohan/projects/lores/backend/.env)
- Modify: [`.env`](file:///home/prmohan/projects/lores/.env)

**Interfaces:**
- Produces: `Settings.GOOGLE_CLIENT_SECRET: str | None = None`

- [ ] **Step 1: Write failing config test**

In [`backend/tests/test_auth.py`](file:///home/prmohan/projects/lores/backend/tests/test_auth.py), add:
```python
def test_google_client_secret_setting():
    from app.config import Settings
    s = Settings(
        GOOGLE_CLIENT_ID="mock-id",
        GOOGLE_CLIENT_SECRET="mock-secret"
    )
    assert s.GOOGLE_CLIENT_ID == "mock-id"
    assert s.GOOGLE_CLIENT_SECRET == "mock-secret"
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && ../.venv/bin/pytest tests/test_auth.py -k test_google_client_secret_setting -v`  
Expected: FAIL (missing field or unexpected keyword argument).

- [ ] **Step 3: Update `backend/app/config.py` and environment files**

In [`backend/app/config.py`](file:///home/prmohan/projects/lores/backend/app/config.py):
```python
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
```

Update `docker-compose.yml` and `docker-compose.dev.yml` to include `- GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}`.  
Update `.env.example`, `backend/.env`, and `.env` to include:
```bash
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ../.venv/bin/pytest tests/test_auth.py -k test_google_client_secret_setting -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_auth.py docker-compose.yml docker-compose.dev.yml .env.example
git commit -m "feat(config): add GOOGLE_CLIENT_SECRET configuration"
```

---

### Task 2: Backend OAuth Service (CSRF State & Token Exchange)

**Files:**
- Modify: [`backend/app/services/auth_service.py`](file:///home/prmohan/projects/lores/backend/app/services/auth_service.py)
- Create: [`backend/tests/test_google_oauth_redirect.py`](file:///home/prmohan/projects/lores/backend/tests/test_google_oauth_redirect.py)

**Interfaces:**
- Produces:
  - `generate_oauth_state(redirect_target: str = "/") -> str`
  - `validate_oauth_state(state: str) -> dict[str, Any]`
  - `exchange_google_code_for_user(db: AsyncSession, code: str, redirect_uri: str) -> tuple[User, str]`

- [ ] **Step 1: Write failing unit tests for state generation, validation, and token exchange**

In [`backend/tests/test_google_oauth_redirect.py`](file:///home/prmohan/projects/lores/backend/tests/test_google_oauth_redirect.py):
```python
import pytest
from app.services.auth_service import (
    generate_oauth_state,
    validate_oauth_state,
    exchange_google_code_for_user,
)

def test_generate_and_validate_oauth_state():
    state = generate_oauth_state(redirect_target="/tree")
    assert isinstance(state, str)
    payload = validate_oauth_state(state)
    assert payload["target"] == "/tree"

def test_validate_oauth_state_tampered_fails():
    with pytest.raises(ValueError, match="Invalid state token"):
        validate_oauth_state("invalid.token.signature")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_oauth_redirect.py -v`  
Expected: FAIL (ImportError / functions not defined).

- [ ] **Step 3: Implement functions in `backend/app/services/auth_service.py`**

```python
import secrets
import httpx
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError

def generate_oauth_state(redirect_target: str = "/") -> str:
    settings = get_settings()
    payload = {
        "nonce": secrets.token_urlsafe(16),
        "target": redirect_target,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        "type": "oauth_state",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def validate_oauth_state(state: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "oauth_state":
            raise ValueError("Invalid state token type")
        return payload
    except JWTError as err:
        raise ValueError("Invalid state token") from err

async def exchange_google_code_for_user(
    db: AsyncSession, code: str, redirect_uri: str
) -> tuple[User, str]:
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("Google OAuth is not configured on this server")

    token_endpoint = "https://oauth2.googleapis.com/token"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            token_endpoint,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code != 200:
            raise ValueError(f"Google token exchange failed: {response.text}")
        data = response.json()

    id_token_jwt = data.get("id_token")
    if not id_token_jwt:
        raise ValueError("Google did not return an id_token")

    # Verify ID token payload using existing verify logic
    user, session_token = await verify_google_id_token(db, id_token_jwt)
    return user, session_token
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_oauth_redirect.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth_service.py backend/tests/test_google_oauth_redirect.py
git commit -m "feat(auth): add OAuth state generator and Google authorization code exchange"
```

---

### Task 3: Backend API Endpoints (`/authorize` & `/callback`)

**Files:**
- Modify: [`backend/app/api/v1/auth.py`](file:///home/prmohan/projects/lores/backend/app/api/v1/auth.py)
- Modify: [`backend/tests/test_google_oauth_redirect.py`](file:///home/prmohan/projects/lores/backend/tests/test_google_oauth_redirect.py)

**Interfaces:**
- Produces:
  - `GET /api/v1/auth/google/authorize` -> `HTTP 302 Redirect` to `accounts.google.com`
  - `GET /api/v1/auth/google/callback` -> `HTTP 302 Redirect` to `{frontend}/?token={jwt}`

- [ ] **Step 1: Write failing API route tests**

In [`backend/tests/test_google_oauth_redirect.py`](file:///home/prmohan/projects/lores/backend/tests/test_google_oauth_redirect.py), add:
```python
def test_google_authorize_redirect(client, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_SECRET", "test-client-secret")
    
    response = client.get("/api/v1/auth/google/authorize", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert "https://accounts.google.com/o/oauth2/v2/auth" in location
    assert "client_id=test-client-id.apps.googleusercontent.com" in location
    assert "response_type=code" in location
    assert "state=" in location
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_oauth_redirect.py -k test_google_authorize_redirect -v`  
Expected: FAIL (404/405).

- [ ] **Step 3: Implement endpoints in `backend/app/api/v1/auth.py`**

Add `GET /google/authorize` and `GET /google/callback`:
```python
from urllib.parse import urlencode
from fastapi.responses import RedirectResponse

@router.get("/google/authorize", response_class=RedirectResponse)
async def google_authorize(request: Request, redirect_target: str = "/"):
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google SSO is not configured.")

    state = generate_oauth_state(redirect_target=redirect_target)
    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/auth/google/callback"

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    }
    google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=google_url, status_code=status.HTTP_302_FOUND)

@router.get("/google/callback", response_class=RedirectResponse)
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if error or not code or not state:
        return RedirectResponse(url="/?error=google_auth_failed", status_code=status.HTTP_302_FOUND)

    try:
        state_payload = validate_oauth_state(state)
    except ValueError:
        return RedirectResponse(url="/?error=invalid_state", status_code=status.HTTP_302_FOUND)

    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/auth/google/callback"

    try:
        user, session_token = await exchange_google_code_for_user(db, code, callback_url)
    except Exception:
        return RedirectResponse(url="/?error=google_exchange_failed", status_code=status.HTTP_302_FOUND)

    target = state_payload.get("target", "/")
    sep = "&" if "?" in target else "?"
    frontend_redirect_url = f"{target}{sep}token={session_token}"
    return RedirectResponse(url=frontend_redirect_url, status_code=status.HTTP_302_FOUND)
```

- [ ] **Step 4: Run API tests to verify passing**

Run: `cd backend && ../.venv/bin/pytest tests/test_google_oauth_redirect.py -v`  
Expected: PASS (all tests passing).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/auth.py backend/tests/test_google_oauth_redirect.py
git commit -m "feat(api): implement Google OAuth authorize and callback redirect endpoints"
```

---

### Task 4: Frontend UI Clean-Up & URL Token Ingestion

**Files:**
- Modify: [`frontend/src/components/auth/LoginForm.tsx`](file:///home/prmohan/projects/lores/frontend/src/components/auth/LoginForm.tsx)
- Modify: [`frontend/src/App.tsx`](file:///home/prmohan/projects/lores/frontend/src/App.tsx)
- Modify: [`frontend/tests/LoginForm.test.tsx`](file:///home/prmohan/projects/lores/frontend/tests/LoginForm.test.tsx)
- Modify: [`frontend/tests/App.test.tsx`](file:///home/prmohan/projects/lores/frontend/tests/App.test.tsx)
- Modify: [`frontend/tests/a11y-components.test.tsx`](file:///home/prmohan/projects/lores/frontend/tests/a11y-components.test.tsx)

**Interfaces:**
- "Continue with Google" renders as `<a href="/api/v1/auth/google/authorize">`
- `App.tsx` parses `?token=...` on mount, calls `tokenStorage.set()`, replaces URL history, and loads user.

- [ ] **Step 1: Write failing frontend tests for redirect button and token ingestion**

In [`frontend/tests/LoginForm.test.tsx`](file:///home/prmohan/projects/lores/frontend/tests/LoginForm.test.tsx), assert that "Continue with Google" is an accessible link pointing to `/api/v1/auth/google/authorize`.  
In [`frontend/tests/App.test.tsx`](file:///home/prmohan/projects/lores/frontend/tests/App.test.tsx), test that when `window.location.search = '?token=my-session-token'`, `App` ingests the token, clears the query param, and loads user data.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd frontend && npm test -- tests/LoginForm.test.tsx tests/App.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Update `LoginForm.tsx` and `App.tsx`**

In [`frontend/src/components/auth/LoginForm.tsx`](file:///home/prmohan/projects/lores/frontend/src/components/auth/LoginForm.tsx):
- Remove all `<script src="https://accounts.google.com/gsi/client">` injection and `window.google` code.
- Render "Continue with Google" as:
```tsx
  <a
    href="/api/v1/auth/google/authorize"
    data-testid="google-sso-button"
    aria-label="Continue with Google"
    className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 active:bg-slate-100 border-2 border-slate-200 text-slate-800 font-bold text-sm transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-3 cursor-pointer no-underline"
  >
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">...</svg>
    <span>Continue with Google</span>
  </a>
```

In [`frontend/src/App.tsx`](file:///home/prmohan/projects/lores/frontend/src/App.tsx):
```tsx
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      tokenStorage.set(tokenFromUrl);
      urlParams.delete('token');
      const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
      window.history.replaceState({}, document.title, `${window.location.pathname}${cleanSearch}`);
      loadUserData();
    }
  }, []);
```

- [ ] **Step 4: Run full test suite & a11y audit**

Run:
```bash
cd frontend
npm run lint
npm run build
npm test
```
Expected: PASS (0 errors, 100% passing tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/auth/LoginForm.tsx frontend/src/App.tsx frontend/tests/
git commit -m "feat(ui): convert Google SSO to universal zero-script redirect with URL token ingestion"
```

---

### Task 5: Full End-to-End Verification Pipeline

**Files:**
- Full codebase

- [ ] **Step 1: Run complete backend verification pipeline**
```bash
cd backend
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
../.venv/bin/mypy app
../.venv/bin/pytest -v
```
Expected: 0 errors, 100% passing tests.

- [ ] **Step 2: Run complete frontend verification pipeline**
```bash
cd ../frontend
npm run lint
npm run build
npm test
```
Expected: 0 errors, 100% passing tests.

- [ ] **Step 3: Commit and push to main**
```bash
git push origin main
```
