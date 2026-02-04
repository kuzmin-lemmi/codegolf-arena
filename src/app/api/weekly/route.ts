// src/app/api/weekly/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Получаем активную задачу недели
    const weeklyChallenge = await prisma.weeklyChallenge.findFirst({
      where: {
        isActive: true,
      },
      include: {
        task: {
          select: {
            id: true,
            slug: true,
            title: true,
            tier: true,
            functionSignature: true,
            statementMd: true,
            exampleInput: true,
            exampleOutput: true,
            constraintsJson: true,
          },
        },
      },
    });

    if (!weeklyChallenge) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    // Получаем топ-10 по этой задаче
    const leaderboard = await prisma.bestSubmission.findMany({
      where: { taskId: weeklyChallenge.taskId },
      orderBy: [
        { codeLength: 'asc' },
        { achievedAt: 'asc' },
      ],
      take: 10,
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

    return NextResponse.json({
      success: true,
      data: {
        id: weeklyChallenge.id,
        task: {
          ...weeklyChallenge.task,
          constraintsJson: JSON.parse(weeklyChallenge.task.constraintsJson),
        },
        startsAt: weeklyChallenge.startsAt,
        endsAt: weeklyChallenge.endsAt,
        leaderboard: leaderboard.map((bs, index) => ({
          rank: index + 1,
          userId: bs.user.id,
          nickname: bs.user.nickname || bs.user.displayName,
          avatarUrl: bs.user.avatarUrl,
          codeLength: bs.codeLength,
          achievedAt: bs.achievedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching weekly challenge:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weekly challenge' },
      { status: 500 }
    );
  }
}
