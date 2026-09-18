#!/usr/bin/env bash
# Резервная копия базы Codegolf Arena.
# Запуск вручную:  bash scripts/backup-db.sh
# Автоматически:   systemd timer (см. scripts/systemd/) или cron.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
KEEP_MIN="${BACKUP_KEEP_MIN:-3}"
MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES:-4096}"

fail() { echo "ERROR: $*" >&2; exit 1; }
ok()   { echo "OK: $*"; }

# Читаем переменную из .env, не исполняя файл целиком.
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

echo "[1/5] Настройки"
DATABASE_URL="${DATABASE_URL:-$(read_env_var DATABASE_URL || true)}"
[[ -n "${DATABASE_URL}" ]] || fail "DATABASE_URL не найден (ни в окружении, ни в ${ENV_FILE})"
DATABASE_URL="$(libpq_url "${DATABASE_URL}")"
case "${DATABASE_URL}" in
  postgresql://*|postgres://*) ;;
  *) fail "DATABASE_URL не похож на адрес PostgreSQL" ;;
esac
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump не установлен (apt install postgresql-client)"
ok "база найдена, pg_dump на месте"

echo "[2/5] Каталог для копий"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
ok "${BACKUP_DIR}"

echo "[3/5] Снимаем копию"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/codegolf-${STAMP}.dump"
TMP="${TARGET}.part"
trap 'rm -f "${TMP}"' EXIT

# --format=custom позволяет восстанавливать выборочно и сжимает данные.
pg_dump --dbname="${DATABASE_URL}" \
  --format=custom --compress=9 \
  --no-owner --no-privileges \
  --file="${TMP}" \
  || fail "pg_dump завершился с ошибкой — копия НЕ создана"

SIZE="$(wc -c < "${TMP}" | tr -d ' ')"
[[ "${SIZE}" -ge "${MIN_SIZE_BYTES}" ]] || fail "копия подозрительно мала (${SIZE} байт) — считаем её испорченной"

echo "[4/5] Проверяем читаемость копии"
pg_restore --list "${TMP}" >/dev/null 2>&1 || fail "копия не читается pg_restore — считаем её испорченной"
mv "${TMP}" "${TARGET}"
chmod 600 "${TARGET}"
trap - EXIT
ok "$(basename "${TARGET}") ($(du -h "${TARGET}" | cut -f1))"

echo "[5/5] Чистим старые копии (старше ${KEEP_DAYS} дн., но не меньше ${KEEP_MIN} штук)"
TOTAL="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'codegolf-*.dump' -type f | wc -l | tr -d ' ')"
if [[ "${TOTAL}" -gt "${KEEP_MIN}" ]]; then
  find "${BACKUP_DIR}" -maxdepth 1 -name 'codegolf-*.dump' -type f -mtime "+${KEEP_DAYS}" -print -delete
fi
REMAIN="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'codegolf-*.dump' -type f | wc -l | tr -d ' ')"
ok "копий в каталоге: ${REMAIN}"

echo
echo "Готово: ${TARGET}"
echo "ВНИМАНИЕ: в копии есть e-mail и хеши паролей пользователей."
echo "Храните каталог закрытым (chmod 700) и копируйте на другую машину в зашифрованном виде."
