# Обновление сайта (деплой)

Короткая инструкция для уже работающего сервера. Установка с нуля —
в [server-setup.md](server-setup.md), бэкапы — в [backup.md](backup.md).

## Обычное обновление

На сервере, под пользователем `deploy`:

```bash
cd ~/codegolf-arena && bash scripts/backup-db.sh && bash scripts/deploy-standalone.sh
```

Сначала снимается копия базы, потом скрипт деплоя:

1. подтягивает код из `main` (и останавливается, если в папке есть несохранённые правки);
2. ставит зависимости (`npm ci`) и генерирует клиент Prisma;
3. проверяет настройки;
4. применяет **новые миграции** базы из `prisma/migrations`;
5. **добавляет** новые задачи из `codegolf_tasks.json` — существующие не трогает;
   затем проставляет C#-сигнатуры задачам пробы C# — тоже только пустые;
6. собирает сайт — около полутора минут, всё это время работает старая версия;
7. перезапускает службу `codegolf` и проверяет `/api/health` изнутри и снаружи.

Успешный конец вывода:

```
No pending migrations to apply.
Done: created=0, updated=0, kept=115, skipped=0
Local health OK
Public health OK
Deploy completed successfully.
```

## Особые случаи

**Изменилась структура базы.** Локально создаётся миграция
(`npm run db:migrate:dev -- --name что_меняем`), коммитится вместе с кодом,
и деплой применит её сам. Никакого `db push` на сервере.

**Изменилась версия Python** (константа `PISTON_PYTHON_VERSION` в `src/lib/piston.ts`).
Сначала поставьте её в раннер, потом деплойте — иначе в промежутке все
решения будут падать:

```bash
cd ~/codegolf-arena && git pull --ff-only && PISTON_PYTHON_VERSION=3.X.0 npm run dev:piston
```

**Включить или выключить C# (проба C#).** Нужен mono в раннере — проверьте, что
`/api/health` показывает `"csharpVersion":"6.12.0"`, иначе сначала `npm run dev:piston`.
Затем в `~/codegolf-arena/.env` поставьте строку `CSHARP_ENABLED="true"` (или `"false"`)
и перезапустите службу — выкладка кода не нужна:

```bash
sudo systemctl restart codegolf
```

Подробности пробы — [csharp-trial.md](csharp-trial.md).

**Нужно залить задачи из файла поверх базы** (затрёт правки из админки):

```bash
cd ~/codegolf-arena && IMPORT_OVERWRITE=true npm run db:tasks:import-export
```

**Поменялись файлы в `scripts/systemd/` или `scripts/nginx/`.** Деплой их
не копирует — это делается от root вручную, командами из
[server-setup.md](server-setup.md).

## Если что-то пошло не так

| Симптом | Что смотреть |
|---|---|
| Скрипт остановился: «Working tree has local changes» | `git status` — чьи-то несохранённые правки на сервере |
| Упала сборка | `free -h` — хватает ли памяти и подкачки |
| «Local health failed» | `journalctl -u codegolf -n 50 --no-pager` |
| В `/api/health` раннер не в порядке | `docker compose ps`; если написано, что нет версии Python или C# — `npm run dev:piston` |
| Нужно откатиться | в репозитории отменить плохой коммит (`git revert <коммит>`), запушить в `main` и задеплоить заново. Не делайте `git checkout` старого коммита на сервере — деплой-скрипт тогда упадёт на `git pull`. Базу при необходимости — из копии по [backup.md](backup.md) |
