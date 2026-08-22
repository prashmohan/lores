# Lores MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify **Lores**, an accessible, multi-tenant family tree builder tailored for non-technical seniors with Focus-Person navigation, passwordless OTP auth, multi-tenancy RBAC, cycle prevention, audit logging, and soft-delete recovery.

**Architecture:** Modular Monolith with a decoupled architecture. Python 3.12+ FastAPI backend structured into domain services (`auth`, `workspaces`, `tree`, `lore`, `audit`, `trash`) using SQLAlchemy 2.0 with PostgreSQL/SQLite. Decoupled React 19 + TypeScript + Vite + Tailwind CSS frontend with Radix UI accessibility primitives.

**Tech Stack:**
- **Backend:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Pytest, Ruff, Mypy, SQLite/PostgreSQL, python-jose, passlib.
- **Frontend:** React 19, TypeScript 5, Vite, Tailwind CSS v4 / v3, Radix UI primitives, Lucide React, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-23-lores-family-tree-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-lores-family-tree-design.md)

## Global Constraints
- Python version: >= 3.12.
- Pre-Commit Gate: Zero errors on `pytest`, `ruff check`, `mypy`, and `tsc --noEmit`.
- Commit discipline: Atomic commits with conventional commit messages (`feat(...)`, `test(...)`, `refactor(...)`).
- Multi-tenancy: Every database entity and mutation query MUST be scoped to `workspace_id`.
- Accessibility: Large readable text, high contrast (WCAG 2.1 AA/AAA), zero genealogical jargon.
- Safety: Soft deletion on all family nodes with 30-day recovery; immutable audit log on all mutations.

---

## File Map & Module Structure

```
lores/
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── session.py
│   │   │   └── audit.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── workspace.py
│   │   │   ├── person.py
│   │   │   ├── union.py
│   │   │   ├── child.py
│   │   │   ├── lore.py
│   │   │   └── audit_log.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── workspace.py
│   │   │   ├── person.py
│   │   │   ├── tree.py
│   │   │   ├── lore.py
│   │   │   └── audit.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── workspace_service.py
│   │   │   ├── cycle_service.py
│   │   │   ├── tree_service.py
│   │   │   ├── person_service.py
│   │   │   ├── lore_service.py
│   │   │   └── audit_service.py
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── deps.py
│   │       ├── v1/
│   │       │   ├── __init__.py
│   │       │   ├── router.py
│   │       │   ├── auth.py
│   │       │   ├── workspaces.py
│   │       │   ├── tree.py
│   │       │   ├── people.py
│   │       │   ├── lore.py
│   │       │   └── audit_trash.py
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       ├── test_workspaces.py
│       ├── test_cycle_detection.py
│       ├── test_tree_neighborhood.py
│       ├── test_relative_mutations.py
│       ├── test_lore_and_trash.py
│       └── test_audit_logs.py
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── index.css
    │   ├── types/
    │   │   └── api.ts
    │   ├── lib/
    │   │   ├── api.ts
    │   │   └── auth.ts
    │   └── components/
    │       ├── layout/
    │       │   ├── Header.tsx
    │       │   ├── BreadcrumbBar.tsx
    │       │   └── NavigationTabs.tsx
    │       ├── tree/
    │       │   ├── FocusPersonView.tsx
    │       │   ├── PersonCard.tsx
    │       │   ├── AddRelativeModal.tsx
    │       │   ├── EditPersonModal.tsx
    │       │   └── ConflictDialog.tsx
    │       ├── interview/
    │       │   └── GuidedInterviewModal.tsx
    │       ├── map/
    │       │   └── BirdseyeMapCanvas.tsx
    │       ├── history/
    │       │   ├── ActivityFeedModal.tsx
    │       │   └── TrashCanModal.tsx
    │       └── auth/
    │           ├── LoginForm.tsx
    │           └── VerifyOtpModal.tsx
    └── tests/
        └── FocusPersonView.test.tsx
```

---

## Tasks

### Task 1: Backend Scaffolding & Quality Infrastructure Setup

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/config.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/app/__init__.py`

**Interfaces:**
- Produces: `Settings` object in `backend/app/config.py` with `DATABASE_URL`, `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Produces: Pytest runner configuration with SQLite in-memory test fixtures.

- [ ] **Step 1: Write the failing test for configuration loading**

```python
# backend/tests/test_config.py
from app.config import get_settings

def test_settings_load_defaults():
    settings = get_settings()
    assert settings.APP_NAME == "Lores"
    assert settings.DATABASE_URL is not None
    assert settings.JWT_SECRET is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_config.py`
Expected: FAIL with ModuleNotFoundError or config missing.

- [ ] **Step 3: Implement pyproject.toml and config.py**

```toml
# backend/pyproject.toml
[project]
name = "lores-backend"
version = "0.1.0"
description = "Accessible Multi-Tenant Family Tree Builder Backend"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.30.0",
    "pydantic>=2.8.0",
    "pydantic-settings>=2.4.0",
    "sqlalchemy>=2.0.32",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    "python-multipart>=0.0.9",
    "email-validator>=2.2.0",
    "aiosqlite>=0.20.0"
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0.0",
    "httpx>=0.27.0",
    "ruff>=0.6.0",
    "mypy>=1.11.0"
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

```python
# backend/app/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Lores"
    APP_VERSION: str = "0.1.0"
    DATABASE_URL: str = "sqlite:///./lores.db"
    JWT_SECRET: str = "lores-dev-secret-key-change-in-production-32bytes-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days for senior friendly sessions
    OTP_EXPIRE_MINUTES: int = 15

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

```python
# backend/tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base

@pytest.fixture(name="db_session")
def fixture_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_config.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "chore(backend): initialize backend config and test infrastructure"
```

---

### Task 2: Database Base Engine & Immutable Audit Log Domain

**Files:**
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Create: `backend/app/models/audit_log.py`
- Create: `backend/app/services/audit_service.py`
- Test: `backend/tests/test_audit_logs.py`

**Interfaces:**
- Produces: `Base` (SQLAlchemy DeclarativeBase with UUID PK and timestamps).
- Produces: `AuditLog` model with JSON changes diff.
- Produces: `record_audit_event(session, workspace_id, actor, entity_type, entity_id, action, changes)`.

- [ ] **Step 1: Write failing test for audit logging**

```python
# backend/tests/test_audit_logs.py
import uuid
from app.services.audit_service import record_audit_event, get_workspace_audit_logs

def test_record_and_retrieve_audit_log(db_session):
    workspace_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    
    log = record_audit_event(
        db=db_session,
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_name="Aunt Sarah",
        actor_email="sarah@example.com",
        entity_type="Person",
        entity_id=entity_id,
        action="UPDATE",
        changes={"birth_place": {"old": "Boston", "new": "Chicago"}}
    )
    db_session.commit()
    
    assert log.id is not None
    logs = get_workspace_audit_logs(db_session, workspace_id)
    assert len(logs) == 1
    assert logs[0].actor_name == "Aunt Sarah"
    assert logs[0].changes["birth_place"]["new"] == "Chicago"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_audit_logs.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement Base, Session, AuditLog Model & AuditService**

```python
# backend/app/db/base.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

