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

    const bestRows = await prisma.$queryRaw<
      Array<{ taskId: string; codeLength: bigint; nickname: string | null; displayName: string }>
    >`
      SELECT ranked.task_id AS taskId,
             ranked.code_length AS codeLength,
             u.nickname AS nickname,
             u.display_name AS displayName
      FROM (
        SELECT
          task_id,
          user_id,
          code_length,
          ROW_NUMBER() OVER (
            PARTITION BY task_id
            ORDER BY code_length ASC, achieved_at ASC, user_id ASC
          ) AS rnk
        FROM best_submissions
      ) ranked
      JOIN users u ON u.id = ranked.user_id
      WHERE ranked.rnk = 1
    `;

    const bestByTask = new Map(
      bestRows.map((row) => [
        row.taskId,
        {
          length: Number(row.codeLength),
          nickname: row.nickname || row.displayName,
        },
      ])
    );

    const tasksWithBest = tasks.map((task) => ({
      ...task,
      constraintsJson: JSON.parse(task.constraintsJson),
      participantsCount: task._count.bestSubmissions,
      bestSolution: bestByTask.get(task.id) || null,
    }));

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
