#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# startup.sh — Launches Django backend + Vite frontend concurrently.
#
# Features:
#   • Direct stdout/stderr passthrough with unbuffered logging
#   • Clean Ctrl+C (SIGINT/SIGTERM/EXIT) shutdown for both servers
#   • Auto-tears down survivor if one server exits/crashes
# ──────────────────────────────────────────────────────────────────────

# Resolve project root directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

# Pre-flight checks
if [[ ! -d "${BACKEND_DIR}/.venv" ]]; then
    echo "ERROR: Python virtualenv not found at ${BACKEND_DIR}/.venv" >&2
    echo "       Please build the environment first." >&2
    exit 1
fi

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]]; then
    echo "ERROR: node_modules not found at ${FRONTEND_DIR}/node_modules" >&2
    echo "       Please run 'npm install' in the frontend folder." >&2
    exit 1
fi

# PIDs of the spawned servers
BACKEND_PID=""
FRONTEND_PID=""

# Cleanup handler on exit or signal interruption
cleanup() {
    echo ""
    echo "⏹  Shutting down development servers..."
    
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi
    
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi
    
    # Allow processes time to exit gracefully, then force-kill if needed
    sleep 1
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill -KILL "$BACKEND_PID" 2>/dev/null || true
    fi
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -KILL "$FRONTEND_PID" 2>/dev/null || true
    fi

    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    echo "✔  All servers stopped."
}

# Trap exit signals to ensure cleanup is run
trap cleanup EXIT INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Finance App — Development Servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop both servers"
echo ""

# Start FastAPI Backend
cd "$BACKEND_DIR"
# shellcheck disable=SC1091
source .venv/bin/activate 2>/dev/null || true
python -u -m app.create_tables
python -u -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start Vite Frontend
cd "$FRONTEND_DIR"
npx vite --host &
FRONTEND_PID=$!

# Monitor the processes; if either dies, trigger cleanup and exit
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
    sleep 1
done

echo "⚠  One of the servers exited unexpectedly."
exit 1