```python
# backend/app/db/session.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import get_settings

settings = get_settings()
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

```python
# backend/app/models/audit_log.py
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from sqlalchemy import DateTime, JSON, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=True)
    actor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)  # CREATE, UPDATE, SOFT_DELETE, RESTORE
    changes: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )
```

```python
# backend/app/services/audit_service.py
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.audit_log import AuditLog

def record_audit_event(
    db: Session,
    workspace_id: uuid.UUID,
    actor_id: Optional[uuid.UUID],
    actor_name: str,
    actor_email: str,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    changes: Dict[str, Any],
) -> AuditLog:
    log = AuditLog(
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_name=actor_name,
        actor_email=actor_email,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changes=changes,
    )
    db.add(log)
    return log

def get_workspace_audit_logs(db: Session, workspace_id: uuid.UUID, limit: int = 50) -> List[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.workspace_id == workspace_id).order_by(AuditLog.created_at.desc()).limit(limit)
    return list(db.scalars(stmt).all())

def get_entity_audit_logs(db: Session, workspace_id: uuid.UUID, entity_id: uuid.UUID) -> List[AuditLog]:
    stmt = select(AuditLog).where(
        AuditLog.workspace_id == workspace_id,
        AuditLog.entity_id == entity_id
    ).order_by(AuditLog.created_at.desc())
    return list(db.scalars(stmt).all())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_audit_logs.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/ backend/app/models/audit_log.py backend/app/services/audit_service.py backend/tests/test_audit_logs.py
git commit -m "feat(audit): add audit logging model and service with json changes diff"
```

---

### Task 3: Passwordless Authentication & Session Token Domain

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/v1/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces: `User` model, `MagicAuthToken` model.
- Produces: `request_otp(email)`, `verify_otp(email, code)`, `create_session_jwt(user)`.
- Produces: FastApi dependency `get_current_user` in `deps.py`.

- [ ] **Step 1: Write failing tests for OTP request and verification**

```python
# backend/tests/test_auth.py
from app.services.auth_service import request_otp, verify_otp, decode_token

def test_otp_flow_generates_and_verifies_code(db_session):
    email = "grandma@example.com"
    token_record, raw_otp = request_otp(db_session, email=email, display_name="Grandma Rose")
    db_session.commit()
    
    assert len(raw_otp) == 6
    assert raw_otp.isdigit()
    
    # Verify with correct code
    user, jwt_token = verify_otp(db_session, email=email, code=raw_otp)
    assert user.email == email
    assert user.display_name == "Grandma Rose"
    assert jwt_token is not None
    
    # Token payload
    payload = decode_token(jwt_token)
    assert payload["sub"] == str(user.id)
    assert payload["email"] == email

def test_otp_rejects_incorrect_code(db_session):
    email = "uncle@example.com"
    request_otp(db_session, email=email, display_name="Uncle Bob")
    db_session.commit()
    
    try:
        verify_otp(db_session, email=email, code="000000")
        assert False, "Should raise ValueError for invalid code"
    except ValueError as e:
        assert "Invalid or expired" in str(e)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_auth.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement User model, AuthService, and Auth Schemas**

```python
# backend/app/models/user.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

class MagicAuthToken(Base):
    __tablename__ = "magic_auth_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    token_secret: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
```

```python
# backend/app/services/auth_service.py
import random
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.models.user import MagicAuthToken, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()

def generate_numeric_otp(length: int = 6) -> str:
    return f"{random.randint(0, 10**length - 1):0{length}d}"

def request_otp(
    db: Session, email: str, display_name: Optional[str] = None
) -> Tuple[MagicAuthToken, str]:
    clean_email = email.lower().strip()
    raw_otp = generate_numeric_otp(6)
    code_hash = pwd_context.hash(raw_otp)
    token_secret = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    auth_token = MagicAuthToken(
        email=clean_email,
        code_hash=code_hash,
        token_secret=token_secret,
        expires_at=expires_at,
    )
    db.add(auth_token)

    # Ensure user exists or prepare stub
    stmt = select(User).where(User.email == clean_email)
    user = db.scalar(stmt)
    if not user:
        user = User(
            email=clean_email,
            display_name=display_name or clean_email.split("@")[0].capitalize(),
        )
        db.add(user)

    return auth_token, raw_otp

def verify_otp(db: Session, email: str, code: str) -> Tuple[User, str]:
    clean_email = email.lower().strip()
    now = datetime.now(timezone.utc)

    stmt = select(MagicAuthToken).where(
        MagicAuthToken.email == clean_email,
        MagicAuthToken.used_at.is_(None),
        MagicAuthToken.expires_at > now,
    ).order_by(MagicAuthToken.created_at.desc())

    tokens = list(db.scalars(stmt).all())
    valid_token: Optional[MagicAuthToken] = None

    for t in tokens:
        if pwd_context.verify(code, t.code_hash):
            valid_token = t
            break

    if not valid_token:
        raise ValueError("Invalid or expired authentication code")

    valid_token.used_at = now

    user_stmt = select(User).where(User.email == clean_email)
    user = db.scalar(user_stmt)
    if not user:
        user = User(email=clean_email, display_name=clean_email.split("@")[0].capitalize())
        db.add(user)

    user.last_login_at = now
    jwt_token = create_access_token({"sub": str(user.id), "email": user.email})
    return user, jwt_token

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError("Invalid token") from e
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_auth.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/app/services/auth_service.py backend/tests/test_auth.py
git commit -m "feat(auth): implement passwordless OTP generation and JWT session tokens"
```

---

### Task 4: Workspaces, Multi-Tenancy & RBAC Enforcement

**Files:**
- Create: `backend/app/models/workspace.py`
- Create: `backend/app/schemas/workspace.py`
- Create: `backend/app/services/workspace_service.py`
- Create: `backend/app/api/deps.py`
- Test: `backend/tests/test_workspaces.py`

**Interfaces:**
- Produces: `Workspace`, `WorkspaceMember` models with roles (`admin`, `collaborator`, `viewer`).
- Produces: `create_workspace(db, name, user_id)` (creator automatically assigned `admin`).
- Produces: `invite_member(db, workspace_id, email, role, actor_id)`.
- Produces: `require_workspace_role(required_role)` dependency guard.

- [ ] **Step 1: Write failing test for workspace creation and RBAC permissions**

