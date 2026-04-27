#!/usr/bin/env bash
#
# probe-host-transports.sh — bash wrapper for the python probe script.
#
# Boots a transient xfs-server (only if 3001 is not already serving),
# runs the python probe, then shuts the server down on exit. Pass-through
# arguments go to the python script.
#
# Usage:
#   ./scripts/probe-host-transports.sh
#   ./scripts/probe-host-transports.sh --pan 4580555500001111
#   ./scripts/probe-host-transports.sh --backend http://localhost:3001
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROBE="$SCRIPT_DIR/probe-host-transports.py"
PY="${PYTHON:-python}"

# Detect whether the backend is already up.
backend_up() {
  curl -fs --max-time 2 http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[probe] stopping transient xfs-server (pid $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if backend_up; then
  echo "[probe] xfs-server already running on :3001 — using existing instance"
else
  echo "[probe] booting transient xfs-server (pnpm --filter @atm/xfs-server start)"
  (cd "$REPO_ROOT" && pnpm --filter @atm/xfs-server start) > /tmp/atm-probe-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 60); do
    if backend_up; then
      echo "[probe] backend ready after ${i}s"
      break
    fi
    sleep 1
  done
  if ! backend_up; then
    echo "[probe] backend never became ready — log tail:"
    tail -20 /tmp/atm-probe-server.log || true
    exit 1
  fi
fi

"$PY" "$PROBE" "$@"
