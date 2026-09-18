#!/usr/bin/env bash
# Отправка свежей копии базы ВНЕ сервера: шифрование + хранилище S3.
#
# Локальные копии лежат на том же диске, что и база: умрёт диск — умрут и они.
# Этот скрипт берёт самую свежую копию, шифрует её паролем (AES-256)
# и кладёт в S3-хранилище (подходит Timeweb S3 и любое совместимое).
#
# Настройки — в отдельном файле (НЕ в .env сайта: сайту эти ключи не нужны):
#   ~/.config/codegolf/offsite.env
# Пример и порядок настройки — docs/backup.md, раздел «Копии вне сервера».
#
# Запуск: bash scripts/backup-offsite.sh
# Автоматически — сразу после ночной копии (scripts/systemd/codegolf-backup.service).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"
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

if [[ ! -f "${OFFSITE_ENV}" ]]; then
  echo "Копии вне сервера не настроены (нет ${OFFSITE_ENV})."
  echo "Локальная копия сделана, но хранится только на этом сервере."
  echo "Как настроить — docs/backup.md, раздел «Копии вне сервера»."
  exit 0
fi

S3_ENDPOINT="$(read_var S3_ENDPOINT || true)"
S3_REGION="$(read_var S3_REGION || true)"
S3_BUCKET="$(read_var S3_BUCKET || true)"
S3_ACCESS_KEY="$(read_var S3_ACCESS_KEY || true)"
S3_SECRET_KEY="$(read_var S3_SECRET_KEY || true)"
S3_PREFIX="$(read_var S3_PREFIX || echo codegolf)"
BACKUP_PASSPHRASE="$(read_var BACKUP_PASSPHRASE || true)"
KEEP_DAYS="$(read_var OFFSITE_KEEP_DAYS || echo 30)"
HEALTHCHECK_URL="$(read_var HEALTHCHECK_URL || true)"

# Если настроен внешний сторож — сообщаем ему о провале, чтобы он написал вам
ping_fail() {
  if [[ -n "${HEALTHCHECK_URL}" ]]; then
    curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL%/}/fail" >/dev/null 2>&1 || true
  fi
}
trap 'ping_fail' ERR

echo "[1/5] Настройки"
for var in S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY BACKUP_PASSPHRASE; do
  [[ -n "${!var}" ]] || { ping_fail; fail "в ${OFFSITE_ENV} не задано ${var}"; }
done
# Пароль шифрования — единственный способ потом прочитать копию. Короткий
# пароль делает шифрование формальностью
[[ "${#BACKUP_PASSPHRASE}" -ge 20 ]] || { ping_fail; fail "BACKUP_PASSPHRASE короче 20 символов"; }
command -v gpg >/dev/null 2>&1 || { ping_fail; fail "gpg не установлен (apt install gnupg)"; }
command -v rclone >/dev/null 2>&1 || { ping_fail; fail "rclone не установлен (sudo apt install rclone)"; }
ok "хранилище: ${S3_ENDPOINT}, корзина ${S3_BUCKET}/${S3_PREFIX}"

echo "[2/5] Свежая локальная копия"
DUMP="$(find "${BACKUP_DIR}" -maxdepth 1 -name 'codegolf-*.dump' -type f | sort | tail -n 1)"
[[ -n "${DUMP}" ]] || { ping_fail; fail "в ${BACKUP_DIR} нет ни одной копии — сначала scripts/backup-db.sh"; }
ok "$(basename "${DUMP}")"

echo "[3/5] Шифруем"
WORK="$(mktemp -d)"
# Свой временный каталог gpg: симметричному шифрованию не нужны ключи
# пользователя, так что его ~/.gnupg не трогаем и состояние не копим
export GNUPGHOME="${WORK}/gnupg"
mkdir -p "${GNUPGHOME}"
chmod 700 "${GNUPGHOME}" 2>/dev/null || true
trap 'gpgconf --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "${WORK}"' EXIT
ENCRYPTED="${WORK}/$(basename "${DUMP}").gpg"
# Пароль передаём через дескриптор, а не аргументом: так он не виден в списке процессов
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "${ENCRYPTED}" "${DUMP}" 3<<<"${BACKUP_PASSPHRASE}"
LOCAL_SIZE="$(wc -c < "${ENCRYPTED}" | tr -d ' ')"
ok "зашифровано, ${LOCAL_SIZE} байт"

echo "[4/5] Отправляем в хранилище"
# Хранилище описываем переменными окружения — без отдельного конфига rclone
export RCLONE_CONFIG_OFFSITE_TYPE=s3
export RCLONE_CONFIG_OFFSITE_PROVIDER=Other
export RCLONE_CONFIG_OFFSITE_ENDPOINT="${S3_ENDPOINT}"
export RCLONE_CONFIG_OFFSITE_REGION="${S3_REGION:-ru-1}"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${S3_ACCESS_KEY}"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${S3_SECRET_KEY}"
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true

REMOTE_DIR="offsite:${S3_BUCKET}/${S3_PREFIX}"
REMOTE_FILE="${REMOTE_DIR}/$(basename "${ENCRYPTED}")"
rclone copyto "${ENCRYPTED}" "${REMOTE_FILE}"

# Доверяем не коду возврата, а факту: файл в хранилище того же размера
REMOTE_SIZE="$(rclone lsf --format s "${REMOTE_FILE}" | tr -d '[:space:]')"
if [[ "${REMOTE_SIZE}" != "${LOCAL_SIZE}" ]]; then
  ping_fail
  fail "в хранилище ${REMOTE_SIZE:-0} байт вместо ${LOCAL_SIZE} — копия не доехала"
fi
ok "отправлено и проверено: $(basename "${ENCRYPTED}")"

echo "[5/5] Чистим старые копии в хранилище (старше ${KEEP_DAYS} дн.)"
rclone delete "${REMOTE_DIR}" --min-age "${KEEP_DAYS}d" --include 'codegolf-*.dump.gpg'
REMOTE_COUNT="$(rclone lsf "${REMOTE_DIR}" --include 'codegolf-*.dump.gpg' | wc -l | tr -d ' ')"
ok "копий в хранилище: ${REMOTE_COUNT}"

if [[ -n "${HEALTHCHECK_URL}" ]]; then
  curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL}" >/dev/null 2>&1 || true
fi

echo
echo "Готово: копия лежит вне сервера. Без BACKUP_PASSPHRASE её не прочитать —"
echo "храните пароль в менеджере паролей, НЕ только на этом сервере."
