#!/usr/bin/env bash
# Достаёт копию базы из внешнего хранилища и расшифровывает её.
# Нужен в худший день: сервер умер, на новом сервере нужно поднять базу.
#
# Запуск: bash scripts/fetch-offsite-backup.sh [имя-файла.dump.gpg]
# Без аргумента берётся самая свежая копия. Результат — файл .dump в текущей
# папке. Дальше: bash scripts/restore-db.sh <файл.dump> --yes-overwrite
#
# Нужен тот же файл настроек, что и для отправки (~/.config/codegolf/offsite.env):
# на новом сервере восстановите его из менеджера паролей.
set -euo pipefail

OFFSITE_ENV="${OFFSITE_ENV:-${HOME:-/home/deploy}/.config/codegolf/offsite.env}"

fail() { echo "ERROR: $*" >&2; exit 1; }
ok()   { echo "OK: $*"; }

read_var() {
  local name="$1" line value
  line="$(grep -E "^[[:space:]]*${name}=" "${OFFSITE_ENV}" | tail -n 1 || true)"
  [[ -n "${line}" ]] || return 1
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "${value}"
}

[[ -f "${OFFSITE_ENV}" ]] || fail "нет ${OFFSITE_ENV} — восстановите его из менеджера паролей"
command -v rclone >/dev/null 2>&1 || fail "rclone не установлен (sudo apt install rclone)"
command -v gpg >/dev/null 2>&1 || fail "gpg не установлен (sudo apt install gnupg)"

S3_BUCKET="$(read_var S3_BUCKET || true)"
S3_PREFIX="$(read_var S3_PREFIX || echo codegolf)"
BACKUP_PASSPHRASE="$(read_var BACKUP_PASSPHRASE || true)"
[[ -n "${S3_BUCKET}" && -n "${BACKUP_PASSPHRASE}" ]] || fail "в ${OFFSITE_ENV} не хватает S3_BUCKET или BACKUP_PASSPHRASE"

export RCLONE_CONFIG_OFFSITE_TYPE=s3
export RCLONE_CONFIG_OFFSITE_PROVIDER=Other
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$(read_var S3_ENDPOINT || true)"
export RCLONE_CONFIG_OFFSITE_REGION="$(read_var S3_REGION || echo ru-1)"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$(read_var S3_ACCESS_KEY || true)"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$(read_var S3_SECRET_KEY || true)"
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true

REMOTE_DIR="offsite:${S3_BUCKET}/${S3_PREFIX}"

echo "[1/3] Выбираем копию"
NAME="${1:-}"
if [[ -z "${NAME}" ]]; then
  NAME="$(rclone lsf "${REMOTE_DIR}" --include 'codegolf-*.dump.gpg' | sort | tail -n 1)"
  [[ -n "${NAME}" ]] || fail "в хранилище нет ни одной копии"
fi
ok "${NAME}"

echo "[2/3] Скачиваем и расшифровываем"
WORK="$(mktemp -d)"
export GNUPGHOME="${WORK}/gnupg"
mkdir -p "${GNUPGHOME}"
chmod 700 "${GNUPGHOME}" 2>/dev/null || true
trap 'gpgconf --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "${WORK}"' EXIT

rclone copyto "${REMOTE_DIR}/${NAME}" "${WORK}/${NAME}"
OUT="${PWD}/${NAME%.gpg}"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --output "${OUT}" --decrypt "${WORK}/${NAME}" 3<<<"${BACKUP_PASSPHRASE}" \
  || fail "не удалось расшифровать — неверный BACKUP_PASSPHRASE?"
chmod 600 "${OUT}"
ok "расшифровано: ${OUT}"

echo "[3/3] Проверяем, что это рабочая копия базы"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "${OUT}" >/dev/null 2>&1 || fail "файл расшифрован, но не читается как копия базы"
  ok "копия читается"
else
  echo "pg_restore не установлен — проверку пропускаем (sudo apt install postgresql-client)"
fi

echo
echo "Дальше — восстановление (остановите сайт перед этим):"
echo "  sudo systemctl stop codegolf"
echo "  bash scripts/restore-db.sh '${OUT}' --yes-overwrite"
