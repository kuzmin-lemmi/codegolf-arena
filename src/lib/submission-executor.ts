import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { calculateCodeLength, validateOneliner } from '@/lib/utils';
import { executeCode } from '@/lib/piston';
import { generateBatchTestCode, toPythonLiteral } from '@/lib/python-serializer';
import { getPassPoints } from '@/lib/points';
import type { TaskTier } from '@/types';
import type { SubmissionResponseData, TaskSubmitPayload } from '@/lib/submission-types';

const OUTPUT_LIMIT_BYTES = 50 * 1024;
const TOTAL_TIMEOUT_MS = 10_000;

interface BatchExecutionResultItem {
  index: number;
  passed: boolean;
  isHidden: boolean;
  actual?: string | null;
  expected?: string | null;
  error?: string | null;
}

export async function runTaskSubmission(payload: TaskSubmitPayload): Promise<SubmissionResponseData> {
  const { userId, taskSlug, code } = payload;

  const validation = validateOneliner(code);
  if (!validation.valid) {
    return {
      submissionId: null,
      status: 'error',
      length: calculateCodeLength(code),
      testsPassed: 0,
      testsTotal: 0,
      place: null,
      isNewBest: false,
      pointsEarned: 0,
      pointsBreakdown: [],
      errorMessage: validation.error || 'Invalid code',
      details: [],
    };
  }

  const task = await prisma.task.findUnique({
    where: { slug: taskSlug },
    include: {
      testcases: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (!task || task.status !== 'published') {
    return {
      submissionId: null,
      status: 'error',
      length: calculateCodeLength(code),
      testsPassed: 0,
      testsTotal: 0,
      place: null,
      isNewBest: false,
      pointsEarned: 0,
      pointsBreakdown: [],
      errorMessage: 'Task not found',
      details: [],
    };
  }

  const constraints = JSON.parse(task.constraintsJson);
  const functionArgs = JSON.parse(task.functionArgs);
  const codeLength = calculateCodeLength(code);

  for (const token of constraints.forbidden_tokens || []) {
    if (code.includes(token)) {
      return {
        submissionId: null,
        status: 'error',
        length: codeLength,
        testsPassed: 0,
        testsTotal: task.testcases.length,
        place: null,
        isNewBest: false,
        pointsEarned: 0,
        pointsBreakdown: [],
        errorMessage: `Запрещённый токен: ${token}`,
        details: [],
      };
    }
  }

  const startTime = Date.now();
  const marker = randomBytes(16).toString('hex');
  const batchTestcases = task.testcases.map((testcase) => {
    const inputData = JSON.parse(testcase.inputData);
    return {
      index: testcase.orderIndex,
      args: Array.isArray(inputData.args) ? inputData.args : [],
      expectedOutput: testcase.expectedOutput,
      isHidden: testcase.isHidden,
    };
  });

  const wrappedCode = generateBatchTestCode(
    code,
    functionArgs,
    batchTestcases,
    constraints.allowed_imports || [],
    marker
  );

  const runTimeout = Math.min(
    TOTAL_TIMEOUT_MS,
    Math.max((constraints.timeout_ms || 2000) * Math.max(batchTestcases.length, 1), 1000)
  );

  const signal = AbortSignal.timeout(runTimeout);
  const result = await executeCode(wrappedCode, runTimeout, signal);

  const outputBytes =
    Buffer.byteLength(result.stdout || '', 'utf8') + Buffer.byteLength(result.stderr || '', 'utf8');

  let status: 'pass' | 'fail' | 'error' = 'fail';
  let submissionError: string | null = null;

  const parsedResults = parseBatchResults(result.output, marker);
  const testResults = parsedResults.map((item) => {
    const source = batchTestcases.find((t) => t.index === item.index);
    const input = source?.isHidden ? undefined : (source?.args || []).map(toPythonLiteral).join(', ');
    return {
      index: item.index,
      passed: item.passed,
      isHidden: item.isHidden,
      input,
      expected: item.isHidden ? undefined : item.expected ?? undefined,
      actual: item.isHidden ? undefined : item.actual ?? undefined,
      error: item.error || null,
    };
  });

  if (outputBytes > OUTPUT_LIMIT_BYTES) {
    status = 'fail';
    submissionError = 'Output limit exceeded';
  } else if (result.errorKind === 'infra' || result.errorKind === 'timeout') {
    status = 'error';
    submissionError = result.error || 'Runner temporarily unavailable';
  } else if (!parsedResults.length) {
    status = result.error ? 'fail' : 'error';
    submissionError = result.error || 'Runner output parse error';
  } else {
    const allPassed = parsedResults.every((r) => r.passed);
    status = allPassed ? 'pass' : 'fail';
    if (!allPassed) {
      const failed = parsedResults.find((r) => !r.passed);
      submissionError = failed?.error || result.error || null;
    }
  }

  const runtimeMs = Date.now() - startTime;
  const testsPassed = testResults.filter((t) => t.passed).length;
  const testsTotal = batchTestcases.length;

  const transactionResult = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.create({
      data: {
        taskId: task.id,
        userId,
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
    const txPointsBreakdown: string[] = [];
    let txPlace: number | null = null;
    let awardedFirstPassPoints = false;

    if (status === 'pass') {
      const existingBest = await tx.bestSubmission.findUnique({
        where: {
          taskId_userId: {
            taskId: task.id,
            userId,
          },
        },
        select: {
          codeLength: true,
        },
      });

      let currentBestLength: number | null = existingBest?.codeLength ?? null;

      if (currentBestLength === null) {
        try {
          await tx.bestSubmission.create({
            data: {
              taskId: task.id,
              userId,
              submissionId: submission.id,
              codeLength,
              achievedAt: new Date(),
            },
          });

          currentBestLength = codeLength;
          txIsNewBest = true;
          awardedFirstPassPoints = true;
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== 'P2002'
          ) {
            throw error;
          }

          const racedBest = await tx.bestSubmission.findUnique({
            where: {
              taskId_userId: {
                taskId: task.id,
                userId,
              },
            },
            select: {
              codeLength: true,
            },
          });
          currentBestLength = racedBest?.codeLength ?? null;
        }
      }

      if (currentBestLength !== null && codeLength < currentBestLength) {
        await tx.bestSubmission.update({
          where: {
            taskId_userId: {
              taskId: task.id,
              userId,
            },
          },
          data: {
            submissionId: submission.id,
            codeLength,
            achievedAt: new Date(),
          },
        });
        txIsNewBest = true;
      }

      const ranks = await tx.$queryRaw<Array<{ place: bigint }>>`
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
        WHERE task_id = ${task.id} AND user_id = ${userId}
      `;

      const rawPlace = ranks?.[0]?.place;
      txPlace = rawPlace === undefined || rawPlace === null ? null : Number(rawPlace);

      if (awardedFirstPassPoints) {
        txPointsEarned = getPassPoints(task.tier as TaskTier);
        txPointsBreakdown.push(`PASS (${task.tier}): +${txPointsEarned}`);

        await tx.user.update({
          where: { id: userId },
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

  return {
    submissionId: transactionResult.submissionId,
    status,
    length: codeLength,
    testsPassed,
    testsTotal,
    place: transactionResult.place,
    isNewBest: transactionResult.isNewBest,
    pointsEarned: transactionResult.pointsEarned,
    pointsBreakdown: transactionResult.pointsBreakdown,
    errorMessage: status === 'error' ? submissionError : null,
    details: testResults
      .filter((t) => !t.isHidden)
      .map((t) => ({
        index: t.index,
        passed: t.passed,
        input: t.input,
        expected: t.expected,
        actual: t.actual,
        error: t.error,
      })),
  };
}

function parseBatchResults(output: string, marker: string): BatchExecutionResultItem[] {
  const startMarker = `__ARENA_${marker}_START__`;
  const endMarker = `__ARENA_${marker}_END__`;
  const start = output.indexOf(startMarker);
  const end = output.lastIndexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  const jsonPayload = output
    .slice(start + startMarker.length, end)
    .trim();

  if (!jsonPayload) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonPayload) as { results?: BatchExecutionResultItem[] };
    if (!Array.isArray(parsed.results)) {
      return [];
    }
    return parsed.results;
  } catch {
    return [];
  }
}
