# Automated Accessibility & CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated accessibility compliance across static analysis (jsx-a11y), component tests (vitest-axe), E2E browser scans (Playwright + axe-core), in-browser dev monitoring (@axe-core/react), and a complete GitHub Actions CI/CD pipeline including Lighthouse CI.

**Architecture:** Multi-layered automated accessibility testing and CI/CD automation:
1. Static analysis via ESLint + `jsx-a11y` rules.
2. Component-level DOM audits via `vitest-axe` inside Vitest.
3. E2E browser-level automated accessibility scans via `@axe-core/playwright`.
4. Continuous inspection in development via `@axe-core/react`.
5. Full-stack GitHub Actions workflow with Lighthouse CI enforcement.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, ESLint, `eslint-plugin-jsx-a11y`, `vitest-axe`, `axe-core`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-08-23-lores-family-tree-design.md](file:///home/prmohan/projects/lores/docs/superpowers/specs/2026-08-23-lores-family-tree-design.md) & [AGENTS.md](file:///home/prmohan/projects/lores/AGENTS.md)

## Global Constraints

- Backend must pass `ruff check .`, `ruff format --check .`, `mypy app`, and `pytest -v`.
- Frontend must pass `npm run build` (`tsc -b && vite build`), `npm run lint`, `npm test` (`vitest run`), and `npm run test:e2e:a11y`.
- Senior-first UX accessibility rules: WCAG 2.1 AA compliant baseline with AAA contrast/target-size focus.

---

### Task 1: Fix Existing Frontend Type and Test Failures

**Files:**
- Modify: `frontend/src/components/interview/GuidedInterviewModal.tsx`
- Modify: `frontend/src/components/map/BirdseyeMapCanvas.tsx`
- Modify: `frontend/tests/BirdseyeMapCanvas.test.tsx`

**Interfaces:**
- Clean builds with `tsc -b && vite build` and passing Vitest test suites.

- [ ] **Step 1: Fix unused imports in `GuidedInterviewModal.tsx` and `BirdseyeMapCanvas.tsx`**
- [ ] **Step 2: Fix selector collision in `BirdseyeMapCanvas.test.tsx` (distinguish SVG node button from breadcrumb button)**
- [ ] **Step 3: Run `npm run build` and `npm test` in `frontend/` to verify clean pass**

---

### Task 2: Configure Static Accessibility Analysis (`eslint-plugin-jsx-a11y`)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/.eslintrc.cjs`

**Interfaces:**
- Linting standard: `npm run lint` executes ESLint with `jsx-a11y/recommended`.

- [ ] **Step 1: Install ESLint dependencies (`eslint-plugin-jsx-a11y`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-react-hooks`)**
- [ ] **Step 2: Create `.eslintrc.cjs` with `plugin:jsx-a11y/recommended` rules and React/TypeScript configurations**
- [ ] **Step 3: Run `npm run lint` in `frontend/` and fix any linting warnings/errors**

---

### Task 3: Component-Level Accessibility Testing (`vitest-axe` + `axe-core`)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tests/setup.ts`
- Create: `frontend/tests/a11y-components.test.tsx`

**Interfaces:**
- Vitest matcher: `expect(results).toHaveNoViolations()`

- [ ] **Step 1: Install `vitest-axe` and `axe-core` in `frontend/`**
- [ ] **Step 2: Update `frontend/tests/setup.ts` to extend `expect` with `toHaveNoViolations` and type definitions**
- [ ] **Step 3: Create `frontend/tests/a11y-components.test.tsx` testing `FocusPersonView`, `BirdseyeMapCanvas`, `AddRelativeModal`, `GuidedInterviewModal`, `ActivityFeedModal`, `TrashCanModal`, `LoginForm`, and `VerifyOtpModal` against WCAG2A, WCAG2AA, and WCAG21AA rule tags**
- [ ] **Step 4: Run `npm test` in `frontend/` to verify all component a11y tests pass**

---

### Task 4: E2E Browser Accessibility Testing with Playwright & Axe (`@axe-core/playwright`)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/accessibility.spec.ts`

**Interfaces:**
- E2E command: `npm run test:e2e:a11y`

- [ ] **Step 1: Install `@playwright/test` and `@axe-core/playwright` in `frontend/`**
- [ ] **Step 2: Create `frontend/playwright.config.ts` with local preview server config**
- [ ] **Step 3: Create `frontend/e2e/accessibility.spec.ts` performing end-to-end axe audits on the full application views and opened dialogs**
- [ ] **Step 4: Add `"test:e2e"` and `"test:e2e:a11y"` scripts to `frontend/package.json`**
- [ ] **Step 5: Run `npm run test:e2e:a11y` to verify E2E accessibility tests pass**

---

### Task 5: In-Browser Live Dev Accessibility Monitoring (`@axe-core/react`)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Dynamically imported in dev mode without impacting production bundle size.

- [ ] **Step 1: Install `@axe-core/react` in `frontend/`**
- [ ] **Step 2: Update `frontend/src/main.tsx` with conditional dev-mode loader for `@axe-core/react`**
- [ ] **Step 3: Run `npm run build` to verify production bundle builds cleanly without bloat**

---

### Task 6: GitHub Actions CI/CD Pipeline & Lighthouse CI Configuration

**Files:**
- Create: `frontend/lighthouserc.json`
- Create: `.github/workflows/ci.yml`
- Modify: `AGENTS.md`

**Interfaces:**
- GitHub Actions workflow: `.github/workflows/ci.yml` running backend tests, frontend tests, linting, a11y tests, and Lighthouse CI on push/PR.

- [ ] **Step 1: Install `@lhci/cli` in `frontend/` and configure `frontend/lighthouserc.json` with $\ge 95\%$ accessibility assertion threshold**
- [ ] **Step 2: Create `.github/workflows/ci.yml` with parallel jobs for `backend-ci` (Python 3.12, ruff, mypy, pytest) and `frontend-ci` (Node 20, lint, build, vitest-axe, Playwright a11y, Lighthouse CI)**
- [ ] **Step 3: Update `AGENTS.md` to document the new automated accessibility toolchain and pre-commit commands**
- [ ] **Step 4: Execute the complete verification pipeline locally to confirm 100% passing status**
