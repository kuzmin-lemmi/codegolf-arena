#!/usr/bin/env bash
# Проверка, что резервная копия действительно разворачивается.
# Разворачивает копию во ВРЕМЕННУЮ базу, сравнивает количество записей с боевой
# и удаляет временную базу за собой. Боевую базу не трогает.
#
# Запуск:  bash scripts/verify-backup.sh [файл.dump]
# Без аргумента берётся самая свежая копия из каталога бэкапов.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"
TABLES=(users tasks testcases submissions best_submissions sessions)

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

# Prisma дописывает в DATABASE_URL свои параметры (?schema=public и др.),
# которых не знают pg_dump/psql/pg_restore — они падают с
# "invalid URI query parameter". Убираем их, остальные параметры сохраняем
libpq_url() {
  local url="$1" base query kept="" param
  local -a params
  base="${url%%\?*}"
  if [[ "${url}" == *\?* ]]; then
    query="${url#*\?}"
    IFS='&' read -ra params <<< "${query}"
    for param in "${params[@]}"; do
      case "${param%%=*}" in
        schema|connection_limit|pool_timeout|pgbouncer|socket_timeout|statement_cache_size|sslaccept|sslidentity) ;;
        *) kept="${kept:+${kept}&}${param}" ;;
      esac
    done
  fi
  if [[ -n "${kept}" ]]; then
    printf '%s?%s' "${base}" "${kept}"
  else
    printf '%s' "${base}"
  fi
}

count_rows() {
  local url="$1" table="$2"
  psql "${url}" -tAc "SELECT count(*) FROM ${table}" 2>/dev/null || echo "-"
}

echo "[1/5] Настройки"
DATABASE_URL="${DATABASE_URL:-$(read_env_var DATABASE_URL || true)}"
[[ -n "${DATABASE_URL}" ]] || fail "DATABASE_URL не найден"
DATABASE_URL="$(libpq_url "${DATABASE_URL}")"
command -v psql       >/dev/null 2>&1 || fail "psql не установлен (apt install postgresql-client)"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore не установлен"

DUMP="${1:-}"
if [[ -z "${DUMP}" ]]; then
  DUMP="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'codegolf-*.dump' -type f | sort | tail -n 1)"
  [[ -n "${DUMP}" ]] || fail "в ${BACKUP_DIR} нет ни одной копии"
fi
[[ -f "${DUMP}" ]] || fail "файл не найден: ${DUMP}"
ok "проверяем копию: $(basename "${DUMP}")"

# Разбираем адрес базы: postgresql://user:pass@host:port/dbname?params
BASE="${DATABASE_URL%%\?*}"
QUERY="${DATABASE_URL#"${BASE}"}"
PREFIX="${BASE%/*}"
DBNAME="${BASE##*/}"
[[ -n "${DBNAME}" && "${PREFIX}" != "${BASE}" ]] || fail "не удалось разобрать DATABASE_URL"

STAMP="$(date +%Y%m%d%H%M%S)"
TMPDB="${DBNAME}_verify_${STAMP}"
ADMIN_URL="${PREFIX}/postgres${QUERY}"
TMP_URL="${PREFIX}/${TMPDB}${QUERY}"

cleanup() {
  psql "${ADMIN_URL}" -q -c "DROP DATABASE IF EXISTS \"${TMPDB}\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[2/5] Создаём временную базу ${TMPDB}"
psql "${ADMIN_URL}" -q -c "CREATE DATABASE \"${TMPDB}\"" >/dev/null \
  || fail "не удалось создать временную базу (нужны права CREATEDB)"
ok "временная база создана"

echo "[3/5] Разворачиваем копию"
RESTORE_LOG="$(mktemp)"
set +e
pg_restore --dbname="${TMP_URL}" --no-owner --no-privileges "${DUMP}" >"${RESTORE_LOG}" 2>&1
RESTORE_CODE=$?
set -e
if [[ "${RESTORE_CODE}" -ne 0 ]]; then
  echo "ВНИМАНИЕ: pg_restore вернул код ${RESTORE_CODE}. Последние строки:"
  tail -n 10 "${RESTORE_LOG}"
fi
rm -f "${RESTORE_LOG}"
ok "копия развёрнута"

echo "[4/5] Сравниваем с боевой базой"
# Шапка выровнена вручную: printf меряет ширину в байтах, а у кириллицы
# по 2 байта на символ, поэтому через printf она съезжала
echo "таблица                    боевая     из копии"
MISMATCH=0
EMPTY_CRITICAL=0
for table in "${TABLES[@]}"; do
  live="$(count_rows "${DATABASE_URL}" "${table}")"
  copy="$(count_rows "${TMP_URL}" "${table}")"
  mark=""
  if [[ "${live}" != "${copy}" ]]; then mark="  <-- расхождение"; MISMATCH=1; fi
  printf '%-20s %12s %12s%s\n' "${table}" "${live}" "${copy}" "${mark}"
  if [[ "${table}" == "users" || "${table}" == "tasks" ]]; then
    [[ "${copy}" =~ ^[0-9]+$ && "${copy}" -gt 0 ]] || EMPTY_CRITICAL=1
  fi
done

echo "[5/5] Итог"
[[ "${EMPTY_CRITICAL}" -eq 0 ]] || fail "в копии пусто там, где данные быть обязаны — копия непригодна"
if [[ "${MISMATCH}" -ne 0 ]]; then
  echo "ВНИМАНИЕ: числа не совпали. Это нормально, если на сайте шла активность"
  echo "после снятия копии (в копии данных будет меньше). Если в копии БОЛЬШЕ —"
  echo "разбирайтесь, копия старая или не от этой базы."
fi
ok "копия рабочая, из неё можно восстановиться"
echo "Временная база ${TMPDB} удалена."
