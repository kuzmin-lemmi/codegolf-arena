// src/lib/csharp-submission.ts
// Проба C#: черновая проверка и отправка в рейтинг C#.
//
// C# идёт вне зачёта: попытки и рекорды пишутся в свои таблицы
// language_submissions / language_best_submissions, очки не начисляются,
// соревнования и уведомления не трогаются. Питоновский путь
// (submission-executor.ts) этот модуль не затрагивает.

import { prisma } from '@/lib/db';
import {
  checkValueFitsType,
  formatCsharpValue,
  parseCsharpSignature,
  validateCsharpExpression,
  type CsharpSignature,
} from '@/lib/csharp';
import {
  compareCsharpResults,
  isCsharpEnabled,
  runCsharp,
  type CsharpTestcase,
  type CsharpTestResult,
} from '@/lib/csharp-runner';
import { calculateCodeLength } from '@/lib/utils';
import type { SubmissionResponseData, TaskSubmitPayload } from '@/lib/submission-types';

export const CSHARP_LANGUAGE = 'csharp';

type Details = SubmissionResponseData['details'];

interface LoadedTask {
  id: string;
  signature: CsharpSignature;
  timeoutMs: number;
  testcases: CsharpTestcase[];
}

type LoadResult = { ok: true; task: LoadedTask } | { ok: false; error: string };

async function loadCsharpTask(slug: string, onlyOpen: boolean): Promise<LoadResult> {
  if (!isCsharpEnabled()) return { ok: false, error: 'C# сейчас выключен' };

  const task = await prisma.task.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      constraintsJson: true,
      csharpSignature: true,
      testcases: {
        ...(onlyOpen ? { where: { isHidden: false } } : {}),
        orderBy: { orderIndex: 'asc' },
        select: { inputData: true, expectedOutput: true, isHidden: true, orderIndex: true },
      },
    },
  });

  if (!task || task.status !== 'published') return { ok: false, error: 'Задача не найдена' };

  const signature = parseCsharpSignature(task.csharpSignature);
  if (!signature) return { ok: false, error: 'Эта задача пока не открыта для C#' };

  const testcases: CsharpTestcase[] = [];
  for (const tc of task.testcases) {
    const input = JSON.parse(tc.inputData) as { args?: unknown[] };
    const args = Array.isArray(input.args) ? input.args : [];
    // Сигнатуру проверяет скрипт db:tasks:csharp, но тест могли поправить в админке позже
    const mismatch =
      args.length !== signature.args.length ||
      signature.args.some((arg, i) => checkValueFitsType(args[i], arg.type) !== null);
    if (mismatch) {
      console.error(`C#: тест #${tc.orderIndex} задачи ${slug} не подходит под сигнатуру`);
      return { ok: false, error: 'Задача временно недоступна для C#: тесты не совпадают с сигнатурой' };
    }
    testcases.push({
      index: tc.orderIndex,
      args,
      expectedOutput: tc.expectedOutput,
      isHidden: tc.isHidden,
    });
  }

  let timeoutMs = 2000;
  try {
    timeoutMs = Number(JSON.parse(task.constraintsJson).timeout_ms) || 2000;
  } catch {
    // Кривые ограничения — берём лимит по умолчанию
  }

  return { ok: true, task: { id: task.id, signature, timeoutMs, testcases } };
}

function toDetails(
  results: CsharpTestResult[],
  testcases: CsharpTestcase[],
  signature: CsharpSignature
): Details {
  return results.map((r) => {
    if (r.isHidden) {
      return { index: r.index, passed: r.passed, isHidden: true, error: r.error };
    }
    const source = testcases.find((t) => t.index === r.index);
    return {
      index: r.index,
      passed: r.passed,
      isHidden: false,
      input: (source?.args || [])
        .map((value, i) => formatCsharpValue(value, signature.args[i].type))
        .join(', '),
      expected: r.expected ?? undefined,
      actual: r.actual ?? undefined,
      error: r.error,
    };
  });
}

interface Evaluation {
  status: 'pass' | 'fail' | 'error';
  testsPassed: number;
  testsTotal: number;
  errorMessage: string | null;
  details: Details;
}

async function evaluate(code: string, task: LoadedTask, allowWait: boolean): Promise<Evaluation> {
  const testsTotal = task.testcases.length;
  const run = await runCsharp({
    expression: code,
    signature: task.signature,
    tests: task.testcases.map((t) => ({ index: t.index, args: t.args })),
    runTimeoutMs: task.timeoutMs * Math.max(testsTotal, 1),
    allowWait,
  });

  switch (run.kind) {
    case 'compile_error':
      return { status: 'fail', testsPassed: 0, testsTotal, errorMessage: `Ошибка компиляции:\n${run.message}`, details: [] };
    case 'crash':
      return { status: 'fail', testsPassed: 0, testsTotal, errorMessage: run.message, details: [] };
    case 'timeout':
      return {
        status: 'fail',
        testsPassed: 0,
        testsTotal,
        errorMessage: 'Превышено время выполнения (timeout)',
        details: [],
      };
    case 'infra':
      return { status: 'error', testsPassed: 0, testsTotal, errorMessage: run.message, details: [] };
    case 'ok': {
      const results = compareCsharpResults(task.testcases, run.outcomes);
      const testsPassed = results.filter((r) => r.passed).length;
      const allPassed = testsTotal > 0 && testsPassed === testsTotal;
      return {
        status: allPassed ? 'pass' : 'fail',
        testsPassed,
        testsTotal,
        errorMessage: null,
        details: toDetails(results, task.testcases, task.signature),
      };
    }
  }
}

