// src/components/task/SubmitForm.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CodeEditor } from './CodeEditor';
import { Button } from '@/components/ui';
import { Send, RotateCcw, Play, CheckCircle, XCircle, Loader2, LogIn, Download } from 'lucide-react';
import { validateOneliner, calculateCodeLength, cn } from '@/lib/utils';
import { usePyodide } from '@/hooks/usePyodide';
import { SubmissionStatus } from '@/types';

interface SubmitFormProps {
  taskSlug: string;
  taskTitle?: string;
  isLoggedIn?: boolean;
  nextTask?: { slug: string; title: string } | null;
  functionArgs?: string[];
  testcases?: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
  allowedImports?: string[];
  rankingTargets?: {
    top1: number | null;
    top3: number | null;
  };
  onCodeMetricsChange?: (metrics: { length: number; hasCode: boolean }) => void;
  onSubmitSuccess?: (result: SubmitResult) => void;
}

interface SubmitResult {
  status: SubmissionStatus;
  length: number;
  testsPassed: number;
  testsTotal: number;
  place: number | null;
  isNewBest?: boolean;
  errorMessage: string | null;
  details?: TestResultDetail[];
}

interface TestResultDetail {
  index: number;
  passed: boolean;
  input?: string;
  expected?: string;
  actual?: string;
  error?: string;
}

interface LocalCheckResult {
  length: number;
  status: 'pass' | 'fail';
  testsPassed: number;
  testsTotal: number;
  details: TestResultDetail[];
  totalTime: number;
}

