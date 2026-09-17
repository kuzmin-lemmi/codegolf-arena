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
apt-get install -y -qq \
  ca-certificates curl git nginx ufw \
  postgresql-client \
  certbot python3-certbot-nginx \
  tmux htop unattended-upgrades
ok "пакеты установлены"

step "4/8 Docker (база и раннер кода)"
if command -v docker >/dev/null 2>&1; then
  ok "docker уже установлен: $(docker --version)"
else
  apt-get install -y -qq docker.io docker-compose-v2
  systemctl enable --now docker
  ok "docker установлен"
fi

step "5/8 Node.js"
if command -v node >/dev/null 2>&1; then
  ok "node уже установлен: $(node --version)"
else
  apt-get install -y -qq nodejs npm
  ok "node установлен: $(node --version)"
fi
# Next 15 требует Node не ниже 18.18
NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  echo "ВНИМАНИЕ: Node ${NODE_MAJOR} слишком старый, нужен 18.18+" >&2
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
echo "Дальше — по docs/server-setup.md, начиная с шага «Настройки»:"
echo "  su - ${DEPLOY_USER}"
echo "  cd ${APP_DIR}"
echo
echo "Проверить, что важное на месте:"
echo "  docker --version && node --version && nginx -v && free -h | head -2"