function emptyResponse(code: string, errorMessage: string, testsTotal = 0): SubmissionResponseData {
  return {
    submissionId: null,
    status: 'error',
    length: calculateCodeLength(code),
    testsPassed: 0,
    testsTotal,
    place: null,
    isNewBest: false,
    previousBestLength: null,
    improvedBy: null,
    tookFirstPlaceFrom: null,
    pointsEarned: 0,
    pointsBreakdown: [],
    errorMessage,
    details: [],
  };
}

export interface CsharpDraftResult {
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  errorMessage: string | null;
  details: Details;
}

/** Черновая проверка: только открытые тесты, в базу ничего не пишется */
export async function checkCsharpDraft(taskSlug: string, code: string): Promise<CsharpDraftResult> {
  const length = calculateCodeLength(code);
  const validation = validateCsharpExpression(code);
  if (!validation.valid) {
    return { status: 'error', length, testsPassed: 0, testsTotal: 0, errorMessage: validation.error, details: [] };
  }

  const loaded = await loadCsharpTask(taskSlug, true);
  if (!loaded.ok) {
    return { status: 'error', length, testsPassed: 0, testsTotal: 0, errorMessage: loaded.error, details: [] };
  }

  const evaluation = await evaluate(code, loaded.task, false);
  return { length, ...evaluation };
}

/** Отправка в рейтинг C#. Вызывается из очереди проверок (submission-jobs.ts) */
export async function runCsharpSubmission(payload: TaskSubmitPayload): Promise<SubmissionResponseData> {
  const { userId, taskSlug, code } = payload;

  const validation = validateCsharpExpression(code);
  if (!validation.valid) return emptyResponse(code, validation.error);

  const loaded = await loadCsharpTask(taskSlug, false);
  if (!loaded.ok) return emptyResponse(code, loaded.error);
  const task = loaded.task;

  const startedAt = Date.now();
  const codeLength = calculateCodeLength(code);
  const evaluation = await evaluate(code, task, true);
  const runtimeMs = Date.now() - startedAt;

  const saved = await prisma.$transaction(
    async (tx) => {
      const submission = await tx.languageSubmission.create({
        data: {
          language: CSHARP_LANGUAGE,
          taskId: task.id,
          userId,
          code,
          codeLength,
          status: evaluation.status,
          testsPassed: evaluation.testsPassed,
          testsTotal: evaluation.testsTotal,
          runtimeMs,
          errorMsg: evaluation.errorMessage,
        },
        select: { id: true },
      });

      if (evaluation.status !== 'pass') {
        return {
          submissionId: submission.id,
          isNewBest: false,
          previousBestLength: null as number | null,
          improvedBy: null as number | null,
          tookFirstPlaceFrom: null as string | null,
          place: null as number | null,
        };
      }

      const key = { taskId: task.id, userId, language: CSHARP_LANGUAGE };
      const order = [{ codeLength: 'asc' as const }, { achievedAt: 'asc' as const }, { userId: 'asc' as const }];

      const leaderBefore = await tx.languageBestSubmission.findFirst({
        where: { taskId: task.id, language: CSHARP_LANGUAGE },
        orderBy: order,
        select: { userId: true, codeLength: true, user: { select: { nickname: true, displayName: true } } },
      });

      const before = await tx.languageBestSubmission.findUnique({
        where: { taskId_userId_language: key },
        select: { codeLength: true },
      });

      const now = new Date();
      let isNewBest = false;

      // Без исключений внутри транзакции: в PostgreSQL после ошибки
      // уникальности транзакция уже не принимает запросов
      const created = await tx.languageBestSubmission.createMany({
        data: [{ ...key, submissionId: submission.id, codeLength, achievedAt: now }],
        skipDuplicates: true,
      });
      if (created.count === 1) {
        isNewBest = true;
      } else {
        const improved = await tx.languageBestSubmission.updateMany({
          where: { ...key, codeLength: { gt: codeLength } },
          data: { submissionId: submission.id, codeLength, achievedAt: now },
        });
        isNewBest = improved.count === 1;
      }

      const own = await tx.languageBestSubmission.findUnique({
        where: { taskId_userId_language: key },
        select: { codeLength: true, achievedAt: true },
      });

      let place: number | null = null;
      if (own) {
        const better = await tx.languageBestSubmission.count({
          where: {
            taskId: task.id,
            language: CSHARP_LANGUAGE,
            OR: [
              { codeLength: { lt: own.codeLength } },
              { codeLength: own.codeLength, achievedAt: { lt: own.achievedAt } },
              { codeLength: own.codeLength, achievedAt: own.achievedAt, userId: { lt: userId } },
            ],
          },
        });
        place = better + 1;
      }

      const tookFirstPlaceFrom =
        leaderBefore && leaderBefore.userId !== userId && codeLength < leaderBefore.codeLength
          ? leaderBefore.user.nickname || leaderBefore.user.displayName
          : null;

      return {
        submissionId: submission.id,
        isNewBest,
        previousBestLength: before?.codeLength ?? null,
        improvedBy: isNewBest && before ? before.codeLength - codeLength : null,
        tookFirstPlaceFrom,
        place,
      };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  return {
    submissionId: saved.submissionId,
    status: evaluation.status,
    length: codeLength,
    testsPassed: evaluation.testsPassed,
    testsTotal: evaluation.testsTotal,
    place: saved.place,
    isNewBest: saved.isNewBest,
    previousBestLength: saved.previousBestLength,
    improvedBy: saved.improvedBy,
    tookFirstPlaceFrom: saved.tookFirstPlaceFrom,
    pointsEarned: 0,
    pointsBreakdown: [],
    errorMessage: evaluation.errorMessage,
    details: evaluation.details,
  };
}
