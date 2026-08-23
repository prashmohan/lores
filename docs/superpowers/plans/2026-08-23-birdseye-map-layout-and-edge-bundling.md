# Birdseye Map Layout & Family Union Edge Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Sugiyama-style barycentric generational ordering and family union edge bundling (1 ingress line per child) in the Birdseye Map canvas to minimize edge crossings and visual clutter.

**Architecture:** Refactor the graph layout calculation in `BirdseyeMapCanvas.tsx` to group couples into atomic family units, sort tiers using multi-pass barycenter relaxation, and route parent-child connections through a family union midpoint and sibling distributor bus.

**Tech Stack:** React 18, TypeScript, SVG, Tailwind CSS, Vitest, `vitest-axe`.

**Spec:** [`docs/superpowers/specs/2026-08-23-birdseye-map-layout-and-edge-bundling-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-birdseye-map-layout-and-edge-bundling-design.md)

## Global Constraints
- Maintain 100% deterministic layout calculation in `useMemo`.
- Every child from a shared family union or parent must receive exactly **one** vertical incoming line entering from above.
- Couples/partners must remain adjacent in their generational tier.
- Maintain high-contrast WCAG 2.1 AAA compliance and keyboard panning/zooming.

---

### Task 1: Barycentric Tier Ordering & Family Unit Clustering

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Produces: Enhanced `nodes: PositionedNode[]` with non-overlapping, barycentrically sorted $(x, y)$ positions and atomic couple placement.

- [ ] **Step 1: Write failing unit test for barycentric ordering**

Create tests in `frontend/tests/BirdseyeMapCanvas.test.tsx` asserting that children are horizontally ordered corresponding to the horizontal position of their parents across tiers, preventing cross-tier line entanglement.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement barycentric ordering and atomic couple clustering**

In `BirdseyeMapCanvas.tsx`:
- Group tier members into `CoupleUnit` (adjacent partners) and `SingleUnit`.
- Implement multi-pass barycenter calculation (sorting tier units by the average $X$ of connected nodes in the tier above).
- Assign $X$-coordinates with tight $24\text{px}$ gap for partners and $50\text{px}$ separation between family units.

- [ ] **Step 4: Run test to verify passing**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: PASS

---

### Task 2: Family Union Junction & Sibling Bus Edge Bundling

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Produces: `connections: RenderedEdge[]` and SVG bus paths where each child has exactly 1 incoming connector from the parent union.

- [ ] **Step 1: Write failing unit test for single ingress edge per child**

Assert in `frontend/tests/BirdseyeMapCanvas.test.tsx`:
- Two parents with 3 children generate a horizontal marriage line, a union midpoint drop stem, a horizontal sibling bus, and exactly 3 child drop lines (one per child, not 6 crossing lines).
- Single parents generate a clean drop stem branching to their children.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: FAIL

- [ ] **Step 3: Implement family union & sibling bus routing**

In `BirdseyeMapCanvas.tsx`:
- Identify distinct parent units (2-parent unions and 1-parent families).
- Compute union midpoint between partner nodes.
- Generate vertical drop stem to inter-tier midline $Y_{\text{bus}}$.
- Generate horizontal distributor bus spanning across all children of the union.
- Generate single vertical drop line to each child's top center $(c.x + W/2, c.y)$.
- Render SVG paths with rounded corners and clean orthogonal styling.

- [ ] **Step 4: Run test to verify passing**

Run: `npm test tests/BirdseyeMapCanvas.test.tsx`  
Expected: PASS

---

### Task 3: Comprehensive Testing & Monorepo Verification

**Files:**
- Modify: `frontend/tests/BirdseyeMapCanvas.test.tsx`
- Modify: `frontend/tests/a11y-components.test.tsx`

- [ ] **Step 1: Add multi-generation and complex union tests**

Add test cases covering:
- 3+ generation family trees (grandparents, parents, children).
- Mixed single-parent and two-parent families on the same canvas.
- Re-centering and interactive person selection.
- `vitest-axe` automated accessibility audit.

- [ ] **Step 2: Run full frontend and backend verification**
```bash
# Frontend verification
cd frontend
npm run lint
npm run build
npm test

# Backend verification
cd ../backend
../.venv/bin/ruff check .
../.venv/bin/ruff format --check .
../.venv/bin/mypy app
../.venv/bin/pytest -v
```
