-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "csharp_signature" TEXT;

-- CreateTable
CREATE TABLE "language_submissions" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "code_length" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "runtime_ms" INTEGER,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_best_submissions" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "code_length" INTEGER NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_best_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "language_submissions_task_id_language_idx" ON "language_submissions"("task_id", "language");

-- CreateIndex
CREATE INDEX "language_submissions_user_id_task_id_language_idx" ON "language_submissions"("user_id", "task_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "language_best_submissions_submission_id_key" ON "language_best_submissions"("submission_id");

-- CreateIndex
CREATE INDEX "language_best_submissions_task_id_language_code_length_achi_idx" ON "language_best_submissions"("task_id", "language", "code_length", "achieved_at");

-- CreateIndex
CREATE UNIQUE INDEX "language_best_submissions_task_id_user_id_language_key" ON "language_best_submissions"("task_id", "user_id", "language");

-- AddForeignKey
ALTER TABLE "language_submissions" ADD CONSTRAINT "language_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_submissions" ADD CONSTRAINT "language_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_best_submissions" ADD CONSTRAINT "language_best_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_best_submissions" ADD CONSTRAINT "language_best_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_best_submissions" ADD CONSTRAINT "language_best_submissions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "language_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

