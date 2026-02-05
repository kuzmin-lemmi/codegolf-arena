// src/app/api/leaderboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

    // Получаем пользователей, отсортированных по очкам
    const users = await prisma.user.findMany({
      where: {
        totalPoints: { gt: 0 }, // Только с очками
      },
      orderBy: {
        totalPoints: 'desc',
      },
      take: limit,
      select: {
        id: true,
        nickname: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true,
        _count: {
          select: {
            bestSubmissions: true,
          },
        },
      },
    });

    const leaderboard = users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      nickname: user.nickname || user.displayName,
      avatarUrl: user.avatarUrl,
      points: user.totalPoints,
      tasksSolved: user._count.bestSubmissions,
    }));

    return NextResponse.json({
      success: true,
      data: leaderboard,
    });
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
