// src/lib/competitions.ts

/**
 * Подсчёт результатов соревнований.
 *
 * Раньше страница соревнования была нарисована, но в competition_entries
 * никто ничего не писал — лидерборд всегда был пустым. Здесь живёт вся
 * логика подсчёта: она вызывается после каждого зачтённого решения и
 * тем же кодом пользуется скрипт бэкфилла.
 *
 * Важно: в зачёт идут только PASS-попытки, сделанные внутри окна
 * соревнования (startsAt..endsAt). Решение той же задачи месяц назад
 * в соревновательный результат не попадает.
 *
 * Соревнования пока только на Python: суммировать длины решений на разных
 * языках бессмысленно, а правила для JS и C# решим к первому соревнованию.
 */

import type { Prisma } from '@prisma/client';

type CompetitionsClient = Pick<
  Prisma.TransactionClient,
  'competition' | 'competitionTask' | 'competitionEntry' | 'submission'
>;

export interface CompetitionEntryTotals {
  competitionId: string;
  tasksSolved: number;
  totalLength: number;
  lastSubmitAt: Date | null;
}

/**
 * Пересчитывает результат участника в одном соревновании.
 * Возвращает null, если соревнования нет или в нём нет задач.
 */
export async function recomputeCompetitionEntry(
  client: CompetitionsClient,
  params: { competitionId: string; userId: string }
): Promise<CompetitionEntryTotals | null> {
  const { competitionId, userId } = params;

  const competition = await client.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      tasks: { select: { taskId: true } },
    },
  });

  if (!competition) return null;

  const taskIds = competition.tasks.map((task) => task.taskId);
  if (taskIds.length === 0) return null;

  const grouped = await client.submission.groupBy({
    by: ['taskId'],
    where: {
      userId,
      taskId: { in: taskIds },
      language: 'python',
      status: 'pass',
      createdAt: {
        gte: competition.startsAt,
        lte: competition.endsAt,
      },
    },
    _min: { codeLength: true },
    _max: { createdAt: true },
  });

  const tasksSolved = grouped.length;
  const totalLength = grouped.reduce((sum, row) => sum + (row._min.codeLength ?? 0), 0);
  const lastSubmitAt = grouped.reduce<Date | null>((latest, row) => {
    const value = row._max.createdAt;
    if (!value) return latest;
    if (!latest || value > latest) return value;
    return latest;
  }, null);

  if (tasksSolved === 0) {
    // Нечего показывать: не плодим пустые строки в лидерборде
    await client.competitionEntry.deleteMany({
      where: { competitionId, userId },
    });
    return { competitionId, tasksSolved: 0, totalLength: 0, lastSubmitAt: null };
  }

  await client.competitionEntry.upsert({
    where: {
      competitionId_userId: { competitionId, userId },
    },
    update: { tasksSolved, totalLength, lastSubmitAt },
    create: { competitionId, userId, tasksSolved, totalLength, lastSubmitAt },
  });

  return { competitionId, tasksSolved, totalLength, lastSubmitAt };
}

/**
 * Обновляет результаты во всех соревнованиях, которые идут прямо сейчас
 * и содержат эту задачу. Вызывается после зачтённой отправки.
 */
export async function syncCompetitionEntriesForTask(
  client: CompetitionsClient,
  params: { userId: string; taskId: string; at?: Date }
): Promise<CompetitionEntryTotals[]> {
  const { userId, taskId } = params;
  const at = params.at ?? new Date();

  const links = await client.competitionTask.findMany({
    where: {
      taskId,
      competition: {
        isActive: true,
        startsAt: { lte: at },
        endsAt: { gte: at },
      },
    },
    select: { competitionId: true },
  });

  const totals: CompetitionEntryTotals[] = [];

  for (const link of links) {
    const result = await recomputeCompetitionEntry(client, {
      competitionId: link.competitionId,
      userId,
    });
    if (result) totals.push(result);
  }

  return totals;
}

/**
 * Место участника в соревновании по тем же правилам, что и лидерборд:
 * больше решённых задач -> меньше суммарная длина -> кто раньше прислал.
 */
export function compareCompetitionEntries(
  a: { tasksSolved: number; totalLength: number; lastSubmitAt: Date | null },
  b: { tasksSolved: number; totalLength: number; lastSubmitAt: Date | null }
): number {
  if (a.tasksSolved !== b.tasksSolved) return b.tasksSolved - a.tasksSolved;
  if (a.totalLength !== b.totalLength) return a.totalLength - b.totalLength;

  const aTime = a.lastSubmitAt ? a.lastSubmitAt.getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.lastSubmitAt ? b.lastSubmitAt.getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
}