export function SubmitForm({ 
  taskSlug, 
  taskTitle,
  isLoggedIn = false,
  nextTask,
  functionArgs = ['s'],
  testcases = [],
  allowedImports = [],
  rankingTargets,
  onCodeMetricsChange,
  onSubmitSuccess,
}: SubmitFormProps) {
  const draftKey = useMemo(() => `task_draft:${taskSlug}`, [taskSlug]);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitQueueStatus, setSubmitQueueStatus] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [localResult, setLocalResult] = useState<LocalCheckResult | null>(null);
  const pathname = usePathname();
  const returnTo = encodeURIComponent(pathname);

  const { isLoading: pyodideLoading, loadProgress, checkCode } = usePyodide();

  const validation = validateOneliner(code);
  const length = calculateCodeLength(code);
  const canSubmit = validation.valid && code.trim().length > 0;

  useEffect(() => {
    if (!onCodeMetricsChange) return;
    onCodeMetricsChange({
      length,
      hasCode: code.trim().length > 0,
    });
  }, [code, length, onCodeMetricsChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(draftKey);
    if (saved) {
      setCode(saved);
    }
  }, [draftKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trimmed = code.trim();
    if (!trimmed) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    window.localStorage.setItem(draftKey, code);
  }, [code, draftKey]);

  // Отправка решения (для авторизованных)
  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitQueueStatus(null);
    setResult(null);
    setLocalResult(null);

    try {
      const res = await fetch(`/api/tasks/${taskSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!data.success) {
        setResult({
          status: 'error',
          length,
          testsPassed: 0,
          testsTotal: 0,
          place: null,
          errorMessage: data.error || 'Ошибка при отправке',
        });
        return;
      }

      if (data.queued && data.jobId) {
        setSubmitQueueStatus('Задача поставлена в очередь...');
        const finalResult = await pollSubmitJob(data.jobId as string);
        setResult(finalResult);
        if (onSubmitSuccess) {
          onSubmitSuccess(finalResult);
        }
      } else if (data.data) {
        setResult(data.data);
        if (onSubmitSuccess) {
          onSubmitSuccess(data.data as SubmitResult);
        }
      }
    } catch (error) {
      setResult({
        status: 'error',
        length,
        testsPassed: 0,
        testsTotal: 0,
        place: null,
        errorMessage: 'Ошибка соединения',
      });
    } finally {
      setIsSubmitting(false);
      setSubmitQueueStatus(null);
    }
  };

  const pollSubmitJob = async (jobId: string): Promise<SubmitResult> => {
    const maxAttempts = 80;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const statusRes = await fetch(
        `/api/tasks/${taskSlug}/submit?jobId=${encodeURIComponent(jobId)}`,
        { cache: 'no-store' }
      );

      if (statusRes.status === 429) {
        const retryAfter = Number(statusRes.headers.get('Retry-After') || '1');
        setSubmitQueueStatus('Сервер перегружен, ждём окно для проверки статуса...');
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 1) * 1000));
        continue;
      }

      const statusData = await statusRes.json();

      if (!statusData.success) {
        throw new Error(statusData.error || 'Не удалось получить статус проверки');
      }

      if (statusData.status === 'queued') {
        setSubmitQueueStatus('В очереди на проверку...');
        continue;
      }

      if (statusData.status === 'running') {
        setSubmitQueueStatus('Проверяется на сервере...');
        continue;
      }

      if (statusData.status === 'done' && statusData.data) {
        return statusData.data as SubmitResult;
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Проверка завершилась ошибкой');
      }
    }

    throw new Error('Слишком долго выполняется. Проверь результат чуть позже.');
  };

  // Локальная проверка через Pyodide
  const handleCheckLocally = async () => {
    if (!canSubmit || isChecking) return;

    setIsChecking(true);
    setResult(null);
    setLocalResult(null);

    try {
      // Если нет тестов — используем mock
      if (testcases.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setLocalResult({
          length,
          status: 'pass',
          testsPassed: 0,
          testsTotal: 0,
          details: [],
          totalTime: 0,
        });
        return;
      }

      // Выполняем через Pyodide
      const checkResult = await checkCode(code, functionArgs, testcases, allowedImports);

      if (!checkResult) {
        setLocalResult({
          length,
          status: 'fail',
          testsPassed: 0,
          testsTotal: testcases.length,
          details: [{ index: 0, passed: false, error: 'Не удалось загрузить Python' }],
          totalTime: 0,
        });
        return;
      }

      const testsPassed = checkResult.results.filter((r) => r.passed).length;

      setLocalResult({
        length,
        status: checkResult.allPassed ? 'pass' : 'fail',
        testsPassed,
        testsTotal: checkResult.results.length,
        details: checkResult.results.map((r) => ({
          index: r.index,
          passed: r.passed,
          input: r.input,
          expected: r.expected,
          actual: r.actual,
          error: r.error || undefined,
        })),
        totalTime: checkResult.totalTime,
      });
    } catch (error: any) {
      setLocalResult({
        length,
        status: 'fail',
        testsPassed: 0,
        testsTotal: testcases.length,
        details: [{ index: 0, passed: false, error: error.message || 'Ошибка проверки' }],
        totalTime: 0,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleReset = () => {
    setCode('');
    setResult(null);
    setLocalResult(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(draftKey);
    }
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      {/* Code Editor */}
      {/* Visual code scaffold */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Static header - function definition */}
        <div className="bg-[rgb(var(--code-header))] px-3 sm:px-4 py-2 border-b border-[rgb(var(--code-border))] font-mono text-xs sm:text-sm flex items-center justify-between gap-3">
          <div>
            <span className="text-[rgb(var(--code-keyword))]">def</span>{' '}
            <span className="text-[rgb(var(--code-func))]">solution</span>
            <span className="text-[rgb(var(--code-muted))]">(</span>
            <span className="text-[rgb(var(--code-arg))]">{functionArgs.join(', ')}</span>
            <span className="text-[rgb(var(--code-muted))]">):</span>
          </div>
          <div className="text-[rgb(var(--code-muted))] whitespace-nowrap">
            <span className="text-[rgb(var(--code-text))]">Длина:</span>{' '}
            <span className="text-[rgb(var(--code-accent))] font-bold">{length}</span>
            <span className="text-[rgb(var(--code-muted))] hidden sm:inline"> символов</span>
          </div>
        </div>
        
        {/* Return line with editable expression */}
        <div className="bg-[rgb(var(--code-bg))] flex items-stretch">
          {/* Static return keyword */}
          <div className="flex-shrink-0 px-4 py-3 font-mono text-sm bg-[rgb(var(--code-header))] border-r border-[rgb(var(--code-border))] flex items-center">
            <span className="text-[rgb(var(--code-muted))] select-none">    </span>
            <span className="text-[rgb(var(--code-keyword))] select-none">return</span>
            <span className="text-[rgb(var(--code-muted))] select-none ml-1"> </span>
          </div>
          
          {/* Editable expression area */}
          <div className="flex-1 min-w-0">
            <CodeEditor
              value={code}
              onChange={setCode}
              disabled={isSubmitting}
              placeholder="твой код здесь..."
              minimal
            />
          </div>
        </div>
      </div>
      
      <div className="text-sm text-text-muted">
        Пиши только выражение — оно подставится после <span className="font-mono">return</span>.
      </div>

      {/* Buttons */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {isLoggedIn && (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            loading={isSubmitting}
            icon={Send}
          >
            Отправить в рейтинг
          </Button>
        )}

        {!isLoggedIn && (
          <Link href={`/auth?returnTo=${returnTo}`}>
            <Button variant="secondary" icon={LogIn}>
              Войти, чтобы отправить в рейтинг
            </Button>
          </Link>
        )}

        <Button
          variant="secondary"
          onClick={handleReset}
          disabled={isSubmitting || !code}
          icon={RotateCcw}
        >
          Сбросить
        </Button>

        <Button
          variant="ghost"
          onClick={handleCheckLocally}
          disabled={!canSubmit || isChecking || pyodideLoading}
          icon={isChecking || pyodideLoading ? Loader2 : Play}
          className={isChecking || pyodideLoading ? '[&>svg]:animate-spin' : ''}
        >
          {pyodideLoading ? loadProgress || 'Загрузка...' : 'Проверить локально'}
        </Button>
      </div>

      {/* Pyodide loading indicator */}
      {pyodideLoading && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Download className="w-4 h-4 animate-bounce" />
          <span>Загружается Python (~10 МБ, только первый раз)...</span>
        </div>
      )}

      {isSubmitting && submitQueueStatus && (
        <div className="text-sm text-accent-blue">{submitQueueStatus}</div>
      )}

      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className={cn('mx-auto max-w-3xl grid gap-2', isLoggedIn ? 'grid-cols-3' : 'grid-cols-2')}>
          {isLoggedIn ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              loading={isSubmitting}
              className="w-full"
            >
              В рейтинг
            </Button>
          ) : (
            <Link href={`/auth?returnTo=${returnTo}`}>
              <Button variant="secondary" className="w-full" icon={LogIn}>
                Войти
              </Button>
            </Link>
          )}

          <Button
            variant="ghost"
            onClick={handleCheckLocally}
            disabled={!canSubmit || isChecking || pyodideLoading}
            className={cn('w-full', isChecking || pyodideLoading ? '[&>svg]:animate-spin' : '')}
            icon={isChecking || pyodideLoading ? Loader2 : Play}
          >
            Проверить
          </Button>

          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={isSubmitting || !code}
            icon={RotateCcw}
            className={cn('w-full', isLoggedIn ? '' : 'col-span-2')}
          >
            Сброс
          </Button>
        </div>
      </div>

      {/* Server result */}
      {result && (
        <>
          <SubmitResultCard result={result} />
          {result.status === 'pass' ? (
            <NextStepCard
              length={result.length}
              rankingTargets={rankingTargets}
              taskTitle={taskTitle}
              nextTask={nextTask}
            />
          ) : (
            <FailureHints
              details={result.details || []}
              errorMessage={result.errorMessage || undefined}
            />
          )}
        </>
      )}

      {/* Local check result */}
      {localResult && !result && (
        <>
          <LocalCheckResultCard 
            result={localResult} 
            isLoggedIn={isLoggedIn}
            returnTo={returnTo}
          />
          {localResult.status === 'fail' && (
            <FailureHints details={localResult.details} />
          )}
        </>
      )}
    </div>
  );
}

function NextStepCard({
  length,
  rankingTargets,
  taskTitle,
  nextTask,
}: {
  length: number;
  rankingTargets?: { top1: number | null; top3: number | null };
  taskTitle?: string;
  nextTask?: { slug: string; title: string } | null;
}) {
  const toTop1 = rankingTargets?.top1 !== null && rankingTargets?.top1 !== undefined
    ? length - rankingTargets.top1
    : null;
  const toTop3 = rankingTargets?.top3 !== null && rankingTargets?.top3 !== undefined
    ? length - rankingTargets.top3
    : null;

  return (
    <div className="p-4 rounded-lg border border-accent-blue/30 bg-accent-blue/5 animate-fade-in">
      <div className="font-semibold text-accent-blue mb-2">Следующий шаг</div>
      <div className="space-y-1 text-sm text-text-secondary">
        {toTop1 !== null && toTop1 > 0 && (
          <div>До топ-1 по этой задаче: <span className="font-mono text-text-primary">-{toTop1}</span> символов.</div>
        )}
        {toTop3 !== null && toTop3 > 0 && (
          <div>До топ-3: <span className="font-mono text-text-primary">-{toTop3}</span> символов.</div>
        )}
        {(toTop1 === null || toTop1 <= 0) && (toTop3 === null || toTop3 <= 0) && (
          <div>Отличный результат! Попробуй ещё укоротить решение или перейти к следующей задаче.</div>
        )}
        {taskTitle && (
          <div className="text-xs text-text-muted">Задача: {taskTitle}</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {nextTask ? (
          <Link href={`/task/${nextTask.slug}`}>
            <Button variant="primary" size="sm">Дальше: {nextTask.title}</Button>
          </Link>
        ) : (
          <Link href="/tasks">
            <Button variant="secondary" size="sm">К списку задач</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function FailureHints({ details, errorMessage }: { details: TestResultDetail[]; errorMessage?: string }) {
  const combinedText = [
    errorMessage || '',
    ...details.map((d) => d.error || ''),
  ].join(' ').toLowerCase();

  const hints: string[] = [];

  if (combinedText.includes('time limit') || combinedText.includes('timeout')) {
    hints.push('Упрости алгоритм: избегай лишних циклов и повторных вычислений в выражении.');
  }
  if (combinedText.includes('output limit')) {
    hints.push('Убери отладочный вывод: лишний print быстро переполняет лимит вывода.');
  }
  if (combinedText.includes('syntaxerror') || combinedText.includes('indentationerror')) {
    hints.push('Проверь синтаксис однострочника: лишние скобки, двоеточия и запятые.');
  }
  if (combinedText.includes('nameerror') || combinedText.includes('not defined')) {
    hints.push('Похоже на отсутствующее имя/импорт. Проверь разрешенные импорты и названия переменных.');
  }
  if (combinedText.includes('typeerror') || combinedText.includes('valueerror')) {
    hints.push('Проверь типы и граничные случаи: пустые массивы, нули, отрицательные значения.');
  }
  if (combinedText.includes('assert') || details.some((d) => !d.passed && d.expected && d.actual)) {
    hints.push('Есть расхождение ожидаемого и фактического значения — проверь порядок операций и округление.');
  }

  if (hints.length === 0) {
    hints.push('Сначала прогони локальные открытые тесты и отдельно проверь граничные случаи.');
    hints.push('Частые проблемы: пустой ввод, большие числа, float-округление, запретные токены.');
  }

  return (
    <div className="p-4 rounded-lg border border-accent-yellow/30 bg-accent-yellow/5 animate-fade-in">
      <div className="font-semibold text-accent-yellow mb-2">Подсказки по частым фейлам</div>
      <div className="space-y-1 text-sm text-text-secondary">
        {hints.slice(0, 3).map((hint) => (
          <div key={hint}>• {hint}</div>
        ))}
      </div>
    </div>
  );
}

function SubmitResultCard({ result }: { result: SubmitResult }) {
  const isPassed = result.status === 'pass';
  const isFailed = result.status === 'fail';
  const isError = result.status === 'error';

  return (
    <div
      className={cn(
        'p-5 animate-fade-in',
        isPassed && 'result-pass',
        isFailed && 'result-fail',
        isError && 'result-error'
      )}
    >
      <div className="flex items-center gap-4">
        {isPassed && (
          <>
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-green/20 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-accent-green" />
            </div>
            <div>
              <div className="font-bold text-accent-green text-xl tracking-wide">
                PASS
                {result.place && (
                  <span className="ml-3 text-tier-gold text-lg">
                    #{result.place} место!
                  </span>
                )}
              </div>
              <div className="text-sm text-text-secondary mt-1">
                {result.isNewBest ? 'Новый рекорд: ' : 'Результат: '}
                <span className="font-mono font-bold text-accent-green text-base">{result.length}</span> символов
              </div>
            </div>
          </>
        )}

        {isFailed && (
          <>
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-red/20 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-accent-red" />
            </div>
            <div>
              <div className="font-bold text-accent-red text-xl tracking-wide">FAIL</div>
              <div className="text-sm text-text-secondary mt-1">
                Пройдено тестов: <span className="font-mono font-bold text-text-primary">{result.testsPassed}</span> из <span className="font-mono">{result.testsTotal}</span>
              </div>
            </div>
          </>
        )}

        {isError && (
          <>
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-yellow/20 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-accent-yellow" />
            </div>
            <div>
              <div className="font-bold text-accent-yellow text-xl tracking-wide">Ошибка</div>
              <div className="text-sm text-text-secondary mt-1">
                {result.errorMessage || 'Произошла ошибка при выполнении'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Test details */}
      {result.details && result.details.length > 0 && (
        <TestDetails
          details={result.details}
          testsTotal={result.testsTotal}
          testsPassed={result.testsPassed}
        />
      )}
    </div>
  );
}

function LocalCheckResultCard({ 
  result, 
  isLoggedIn,
  returnTo,
}: { 
  result: LocalCheckResult; 
  isLoggedIn: boolean;
  returnTo: string;
}) {
  const isPassed = result.status === 'pass';

  return (
    <div
      className={cn(
        'p-5 animate-fade-in',
        isPassed ? 'result-pass' : 'result-fail'
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn(
          'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
          isPassed ? 'bg-accent-green/20' : 'bg-accent-red/20'
        )}>
          {isPassed ? (
            <CheckCircle className="w-7 h-7 text-accent-green" />
          ) : (
            <XCircle className="w-7 h-7 text-accent-red" />
          )}
        </div>
        <div className="flex-1">
          <div className="font-bold text-xl tracking-wide">
            {isPassed ? (
              <span className="text-accent-green">Все тесты пройдены!</span>
            ) : (
              <span className="text-accent-red">
                Пройдено {result.testsPassed} из {result.testsTotal}
              </span>
            )}
          </div>
          
          <div className="text-sm text-text-secondary mt-1">
            Длина: <span className={cn(
              'font-mono font-bold text-base',
              isPassed ? 'text-accent-green' : 'text-text-primary'
            )}>{result.length}</span> символов
            {result.totalTime > 0 && (
              <span className="ml-2 text-text-muted">• {result.totalTime.toFixed(0)} мс</span>
            )}
          </div>

          {isPassed && !isLoggedIn && (
            <div className="mt-4 p-3 bg-background-tertiary/50 rounded-lg border border-tier-gold/30">
              <div className="text-sm text-tier-gold mb-2 font-medium">
                Хочешь попасть в рейтинг?
              </div>
              <Link href={`/auth?returnTo=${returnTo}`}>
                <Button variant="primary" size="sm" icon={LogIn}>
                  Войти или зарегистрироваться
                </Button>
              </Link>
            </div>
          )}

          {/* Test details */}
          {result.details.length > 0 && (
            <TestDetails
              details={result.details}
              testsTotal={result.testsTotal}
              testsPassed={result.testsPassed}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TestDetails({
  details,
  testsTotal,
  testsPassed,
}: {
  details: TestResultDetail[];
  testsTotal: number;
  testsPassed: number;
}) {
  if (details.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-sm text-text-secondary">
        Тесты: <span className="text-text-primary font-medium">{testsPassed}</span> из{' '}
        <span className="text-text-primary font-medium">{testsTotal}</span>
      </div>

      <div className="mt-3 space-y-2">
        {details.map((test) => (
          <div
            key={test.index}
            className={cn(
              'p-3 rounded-lg text-sm border',
              test.passed
                ? 'border-accent-green/30 bg-accent-green/5'
                : 'border-accent-red/30 bg-accent-red/5'
            )}
          >
            <div className="flex items-center gap-2">
              {test.passed ? (
                <CheckCircle className="w-4 h-4 text-accent-green" />
              ) : (
                <XCircle className="w-4 h-4 text-accent-red" />
              )}
              <span className="font-medium">Тест {test.index + 1}</span>
              <span
                className={cn(
                  'text-xs',
                  test.passed ? 'text-accent-green' : 'text-accent-red'
                )}
              >
                {test.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <div className="font-mono text-xs text-text-muted mt-2 space-y-0.5">
              <div>
                Ввод: {test.input ? `solution(${test.input})` : 'solution()'}
              </div>
              {test.expected && <div>Ожидалось: {test.expected}</div>}
              {test.actual && <div>Получено: {test.actual}</div>}
              {test.error && <div className="text-accent-red">{test.error}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