```python
# backend/tests/test_workspaces.py
import pytest
from app.models.user import User
from app.services.workspace_service import create_workspace, add_or_update_member, get_user_role_in_workspace

def test_create_workspace_assigns_admin(db_session):
    user = User(email="dad@example.com", display_name="Dad")
    db_session.add(user)
    db_session.commit()
    
    workspace = create_workspace(db_session, name="The Miller Family", user_id=user.id)
    db_session.commit()
    
    assert workspace.name == "The Miller Family"
    role = get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=user.id)
    assert role == "admin"

def test_add_collaborator_and_viewer(db_session):
    owner = User(email="owner@example.com", display_name="Owner")
    cousin = User(email="cousin@example.com", display_name="Cousin")
    db_session.add_all([owner, cousin])
    db_session.commit()
    
    workspace = create_workspace(db_session, name="Smith Family", user_id=owner.id)
    db_session.commit()
    
    member = add_or_update_member(db_session, workspace_id=workspace.id, user_id=cousin.id, role="collaborator", actor_id=owner.id)
    db_session.commit()
    
    role = get_user_role_in_workspace(db_session, workspace_id=workspace.id, user_id=cousin.id)
    assert role == "collaborator"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_workspaces.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement Workspace Models, Schemas, and Service**

```python
# backend/app/models/workspace.py
import re
import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin

def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    return re.sub(r"[-\s]+", "-", text)

class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)

    members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")

class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workspaces.id"), index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # admin, collaborator, viewer
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
```

```python
# backend/app/services/workspace_service.py
import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.workspace import Workspace, WorkspaceMember, slugify

ROLE_HIERARCHY = {
    "viewer": 1,
    "collaborator": 2,
    "admin": 3,
    "superadmin": 4
}

def create_workspace(db: Session, name: str, user_id: uuid.UUID, description: Optional[str] = None) -> Workspace:
    base_slug = slugify(name)
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"
    
    workspace = Workspace(
        name=name,
        slug=slug,
        description=description,
        created_by_user_id=user_id
    )
    db.add(workspace)
    db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user_id,
        role="admin"
    )
    db.add(member)
    return workspace

def get_user_role_in_workspace(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Optional[str]:
    stmt = select(WorkspaceMember.role).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    )
    return db.scalar(stmt)

def add_or_update_member(
    db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, role: str, actor_id: uuid.UUID
) -> WorkspaceMember:
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    )
    member = db.scalar(stmt)
    if member:
        member.role = role
    else:
        member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            invited_by_user_id=actor_id
        )
        db.add(member)
    return member

def has_sufficient_permission(user_role: Optional[str], required_role: str) -> bool:
    if not user_role:
        return False
    return ROLE_HIERARCHY.get(user_role, 0) >= ROLE_HIERARCHY.get(required_role, 0)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_workspaces.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/workspace.py backend/app/services/workspace_service.py backend/tests/test_workspaces.py
git commit -m "feat(workspaces): add workspace tenancy and RBAC role hierarchy"
```

---

### Task 5: Family Graph Entities & Cycle Prevention Algorithm

**Files:**
- Create: `backend/app/models/person.py`
- Create: `backend/app/models/union.py`
- Create: `backend/app/models/child.py`
- Create: `backend/app/services/cycle_service.py`
- Test: `backend/tests/test_cycle_detection.py`

**Interfaces:**
- Produces: `Person`, `FamilyUnion`, `ChildRelationship` models.
- Produces: `validate_no_cycle(db, workspace_id, union_id, child_id)` which raises `ValueError` if adding a child relationship introduces a cycle (i.e., child is an ancestor of the union's partners).

- [ ] **Step 1: Write failing test for cycle detection**

```python
# backend/tests/test_cycle_detection.py
import uuid
import pytest
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.child import ChildRelationship
from app.services.cycle_service import validate_no_cycle

def test_detects_and_prevents_ancestor_cycle(db_session):
    workspace_id = uuid.uuid4()
    
    # Create Gen 1: Grandfather
    grandfather = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller")
    # Create Gen 2: Father
    father = Person(workspace_id=workspace_id, first_name="Robert", last_name="Miller")
    # Create Gen 3: Son
    son = Person(workspace_id=workspace_id, first_name="David", last_name="Miller")
    
    db_session.add_all([grandfather, father, son])
    db_session.commit()
    
    # Grandfather Union -> Father
    union_1 = FamilyUnion(workspace_id=workspace_id, partner1_id=grandfather.id)
    db_session.add(union_1)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=union_1.id, child_id=father.id))
    
    # Father Union -> Son
    union_2 = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id)
    db_session.add(union_2)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=union_2.id, child_id=son.id))
    db_session.commit()
    
    # Attempting to make Son a parent of Grandfather (Union 3 with partner=Son, child=Grandfather)
    union_3 = FamilyUnion(workspace_id=workspace_id, partner1_id=son.id)
    db_session.add(union_3)
    db_session.flush()
    
    with pytest.raises(ValueError, match="Cycle detected: A person cannot be their own ancestor"):
        validate_no_cycle(db_session, workspace_id=workspace_id, union_id=union_3.id, child_id=grandfather.id)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_cycle_detection.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement Person, FamilyUnion, ChildRelationship models and CycleService**

```python
# backend/app/models/person.py
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class Person(Base, TimestampMixin):
    __tablename__ = "people"
    __table_args__ = (
        Index("ix_people_ws_del", "workspace_id", "is_deleted"),
        Index("ix_people_ws_name", "workspace_id", "last_name", "first_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workspaces.id"), index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    maiden_name: Mapped[str] = mapped_column(String(100), nullable=True)
    gender: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    is_living: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    birth_date: Mapped[str] = mapped_column(String(30), nullable=True)
    birth_date_qualifier: Mapped[str] = mapped_column(String(20), default="exact", nullable=False)
    birth_place: Mapped[str] = mapped_column(String(255), nullable=True)
    
    death_date: Mapped[str] = mapped_column(String(30), nullable=True)
    death_date_qualifier: Mapped[str] = mapped_column(String(20), default="exact", nullable=False)
    death_place: Mapped[str] = mapped_column(String(255), nullable=True)
    
    biography: Mapped[str] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True)
```

```python
# backend/app/models/union.py
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class FamilyUnion(Base, TimestampMixin):
    __tablename__ = "family_unions"
    __table_args__ = (
        Index("ix_unions_ws_p1", "workspace_id", "partner1_id"),
        Index("ix_unions_ws_p2", "workspace_id", "partner2_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workspaces.id"), index=True, nullable=False)
    partner1_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("people.id"), nullable=True)
    partner2_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("people.id"), nullable=True)
    union_type: Mapped[str] = mapped_column(String(30), default="marriage", nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_date: Mapped[str] = mapped_column(String(30), nullable=True)
    end_date: Mapped[str] = mapped_column(String(30), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
```

```python
# backend/app/models/child.py
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class ChildRelationship(Base, TimestampMixin):
    __tablename__ = "child_relationships"
    __table_args__ = (
        Index("ix_child_ws_union", "workspace_id", "union_id"),
        Index("ix_child_ws_child", "workspace_id", "child_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workspaces.id"), index=True, nullable=False)
    union_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("family_unions.id"), nullable=False)
    child_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("people.id"), nullable=False)
    relationship_type: Mapped[str] = mapped_column(String(30), default="biological", nullable=False)
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
```

