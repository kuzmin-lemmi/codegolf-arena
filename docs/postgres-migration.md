# Миграция SQLite -> PostgreSQL: пошаговый runbook

Ниже полный порядок действий, что сделать вручную.

## 0) Что уже сделано в коде

- Prisma берет провайдер БД из `DATABASE_PROVIDER`.
- Валидация env блокирует `sqlite` в production.
- В `.env.example` добавлены примеры для SQLite и PostgreSQL.

Это значит: код уже готов, вам нужно только правильно провести перенос данных и переключение окружения.

## 1) Подготовка (локально, заранее)

1. Убедитесь, что проект собирается на текущем состоянии:

```bash
npm run lint
npx tsc --noEmit
```

2. Проверьте, где лежит ваш SQLite файл (обычно `prisma/dev.db` или путь из `DATABASE_URL`).

3. Подготовьте PostgreSQL:
   - создан сервер/инстанс,
   - создана база,
   - создан пользователь с правами на эту базу.

4. Проверьте строку подключения:

```env
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
```

5. Если хотите сначала задеплоить код, а миграцию сделать позже, временно добавьте на прод:

```env
ALLOW_SQLITE_IN_PRODUCTION="true"
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./dev.db"
```

После полного перехода на PostgreSQL обязательно верните:

```env
ALLOW_SQLITE_IN_PRODUCTION="false"
DATABASE_PROVIDER="postgresql"
```

## 2) Заморозка изменений (cutover window)

Во время переноса не должно быть новых записей в SQLite.

1. Включите maintenance (или временно остановите приложение).
2. Сделайте бэкап SQLite файла:

```bash
cp prisma/dev.db prisma/dev.db.backup
```

На Windows (PowerShell):

```powershell
Copy-Item prisma/dev.db prisma/dev.db.backup
```

## 3) Перенос данных в PostgreSQL

### Вариант A (рекомендуется): pgloader

1. Установите `pgloader`.
2. Выполните команду:

```bash
pgloader sqlite:///ABSOLUTE_PATH_TO/prisma/dev.db postgresql://USER:PASSWORD@HOST:5432/DB_NAME
```

Пример:

```bash
pgloader sqlite:///C:/apps/codegolf/prisma/dev.db postgresql://arena_user:secret@localhost:5432/arena
```

3. Дождитесь завершения без ошибок.

### Вариант B: через GUI (DBeaver/DataGrip)

1. Подключите SQLite и PostgreSQL.
2. Сделайте Data Transfer всех таблиц из SQLite в PostgreSQL.
3. Проверьте, что перенеслись все строки и индексы.

## 4) Применение схемы Prisma на PostgreSQL

Важно: в репозитории пока нет папки `prisma/migrations`, поэтому используем `db:push`.

1. В production env выставьте:

```env
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"
```

2. Выполните:

```bash
npm run db:generate
npm run db:push
```

`db:push` синхронизирует схему Prisma с PostgreSQL.

## 5) Деплой с новым окружением

1. Обновите env на сервере:
   - `DATABASE_PROVIDER=postgresql`
   - `DATABASE_URL=...postgres...`
   - `ALLOW_DEV_LOGIN=false`
   - `NEXT_PUBLIC_BASE_URL` заполнен
2. Перезапустите приложение.

## 5.1) Точный набор команд (выполнять по порядку)

Ниже минимальный набор команд для cutover. Выполняйте в указанном порядке.

```bash
# 1) Остановить приложение (команда зависит от вашего process manager)
# Пример для PM2:
pm2 stop codegolf-arena

# 2) Бэкап SQLite
cp prisma/dev.db prisma/dev.db.backup

# 3) Перенос данных (пример через pgloader)
pgloader sqlite:///ABSOLUTE_PATH_TO/prisma/dev.db postgresql://USER:PASSWORD@HOST:5432/DB_NAME

# 4) Переключить env на PostgreSQL
# (отредактируйте .env вручную)

# 5) Проверить env + коннект + таблицы
npm run ops:preflight:postgres

# 6) Синхронизировать схему Prisma
npm run db:generate
npm run db:push

# 7) Запустить приложение
pm2 start codegolf-arena

# 8) Быстрый API smoke-check
npm run ops:smoke
```

Если используете systemd/docker/k8s вместо PM2, подставьте свои команды stop/start.

## 6) Smoke-проверка после переключения

Проверьте руками в таком порядке:

1. `GET /api/health` -> статус `ok`.
2. Логин существующим пользователем.
3. Открыть список задач.
4. Отправить сабмит в задаче и дождаться результата.
5. Проверить профиль пользователя.
6. В админке:
   - открыть список задач,
   - обновить одну задачу,
   - проверить, что тесткейсы сохранились.

Если все пункты проходят — миграция успешна.

## 7) Rollback-план (если что-то пошло не так)

1. Остановите приложение.
2. Верните env обратно на SQLite:

```env
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./dev.db"
```

3. Запустите приложение на старой БД.
4. Разберите ошибку, исправьте, повторите cutover.

## 8) Что сделать сразу после успешной миграции

1. Настроить регулярные backup PostgreSQL (ежедневно + retention).
2. Добавить мониторинг БД (connections, slow queries, CPU/disk).
3. Начать использовать версионированные миграции Prisma (`prisma migrate`) как следующий шаг.
