#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# run-tests.sh — Automates database setup and E2E execution.
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"
E2E_DIR="${SCRIPT_DIR}/e2e"

# Database Configuration
export PGPASSWORD="Lem0n4de-"
DB_HOST="localhost"
DB_USER="finance"
DB_NAME="finance_test"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# Decoupled domain logging
echo "  Patricia's Isolated E2E Pipeline Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pre-flight Checks
if [[ ! -d "${BACKEND_DIR}/.venv" ]]; then
    echo "ERROR: Python virtualenv not found at ${BACKEND_DIR}/.venv" >&2
    exit 1
fi

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    echo "ERROR: node_modules not found in frontend" >&2
    exit 1
fi

if [[ ! -d "${E2E_DIR}/node_modules" ]]; then
    echo "ERROR: node_modules not found in e2e" >&2
    exit 1
fi

# Cleanup Handler on Exit
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "⏹  Tearing down testing environment..."
    
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi
    
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi
    
    sleep 1
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill -KILL "$BACKEND_PID" 2>/dev/null || true
    fi
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -KILL "$FRONTEND_PID" 2>/dev/null || true
    fi

    # Kill any dangling port 8000/3000 processes to avoid resource leaks
    lsof -t -i :8000 | xargs kill -9 2>/dev/null || true
    lsof -t -i :3000 | xargs kill -9 2>/dev/null || true

    echo "✔  Pipeline terminated cleanly."
}

trap cleanup EXIT INT TERM

# Ensure clean state by killing existing server processes first
echo "🧹 Killing any active processes on port 8000 & 3000..."
lsof -t -i :8000 | xargs kill -9 2>/dev/null || true
lsof -t -i :3000 | xargs kill -9 2>/dev/null || true

# Recreating isolated unit test database
echo "🗄  Recreating unit test database 'finance_unit_test'..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "REVOKE CONNECT ON DATABASE finance_unit_test FROM public;" 2>/dev/null || true
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'finance_unit_test' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS finance_unit_test;"
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE finance_unit_test;"

# Run unit tests
echo "🧪 Running backend unit tests..."
cd "$BACKEND_DIR"
# shellcheck disable=SC1091
source .venv/bin/activate
POSTGRESQL_URL="postgresql://$DB_USER:$PGPASSWORD@$DB_HOST:5432/finance_unit_test" PYTHONPATH=. pytest
cd "$SCRIPT_DIR"
echo "✔  Backend unit tests passed successfully."

# Recreating isolated E2E test database
echo "🗄  Recreating E2E test database '${DB_NAME}'..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "REVOKE CONNECT ON DATABASE ${DB_NAME} FROM public;" 2>/dev/null || true
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE ${DB_NAME};"

# Run Database table creation against isolated test database
echo "🚀 Running database table creation against isolated test database..."
cd "$BACKEND_DIR"
export POSTGRESQL_URL="postgresql://$DB_USER:$PGPASSWORD@$DB_HOST:5432/$DB_NAME"

# shellcheck disable=SC1091
source .venv/bin/activate
python -u -m app.create_tables

# Seed Status and TransactionType lookups
echo "🌱 Seeding isolated test database with Statuses and TransactionTypes..."
python -u -m app.seed_test_db

# Booting Backend
echo "📡 Launching isolated FastAPI backend on port 8000..."
python -u -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/fastapi_test.log 2>&1 &
BACKEND_PID=$!

# Booting Frontend
echo "💻 Launching Vite frontend on port 3000..."
cd "$FRONTEND_DIR"
npx vite --port 3000 --host > /tmp/vite_test.log 2>&1 &
FRONTEND_PID=$!

# Healthcheck loop
echo "⏳ Waiting for testing endpoints to become available..."
for i in {1..30}; do
    if curl -s http://localhost:8000/api/accounts/ > /dev/null && curl -s http://localhost:3000/ > /dev/null; then
        echo "🟢 Both servers are online and responsive."
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "❌ Timeout waiting for backend or frontend to start."
        exit 1
    fi
    sleep 1
done

# Run E2E Test Suite
echo "🧪 Running Playwright headed test suite with strict single-worker sequence..."
cd "$E2E_DIR"
export API_BASE_URL="http://localhost:8000"
npx playwright test