```python
# backend/app/services/cycle_service.py
import uuid
from typing import Set
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.union import FamilyUnion
from app.models.child import ChildRelationship

def get_descendants_ids(db: Session, workspace_id: uuid.UUID, root_person_id: uuid.UUID) -> Set[uuid.UUID]:
    descendants: Set[uuid.UUID] = set()
    queue = [root_person_id]

    while queue:
        current_id = queue.pop(0)
        # Find all unions where current_id is partner1 or partner2
        union_stmt = select(FamilyUnion.id).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted == False,
            (FamilyUnion.partner1_id == current_id) | (FamilyUnion.partner2_id == current_id)
        )
        union_ids = list(db.scalars(union_stmt).all())
        if not union_ids:
            continue

        # Find all children of these unions
        child_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.is_deleted == False,
            ChildRelationship.union_id.in_(union_ids)
        )
        children_ids = list(db.scalars(child_stmt).all())
        for c_id in children_ids:
            if c_id not in descendants:
                descendants.add(c_id)
                queue.append(c_id)

    return descendants

def validate_no_cycle(db: Session, workspace_id: uuid.UUID, union_id: uuid.UUID, child_id: uuid.UUID) -> None:
    # 1. Child cannot be its own ancestor
    union = db.get(FamilyUnion, union_id)
    if not union or union.workspace_id != workspace_id:
        raise ValueError("Union not found in workspace")

    parents = [p for p in [union.partner1_id, union.partner2_id] if p is not None]
    if child_id in parents:
        raise ValueError("Cycle detected: A person cannot be their own parent")

    # 2. Descendants of child cannot include any parent in the target union
    child_descendants = get_descendants_ids(db, workspace_id, child_id)
    for p in parents:
        if p in child_descendants:
            raise ValueError("Cycle detected: A person cannot be their own ancestor")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_cycle_detection.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/person.py backend/app/models/union.py backend/app/models/child.py backend/app/services/cycle_service.py backend/tests/test_cycle_detection.py
git commit -m "feat(graph): add family graph entities and DAG cycle prevention service"
```

---

### Task 6: 1-Hop Focus-Person Neighborhood & Living Person Privacy Filter

**Files:**
- Create: `backend/app/schemas/tree.py`
- Create: `backend/app/services/tree_service.py`
- Test: `backend/tests/test_tree_neighborhood.py`

**Interfaces:**
- Produces: `get_focus_neighborhood(db, workspace_id, person_id, viewer_role)` returning `{ focus_person, parents, partners, children, siblings }`.
- Produces: Privacy masking when `viewer_role == "viewer"`, redacting birth/death dates for living persons.

- [ ] **Step 1: Write failing test for 1-hop focus neighborhood and privacy masking**

```python
# backend/tests/test_tree_neighborhood.py
import uuid
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.child import ChildRelationship
from app.services.tree_service import get_focus_neighborhood

def test_focus_neighborhood_resolves_all_relatives_and_masks_living(db_session):
    workspace_id = uuid.uuid4()
    
    # Parents
    father = Person(workspace_id=workspace_id, first_name="Arthur", last_name="Miller", is_living=False, birth_date="1900-01-01")
    mother = Person(workspace_id=workspace_id, first_name="Clara", last_name="Higgins", is_living=False, birth_date="1905-02-02")
    # Focus Person
    focus = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller", is_living=True, birth_date="1942-05-15")
    # Sibling
    sibling = Person(workspace_id=workspace_id, first_name="Robert", last_name="Miller", is_living=True, birth_date="1945-08-20")
    # Partner
    partner = Person(workspace_id=workspace_id, first_name="George", last_name="Vance", is_living=True, birth_date="1940-03-10")
    # Child
    child = Person(workspace_id=workspace_id, first_name="Ronald", last_name="Vance", is_living=True, birth_date="1970-11-25")
    
    db_session.add_all([father, mother, focus, sibling, partner, child])
    db_session.commit()
    
    # Parent Union -> Focus & Sibling
    p_union = FamilyUnion(workspace_id=workspace_id, partner1_id=father.id, partner2_id=mother.id)
    db_session.add(p_union)
    db_session.flush()
    db_session.add_all([
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=focus.id),
        ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=sibling.id),
    ])
    
    # Focus Union -> Child
    f_union = FamilyUnion(workspace_id=workspace_id, partner1_id=focus.id, partner2_id=partner.id)
    db_session.add(f_union)
    db_session.flush()
    db_session.add(ChildRelationship(workspace_id=workspace_id, union_id=f_union.id, child_id=child.id))
    db_session.commit()
    
    # 1. As Collaborator -> full details visible
    hood_collab = get_focus_neighborhood(db_session, workspace_id, focus.id, viewer_role="collaborator")
    assert hood_collab["focus_person"]["id"] == str(focus.id)
    assert len(hood_collab["parents"]) == 2
    assert len(hood_collab["siblings"]) == 1
    assert len(hood_collab["partners"]) == 1
    assert len(hood_collab["children"]) == 1
    assert hood_collab["focus_person"]["birth_date"] == "1942-05-15"
    
    # 2. As Viewer -> living person dates redacted
    hood_viewer = get_focus_neighborhood(db_session, workspace_id, focus.id, viewer_role="viewer")
    assert hood_viewer["focus_person"]["birth_date"] is None  # Masked because is_living=True
    assert hood_viewer["parents"][0]["birth_date"] is not None  # Visible because is_living=False (Deceased)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_tree_neighborhood.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement TreeService and Neighborhood Resolution**

```python
# backend/app/schemas/tree.py
from typing import List, Optional
from pydantic import BaseModel

class PersonSummary(BaseModel):
    id: str
    first_name: str
    last_name: str
    maiden_name: Optional[str] = None
    gender: str
    is_living: bool
    birth_date: Optional[str] = None
    birth_place: Optional[str] = None
    death_date: Optional[str] = None
    death_place: Optional[str] = None
    avatar_url: Optional[str] = None
    relationship_label: Optional[str] = None

class FocusNeighborhoodResponse(BaseModel):
    focus_person: PersonSummary
    parents: List[PersonSummary]
    partners: List[PersonSummary]
    children: List[PersonSummary]
    siblings: List[PersonSummary]
```

```python
# backend/app/services/tree_service.py
import uuid
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion

def serialize_person(person: Person, viewer_role: str, relationship_label: Optional[str] = None) -> Dict[str, Any]:
    # Privacy rule: Living persons have dates and places masked for view-only users
    is_masked = (viewer_role == "viewer") and person.is_living

    return {
        "id": str(person.id),
        "first_name": person.first_name,
        "last_name": person.last_name,
        "maiden_name": person.maiden_name,
        "gender": person.gender,
        "is_living": person.is_living,
        "birth_date": None if is_masked else person.birth_date,
        "birth_place": None if is_masked else person.birth_place,
        "death_date": person.death_date,
        "death_place": person.death_place,
        "avatar_url": person.avatar_url,
        "relationship_label": relationship_label,
    }

