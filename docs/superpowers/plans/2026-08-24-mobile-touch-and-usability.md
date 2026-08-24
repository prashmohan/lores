# Mobile Touch & Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full mobile touch support for Lores, including 2-finger canvas pan and pinch-to-zoom, long-press node drag-and-drop, responsive map scaling with fullscreen mode, mobile header drawer, and >=44px touch targets.

**Architecture:** A unified touch gesture handler on the SVG canvas disambiguates 2-finger pan/pinch zoom from 1-finger scrolling, while node-level long-press timers (250ms) isolate card dragging from card tapping. Responsive Tailwind layouts with mobile bottom action sheets and overflow menus ensure a seamless, accessible (WCAG 2.1 AAA) mobile experience.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vitest, React Testing Library, `vitest-axe`.

**Spec:** [`docs/superpowers/specs/2026-08-24-mobile-touch-and-usability-design.md`](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-24-mobile-touch-and-usability-design.md)

## Global Constraints

- Touch targets for all interactive actions MUST meet WCAG 2.1 AAA standards ($\ge 44 \times 44\text{px}$).
- Multi-touch canvas gestures MUST use 2-finger tracking (centroid pan and distance pinch-to-zoom), reserving 1-finger touch for normal page scroll and direct node interactions.
- Node dragging on touchscreens MUST require a 250ms long-press hold to avoid accidental drag triggers during scrolling or tapping.
- Form inputs on mobile MUST enforce a minimum font size of $16\text{px}$ (`text-base`) to prevent automatic iOS Safari viewport zooming.
- Zero lint errors (`npm run lint`), zero build errors (`npm run build`), and 100% passing tests (`npm test`, `pytest`).
- `README.md` must be updated to document all new features, gestures, and test metrics upon completion.

---

### Task 1: Multi-Touch Canvas Gestures Engine (2-Finger Pan & Pinch-Zoom + 1-Finger Guidance Toast)

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Consumes: Existing zoom and pan states (`zoom`, `pan`, `setZoom`, `setPan`).
- Produces: `onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel` on the SVG canvas element with 2-finger centroid tracking, focal-point zoom scaling, and a 1-finger guidance toast overlay.

- [ ] **Step 1: Write failing multi-touch unit tests**
Add unit tests in `frontend/tests/BirdseyeMapCanvas.test.tsx` to verify:
  1. 2-finger `touchstart` and `touchmove` updates canvas `pan` and `zoom` proportionally.
  2. 1-finger `touchmove` on canvas background ($>10\text{px}$) displays the toast notification *"Use two fingers to pan and zoom the map"*.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: FAIL due to missing touch event handlers and guidance toast.

- [ ] **Step 3: Implement multi-touch gesture handlers in `BirdseyeMapCanvas.tsx`**
Implement:
  - Touch state refs: `touchStartRef` storing initial touches midpoint, distance, zoom, and pan.
  - `handleCanvasTouchStart`: Detects 2 touches and initializes focal tracking; if 1 touch on background, records start point for scroll/hint tracking.
  - `handleCanvasTouchMove`: If 2 touches, calculates new distance and centroid, updates `zoom` and `pan`, and calls `e.preventDefault()`. If 1 touch moves $>10\text{px}$ on background, triggers 1.5s guidance toast.
  - `handleCanvasTouchEnd`: Resets multi-touch tracking state.
  - Floating guidance toast UI element at the bottom-center of the canvas.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/map/BirdseyeMapCanvas.tsx frontend/tests/BirdseyeMapCanvas.test.tsx
git commit -m "feat(map): implement 2-finger pan, pinch-zoom, and touch guidance toast"
```

---

### Task 2: Node Touch Drag-and-Drop (Long-Press Detection, Visual Lift, Touch Move, Drop & Save)

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Consumes: `canEdit`, `onSavePositions`, `customPositions`.
- Produces: Long-press node drag gesture with haptic vibration, animated lift state, scaled delta tracking, drop position saving, and short-tap selection fallback.

- [ ] **Step 1: Write failing node touch drag unit tests**
Add unit tests in `frontend/tests/BirdseyeMapCanvas.test.tsx` to verify:
  1. Touching a node and holding for $\ge 250\text{ms}$ initiates drag mode and allows repositioning via touch move.
  2. Short tap ($<250\text{ms}$) on a node selects the node without dragging or saving positions.
  3. Touching a node and moving before 250ms cancels the long-press timer.
  4. Moving a node and lifting finger calls `onSavePositions` with updated coordinates.
  5. Dragging is disabled when `canEdit === false`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: FAIL due to missing node touch handlers.

- [ ] **Step 3: Implement node long-press drag handlers in `BirdseyeMapCanvas.tsx`**
Implement:
  - `nodeTouchTimerRef` and `touchDraggedNodeRef` refs.
  - `handleNodeTouchStart`: Starts a 250ms timer. If timer triggers, sets active dragged node, triggers `navigator.vibrate?.(40)`, and marks node as lifted.
  - `handleNodeTouchMove`: If timer is active and movement $>8\text{px}$, cancels timer. If node is already lifted/dragged, computes canvas coordinate updates and calls `e.preventDefault()`.
  - `handleNodeTouchEnd`: Clears timers; if dragged, saves via `onSavePositions` and sets `justDraggedRef`; if not dragged (short tap), triggers `setSelectedPersonId`.
  - SVG node styling for lifted state (`stroke-amber-400 stroke-[3.5] filter drop-shadow-xl`).

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/map/BirdseyeMapCanvas.tsx frontend/tests/BirdseyeMapCanvas.test.tsx
git commit -m "feat(map): add long-press touch node drag-and-drop and haptic feedback"
```

