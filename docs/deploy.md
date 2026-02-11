# Деплой Codegolf Arena (боевой чеклист)

Эта инструкция — рабочий сценарий, которым можно пользоваться каждый раз.

## 0) Что нужно перед стартом

- Доступ по SSH к серверу (`deploy@codegolf.ru`)
- Права на `sudo systemctl restart codegolf`
- Актуальный код в `origin/main`
- Корректный `.env` на сервере

Проверка критичных переменных (OAuth и домен):

```bash
cd /home/deploy/codegolf-arena
grep -E "NEXT_PUBLIC_BASE_URL|STEPIK_REDIRECT_URI|STEPIK_CLIENT_ID|STEPIK_CLIENT_SECRET" .env
```

В production должно быть так:

- `NEXT_PUBLIC_BASE_URL="https://codegolf.ru"`
- `STEPIK_REDIRECT_URI="https://codegolf.ru/api/auth/stepik/callback"`
- `STEPIK_CLIENT_ID` и `STEPIK_CLIENT_SECRET` не пустые

---

## 1) Стандартный деплой (рекомендуется)

Подключение и запуск в `tmux`, чтобы деплой не прервался при обрыве SSH:

```bash
ssh deploy@codegolf.ru
tmux new -s deploy
cd /home/deploy
/home/deploy/deploy_codegolf.sh
```

Если сессия оборвалась:

```bash
ssh deploy@codegolf.ru
tmux attach -t deploy
```

---

## 2) Что должно быть в успешном выводе

Ожидаемые ключевые этапы:

- `== git sync ==`
- `== npm ci ==`
- `== prisma ==`
- `== build ==`
- `== restart ==`
- `LOCAL OK`
- `DEPLOY OK`

---

## 3) Проверка после деплоя

```bash
sudo systemctl status codegolf --no-pager
curl -fsS http://127.0.0.1:3000/api/health && echo
curl -fsS https://codegolf.ru/api/health && echo
```

Обе проверки `health` должны вернуть JSON с `"success":true`.

---

## 4) Частые проблемы и быстрые решения

### 4.1 `Working tree is dirty`

На сервере есть локальные изменения, скрипт остановился.

Безопасно:

```bash
cd /home/deploy/codegolf-arena
git stash push -u -m "before deploy"
/home/deploy/deploy_codegolf.sh
```

### 4.2 OAuth кидает на `localhost`

Проверь `.env` на сервере:

```bash
cd /home/deploy/codegolf-arena
grep -E "NEXT_PUBLIC_BASE_URL|STEPIK_REDIRECT_URI" .env
```

Должен быть только домен `https://codegolf.ru`, не `localhost`.

### 4.3 Сервис не поднялся после рестарта

```bash
sudo journalctl -u codegolf -n 120 --no-pager
```

Ищи первые ошибки после `Started Codegolf Arena`.

---

## 5) Быстрый откат

Если нужно срочно откатить релиз:

```bash
cd /home/deploy/codegolf-arena
git log --oneline -n 5
git reset --hard <COMMIT_BEFORE_BAD_RELEASE>
/home/deploy/deploy_codegolf.sh
```

Важно: `reset --hard` удалит локальные изменения.

---

## 6) Минимальный ежедневный сценарий (коротко)

```bash
ssh deploy@codegolf.ru
tmux new -s deploy
cd /home/deploy
/home/deploy/deploy_codegolf.sh
```

Потом проверка:

```bash
curl -fsS https://codegolf.ru/api/health && echo
```