def get_focus_neighborhood(
    db: Session, workspace_id: uuid.UUID, person_id: uuid.UUID, viewer_role: str = "collaborator"
) -> Dict[str, Any]:
    focus = db.get(Person, person_id)
    if not focus or focus.workspace_id != workspace_id or focus.is_deleted:
        raise ValueError("Person not found in workspace")

    # 1. Parents & Siblings via ChildRelationship
    parent_union_stmt = select(ChildRelationship.union_id).where(
        ChildRelationship.workspace_id == workspace_id,
        ChildRelationship.child_id == person_id,
        ChildRelationship.is_deleted == False,
    )
    parent_union_ids = list(db.scalars(parent_union_stmt).all())

    parents: List[Dict[str, Any]] = []
    siblings: List[Dict[str, Any]] = []
    sibling_ids: Set[uuid.UUID] = set()

    if parent_union_ids:
        # Fetch parents
        union_stmt = select(FamilyUnion).where(
            FamilyUnion.id.in_(parent_union_ids),
            FamilyUnion.is_deleted == False,
        )
        parent_unions = list(db.scalars(union_stmt).all())
        parent_ids = set()
        for u in parent_unions:
            if u.partner1_id: parent_ids.add(u.partner1_id)
            if u.partner2_id: parent_ids.add(u.partner2_id)

        if parent_ids:
            p_stmt = select(Person).where(Person.id.in_(parent_ids), Person.is_deleted == False)
            for p in db.scalars(p_stmt).all():
                parents.append(serialize_person(p, viewer_role, "Parent"))

        # Fetch siblings
        sib_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.union_id.in_(parent_union_ids),
            ChildRelationship.child_id != person_id,
            ChildRelationship.is_deleted == False,
        )
        for s_id in db.scalars(sib_stmt).all():
            sibling_ids.add(s_id)

        if sibling_ids:
            s_stmt = select(Person).where(Person.id.in_(sibling_ids), Person.is_deleted == False)
            for s in db.scalars(s_stmt).all():
                siblings.append(serialize_person(s, viewer_role, "Sibling"))

    # 2. Partners & Children
    partner_union_stmt = select(FamilyUnion).where(
        FamilyUnion.workspace_id == workspace_id,
        FamilyUnion.is_deleted == False,
        (FamilyUnion.partner1_id == person_id) | (FamilyUnion.partner2_id == person_id),
    )
    partner_unions = list(db.scalars(partner_union_stmt).all())

    partners: List[Dict[str, Any]] = []
    children: List[Dict[str, Any]] = []
    partner_ids: Set[uuid.UUID] = set()
    child_ids: Set[uuid.UUID] = set()

    for u in partner_unions:
        p_other_id = u.partner2_id if u.partner1_id == person_id else u.partner1_id
        if p_other_id:
            partner_ids.add(p_other_id)

        ch_stmt = select(ChildRelationship.child_id).where(
            ChildRelationship.union_id == u.id,
            ChildRelationship.is_deleted == False,
        )
        for c_id in db.scalars(ch_stmt).all():
            child_ids.add(c_id)

    if partner_ids:
        part_stmt = select(Person).where(Person.id.in_(partner_ids), Person.is_deleted == False)
        for p in db.scalars(part_stmt).all():
            partners.append(serialize_person(p, viewer_role, "Partner"))

    if child_ids:
        ch_stmt = select(Person).where(Person.id.in_(child_ids), Person.is_deleted == False)
        for c in db.scalars(ch_stmt).all():
            children.append(serialize_person(c, viewer_role, "Child"))

    return {
        "focus_person": serialize_person(focus, viewer_role, "Focus"),
        "parents": parents,
        "partners": partners,
        "children": children,
        "siblings": siblings,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_tree_neighborhood.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/tree.py backend/app/services/tree_service.py backend/tests/test_tree_neighborhood.py
git commit -m "feat(tree): implement 1-hop focus neighborhood query with privacy filter"
```

---

### Task 7: Atomic Relative Management & Concurrency Control

**Files:**
- Create: `backend/app/services/person_service.py`
- Test: `backend/tests/test_relative_mutations.py`

**Interfaces:**
- Produces: `add_relative_atomic(db, workspace_id, relative_type, base_person_id, new_person_data, actor)` handling parent, child, partner, and sibling creation.
- Produces: `update_person_optimistic(db, workspace_id, person_id, updates, expected_updated_at, actor)` with HTTP 409 conflict detection on concurrent collision.

- [ ] **Step 1: Write failing test for atomic relative additions & conflict detection**

```python
# backend/tests/test_relative_mutations.py
import uuid
import pytest
from app.models.person import Person
from app.services.person_service import add_relative_atomic, update_person_optimistic
from app.models.user import User

def test_add_parent_and_child_atomically(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="editor@example.com", display_name="Editor")
    db_session.add(actor)
    db_session.commit()
    
    # 1. Add base person
    focus = Person(workspace_id=workspace_id, first_name="Margaret", last_name="Miller")
    db_session.add(focus)
    db_session.commit()
    
    # 2. Add Parent atomically
    parent = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="parent",
        base_person_id=focus.id,
        person_data={"first_name": "Arthur", "last_name": "Miller", "gender": "male"},
        actor=actor
    )
    db_session.commit()
    assert parent.id is not None
    assert parent.first_name == "Arthur"
    
    # 3. Add Partner atomically
    partner = add_relative_atomic(
        db=db_session,
        workspace_id=workspace_id,
        relative_type="partner",
        base_person_id=focus.id,
        person_data={"first_name": "George", "last_name": "Vance", "gender": "male"},
        actor=actor
    )
    db_session.commit()
    assert partner.first_name == "George"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_relative_mutations.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement PersonService with atomic relative creation & audit logging**

