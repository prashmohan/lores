# Lores — Accessible Family Tree & Oral History Builder

> **Lores** is an accessible, multi-tenant family tree and oral history web platform engineered specifically for families to record, preserve, and explore their lineage and stories. It is designed from the ground up for older, less technically conversant relatives ("Storykeepers") and their families.

---

## 1. Project Overview & Vision

Traditional genealogy software often overwhelms users with dense charts, microscopic fonts, complex navigational controls, and archaic terminology (*Ahnentafel*, *Consanguinity*, *Pedigree Collapse*). 

**Lores** replaces cognitive overload with **simplicity, psychological safety, and radical accessibility**:
- **1-Hop Neighborhood Focus**: Rather than displaying infinite tangled tree canvases, Lores centers the user on a single **Focus Person** with their immediate parents, partners, siblings, and children displayed in large, readable relationship cards.
- **Guided Oral History Interview**: A step-by-step conversational assistant prompts Storykeepers with simple, plain-language questions to collect relatives and family stories effortlessly.
- **Bird's-Eye SVG Map**: An interactive multi-generation pedigree map with smooth zoom and pan controls for family-wide overviews.
- **Living Relative Privacy**: Living relatives are automatically protected and redacted for unauthorized viewers.
- **Psychological Safety**: Every change is backed by an immutable append-only audit trail and a **30-day Family Trash Can** allowing 1-click restore.
- **Automated Accessibility Testing**: Multi-tiered automated checks (ESLint `jsx-a11y`, `vitest-axe`, `@axe-core/playwright`, `@axe-core/react`, and Lighthouse CI) guarantee WCAG 2.1 AA/AAA compliance.

---

## 2. Architecture & Technology Stack

Lores is structured as a full-stack monorepo:

```
lores/
├── backend/                  # FastAPI 0.115+, SQLAlchemy 2.0 (async), Pydantic v2, SQLite
│   ├── app/
│   │   ├── api/              # RESTful API router (v1 endpoints for auth, tree, workspaces, lore, trash)
│   │   ├── db/               # Async engine, sessionmaker, base declarative model
│   │   ├── models/           # SQLAlchemy models (User, Workspace, Person, FamilyUnion, LoreNote, etc.)
│   │   ├── schemas/          # Pydantic v2 validation & response schemas
│   │   └── services/         # Core business logic (cycle detection, neighborhood graph, audit, auth)
│   └── tests/                # Pytest async test suite (100% pass, 95%+ coverage)
├── frontend/                 # React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons
│   ├── e2e/                  # Playwright E2E browser accessibility test suite
│   ├── src/
│   │   ├── components/       # UI Components (auth, layout, tree, interview, map, history)
│   │   ├── lib/              # Type-safe API client and token storage
│   │   └── types/            # TypeScript interfaces matching backend DTO schemas
│   └── tests/                # Vitest + Vitest-Axe component accessibility tests
├── docs/                     # Architectural design specifications and implementation plans
├── scripts/                  # Automated verification and quality gate scripts
└── .github/workflows/        # GitHub Actions CI/CD pipeline (backend + frontend a11y)
```

### Key Technologies

- **Backend**:
  - **Python 3.12+** & **FastAPI** for high-performance async API endpoints.
  - **SQLAlchemy 2.0** with **`aiosqlite`** for lightweight, zero-configuration embedded async persistence.
  - **Pydantic v2** for strict input validation, serialization, and OpenAPI generation.
  - **PyJWT & Passlib** for passwordless 6-digit OTP verification and JWT session management.
  - **Ruff & Mypy** for formatting, linting, and strict static type compliance.
- **Frontend**:
  - **React 18** + **TypeScript (strict mode)** for deterministic, component-driven UI.
  - **Vite** for sub-second hot reloading and optimized production bundling.
  - **Tailwind CSS** with custom accessible tokens and High-Contrast Mode toggle.
  - **Radix UI Primitives** for accessible dialogs, overlays, and focus traps.
  - **Lucide Icons** for clean, senior-friendly iconography.
  - **Accessibility Suite**: `eslint-plugin-jsx-a11y`, `vitest-axe` (DOM audits), `@axe-core/playwright` (browser E2E scans), `@axe-core/react` (dev console logging), and `@lhci/cli` (Lighthouse CI $\ge 95\%$).

