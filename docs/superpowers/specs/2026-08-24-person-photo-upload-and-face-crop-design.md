# Person Photo Upload and Face Crop — Design Specification

## Overview

This specification details the architecture, UX design, data model, and verification strategy for adding person photo uploads with interactive face-centering and zooming capabilities to Lores.

The feature enables family storytellers to upload portrait photos, intuitively center and zoom in on an individual's face using an accessible web-based crop tool, and see the cropped avatar rendered cleanly across both the Focus Person View and the Birds Eye View Overview Map.

---

## 1. Architectural Decisions

1. **Storage & Serving Strategy**:
   - High-resolution, compressed Base64 Data URLs (400×400 px, JPEG quality 0.85, typical size ~30–50 KB) are generated client-side by an HTML5 `<canvas>` and persisted in the `Person.avatar_url` database column (`Text` type).
   - This approach is completely self-contained, requires no separate filesystem storage daemon or cloud S3 bucket configuration, and ensures photos are automatically included in JSON backups, exports, and imports.

2. **Crop & Zoom Interaction**:
   - A dedicated, accessible modal (`PhotoCropModal`) provides a circular viewport guide with semi-transparent backdrop overlay.
   - Users can drag to pan the image in 2D space, adjust zoom via a smooth slider or step buttons (`+` / `-`), mouse wheel, and click a "Center / Reset" button to return to default framing.
   - Dual entry points: Triggerable from `EditPersonModal` via a prominent "Upload / Change Photo" button and from `PersonCard` via an edit photo quick action.

3. **Display Across Views**:
   - **Focus Person View (`PersonCard`)**: Renders a rounded image `<img src={avatar_url} ... />` in place of the initials badge, with graceful fallback to initials on load errors or missing photos.
   - **Birds Eye Overview Map (`BirdseyeMapCanvas`)**: Renders an SVG `<image>` element with a circular `<clipPath>` for each person node with an `avatar_url`, and in the floating selected-person toolbar.

4. **Privacy & Access Control**:
   - Avatars are viewable by all workspace members (including `viewer` role).
   - Only `collaborator`, `admin`, and `owner` roles can upload, change, or remove photos.

---

## 2. Backend Architecture

### 2.1 Model Changes (`backend/app/models/person.py`)
- Change `avatar_url` column type from `String(500)` to `Text` to support data URLs up to several hundred kilobytes without database truncation.

```python
avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
```

### 2.2 Schemas & Services
- `PersonCreate`, `PersonUpdate`, `PersonRead`, and `PersonSummary` schemas in `backend/app/schemas/person.py` already define `avatar_url: str | None`.
- `person_service.update_person_optimistic` handles updating `avatar_url` and recording the change in `AuditLog`.

---

## 3. Frontend Architecture

### 3.1 New Component: `PhotoCropModal.tsx`
- **Props**:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `currentAvatarUrl?: string | null`
  - `personName: string`
  - `onSavePhoto: (dataUrl: string | null) => Promise<void>`
- **Internal State & Mechanics**:
  - `rawImageSrc`: Data URL or Object URL of the selected file.
  - `zoom`: Zoom multiplier from `1.0` (fit) to `3.0` (300% zoom).
  - `pan`: `{ x: number, y: number }` offset in pixels.
  - `isDragging`: Boolean for active pointer drag.
  - File picker handling standard formats (`.jpg`, `.jpeg`, `.png`, `.webp`).
  - Output generation: Renders the cropped bounding box to a hidden 400×400 canvas and exports `canvas.toDataURL('image/jpeg', 0.85)`.
- **Accessibility & UX**:
  - Radix Dialog with descriptive `Dialog.Title` and `Dialog.Description`.
  - Accessible range slider with `aria-label="Photo zoom level"` and +/- zoom buttons with `aria-label`.
  - Focus trapping and keyboard escape navigation.
  - Zero `vitest-axe` WCAG violations.

### 3.2 Updates to `EditPersonModal.tsx`
- Add an Avatar section at the top of the modal displaying the current avatar (or initials placeholder).
- Include "Change Photo" / "Upload Photo" and "Remove Photo" buttons that open `PhotoCropModal` or clear the avatar.
- Propagate the updated `avatar_url` to the save handler.

### 3.3 Updates to `PersonCard.tsx`
- If `person.avatar_url` is present:
  - Render an `<img>` element with `alt={fullName}` and `className="w-10 h-10 rounded-xl object-cover border ..."`
  - Include an `onError` fallback state to revert to initials if the image fails to load.
- If `isFocus` is true:
  - Size the avatar accordingly (e.g. 48×48 px or maintaining proportion with the hero card).
- When editable, provide a subtle camera/pencil badge on hover for direct photo editing.

### 3.4 Updates to `BirdseyeMapCanvas.tsx`
- In the SVG renderer:
  - Add `<clipPath id={`avatar-clip-${node.person.id}`}><circle cx="32" cy="45" r="18" /></clipPath>`
  - Render `<image href={node.person.avatar_url} x="14" y="27" width="36" height="36" clipPath={`url(#avatar-clip-${node.person.id})`} preserveAspectRatio="xMidYMid slice" />`
  - Render fallback `<circle>` and initials `<text>` if `node.person.avatar_url` is absent.
- In the floating selected person action bar:
  - Display the circular image if available.

---

## 4. Verification Plan

### 4.1 Automated Backend Tests
- `backend/tests/test_person_photo.py`:
  - Verify creating person with `avatar_url` data URL.
  - Verify updating person `avatar_url` via PATCH.
  - Verify audit log records avatar updates.
  - Verify `viewer` role can read person with `avatar_url`.

### 4.2 Automated Frontend Tests
- `frontend/tests/PhotoCropModal.test.tsx`:
  - Test file selection, zoom slider interaction, reset button, and save flow.
  - Run `vitest-axe` audit to verify 0 accessibility violations.
- `frontend/tests/PersonCard.test.tsx`:
  - Verify rendering of avatar image when `avatar_url` is provided.
  - Verify fallback to initials badge when `avatar_url` is absent or broken.
- `frontend/tests/BirdseyeMapCanvas.test.tsx`:
  - Verify SVG `<image>` and `<clipPath>` elements rendered for nodes with avatars.
- Complete CI Pipeline:
  - `ruff check .` and `ruff format --check .`
  - `mypy app`
  - `pytest -v`
  - `npm run lint`
  - `npm run build`
  - `npm test`
  - `npm run test:e2e:a11y`
