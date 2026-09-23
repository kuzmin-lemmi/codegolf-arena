// src/lib/language-submission.ts
// JavaScript и C#: черновая проверка на сервере и отправка в рейтинг.
//
// Оба языка работают по типизированной сигнатуре задачи (tasks.csharp_signature)
// и одинаково честно: программа не видит ответов, сравнивает сервер.
// Запись попытки, рекорды, места и очки — общие со всеми языками (scoring.ts).

import { prisma } from '@/lib/db';
import {
  checkValueFitsType,
  formatCsharpValue,
  parseCsharpSignature,
  validateCsharpExpression,
  type CsharpSignature,
} from '@/lib/csharp';
import { formatJsValue, isJsSignatureUsable, validateJsExpression } from '@/lib/javascript';
import { runCsharp } from '@/lib/csharp-runner';
import { runJs } from '@/lib/js-runner';
import { compareResults, type TypedTestcase, type TypedTestResult } from '@/lib/typed-results';
import { isLanguageEnabled } from '@/lib/language-settings';
import { LANGUAGE_LABELS } from '@/lib/languages';
import { recordCheckedSubmission } from '@/lib/scoring';
import { calculateCodeLength } from '@/lib/utils';
import type { SubmissionResponseData, TaskSubmitPayload } from '@/lib/submission-types';

export type TypedLanguage = 'javascript' | 'csharp';

export function isTypedLanguage(value: unknown): value is TypedLanguage {
  return value === 'javascript' || value === 'csharp';
}

type Details = SubmissionResponseData['details'];

export function validateTypedExpression(language: TypedLanguage, code: string) {
  return language === 'javascript' ? validateJsExpression(code) : validateCsharpExpression(code);
}

function formatTypedValue(language: TypedLanguage, value: unknown, type: CsharpSignature['args'][number]['type']) {
  return language === 'javascript' ? formatJsValue(value, type) : formatCsharpValue(value, type);
}

interface LoadedTask {
  id: string;
  slug: string;
  title: string;
  tier: string;
  signature: CsharpSignature;
  timeoutMs: number;
  testcases: TypedTestcase[];
}

type LoadResult = { ok: true; task: LoadedTask } | { ok: false; error: string };

