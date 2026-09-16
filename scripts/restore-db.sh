#!/usr/bin/env bash
# ВОССТАНОВЛЕНИЕ базы из резервной копии. Перезаписывает данные!
# Перед перезаписью скрипт сам делает аварийный снимок текущего состояния.
#
# Запуск:  bash scripts/restore-db.sh <файл.dump> --yes-overwrite
# Сначала обязательно остановите приложение:  sudo systemctl stop codegolf
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"

fail() { echo "ERROR: $*" >&2; exit 1; }
ok()   { echo "OK: $*"; }

read_env_var() {
  local name="$1" line value
  [[ -f "${ENV_FILE}" ]] || return 1
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" "${ENV_FILE}" | tail -n 1 || true)"
  [[ -n "${line}" ]] || return 1
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "${value}"
}

DUMP="${1:-}"
CONFIRM="${2:-}"

[[ -n "${DUMP}" ]] || fail "укажите файл копии: bash scripts/restore-db.sh <файл.dump> --yes-overwrite"
[[ -f "${DUMP}" ]] || fail "файл не найден: ${DUMP}"

DATABASE_URL="${DATABASE_URL:-$(read_env_var DATABASE_URL || true)}"
[[ -n "${DATABASE_URL}" ]] || fail "DATABASE_URL не найден"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore не установлен"
command -v pg_dump    >/dev/null 2>&1 || fail "pg_dump не установлен"

BASE="${DATABASE_URL%%\?*}"
DBNAME="${BASE##*/}"

if [[ "${CONFIRM}" != "--yes-overwrite" ]]; then
  echo "Вы собираетесь ПЕРЕЗАПИСАТЬ базу '${DBNAME}' содержимым файла:"
  echo "  $(basename "${DUMP}")"
  echo
  echo "Все данные, появившиеся после снятия этой копии, будут потеряны."
  echo "Если вы уверены, повторите команду с флагом --yes-overwrite:"
  echo "  bash scripts/restore-db.sh '${DUMP}' --yes-overwrite"
  exit 1
fi

echo "[1/4] Проверяем читаемость копии"
pg_restore --list "${DUMP}" >/dev/null 2>&1 || fail "файл копии повреждён — восстановление отменено"
ok "копия читается"

echo "[2/4] Аварийный снимок текущего состояния (на случай, если восстановление окажется ошибкой)"
mkdir -p "${BACKUP_DIR}"; chmod 700 "${BACKUP_DIR}"
PRE="${BACKUP_DIR}/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --dbname="${DATABASE_URL}" --format=custom --compress=9 --no-owner --no-privileges --file="${PRE}" \
  || fail "не удалось снять аварийный снимок — восстановление отменено"
chmod 600 "${PRE}"
ok "текущее состояние сохранено: $(basename "${PRE}")"

echo "[3/4] Восстанавливаем"
RESTORE_LOG="$(mktemp)"
set +e
pg_restore --dbname="${DATABASE_URL}" --clean --if-exists --no-owner --no-privileges "${DUMP}" >"${RESTORE_LOG}" 2>&1
RESTORE_CODE=$?
set -e
if [[ "${RESTORE_CODE}" -ne 0 ]]; then
  echo "ВНИМАНИЕ: pg_restore вернул код ${RESTORE_CODE}. Последние строки:"
  tail -n 20 "${RESTORE_LOG}"
  echo "Если данные не на месте — вернитесь к снимку:"
  echo "  bash scripts/restore-db.sh '${PRE}' --yes-overwrite"
fi
rm -f "${RESTORE_LOG}"

echo "[4/4] Что получилось"
for table in users tasks testcases submissions best_submissions; do
  n="$(psql "${DATABASE_URL}" -tAc "SELECT count(*) FROM ${table}" 2>/dev/null || echo '-')"
  printf '%-20s %s\n' "${table}" "${n}"
done

echo
echo "Готово. Запустите приложение:  sudo systemctl start codegolf"
echo "И проверьте:                   curl -fsS https://codegolf.ru/api/health"
