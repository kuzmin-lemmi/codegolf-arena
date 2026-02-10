import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validateOneliner } from '@/lib/utils';
import { checkRateLimit, checkSubmitStatusRateLimit } from '@/lib/rate-limiter';
import {
  enqueueTaskSubmissionJob,
  getSubmissionJob,
  SubmissionJobsOverflowError,
} from '@/lib/submission-jobs';
import { validateMutationRequest } from '@/lib/security';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
    }

    const pollRateLimit = await checkSubmitStatusRateLimit(currentUser.id, slug);
    if (!pollRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком частый опрос статуса. Попробуйте через ${pollRateLimit.retryAfter} сек.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(pollRateLimit.retryAfter),
          },
        }
      );
    }

    const job = await getSubmissionJob(jobId, currentUser.id, slug);
    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (job.status === 'done') {
      return NextResponse.json({ success: true, status: 'done', data: job.result });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: true,
        status: 'failed',
        error: job.error || 'Submission failed',
      });
    }

    return NextResponse.json({ success: true, status: job.status });
  } catch (error) {
    console.error('Error getting submit job status:', error);
    return NextResponse.json({ success: false, error: 'Failed to get job status' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  try {
    const { slug } = await params;

    const currentUser = await getCurrentUser(request);
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'Code is required' }, { status: 400 });
    }

    const validation = validateOneliner(code);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Войдите, чтобы отправить решение в рейтинг' },
        { status: 401 }
      );
    }

    const userStatus = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { email: true, emailVerified: true },
    });

    if (userStatus?.email && !userStatus.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Подтвердите email перед отправкой решений в рейтинг',
        },
        { status: 403 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { slug },
      select: { id: true, constraintsJson: true, status: true },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const rateLimitResult = await checkRateLimit(currentUser.id, task.id);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком много запросов. Попробуйте через ${rateLimitResult.retryAfter} сек.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(
              Math.floor(Date.now() / 1000) + (rateLimitResult.retryAfter || 60)
            ),
          },
        }
      );
    }

    const constraints = JSON.parse(task.constraintsJson);
    for (const token of constraints.forbidden_tokens || []) {
      if (code.includes(token)) {
        return NextResponse.json(
          { success: false, error: `Запрещённый токен: ${token}` },
          { status: 400 }
        );
      }
    }

    const codeHash = createHash('sha256').update(`${task.id}:${code}`).digest('hex');
    const dedupKey = `${currentUser.id}:${task.id}:${codeHash}`;

    try {
      const jobId = await enqueueTaskSubmissionJob({
        userId: currentUser.id,
        taskSlug: slug,
        dedupKey,
        payload: {
          userId: currentUser.id,
          taskSlug: slug,
          code,
        },
      });

      return NextResponse.json(
        {
          success: true,
          queued: true,
          jobId,
          status: 'queued',
        },
        {
          status: 202,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': String(rateLimitResult.remaining || 0),
          },
        }
      );
    } catch (error) {
      if (error instanceof SubmissionJobsOverflowError) {
        return NextResponse.json(
          { success: false, error: 'Server overloaded, try later' },
          { status: 503 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error submitting solution:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit solution' }, { status: 500 });
  }
}
