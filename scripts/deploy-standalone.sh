#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/codegolf-arena}"
SERVICE_NAME="${SERVICE_NAME:-codegolf}"
HEALTH_LOCAL="${HEALTH_LOCAL:-http://127.0.0.1:3000/api/health}"
HEALTH_PUBLIC="${HEALTH_PUBLIC:-https://codegolf.ru/api/health}"

cd "$APP_DIR"

echo "[1/8] Pull latest changes"
git pull --ff-only

echo "[2/8] Install dependencies"
npm ci

echo "[3/8] Generate Prisma client"
npm run db:generate

echo "[4/8] Apply DB schema"
npm run db:push

echo "[5/8] Build"
npm run build

echo "[6/8] Copy standalone assets"
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
cp -R public .next/standalone/

echo "[7/8] Restart service: $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "[8/8] Health checks"
for i in {1..30}; do
  if curl -fsS "$HEALTH_LOCAL" > /dev/null; then
    echo "Local health OK"
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "Local health failed after waiting"
    sudo systemctl status "$SERVICE_NAME" --no-pager || true
    exit 1
  fi
  sleep 1
done

curl -fsS "$HEALTH_PUBLIC" > /dev/null
echo "Public health OK"

echo "Deploy completed successfully."
