# Lores — Engineering Standards & Agent Guidelines

This document outlines mandatory coding standards, toolchains, testing protocols, git hygiene, and domain-specific UX/architectural principles that all agents and human contributors MUST follow when developing in the **Lores** repository.

---

## 1. Project Overview & Monorepo Architecture

**Lores** is an accessible, multi-tenant family tree and oral history builder designed specifically for families and storytellers of every generation to record, preserve, and explore their lineage and heritage together.

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

### 5.1 Accessible, Human-Centered UX
- **Low Cognitive Load**: Avoid dense genealogical charts or complex jargon (e.g., prefer "Parents", "Partners", "Children", "Stories" over technical terms like "Ahnentafel" or "Consanguinity").
- **Visual Clarity**: Maintain large typography, high contrast (target WCAG 2.1 AAA), generous click/touch targets ($\ge 44 \times 44\text{px}$), and obvious focus indicators.
- **Psychological Safety**: Provide clear confirmation modals before irreversible actions, clear undo/restore mechanisms, and helpful reassurance.

### 5.2 Defensive Error Handling
- **User-Friendly Error Messages**: Display clear, human-readable feedback in the UI for errors (e.g., *"Cannot add Margaret as her own ancestor"* rather than raw 500 error traces).
- **Graceful Fallbacks**: Handle missing media, incomplete dates, and sparse relationship data gracefully without crashing or throwing unhandled frontend exceptions.

### 5.3 Code & Documentation Integrity
- **Preserve Documentation**: Retain all docstrings, type annotations, and architectural comments unless specifically asked to update them.
- **Strict Typing**: Maintain full TypeScript types for frontend APIs and strict Pydantic v2 schemas / SQLAlchemy models for backend services. Avoid using `any` in TypeScript or unannotated `def` in Python.
- **Keep README.md Synchronized**: Whenever system capabilities, API endpoints, UI features, data exchange mechanisms, architecture, or test suites are added, modified, or extended, all agents and human contributors MUST update `README.md`. This includes updating key feature lists, monorepo directory trees, mermaid architecture/data flow diagrams, and testing layer coverage descriptions so that the project documentation always mirrors the true, current state of the codebase without tracking brittle test count metrics.

### 5.4 Mobile & Touch Accessibility Standards (WCAG 2.1 AAA)
- **Target Size (WCAG 2.5.5 Level AAA & 2.5.8 Level AA)**: Every interactive control (buttons, icon links, form inputs, avatar edit triggers, drawer items) MUST provide a minimum tap target of $\ge 44 \times 44\text{px}$ with adequate perimeter spacing, preventing mis-taps.
- **Single-Pointer Alternative (WCAG 2.5.1 Level A)**: Any multi-touch or path-based gesture (such as 2-finger pan or pinch-to-zoom) MUST provide simple single-pointer alternatives (e.g., on-screen `+` Zoom In, `-` Zoom Out, and `Reset` buttons).
- **Pointer Cancellation (WCAG 2.5.2 Level A)**: Touch-down events must never commit irreversible actions. Drag-and-drop operations must provide clear cancellation thresholds (e.g., moving finger $>8\text{px}$ before the 250ms hold expires cancels the drag without side effects).
- **Orientation & Reflow (WCAG 1.3.4 & 1.4.10 Level AA)**: Viewport orientation must never be locked (fully functional in portrait and landscape). All layouts, navigation bars, and modals must reflow cleanly down to 320px screen width without horizontal scrollbars or text clipping.
- **Mobile Form Ergonomics & iOS Zoom Prevention**: All form controls (`<input>`, `<select>`, `<textarea>`) MUST enforce a minimum font size of $16\text{px}$ (`text-base`) to eliminate unwanted iOS Safari viewport auto-zooming on focus. Modals on mobile viewports ($<640\text{px}$) should render as accessible bottom sheets with `max-h-[85vh]` and safe-area padding.
- **Accessible Feedback & Progressive Haptics (WCAG 4.1.3 Level AA)**: Floating guidance hints or status changes must use `role="status"`, `aria-live="polite"`, and `pointer-events-none`. Haptic feedback (`navigator.vibrate`) must be wrapped in progressive enhancement (`navigator.vibrate?.(...)`) and gracefully no-op when unsupported.


---

## 6. Secure Development & Defensive Architecture Standards

All contributors and automated agents must adhere to the following core security principles across all backend, frontend, database, and infrastructure code:

