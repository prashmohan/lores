# Mobile Touch & Usability Design Specification

- **Date:** 2026-08-24
- **Status:** Approved (Brainstorming Complete)
- **Scope:** Mobile Touch Gestures, Birds-Eye Map Canvas Usability, Responsive Layouts & Touch Targets across Lores

---

## 1. Overview & Problem Statement

Lores provides a multi-generational family tree and oral history builder. While the desktop experience features smooth SVG panning, zooming, and node dragging, mobile touch interaction previously presented significant usability barriers:
1. **Lack of Canvas Touch Handlers:** The Birds-Eye Overview SVG map only responded to mouse events (`onMouseDown`, `onMouseMove`, `onMouseUp`). Touching the canvas on mobile devices either caused default page scroll or did nothing.
2. **Ambiguity in Node Dragging vs. Canvas Panning:** Single-finger touches lacked gesture disambiguation between selecting a card, moving a node, and panning the canvas.
3. **Fixed Canvas Dimensions & Cluttered Controls:** Fixed height (`h-[650px]`) and unwrapped toolbars caused layout overflow on small mobile viewports ($<400\text{px}$).
4. **Touch Target Accessibility:** Sub-44px buttons on `PersonCard` and cluttered headers violated WCAG 2.1 AAA mobile ergonomics standards.

This specification details a complete, accessible, and high-performance solution that introduces multi-touch canvas navigation, long-press card dragging, responsive canvas scaling with fullscreen mode, and app-wide mobile optimizations.

---

## 2. Architecture & Gesture Design

### 2.1 Birds-Eye Multi-Touch Gesture Engine
The `BirdseyeMapCanvas` SVG element will incorporate a unified touch listener system (`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel`) handling 1-finger and 2-finger gestures:

```
                      ┌──────────────────────────────────────┐
                      │             Touch Event              │
                      └──────────────────┬───────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [ 1 Touch Point ]               [ 2 Touch Points ]
                         │                               │
             ┌───────────┴───────────┐                   │
             ▼                       ▼                   ▼
     [ Node Target ]        [ Canvas Bg ]       [ Multi-Touch Pan & Pinch ]
             │                       │                   │
      Hold >= 250ms?          Drag > 10px?       - Centroid Translation (Pan)
      ├─ Yes: Lift & Drag     ├─ Yes: 2-Finger   - Distance Ratio (Zoom)
      └─ No: Tap Select       │  Hint Toast      - e.preventDefault()
                              └─ Normal Scroll
```

#### A. Two-Finger Pan & Pinch-to-Zoom
- When `e.touches.length === 2`:
  - Calculate initial midpoint centroid $C_0 = \left(\frac{x_1 + x_2}{2}, \frac{y_1 + y_2}{2}\right)$ and initial touch distance $d_0 = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.
  - On move, compute new centroid $C_t$ and new distance $d_t$:
    $$\text{Zoom}_{\text{new}} = \text{clamp}\left(\text{Zoom}_0 \times \frac{d_t}{d_0}, 0.4, 3.0\right)$$
    $$\text{Pan}_{\text{new}} = \text{Pan}_0 + (C_t - C_0)$$
  - Coordinate focal stabilization: Anchor the transformation so the canvas point under the touch midpoint remains invariant during zoom.
  - Call `e.preventDefault()` during 2-finger gestures to suppress native browser zooming/scrolling.

#### B. Single-Finger Canvas Scrolling & Guidance Overlay
- Single-finger touches on the canvas background do **not** intercept `e.preventDefault()`, allowing standard page vertical scrolling on mobile.
- If a single-finger touch moves on the background by $>10\text{px}$, a floating guidance toast appears at the bottom-center of the canvas:
  - Text: *"Use two fingers to pan and zoom the map"*
  - Style: Dark semi-transparent pill (`bg-slate-900/90 text-white rounded-full px-4 py-2 text-xs font-bold shadow-lg`)
  - Behavior: Fades out automatically after 1.5 seconds.

---

### 2.2 Node Drag-and-Drop via Long-Press

To prevent accidental node moves while panning or tapping:

1. **Touch Start on Node:**
   - Record initial touch point $(x_0, y_0)$.
   - If `canEdit !== false`, start a 250ms timer (`longPressTimerRef`).
2. **Movement Before Timer Expires:**
   - If the finger moves $>8\text{px}$ before 250ms, cancel the timer (interpreted as a page scroll attempt).
3. **Timer Completion (250ms elapsed):**
   - Trigger **Node Lift**:
     - Haptic feedback: Trigger `navigator.vibrate?.(40)` where supported.
     - Visual state: Apply SVG filter / class with enhanced drop-shadow and amber pulsing ring (`stroke-amber-400 stroke-[3.5]`).
     - Set active node drag state.
