// src/app/api/tasks/[slug]/solutions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_LANGUAGE, LANGUAGE_LABELS, parseLanguage } from '@/lib/languages';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Решения — одного языка: ?lang=javascript. Без параметра — Python
    const rawLanguage = request.nextUrl.searchParams.get('lang');
    const language = rawLanguage === null ? DEFAULT_LANGUAGE : parseLanguage(rawLanguage);
    if (!language) {
      return NextResponse.json({ success: false, error: 'Неизвестный язык' }, { status: 400 });
    }

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
      where: { slug },
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

    // Решения на языке видны тому, кто сам решил задачу на этом языке
    const userBestSubmission = await prisma.bestSubmission.findUnique({
      where: {
        taskId_userId_language: {
          taskId: task.id,
          userId: currentUser.id,
          language,
        },
      },
      select: { id: true },
    });

    if (!userBestSubmission) {
      return NextResponse.json({
        success: true,
        data: {
          canView: false,
          message:
            language === 'python'
              ? 'Решите задачу, чтобы увидеть решения других участников'
              : `Решите задачу на ${LANGUAGE_LABELS[language]}, чтобы увидеть решения других участников`,
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
      where: { taskId: task.id, language },
      orderBy: [
        { codeLength: 'asc' },
        { achievedAt: 'asc' },
        { userId: 'asc' },
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
