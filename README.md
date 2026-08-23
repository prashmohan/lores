# Lores — Accessible Family Tree & Oral History Builder

<div align="center">

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![A11y](https://img.shields.io/badge/WCAG_2.1-AAA_Target-green?style=flat-square&logo=w3c&logoColor=white)](https://www.w3.org/WAI/standards-guidelines/wcag/)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Lores** is an accessible, multi-tenant family tree and oral storytelling web platform engineered for families to record, preserve, and explore their lineage, memories, and spoken histories together.

[Key Features](#1-key-features) • [Architecture](#2-architecture--technology-stack) • [Quickstart](#3-quickstart--local-development) • [Docker Deployment](#4-running-with-docker) • [Quality & Verification](#5-automated-verification--quality-gates)

</div>

---

## 1. Key Features

Traditional genealogy software often overwhelms families with sprawling, tangled charts, microscopic fonts, complex navigational controls, and archaic terminology (*Ahnentafel*, *Consanguinity*, *Pedigree Collapse*).

**Lores replaces cognitive overload with simplicity, psychological safety, and radical accessibility:**

- 🌿 **1-Hop Focus Neighborhood**: Rather than displaying infinite tangled tree canvases, Lores centers the user on a single **Focus Person** with their immediate parents, partners, siblings, and children displayed in legible, high-contrast cards.
- 🎙️ **Oral Lore & Storytelling**: Attach voice recordings, milestone stories, recipes, and personal anecdotes directly to family members so irreplaceable heritage is preserved for generations.
- 🗺️ **Bird's-Eye SVG Map**: An interactive multi-generation pedigree map with smooth zoom, pan, and partner indicators for family-wide overviews.
- 🔒 **Living Relative Privacy**: Living relatives have sensitive details automatically redacted for guest and unauthorized viewers.
- ↩️ **30-Day Family Safety Net**: Every change is recorded in an immutable append-only audit trail. Deleted relatives and stories are held in a **30-day Family Trash Can** with 1-click restore.
- 🛡️ **Multi-Tenant Workspaces & RBAC**: Isolated family workspaces with 4 distinct roles: `owner`, `admin`, `collaborator`, and `viewer`.
- 🔑 **Passwordless OTP Authentication**: Frictionless, secure 6-digit email passcodes without passwords to remember.
- ♿ **Strict Accessibility (WCAG 2.1 AA/AAA)**: Integrated High-Contrast Mode, large touch targets ($\ge 44 \times 44\text{px}$), and automated axe-core testing across the entire interface.

---

## 2. Architecture & Technology Stack

Lores is structured as a full-stack monorepo:

```
lores/
├── backend/                  # FastAPI (Python 3.12+), SQLAlchemy 2.0 (async), Pydantic v2, SQLite
│   ├── app/
│   │   ├── api/              # RESTful API router (v1 endpoints for auth, tree, workspaces, lore, trash)
│   │   ├── db/               # Async engine, sessionmaker, base declarative model
│   │   ├── models/           # SQLAlchemy models (User, Workspace, Person, FamilyUnion, LoreNote, AuditLog)
│   │   ├── schemas/          # Pydantic v2 validation & response schemas
│   │   └── services/         # Business logic (cycle detection, neighborhood graph, audit ledger, auth)
│   └── tests/                # Pytest async test suite (87 tests, 100% passing)
├── frontend/                 # React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons
│   ├── e2e/                  # Playwright E2E browser accessibility test suite
│   ├── src/
│   │   ├── components/       # UI Components (auth, layout, tree, map, history, workspace, admin)
│   │   ├── lib/              # Type-safe API client and token storage
│   │   └── types/            # TypeScript interfaces matching backend DTO schemas
│   └── tests/                # Vitest + Vitest-Axe component accessibility tests (71 tests)
├── docs/                     # Architectural design specifications and implementation plans
├── scripts/                  # Automated verification and quality gate scripts
└── docker-compose.yml        # Multi-stage production and development container orchestrations
```

### Data Flow & Neighborhood Traversal

```mermaid
flowchart TD
    subgraph Client["Frontend (React 18 + Tailwind + Radix)"]
        UI["Focus View / Bird's-Eye Map"]
        Auth["Passwordless OTP Flow"]
    end

    subgraph API["FastAPI Backend (Python 3.12+)"]
        Router["API Router (/api/v1/*)"]
        AuthService["Auth & Session Service"]
        TreeEngine["1-Hop Neighborhood Query Engine"]
        CycleEngine["DFS DAG Cycle Detection Engine"]
        AuditService["Append-Only Audit Ledger"]
    end

    subgraph Storage["Persistence Layer"]
        DB[("SQLite (aiosqlite) / PostgreSQL")]
        Trash[("30-Day Soft-Delete Recovery Bin")]
    end

    UI <-->|"JSON REST API + JWT"| Router
    Auth <-->|"6-Digit OTP"| AuthService
    Router --> TreeEngine
    Router --> CycleEngine
    Router --> AuditService
    TreeEngine <--> DB
    CycleEngine <--> DB
    AuditService --> DB
    AuditService --> Trash
```

---

## 3. Quickstart & Local Development

### Prerequisites
- **Python 3.12+**
- **Node.js 20+** & **npm**

### 3.1 Backend Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate a Python virtual environment
python3 -m venv ../.venv
source ../.venv/bin/activate

# 3. Install dependencies in editable mode
pip install -e ".[dev]"

# 4. Start the FastAPI development server
uvicorn app.main:app --reload --port 8000
```

- API endpoint: `http://localhost:8000`
- Interactive OpenAPI documentation: `http://localhost:8000/docs`

### 3.2 Frontend Setup

```bash
# 1. Navigate to frontend directory (in a new terminal)
cd frontend

# 2. Install dependencies
npm install

# 3. Install Playwright browser binaries (for accessibility E2E tests)
npx playwright install chromium

# 4. Start the Vite development server
npm run dev
```

- Web App: `http://localhost:5173` (requests to `/api/*` proxy automatically to backend on port 8000)

### 3.3 Passwordless Login Flow

1. Open `http://localhost:5173` in your browser.
2. Enter your email (e.g. `storykeeper@family.org`).
3. In local development mode, the OTP code is printed to the backend terminal and returned in the mock response for instant access.
4. Enter the 6-digit passcode to enter your family workspace.

---

## 4. Running with Docker

### A. Development Mode (Live Hot-Reloading with Docker Compose Watch)

Lores supports `docker compose watch` (`develop.watch`) for instant frontend HMR and backend auto-reloads without rebuilding containers:

```bash
docker compose -f docker-compose.dev.yml up --watch
```

### B. Production Multi-Stage Container Build

```bash
# 1. Copy the configuration template
cp .env.example .env

# 2. Build and launch all services
docker compose up --build -d
```

- **Application URL**: Accessible locally at `http://127.0.0.1:8156` (or configured `APP_PORT`).
- **Cloudflare Tunnel / Reverse Proxy Ready**: The container binds exclusively to `127.0.0.1`, keeping all host WAN ports closed. Point your Cloudflare Tunnel (`cloudflared`) to `http://localhost:8156`.
- **Hardened Runtime Isolation**: Runs as an unprivileged non-root user (`lores`), drops all Linux kernel capabilities (`cap_drop: ALL`), enforces `no-new-privileges: true`, and mounts root filesystems as read-only.
- **Data Persistence**: SQLite database records are persisted in the named Docker volume `lores_data`.

To stop containers:
```bash
docker compose down
```

---

## 5. Automated Verification & Quality Gates

Lores enforces rigorous automated quality gates before any code is committed.

### Run Unified Verification Pipeline

```bash
./scripts/verify_all.sh
```

This executes all 7 verification steps:

| Step | Scope | Tool | Checks / Standard |
| :--- | :--- | :--- | :--- |
| **1** | Backend | `pytest` | **87** async unit & integration tests (100% pass) |
| **2** | Backend | `ruff` | PEP 8 linting & formatting compliance (`ruff check .` & `ruff format --check .`) |
| **3** | Backend | `mypy` | Strict static type validation (`mypy app`) |
| **4** | Frontend | `eslint` | ESLint + `eslint-plugin-jsx-a11y` accessibility rules |
| **5** | Frontend | `tsc` + `vite` | TypeScript strict compilation & production build bundle (`npm run build`) |
| **6** | Frontend | `vitest` + `axe` | **71** component unit & `vitest-axe` DOM accessibility audits |
| **7** | Frontend | `playwright` | E2E browser axe-core audits across all active modals & views |

---

## 6. Human-Centered & Accessible UX Principles

1. **Low Cognitive Load**: Focus on one family member at a time. Clear, step-by-step navigation replaces confusing sprawling charts.
2. **Generous Touch & Click Targets**: All interactive elements adhere to minimum $\ge 44 \times 44\text{px}$ targets.
3. **High-Contrast Support**: Built-in High Contrast toggle enforcing bold borders, pitch-black typography, and high-visibility focus indicators (targeting WCAG 2.1 AAA).
4. **Inclusive, Clear Language**: Replaces technical genealogical jargon with intuitive words like *"Parents"*, *"Partners"*, *"Children"*, and *"Stories"*.
5. **Psychological Safety**: Destructive actions can be undone with 1-click restore from the 30-day Family Trash Can.

---

## 7. License & Community

Lores is open-source software released under the [MIT License](LICENSE). Contributions and feedback from families, genealogists, and developers are warmly welcomed following the standards in `AGENTS.md`.