---

## 3. Core Architectural Highlights & Data Model

### 3.1 Multi-Tenant Workspaces & Role-Based Access Control (RBAC)
Each family operates inside an isolated **Workspace** (`workspace_id` explicitly scoped across all database queries). Lores enforces a 4-tier permission hierarchy:
- **`owner`**: Full administrative access, member role assignment, workspace settings, and permanent trash purge.
- **`admin`**: Tree mutations, member invitations, and 30-day trash recovery.
- **`collaborator`**: Add/edit relatives, attach lore stories, upload photos, and soft-delete items.
- **`viewer`**: Read-only exploration. Deceased relatives are visible, while living individuals have sensitive details automatically redacted for privacy.

### 3.2 Union-Centric Family Graph & DAG Cycle Prevention
Family trees are modeled using GEDCOM 7.0-aligned Union nodes (`FamilyUnion` and `ChildRelationship`) rather than direct parent-child pointers:
- Supports multi-parent, adoptive, and remarriage family structures naturally.
- **DAG Cycle Detection Engine** (`cycle_service.py`): Performs depth-first graph traversal on every union mutation to prevent circular ancestry (e.g. adding Margaret as her own ancestor) before persisting.

### 3.3 1-Hop Neighborhood Query Engine
The `tree_service.py` compiles an indexed 1-hop radius around any given focus person in sub-millisecond execution time:
- **Parents**: Biological and adoptive parent unions.
- **Partners**: Current and former spouses / partners with union metadata.
- **Siblings**: Full and half-siblings sharing parent unions.
- **Children**: Direct offspring across all unions.
- **Living Privacy Redactor**: Anonymizes living relatives for viewers without administrative credentials.

### 3.4 30-Day Family Trash Can & Append-Only Audit Trail
- **Soft Deletion (`is_deleted=True`)**: Deleting a person or lore note moves it to the **Family Trash Can** with a 30-day countdown before permanent purge.
- **1-Click Restore**: Any collaborator or admin can instantly recover deleted records with full relationship reconstruction.
- **Audit Logging (`AuditLog`)**: Immutable, append-only ledger tracking all actions (`CREATE`, `UPDATE`, `DELETE`, `RESTORE`) with structured JSON attribute diffs and actor attribution.

---

## 4. Senior-First UX Principles

1. **Low Cognitive Load**: No overwhelming dense pedigree charts by default. Users focus on one person and navigate outward step-by-step.
2. **Generous Touch & Click Targets**: Buttons and cards adhere to minimum $\ge 44 \times 44\text{px}$ touch targets.
3. **High-Contrast Support**: Built-in High Contrast toggle enforcing bold borders, pitch-black typography, and high-visibility focus rings (targeting WCAG 2.1 AAA).
4. **Jargon-Free Interfaces**: Replaces technical genealogical terms with clear phrases like *"Parents"*, *"Partners"*, *"Children"*, and *"Family Stories"*.
5. **Interactive Breadcrumb Navigation**: Visual history trail allowing Storykeepers to retrace their path through the family tree at any time.

---

## 5. Local Development & Setup

### Prerequisites
- **Python 3.12+**
- **Node.js 20+** & **npm**

### 5.1 Backend Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate virtual environment (if not already created)
python3 -m venv ../.venv
source ../.venv/bin/activate

# 3. Install backend dependencies
pip install -e ".[dev]"

# 4. Run the FastAPI development server
uvicorn app.main:app --reload --port 8000
```

The API will start at `http://localhost:8000`. Interactive OpenAPI documentation is accessible at `http://localhost:8000/docs`.

