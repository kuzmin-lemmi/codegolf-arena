#!/usr/bin/env bash
set -euo pipefail

PISTON_CONTAINER_NAME="${PISTON_CONTAINER_NAME:-piston}"
PISTON_HEALTH_URL="${PISTON_HEALTH_URL:-http://127.0.0.1:2000/api/v2/runtimes}"
TIMEOUT_SECONDS="${PISTON_WATCHDOG_TIMEOUT_SECONDS:-4}"
LOG_TAG="piston-watchdog"

if ! docker ps --format '{{.Names}}' | grep -qx "$PISTON_CONTAINER_NAME"; then
  logger -t "$LOG_TAG" "container '$PISTON_CONTAINER_NAME' is not running, starting it"
  docker start "$PISTON_CONTAINER_NAME" >/dev/null
fi

if ! curl -fsS --max-time "$TIMEOUT_SECONDS" "$PISTON_HEALTH_URL" >/dev/null; then
  logger -t "$LOG_TAG" "health check failed, restarting '$PISTON_CONTAINER_NAME'"
  docker restart "$PISTON_CONTAINER_NAME" >/dev/null
fi
