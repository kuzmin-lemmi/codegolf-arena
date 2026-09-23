// src/lib/scoring.ts
// Запись проверенной попытки и всё, что из неё следует: личный рекорд, место,
// очки, зачёт соревнований, «твой рекорд побили». Одна функция для всех языков.
//
// Правила зачёта (docs/three-languages.md): у каждой задачи своя таблица
// рекордов на каждом языке, очки начисляются в каждом языке отдельно по одним
// правилам (src/lib/points.ts). Общий рейтинг — users.total_points, рейтинг
// по языку — сумма best_submissions.points этого языка.

import { prisma } from '@/lib/db';
import { awardImprovementPoints, getFirstPlacePoints, getPassPoints } from '@/lib/points';
import { notifyRecordBeaten } from '@/lib/notifications';
import { syncCompetitionEntriesForTask } from '@/lib/competitions';
import { LANGUAGE_LABELS, type Language } from '@/lib/languages';
import type { TaskTier } from '@/types';

export interface CheckedSubmission {
  task: { id: string; slug: string; title: string; tier: string };
  userId: string;
  language: Language;
  code: string;
  codeLength: number;
  status: 'pass' | 'fail' | 'error';
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number;
  errorMsg: string | null;
}

export interface ScoringResult {
  submissionId: string;
  isNewBest: boolean;
  previousBestLength: number | null;
  improvedBy: number | null;
  tookFirstPlaceFrom: string | null;
  pointsEarned: number;
  pointsBreakdown: string[];
  place: number | null;
}

// Порядок в таблице рекордов: короче — выше, при равной длине — кто раньше
const BOARD_ORDER = [
  { codeLength: 'asc' as const },
  { achievedAt: 'asc' as const },
  { userId: 'asc' as const },
];

const BEST_FIELDS = {
  codeLength: true,
  achievedAt: true,
  firstLength: true,
  improvePoints: true,
  firstPlaceAwarded: true,
} as const;

