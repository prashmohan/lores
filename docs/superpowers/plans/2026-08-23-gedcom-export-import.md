# GEDCOM & JSON Export/Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement robust, accessible, and strictly role-protected GEDCOM (5.5.1 / 7.0) and JSON export and import capabilities in Lores for Family Administrators.

**Architecture:** A Python GEDCOM parser and generator service translates between standard `.ged` records and Lores's union-centric relational model (`Person`, `FamilyUnion`, `ChildRelationship`, `LoreNote`). An import service handles smart deduplication, missing field enrichment, and cycle validation. Protected FastAPI endpoints (`require_role("admin")`) serve file streams and accept uploads, while an accessible React Radix dialog provides file dropzone, progress tracking, and import summary reporting.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, Python `datetime` / `re`, React 18, TypeScript, Radix UI, Tailwind CSS, Lucide Icons, Vitest, `vitest-axe`, Pytest.

**Spec:** [`docs/superpowers/specs/2026-08-23-gedcom-export-import-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-gedcom-export-import-design.md)

## Global Constraints
- Only workspace administrators (`role == 'admin'` or `is_superadmin`) may access export/import endpoints (enforcing HTTP 403 for non-admins) and UI controls.
- Graph mutations must validate acyclicity via `cycle_service.would_create_cycle`.
- All operations must be scoped strictly to `workspace_id`.
- Maintain WCAG 2.1 AAA high-contrast and keyboard accessibility.

---

### Task 1: GEDCOM Parser & Generator Service

**Files:**
- Create: `backend/app/services/gedcom_service.py`
- Test: `backend/tests/test_gedcom_service.py`

**Interfaces:**
- Consumes: Database models `Person`, `FamilyUnion`, `ChildRelationship`, `LoreNote`.
- Produces: 
  - `generate_gedcom(db: Session, workspace_id: uuid.UUID, workspace_name: str) -> str`
  - `parse_gedcom(content: str) -> ParsedGedcomData` (dataclass with individuals, families, notes)

- [ ] **Step 1: Write the failing tests for GEDCOM generator and parser**

Create `backend/tests/test_gedcom_service.py` testing GEDCOM 7.0 export formatting and parsing of individuals, families, birth/death events, marriage dates, and notes.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_gedcom_service.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.gedcom_service'`

- [ ] **Step 3: Implement `gedcom_service.py`**

Write `backend/app/services/gedcom_service.py` with:
- Line-by-line GEDCOM parser supporting level numbers, tags (`INDI`, `NAME`, `SEX`, `BIRT`, `DEAT`, `FAM`, `HUSB`, `WIFE`, `CHIL`, `MARR`, `NOTE`, `PLAC`, `DATE`), and continuation lines (`CONC`, `CONT`).
- GEDCOM 7.0 generator outputting standard `HEAD`, `INDI`, `FAM`, and `TRLR` records.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_gedcom_service.py -v`  
Expected: PASS

- [ ] **Step 5: Code quality check**

Run: `ruff check app/services/gedcom_service.py && ruff format --check app/services/gedcom_service.py`

---

### Task 2: Data Exchange Schemas & Import/Deduplication Engine

**Files:**
- Create: `backend/app/schemas/data_exchange.py`
- Create: `backend/app/services/data_exchange_service.py`
- Test: `backend/tests/test_data_exchange_service.py`

**Interfaces:**
- Consumes: `gedcom_service.py`, `cycle_service.py`, `audit_service.py`, database models.
- Produces:
  - `ImportSummaryRead` Pydantic model
  - `import_gedcom_to_workspace(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, filename: str, content: str) -> ImportSummaryRead`
  - `export_json_backup(db: Session, workspace_id: uuid.UUID) -> dict[str, Any]`
  - `import_json_to_workspace(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, filename: str, data: dict[str, Any]) -> ImportSummaryRead`

- [ ] **Step 1: Write the failing tests for import & deduplication**

Create `backend/tests/test_data_exchange_service.py` verifying:
- Ingestion of a sample GEDCOM into a fresh workspace (creating people, unions, children, lore notes).
- Deduplication of existing individuals by normalized name and birth year.
- Detection and skipping of cyclic ancestry with warning generation.
- Full JSON backup export and import.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_data_exchange_service.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement schemas and data exchange service**

Implement `backend/app/schemas/data_exchange.py` and `backend/app/services/data_exchange_service.py` with:
- Transaction management and atomicity.
- Name normalization and birth date matching.
- Missing field enrichment on matching records.
- Note-to-`LoreNote` translation with tag `gedcom-import`.
- Invariant cycle checking via `cycle_service.would_create_cycle`.
- Audit logging of `data_import` actions.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_data_exchange_service.py -v`  
Expected: PASS

- [ ] **Step 5: Code quality check**

Run: `ruff check app/schemas/data_exchange.py app/services/data_exchange_service.py && ruff format --check .`

---

### Task 3: REST API Endpoints & RBAC Protection

**Files:**
- Create: `backend/app/api/v1/data_exchange.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_data_exchange_api.py`

**Interfaces:**
- Endpoints:
  - `GET /api/v1/workspaces/{workspace_id}/export/gedcom`
  - `GET /api/v1/workspaces/{workspace_id}/export/json`
  - `POST /api/v1/workspaces/{workspace_id}/import/gedcom`
  - `POST /api/v1/workspaces/{workspace_id}/import/json`
- Security: Protected with `require_role("admin")`.

- [ ] **Step 1: Write failing API integration tests**

Create `backend/tests/test_data_exchange_api.py` testing:
- Workspace admin can successfully download GEDCOM file (`200 OK`, `text/plain`).
- Workspace admin can successfully download JSON archive (`200 OK`, `application/json`).
- Workspace admin can upload `.ged` file and receive `ImportSummaryRead`.
- Collaborator role receives `403 Forbidden` on all export and import endpoints.
- Viewer role receives `403 Forbidden` on all export and import endpoints.

- [ ] **Step 2: Run API tests to verify failure**

Run: `pytest tests/test_data_exchange_api.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement endpoints and register in router**

Create `backend/app/api/v1/data_exchange.py` and mount routes in `backend/app/api/v1/router.py`.

- [ ] **Step 4: Run API tests to verify passing**

Run: `pytest tests/test_data_exchange_api.py -v`  
Expected: PASS

- [ ] **Step 5: Run full backend verification**

Run:
```bash
ruff check .
ruff format --check .
mypy app
pytest -v
```

---

### Task 4: Frontend API Client & Types

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `ImportSummaryRead` TypeScript interface, `api.dataExchange` client methods (`exportGedcom`, `exportJson`, `importGedcom`, `importJson`).

- [ ] **Step 1: Update `types/api.ts`**

Add `ImportSummaryRead` interface matching the backend schema.

- [ ] **Step 2: Update `lib/api.ts`**

Add `dataExchange` service methods to handle file downloads (creating Blob downloads) and multipart/form-data uploads.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run build` from `frontend/`  
Expected: PASS

---

### Task 5: Frontend Data & Backup Modal Component

**Files:**
- Create: `frontend/src/components/workspace/DataBackupModal.tsx`
- Create: `frontend/src/components/workspace/DataBackupModal.test.tsx`

**Interfaces:**
- Component Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `workspaceId: string`
  - `workspaceName: string`
  - `onImportSuccess?: () => void`

- [ ] **Step 1: Write component and accessibility tests**

Create `frontend/src/components/workspace/DataBackupModal.test.tsx` verifying:
- Modal renders Export and Import tabs.
- Export triggers download.
- Import allows selecting/dropping `.ged` and `.json` files.
- Displays `ImportSummaryRead` results on successful import.
- Passes `vitest-axe` WCAG 2.1 AAA accessibility audit.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test src/components/workspace/DataBackupModal.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement `DataBackupModal.tsx`**

Build the accessible modal using Radix UI Dialog, Lucide icons (`Database`, `Download`, `UploadCloud`, `FileText`, `CheckCircle2`, `AlertTriangle`), file dropzone, format selection, progress states, and summary report.

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test src/components/workspace/DataBackupModal.test.tsx`  
Expected: PASS

---

### Task 6: Header & App UI Integration with Admin RBAC Filtering

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/components/layout/Header.test.tsx`

- [ ] **Step 1: Write tests for Header RBAC display**

Verify in `Header.test.tsx` that the "Data & Backup" button is rendered when `userRole === 'admin'`, but is NOT rendered when `userRole === 'collaborator'` or `userRole === 'viewer'`.

- [ ] **Step 2: Update `Header.tsx` and `App.tsx`**

- In `Header.tsx`: Add `onOpenDataBackup?: () => void` prop and render "Data & Backup" button for admin roles only.
- In `App.tsx`: Add `isDataBackupOpen` state, wire modal open/close, and reload workspace data/people upon successful import.

- [ ] **Step 3: Run all frontend tests**

Run: `npm test`  
Expected: PASS

---

### Task 7: Full Monorepo Verification & E2E Validation

- [ ] **Step 1: Run complete backend verification pipeline**
```bash
cd backend
ruff check .
ruff format --check .
mypy app
pytest -v
```

- [ ] **Step 2: Run complete frontend verification pipeline**
```bash
cd ../frontend
npm run lint
npm run build
npm test
npm run test:e2e:a11y
```
