# Codegolf Arena — руководство для ИИ-ассистентов и разработчиков

Арена кодгольфа на **Python, JavaScript и C#**: участник решает задачу **одной
строкой-выражением**, решение проверяется тестами, рейтинг — по длине кода
(короче — выше). Название — **«Арена однострочников»**. Переход с одного Python на
три языка — [docs/three-languages.md](docs/three-languages.md).
Боевой сайт: **https://codegolf.ru**.

Этот файл — точка входа для любого ИИ или человека, который продолжает работу.
Прочитай его целиком, затем [docs/ROADMAP.md](docs/ROADMAP.md): там текущее
состояние и открытые задачи.

## Как работать с владельцем проекта

Владелец — не программист. Поэтому:

- объясняй **простым языком**, без жаргона, с аналогиями, где уместно;
- давай **готовые команды по одной в блоке**, с ожидаемым результатом;
- прямо говори, какие команды выполняются **от root**, а какие от `deploy`;
- **не проси присылать в чат пароли, ключи и секреты** — давай команды со
  скрытым вводом (`read -rsp`), которые проверяют длину и пишут значение прямо в файл;
- перед рискованным шагом на боевом сервере говори, что именно сделаешь;
- репозиторий **публичный**: никаких секретов в коде, коммитах и документации.

---

## Устройство

