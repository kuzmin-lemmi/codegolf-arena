// src/app/api/tasks/[slug]/solutions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Получаем текущего пользователя
    const currentUser = await getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Находим задачу
    const task = await prisma.task.findUnique({
      where: { slug: params.slug },
      select: { 
        id: true, 
        status: true, 
        mode: true,
      },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Проверяем, решил ли пользователь эту задачу
    const userBestSubmission = await prisma.bestSubmission.findUnique({
      where: {
        taskId_userId: {
          taskId: task.id,
          userId: currentUser.id,
        },
      },
    });

    // Если пользователь не решил задачу — решения скрыты
    if (!userBestSubmission) {
      return NextResponse.json({
        success: true,
        data: {
          canView: false,
          message: 'Решите задачу, чтобы увидеть решения других участников',
          solutions: [],
        },
      });
    }

    // Если задача в активном соревновании — решения могут быть скрыты
    const now = new Date();
    const activeCompetition = await prisma.competition.findFirst({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        tasks: {
          some: { taskId: task.id },
        },
      },
      select: { id: true, showSolutions: true },
    });

    if (activeCompetition && !activeCompetition.showSolutions) {
      return NextResponse.json({
        success: true,
        data: {
          canView: false,
          message: 'Решения временно скрыты во время соревнования',
          solutions: [],
        },
      });
    }

    // Для турнирных задач проверяем дедлайн
    if (task.mode === 'tournament') {
      const activeChallenge = await prisma.weeklyChallenge.findFirst({
        where: {
          taskId: task.id,
          isActive: true,
          endsAt: { gt: new Date() }, // Ещё не закончился
        },
      });

      if (activeChallenge) {
        return NextResponse.json({
          success: true,
          data: {
            canView: false,
            message: 'Решения будут доступны после окончания турнира',
            solutions: [],
          },
        });
      }
    }

    // Получаем топ-20 решений
    const bestSubmissions = await prisma.bestSubmission.findMany({
      where: { taskId: task.id },
      orderBy: [
        { codeLength: 'asc' },
        { achievedAt: 'asc' },
      ],
      take: 20,
      include: {
        user: {
          select: {
            nickname: true,
            displayName: true,
          },
        },
        submission: {
          select: {
            code: true,
          },
        },
      },
    });

    const solutions = bestSubmissions.map((bs, index) => ({
      rank: index + 1,
      nickname: bs.user.nickname || bs.user.displayName,
      code: bs.submission.code,
      codeLength: bs.codeLength,
      achievedAt: bs.achievedAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        canView: true,
        solutions,
      },
    });
  } catch (error) {
    console.error('Error fetching solutions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch solutions' },
      { status: 500 }
    );
  }
}
