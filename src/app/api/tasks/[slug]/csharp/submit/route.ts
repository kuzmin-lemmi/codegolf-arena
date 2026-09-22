// src/app/api/tasks/[slug]/csharp/submit/route.ts
// Проба C#: отправка в рейтинг C#. Ставит задание в ту же очередь проверок,
// что и Python; статус опрашивается общим GET /api/tasks/[slug]/submit?jobId=

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { parseCsharpSignature, validateCsharpExpression } from '@/lib/csharp';
import { isCsharpEnabled } from '@/lib/csharp-runner';
import { checkRateLimit, checkSubmitIpRateLimit, getClientIP } from '@/lib/rate-limiter';
import { enqueueTaskSubmissionJob, SubmissionJobsOverflowError } from '@/lib/submission-jobs';
import { validateMutationRequest } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const csrfError = validateMutationRequest(request);
  if (csrfError) return csrfError;

  if (!isCsharpEnabled()) {
    return NextResponse.json({ success: false, error: 'C# сейчас выключен' }, { status: 404 });
  }

  try {
    const ipLimit = await checkSubmitIpRateLimit(getClientIP(request));
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком много отправок с этого IP. Повторите через ${ipLimit.retryAfter} сек.`,
          retryAfter: ipLimit.retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } }
      );
    }

    const { slug } = await params;
    const body = await request.json().catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'Code is required' }, { status: 400 });
    }

    const validation = validateCsharpExpression(code);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Войдите, чтобы отправить решение в рейтинг' },
        { status: 401 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { slug },
      select: { id: true, status: true, csharpSignature: true },
    });
    if (!task || task.status !== 'published' || !parseCsharpSignature(task.csharpSignature)) {
      return NextResponse.json({ success: false, error: 'Задача не открыта для C#' }, { status: 404 });
    }

    // Общий с Python лимит на пару «игрок + задача»
    const limit = await checkRateLimit(currentUser.id, task.id);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Слишком много запросов. Попробуйте через ${limit.retryAfter} сек.`,
          retryAfter: limit.retryAfter,
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    const codeHash = createHash('sha256').update(`${task.id}:csharp:${code}`).digest('hex');

    try {
      const jobId = await enqueueTaskSubmissionJob({
        userId: currentUser.id,
        taskSlug: slug,
        dedupKey: `${currentUser.id}:${task.id}:csharp:${codeHash}`,
        payload: { userId: currentUser.id, taskSlug: slug, code, language: 'csharp' },
      });

      return NextResponse.json({ success: true, queued: true, jobId, status: 'queued' }, { status: 202 });
    } catch (error) {
      if (error instanceof SubmissionJobsOverflowError) {
        return NextResponse.json({ success: false, error: 'Server overloaded, try later' }, { status: 503 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error submitting C# solution:', error);
    return NextResponse.json({ success: false, error: 'Failed to submit solution' }, { status: 500 });
  }
}
