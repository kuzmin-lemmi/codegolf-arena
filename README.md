# Codegolf Arena

Соревнования по кодгольфу на Python: решаешь задачу **одной строкой**,
побеждает самое короткое решение. Боевой сайт — **https://codegolf.ru**.

Next.js 15 · PostgreSQL · Prisma · Piston (Python 3.11 на сервере) ·
Pyodide (Python 3.11 в браузере).

## Куда смотреть

| Кому | Что читать |
|---|---|
| ИИ-ассистенту или разработчику | [AGENTS.md](AGENTS.md) — устройство, правила, сервер, грабли |
| Что сделано и что дальше | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Обновить сайт | [docs/deploy.md](docs/deploy.md) |
| Поставить на новый сервер | [docs/server-setup.md](docs/server-setup.md) |
| Бэкапы, восстановление, мониторинг | [docs/backup.md](docs/backup.md) |

## Продолжить работу с ИИ в новом чате

**ИИ на этом компьютере** — Claude Code, Cursor, Codex и подобные. Откройте
папку проекта: они сами прочитают `AGENTS.md` и `CLAUDE.md`. Достаточно
написать: «Прочитай AGENTS.md и docs/ROADMAP.md. Продолжаем: <задача>».

**ИИ в браузере** — ChatGPT, Claude.ai и подобные. Вставьте первым сообщением:

```text
Ты продолжаешь работу над проектом Codegolf Arena — сайт https://codegolf.ru,
код https://github.com/kuzmin-lemmi/codegolf-arena (публичный).

Сначала прочитай два файла — там устройство проекта, правила, которые нельзя
нарушать, состояние сервера и список открытых задач:
https://raw.githubusercontent.com/kuzmin-lemmi/codegolf-arena/main/AGENTS.md
https://raw.githubusercontent.com/kuzmin-lemmi/codegolf-arena/main/docs/ROADMAP.md

Я не программист. Объясняй простым языком, давай готовые команды по одной,
с ожидаемым результатом, и говори, какие из них выполнять от root.
Пароли и ключи в чат не присылаю — давай команды со скрытым вводом.

Задача: <опишите, что нужно сделать>
```

Если ИИ в браузере не умеет открывать ссылки, скопируйте ему содержимое
этих двух файлов прямо в сообщение.

## Локальный запуск

Нужны Docker, Node 20+ и Python.

```bash
cp .env.example .env
```

В `.env` укажите `DATABASE_URL="postgresql://codegolf:codegolf@127.0.0.1:5432/codegolf?schema=public"`,
а также `ADMIN_EMAIL` и `ADMIN_PASSWORD`. Затем:

```bash
npm ci && npm run dev:up && npm run dev:piston && npm run db:migrate:deploy && npm run db:seed && npm run db:tasks:import-export && npm run dev
```

Сайт откроется на http://localhost:3000.
