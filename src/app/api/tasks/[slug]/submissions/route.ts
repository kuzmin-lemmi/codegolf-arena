import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

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

    const submissions = await prisma.submission.findMany({
      where: {
        taskId: task.id,
        userId: currentUser.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
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
    });

    return NextResponse.json({
      success: true,
      data: submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        codeLength: submission.codeLength,
        testsPassed: submission.testsPassed,
        testsTotal: submission.testsTotal,
        runtimeMs: submission.runtimeMs,
        errorMessage: submission.errorMsg,
        createdAt: submission.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching submission history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch submission history' },
      { status: 500 }
    );
  }
}
