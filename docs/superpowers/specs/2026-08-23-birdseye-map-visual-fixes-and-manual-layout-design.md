# Birdseye Map Visual Enhancements & Server-Persisted Interactive Layout Specification

**Date**: 2026-08-23  
**Status**: Draft for Review  
**Domain**: Interactive Canvas Ergonomics, SVG Line Bridges, and Server-Side Layout Synchronization

---

## 1. Overview & Objectives

This specification defines three visual and interactive enhancements for the **Birdseye Map** canvas:
1. **Sibling Bus Offset & Subtree Separation**: Prevent adjacent family distributor buses from fusing into a single horizontal line by staggering bus $Y$-levels and providing horizontal branch separation.
2. **SVG Bridge / Jump Arcs on Line Crossings**: Automatically render clean semi-circular bridge arcs ($r=5\text{px}$) when vertical lines cross horizontal marriage/bus lines.
3. **Interactive Drag-and-Drop Node Positioning with Server-Side Persistence**:
   - Allow users (collaborators and admins) to manually reposition any person card on the canvas with real-time edge recalculation.
   - **Server-Side Persistence**: Custom $(x, y)$ positions are saved to the backend database (`workspaces.map_layout` column) so the customized layout is shared among all family members across devices and sessions.
   - **Reset Layout**: Provide a **"Reset Auto-Layout"** button that clears the saved layout on the server and snaps all users' view back to the auto-calculated Sugiyama layout.

---

## 2. Architecture & Data Flow

```mermaid
graph TD
    subgraph Frontend [React Canvas Client]
        AutoLayout[Sugiyama Barycentric Algorithm]
        ServerPositions[Fetched from GET /workspaces/{id}/map-layout]
        ResolvedLayout[Active Coordinates: server_positions[id] ?? auto_layout[id]]
        NodeDrag[Card Drag -> Realtime 60fps Re-routing]
        DebounceSave[Debounced PUT /workspaces/{id}/map-layout]
        ResetBtn[Reset Button -> DELETE /workspaces/{id}/map-layout]
    end

    subgraph Backend [FastAPI & SQLAlchemy]
        GetMapLayout[GET /api/v1/workspaces/{id}/map-layout]
        PutMapLayout[PUT /api/v1/workspaces/{id}/map-layout]
        DeleteMapLayout[DELETE /api/v1/workspaces/{id}/map-layout]
    end

    subgraph Database [PostgreSQL / SQLite]
        WorkspaceTable[Workspace.map_layout JSON Column]
    end

    AutoLayout --> ResolvedLayout
    ServerPositions --> ResolvedLayout
    NodeDrag --> ResolvedLayout
    NodeDrag --> DebounceSave
    DebounceSave --> PutMapLayout
    ResetBtn --> DeleteMapLayout
    GetMapLayout --> WorkspaceTable
    PutMapLayout --> WorkspaceTable
    DeleteMapLayout --> WorkspaceTable
```

---

## 3. Backend Implementation

### 3.1 Model & Migration
In [`backend/app/models/workspace.py`](file:///home/prmohan/projects/lores/backend/app/models/workspace.py):
```python
class Workspace(Base, TimestampMixin):
    # ...
    map_layout: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True, default=dict
    )
```

### 3.2 Schemas (`backend/app/schemas/workspace.py`)
```python
class MapNodePosition(BaseModel):
    x: float
    y: float

class MapLayoutRead(BaseModel):
    positions: dict[str, MapNodePosition] = Field(default_factory=dict)

class MapLayoutUpdate(BaseModel):
    positions: dict[str, MapNodePosition] = Field(default_factory=dict)
```

### 3.3 Endpoints (`backend/app/api/v1/workspaces.py`)
- `GET /api/v1/workspaces/{workspace_id}/map-layout`:
  - Requires membership (`viewer` or higher).
  - Returns `MapLayoutRead(positions=workspace.map_layout or {})`.
- `PUT /api/v1/workspaces/{workspace_id}/map-layout`:
  - Requires `collaborator` or `admin` role.
  - Updates `workspace.map_layout = payload.model_dump()["positions"]`.
  - Returns updated `MapLayoutRead`.
- `DELETE /api/v1/workspaces/{workspace_id}/map-layout`:
  - Requires `collaborator` or `admin` role.
  - Resets `workspace.map_layout = None`.
  - Returns `{"message": "Map layout reset to default"}`.

---

## 4. Frontend Implementation

### 4.1 Sibling Bus Offset & Subtree Separation
- **Subtree Buffering**: Increase horizontal separation between distinct family units to $70\text{px}-80\text{px}$ so adjacent sibling groups have visual breathing room.
- **Staggered Bus $Y$-Levels**: For family units in tier $T_i$, alternate the distributor bus height:
  $$Y_{\text{bus}}(U) = Y_{\text{base}} + ((U_{\text{index}} \bmod 2) \times 16\text{px} - 8\text{px})$$
  This ensures that adjacent sibling buses are never collinear at the exact same $Y$-coordinate, making each family unit's bounds distinct.
- **Strict Bus Truncation**: Sibling buses span strictly from $\min(X_{\text{stem}}, \min_c X_c)$ to $\max(X_{\text{stem}}, \max_c X_c)$ with rounded end-caps.

### 4.2 SVG Crossing Detection & Jump Arc Bridges
- Collect all horizontal line segments (marriage lines and sibling buses) and all vertical line segments (drop stems and child ingress lines).
- For each vertical segment from $(x, y_1)$ to $(x, y_2)$ intersecting a horizontal segment at $(x, y_{\text{cross}})$:
  - Generate jump arc bridge:
    ```
    M x y1
    L x (y_cross - 6)
    A 6 6 0 0 0 x (y_cross + 6)
    L x y2
    ```

### 4.3 Interactive Dragging, Server Sync & Reset Button
- **Canvas vs Card Drag**:
  - Dragging the canvas background pans the viewport.
  - Dragging a person card updates its position in local state and triggers live edge re-routing.
  - On drag release (`pointerUp` / `mouseUp`): saves updated positions to backend via `api.workspaces.updateMapLayout(workspaceId, positions)`.
- **Reset Layout Button**:
  - Added to the canvas toolbar (`RotateCcw` icon).
  - Clicking calls `api.workspaces.resetMapLayout(workspaceId)` and resets local state, snapping the layout back to the default Sugiyama layout.

---

## 5. Verification & Test Plan

1. **Backend Tests (`backend/tests/test_workspaces.py`)**:
   - Test `GET`, `PUT`, `DELETE` on `/workspaces/{id}/map-layout`.
   - Verify RBAC: viewer can read, collaborator/admin can update and delete.
2. **Frontend Tests (`frontend/tests/BirdseyeMapCanvas.test.tsx` & `App.test.tsx`)**:
   - Verify server layout loading and applying custom positions.
   - Verify jump arc bridge rendering on line crossings.
   - Verify staggered sibling bus heights.
   - Verify dragging updates positions and triggers save.
   - Verify "Reset Layout" button clears custom layout.
   - Verify `vitest-axe` automated accessibility audit.
3. **Monorepo Quality Pipeline**:
   - `ruff check .`, `ruff format --check .`, `mypy app`, `pytest -v`
   - `npm run lint`, `npm run build`, `npm test`
