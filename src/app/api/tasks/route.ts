// src/app/api/tasks/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeTaskTopics } from '@/lib/task-topics';
import { getTaskLanguages } from '@/lib/language-settings';

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
        csharpSignature: true,
        createdAt: true,
      },
      orderBy: [
        { tier: 'asc' }, // bronze -> silver -> gold
        { createdAt: 'desc' },
      ],
    });

    // Лидер каждой задачи — отдельно на каждом языке
    const bestRows = await prisma.$queryRaw<
      Array<{ taskId: string; language: string; codeLength: bigint; nickname: string | null; displayName: string }>
    >`
      SELECT ranked.task_id AS "taskId",
             ranked.language AS "language",
             ranked.code_length AS "codeLength",
             u.nickname AS "nickname",
             u.display_name AS "displayName"
      FROM (
        SELECT
          task_id,
          user_id,
          language,
          code_length,
          ROW_NUMBER() OVER (
            PARTITION BY task_id, language
            ORDER BY code_length ASC, achieved_at ASC, user_id ASC
          ) AS rnk
        FROM best_submissions
      ) ranked
      JOIN users u ON u.id = ranked.user_id
      WHERE ranked.rnk = 1
    `;

    const participantRows = await prisma.$queryRaw<Array<{ taskId: string; participants: bigint }>>`
      SELECT task_id AS "taskId", COUNT(DISTINCT user_id) AS "participants"
      FROM best_submissions
      GROUP BY task_id
    `;
    const participantsByTask = new Map(participantRows.map((row) => [row.taskId, Number(row.participants)]));

    const bestByTask = new Map<string, Record<string, { length: number; nickname: string }>>();
    for (const row of bestRows) {
      const bests = bestByTask.get(row.taskId) ?? {};
      bests[row.language] = { length: Number(row.codeLength), nickname: row.nickname || row.displayName };
      bestByTask.set(row.taskId, bests);
    }

    const tasksWithBest = tasks.map(({ csharpSignature, ...task }) => {
      const parsedConstraints = JSON.parse(task.constraintsJson);
      const bests = bestByTask.get(task.id) ?? {};

      return {
        ...task,
        languages: getTaskLanguages({ csharpSignature }),
        constraintsJson: parsedConstraints,
        topics: Array.isArray(parsedConstraints?.topics)
          ? normalizeTaskTopics(parsedConstraints.topics, 8)
          : [],
        participantsCount: participantsByTask.get(task.id) ?? 0,
        // Лидер на Python — как раньше; по всем языкам — в bestSolutions
        bestSolution: bests.python || null,
        bestSolutions: bests,
      };
    });

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