**Стек:** Next.js 15 (App Router) + React 18 + TypeScript, Prisma 5 + PostgreSQL 16,
Tailwind. Код участников выполняется в **Piston** (свой контейнер): Python 3.11,
Node.js 20.11.1, mono 6.12 (C# 9). Черновая проверка Python — в браузере через
**Pyodide 0.24.1** (тоже Python 3.11), JavaScript и C# — на сервере.

**Три языка.** Python открыт у всех задач. JavaScript и C# — у задач с сигнатурой
с типами (`tasks.csharp_signature`, список — `prisma/csharp-signatures.json`) и
включаются флагами `JAVASCRIPT_ENABLED` / `CSHARP_ENABLED`. Попытки и рекорды всех
языков — в общих `submissions` / `best_submissions` с колонкой `language`.
Правила зачёта: у каждой задачи **своя таблица рекордов на каждом языке**, очки
начисляются **в каждом языке отдельно** по одним правилам, рейтингов четыре —
общий (`users.total_points`) и по языку (сумма `best_submissions.points`).
Соревнования и задача недели пока только на Python.

**Путь решения:**

1. Черновая проверка на открытых тестах: Python — в браузере (Pyodide),
   JavaScript и C# — `POST /api/tasks/[slug]/check` (без записи в базу).
2. `POST /api/tasks/[slug]/submit` с полем `language` (нет поля — Python)
   → задание в таблицу `submission_jobs`.
3. Очередь в процессе сайта (`src/lib/submission-jobs.ts`): 2 воркера,
   не больше 3 попыток на задание.
4. Python: `src/lib/submission-executor.ts` строит код раннера
   (`src/lib/python-serializer.ts`). JavaScript и C#: `src/lib/language-submission.ts`
   → `js-runner.ts` / `csharp-runner.ts`. Всё уходит в Piston (`src/lib/piston.ts`),
   результат разбирается между случайными маркерами.
5. `src/lib/scoring.ts`, одна транзакция для всех языков: отправка, лучший
   результат, место и очки — внутри (задача, язык), зачёт соревнований (Python).
   Уведомление «рекорд побит» — **после** транзакции: его сбой не должен
   откатывать зачтённое решение.

**Где что:**

| Путь | Что там |
|---|---|
| `src/lib/python-serializer.ts` | генерация кода раннера и песочница — **самое чувствительное место** |
| `src/lib/submission-executor.ts` | прогон тестов Python |
| `src/lib/scoring.ts` | запись попытки, рекорд, место, очки — общие для всех языков |
| `src/lib/languages.ts`, `language-settings.ts` | список языков / какие включены и у каких задач открыты |
| `src/lib/ratings.ts`, `task-board.ts` | общий рейтинг и рейтинги языков / таблица рекордов задачи на языке |
| `src/lib/piston.ts` | адрес раннера и версия Python (`PISTON_PYTHON_VERSION`) |
| `src/lib/pyodide.ts` | Python в браузере, версия Pyodide |
| `src/lib/js-runner.ts`, `csharp-runner.ts` | проверяющие программы JavaScript и C# — **так же чувствительно, как python-serializer** |
| `src/lib/javascript.ts`, `csharp.ts` | разбор и запреты выражения, показ значений; в `csharp.ts` — типы сигнатуры |
| `src/lib/language-submission.ts`, `typed-results.ts` | проверка и отправка JavaScript и C# / блок результатов и сравнение ответов |
| `prisma/csharp-signatures.json` | какие задачи открыты для JavaScript и C# и с какими типами |
| `src/lib/environments.ts` | окружения (`math`, `itertools`…): что подключается к решению |
| `src/lib/points.ts`, `competitions.ts`, `notifications.ts` | очки, зачёт соревнований, уведомления |
| `src/lib/auth.ts`, `security.ts`, `rate-limiter.ts` | вход (email, Stepik OAuth), CSRF, лимиты |
| `src/lib/env.ts` | проверка обязательных настроек при старте |
| `src/app/api/` | API; `tasks/[slug]/route.ts` отдаёт задачу **без скрытых тестов** |
| `prisma/schema.prisma`, `prisma/migrations/` | схема базы и её история |
| `scripts/` | деплой, бэкапы, импорт задач, проверки |
| `docs/` | инструкции для людей: установка, деплой, бэкапы, план |

---

## Правила, которые нельзя нарушать

Каждое появилось после реальной проблемы.

1. **Решение участника не должно видеть данные тестов.** Оно собирается
   через `exec` в отдельном словаре globals (`buildSolutionFactory`), а тесты
   лежат в локальных переменных функции. Раньше строка `test["expected"]`
   проходила любую задачу за 16 символов. **Любая правка
   `python-serializer.ts` — только с `npm run test:sandbox`.** Он же стоит
   в `scripts/predeploy-check.sh`.
2. **Скрытые тесты не покидают сервер.** API задачи их не отдаёт, в результатах
   по ним — только «прошёл/не прошёл», у ошибки — только её тип.
3. **Версии Python совпадают**: Pyodide в браузере (`pyodide.ts`),
   `PISTON_PYTHON_VERSION` (`piston.ts`) и скрипт `scripts/install-piston-runtimes.mjs`.
   Меняешь одно — меняй всё. На сервере новую версию ставят **до** деплоя.
4. **Структура базы меняется только миграциями.** Локально —
   `npm run db:migrate:dev -- --name ...`, миграция коммитится, деплой
   применяет её сам. `db push` в проекте убран намеренно.
5. **`db:seed` полностью стирает базу.** На живой базе он откажется работать;
   не обходи это (`SEED_FORCE`) без прямого решения владельца.
6. **Импорт задач только добавляет новые.** Существующие, с правками из админки,
   не трогаются. Перезапись — осознанно: `IMPORT_OVERWRITE=true`.
7. **Кука сессии — `sameSite: 'lax'`.** Со `strict` вход через Stepik
   ломается: после возврата со stepik.org пользователь выглядит «не вошедшим».
8. **IP посетителя:** доверяем `X-Real-IP` и **последнему** элементу
   `X-Forwarded-For` — их перезаписывает наш nginx. Первый элемент присылает
   сам клиент. В nginx `X-Forwarded-For` **перезаписывается**, а не дополняется.
9. **Без `PISTON_API_URL` боевой сайт не стартует.** Публичный emkc.org платный,
   и код участников не должен уходить третьей стороне.
10. **Секреты — только в файлах на сервере**, не в git: `.env` сайта
    и `~/.config/codegolf/offsite.env` для бэкапов.
11. **Языки не смешиваются в одной таблице рекордов.** Любой запрос, который
    сравнивает длины или считает место, фильтрует по `language`
    (`PARTITION BY task_id, language`). Очки: `users.total_points` всегда равен
    сумме `best_submissions.points` — начисляешь одно, начисляй и другое
    (так делает `scoring.ts`). Соревнования и задача недели — только Python,
    пока владелец не решит иначе.
12. **В C#-программе нет данных тестов.** Ответы сравнивает сервер, аргументы
    идут через stdin, маркер результатов тоже. Решение может прочитать свой
    исходник с диска — проверено. **Любая правка `csharp-runner.ts` или списка
    запретов в `csharp.ts` — только с `npm run test:sandbox:csharp`** (он же
    в `scripts/predeploy-check.sh`).
13. **В JavaScript-программе нет данных тестов** — устроено как у C#.
    Выражение проверяется настоящим парсером (acorn): ровно одно выражение,
    иначе игрок мог бы «закрыть» обёртку и дописать свой код. Строгий режим
    не включён намеренно (в JS-гольфе присваивают необъявленной переменной).
    **Любая правка `js-runner.ts` или запретов в `javascript.ts` — только
    с `npm run test:sandbox:js`** (он же в `scripts/predeploy-check.sh`).

---

## Команды

| Команда | Зачем |
|---|---|
| `npx tsc --noEmit` | проверка типов |
| `npm run lint` | линтер |
| `npm run build` | сборка (без локальной базы шумит ошибками Prisma — это нормально, код выхода 0) |
| `npm run test:sandbox` | изоляция раннера: 34 проверки, нужен локальный `python` |
| `npm run test:sandbox:csharp` | изоляция C#-раннера: 88 проверок, нужен раннер с mono |
| `npm run test:sandbox:js` | изоляция JavaScript-раннера: 105 проверок, нужен раннер с Node.js |
| `npm run db:tasks:csharp` | проставить сигнатуры с типами (JavaScript и C#) из `prisma/csharp-signatures.json` (только пустые) |
| `npm run check:rules` | правила очков, уведомлений и соревнований |
| `npm run db:migrate:dev -- --name x` | новая миграция (нужна локальная база) |
| `npm run db:migrate:status` / `:check` | состояние миграций / сверка базы со схемой |
| `npm run ops:env:check` | опись настроек сервера, секреты замаскированы |
| `npm run ops:backup` / `:backup:verify` | копия базы / проверка, что она разворачивается |
| `npm run dev:up` / `dev:piston` | локальные база и раннер в Docker / Python, Node.js и mono в раннер |

**Перед каждым коммитом:** `tsc`, `lint`, `test:sandbox`, `check:rules`,
при правках C#-части — `test:sandbox:csharp`, JavaScript-части — `test:sandbox:js`,
а при изменениях зависимостей или конфигурации — ещё и `build`.

---

## Боевой сервер

| Что | Значение |
|---|---|
| Хостинг | Timeweb Cloud, VPS 4 ГБ / 2 ядра / 40 ГБ (с 23 сентября 2026), Ubuntu 24.04 |
| Адрес | `95.182.84.109` (hostname `server-sxgk`), домен `codegolf.ru` — DNS в панели Timeweb |
| Пользователь приложения | `deploy`; может только `sudo systemctl {restart,start,stop,status} codegolf` |
| Код | `/home/deploy/codegolf-arena` (`.env` там же, не в git) |
| Бэкапы | `/home/deploy/backups`, таймер `codegolf-backup.timer` в 03:30 |
| Служба сайта | `codegolf.service` (слушает `127.0.0.1:3000`) |
| База и раннер | `docker compose` в папке проекта: `codegolf-db`, `codegolf-piston` (раннеру — 1 ядро и 1 ГБ) |
| Вход снаружи | nginx (`/etc/nginx/sites-available/codegolf`) + сертификат certbot |
| Firewall | ufw: открыты 22, 80, 443 |
| Ключ сервера (ED25519) | `SHA256:wDwmwPtn7PSL6kjA47Kdu+UKwNeR6oTaUWORUhrWRUg` |

**Обновление сайта** (под `deploy`) — подробно в [docs/deploy.md](docs/deploy.md):

```bash
cd ~/codegolf-arena && bash scripts/backup-db.sh && bash scripts/deploy-standalone.sh
```

**Доступ к серверу.**

- **ИИ, работающий на компьютере владельца** (Claude Code, Cursor, Codex и т. п.),
  подключается ключом, который лежит у владельца в `~/.ssh/codegolf_deploy`:

  ```bash
  ssh -i ~/.ssh/codegolf_deploy -o IdentitiesOnly=yes -o UserKnownHostsFile=~/.ssh/codegolf_known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes deploy@95.182.84.109
  ```

  `BatchMode=yes` — чтобы никогда не оказаться в запросе пароля.
- **ИИ в веб-чате** до сервера не дотянется: он выдаёт владельцу команды,
  а владелец присылает вывод.
- **Действия от root** — пакеты, файлы в `/etc`, nginx, certbot — выполняет
  владелец: доступа root у ИИ нет намеренно.
- Отозвать доступ ключа (от root):
  `sed -i '/claude-codegolf-deploy/d' /home/deploy/.ssh/authorized_keys`

---

## Грабли, на которые уже наступали

- **Prisma пишет в `DATABASE_URL` параметр `?schema=public`, а `pg_dump` и `psql`
  его не понимают.** Скрипты бэкапа убирают такие параметры (`libpq_url`).
  Для ручного `psql` адрес бери с отрезанным `?…`.
- **Ключи Stepik:** ID — 40 символов, секрет — 128. Оба из **одного** приложения
  на stepik.org/oauth2/applications. Адрес возврата — ровно
  `https://codegolf.ru/api/auth/stepik/callback`. При скрытом вводе легко вставить
  секрет дважды (получится 256 символов): `npm run ops:env:check` это ловит.
- **Пакеты раннера живут в томе `codegolf-piston-packages`**: пересоздание контейнера
  (`docker compose up -d piston` после правки лимитов) их не теряет, а свежий том
  приходит пустым — тогда нужен `npm run dev:piston`. `/api/health` прямо пишет,
  если нужной версии нет.
- **mono пишет ошибки компиляции в stdout, а не в stderr**, и его формат `"R"`
  печатает `1.0/3` с 17 цифрами вместо самой короткой записи. Оба случая уже
  обработаны в `piston.ts` и `csharp-runner.ts` и закрыты проверками
  `test:sandbox:csharp` — не «упрощайте» это обратно.
- **Страница, собранная статически, не видит смену `.env`.** Всё, что зависит от
  `JAVASCRIPT_ENABLED` / `CSHARP_ENABLED` (правила, список задач), обновляется раз
  в минуту (`revalidate`); страница задачи и API читают настройку на каждый запрос.
- **`prisma migrate dev` не работает там, где нет интерактивного терминала** (у ИИ-ассистента
  в том числе). Черновик миграции: `npx prisma migrate diff --from-schema-datasource
  prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`, затем SQL
  в `prisma/migrations/<дата>_<имя>/migration.sql`, переносы данных — руками в нужном
  порядке, проверка — `npm run db:migrate:deploy` и `npm run db:migrate:check` на локальной базе.
- **Задания в очереди без поля `language` — это Python**: так их записывали до
  23 сентября 2026. Ключ повтора (`dedupKey`) у Python тоже прежний.
- **Деплой-скрипт обновляет сам себя через `git pull`, но выполняется его старая
  версия** — bash уже прочитал файл. Новый шаг в `deploy-standalone.sh` сработает
  только со следующего деплоя; в первый раз выполните его руками. Так было
  22 сентября с `npm run db:tasks:csharp`.
- **Любой лишний файл в папке сайта останавливает деплой** («Working tree has
  local changes»). Копии `.env` и прочее кладите в домашнюю папку, не в `~/codegolf-arena`.
- **`.env` читается службой только при старте** — после правки:
  `sudo systemctl restart codegolf`.
- **Машина владельца — Windows с Git Bash:** Python вызывается как `python`,
  а не `python3`; `/tmp` у Git Bash и у Node — разные папки. В репозитории
  `.gitattributes` принудительно ставит LF, иначе bash-скрипты падают на сервере.
- **Владелец иногда работает параллельно в другой сессии ИИ** в той же папке.
  Перед правками — `git status`: не затирай и не смешивай с коммитом чужие
  несохранённые изменения.

## Стиль

- Коммиты: заголовок `тип(область): что сделано` по-английски, тело — по-русски:
  что было не так и почему сделано именно так.
- Комментарии в коде — по-русски, объясняют **почему**, а не что.
- Документация для людей — в `docs/`, простым языком, с готовыми командами.