---

### Task 3: Responsive Map Viewport, Fullscreen Mode & Mobile Action Sheet

**Files:**
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Test: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Consumes: Node selection and zoom controls.
- Produces: Dynamic responsive canvas container height (`h-[60vh] sm:h-[70vh] min-h-[440px] max-h-[750px]`), Fullscreen toggle mode (`isFullscreen`, `Maximize2` / `Minimize2`), collapsed mobile control pill, and mobile bottom action sheet with $\ge 44\text{px}$ touch targets.

- [ ] **Step 1: Write failing responsive & fullscreen unit tests**
Add unit tests in `frontend/tests/BirdseyeMapCanvas.test.tsx` to verify:
  1. Fullscreen toggle button toggles fullscreen mode container classes (`fixed inset-0 z-50`).
  2. Mobile selected person toolbar renders responsive layout with `Edit Details` and `Focus View` buttons.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: FAIL due to missing fullscreen controls.

- [ ] **Step 3: Implement responsive layout & fullscreen mode in `BirdseyeMapCanvas.tsx`**
Implement:
  - `isFullscreen` state with `Maximize2` and `Minimize2` toggle button in controls.
  - Dynamic container classes based on `isFullscreen`.
  - Responsive header pill collapsing controls on mobile.
  - Bottom action sheet with full-width layout, avatar, name, life dates, and $\ge 44\text{px}$ action buttons.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/BirdseyeMapCanvas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/map/BirdseyeMapCanvas.tsx frontend/tests/BirdseyeMapCanvas.test.tsx
git commit -m "feat(map): add responsive container, fullscreen toggle, and mobile action sheet"
```

---

### Task 4: App-Wide Mobile Enhancements (`PersonCard` Touch Targets, Header Mobile Drawer, Form Dialogs)

**Files:**
- Modify: `frontend/src/components/tree/PersonCard.tsx`
- Modify: `frontend/src/components/layout/Header.tsx`
- Modify: `frontend/src/components/tree/AddRelativeModal.tsx`
- Modify: `frontend/src/components/tree/EditPersonModal.tsx`
- Test: `frontend/tests/PersonCard.test.tsx`
- Test: `frontend/tests/Header.test.tsx`
- Test: `frontend/tests/a11y-components.test.tsx`

**Interfaces:**
- Consumes: Header navigation, PersonCard actions, Radix modal dialogs.
- Produces: Header mobile menu drawer for $<640\text{px}$ viewports, $\ge 44\text{px}$ touch targets on PersonCard edit/photo buttons, and mobile-friendly bottom-sheet dialog styling.

- [ ] **Step 1: Write failing tests for Header mobile menu and PersonCard touch targets**
Add tests in `frontend/tests/Header.test.tsx` and `frontend/tests/PersonCard.test.tsx` to verify:
  1. Header renders a mobile menu toggle on small screens and opens drawer with secondary actions.
  2. PersonCard action buttons have $\ge 44\text{px}$ touch targets.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/Header.test.tsx tests/PersonCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement Header mobile menu, PersonCard touch targets, and modal optimizations**
Implement:
  - `Header.tsx`: Mobile hamburger button and accessible collapsible menu containing `Members`, `Data & Backup`, `Super Admin`, `High Contrast`, and `Logout`.
  - `PersonCard.tsx`: Touch target expansion (`min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5`) for `Camera` and `Pencil` buttons.
  - `AddRelativeModal.tsx` & `EditPersonModal.tsx`: Responsive bottom-sheet dialog styling and `text-base` input sizing.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/Header.test.tsx tests/PersonCard.test.tsx tests/a11y-components.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/tree/PersonCard.tsx frontend/src/components/layout/Header.tsx frontend/src/components/tree/AddRelativeModal.tsx frontend/src/components/tree/EditPersonModal.tsx frontend/tests/PersonCard.test.tsx frontend/tests/Header.test.tsx
git commit -m "feat(ui): add mobile header menu, >=44px PersonCard touch targets, and mobile modals"
```

---

### Task 5: Documentation Synchronization & Pre-Commit Verification Pipeline

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**
Update `README.md` to document:
  - Mobile multi-touch gesture support (2-finger pan & pinch-zoom, guidance overlay).
  - Long-press node drag-and-drop with haptics.
  - Fullscreen overview map mode.
  - Header mobile drawer and $\ge 44\text{px}$ touch ergonomics.
  - Updated test count metrics.

- [ ] **Step 2: Run backend verification suite**
Run from `backend/`:
```bash
ruff check .
ruff format --check .
mypy app
pytest -v
```
Expected: 100% pass, 0 errors, 0 warnings.

- [ ] **Step 3: Run frontend verification suite**
Run from `frontend/`:
```bash
npm run lint
npm run build
npm test
```
Expected: 100% pass, 0 errors, 0 warnings.

- [ ] **Step 4: Commit**
```bash
git add README.md
git commit -m "docs: update README with mobile multi-touch gestures, fullscreen map, and touch ergonomics"
```
