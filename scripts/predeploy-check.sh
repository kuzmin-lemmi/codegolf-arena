#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Lint"
npm run lint

echo "[2/4] Prisma client"
npm run db:generate

echo "[3/4] Build"
npm run build

echo "[4/4] Local smoke"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}" npm run ops:smoke || {
  echo "Smoke check failed. Make sure app is running (npm run start or npm run dev)."
  exit 1
}

echo "Predeploy checks passed."
