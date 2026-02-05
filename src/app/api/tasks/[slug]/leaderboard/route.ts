// src/app/api/tasks/[slug]/leaderboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

    // Находим задачу
    const task = await prisma.task.findUnique({
      where: { slug: params.slug },
      select: { id: true, status: true },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Получаем лучшие решения
    const bestSubmissions = await prisma.bestSubmission.findMany({
      where: { taskId: task.id },
      orderBy: [
        { codeLength: 'asc' },
        { achievedAt: 'asc' },
      ],
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Формируем лидерборд с рангами
    const leaderboard = bestSubmissions.map((bs, index) => ({
      rank: index + 1,
      userId: bs.user.id,
      nickname: bs.user.nickname || bs.user.displayName,
      avatarUrl: bs.user.avatarUrl,
      codeLength: bs.codeLength,
      achievedAt: bs.achievedAt,
    }));

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
