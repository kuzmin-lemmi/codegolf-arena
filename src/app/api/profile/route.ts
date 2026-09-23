// src/app/api/profile/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validateMutationRequest } from '@/lib/security';
import { getUserLanguageStats } from '@/lib/ratings';

// Получение профиля
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        id: true,
        stepikUserId: true,
        email: true,
        displayName: true,
        nickname: true,
        avatarUrl: true,
        totalPoints: true,
        nicknameChangedAt: true,
        createdAt: true,
        _count: {
          select: {
            bestSubmissions: true,
            submissions: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Получаем лучшее место пользователя
    const bestRank = await getBestRank(user.id);

    // Решённые задачи: по записи на каждый язык, на котором задача решена
    const solvedTasks = await prisma.bestSubmission.findMany({
      where: { userId: user.id },
      include: {
        task: {
          select: {
            slug: true,
            title: true,
            tier: true,
          },
        },
      },
      orderBy: { achievedAt: 'desc' },
    });

    const languageStats = await getUserLanguageStats(user.id);

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        // Задач, решённых хотя бы на одном языке
        tasksSolved: new Set(solvedTasks.map((bs) => bs.taskId)).size,
        languageStats,
        totalSubmissions: user._count.submissions,
        bestRank,
        charsSaved: solvedTasks.reduce(
          (sum, bs) => sum + Math.max(0, (bs.firstLength ?? bs.codeLength) - bs.codeLength),
          0
        ),
        solvedTasks: solvedTasks.map((bs) => ({
          slug: bs.task.slug,
          title: bs.task.title,
          tier: bs.task.tier,
          language: bs.language,
          length: bs.codeLength,
          firstLength: bs.firstLength,
          improveCount: bs.improveCount,
          achievedAt: bs.achievedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// Обновление ника
export async function PATCH(request: NextRequest) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { nickname } = body;

    // Валидация ника
    if (!nickname || typeof nickname !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Nickname is required' },
        { status: 400 }
      );
    }

    const trimmedNickname = nickname.trim();

    if (trimmedNickname.length < 3 || trimmedNickname.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Nickname must be 3-20 characters' },
        { status: 400 }
      );
    }

    // Проверка на допустимые символы
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9_]+$/.test(trimmedNickname)) {
      return NextResponse.json(
        { success: false, error: 'Nickname can only contain letters, numbers, and underscores' },
        { status: 400 }
      );
    }

    // Проверка на уникальность
    const nicknameKey = trimmedNickname.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        nicknameKey,
        id: { not: currentUser.id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Nickname already taken' },
        { status: 400 }
      );
    }

    // Проверка на частоту смены (раз в 7 дней)
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { nicknameChangedAt: true },
    });

    if (user?.nicknameChangedAt) {
      const daysSinceChange = (Date.now() - user.nicknameChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange < 7) {
        const daysLeft = Math.ceil(7 - daysSinceChange);
        return NextResponse.json(
          { success: false, error: `You can change nickname in ${daysLeft} days` },
          { status: 400 }
        );
      }
    }

    // Обновляем ник
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        nickname: trimmedNickname,
        nicknameKey,
        nicknameChangedAt: new Date(),
      },
      select: {
        id: true,
        nickname: true,
        nicknameChangedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating nickname:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update nickname' },
      { status: 500 }
    );
  }
}

// Вспомогательная функция: лучшее место пользователя в таблицах задач
// (у каждой задачи своя таблица на каждом языке)
async function getBestRank(userId: string): Promise<number | null> {
  // Один запрос вместо N+1: rank по каждой задаче и языку и min(rank) для пользователя
  const rows = await prisma.$queryRaw<Array<{ bestRank: number | null }>>`
    SELECT MIN(rnk) AS "bestRank"
    FROM (
      SELECT
        user_id,
        ROW_NUMBER() OVER (
          PARTITION BY task_id, language
          ORDER BY code_length ASC, achieved_at ASC, user_id ASC
        ) AS rnk
      FROM best_submissions
    ) ranked
    WHERE user_id = ${userId}
  `;

  const bestRank = rows?.[0]?.bestRank;
  if (bestRank === null || bestRank === undefined) return null;
  return Number(bestRank);
}
