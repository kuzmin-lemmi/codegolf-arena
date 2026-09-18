# Установка на сервер с нуля

Инструкция для чистого сервера Ubuntu 22.04 или 24.04 (2 ГБ памяти, 1 ядро, 20 ГБ диска).
Команды можно копировать как есть, подставляя свои значения вместо `__ТАК__`.

Порядок шагов важен: база должна подняться раньше, чем мы создадим таблицы.

---

## Что понадобится заранее

| Что | Зачем | Без этого |
|---|---|---|
| Доступ к серверу по SSH | вся установка | никак |
| Домен, направленный на IP сервера | HTTPS и вход через Stepik | можно начать по IP, но без HTTPS |
| Ключи приложения Stepik | вход через Stepik | вход по email работает |

Домен направляется на сервер так: в панели регистратора домена создать
запись типа `A` со значением — IP вашего сервера. Изменения расходятся
от нескольких минут до пары часов.

---

## Шаг 1. Подготовка сервера

Подключаемся и запускаем подготовку. Скрипт ставит подкачку, пакеты, Docker,
Node, nginx, firewall, создаёт пользователя `deploy` и клонирует проект.

```bash
ssh root@__IP_СЕРВЕРА__
```

```bash
curl -fsSL https://raw.githubusercontent.com/kuzmin-lemmi/codegolf-arena/main/scripts/server-bootstrap.sh -o /root/server-bootstrap.sh && less /root/server-bootstrap.sh
```

Прочитайте, что скрипт делает (он короткий), выйдите из просмотра клавишей `q` и запустите:

```bash
bash /root/server-bootstrap.sh
```

Проверка:

```bash
docker compose version && node --version && nginx -v && free -h && ufw status
```

В выводе `free -h` в строке `Swap` должно быть 2 ГБ, а `ufw` — `active`
с открытыми 22, 80 и 443. Если скрипт оборвался на шаге firewall, запустите
его ещё раз — он безопасно пропустит уже сделанное.

---

## Шаг 2. Настройки

Переходим под пользователя `deploy` и готовим файл настроек:

```bash
su - deploy
cd ~/codegolf-arena
```

Сначала придумаем пароль базе — сгенерируем случайный и сразу запомним:

```bash
openssl rand -hex 16
```

Теперь создаём `.env`. Подставьте свой домен и пароль из предыдущей команды
в двух местах (`POSTGRES_PASSWORD` и внутри `DATABASE_URL`):

```bash
cat > ~/codegolf-arena/.env <<'EOF'
DATABASE_PROVIDER="postgresql"
POSTGRES_PASSWORD="__ПАРОЛЬ_БАЗЫ__"
DATABASE_URL="postgresql://codegolf:__ПАРОЛЬ_БАЗЫ__@127.0.0.1:5432/codegolf?schema=public"

NEXT_PUBLIC_BASE_URL="https://__ВАШ_ДОМЕН__"

# Раннер кода — контейнер на этом же сервере
PISTON_API_URL="http://127.0.0.1:2000/api/v2"

# Сайт за nginx, поэтому доверяем заголовку с IP посетителя
TRUST_PROXY="true"
ALLOW_DEV_LOGIN="false"
DISABLE_STRICT_ENV="false"
ALLOW_SQLITE_IN_PRODUCTION="false"

# Вход через Stepik. Если ключей пока нет — оставьте пустыми,
# вход по email будет работать
STEPIK_CLIENT_ID=""
STEPIK_CLIENT_SECRET=""
STEPIK_REDIRECT_URI="https://__ВАШ_ДОМЕН__/api/auth/stepik/callback"

# Администратор сайта — создастся на шаге 4
ADMIN_EMAIL="__ВАША_ПОЧТА__"
ADMIN_PASSWORD="__ПАРОЛЬ_АДМИНА__"
EOF
chmod 600 ~/codegolf-arena/.env
```

