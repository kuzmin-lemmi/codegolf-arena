// src/app/api/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get('tier');
    const mode = searchParams.get('mode');
    const search = searchParams.get('search');

    const where: any = {
      status: 'published',
    };

    if (tier && tier !== 'all') {
      where.tier = tier;
    }

    if (mode && mode !== 'all') {
      where.mode = mode;
    }

    if (search) {
      where.title = {
        contains: search,
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        tier: true,
        mode: true,
        functionSignature: true,
        statementMd: true,
        exampleInput: true,
        exampleOutput: true,
        constraintsJson: true,
        createdAt: true,
        _count: {
          select: {
            bestSubmissions: true,
          },
        },
      },
      orderBy: [
        { tier: 'asc' }, // bronze -> silver -> gold
        { createdAt: 'desc' },
      ],
    });

    // Получаем лучший результат по каждой задаче
    const tasksWithBest = await Promise.all(
      tasks.map(async (task) => {
        const bestSubmission = await prisma.bestSubmission.findFirst({
          where: { taskId: task.id },
          orderBy: [
            { codeLength: 'asc' },
            { achievedAt: 'asc' },
          ],
          select: {
            codeLength: true,
            user: {
              select: { nickname: true, displayName: true },
            },
          },
        });

        return {
          ...task,
          constraintsJson: JSON.parse(task.constraintsJson),
          participantsCount: task._count.bestSubmissions,
          bestSolution: bestSubmission
            ? {
                length: bestSubmission.codeLength,
                nickname: bestSubmission.user.nickname || bestSubmission.user.displayName,
              }
            : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tasksWithBest,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}