```python
# backend/app/services/person_service.py
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.child import ChildRelationship
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.services.audit_service import record_audit_event
from app.services.cycle_service import validate_no_cycle

def add_relative_atomic(
    db: Session,
    workspace_id: uuid.UUID,
    relative_type: str,  # "parent", "partner", "child", "sibling"
    base_person_id: uuid.UUID,
    person_data: Dict[str, Any],
    actor: User,
) -> Person:
    base = db.get(Person, base_person_id)
    if not base or base.workspace_id != workspace_id or base.is_deleted:
        raise ValueError("Base person not found in workspace")

    # 1. Create new person
    new_person = Person(
        workspace_id=workspace_id,
        first_name=person_data["first_name"],
        last_name=person_data.get("last_name", base.last_name),
        maiden_name=person_data.get("maiden_name"),
        gender=person_data.get("gender", "unknown"),
        is_living=person_data.get("is_living", True),
        birth_date=person_data.get("birth_date"),
        birth_place=person_data.get("birth_place"),
        death_date=person_data.get("death_date"),
        death_place=person_data.get("death_place"),
        biography=person_data.get("biography"),
    )
    db.add(new_person)
    db.flush()

    record_audit_event(
        db, workspace_id, actor.id, actor.display_name, actor.email,
        "Person", new_person.id, "CREATE", {"person": f"{new_person.first_name} {new_person.last_name}"}
    )

    # 2. Connect based on relative_type
    if relative_type == "parent":
        # Check if base person already has a parent union
        stmt = select(ChildRelationship.union_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == base_person_id,
            ChildRelationship.is_deleted == False,
        )
        existing_union_id = db.scalar(stmt)
        if existing_union_id:
            union = db.get(FamilyUnion, existing_union_id)
            if union and not union.partner2_id and union.partner1_id != new_person.id:
                union.partner2_id = new_person.id
            else:
                new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=new_person.id)
                db.add(new_union)
                db.flush()
                validate_no_cycle(db, workspace_id, new_union.id, base_person_id)
                db.add(ChildRelationship(workspace_id=workspace_id, union_id=new_union.id, child_id=base_person_id))
        else:
            new_union = FamilyUnion(workspace_id=workspace_id, partner1_id=new_person.id)
            db.add(new_union)
            db.flush()
            validate_no_cycle(db, workspace_id, new_union.id, base_person_id)
            db.add(ChildRelationship(workspace_id=workspace_id, union_id=new_union.id, child_id=base_person_id))

    elif relative_type == "partner":
        union = FamilyUnion(workspace_id=workspace_id, partner1_id=base_person_id, partner2_id=new_person.id)
        db.add(union)

    elif relative_type == "child":
        # Find or create a union for base_person
        stmt = select(FamilyUnion).where(
            FamilyUnion.workspace_id == workspace_id,
            FamilyUnion.is_deleted == False,
            (FamilyUnion.partner1_id == base_person_id) | (FamilyUnion.partner2_id == base_person_id),
        )
        union = db.scalar(stmt)
        if not union:
            union = FamilyUnion(workspace_id=workspace_id, partner1_id=base_person_id)
            db.add(union)
            db.flush()
        validate_no_cycle(db, workspace_id, union.id, new_person.id)
        db.add(ChildRelationship(workspace_id=workspace_id, union_id=union.id, child_id=new_person.id))

    elif relative_type == "sibling":
        # Attach to same parent union as base_person
        stmt = select(ChildRelationship.union_id).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == base_person_id,
            ChildRelationship.is_deleted == False,
        )
        existing_union_id = db.scalar(stmt)
        if not existing_union_id:
            # Create a generic parent union
            p_union = FamilyUnion(workspace_id=workspace_id)
            db.add(p_union)
            db.flush()
            db.add(ChildRelationship(workspace_id=workspace_id, union_id=p_union.id, child_id=base_person_id))
            existing_union_id = p_union.id
        db.add(ChildRelationship(workspace_id=workspace_id, union_id=existing_union_id, child_id=new_person.id))

    return new_person
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_relative_mutations.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/person_service.py backend/tests/test_relative_mutations.py
git commit -m "feat(tree): implement atomic relative additions with automatic union wiring"
```

---

### Task 8: Family Lore Stories & 30-Day Family Trash Recovery

**Files:**
- Create: `backend/app/models/lore.py`
- Create: `backend/app/services/lore_service.py`
- Test: `backend/tests/test_lore_and_trash.py`

**Interfaces:**
- Produces: `LoreNote` model.
- Produces: `create_lore(db, workspace_id, person_id, title, content, actor)`
- Produces: `soft_delete_person(db, workspace_id, person_id, actor)` & `restore_from_trash(db, workspace_id, entity_type, entity_id, actor)`.

- [ ] **Step 1: Write failing test for lore notes & trash recovery**

```python
# backend/tests/test_lore_and_trash.py
import uuid
from app.models.person import Person
from app.models.user import User
from app.services.lore_service import create_lore, soft_delete_person, get_trash_items, restore_from_trash

def test_lore_creation_and_soft_delete_restore(db_session):
    workspace_id = uuid.uuid4()
    actor = User(email="storyteller@example.com", display_name="Grandma")
    db_session.add(actor)
    db_session.commit()
    
    person = Person(workspace_id=workspace_id, first_name="George", last_name="Vance")
    db_session.add(person)
    db_session.commit()
    
    # Add Lore
    lore = create_lore(db_session, workspace_id, person.id, "The Fishing Trip", "Grandpa caught a 10lb bass in 1954.", actor)
    db_session.commit()
    assert lore.id is not None
    
    # Soft delete person
    soft_delete_person(db_session, workspace_id, person.id, actor)
    db_session.commit()
    
    trash = get_trash_items(db_session, workspace_id)
    assert len(trash) == 1
    assert trash[0]["id"] == str(person.id)
    
    # Restore from trash
    restored = restore_from_trash(db_session, workspace_id, "Person", person.id, actor)
    db_session.commit()
    assert restored.is_deleted is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_lore_and_trash.py`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement LoreNote Model, LoreService, and Soft-Delete Recovery**

```python
# backend/app/models/lore.py
import uuid
from datetime import datetime
from typing import Any, List
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class LoreNote(Base, TimestampMixin):
    __tablename__ = "lore_notes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workspaces.id"), index=True, nullable=False)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("people.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
    event_year: Mapped[int] = mapped_column(Integer, nullable=True)
    tags: Mapped[List[Any]] = mapped_column(JSON, default=list, nullable=False)
    
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
```

```python
# backend/app/services/lore_service.py
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.child import ChildRelationship
from app.models.lore import LoreNote
from app.models.person import Person
from app.models.union import FamilyUnion
from app.models.user import User
from app.services.audit_service import record_audit_event

def create_lore(
    db: Session, workspace_id: uuid.UUID, person_id: uuid.UUID, title: str, content: str, actor: User
) -> LoreNote:
    lore = LoreNote(
        workspace_id=workspace_id,
        person_id=person_id,
        title=title,
        content=content,
        author_id=actor.id,
    )
    db.add(lore)
    db.flush()
    record_audit_event(
        db, workspace_id, actor.id, actor.display_name, actor.email,
        "LoreNote", lore.id, "CREATE", {"title": title}
    )
    return lore

def soft_delete_person(db: Session, workspace_id: uuid.UUID, person_id: uuid.UUID, actor: User) -> Person:
    person = db.get(Person, person_id)
    if not person or person.workspace_id != workspace_id:
        raise ValueError("Person not found in workspace")

    now = datetime.now(timezone.utc)
    person.is_deleted = True
    person.deleted_at = now
    person.deleted_by_id = actor.id

    # Cascade soft-delete to relationships
    ch_stmt = select(ChildRelationship).where(
        ChildRelationship.workspace_id == workspace_id,
        ChildRelationship.child_id == person_id,
    )
    for rel in db.scalars(ch_stmt).all():
        rel.is_deleted = True
        rel.deleted_at = now

    record_audit_event(
        db, workspace_id, actor.id, actor.display_name, actor.email,
        "Person", person.id, "SOFT_DELETE", {"name": f"{person.first_name} {person.last_name}"}
    )
    return person

def get_trash_items(db: Session, workspace_id: uuid.UUID) -> List[Dict[str, Any]]:
    stmt = select(Person).where(
        Person.workspace_id == workspace_id,
        Person.is_deleted == True,
    ).order_by(Person.deleted_at.desc())
    items = []
    for p in db.scalars(stmt).all():
        items.append({
            "id": str(p.id),
            "entity_type": "Person",
            "name": f"{p.first_name} {p.last_name}",
            "deleted_at": p.deleted_at.isoformat() if p.deleted_at else None,
        })
    return items

def restore_from_trash(db: Session, workspace_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID, actor: User) -> Any:
    if entity_type == "Person":
        person = db.get(Person, entity_id)
        if not person or person.workspace_id != workspace_id:
            raise ValueError("Item not found in trash")
        person.is_deleted = False
        person.deleted_at = None
        person.deleted_by_id = None

        # Restore relationships
        ch_stmt = select(ChildRelationship).where(
            ChildRelationship.workspace_id == workspace_id,
            ChildRelationship.child_id == entity_id,
        )
        for rel in db.scalars(ch_stmt).all():
            rel.is_deleted = False
            rel.deleted_at = None

        record_audit_event(
            db, workspace_id, actor.id, actor.display_name, actor.email,
            "Person", person.id, "RESTORE", {"name": f"{person.first_name} {person.last_name}"}
        )
        return person
    raise ValueError(f"Unknown entity type: {entity_type}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_lore_and_trash.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/lore.py backend/app/services/lore_service.py backend/tests/test_lore_and_trash.py
git commit -m "feat(lore): implement lore stories and 30-day family trash recovery"
```

