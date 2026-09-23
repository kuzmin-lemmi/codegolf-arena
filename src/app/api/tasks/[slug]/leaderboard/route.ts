// src/app/api/tasks/[slug]/leaderboard/route.ts
// Таблица рекордов задачи на одном языке: ?lang=python|javascript|csharp
// (без параметра — Python). Для вошедшего игрока — ещё и его место (own).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_LANGUAGE, parseLanguage } from '@/lib/languages';
import { getTaskBoard } from '@/lib/task-board';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

    const rawLanguage = searchParams.get('lang');
    const language = rawLanguage === null ? DEFAULT_LANGUAGE : parseLanguage(rawLanguage);
    if (!language) {
      return NextResponse.json({ success: false, error: 'Неизвестный язык' }, { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const currentUser = await getCurrentUser(request);
    const board = await getTaskBoard({ taskId: task.id, language, userId: currentUser?.id, limit });

    return NextResponse.json({
      success: true,
      data: board.entries.map((entry) => ({
        ...entry,
        isCurrentUser: currentUser?.id === entry.userId,
      })),
      own: board.own,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
