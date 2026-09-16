#!/usr/bin/env bash
# Опись настроек сервера: что задано, что потеряно, что задано опасно.
# Секреты выводятся замаскированными — вывод можно показывать кому угодно.
# Запуск:  bash scripts/check-env.sh
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"

REQUIRED=(DATABASE_PROVIDER DATABASE_URL NEXT_PUBLIC_BASE_URL PISTON_API_URL)
# Вход через Stepik нужен только на боевом сайте; локально хватает входа по email
REQUIRED_PROD_ONLY=(STEPIK_CLIENT_ID STEPIK_CLIENT_SECRET STEPIK_REDIRECT_URI)
SECRET=(DATABASE_URL STEPIK_CLIENT_SECRET STEPIK_CLIENT_ID ADMIN_PASSWORD RATE_LIMIT_REDIS_TOKEN)
OPTIONAL=(TRUST_PROXY ALLOW_DEV_LOGIN DISABLE_STRICT_ENV ALLOW_SQLITE_IN_PRODUCTION RATE_LIMIT_REDIS_URL RATE_LIMIT_REDIS_TOKEN ADMIN_EMAIL PISTON_MAX_RETRIES)

PROBLEMS=0

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

is_secret() {
  local name="$1" s
  for s in "${SECRET[@]}"; do [[ "${s}" == "${name}" ]] && return 0; done
  return 1
}

show() {
  local name="$1" value="$2" len
  if [[ -z "${value}" ]]; then
    printf '  %-32s %s\n' "${name}" "— НЕ ЗАДАНО"
    return
  fi
  if is_secret "${name}"; then
    len="${#value}"
    printf '  %-32s задано (длина %s, хвост ...%s)\n' "${name}" "${len}" "${value: -3}"
  else
    printf '  %-32s %s\n' "${name}" "${value}"
  fi
}

echo "Файл настроек: ${ENV_FILE}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: файл не найден. Приложение не сможет работать."
  exit 1
fi

# На Windows прав доступа в Unix-смысле нет, проверка не имеет смысла
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*) PERMS="n/a" ;;
  *) PERMS="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null || stat -f '%Lp' "${ENV_FILE}" 2>/dev/null || echo '?')" ;;
esac
echo "Права доступа: ${PERMS}"
if [[ "${PERMS}" != "600" && "${PERMS}" != "400" && "${PERMS}" != "?" && "${PERMS}" != "n/a" ]]; then
  echo "  ВНИМАНИЕ: файл с паролями читают посторонние. Исправьте: chmod 600 ${ENV_FILE}"
  PROBLEMS=$((PROBLEMS + 1))
fi

echo
BASE_URL_EARLY="$(read_env_var NEXT_PUBLIC_BASE_URL || true)"
IS_LOCAL=0
case "${BASE_URL_EARLY}" in *localhost*|*127.0.0.1*) IS_LOCAL=1 ;; esac
if [[ "${IS_LOCAL}" -eq 1 ]]; then
  echo "Режим: локальная разработка (${BASE_URL_EARLY})"
else
  echo "Режим: боевой сайт (${BASE_URL_EARLY:-адрес не задан})"
fi

echo
echo "=== Обязательные настройки ==="
CHECK_LIST=("${REQUIRED[@]}")
if [[ "${IS_LOCAL}" -eq 0 ]]; then CHECK_LIST+=("${REQUIRED_PROD_ONLY[@]}"); fi
for name in "${CHECK_LIST[@]}"; do
  value="$(read_env_var "${name}" || true)"
  show "${name}" "${value}"
  if [[ -z "${value}" ]]; then PROBLEMS=$((PROBLEMS + 1)); fi
done
if [[ "${IS_LOCAL}" -eq 1 ]]; then
  echo "  (ключи Stepik локально не требуются — вход по email работает без них)"
fi

echo
echo "=== Дополнительные ==="
for name in "${OPTIONAL[@]}"; do
  value="$(read_env_var "${name}" || true)"
  [[ -n "${value}" ]] && show "${name}" "${value}"
done

echo
echo "=== Опасные сочетания ==="
DEV_LOGIN="$(read_env_var ALLOW_DEV_LOGIN || true)"
if [[ "${DEV_LOGIN}" == "true" ]]; then
  echo "  ОПАСНО: ALLOW_DEV_LOGIN=true — вход без пароля. Должно быть false."
  PROBLEMS=$((PROBLEMS + 1))
else
  echo "  OK: вход без пароля отключён"
fi

STRICT="$(read_env_var DISABLE_STRICT_ENV || true)"
if [[ "${STRICT}" == "true" ]]; then
  echo "  ОПАСНО: DISABLE_STRICT_ENV=true — проверки настроек выключены."
  PROBLEMS=$((PROBLEMS + 1))
else
  echo "  OK: проверки настроек включены"
fi

SQLITE="$(read_env_var ALLOW_SQLITE_IN_PRODUCTION || true)"
if [[ "${SQLITE}" == "true" ]]; then
  echo "  ВНИМАНИЕ: ALLOW_SQLITE_IN_PRODUCTION=true — временный флаг, в бою не нужен."
  PROBLEMS=$((PROBLEMS + 1))
fi

PISTON="$(read_env_var PISTON_API_URL || true)"
case "${PISTON}" in
  "")            echo "  ОПАСНО: PISTON_API_URL не задан — проверки решений уйдут на чужой сервис emkc.org"; PROBLEMS=$((PROBLEMS + 1)) ;;
  *emkc.org*)    echo "  ОПАСНО: PISTON_API_URL указывает на чужой сервис emkc.org, а не на ваш контейнер"; PROBLEMS=$((PROBLEMS + 1)) ;;
  *127.0.0.1*|*localhost*) echo "  OK: код выполняется на вашем сервере (${PISTON})" ;;
  *)             echo "  ВНИМАНИЕ: PISTON_API_URL = ${PISTON} — убедитесь, что это ваш раннер" ;;
esac

BASE_URL="${BASE_URL_EARLY}"
REDIRECT="$(read_env_var STEPIK_REDIRECT_URI || true)"
if [[ -n "${BASE_URL}" && -n "${REDIRECT}" ]]; then
  if [[ "${REDIRECT}" != "${BASE_URL%/}/api/auth/stepik/callback" ]]; then
    echo "  ВНИМАНИЕ: адрес возврата Stepik не совпадает с адресом сайта — вход может ломаться"
    echo "            сайт:   ${BASE_URL}"
    echo "            возврат: ${REDIRECT}"
    PROBLEMS=$((PROBLEMS + 1))
  else
    echo "  OK: вход через Stepik настроен согласованно"
  fi
fi

echo
if [[ "${PROBLEMS}" -eq 0 ]]; then
  echo "ИТОГ: настройки в порядке."
  exit 0
fi
echo "ИТОГ: найдено проблем — ${PROBLEMS}. Разберитесь с ними до следующего деплоя."
exit 1
