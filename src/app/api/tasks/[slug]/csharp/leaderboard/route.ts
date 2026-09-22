// src/app/api/tasks/[slug]/csharp/leaderboard/route.ts
// Проба C#: таблица рекордов C# по задаче. Код решений — по тем же правилам,
// что и у Python (api/tasks/[slug]/solutions): только тем, кто сам решил
// задачу на C#, и не во время соревнования или турнира по этой задаче.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { parseCsharpSignature } from '@/lib/csharp';
import { CSHARP_LANGUAGE } from '@/lib/csharp-submission';
import { isCsharpEnabled } from '@/lib/csharp-runner';

export const dynamic = 'force-dynamic';

async function solutionsHiddenReason(taskId: string, mode: string): Promise<string | null> {
  const now = new Date();
  const competition = await prisma.competition.findFirst({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      tasks: { some: { taskId } },
    },
    select: { showSolutions: true },
  });
  if (competition && !competition.showSolutions) {
    return 'Решения временно скрыты во время соревнования';
  }

  if (mode === 'tournament') {
    const challenge = await prisma.weeklyChallenge.findFirst({
      where: { taskId, isActive: true, endsAt: { gt: now } },
      select: { id: true },
    });
    if (challenge) return 'Решения будут доступны после окончания турнира';
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isCsharpEnabled()) {
    return NextResponse.json({ success: false, error: 'C# сейчас выключен' }, { status: 404 });
  }

  try {
    const { slug } = await params;
    const task = await prisma.task.findUnique({
      where: { slug },
      select: { id: true, status: true, mode: true, csharpSignature: true },
    });
    if (!task || task.status !== 'published' || !parseCsharpSignature(task.csharpSignature)) {
      return NextResponse.json({ success: false, error: 'Задача не открыта для C#' }, { status: 404 });
    }

    const currentUser = await getCurrentUser(request);
    const own = currentUser
      ? await prisma.languageBestSubmission.findUnique({
          where: {
            taskId_userId_language: { taskId: task.id, userId: currentUser.id, language: CSHARP_LANGUAGE },
          },
          select: { codeLength: true, achievedAt: true },
        })
      : null;

    let hiddenReason: string | null = own ? await solutionsHiddenReason(task.id, task.mode) : null;
    if (!own) hiddenReason = 'Решите задачу на C#, чтобы увидеть решения других участников';
    const canViewCode = hiddenReason === null;

    const rows = await prisma.languageBestSubmission.findMany({
      where: { taskId: task.id, language: CSHARP_LANGUAGE },
      orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }, { userId: 'asc' }],
      take: 50,
      select: {
        userId: true,
        codeLength: true,
        achievedAt: true,
        user: { select: { nickname: true, displayName: true, avatarUrl: true } },
        submission: { select: { code: true } },
      },
    });

    let ownRank: number | null = null;
    if (own && currentUser) {
      const better = await prisma.languageBestSubmission.count({
        where: {
          taskId: task.id,
          language: CSHARP_LANGUAGE,
          OR: [
            { codeLength: { lt: own.codeLength } },
            { codeLength: own.codeLength, achievedAt: { lt: own.achievedAt } },
            { codeLength: own.codeLength, achievedAt: own.achievedAt, userId: { lt: currentUser.id } },
          ],
        },
      });
      ownRank = better + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: rows.map((row, index) => ({
          rank: index + 1,
          nickname: row.user.nickname || row.user.displayName,
          profileSlug: row.user.nickname || row.userId,
          avatarUrl: row.user.avatarUrl,
          codeLength: row.codeLength,
          achievedAt: row.achievedAt,
          isCurrentUser: currentUser?.id === row.userId,
          code: canViewCode ? row.submission.code : null,
        })),
        own: own ? { codeLength: own.codeLength, rank: ownRank } : null,
        canViewCode,
        hiddenReason,
      },
    });
  } catch (error) {
    console.error('Error fetching C# leaderboard:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
