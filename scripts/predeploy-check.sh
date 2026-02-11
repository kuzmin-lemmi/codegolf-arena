#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:3000}"
APP_PID=""

cleanup() {
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "[1/6] Lint"
npm run lint

echo "[2/6] Prisma client"
npm run db:generate

echo "[3/6] PostgreSQL preflight"
NODE_ENV=production npm run ops:preflight:postgres

echo "[4/6] Build"
npm run build

echo "[5/6] Start app for smoke"
npm run start > /tmp/codegolf-predeploy-start.log 2>&1 &
APP_PID=$!

for i in {1..30}; do
  if curl -fsS "${BASE_URL}/api/health" > /dev/null; then
    echo "Local app is ready"
    break
  fi

  if [[ "${i}" == "30" ]]; then
    echo "App failed to start. Last logs:"
    tail -n 50 /tmp/codegolf-predeploy-start.log || true
    exit 1
  fi

  sleep 1
done

echo "[6/6] Local smoke"
SMOKE_BASE_URL="${BASE_URL}" npm run ops:smoke

echo "Predeploy checks passed."