4. **Node Dragging:**
   - On subsequent `touchmove`, calculate $(\Delta x, \Delta y)$ scaled by the active zoom level:
     $$x_{\text{node}} = \text{round}\left(x_{\text{start}} + \frac{\Delta x}{\text{zoom}}\right),\quad y_{\text{node}} = \text{round}\left(y_{\text{start}} + \frac{\Delta y}{\text{zoom}}\right)$$
   - Call `e.preventDefault()` to lock page scroll during active node dragging.
   - Update node positions in real-time.
5. **Drop & Persistence:**
   - On `touchend` or `touchcancel`, clear the timer and lifted visual state.
   - If the node was moved, call `onSavePositions(latestPositions)` and set a 200ms `justDraggedRef` guard to avoid triggering selection.
6. **Short Tap ($<250\text{ms}$):**
   - If touch ends before 250ms and no movement occurred, select the person node and open the mobile bottom action bar.

---

### 2.3 Mobile Layout & Viewport Sizing

#### A. Responsive Canvas Height & Fullscreen Mode
- Canvas container styled with responsive height:
  ```html
  <div className="relative w-full h-[60vh] sm:h-[70vh] min-h-[440px] max-h-[750px] bg-slate-100 rounded-3xl ...">
  ```
- **Fullscreen Mode Button:**
  - Added to the map controls: `Maximize2` / `Minimize2` toggle.
  - When active, applies `fixed inset-0 z-50 rounded-none w-screen h-screen` to provide maximum editing and viewing space on mobile devices.

#### B. Responsive Floating Toolbars
- **Top Control Bar:**
  - On mobile viewports ($<640\text{px}$), the control bar collapses into a compact floating pill containing Zoom In, Zoom Out, Reset View, and Fullscreen toggle.
  - Legend badges collapse under an expandable details toggle.
- **Selected Person Mobile Action Sheet:**
  - On desktop: Floating pill positioned `bottom-6 left-1/2 -translate-x-1/2`.
  - On mobile: Full-width bottom dock (`fixed sm:absolute bottom-0 left-0 right-0 rounded-t-2xl sm:rounded-2xl p-4 bg-slate-900/95 text-white`) featuring:
    - Full name, birth/death years, and avatar thumbnail.
    - Large action buttons: `Edit Details` ($\ge 44\text{px}$), `Focus View` ($\ge 44\text{px}$), and `Close`.

---

### 2.4 App-Wide Mobile Enhancements

1. **Header Navigation:**
   - Maintain a single 56px height header across all viewports.
   - On mobile ($<640\text{px}$), secondary administrative items (`Members`, `Data & Backup`, `Super Admin`, `High Contrast`, `User Profile`, `Logout`) are accessible via a mobile slide-out/dropdown menu.
2. **PersonCard & Focus View Touch Targets (WCAG 2.1 AAA):**
   - Expand hit areas for `Edit Photo` and `Edit Details` buttons to $\ge 44 \times 44\text{px}$ using padding/tap-target extensions.
   - Ensure clear focus indicators (`ring-2 ring-amber-500`) and high contrast.
3. **Modal Form Usability:**
   - Radix dialogs adapt on mobile to bottom-sheet layout (`sm:rounded-2xl rounded-t-3xl max-h-[85vh]`).
   - All input fields enforce minimum `text-base` ($16\text{px}$) font size to prevent iOS Safari automatic viewport zoom on input focus.

---

## 3. Data Flow & Interface Contracts

No backend schema modifications are required; all positioning data continues to synchronize via the existing `updateMapLayout` / `getMapLayout` endpoints (`/api/v1/workspaces/{workspace_id}/map-layout`).

```typescript
// Component Props and Event Signatures
interface BirdseyeMapCanvasProps {
  people: MapPerson[];
  edges?: TreeEdge[];
  focusPersonId?: string | null;
  workspaceId?: string;
  serverPositions?: Record<string, { x: number; y: number }>;
  onSelectPerson?: (personId: string) => void;
  onEditPerson?: (person: MapPerson) => void;
  onSavePositions?: (positions: Record<string, { x: number; y: number }>) => void;
  onResetPositions?: () => void;
  canEdit?: boolean;
}
```

---

## 4. Testing & Verification Strategy

1. **Vitest Unit & Component Tests:**
   - Test 2-finger `touchstart`, `touchmove`, `touchend` simulating multi-touch pinch zoom and pan calculations.
   - Test 1-finger background touch movement $>10\text{px}$ triggering the 2-finger guidance toast.
   - Test node long-press ($\ge 250\text{ms}$) triggering drag mode, moving node coordinates, and saving on touch end.
   - Test short tap ($<250\text{ms}$) selecting the person without repositioning.
   - Test fullscreen mode toggle button and state transitions.
   - Test `PersonCard` minimum touch targets and header mobile overflow.
2. **Accessibility Audits:**
   - `vitest-axe` component accessibility audits on `BirdseyeMapCanvas`, `PersonCard`, `Header`, and dialogs.
3. **Pre-Commit Verification:**
   - Backend: `ruff check .`, `ruff format --check .`, `mypy app`, `pytest -v`.
   - Frontend: `npm run lint`, `npm run build`, `npm test`.
