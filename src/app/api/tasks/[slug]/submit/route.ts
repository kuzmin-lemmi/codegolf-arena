// src/app/api/tasks/[slug]/submit/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validateOneliner, calculateCodeLength } from '@/lib/utils';
import { executeCode } from '@/lib/piston';
import { generateTestCode, toPythonLiteral } from '@/lib/python-serializer';
import { getPassPoints } from '@/lib/points';
import { checkRateLimit } from '@/lib/rate-limiter';
import { enqueueSubmit, SubmitQueueOverflowError } from '@/lib/submit-queue';
import type { TaskTier } from '@/types';

const OUTPUT_LIMIT_BYTES = 50 * 1024;
const TOTAL_TIMEOUT_MS = 10_000;

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Получаем текущего пользователя (может быть null для гостя)
    const currentUser = await getCurrentUser(request);

    // Получаем код из запроса
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Code is required' },
        { status: 400 }
      );
    }

    // Валидация однострочника
    const validation = validateOneliner(code);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Войдите, чтобы отправить решение в рейтинг' },
        { status: 401 }
      );
    }

    // Находим задачу с тестами
    const task = await prisma.task.findUnique({
      where: { slug: params.slug },
      include: {
        testcases: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!task || task.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Проверяем rate limit (10 сабмитов/мин/пользователь/задача)
    const rateLimitKey = currentUser.id;
    const rateLimitResult = checkRateLimit(rateLimitKey, task.id);
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

    const runSubmission = async () => {
      const codeLength = calculateCodeLength(code);
      const constraints = JSON.parse(task.constraintsJson);
      const functionArgs = JSON.parse(task.functionArgs);

      // Проверка на запрещённые токены
      for (const token of constraints.forbidden_tokens || []) {
        if (code.includes(token)) {
          return NextResponse.json(
            { success: false, error: `Запрещённый токен: ${token}` },
            { status: 400 }
          );
        }
      }

      const testResults: Array<{
        index: number;
        passed: boolean;
        isHidden: boolean;
        input?: string;
        expected?: string;
        actual?: string;
        error?: string | null;
      }> = [];

      let allPassed = true;
      let outputBytes = 0;
      let timeLimitExceeded = false;
      let outputLimitExceeded = false;
      let submissionError: string | null = null;

      const startTime = Date.now();
      const deadline = startTime + TOTAL_TIMEOUT_MS;

      for (const testcase of task.testcases) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          timeLimitExceeded = true;
          allPassed = false;
          submissionError = 'Time limit exceeded';
          testResults.push({
            index: testcase.orderIndex,
            passed: false,
            isHidden: testcase.isHidden,
            error: 'Time limit exceeded',
          });
          break;
        }

        const inputData = JSON.parse(testcase.inputData);
        const args = inputData.args;

        const wrappedCode = generateTestCode(
          code,
          functionArgs,
          args,
          constraints.allowed_imports || []
        );

        const perTestTimeout = Math.min(constraints.timeout_ms || 2000, remainingMs);
        const signal = AbortSignal.timeout(perTestTimeout);

        const result = await executeCode(wrappedCode, perTestTimeout, signal);

        const stdoutBytes = Buffer.byteLength(result.stdout || '', 'utf8');
        const stderrBytes = Buffer.byteLength(result.stderr || '', 'utf8');
        outputBytes += stdoutBytes + stderrBytes;

        if (outputBytes > OUTPUT_LIMIT_BYTES) {
          outputLimitExceeded = true;
          allPassed = false;
          submissionError = 'Output limit exceeded';
          testResults.push({
            index: testcase.orderIndex,
            passed: false,
            isHidden: testcase.isHidden,
            error: 'Output limit exceeded',
          });
          break;
        }

        if (result.error && /aborted/i.test(result.error)) {
          timeLimitExceeded = true;
          allPassed = false;
          submissionError = 'Time limit exceeded';
          testResults.push({
            index: testcase.orderIndex,
            passed: false,
            isHidden: testcase.isHidden,
            error: 'Time limit exceeded',
          });
          break;
        }

        const actualOutput = result.output.trim();
        const expectedOutput = testcase.expectedOutput.trim();
        const passed = actualOutput === expectedOutput;

        if (!passed) allPassed = false;
        if (!passed && !submissionError && result.error) {
          submissionError = result.error;
        }

        testResults.push({
          index: testcase.orderIndex,
          passed,
          isHidden: testcase.isHidden,
          ...(testcase.isHidden
            ? {}
            : {
                input: args.map(toPythonLiteral).join(', '),
                expected: expectedOutput,
                actual: actualOutput,
              }),
          error: result.error || null,
        });
      }

      if (timeLimitExceeded && !submissionError) {
        submissionError = 'Time limit exceeded';
      }
      if (outputLimitExceeded && !submissionError) {
        submissionError = 'Output limit exceeded';
      }

      const runtimeMs = Date.now() - startTime;
      const testsPassed = testResults.filter((t) => t.passed).length;
      const testsTotal = testResults.length;
      const status = allPassed ? 'pass' : 'fail';

      let submissionId: string | null = null;
      let place: number | null = null;
      let isNewBest = false;
      let pointsEarned = 0;
      let pointsBreakdown: string[] = [];

      if (currentUser) {
        const transactionResult = await prisma.$transaction(async (tx) => {
          const submission = await tx.submission.create({
            data: {
              taskId: task.id,
              userId: currentUser.id,
              code,
              codeLength,
              status,
              testsPassed,
              testsTotal,
              runtimeMs,
              errorMsg: submissionError,
            },
          });

          let txIsNewBest = false;
          let txPointsEarned = 0;
          let txPointsBreakdown: string[] = [];
          let txPlace: number | null = null;

          if (allPassed) {
            const existingBest = await tx.bestSubmission.findUnique({
              where: {
                taskId_userId: {
                  taskId: task.id,
                  userId: currentUser.id,
                },
              },
            });

            if (!existingBest || codeLength < existingBest.codeLength) {
              await tx.bestSubmission.upsert({
                where: {
                  taskId_userId: {
                    taskId: task.id,
                    userId: currentUser.id,
                  },
                },
                update: {
                  submissionId: submission.id,
                  codeLength,
                  achievedAt: new Date(),
                },
                create: {
                  taskId: task.id,
                  userId: currentUser.id,
                  submissionId: submission.id,
                  codeLength,
                  achievedAt: new Date(),
                },
              });

              txIsNewBest = true;
            }

            const ranks = await tx.$queryRaw<Array<{ place: number }>>`
              SELECT rnk AS place
              FROM (
                SELECT
                  task_id,
                  user_id,
                  ROW_NUMBER() OVER (
                    PARTITION BY task_id
                    ORDER BY code_length ASC, achieved_at ASC, user_id ASC
                  ) AS rnk
                FROM best_submissions
              ) ranked
              WHERE task_id = ${task.id} AND user_id = ${currentUser.id}
            `;

            txPlace = ranks?.[0]?.place ?? null;

            if (!existingBest) {
              txPointsEarned = getPassPoints(task.tier as TaskTier);
              txPointsBreakdown.push(`PASS (${task.tier}): +${txPointsEarned}`);

              await tx.user.update({
                where: { id: currentUser.id },
                data: {
                  totalPoints: {
                    increment: txPointsEarned,
                  },
                },
              });
            }
          }

          return {
            submissionId: submission.id,
            isNewBest: txIsNewBest,
            pointsEarned: txPointsEarned,
            pointsBreakdown: txPointsBreakdown,
            place: txPlace,
          };
        });

        submissionId = transactionResult.submissionId;
        isNewBest = transactionResult.isNewBest;
        pointsEarned = transactionResult.pointsEarned;
        pointsBreakdown = transactionResult.pointsBreakdown;
        place = transactionResult.place;
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            submissionId,
            status,
            length: codeLength,
            testsPassed,
            testsTotal,
            place,
            isNewBest,
            pointsEarned,
            pointsBreakdown,
            details: testResults
              .filter((t) => !t.isHidden)
              .map(({ isHidden, ...rest }) => rest),
          },
        },
        {
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': String(rateLimitResult.remaining || 0),
          },
        }
      );
    };

    try {
      return await enqueueSubmit(runSubmission);
    } catch (error) {
      if (error instanceof SubmitQueueOverflowError) {
        return NextResponse.json(
          { success: false, error: 'Server overloaded, try later' },
          { status: 503 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error submitting solution:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit solution' },
      { status: 500 }
    );
  }
}

function getAnonRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = request.ip || forwarded?.split(',')[0]?.trim() || realIp || 'anonymous';
  return `anon:${ip}`;
}

// wrapCode удалён: используем generateTestCode из python-serializer