Проверяем, что ничего не забыли:

```bash
bash scripts/check-env.sh
```

Должно закончиться словами «ИТОГ: настройки в порядке». Скрипт ругается,
если остался пароль по умолчанию, включён вход без пароля или адрес возврата
Stepik не совпадает с адресом сайта.

---

## Шаг 3. База и раннер кода

```bash
cd ~/codegolf-arena && docker compose up -d
```

Первый запуск скачивает образы, это несколько минут. Если `docker` ответит
`permission denied` — выйдите (`exit`) и снова зайдите через `su - deploy`:
членство в группе docker подхватывается при новом входе.

Затем ставим Python в раннер — свежий контейнер приходит без него. Ставится
Python 3.11: та же версия, что работает у участника в браузере, иначе
решение могло бы пройти локальную проверку и упасть в рейтинге:

```bash
npm run dev:piston
```

Проверка (обе команды должны ответить, а не молчать):

```bash
docker compose ps && curl -fsS http://127.0.0.1:2000/api/v2/runtimes && echo
```

---

## Шаг 4. Таблицы, задачи, администратор

```bash
cd ~/codegolf-arena && npm ci && npm run db:generate && npm run db:migrate:deploy
```

Создаём администратора:

> ⚠️ **`db:seed` полностью очищает базу.** Эта команда нужна ровно один раз,
> сейчас, пока база пустая. На работающем сайте она откажется запускаться,
> если в базе уже есть участники или решения, — но надеяться на эту защиту
> не стоит: больше эта команда вам не понадобится.

```bash
npm run db:seed
```

Заливаем 115 задач:

```bash
npm run db:tasks:import-export
```

Если после этого в списке задач попадутся демонстрационные из `db:seed`,
их убирает `npm run db:tasks:cleanup`.

---

## Шаг 5. Сборка и запуск сайта

Собираем. На одном ядре это займёт 5–15 минут — нормально:

```bash
cd ~/codegolf-arena && npm run build
```

Раскладываем файлы, которые нужны собранному сайту:

```bash
cd ~/codegolf-arena && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/ && cp -R public .next/standalone/
```

Ставим службу, чтобы сайт поднимался сам после перезагрузки. **Это делается
от root** — у пользователя `deploy` намеренно есть право только перезапускать
уже установленную службу, но не ставить новые:

```bash
exit
```

```bash
cp /home/deploy/codegolf-arena/scripts/systemd/codegolf.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now codegolf
```

Проверка:

```bash
curl -fsS http://127.0.0.1:3000/api/health && echo
```

В ответе должно быть `"success":true`, а внутри — `"piston":{"ok":true}`.
Если нет — смотрите, что пишет служба: `journalctl -u codegolf -n 50 --no-pager`

---

## Шаг 6. Домен и HTTPS

Тоже от root. Подставляем домен в заготовку nginx и включаем её
(если есть `www`-вариант, перечислите оба через пробел):

```bash
sed 's/__DOMAIN__/__ВАШ_ДОМЕН__ www.__ВАШ_ДОМЕН__/g' /home/deploy/codegolf-arena/scripts/nginx/codegolf.conf > /etc/nginx/sites-available/codegolf && ln -sf /etc/nginx/sites-available/codegolf /etc/nginx/sites-enabled/codegolf && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx
```

Теперь сайт открывается по домену по обычному http. Выдаём сертификат:

```bash
certbot --nginx -d __ВАШ_ДОМЕН__ -d www.__ВАШ_ДОМЕН__
```

Certbot спросит почту, согласие с условиями и предложит включить
перенаправление на https — отвечайте «да». Он сам допишет настройки nginx
и будет обновлять сертификат автоматически.

Проверка:

```bash
curl -fsS https://__ВАШ_ДОМЕН__/api/health && echo
```

---

## Шаг 7. Бэкапы

Первая копия и проверка, что она разворачивается (от `deploy`):

