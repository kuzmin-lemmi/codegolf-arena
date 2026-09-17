// src/app/api/tasks/[slug]/submissions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const MAX_ATTEMPTS = 30;
const MAX_PASSES_FOR_HISTORY = 500;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const task = await prisma.task.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const [submissions, passes, totals] = await Promise.all([
      prisma.submission.findMany({
        where: {
          taskId: task.id,
          userId: currentUser.id,
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ATTEMPTS,
        select: {
          id: true,
          status: true,
          codeLength: true,
          testsPassed: true,
          testsTotal: true,
          runtimeMs: true,
          errorMsg: true,
          createdAt: true,
        },
      }),
      // Зачтённые попытки по порядку: из них собираем цепочку личных рекордов
      prisma.submission.findMany({
        where: {
          taskId: task.id,
          userId: currentUser.id,
          status: 'pass',
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_PASSES_FOR_HISTORY,
        select: {
          id: true,
          codeLength: true,
          createdAt: true,
        },
      }),
      prisma.submission.count({
        where: { taskId: task.id, userId: currentUser.id },
      }),
    ]);

    // «Было 47 -> 38 -> 31»: оставляем только те попытки, которые улучшали рекорд
    const records: Array<{
      submissionId: string;
      codeLength: number;
      createdAt: Date;
      savedChars: number | null;
    }> = [];

    let runningBest: number | null = null;
    for (const pass of passes) {
      if (runningBest === null || pass.codeLength < runningBest) {
        records.push({
          submissionId: pass.id,
          codeLength: pass.codeLength,
          createdAt: pass.createdAt,
          savedChars: runningBest === null ? null : runningBest - pass.codeLength,
        });
        runningBest = pass.codeLength;
      }
    }

    const firstLength = records.length > 0 ? records[0].codeLength : null;
    const bestLength = records.length > 0 ? records[records.length - 1].codeLength : null;

    return NextResponse.json({
      success: true,
      data: {
        attempts: submissions.map((submission) => ({
          id: submission.id,
          status: submission.status,
          codeLength: submission.codeLength,
          testsPassed: submission.testsPassed,
          testsTotal: submission.testsTotal,
          runtimeMs: submission.runtimeMs,
          errorMessage: submission.errorMsg,
          createdAt: submission.createdAt,
        })),
        records,
        stats: {
          attemptsTotal: totals,
          passesTotal: passes.length,
          firstLength,
          bestLength,
          // Сколько символов срезано с первого зачтённого решения
          totalSaved:
            firstLength !== null && bestLength !== null ? firstLength - bestLength : 0,
          improvements: Math.max(0, records.length - 1),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching submission history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submission history' },
      { status: 500 }
    );
  }
}
