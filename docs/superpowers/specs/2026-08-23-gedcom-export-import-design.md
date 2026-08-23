# Lores GEDCOM & JSON Export/Import Specification

**Date**: 2026-08-23  
**Status**: Draft for Review  
**Domain**: Family Tree Data Portability, Interoperability, and Administration

---

## 1. Overview & Objectives

**Lores** requires robust data portability and interoperability with external genealogy applications, notably **Gramps / GrampsWeb**, Ancestry, and FamilySearch.

This specification details the end-to-end architecture and implementation of:
1. **Universal GEDCOM 5.5.1 / 7.0 Importer & Exporter (`.ged`)**: Seamless transfer of individuals, family unions, parent-child relationships, dates, places, biographies, and notes.
2. **Lossless Lores JSON Archive (`.json`)**: Full-fidelity export and import of all workspace entities (people, unions, children, rich lore stories with tags, and audit trails).
3. **Strict RBAC Protection**: Data export and import capabilities are strictly reserved for **Family Administrators** (`role == 'admin'` or `is_superadmin`). Non-admin collaborators and viewers are restricted at both the API (HTTP 403) and UI (hidden controls) layers.
4. **Smart Deduplication & Graph Integrity**: Merging matching individuals (by normalized name and birth date/year) while filling in missing data, running cycle-detection on imported parentage, and generating an actionable import summary report.
5. **Accessible Admin UI**: A high-contrast, WCAG 2.1 AAA-compliant "Data & Backup" modal with file dropzone, format selection, progress states, and download triggers.

---

## 2. Architecture & Data Flow

```mermaid
graph TD
    subgraph Frontend [React Admin UI]
        AdminHeader[Header: 'Data & Backup' Button]
        DataBackupModal[Data & Backup Modal]
        ExportTab[Export Tab: GEDCOM 7.0 / JSON]
        ImportTab[Import Tab: Drag & Drop .ged / .json]
        SummaryModal[Import Summary & Warnings]
    end

    subgraph Backend [FastAPI & SQLAlchemy]
        Deps[require_role('admin')]
        ExportGedcomEP[GET /api/v1/workspaces/{id}/export/gedcom]
        ExportJsonEP[GET /api/v1/workspaces/{id}/export/json]
        ImportGedcomEP[POST /api/v1/workspaces/{id}/import/gedcom]
        ImportJsonEP[POST /api/v1/workspaces/{id}/import/json]
        
        GedcomService[GedcomService: Parser & Generator]
        ImportService[ImportService: Smart Deduplication & Sync]
        CycleService[CycleService: Graph Invariant Validation]
        AuditService[AuditService: Log Export/Import Events]
    end

    subgraph Database [SQLite / PostgreSQL]
        Workspaces[(Workspaces)]
        People[(People)]
        Unions[(FamilyUnions)]
        Children[(ChildRelationships)]
        Lore[(LoreNotes)]
        AuditLogs[(AuditLogs)]
    end

    AdminHeader -->|Admin Click| DataBackupModal
    DataBackupModal --> ExportTab
    DataBackupModal --> ImportTab
    
    ExportTab -->|Download Request| ExportGedcomEP
    ExportTab -->|Download Request| ExportJsonEP
    ImportTab -->|Upload File| ImportGedcomEP
    ImportTab -->|Upload File| ImportJsonEP

    ExportGedcomEP --> Deps --> GedcomService --> Database
    ExportJsonEP --> Deps --> Database
    ImportGedcomEP --> Deps --> GedcomService --> ImportService
    ImportJsonEP --> Deps --> ImportService
    ImportService --> CycleService
    ImportService --> Database
    ImportService --> AuditService
    ImportService -->|Return Summary| SummaryModal
```

---

## 3. Backend Implementation Details

### 3.1 REST API Endpoints (`/api/v1/workspaces/{workspace_id}/...`)

