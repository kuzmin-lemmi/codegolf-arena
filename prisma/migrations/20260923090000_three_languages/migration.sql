-- Арена на трёх языках (docs/three-languages.md).
-- Попытки и рекорды всех языков — в общих таблицах submissions /
-- best_submissions с колонкой language. Попытки и рекорды пробы C# переносятся
-- из language_* и получают очки по общим правилам: за решение задачи и за
-- первое место. Очки за улучшения задним числом не начисляются — так же, как
-- у Python (RETRO_POINTS).

-- 1. Колонки языка и очков
ALTER TABLE "submissions" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'python';

ALTER TABLE "best_submissions" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'python',
ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- 2. Очки, которые питоновские рекорды уже принесли. Проверено на боевой базе
-- 23 сентября: у каждого игрока users.total_points равен этой сумме
UPDATE "best_submissions" b
SET "points" = (CASE t."tier" WHEN 'silver' THEN 20 WHEN 'gold' THEN 30 ELSE 10 END)
  + b."improve_points"
  + (CASE WHEN b."first_place_awarded" THEN 25 ELSE 0 END)
FROM "tasks" t
WHERE t."id" = b."task_id";

-- 3. Индексы: рекорд теперь уникален для (задача, игрок, язык)
DROP INDEX "best_submissions_task_id_code_length_achieved_at_idx";
DROP INDEX "best_submissions_task_id_user_id_key";
DROP INDEX "best_submissions_user_id_idx";
DROP INDEX "submissions_task_id_idx";
DROP INDEX "submissions_task_id_user_id_idx";

CREATE INDEX "best_submissions_user_id_language_idx" ON "best_submissions"("user_id", "language");
CREATE INDEX "best_submissions_task_id_language_code_length_achieved_at_idx" ON "best_submissions"("task_id", "language", "code_length", "achieved_at");
CREATE UNIQUE INDEX "best_submissions_task_id_user_id_language_key" ON "best_submissions"("task_id", "user_id", "language");
CREATE INDEX "submissions_task_id_language_idx" ON "submissions"("task_id", "language");
CREATE INDEX "submissions_task_id_user_id_language_idx" ON "submissions"("task_id", "user_id", "language");

-- 4. Попытки пробы C# — в общую таблицу, с теми же id
INSERT INTO "submissions" (
  "id", "task_id", "user_id", "language", "code", "code_length", "status",
  "tests_passed", "tests_total", "runtime_ms", "error_msg", "created_at"
)
SELECT
  "id", "task_id", "user_id", "language", "code", "code_length", "status",
  "tests_passed", "tests_total", "runtime_ms", "error_msg", "created_at"
FROM "language_submissions";

-- 5. Рекорды пробы C#: с какой длины начинал и сколько раз улучшал — по истории
-- попыток; очки — за решение (по уровню задачи) и первое место в таблице языка
WITH passes AS (
  SELECT
    "task_id", "user_id", "language", "code_length", "created_at",
    MIN("code_length") OVER (
      PARTITION BY "task_id", "user_id", "language"
      ORDER BY "created_at"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS prev_best,
    ROW_NUMBER() OVER (
      PARTITION BY "task_id", "user_id", "language"
      ORDER BY "created_at"
    ) AS n
  FROM "language_submissions"
  WHERE "status" = 'pass'
),
progress AS (
  SELECT
    "task_id", "user_id", "language",
    MAX(CASE WHEN n = 1 THEN "code_length" END) AS first_length,
    COUNT(*) FILTER (WHERE prev_best IS NOT NULL AND "code_length" < prev_best) AS improve_count
  FROM passes
  GROUP BY "task_id", "user_id", "language"
),
ranked AS (
  SELECT
    l.*,
    ROW_NUMBER() OVER (
      PARTITION BY l."task_id", l."language"
      ORDER BY l."code_length", l."achieved_at", l."user_id"
    ) AS place
  FROM "language_best_submissions" l
)
INSERT INTO "best_submissions" (
  "id", "task_id", "user_id", "language", "submission_id", "code_length", "achieved_at",
  "first_length", "improve_count", "improve_points", "first_place_awarded", "points"
)
SELECT
  r."id", r."task_id", r."user_id", r."language", r."submission_id", r."code_length", r."achieved_at",
  COALESCE(p.first_length, r."code_length"),
  COALESCE(p.improve_count, 0),
  0,
  r.place = 1,
  (CASE t."tier" WHEN 'silver' THEN 20 WHEN 'gold' THEN 30 ELSE 10 END)
    + (CASE WHEN r.place = 1 THEN 25 ELSE 0 END)
FROM ranked r
JOIN "tasks" t ON t."id" = r."task_id"
LEFT JOIN progress p
  ON p."task_id" = r."task_id" AND p."user_id" = r."user_id" AND p."language" = r."language";

-- 6. Общий рейтинг = сумма очков по всем языкам
UPDATE "users" u
SET "total_points" = u."total_points" + moved.points
FROM (
  SELECT b."user_id", SUM(b."points") AS points
  FROM "best_submissions" b
  WHERE b."language" <> 'python'
  GROUP BY b."user_id"
) moved
WHERE moved."user_id" = u."id";

-- 7. Старые таблицы пробы больше не нужны
ALTER TABLE "language_best_submissions" DROP CONSTRAINT "language_best_submissions_submission_id_fkey";
ALTER TABLE "language_best_submissions" DROP CONSTRAINT "language_best_submissions_task_id_fkey";
ALTER TABLE "language_best_submissions" DROP CONSTRAINT "language_best_submissions_user_id_fkey";
ALTER TABLE "language_submissions" DROP CONSTRAINT "language_submissions_task_id_fkey";
ALTER TABLE "language_submissions" DROP CONSTRAINT "language_submissions_user_id_fkey";
DROP TABLE "language_best_submissions";
DROP TABLE "language_submissions";