export async function recordCheckedSubmission(input: CheckedSubmission): Promise<ScoringResult> {
  const { task, userId, language, codeLength } = input;
  const tier = task.tier as TaskTier;

  const result = await prisma.$transaction(
    async (tx) => {
      const submission = await tx.submission.create({
        data: {
          taskId: task.id,
          userId,
          language,
          code: input.code,
          codeLength,
          status: input.status,
          testsPassed: input.testsPassed,
          testsTotal: input.testsTotal,
          runtimeMs: input.runtimeMs,
          errorMsg: input.errorMsg,
        },
        select: { id: true },
      });

      const outcome = {
        submissionId: submission.id,
        isNewBest: false,
        previousBestLength: null as number | null,
        improvedBy: null as number | null,
        tookFirstPlaceFrom: null as string | null,
        dethroned: null as { userId: string; previousLength: number } | null,
        pointsEarned: 0,
        pointsBreakdown: [] as string[],
        place: null as number | null,
      };

      if (input.status !== 'pass') return outcome;

      const key = { taskId: task.id, userId, language };

      // Кто держал первое место до этой отправки: ему уйдёт «твой рекорд побили»
      const leaderBefore = await tx.bestSubmission.findFirst({
        where: { taskId: task.id, language },
        orderBy: BOARD_ORDER,
        select: {
          userId: true,
          codeLength: true,
          user: { select: { nickname: true, displayName: true } },
        },
      });

      const now = new Date();

      // Без исключений внутри транзакции: в PostgreSQL после ошибки
      // уникальности (гонка двух отправок) транзакция уже не принимает запросов
      const created = await tx.bestSubmission.createMany({
        data: [{ ...key, submissionId: submission.id, codeLength, achievedAt: now, firstLength: codeLength }],
        skipDuplicates: true,
      });

      let best = await tx.bestSubmission.findUnique({
        where: { taskId_userId_language: key },
        select: BEST_FIELDS,
      });
      if (!best) throw new Error('best_submissions: запись пропала внутри транзакции');

      let points = 0;

      if (created.count === 1) {
        outcome.isNewBest = true;
        const passPoints = getPassPoints(tier);
        points += passPoints;
        outcome.pointsBreakdown.push(`Решение задачи (${LANGUAGE_LABELS[language]}): +${passPoints}`);
      } else {
        outcome.previousBestLength = best.codeLength;

        // Суть игры — укоротить своё же решение. Именно за это и платим очками
        if (codeLength < best.codeLength) {
          const savedChars = best.codeLength - codeLength;
          const award = awardImprovementPoints({
            tier,
            savedChars,
            alreadyAwarded: best.improvePoints,
          });

          best = await tx.bestSubmission.update({
            where: { taskId_userId_language: key },
            data: {
              submissionId: submission.id,
              codeLength,
              achievedAt: now,
              improveCount: { increment: 1 },
              improvePoints: { increment: award.points },
              // У записей, созданных до учёта прогресса, поля нет — заполняем на первом улучшении
              firstLength: best.firstLength ?? best.codeLength,
            },
            select: BEST_FIELDS,
          });

          outcome.isNewBest = true;
          outcome.improvedBy = savedChars;
          points += award.points;

          if (award.points > 0) {
            outcome.pointsBreakdown.push(
              `Короче на ${savedChars} симв.: +${award.points}` +
                (award.capped ? ` (лимит ${award.cap} на задачу)` : '')
            );
          } else if (award.rawPoints > 0) {
            outcome.pointsBreakdown.push(
              `Короче на ${savedChars} симв.: лимит очков за улучшения по задаче исчерпан (${award.cap})`
            );
          }
        }
      }

      // Место в таблице этого языка, по той же сортировке, что и сама таблица
      const better = await tx.bestSubmission.count({
        where: {
          taskId: task.id,
          language,
          OR: [
            { codeLength: { lt: best.codeLength } },
            { codeLength: best.codeLength, achievedAt: { lt: best.achievedAt } },
            { codeLength: best.codeLength, achievedAt: best.achievedAt, userId: { lt: userId } },
          ],
        },
      });
      outcome.place = better + 1;

      // Бонус за первый выход на #1 — один раз на задачу и язык, иначе его можно качать по кругу
      let firstPlaceNow = false;
      if (outcome.place === 1 && !best.firstPlaceAwarded) {
        const firstPlacePoints = getFirstPlacePoints();
        points += firstPlacePoints;
        firstPlaceNow = true;
        outcome.pointsBreakdown.push(`Первое место по задаче: +${firstPlacePoints}`);
      }

      if (points > 0 || firstPlaceNow) {
        await tx.bestSubmission.update({
          where: { taskId_userId_language: key },
          data: {
            points: { increment: points },
            ...(firstPlaceNow ? { firstPlaceAwarded: true } : {}),
          },
        });
      }

      if (points > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { totalPoints: { increment: points } },
        });
      }
      outcome.pointsEarned = points;

      // Само уведомление отправляем после коммита: оно не должно
      // ронять зачтённую отправку, если запись в notifications не удалась
      if (leaderBefore && leaderBefore.userId !== userId && codeLength < leaderBefore.codeLength) {
        outcome.tookFirstPlaceFrom = leaderBefore.user.nickname || leaderBefore.user.displayName;
        outcome.dethroned = { userId: leaderBefore.userId, previousLength: leaderBefore.codeLength };
      }

      // Соревнования пока только на Python: их ещё ни разу не проводили,
      // правила для других языков решим к первому соревнованию
      if (language === 'python') {
        await syncCompetitionEntriesForTask(tx, { userId, taskId: task.id });
      }

      return outcome;
    },
    { maxWait: 5000, timeout: 15000 }
  );

  // «Твой рекорд побили» — бывшему лидеру таблицы этого языка
  if (result.dethroned) {
    try {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true, displayName: true },
      });

      await notifyRecordBeaten(prisma, {
        userId: result.dethroned.userId,
        taskId: task.id,
        payload: {
          taskSlug: task.slug,
          taskTitle: task.title,
          language,
          byNickname: actor?.nickname || actor?.displayName || 'Другой участник',
          newLength: codeLength,
          yourLength: result.dethroned.previousLength,
        },
      });
    } catch (error) {
      console.error('Failed to create record_beaten notification:', error);
    }
  }

  return {
    submissionId: result.submissionId,
    isNewBest: result.isNewBest,
    previousBestLength: result.previousBestLength,
    improvedBy: result.improvedBy,
    tookFirstPlaceFrom: result.tookFirstPlaceFrom,
    pointsEarned: result.pointsEarned,
    pointsBreakdown: result.pointsBreakdown,
    place: result.place,
  };
}
