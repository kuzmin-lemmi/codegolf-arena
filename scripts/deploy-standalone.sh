#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/codegolf-arena}"
SERVICE_NAME="${SERVICE_NAME:-codegolf}"
HEALTH_LOCAL="${HEALTH_LOCAL:-http://127.0.0.1:3000/api/health}"
HEALTH_PUBLIC="${HEALTH_PUBLIC:-https://codegolf.ru/api/health}"
AUTO_STASH="${AUTO_STASH:-false}"

cd "$APP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$AUTO_STASH" == "true" ]]; then
    echo "Working tree is dirty. Stashing local changes (AUTO_STASH=true)."
    git stash push -u -m "auto-stash before deploy $(date +%Y-%m-%dT%H:%M:%S)"
  else
    echo "Working tree has local changes. Deploy stopped to avoid overwrite."
    echo "Use: git stash push -u -m 'before deploy'"
    echo "Or rerun with AUTO_STASH=true"
    exit 1
  fi
fi

echo "[1/9] Pull latest changes"
git pull --ff-only

echo "[2/9] Install dependencies"
npm ci

echo "[3/9] Generate Prisma client"
npm run db:generate

echo "[4/9] Preflight checks"
NODE_ENV=production npm run ops:preflight:postgres

echo "[5/9] Apply DB schema"
npm run db:push

echo "[6/9] Build"
npm run build

echo "[7/9] Copy standalone assets"
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
cp -R public .next/standalone/

echo "[8/9] Restart service: $SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "[9/9] Health checks"
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