### 5.2 Frontend Setup

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Install Playwright browser dependencies (for a11y E2E tests)
npx playwright install chromium

# 4. Run Vite dev server
npm run dev
```

The frontend will start at `http://localhost:5173`. Requests to `/api/*` are automatically proxied to the backend at `http://localhost:8000`.

### 5.3 Passwordless Login Workflow

1. Open `http://localhost:5173` (or `http://localhost` in Docker) in your browser.
2. Enter an email address (e.g., `storykeeper@family.org`).
3. In local development mode, the OTP passcode is logged to the backend console and returned in the mock response for instant access.
4. Enter the 6-digit passcode to verify and enter the workspace.

### 5.4 Running with Docker & Docker Compose

Lores includes complete containerization with production-ready multi-stage Docker builds.

Host ports can be configured in your `.env` file via `BACKEND_PORT` (default: 8000) and `FRONTEND_PORT` (default: 3000):

```bash
# 1. Copy the environment configuration template
cp .env.example .env

# 2. Adjust BACKEND_PORT or FRONTEND_PORT in .env if needed (e.g. BACKEND_PORT=8080)

# 3. Build and launch both backend (FastAPI) and frontend (Nginx reverse-proxy)
docker compose up --build
```

- **Frontend Web Application**: Accessible at `http://localhost:${FRONTEND_PORT:-3000}` (e.g. [`http://localhost:3000`](http://localhost:3000)).
- **Interactive OpenAPI Documentation**: Accessible at `http://localhost:${BACKEND_PORT:-8000}/docs` (e.g. [`http://localhost:8000/docs`](http://localhost:8000/docs)).
- **Persistent Data Storage**: Database records are safely persisted in the named Docker volume `lores_data`.

To stop the containers:
```bash
docker compose down
```

---

## 6. Automated Verification & Quality Gates

Lores enforces strict quality gates across both frontend and backend before any code is committed or merged.

### Run Full Quality Gate Suite

Execute the unified verification script from the repository root:

```bash
./scripts/verify_all.sh
```

The script runs the complete 7-step test and analysis pipeline:
1. **Backend Pytest Suite**: 66 async unit and integration tests with coverage (`pytest -v --cov=app`).
2. **Ruff Linter & Formatter**: Strict PEP 8 and Python linting checks (`ruff check .` & `ruff format --check .`).
3. **Mypy Static Type Analysis**: Strict type checking on all backend modules (`mypy app`).
4. **Frontend Static A11y & Lint**: ESLint + `eslint-plugin-jsx-a11y` (`npm run lint`).
5. **TypeScript Compilation & Production Bundle**: Strict typecheck (`tsc -b`) and Vite production build (`npm run build`).
6. **Frontend Component & A11y Tests**: 57 Vitest component tests with `vitest-axe` DOM audits (`npm test`).
7. **Playwright E2E Accessibility Audits**: 5 Playwright browser tests verifying WCAG 2.1 AA/AAA rules (`npm run test:e2e:a11y`).

### Individual Commands

| Scope | Purpose | Command |
| :--- | :--- | :--- |
| **Backend** | Unit & E2E Tests with Coverage | `cd backend && pytest -v --cov=app` |
| **Backend** | Ruff Linting Check | `cd backend && ruff check .` |
| **Backend** | Ruff Code Formatting Check | `cd backend && ruff format --check .` |
| **Backend** | Static Type Checking | `cd backend && mypy app` |
| **Frontend** | Static A11y & Code Linting | `cd frontend && npm run lint` |
| **Frontend** | Typecheck & Production Build | `cd frontend && npm run build` |
| **Frontend** | Component & A11y Tests | `cd frontend && npm test` |
| **Frontend** | Browser E2E A11y Audits | `cd frontend && npm run test:e2e:a11y` |
| **Frontend** | Lighthouse CI Audit | `cd frontend && npm run lhci` |

---

## 7. License & Contributions

Lores is developed as an open-source, community-centered family archive. Contributions following the standards in `AGENTS.md` are warmly welcomed.
