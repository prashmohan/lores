#!/usr/bin/env bash
set -e

# Determine repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=================================================="
echo " Starting Lores Pre-Commit & Verification Pipeline"
echo " Repo root: ${REPO_ROOT}"
echo "=================================================="

# Detect virtual environment python / tools
if [ -d "${REPO_ROOT}/.venv/bin" ]; then
    VENV_BIN="${REPO_ROOT}/.venv/bin"
    PYTEST="${VENV_BIN}/pytest"
    RUFF="${VENV_BIN}/ruff"
    MYPY="${VENV_BIN}/mypy"
elif [ -d "${REPO_ROOT}/backend/.venv/bin" ]; then
    VENV_BIN="${REPO_ROOT}/backend/.venv/bin"
    PYTEST="${VENV_BIN}/pytest"
    RUFF="${VENV_BIN}/ruff"
    MYPY="${VENV_BIN}/mypy"
else
    PYTEST="pytest"
    RUFF="ruff"
    MYPY="mypy"
fi

echo ""
echo "=== 1. Running Backend Pytest Suite with Coverage ==="
cd "${REPO_ROOT}/backend"
"${PYTEST}" -q --cov=app --cov-report=term-missing:skip-covered
echo "✓ Pytest passed (100% passing tests with coverage)"

echo ""
echo "=== 2. Running Ruff Linter & Formatting Checks ==="
cd "${REPO_ROOT}/backend"
"${RUFF}" check -q .
"${RUFF}" format --check -q .
echo "✓ Ruff linter and formatting checks passed"

echo ""
echo "=== 3. Running Mypy Static Type Analysis ==="
cd "${REPO_ROOT}/backend"
"${MYPY}" app
echo "✓ Mypy type checks passed (strict mode)"

echo ""
echo "=== 4. Running Frontend Static A11y & Lint (ESLint + JSX-A11y) ==="
cd "${REPO_ROOT}/frontend"
npm run lint
echo "✓ ESLint and jsx-a11y static checks passed"

echo ""
echo "=== 5. Running Frontend TypeScript Compilation & Build ==="
cd "${REPO_ROOT}/frontend"
npm run build
echo "✓ TypeScript typechecking and production build passed"

echo ""
echo "=== 6. Running Frontend Component & A11y Tests (Vitest-Axe) ==="
cd "${REPO_ROOT}/frontend"
npm test
echo "✓ Vitest frontend component and accessibility tests passed"

echo ""
echo "=== 7. Running Playwright E2E Accessibility Audits ==="
cd "${REPO_ROOT}/frontend"
npm run test:e2e:a11y -- --reporter=line
echo "✓ Playwright E2E accessibility audits passed"

echo ""
echo "=================================================="
echo " 🎉 All Quality Gates Passed Successfully! (7/7) "
echo "=================================================="

