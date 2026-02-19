#!/usr/bin/env bash
set -euo pipefail

PISTON_IMAGE="${PISTON_IMAGE:-ghcr.io/engineer-man/piston:latest}"
PISTON_CONTAINER_NAME="${PISTON_CONTAINER_NAME:-piston}"
PISTON_PACKAGES_DIR="${PISTON_PACKAGES_DIR:-/home/deploy/piston-packages}"
PISTON_PORT="${PISTON_PORT:-127.0.0.1:2000:2000}"

docker rm -f "$PISTON_CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$PISTON_CONTAINER_NAME" \
  --restart unless-stopped \
  --privileged \
  --memory=512m \
  --cpus=1.0 \
  --pids-limit=100 \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  -e PISTON_RUN_TIMEOUT=12000 \
  -e PISTON_COMPILE_TIMEOUT=12000 \
  -e PISTON_OUTPUT_MAX_SIZE=65536 \
  -v "$PISTON_PACKAGES_DIR:/piston/packages" \
  -p "$PISTON_PORT" \
  "$PISTON_IMAGE"

echo "Piston container '$PISTON_CONTAINER_NAME' started"