### 6.1 Strict Tenant Isolation & Data Scoping (OWASP A01: Broken Access Control)
- **Zero-Trust Query Scoping**: Every database query, update, deletion, and aggregation affecting tenant or workspace-owned entities MUST explicitly scope against the authenticated tenant context (e.g. `workspace_id == workspace_id`).
- **Cascade & Bulk Operation Safety**: Bulk actions, background tasks, and cascade operations must explicitly enforce tenant boundaries at every query layer rather than assuming parent scoping propagates implicitly.
- **Hierarchical Permission Enforcement**: Validate actor permissions on every state-mutating operation against the least-privilege matrix (`owner`, `admin`, `collaborator`, `viewer`). Reject unauthorized modifications with explicit authorization errors before executing business logic.

### 6.2 Authentication, Cryptography & Token Management (OWASP A02 & A07)
- **Production Secret Rigor**: Environment configurations must enforce strong, cryptographically secure secrets in production environments, strictly failing fast on startup if secrets fall below required entropy thresholds (e.g. $\ge 256$ bits / 32 bytes) or use development fallback defaults.
- **Secure Token Lifecycle & Transport**:
  - Never transmit credentials, bearer tokens, or sensitive session identifiers in URL query parameters, unencrypted URLs, or server-logged vectors. Prefer secure `HttpOnly`, `SameSite`, `Secure` cookies or ephemeral URL fragments (`#...`) with immediate history cleanup.
  - Implement active revocation mechanisms (e.g., token versioning or invalidation stores) so credential changes, logouts, or privilege revocations take effect immediately across all sessions.
- **Abuse Prevention & Rate Limiting**: All unauthenticated or public-facing authentication endpoints (e.g., OTP requests, password resets, login attempts) must enforce rate limiting, request throttling, and progressive delays to prevent brute-force attacks, email flooding, and resource exhaustion.
- **Timing Attack Resistance**: Authentication comparisons (such as token hashes, HMACs, or verification codes) must use constant-time comparison algorithms to prevent side-channel timing analysis.

### 6.3 Data Privacy, Redaction & Information Leakage Prevention
- **Privacy by Default**: Sensitive personal identifying information (PII) of living individuals or restricted records must be filtered or redacted at the service/API serialization boundary based on the requester's role and relationship clearance.
- **Audit Log Sanitization**: Activity feeds, change histories, and audit records must sanitize and redact sensitive PII before persisting or presenting change diffs to users without appropriate clearance.
- **Interface Privilege Filtering**: Destructive management controls, administrative features, and sensitive configuration interfaces must be hidden and disabled in client applications for roles lacking authorization, backed by strict server-side authorization enforcement.

### 6.4 Defensive Input Validation & Schema Integrity (OWASP A03: Injection)
- **Positive Validation (Allow-Listing)**: All incoming payloads must be strictly validated against typed request schemas enforcing explicit string length limits, numeric ranges, allowed enum values, and structural boundaries.
- **Safe URI & Resource Handling**: Validate all user-supplied URLs against allowed schemes (`http`, `https`, safe relative paths) and reject dangerous URI schemes (`javascript:`, arbitrary data schemes) to prevent Cross-Site Scripting (XSS).
- **Parameterized Queries & Dialect-Safe DDL**: All database interactions must use parameterized statements or ORM abstractions. When constructing dynamic database identifiers or migrations, use dialect-aware identifier escaping/quoting and strict alphanumeric whitelist validation.
- **Bounded Resource Consumption (DoS Prevention)**: Endpoints accepting file uploads or batch data imports must enforce bounded stream processing (e.g., chunked buffer consumption) with strict payload size caps, preventing unconstrained memory allocation and event-loop starvation.

### 6.5 Centralized Error Handling & Failure Transparency
- **Safe Failure Modes**: Never leak internal implementation details, raw SQL syntax, database schema layouts, or unhandled language stack traces to client responses.
- **Centralized Exception Interception**: Register global application exception handlers to log comprehensive debugging details server-side while returning standardized, clean JSON error responses to clients.
- **Client-Side Message Sanitization**: Client applications and HTTP layers must format validation feedback into human-readable messages while gracefully suppressing internal server traces.

### 6.6 Domain Invariant & Graph Integrity Protection
- **Relational Invariant Verification**: Multi-entity mutations, restorations, and relationship graphs must validate structural invariants (e.g., preventing cycles, acyclic graph violations, or activating child links when parent entities remain in inactive/deleted states).
- **Idempotency & Optimistic Concurrency**: Concurrent entity updates should leverage versioning or timestamp checks (`If-Unmodified-Since`) to detect conflicts and avoid lost updates.

### 6.7 Network, Transport & Edge Security (OWASP A05: Security Misconfiguration)
- **Defensive HTTP Headers**: Enforce strict edge security headers across all responses: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
- **Trusted Reverse Proxy Configuration**: When operating behind a reverse proxy or load balancer, configure trusted IP forwarding using standard proxy headers (`X-Forwarded-For`, `X-Real-IP`) and validate upstream proxy sources to prevent client IP spoofing.