```bash
su - deploy -c 'cd ~/codegolf-arena && bash scripts/backup-db.sh && bash scripts/verify-backup.sh'
```

Включаем ежедневные копии в 03:30 (от root):

```bash
cp /home/deploy/codegolf-arena/scripts/systemd/codegolf-backup.* /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now codegolf-backup.timer
```

Затем — **копии вне сервера и мониторинг**: без них копии лежат на том же
диске, что и база, а о падении сайта вы узнаете от пользователей. Настройка —
в [backup.md](backup.md), разделы «Копии вне сервера» и «Мониторинг».

---

## Шаг 8. Проверка, что всё работает

Откройте сайт в браузере и пройдите путь живого участника:

1. Регистрация по email.
2. Открыть любую задачу — под условием видно открытые тесты, а рядом «+N скрытых».
3. Нажать локальную проверку (Python грузится в браузере) — должна отработать.
4. Отправить решение в рейтинг — появляется результат по тестам.
5. Отправить решение короче — начисляются очки за улучшение.
6. Зайти в рейтинг и в свой профиль — результат на месте.

Отдельно убедитесь, что **списать нельзя**: отправьте в любой задаче решение

```
test["expected"]
```

Раньше оно проходило всё. Сейчас должно вернуть ошибку.

---

## Вход через Stepik

Если хотите вход через Stepik, в настройках вашего приложения на Stepik
адрес возврата должен быть ровно таким:

```
https://__ВАШ_ДОМЕН__/api/auth/stepik/callback
```

Затем вписать `STEPIK_CLIENT_ID` и `STEPIK_CLIENT_SECRET` в `.env`
и перезапустить сайт: `sudo systemctl restart codegolf`

---

## Обновление сайта в будущем

```bash
cd ~/codegolf-arena && bash scripts/backup-db.sh && HEALTH_PUBLIC="https://__ВАШ_ДОМЕН__/api/health" bash scripts/deploy-standalone.sh
```

Скрипт сам подтянет изменения, применит миграции базы, добавит новые задачи
из `codegolf_tasks.json`, соберёт сайт и перезапустит службу. Он
останавливается, если в папке есть несохранённые правки, — это защита от
потери чужой работы.

Что важно знать про обновления:

- **Структура базы меняется только миграциями** из `prisma/migrations`.
  У каждого изменения есть история, и деплой применяет только новые.
- **Задачи из файла добавляются, но не перезаписываются.** Правки условий
  и тестов, сделанные в админке, деплой больше не откатывает. Если нужно
  именно залить задачи из файла поверх базы: `IMPORT_OVERWRITE=true npm run db:tasks:import-export`.
- **Если меняется версия Python в раннере** (она задана в `src/lib/piston.ts`),
  сначала поставьте её — `npm run dev:piston`, — и только потом деплойте.
  Иначе между деплоем и установкой все решения будут падать. Проверка
  `/api/health` в этом случае прямо напишет, какой версии не хватает.

---

## Если что-то не так

| Симптом | Куда смотреть |
|---|---|
| Сайт не открывается | `sudo systemctl status codegolf`, `journalctl -u codegolf -n 50 --no-pager` |
| «Runner temporarily unavailable» при отправке | `docker compose ps`, `curl http://127.0.0.1:2000/api/v2/runtimes` |
| Раннер отвечает, но решения падают | не установлен Python: `npm run dev:piston` |
| Сборка падает без ошибки | не хватило памяти: `free -h`, проверьте подкачку |
| Ошибка про настройки при запуске | `bash scripts/check-env.sh` |
| nginx не стартует | `sudo nginx -t` |

Сторож раннера (перезапускает контейнер, если тот перестал отвечать)
можно повесить на расписание:

```bash
( crontab -l 2>/dev/null; echo '*/5 * * * * /usr/bin/env bash /home/deploy/codegolf-arena/scripts/piston-watchdog.sh' ) | crontab -
```
