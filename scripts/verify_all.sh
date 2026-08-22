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
"${PYTEST}" --cov=app --cov-report=term-missing
echo "✓ Pytest passed (100% passing tests with coverage)"

echo ""
echo "=== 2. Running Ruff Linter & Formatting Checks ==="
cd "${REPO_ROOT}/backend"
"${RUFF}" check .
"${RUFF}" format --check .
echo "✓ Ruff linter and formatting checks passed"

echo ""
echo "=== 3. Running Mypy Static Type Analysis ==="
cd "${REPO_ROOT}/backend"
"${MYPY}" app
echo "✓ Mypy type checks passed (strict mode)"

echo ""
echo "=== 4. Running Frontend Vitest Suite ==="
cd "${REPO_ROOT}/frontend"
npm test -- --run
echo "✓ Vitest frontend component tests passed"

echo ""
echo "=== 5. Running Frontend TypeScript Compilation & Build ==="
cd "${REPO_ROOT}/frontend"
npm run build
echo "✓ TypeScript typechecking and production build passed"

echo ""
echo "=================================================="
echo " 🎉 All Quality Gates Passed Successfully! (5/5) "
echo "=================================================="
