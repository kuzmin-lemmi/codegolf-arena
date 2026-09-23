/**
 * Заполняет поля прогресса в best_submissions по истории попыток.
 *
 * Зачем: до этапа 4 очки давали только за первое решение, а «было 47 → стало 31»
 * нигде не хранилось. Скрипт восстанавливает по submissions:
 *   - first_length        — длина первого зачтённого решения;
 *   - improve_count       — сколько раз игрок укорачивал своё решение;
 *   - first_place_awarded — ставим true текущим лидерам задач, чтобы им
 *                           не начислился бонус +25 за место, которое они
 *                           заняли ещё до появления правила.
 *
 * Очки задним числом не начисляются: запустите с RETRO_POINTS=true, если
 * хотите выдать их за прошлые улучшения (скрипт сначала покажет, сколько
 * получится, и обновит total_points у пользователей).
 *
 * Запуск: npm run db:progress:backfill
 */

import { PrismaClient } from '@prisma/client';
import { awardImprovementPoints } from '../src/lib/points';
import type { TaskTier } from '../src/types';

const prisma = new PrismaClient();

async function main() {
  const retroPoints = process.env.RETRO_POINTS === 'true';

  const bests = await prisma.bestSubmission.findMany({
    select: {
      id: true,
      taskId: true,
      userId: true,
      language: true,
      codeLength: true,
      firstLength: true,
      improveCount: true,
      improvePoints: true,
      firstPlaceAwarded: true,
      task: { select: { slug: true, tier: true } },
    },
  });

  console.log(`best_submissions: ${bests.length}`);

  let updated = 0;
  let retroTotal = 0;
  const retroByUser = new Map<string, number>();

  for (const best of bests) {
    const passes = await prisma.submission.findMany({
      where: { taskId: best.taskId, userId: best.userId, language: best.language, status: 'pass' },
      orderBy: { createdAt: 'asc' },
      select: { codeLength: true },
    });

    if (passes.length === 0) {
      continue;
    }

    // Цепочка личных рекордов: только те попытки, что улучшали результат
    const chain: number[] = [];
    let runningBest: number | null = null;
    for (const pass of passes) {
      if (runningBest === null || pass.codeLength < runningBest) {
        chain.push(pass.codeLength);
        runningBest = pass.codeLength;
      }
    }

    const firstLength = chain[0];
    const improveCount = Math.max(0, chain.length - 1);

    // Сколько очков полагалось бы за эти улучшения по текущим правилам
    let improvePoints = 0;
    for (let i = 1; i < chain.length; i += 1) {
      const award = awardImprovementPoints({
        tier: (best.task.tier as TaskTier) || 'bronze',
        savedChars: chain[i - 1] - chain[i],
        alreadyAwarded: improvePoints,
      });
      improvePoints += award.points;
    }

    const isLeader = await isTaskLeader(best.taskId, best.language, best.userId);
    const retroForTask = Math.max(0, improvePoints - best.improvePoints);

    const data: {
      firstLength?: number;
      improveCount?: number;
      improvePoints?: number;
      firstPlaceAwarded?: boolean;
      points?: { increment: number };
    } = {};

    if (best.firstLength === null) data.firstLength = firstLength;
    if (best.improveCount !== improveCount) data.improveCount = improveCount;
    if (retroPoints && best.improvePoints !== improvePoints) data.improvePoints = improvePoints;
    // Очки языка — сумма best_submissions.points: рейтинг языка и общий не должны разойтись
    if (retroPoints && retroForTask > 0) data.points = { increment: retroForTask };
    if (isLeader && !best.firstPlaceAwarded) data.firstPlaceAwarded = true;

    if (Object.keys(data).length > 0) {
      await prisma.bestSubmission.update({ where: { id: best.id }, data });
      updated += 1;
    }

    if (retroForTask > 0) {
      retroTotal += retroForTask;
      retroByUser.set(best.userId, (retroByUser.get(best.userId) || 0) + retroForTask);
    }
  }

  console.log(`updated rows: ${updated}`);

  if (!retroPoints) {
    console.log(
      `retro points not applied: ${retroTotal} points for ${retroByUser.size} users ` +
        '(run with RETRO_POINTS=true to award them)'
    );
    return;
  }

  for (const [userId, points] of retroByUser.entries()) {
    await prisma.user.update({
      where: { id: userId },
      data: { totalPoints: { increment: points } },
    });
    console.log(`user ${userId}: +${points}`);
  }

  console.log(`retro points awarded: ${retroTotal} for ${retroByUser.size} users`);
}

async function isTaskLeader(taskId: string, language: string, userId: string): Promise<boolean> {
  const leader = await prisma.bestSubmission.findFirst({
    where: { taskId, language },
    orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }, { userId: 'asc' }],
    select: { userId: true },
  });

  return leader?.userId === userId;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
