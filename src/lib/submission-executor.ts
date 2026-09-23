import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { calculateCodeLength, validateOneliner } from '@/lib/utils';
import { executeCode } from '@/lib/piston';
import { generateBatchTestCode, generateTestCode, toPythonLiteral } from '@/lib/python-serializer';
import { recordCheckedSubmission } from '@/lib/scoring';
import { ENV, resolveEnvId } from '@/lib/environments';
import type { SubmissionResponseData, TaskSubmitPayload } from '@/lib/submission-types';

const OUTPUT_LIMIT_BYTES = 50 * 1024;
const TOTAL_TIMEOUT_MS = 10_000;
// Запасной путь гоняет тесты по одному. Без общего лимита 16 тестов по 4 секунды
// занимали воркер больше минуты — на сервере с одним ядром это ощутимо
const FALLBACK_TOTAL_BUDGET_MS = 15_000;

interface BatchExecutionResultItem {
  index: number;
  passed: boolean;
  isHidden: boolean;
  actual?: string | null;
  expected?: string | null;
  error?: string | null;
}

interface BatchTestcaseItem {
  index: number;
  args: unknown[];
  expectedOutput: string;
  isHidden: boolean;
}

export async function runTaskSubmission(payload: TaskSubmitPayload): Promise<SubmissionResponseData> {
  const { userId, taskSlug, code, envId: rawEnvId } = payload;
  const envId = resolveEnvId(rawEnvId);
  const envPrelude = ENV[envId].prelude;

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
      previousBestLength: null,
      improvedBy: null,
      tookFirstPlaceFrom: null,
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
      previousBestLength: null,
      improvedBy: null,
      tookFirstPlaceFrom: null,
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
        previousBestLength: null,
        improvedBy: null,
        tookFirstPlaceFrom: null,
        pointsEarned: 0,
        pointsBreakdown: [],
        errorMessage: `Запрещённый токен: ${token}`,
        details: [],
      };
    }
  }

  const startTime = Date.now();
  const marker = randomBytes(16).toString('hex');
  const batchTestcases: BatchTestcaseItem[] = task.testcases.map((testcase) => {
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
    marker,
    envPrelude
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

  let parsedResults = parseBatchResults(result.output, marker);

  if (shouldUsePerTestFallback(result, parsedResults)) {
    parsedResults = await runPerTestFallback({
      code,
      functionArgs,
      testcases: batchTestcases,
      allowedImports: constraints.allowed_imports || [],
      perTestTimeoutMs: Math.max(Number(constraints.timeout_ms || 2000), 1000),
      prelude: envPrelude,
    });
  }

  const testResults = parsedResults.map((item) => {
    const source = batchTestcases.find((t) => t.index === item.index);
    const isHidden = source?.isHidden ?? item.isHidden ?? false;

    // По скрытым тестам игрок видит только факт прохождения: ни аргументы,
    // ни ожидаемый ответ, ни текст ошибки (в нём могут быть значения теста)
    if (isHidden) {
      return {
        index: item.index,
        passed: item.passed,
        isHidden: true,
        input: undefined,
        expected: undefined,
        actual: undefined,
        error: item.error || null,
      };
    }

    return {
      index: item.index,
      passed: item.passed,
      isHidden: false,
      input: (source?.args || []).map(toPythonLiteral).join(', '),
      expected: item.expected ?? undefined,
      actual: item.actual ?? undefined,
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

  const scored = await recordCheckedSubmission({
    task,
    userId,
    language: 'python',
    code,
    codeLength,
    status,
    testsPassed,
    testsTotal,
    runtimeMs,
    errorMsg: submissionError,
  });

  return {
    submissionId: scored.submissionId,
    status,
    length: codeLength,
    testsPassed,
    testsTotal,
    place: scored.place,
    isNewBest: scored.isNewBest,
    previousBestLength: scored.previousBestLength,
    improvedBy: scored.improvedBy,
    tookFirstPlaceFrom: scored.tookFirstPlaceFrom,
    pointsEarned: scored.pointsEarned,
    pointsBreakdown: scored.pointsBreakdown,
    errorMessage: status === 'error' ? submissionError : null,
    details: testResults.map((t) => ({
      index: t.index,
      passed: t.passed,
      isHidden: t.isHidden,
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
  const start = output.lastIndexOf(startMarker);
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

function shouldUsePerTestFallback(
  result: Awaited<ReturnType<typeof executeCode>>,
  parsedResults: BatchExecutionResultItem[]
): boolean {
  if (parsedResults.length > 0) return false;

  if (result.errorKind === 'timeout') return true;
  if (result.errorKind !== 'runtime') return false;

  const text = `${result.error || ''} ${result.stderr || ''} ${result.output || ''}`.toLowerCase();
  return text.includes('sigkill') || text.includes('killed') || text.includes('timed out');
}

async function runPerTestFallback(params: {
  code: string;
  functionArgs: string[];
  testcases: BatchTestcaseItem[];
  allowedImports: string[];
  perTestTimeoutMs: number;
  prelude?: string;
}): Promise<BatchExecutionResultItem[]> {
  const results: BatchExecutionResultItem[] = [];
  const deadline = Date.now() + FALLBACK_TOTAL_BUDGET_MS;

  for (const testcase of params.testcases) {
    const remaining = deadline - Date.now();
    if (remaining < 500) {
      results.push({
        index: testcase.index,
        isHidden: testcase.isHidden,
        passed: false,
        actual: null,
        expected: testcase.isHidden ? null : testcase.expectedOutput.trim(),
        error: 'Не хватило общего времени на проверку',
      });
      continue;
    }

    const singleCode = generateTestCode(
      params.code,
      params.functionArgs,
      testcase.args,
      params.allowedImports,
      params.prelude || ''
    );

    const timeout = Math.min(params.perTestTimeoutMs, 4000, remaining);
    const signal = AbortSignal.timeout(timeout);
    const single = await executeCode(singleCode, timeout, signal);

    if (single.errorKind === 'none') {
      const actual = single.output.trim();
      const expected = testcase.expectedOutput.trim();
      results.push({
        index: testcase.index,
        isHidden: testcase.isHidden,
        passed: actual === expected,
        actual: testcase.isHidden ? null : actual,
        expected: testcase.isHidden ? null : expected,
        error: null,
      });
      continue;
    }

    results.push({
      index: testcase.index,
      isHidden: testcase.isHidden,
      passed: false,
      actual: null,
      expected: testcase.isHidden ? null : testcase.expectedOutput.trim(),
      error: single.error || 'Execution failed',
    });
  }

  return results;
}
