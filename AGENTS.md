# Lores — Engineering Standards & Agent Guidelines

This document outlines mandatory coding standards, toolchains, testing protocols, git hygiene, and domain-specific UX/architectural principles that all agents and human contributors MUST follow when developing in the **Lores** repository.

---

## 1. Project Overview & Monorepo Architecture

**Lores** is an accessible, multi-tenant family tree and oral history builder designed specifically for older, less technically conversant relatives ("Storykeepers") and their families.

The repository is structured as a full-stack monorepo:
- **`backend/`**: FastAPI (Python 3.12+), SQLAlchemy 2.0 (async), Pydantic v2, SQLite (`aiosqlite`), JWT & OTP authentication.
- **`frontend/`**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons, Vitest, Vitest-Axe, Playwright.
- **`docs/`**: Architecture design specifications and implementation plans (located in `docs/superpowers/`).

---

## 2. Toolchain & Verification Pipeline

Always verify changes using the corresponding environment and toolchain.

### 2.1 Backend (Python 3.12+)

All backend commands should be run within the virtual environment (`source .venv/bin/activate` or referencing `.venv/bin/`) from the `backend/` directory:

| Task | Command | Standard / Expectation |
| :--- | :--- | :--- |
| **Lint Check** | `ruff check .` | 0 errors, 0 warnings |
| **Format Check** | `ruff format --check .` | Code matches Ruff formatting rules (`ruff format .` to fix) |
| **Type Check** | `mypy app` | Strict type compliance, no unannotated endpoints/models |
| **Unit & E2E Tests** | `pytest -v` | 100% passing tests |
| **Dev Server** | `uvicorn app.main:app --reload --port 8000` | Local API running with OpenAPI docs at `/docs` |

### 2.2 Frontend (React 18 + TypeScript + Vite)

All frontend commands should be run from the `frontend/` directory:

| Task | Command | Standard / Expectation |
| :--- | :--- | :--- |
| **Build & Typecheck** | `npm run build` | `tsc -b` and Vite bundle with 0 type errors |
| **Static A11y & Lint** | `npm run lint` | ESLint + `eslint-plugin-jsx-a11y` clean (0 errors) |
| **Unit & Component A11y** | `npm test` (`vitest run`) | 100% passing test suites including `vitest-axe` |
| **E2E Browser A11y** | `npm run test:e2e:a11y` | 100% passing Playwright + Axe-Core audits |
| **Lighthouse CI** | `npx lhci autorun` | $\ge 95\%$ Accessibility score |
| **Dev Server** | `npm run dev` | Local Vite dev server with `@axe-core/react` live console auditing |

### 2.3 Mandatory Pre-Commit / Pre-PR Verification Pipeline

Before marking any task complete or committing code:
```bash
# 1. Backend verification (from backend/ directory)
cd backend
ruff check .
ruff format --check .
mypy app
pytest -v

# 2. Frontend verification (from frontend/ directory)
cd ../frontend
npm run lint
npm run build
npm test
npm run test:e2e:a11y
```

---

## 3. Git Hygiene & Commit Standards

- **Atomic Commits**: Every commit must represent a single, self-contained logical change. Never combine backend refactoring with unrelated frontend styling changes.
- **Conventional Commits**: Commit messages must follow semantic conventions:
  - `feat(scope)`: New user-facing or architectural feature (e.g., `feat(tree): add focus-person neighborhood traversal`).
  - `fix(scope)`: Bug fix (e.g., `fix(cycle-detection): prevent self-parent loop`).
  - `test(scope)`: Adding or updating test suites.
  - `refactor(scope)`: Code change that neither fixes a bug nor adds a feature.
  - `docs(scope)`: Documentation, architecture specs, or comments.
  - `chore(scope)`: Dependencies, build scripts, configuration.
- **Recognized Scopes**: `auth`, `tree`, `interview`, `map`, `history`, `rbac`, `models`, `api`, `ui`, `a11y`, `ci`, `deps`.
- **Commit Messages**: Use imperative mood in the subject line (e.g., `feat(auth): implement passwordless OTP verification`).
- **Clean Repository**: Never check in temporary files, databases (`*.db`, `*.sqlite`), log files, or cache artifacts (`.pytest_cache`, `.ruff_cache`, `node_modules`, `dist`, `test-results`).

---

## 4. Test-Driven Development (TDD) & Quality Assurance

- **Test-First Discipline**: For all new features, bug fixes, and API endpoints, write failing tests first to establish expected behavior before implementing the code.
- **Automated Accessibility Testing**:
  - **Lint Layer**: `eslint-plugin-jsx-a11y` verifies accessible attributes and keyboard bindings statically.
  - **Component Layer**: Every new dialog, card, or navigation component must have an automated `vitest-axe` test ensuring zero WCAG violations.
  - **E2E Browser Layer**: Playwright test suites run axe audits across active DOM states, open modals, and navigation routes.
- **High-Risk Domain Coverage**:
  - **Multi-Tenant Isolation**: Ensure all queries to `Person`, `FamilyUnion`, `ChildRelationship`, `LoreNote`, `MediaItem`, and `AuditLog` explicitly filter by `workspace_id`.
  - **RBAC & Privacy Boundaries**: Verify permission enforcement across roles (`owner`, `admin`, `collaborator`, `viewer`) and ensure living individuals are redacted for unauthorized viewers.
  - **Graph Integrity & Cycle Detection**: Test union mutations and child relationships for DAG invariants (preventing cyclic ancestry and self-parenting).
  - **Audit Logging & Trash Can**: Ensure changes generate immutable append-only audit records and soft deletions (`is_deleted=True`) can be restored within 30 days.
- **Evidence Before Assertions**: Never claim a task or bug fix is complete without executing the relevant test suite and inspecting the actual terminal output.

---

## 5. Domain & UX Principles (Lores-Specific)

### 5.1 Senior-First Accessible UX
- **Low Cognitive Load**: Avoid dense genealogical charts or complex jargon (e.g., prefer "Parents", "Partners", "Children", "Stories" over technical terms like "Ahnentafel" or "Consanguinity").
- **Visual Clarity**: Maintain large typography, high contrast (target WCAG 2.1 AAA), generous click/touch targets ($\ge 44 \times 44\text{px}$), and obvious focus indicators.
- **Psychological Safety**: Provide clear confirmation modals before irreversible actions, clear undo/restore mechanisms, and helpful reassurance.

### 5.2 Defensive Error Handling
- **User-Friendly Error Messages**: Display clear, human-readable feedback in the UI for errors (e.g., *"Cannot add Margaret as her own ancestor"* rather than raw 500 error traces).
- **Graceful Fallbacks**: Handle missing media, incomplete dates, and sparse relationship data gracefully without crashing or throwing unhandled frontend exceptions.

### 5.3 Code & Documentation Integrity
- **Preserve Documentation**: Retain all docstrings, type annotations, and architectural comments unless specifically asked to update them.
- **Strict Typing**: Maintain full TypeScript types for frontend APIs and strict Pydantic v2 schemas / SQLAlchemy models for backend services. Avoid using `any` in TypeScript or unannotated `def` in Python.