async function loadTypedTask(language: TypedLanguage, slug: string, onlyOpen: boolean): Promise<LoadResult> {
  const label = LANGUAGE_LABELS[language];
  if (!isLanguageEnabled(language)) return { ok: false, error: `${label} сейчас выключен` };

  const task = await prisma.task.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      tier: true,
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
  if (!signature || (language === 'javascript' && !isJsSignatureUsable(signature))) {
    return { ok: false, error: `Эта задача пока не открыта для ${label}` };
  }

  const testcases: TypedTestcase[] = [];
  for (const tc of task.testcases) {
    const input = JSON.parse(tc.inputData) as { args?: unknown[] };
    const args = Array.isArray(input.args) ? input.args : [];
    // Сигнатуру проверяет скрипт db:tasks:csharp, но тест могли поправить в админке позже
    const mismatch =
      args.length !== signature.args.length ||
      signature.args.some((arg, i) => checkValueFitsType(args[i], arg.type) !== null);
    if (mismatch) {
      console.error(`${label}: тест #${tc.orderIndex} задачи ${slug} не подходит под сигнатуру`);
      return { ok: false, error: `Задача временно недоступна для ${label}: тесты не совпадают с сигнатурой` };
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

  return {
    ok: true,
    task: { id: task.id, slug: task.slug, title: task.title, tier: task.tier, signature, timeoutMs, testcases },
  };
}

function toDetails(
  language: TypedLanguage,
  results: TypedTestResult[],
  testcases: TypedTestcase[],
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
        .map((value, i) => formatTypedValue(language, value, signature.args[i].type))
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

async function evaluate(
  language: TypedLanguage,
  code: string,
  task: LoadedTask,
  allowWait: boolean
): Promise<Evaluation> {
  const testsTotal = task.testcases.length;
  const runParams = {
    expression: code,
    signature: task.signature,
    tests: task.testcases.map((t) => ({ index: t.index, args: t.args })),
    runTimeoutMs: task.timeoutMs * Math.max(testsTotal, 1),
  };
  const run =
    language === 'javascript' ? await runJs(runParams) : await runCsharp({ ...runParams, allowWait });

  const failed = (errorMessage: string): Evaluation => ({
    status: 'fail',
    testsPassed: 0,
    testsTotal,
    errorMessage,
    details: [],
  });

  switch (run.kind) {
    case 'compile_error':
      return failed(
        language === 'csharp' ? `Ошибка компиляции:\n${run.message}` : `Ошибка в коде:\n${run.message}`
      );
    case 'crash':
      return failed(run.message);
    case 'timeout':
      return failed('Превышено время выполнения (timeout)');
    case 'infra':
      return { status: 'error', testsPassed: 0, testsTotal, errorMessage: run.message, details: [] };
    case 'ok': {
      const results = compareResults(task.testcases, run.outcomes);
      const testsPassed = results.filter((r) => r.passed).length;
      const allPassed = testsTotal > 0 && testsPassed === testsTotal;
      return {
        status: allPassed ? 'pass' : 'fail',
        testsPassed,
        testsTotal,
        errorMessage: null,
        details: toDetails(language, results, task.testcases, task.signature),
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

export interface TypedDraftResult {
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  errorMessage: string | null;
  details: Details;
}

/** Черновая проверка: только открытые тесты, в базу ничего не пишется */
export async function checkTypedDraft(
  language: TypedLanguage,
  taskSlug: string,
  code: string
): Promise<TypedDraftResult> {
  const length = calculateCodeLength(code);
  const validation = validateTypedExpression(language, code);
  if (!validation.valid) {
    return { status: 'error', length, testsPassed: 0, testsTotal: 0, errorMessage: validation.error, details: [] };
  }

  const loaded = await loadTypedTask(language, taskSlug, true);
  if (!loaded.ok) {
    return { status: 'error', length, testsPassed: 0, testsTotal: 0, errorMessage: loaded.error, details: [] };
  }

  const evaluation = await evaluate(language, code, loaded.task, false);
  return { length, ...evaluation };
}

/** Отправка в рейтинг языка. Вызывается из очереди проверок (submission-jobs.ts) */
export async function runTypedSubmission(
  language: TypedLanguage,
  payload: TaskSubmitPayload
): Promise<SubmissionResponseData> {
  const { userId, taskSlug, code } = payload;

  const validation = validateTypedExpression(language, code);
  if (!validation.valid) return emptyResponse(code, validation.error);

  const loaded = await loadTypedTask(language, taskSlug, false);
  if (!loaded.ok) return emptyResponse(code, loaded.error);
  const task = loaded.task;

  const startedAt = Date.now();
  const codeLength = calculateCodeLength(code);
  const evaluation = await evaluate(language, code, task, true);
  const runtimeMs = Date.now() - startedAt;

  const scored = await recordCheckedSubmission({
    task,
    userId,
    language,
    code,
    codeLength,
    status: evaluation.status,
    testsPassed: evaluation.testsPassed,
    testsTotal: evaluation.testsTotal,
    runtimeMs,
    errorMsg: evaluation.errorMessage,
  });

  return {
    submissionId: scored.submissionId,
    status: evaluation.status,
    length: codeLength,
    testsPassed: evaluation.testsPassed,
    testsTotal: evaluation.testsTotal,
    place: scored.place,
    isNewBest: scored.isNewBest,
    previousBestLength: scored.previousBestLength,
    improvedBy: scored.improvedBy,
    tookFirstPlaceFrom: scored.tookFirstPlaceFrom,
    pointsEarned: scored.pointsEarned,
    pointsBreakdown: scored.pointsBreakdown,
    errorMessage: evaluation.errorMessage,
    details: evaluation.details,
  };
}
