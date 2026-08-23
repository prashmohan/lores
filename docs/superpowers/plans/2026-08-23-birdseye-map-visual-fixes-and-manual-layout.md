# Birdseye Map Visual Fixes & Server-Persisted Manual Layout Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement sibling bus staggering, line crossing jump arcs, and interactive drag-and-drop node positioning with server-side persistence and a reset button in Lores.

**Architecture:** Extend the backend `Workspace` model with a `map_layout` JSON column and REST endpoints for getting, updating, and resetting custom coordinates. On the frontend, enhance `BirdseyeMapCanvas.tsx` with staggered family buses, dynamic SVG crossing jump arc detection, live card dragging, and server layout synchronization.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, React 18, TypeScript, SVG, Lucide Icons, Tailwind CSS, Vitest, Pytest.

**Spec:** [`docs/superpowers/specs/2026-08-23-birdseye-map-visual-fixes-and-manual-layout-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-birdseye-map-visual-fixes-and-manual-layout-design.md)

## Global Constraints
- Maintain deterministic layout calculations with graceful fallback to auto-layout when no custom position is saved.
- Ensure all members of a workspace see the server-persisted layout.
- Non-overlapping sibling buses and clean jump arcs on line intersections.
- Pass 100% of backend and frontend test suites and accessibility audits.

---

### Task 1: Backend Workspace `map_layout` Column, Schemas, and Endpoints

**Files:**
- Modify: `backend/app/models/workspace.py`
- Modify: `backend/app/schemas/workspace.py`
- Modify: `backend/app/api/v1/workspaces.py`
- Test: `backend/tests/test_workspaces.py`

**Interfaces:**
- Endpoints:
  - `GET /api/v1/workspaces/{workspace_id}/map-layout` -> `MapLayoutRead`
  - `PUT /api/v1/workspaces/{workspace_id}/map-layout` -> `MapLayoutRead`
  - `DELETE /api/v1/workspaces/{workspace_id}/map-layout` -> `dict[str, str]`

- [ ] **Step 1: Write failing tests for map layout endpoints**

Add tests to `backend/tests/test_workspaces.py`:
- Viewer/collaborator/admin can fetch map layout.
- Collaborator/admin can update map layout.
- Viewer receives 403 when attempting to update map layout.
- Collaborator/admin can delete/reset map layout.

- [ ] **Step 2: Run test to verify failure**

Run: `pytest tests/test_workspaces.py -k "map_layout" -v`  
Expected: FAIL

- [ ] **Step 3: Implement model field, schemas, and routes**

1. In `models/workspace.py`: Add `map_layout: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True, default=dict)`.
2. In `schemas/workspace.py`: Add `MapNodePosition`, `MapLayoutRead`, `MapLayoutUpdate`.
3. In `api/v1/workspaces.py`: Add GET, PUT, DELETE endpoints with role checks (`require_role`).

- [ ] **Step 4: Run tests to verify passing**

Run: `pytest tests/test_workspaces.py -v`  
Expected: PASS

- [ ] **Step 5: Run backend linting & formatting**

Run: `ruff check . && ruff format --check . && mypy app`

---

### Task 2: Frontend API Client & Types for Map Layout

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/tests/api.test.ts`

**Interfaces:**
- Types: `MapNodePosition`, `MapLayoutRead`, `MapLayoutUpdate`
- API client: `api.workspaces.getMapLayout`, `api.workspaces.updateMapLayout`, `api.workspaces.resetMapLayout`

- [ ] **Step 1: Update `types/api.ts` and `lib/api.ts`**

Add types and API methods for map layout endpoints.

- [ ] **Step 2: Add API client tests**

Add tests in `frontend/tests/api.test.ts` covering GET, PUT, and DELETE on map layout.

- [ ] **Step 3: Run test to verify passing**

Run: `npm test tests/api.test.ts`  
Expected: PASS

---

### Task 3: Sibling Bus Staggering & SVG Crossing Jump Arc Bridges

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Produces: Visual separation of adjacent cousin buses, and jump arc `A ...` segments on vertical-horizontal line crossings.

- [ ] **Step 1: Write failing tests in `BirdseyeMapCanvas.test.tsx`**

Test:
- Adjacent families in the same tier have staggered horizontal bus heights ($Y_{\text{bus}}$).
- Line crossings generate jump arc bridge paths (`A 6 6 ...`).

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement staggering & jump arc bridge generator**

1. In `BirdseyeMapCanvas.tsx`:
   - Compute `busY` with modulo staggering based on family unit index.
   - Detect intersections between vertical drop lines and horizontal lines.
   - Insert jump arc bridge segments on crossing vertical lines.

- [ ] **Step 4: Run test to verify passing**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: PASS

---

### Task 4: Interactive Drag-and-Drop, Server Layout Sync & Reset Layout Button

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Props on `BirdseyeMapCanvas`: `workspaceId?: string`, `serverPositions?: Record<string, { x: number; y: number }>`, `onSavePositions?: (positions: Record<string, { x: number; y: number }>) => void`, `onResetPositions?: () => void`, `canEdit?: boolean`.

- [ ] **Step 1: Write tests for drag repositioning, server sync, and reset**

Add tests verifying:
- Node positions resolve from server overrides when available.
- Dragging a node updates its position and triggers save callback.
- "Reset Auto-Layout" toolbar button triggers reset callback and restores Sugiyama coordinates.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement drag-and-drop, toolbar reset button, and App state wiring**

1. In `BirdseyeMapCanvas.tsx`:
   - Implement card dragging (`onPointerDown`, `onPointerMove`, `onPointerUp`).
   - Merge `serverPositions` with auto-calculated coordinates.
   - Add "Reset Auto-Layout" button (`RotateCcw` icon) in toolbar.
2. In `App.tsx`:
   - Load map layout from server when opening map tab.
   - Wire `onSavePositions` and `onResetPositions` to `api.workspaces`.

- [ ] **Step 4: Run tests to verify passing**

Run: `npm test`  
Expected: PASS

---

### Task 5: Full Monorepo Verification & E2E Validation

- [ ] **Step 1: Run complete backend verification pipeline**
```bash
cd backend
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
../.venv/bin/mypy app
../.venv/bin/pytest -v
```

- [ ] **Step 2: Run complete frontend verification pipeline**
```bash
cd ../frontend
npm run lint
npm run build
npm test
```