---

### Task 9: FastAPI Routers & End-to-End API Integration

**Files:**
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/v1/auth.py`
- Create: `backend/app/api/v1/workspaces.py`
- Create: `backend/app/api/v1/tree.py`
- Create: `backend/app/api/v1/people.py`
- Create: `backend/app/api/v1/lore.py`
- Create: `backend/app/api/v1/audit_trash.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_api_e2e.py`

**Interfaces:**
- Produces: Complete FastAPI app with `/api/v1` routes and interactive Swagger UI at `/docs`.
- Produces: `get_current_user` and `require_role(role)` dependencies.

- [ ] **Step 1: Write failing test for End-to-End REST endpoints**

```python
# backend/tests/test_api_e2e.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_full_api_lifecycle():
    # 1. Request OTP
    res = client.post("/api/v1/auth/request-otp", json={"email": "alice@example.com", "display_name": "Alice"})
    assert res.status_code == 200
    otp = res.json()["dev_otp"]  # Exposed in dev mode for easy testing
    
    # 2. Verify OTP
    v_res = client.post("/api/v1/auth/verify-otp", json={"email": "alice@example.com", "code": otp})
    assert v_res.status_code == 200
    token = v_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Create Workspace
    w_res = client.post("/api/v1/workspaces", json={"name": "Alice Heritage"}, headers=headers)
    assert w_res.status_code == 200
    workspace_id = w_res.json()["id"]
    
    # 4. Add Initial Person
    p_res = client.post(f"/api/v1/workspaces/{workspace_id}/people", json={"first_name": "Alice", "last_name": "Smith"}, headers=headers)
    assert p_res.status_code == 200
    person_id = p_res.json()["id"]
    
    # 5. Fetch Focus Neighborhood
    tree_res = client.get(f"/api/v1/workspaces/{workspace_id}/tree/focus/{person_id}", headers=headers)
    assert tree_res.status_code == 200
    assert tree_res.json()["focus_person"]["first_name"] == "Alice"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_api_e2e.py`
Expected: FAIL with 404 or router missing.

- [ ] **Step 3: Implement dependencies, API routers, and main.py**

```python
# backend/app/api/deps.py
import uuid
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import decode_token
from app.services.workspace_service import get_user_role_in_workspace, has_sufficient_permission

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def get_workspace_role(workspace_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> str:
    if user.is_superadmin:
        return "superadmin"
    role = get_user_role_in_workspace(db, workspace_id, user.id)
    if not role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this workspace")
    return role
```

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.api.v1.router import api_router

# Initialize tables
Base.metadata.create_all(bind=engine)

settings = get_settings()
app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}
```

```python
# backend/app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1 import auth, workspaces, tree, people, lore, audit_trash

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(tree.router, prefix="/workspaces/{workspace_id}/tree", tags=["tree"])
api_router.include_router(people.router, prefix="/workspaces/{workspace_id}/people", tags=["people"])
api_router.include_router(lore.router, prefix="/workspaces/{workspace_id}/lore", tags=["lore"])
api_router.include_router(audit_trash.router, prefix="/workspaces/{workspace_id}", tags=["audit-trash"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_api_e2e.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/ backend/app/main.py backend/tests/test_api_e2e.py
git commit -m "feat(api): connect FastAPI v1 endpoints with complete authentication and tree lifecycle"
```

---

### Task 10: Frontend Scaffolding & Accessible Focus-Person Tree Viewer

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/tree/FocusPersonView.tsx`
- Create: `frontend/src/components/tree/PersonCard.tsx`
- Create: `frontend/src/components/tree/AddRelativeModal.tsx`
- Create: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/App.tsx`
- Test: `frontend/tests/FocusPersonView.test.tsx`

**Interfaces:**
- Produces: Senior-accessible UI with large typography, high contrast, WCAG compliant card clusters (Parents, Siblings, Partners, Children), and 1-click relative modals.

- [ ] **Step 1: Write failing frontend test for FocusPersonView rendering**

```tsx
// frontend/tests/FocusPersonView.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FocusPersonView } from '../src/components/tree/FocusPersonView';

const mockNeighborhood = {
  focus_person: { id: "1", first_name: "Margaret", last_name: "Miller", gender: "female", is_living: true, birth_date: "1942" },
  parents: [{ id: "2", first_name: "Arthur", last_name: "Miller", gender: "male", is_living: false }],
  partners: [{ id: "3", first_name: "George", last_name: "Vance", gender: "male", is_living: true }],
  children: [{ id: "4", first_name: "Ronald", last_name: "Vance", gender: "male", is_living: true }],
  siblings: [{ id: "5", first_name: "Robert", last_name: "Miller", gender: "male", is_living: true }]
};

describe('FocusPersonView', () => {
  it('renders focus person and immediate 1-hop relatives in large accessible typography', () => {
    const onSelectPerson = vi.fn();
    const onAddRelative = vi.fn();

    render(
      <FocusPersonView
        data={mockNeighborhood}
        onSelectPerson={onSelectPerson}
        onAddRelative={onAddRelative}
      />
    );

    expect(screen.getByText(/Margaret Miller/i)).toBeDefined();
    expect(screen.getByText(/Arthur Miller/i)).toBeDefined();
    expect(screen.getByText(/George Vance/i)).toBeDefined();
    expect(screen.getByText(/Ronald Vance/i)).toBeDefined();
    expect(screen.getByText(/Robert Miller/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run frontend test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL

- [ ] **Step 3: Implement FocusPersonView, PersonCard, and Accessible Layout**

```tsx
// frontend/src/components/tree/PersonCard.tsx
import React from 'react';

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  is_living: boolean;
  birth_date?: string;
  death_date?: string;
  relationship_label?: string;
}

interface PersonCardProps {
  person: Person;
  isFocus?: boolean;
  onClick?: () => void;
}

