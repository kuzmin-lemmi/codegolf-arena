// src/lib/task-board.ts
// Таблица рекордов задачи на одном языке и место игрока в ней.
// Одна сортировка везде: короче — выше, при равной длине — кто раньше,
// затем по id (как в scoring.ts, чтобы место в ответе на отправку и в
// таблице совпадали).

import { prisma } from '@/lib/db';
import type { Language } from '@/lib/languages';

export interface TaskBoardEntry {
  rank: number;
  userId: string;
  nickname: string;
  profileSlug: string;
  avatarUrl: string | null;
  codeLength: number;
  achievedAt: Date;
}

export interface TaskBoardOwn {
  codeLength: number;
  firstLength: number | null;
  improveCount: number;
  rank: number;
}

export async function getTaskBoard(params: {
  taskId: string;
  language: Language;
  userId?: string | null;
  limit?: number;
}): Promise<{ entries: TaskBoardEntry[]; own: TaskBoardOwn | null }> {
  const { taskId, language, userId } = params;

  const rows = await prisma.bestSubmission.findMany({
    where: { taskId, language },
    orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }, { userId: 'asc' }],
    take: params.limit ?? 50,
    select: {
      userId: true,
      codeLength: true,
      achievedAt: true,
      user: { select: { nickname: true, displayName: true, avatarUrl: true } },
    },
  });

  const entries = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    nickname: row.user.nickname || row.user.displayName,
    profileSlug: row.user.nickname || row.userId,
    avatarUrl: row.user.avatarUrl,
    codeLength: row.codeLength,
    achievedAt: row.achievedAt,
  }));

  if (!userId) return { entries, own: null };

  const best = await prisma.bestSubmission.findUnique({
    where: { taskId_userId_language: { taskId, userId, language } },
    select: { codeLength: true, firstLength: true, improveCount: true, achievedAt: true },
  });
  if (!best) return { entries, own: null };

  const better = await prisma.bestSubmission.count({
    where: {
      taskId,
      language,
      OR: [
        { codeLength: { lt: best.codeLength } },
        { codeLength: best.codeLength, achievedAt: { lt: best.achievedAt } },
        { codeLength: best.codeLength, achievedAt: best.achievedAt, userId: { lt: userId } },
      ],
    },
  });

  return {
    entries,
    own: {
      codeLength: best.codeLength,
      firstLength: best.firstLength,
      improveCount: best.improveCount,
      rank: better + 1,
    },
  };
}