All import/export endpoints require the caller to possess the `admin` role in the workspace or `superadmin` system role via `require_role("admin")`.

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/workspaces/{id}/export/gedcom` | `GET` | `admin` | Returns standard `.ged` file attachment with full workspace tree. |
| `/api/v1/workspaces/{id}/export/json` | `GET` | `admin` | Returns JSON dump with workspace metadata, people, unions, children, and lore. |
| `/api/v1/workspaces/{id}/import/gedcom` | `POST` | `admin` | Accepts multipart/form-data `.ged` file upload, parses, deduplicates, and populates workspace. |
| `/api/v1/workspaces/{id}/import/json` | `POST` | `admin` | Accepts multipart/form-data `.json` file upload, validates schema, and restores records. |

### 3.2 GEDCOM Specification Mapping

#### Individual Record Mapping (`INDI`)
- `NAME First /Last/` $\rightarrow$ `Person.first_name`, `Person.last_name`. If `_MARNM` or maiden name present, maps to `Person.maiden_name`.
- `SEX M/F/U` $\rightarrow$ `Person.gender` (`male`, `female`, `other`, `unknown`).
- `BIRT` (Birth Event):
  - `DATE` (e.g., `12 MAY 1945`, `ABT 1940`, `BEF 1900`) $\rightarrow$ `Person.birth_date` and `Person.birth_date_qualifier` (`exact`, `approximate`, `before`, `after`).
  - `PLAC` $\rightarrow$ `Person.birth_place`.
- `DEAT` (Death Event):
  - If present $\rightarrow$ `Person.is_living = False`.
  - `DATE` $\rightarrow$ `Person.death_date`, `Person.death_date_qualifier`.
  - `PLAC` $\rightarrow$ `Person.death_place`.
- `NOTE` & `SOUR`:
  - First general note $\rightarrow$ `Person.biography` (if empty).
  - Subsequent notes or event notes $\rightarrow$ `LoreNote` record with title `"Imported Note: [Subject]"`, content, and `tags=["gedcom-import"]`.

#### Family Record Mapping (`FAM`)
- `HUSB`, `WIFE` $\rightarrow$ `FamilyUnion.partner1_id`, `FamilyUnion.partner2_id`.
- `MARR` (Marriage Event):
  - `DATE` $\rightarrow$ `FamilyUnion.start_date`.
  - `TYPE` / status $\rightarrow$ `FamilyUnion.union_type` (`marriage`, `partnership`, `divorced`).
- `CHIL` $\rightarrow$ `ChildRelationship` linking `FamilyUnion.id` and `Person.id` (child), with `relationship_type` defaulting to `biological` (or `adopted` if `PEDI adopted` tag is specified).

### 3.3 Smart Deduplication & Conflict Handling

When processing an import:
1. **Normalization**: Names are trimmed, casing normalized, and birth years extracted.
2. **Match Detection**:
   - If an existing active person matches normalized `(first_name, last_name, birth_year)`:
     - Merge missing fields (e.g. if existing has no birth place or biography, enrich with imported values).
     - Append imported notes as new `LoreNote` entries so no stories are lost.
     - Track as `merged_people_count += 1`.
   - If no match found:
     - Create a new `Person` record in the database.
     - Track as `created_people_count += 1`.
3. **Graph Validation & Cycle Detection**:
   - For every created/updated union and child relationship, execute `cycle_service.would_create_cycle(db, workspace_id, parent_id, child_id)`.
   - If a cyclic ancestry would be introduced by the file, skip the invalid edge, record a warning in the import summary, and continue cleanly.
4. **Audit Logging**:
   - Emit an `audit_log` event: `action="data_import"`, `entity_type="workspace"`, storing the filename, stats, and timestamp.

### 3.4 Import Summary Schema (`ImportSummaryRead`)

```python
class ImportSummaryRead(BaseModel):
    success: bool
    filename: str
    format: str  # "gedcom" | "json"
    people_created: int
    people_merged: int
    unions_created: int
    children_linked: int
    lore_notes_created: int
    warnings: list[str]
```

---

## 4. Frontend Component Design

### 4.1 Header Trigger (RBAC Filtered)
In [`Header.tsx`](file:///home/prmohan/projects/lores/frontend/src/components/layout/Header.tsx):
- Check `canManageData = userRole === 'admin' || userRole === 'owner' || currentUser?.is_superadmin`.
- If true, display a dedicated `<button>` with `<Database className="w-4 h-4" />` labeled **"Data & Backup"**.
- This button is completely hidden from `collaborator` and `viewer` roles.

### 4.2 Data & Backup Modal (`DataBackupModal.tsx`)
Accessible Radix dialog with two primary tabs:

1. **Tab 1: Export Family Tree**
   - Option A: **GEDCOM 7.0 / 5.5.1 (`.ged`)** — "Standard genealogy format compatible with GrampsWeb, Gramps, Ancestry, and FamilySearch."
   - Option B: **Lores JSON Archive (`.json`)** — "Complete backup containing all people, unions, rich lore stories, tags, and workspace history."
   - Action: "Download File" button with instant browser file generation/download.

2. **Tab 2: Import Family Tree**
   - Drag-and-drop file upload zone supporting `.ged`, `.gedcom`, and `.json`.
   - Instant file inspection (displaying filename and size).
   - "Upload & Import Tree" button with spinner/loading indicator.
   - On completion: displays the **Import Summary Report** with counts of people created, records merged, unions established, and any warnings.

---

## 5. Security, Multi-Tenancy & Error Handling

- **Workspace Isolation**: All import transactions are strictly scoped to `workspace_id`. IDs in uploaded files are mapped internally to fresh UUIDs in the target workspace.
- **Payload Limits**: Max file size capped at 25 MB.
- **Rollback on Fatal Error**: Backend wraps the entire import operation in a single database transaction (`db.commit()` only if valid; `db.rollback()` on uncaught exception).
- **Graceful Error Messaging**: Clear, human-readable error messages for corrupt GEDCOM headers or invalid JSON payloads (e.g., *"Uploaded file is not a valid GEDCOM or JSON file"*).

---

## 6. Verification & Test Plan

1. **Backend Unit & Integration Tests (`tests/test_gedcom_export_import.py`)**:
   - Test GEDCOM generation for a sample 3-generation family tree.
   - Test GEDCOM ingestion from standard GrampsWeb export sample file.
   - Test RBAC enforcement (collaborator/viewer receiving 403 Forbidden; admin succeeding).
   - Test smart deduplication and field enrichment.
   - Test cycle detection skipping invalid parent links.
   - Test JSON full-fidelity backup export and import.
2. **Frontend Component & A11y Tests (`DataBackupModal.test.tsx`)**:
   - Verify modal rendering, tab switching, and file input handling.
   - Verify `vitest-axe` WCAG 2.1 AAA compliance (focus trapping, aria labels, keyboard navigation).
   - Verify non-admin users cannot see the "Data & Backup" button.
3. **Full Monorepo Verification**:
   - Backend: `ruff check .`, `ruff format --check .`, `mypy app`, `pytest -v`.
   - Frontend: `npm run lint`, `npm run build`, `npm test`.