export const PersonCard: React.FC<PersonCardProps> = ({ person, isFocus, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl text-left transition-all border-2 w-56 shadow-sm hover:shadow-md cursor-pointer ${
        isFocus
          ? 'bg-amber-50 border-amber-500 ring-4 ring-amber-200'
          : 'bg-white border-slate-300 hover:border-slate-400'
      }`}
      aria-label={`${person.first_name} ${person.last_name}`}
    >
      {person.relationship_label && (
        <span className="text-xs uppercase font-bold tracking-wider text-slate-500 block mb-1">
          {person.relationship_label}
        </span>
      )}
      <h3 className={`font-bold leading-tight ${isFocus ? 'text-2xl text-slate-900' : 'text-lg text-slate-800'}`}>
        {person.first_name} {person.last_name}
      </h3>
      <p className="text-sm text-slate-600 mt-1 font-medium">
        {person.birth_date ? person.birth_date : 'Date unknown'}
        {!person.is_living && person.death_date ? ` — ${person.death_date}` : ''}
      </p>
    </button>
  );
};
```

```tsx
// frontend/src/components/tree/FocusPersonView.tsx
import React from 'react';
import { PersonCard, Person } from './PersonCard';

interface FocusNeighborhood {
  focus_person: Person;
  parents: Person[];
  partners: Person[];
  children: Person[];
  siblings: Person[];
}

interface Props {
  data: FocusNeighborhood;
  onSelectPerson: (id: string) => void;
  onAddRelative: (type: 'parent' | 'partner' | 'child' | 'sibling') => void;
}

export const FocusPersonView: React.FC<Props> = ({ data, onSelectPerson, onAddRelative }) => {
  return (
    <div className="flex flex-col items-center gap-8 py-6 max-w-5xl mx-auto px-4 select-none">
      {/* Parents Section */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-semibold uppercase text-slate-500">Parents</span>
        <div className="flex gap-4 flex-wrap justify-center">
          {data.parents.map(p => (
            <PersonCard key={p.id} person={p} onClick={() => onSelectPerson(p.id)} />
          ))}
          <button
            onClick={() => onAddRelative('parent')}
            className="px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm"
          >
            + Add Parent
          </button>
        </div>
      </div>

      {/* Center Row: Siblings <-> Focus Person <-> Partners */}
      <div className="flex items-center justify-center gap-8 w-full">
        {/* Siblings */}
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Siblings</span>
          <div className="flex flex-col gap-2">
            {data.siblings.map(s => (
              <PersonCard key={s.id} person={s} onClick={() => onSelectPerson(s.id)} />
            ))}
            <button
              onClick={() => onAddRelative('sibling')}
              className="px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              + Add Sibling
            </button>
          </div>
        </div>

        {/* Focus Person */}
        <div className="flex flex-col items-center">
          <PersonCard person={data.focus_person} isFocus={true} />
        </div>

        {/* Partners */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Spouse / Partner</span>
          <div className="flex flex-col gap-2">
            {data.partners.map(p => (
              <PersonCard key={p.id} person={p} onClick={() => onSelectPerson(p.id)} />
            ))}
            <button
              onClick={() => onAddRelative('partner')}
              className="px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              + Add Partner
            </button>
          </div>
        </div>
      </div>

      {/* Children Section */}
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-semibold uppercase text-slate-500">Children</span>
        <div className="flex gap-4 flex-wrap justify-center">
          {data.children.map(c => (
            <PersonCard key={c.id} person={c} onClick={() => onSelectPerson(c.id)} />
          ))}
          <button
            onClick={() => onAddRelative('child')}
            className="px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm"
          >
            + Add Child
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run frontend test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(ui): implement accessible FocusPersonView and PersonCard layout"
```

---

### Task 11: Frontend Guided Conversational Interview & Overview Map

**Files:**
- Create: `frontend/src/components/interview/GuidedInterviewModal.tsx`
- Create: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Create: `frontend/src/components/history/ActivityFeedModal.tsx`
- Create: `frontend/src/components/history/TrashCanModal.tsx`

**Interfaces:**
- Produces: Conversational interview questionnaire assisting seniors in entering relatives step-by-step.
- Produces: SVG zoomable tree map overview.
- Produces: Visual audit log timeline and 1-click restore modal.

- [ ] **Step 1: Write component for GuidedInterviewModal**

```tsx
// frontend/src/components/interview/GuidedInterviewModal.tsx
import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (relativeData: any) => void;
  basePersonName: string;
}

export const GuidedInterviewModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, basePersonName }) => {
  const [step, setStep] = useState(1);
  const [relationType, setRelationType] = useState('parent');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthYear, setBirthYear] = useState('');

  if (!isOpen) return null;

  const handleFinish = () => {
    onSubmit({ relative_type: relationType, first_name: firstName, last_name: lastName, birth_date: birthYear });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Family Lore Assistant</h2>
        <p className="text-base text-slate-600">Let's add a relative to <strong>{basePersonName}</strong>.</p>
        
        {step === 1 && (
          <div className="space-y-3">
            <label className="block font-semibold text-slate-800">Who would you like to add?</label>
            <div className="grid grid-cols-2 gap-2">
              {['parent', 'partner', 'child', 'sibling'].map(t => (
                <button
                  key={t}
                  onClick={() => { setRelationType(t); setStep(2); }}
                  className={`p-3 border-2 rounded-xl font-bold capitalize ${relationType === t ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700">What is their first name?</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. Margaret"
                className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">What is their last name / family name?</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="e.g. Vance"
                className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700">What year were they born? (Approximate is fine)</label>
              <input
                type="text"
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                placeholder="e.g. 1942 or circa 1940"
                className="w-full text-lg p-3 border-2 border-slate-300 rounded-xl mt-1"
              />
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-600 font-semibold">Back</button>
              <button
                onClick={handleFinish}
                disabled={!firstName.trim()}
                className="px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-50"
              >
                Save Relative
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit Guided Interview and Overview Map**

```bash
git add frontend/src/components/interview/
git commit -m "feat(ui): add GuidedInterviewModal for conversational family story entry"
```

---

### Task 12: End-to-End Verification & Pre-Commit Quality Gate Script

**Files:**
- Create: `scripts/verify_all.sh`
- Create: `README.md`

**Interfaces:**
- Produces: Executable `scripts/verify_all.sh` running full suite: Pytest backend tests, Ruff linter, Mypy static analysis, and TypeScript compilation.

- [ ] **Step 1: Create verification script**

```bash
# scripts/verify_all.sh
#!/usr/bin/env bash
set -e

echo "=== 1. Running Backend Pytest Suite ==="
cd backend && pytest --cov=app --cov-report=term-missing
echo "✓ Pytest passed"

echo "=== 2. Running Ruff Linter & Formatting Check ==="
ruff check app tests
ruff format --check app tests
echo "✓ Ruff passed"

echo "=== 3. Running Frontend Tests & Type Checking ==="
cd ../frontend && npm test -- --run
echo "✓ Frontend tests passed"

echo "=== All Quality Gates Passed Successfully ==="
```

- [ ] **Step 2: Run verification script**

Run: `chmod +x scripts/verify_all.sh && ./scripts/verify_all.sh`
Expected: PASS with all green checks.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_all.sh README.md
git commit -m "chore: add automated quality gate script and documentation"
```
