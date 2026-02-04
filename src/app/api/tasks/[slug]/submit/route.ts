// src/app/api/tasks/[slug]/submit/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { validateOneliner, calculateCodeLength } from '@/lib/utils';
import { executeCode } from '@/lib/piston';
import { generateTestCode, toPythonLiteral } from '@/lib/python-serializer';
import { getPassPoints } from '@/lib/points';
import { checkRateLimit } from '@/lib/rate-limiter';

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

    // Выполняем тесты
    const testResults = [];
    let allPassed = true;
    const startTime = Date.now();

    for (const testcase of task.testcases) {
      const inputData = JSON.parse(testcase.inputData);
      const args = inputData.args;

      // Формируем код для выполнения
      const wrappedCode = generateTestCode(
        code,
        functionArgs,
        args,
        constraints.allowed_imports || []
      );

      try {
        const result = await executeCode(wrappedCode, constraints.timeout_ms || 2000);
        
        const actualOutput = result.output.trim();
        const expectedOutput = testcase.expectedOutput.trim();
        const passed = actualOutput === expectedOutput;

        if (!passed) allPassed = false;

        testResults.push({
          index: testcase.orderIndex,
          passed,
          isHidden: testcase.isHidden,
          // Показываем детали только для открытых тестов
          ...(testcase.isHidden
            ? {}
            : {
                input: args.map(toPythonLiteral).join(', '),
                expected: expectedOutput,
                actual: actualOutput,
              }),
          error: result.error || null,
        });
      } catch (error: any) {
        allPassed = false;
        testResults.push({
          index: testcase.orderIndex,
          passed: false,
          isHidden: testcase.isHidden,
          error: error.message || 'Execution error',
        });
      }
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
      const submission = await prisma.submission.create({
        data: {
          taskId: task.id,
          userId: currentUser.id,
          code,
          codeLength,
          status,
          testsPassed,
          testsTotal,
          runtimeMs,
        },
      });

      submissionId = submission.id;

      // Если PASS — обновляем best_submission и начисляем очки
      if (allPassed) {
        const existingBest = await prisma.bestSubmission.findUnique({
          where: {
            taskId_userId: {
              taskId: task.id,
              userId: currentUser.id,
            },
          },
        });

        // Обновляем только если это лучший результат
        if (!existingBest || codeLength < existingBest.codeLength) {
          await prisma.bestSubmission.upsert({
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

          isNewBest = true;
        }

        // Вычисляем место
        const betterOrEqual = await prisma.bestSubmission.count({
          where: {
            taskId: task.id,
            OR: [
              { codeLength: { lt: codeLength } },
              {
                codeLength,
                achievedAt: { lt: new Date() },
              },
            ],
          },
        });

        place = betterOrEqual + 1;

        // Начисляем очки только за ПЕРВЫЙ PASS (упрощённая версия для MVP)
        if (!existingBest) {
          pointsEarned = getPassPoints(task.tier);
          pointsBreakdown.push(`PASS (${task.tier}): +${pointsEarned}`);

          // Обновляем totalPoints пользователя
          await prisma.user.update({
            where: { id: currentUser.id },
            data: {
              totalPoints: {
                increment: pointsEarned,
              },
            },
          });
        }
      }
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
          // Показываем детали только для открытых тестов
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
