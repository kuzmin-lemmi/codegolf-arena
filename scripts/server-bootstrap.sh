#!/usr/bin/env bash
# Первичная подготовка чистого сервера Ubuntu 22.04/24.04 под Codegolf Arena.
# Запускается ОДИН раз, от root:
#   bash server-bootstrap.sh
#
# Что делает: файл подкачки, пакеты, Docker, Node, nginx, firewall,
# пользователь deploy, каталог бэкапов, клон репозитория.
# Ничего не настраивает «на свой вкус»: домен, сертификат и .env — отдельными
# шагами из docs/server-setup.md, потому что там нужны ваши данные.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="/home/${DEPLOY_USER}/codegolf-arena"
REPO_URL="${REPO_URL:-https://github.com/kuzmin-lemmi/codegolf-arena.git}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
SETUP_FIREWALL="${SETUP_FIREWALL:-true}"

step() { echo; echo "=== $* ==="; }
ok()   { echo "OK: $*"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: запустите от root (sudo -i, затем bash server-bootstrap.sh)" >&2
  exit 1
fi

step "1/8 Файл подкачки (${SWAP_SIZE})"
# Страховка от нехватки памяти при сборке сайта на сервере с 2 ГБ
if swapon --show | grep -q '/swapfile'; then
  ok "подкачка уже включена"
else
  fallocate -l "${SWAP_SIZE}" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  if ! grep -q '^/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  # Пользуемся подкачкой только когда память реально кончается
  sysctl -q -w vm.swappiness=10
  if ! grep -q '^vm.swappiness' /etc/sysctl.conf; then
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
  fi
  ok "подкачка ${SWAP_SIZE} включена"
fi

step "2/8 Обновление списка пакетов"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
ok "список обновлён"

step "3/8 Базовые пакеты"
apt-get install -y -qq ca-certificates curl git gnupg nginx ufw postgresql-client certbot python3-certbot-nginx tmux htop unattended-upgrades
ok "пакеты установлены"

step "4/8 Docker (база и раннер кода)"
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y -qq docker.io
  systemctl enable --now docker
  ok "docker установлен: $(docker --version)"
else
  ok "docker уже установлен: $(docker --version)"
fi

# Нужна именно команда "docker compose" (версия 2). В Ubuntu 24.04 это пакет
# docker-compose-v2, в 22.04 его нет — тогда берём плагин из репозитория Docker
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || true
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Пакета docker-compose-v2 нет, подключаем репозиторий Docker"
  install -d -m 0755 /usr/share/keyrings
  # Скачиваем только ключ подписи репозитория (данные, не исполняемый код)
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /usr/share/keyrings/docker.gpg
  UBUNTU_CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo "deb [signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: команда 'docker compose' недоступна — база и раннер не поднимутся" >&2
  exit 1
fi
ok "docker compose работает: $(docker compose version)"

step "5/8 Node.js"
# Next 15 требует Node не ниже 18.18. В Ubuntu 22.04 штатный пакет — Node 12,
# поэтому при старом или отсутствующем Node берём 20 из репозитория NodeSource
node_major() {
  command -v node >/dev/null 2>&1 || return 1
  node --version | sed 's/^v//' | cut -d. -f1
}

CURRENT_NODE="$(node_major || echo 0)"
if [[ "${CURRENT_NODE}" -ge 18 ]]; then
  ok "node подходит: $(node --version)"
else
  if [[ "${CURRENT_NODE}" -gt 0 ]]; then
    echo "Установлен Node ${CURRENT_NODE} — слишком старый, ставим Node 20"
  fi
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
  ok "node установлен: $(node --version)"
fi

if [[ "$(node_major || echo 0)" -lt 18 ]]; then
  echo "ERROR: Node всё ещё старше 18 — сборка сайта не пройдёт" >&2
  exit 1
fi

step "6/8 Пользователь ${DEPLOY_USER}"
if id "${DEPLOY_USER}" >/dev/null 2>&1; then
  ok "пользователь уже есть"
else
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  ok "пользователь создан"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 700 "/home/${DEPLOY_USER}/backups"
# Право перезапускать только свою службу, без полного sudo
cat > /etc/sudoers.d/codegolf <<SUDO
${DEPLOY_USER} ALL=(root) NOPASSWD: /bin/systemctl restart codegolf, /bin/systemctl status codegolf, /bin/systemctl start codegolf, /bin/systemctl stop codegolf
SUDO
chmod 440 /etc/sudoers.d/codegolf
ok "права на перезапуск службы выданы"

step "7/8 Репозиторий"
if [[ -d "${APP_DIR}/.git" ]]; then
  ok "репозиторий уже на месте: ${APP_DIR}"
else
  sudo -u "${DEPLOY_USER}" git clone --quiet "${REPO_URL}" "${APP_DIR}"
  ok "клонирован в ${APP_DIR}"
fi

step "8/8 Firewall"
if [[ "${SETUP_FIREWALL}" != "true" ]]; then
  ok "пропущен (SETUP_FIREWALL=false)"
else
  # Сначала открываем текущий порт SSH, чтобы не отрезать себе доступ
  SSH_PORT="$(grep -E '^[[:space:]]*Port[[:space:]]+' /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' | head -1)"
  SSH_PORT="${SSH_PORT:-22}"
  ufw allow "${SSH_PORT}/tcp" >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  ok "открыты порты ${SSH_PORT}, 80, 443 (остальное закрыто)"
fi

echo
echo "Подготовка сервера закончена."
echo
echo "Версии:"
echo "  docker:  $(docker --version)"
echo "  node:    $(node --version)"
echo "  nginx:   $(nginx -v 2>&1)"
echo
echo "Дальше — по docs/server-setup.md, шаг 2 «Настройки»:"
echo "  su - ${DEPLOY_USER}"
echo "  cd ${APP_DIR}"
