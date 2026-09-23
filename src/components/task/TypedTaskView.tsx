// src/components/task/TypedTaskView.tsx
// Решение задачи на JavaScript или C#: редактор, проверка на сервере, отправка
// в рейтинг языка, открытые тесты, таблица рекордов, решения и попытки.
// Оба языка работают по сигнатуре задачи с типами (tasks.csharp_signature).
// Питоновская форма (SubmitForm) этот компонент не использует и не меняет.

'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckCircle, Loader2, LogIn, Play, RotateCcw, Send, XCircle } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { CodeEditor } from './CodeEditor';
import { TaskTabs } from './TaskTabs';
import type { LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import { calculateCodeLength, cn, pluralizeRu } from '@/lib/utils';
import {
  CSHARP_USINGS,
  formatCsharpValue,
  validateCsharpExpression,
  type CsharpSignature,
} from '@/lib/csharp';
import { formatJsValue, validateJsExpression } from '@/lib/javascript';
import { LANGUAGE_LABELS } from '@/lib/languages';

export type TypedLanguage = 'javascript' | 'csharp';

interface Detail {
  index: number;
  passed: boolean;
  isHidden?: boolean;
  input?: string;
  expected?: string;
  actual?: string;
  error?: string | null;
}

interface RunResult {
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  errorMessage: string | null;
  details: Detail[];
  // Только у отправки в рейтинг
  place?: number | null;
  isNewBest?: boolean;
  previousBestLength?: number | null;
  improvedBy?: number | null;
  tookFirstPlaceFrom?: string | null;
  pointsEarned?: number;
  pointsBreakdown?: string[];
}

interface OwnRecord {
  codeLength: number;
  rank: number;
}

// Всё, чем языки отличаются на экране
const LANGUAGE_VIEW: Record<
  TypedLanguage,
  {
    validate: (code: string) => { valid: true } | { valid: false; error: string };
    formatValue: (value: unknown, type: CsharpSignature['args'][number]['type']) => string;
    callName: string;
    placeholder: string;
    checkingText: string;
    runningText: string;
  }
> = {
  javascript: {
    validate: validateJsExpression,
    formatValue: formatJsValue,
    callName: 'solution',
    placeholder: 'выражение на JavaScript...',
    checkingText: 'Проверяется...',
    runningText: 'Проверяется на сервере...',
  },
  csharp: {
    validate: validateCsharpExpression,
    formatValue: formatCsharpValue,
    callName: 'Solution',
    placeholder: 'выражение на C#...',
    checkingText: 'Собирается...',
    runningText: 'Собирается и проверяется на сервере (C# — пара секунд)...',
  },
};

interface TypedTaskViewProps {
  language: TypedLanguage;
  taskSlug: string;
  signature: CsharpSignature;
  isLoggedIn: boolean;
  switcher: ReactNode;
  testcases: Array<{ inputData: { args: any[] }; expectedOutput: string }>;
  // Сами скрытые тесты в браузер не приходят — только их количество
  hiddenTestsCount?: number;
}

export function TypedTaskView({
  language,
  taskSlug,
  signature,
  isLoggedIn,
  switcher,
  testcases,
  hiddenTestsCount = 0,
}: TypedTaskViewProps) {
  const view = LANGUAGE_VIEW[language];
  const label = LANGUAGE_LABELS[language];
  const pathname = usePathname();
  const returnTo = encodeURIComponent(`${pathname}?lang=${language}`);
  const draftKey = `task_draft_${language}:${taskSlug}`;

  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<RunResult | null>(null);
  const [submitResult, setSubmitResult] = useState<RunResult | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [own, setOwn] = useState<OwnRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const validation = view.validate(code);
  const length = calculateCodeLength(code);
  const hasCode = code.trim().length > 0;
  const canRun = validation.valid && hasCode;

  // Черновик у каждого языка свой
  useEffect(() => {
    try {
      setCode(window.localStorage.getItem(draftKey) || '');
    } catch {
      // Хранилище браузера недоступно — просто без черновика
    }
    setCheckResult(null);
    setSubmitResult(null);
  }, [draftKey]);

  useEffect(() => {
    try {
      if (code.trim()) window.localStorage.setItem(draftKey, code);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // см. выше
    }
  }, [code, draftKey]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tasks/${taskSlug}/leaderboard?lang=${language}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!alive || !json.success) return;
        setBoard(json.data || []);
        setOwn(json.own ? { codeLength: json.own.codeLength, rank: json.own.rank } : null);
      })
      .catch(() => {
        // Таблица просто останется пустой — решать это не мешает
      });
    return () => {
      alive = false;
    };
  }, [taskSlug, language, refreshKey]);

  const handleCheck = async () => {
    if (!canRun || isChecking || isSubmitting) return;
    setIsChecking(true);
    setCheckResult(null);
    setSubmitResult(null);
    try {
      const res = await fetch(`/api/tasks/${taskSlug}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });
      const json = await res.json();
      setCheckResult(json.success ? json.data : errorResult(length, json.error || 'Не удалось проверить'));
    } catch {
      setCheckResult(errorResult(length, 'Ошибка соединения'));
    } finally {
      setIsChecking(false);
    }
  };

  const pollJob = useCallback(
    async (jobId: string): Promise<RunResult> => {
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const res = await fetch(`/api/tasks/${taskSlug}/submit?jobId=${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') || '1');
          await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 1) * 1000));
          continue;
        }
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Не удалось получить статус проверки');
        if (json.status === 'queued') setQueueStatus('В очереди на проверку...');
        if (json.status === 'running') setQueueStatus(view.runningText);
        if (json.status === 'done' && json.data) return json.data as RunResult;
        if (json.status === 'failed') throw new Error(json.error || 'Проверка завершилась ошибкой');
      }
      throw new Error('Слишком долго выполняется. Проверь результат чуть позже.');
    },
    [taskSlug, view.runningText]
  );

  const handleSubmit = async () => {
    if (!canRun || isSubmitting || isChecking) return;
    setIsSubmitting(true);
    setQueueStatus('Отправляем...');
    setCheckResult(null);
    setSubmitResult(null);
    try {
      const res = await fetch(`/api/tasks/${taskSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });
      const json = await res.json();
      if (!json.success || !json.jobId) {
        setSubmitResult(errorResult(length, json.error || 'Ошибка при отправке'));
        return;
      }
      const result = await pollJob(json.jobId);
      setSubmitResult(result);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      setSubmitResult(errorResult(length, error instanceof Error ? error.message : 'Ошибка соединения'));
    } finally {
      setIsSubmitting(false);
      setQueueStatus(null);
    }
  };

  const handleReset = () => {
    setCode('');
    setCheckResult(null);
    setSubmitResult(null);
  };

  const bestLength = board[0]?.codeLength ?? null;
  const busy = isChecking || isSubmitting;

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-lg font-semibold">Твоё решение</h2>
          {switcher}
        </div>

        <div className="mb-4 rounded-lg border border-border bg-background-tertiary/50 px-3 py-3 text-sm text-text-secondary">
          {bestLength !== null ? (
            <>
              Лучшее решение на {label} —{' '}
              <span className="font-mono text-accent-green font-semibold">{bestLength}</span>{' '}
              {pluralizeRu(bestLength, ['символ', 'символа', 'символов'])}
            </>
          ) : (
            <>Пока нет решений на {label} — стань первым.</>
          )}
          {own && (
            <>
              , твой рекорд —{' '}
              <span className="font-mono text-accent-blue font-semibold">{own.codeLength}</span>
              {` (место #${own.rank})`}
            </>
          )}
        </div>

        <div className="space-y-4 pb-24 sm:pb-0">
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-[rgb(var(--code-header))] px-3 sm:px-4 py-2 border-b border-[rgb(var(--code-border))] font-mono text-xs sm:text-sm flex items-center justify-between gap-3">
              <div className="min-w-0 truncate">
                <SignatureHeader language={language} signature={signature} />
              </div>
              <div className="text-[rgb(var(--code-muted))] whitespace-nowrap">
                <span className="text-[rgb(var(--code-text))]">Длина:</span>{' '}
                <span className="text-[rgb(var(--code-accent))] font-bold">{length}</span>
                <span className="hidden sm:inline"> символов</span>
              </div>
            </div>
            <div className="bg-[rgb(var(--code-bg))] flex items-stretch">
              <div className="flex-shrink-0 px-4 py-3 font-mono text-sm bg-[rgb(var(--code-header))] border-r border-[rgb(var(--code-border))] flex items-center">
                <span className="text-[rgb(var(--code-keyword))] select-none">=&gt;</span>
              </div>
              <div className="flex-1 min-w-0">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  disabled={isSubmitting}
                  placeholder={view.placeholder}
                  minimal
                />
              </div>
              {language === 'csharp' && (
                <div className="flex-shrink-0 px-3 py-3 font-mono text-sm text-[rgb(var(--code-muted))] bg-[rgb(var(--code-header))] border-l border-[rgb(var(--code-border))] flex items-center select-none">
                  ;
                </div>
              )}
            </div>
          </div>

          <LanguageHints language={language} />

          {hasCode && !validation.valid && <div className="text-sm text-accent-red">{validation.error}</div>}

          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            {isLoggedIn ? (
              <Button variant="primary" onClick={handleSubmit} disabled={!canRun || busy} loading={isSubmitting} icon={Send}>
                Отправить в рейтинг {label}
              </Button>
            ) : (
              <Link href={`/auth?returnTo=${returnTo}`}>
                <Button variant="secondary" icon={LogIn}>
                  Войти, чтобы отправить в рейтинг
                </Button>
              </Link>
            )}
            <Button variant="secondary" onClick={handleReset} disabled={busy || !code} icon={RotateCcw}>
              Сбросить
            </Button>
            <Button
              variant="ghost"
              onClick={handleCheck}
              disabled={!canRun || busy}
              icon={isChecking ? Loader2 : Play}
              className={isChecking ? '[&>svg]:animate-spin' : ''}
            >
              {isChecking ? view.checkingText : 'Проверить на сервере'}
            </Button>
          </div>

          <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
            <div className={cn('mx-auto max-w-3xl grid gap-2', isLoggedIn ? 'grid-cols-3' : 'grid-cols-2')}>
              {isLoggedIn ? (
                <Button variant="primary" onClick={handleSubmit} disabled={!canRun || busy} loading={isSubmitting} className="w-full">
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
                onClick={handleCheck}
                disabled={!canRun || busy}
                icon={isChecking ? Loader2 : Play}
                className={cn('w-full', isChecking ? '[&>svg]:animate-spin' : '')}
              >
                Проверить
              </Button>
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={busy || !code}
                icon={RotateCcw}
                className={cn('w-full', isLoggedIn ? '' : 'col-span-2')}
              >
                Сброс
              </Button>
            </div>
          </div>

          {isSubmitting && queueStatus && <div className="text-sm text-accent-blue">{queueStatus}</div>}

          {submitResult && (
            <ResultCard result={submitResult} kind="submit" label={label} callName={view.callName} />
          )}
          {checkResult && !submitResult && (
            <ResultCard result={checkResult} kind="check" label={label} callName={view.callName} />
          )}
        </div>
      </Card>

      {(testcases.length > 0 || hiddenTestsCount > 0) && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-base sm:text-lg font-semibold">Открытые тесты</h3>
            <span className="text-xs text-text-muted">на них работает проверка на сервере</span>
          </div>
          <div className="space-y-3">
            {testcases.map((testcase, index) => (
              <div key={index} className="p-3 rounded-lg border border-border bg-background-tertiary/50">
                <div className="text-sm font-medium mb-2">Тест {index + 1}</div>
                <div className="font-mono text-sm text-text-secondary space-y-1 break-all">
                  <div>
                    Ввод:{' '}
                    <span className="text-text-primary">
                      {view.callName}(
                      {(testcase.inputData.args || [])
                        .map((value, i) => (signature.args[i] ? view.formatValue(value, signature.args[i].type) : ''))
                        .join(', ')}
                      )
                    </span>
                  </div>
                  <div>
                    Ожидалось: <span className="text-text-primary">{testcase.expectedOutput}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hiddenTestsCount > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-dashed border-border bg-background-tertiary/30 text-sm text-text-secondary">
              И ещё {hiddenTestsCount}{' '}
              {pluralizeRu(hiddenTestsCount, ['скрытый тест', 'скрытых теста', 'скрытых тестов'])}: их
              сервер прогонит при отправке в рейтинг.
            </div>
          )}
          <div className="mt-3 rounded-md border border-border px-3 py-2 text-xs text-text-secondary bg-background-tertiary/40">
            Ответы у всех трёх языков общие и записаны так, как их печатает Python: массив —{' '}
            <span className="font-mono">[1, 2]</span>, строки в массиве — в кавычках{' '}
            <span className="font-mono">[&apos;a&apos;, &apos;b&apos;]</span>, логическое —{' '}
            <span className="font-mono">True</span>, дробное — <span className="font-mono">3.0</span>. Сайт переводит
            ответ сам: просто верни массив, логическое значение или число. В рейтинг решение попадает после
            проверки и на скрытых тестах.
          </div>
        </Card>
      )}

      <Card padding="lg">
        <TaskTabs
          leaderboard={board}
          taskSlug={taskSlug}
          refreshKey={refreshKey}
          currentUserRank={own?.rank}
          isLoggedIn={isLoggedIn}
          language={language}
        />
      </Card>
    </div>
  );
}

function SignatureHeader({ language, signature }: { language: TypedLanguage; signature: CsharpSignature }) {
  if (language === 'javascript') {
    return (
      <>
        <span className="text-[rgb(var(--code-keyword))]">const</span>{' '}
        <span className="text-[rgb(var(--code-func))]">solution</span>{' '}
        <span className="text-[rgb(var(--code-muted))]">= (</span>
        <span className="text-[rgb(var(--code-arg))]">{signature.args.map((a) => a.name).join(', ')}</span>
        <span className="text-[rgb(var(--code-muted))]">)</span>
      </>
    );
  }
  return (
    <>
      <span className="text-[rgb(var(--code-keyword))]">static</span>{' '}
      <span className="text-[rgb(var(--code-arg))]">{signature.returns}</span>{' '}
      <span className="text-[rgb(var(--code-func))]">Solution</span>
      <span className="text-[rgb(var(--code-muted))]">(</span>
      <span className="text-[rgb(var(--code-arg))]">
        {signature.args.map((a) => `${a.type} ${a.name}`).join(', ')}
      </span>
      <span className="text-[rgb(var(--code-muted))]">)</span>
    </>
  );
}

function LanguageHints({ language }: { language: TypedLanguage }) {
  if (language === 'javascript') {
    return (
      <div className="text-sm text-text-muted space-y-1">
        <div>
          Пиши только выражение — оно станет телом стрелочной функции после{' '}
          <span className="font-mono">=&gt;</span>. Точка с запятой не нужна.
        </div>
        <div className="text-xs">
          Язык — JavaScript (Node.js 20): стрелочные функции, <span className="font-mono">map</span>/
          <span className="font-mono">filter</span>/<span className="font-mono">reduce</span>, spread{' '}
          <span className="font-mono">[...s]</span>, <span className="font-mono">a.at(-1)</span>,{' '}
          <span className="font-mono">BigInt</span>. Можно присваивать новой переменной прямо в выражении:{' '}
          <span className="font-mono">(s=0,a.map(x=&gt;s+=x),s)</span>. Рекурсия — через{' '}
          <span className="font-mono">solution(...)</span>.
        </div>
        <div className="text-xs">
          Запрещено: <span className="font-mono">;</span>, <span className="font-mono">require</span>,{' '}
          <span className="font-mono">import</span>, <span className="font-mono">process</span>,{' '}
          <span className="font-mono">eval</span>, <span className="font-mono">Function</span>,{' '}
          <span className="font-mono">globalThis</span>. Питоновские запреты из условия к JavaScript не относятся.
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm text-text-muted space-y-1">
      <div>
        Пиши только выражение — оно станет телом метода после <span className="font-mono">=&gt;</span>. Точка с
        запятой не нужна.
      </div>
      <div className="text-xs">
        Подключено: <span className="font-mono">{CSHARP_USINGS.join(', ')}</span>. Язык — C# 9 (mono 6.12): LINQ,
        лямбды, <span className="font-mono">switch</span>-выражения, <span className="font-mono">a[^1]</span>; нет{' '}
        <span className="font-mono">.Order()</span> и <span className="font-mono">[1,2,3]</span>. Рекурсия — через{' '}
        <span className="font-mono">Solution(...)</span>.
      </div>
      <div className="text-xs">
        Запрещено: <span className="font-mono">;</span>, комментарии, <span className="font-mono">System.</span>,{' '}
        <span className="font-mono">Console</span>, <span className="font-mono">Environment</span>, рефлексия (
        <span className="font-mono">typeof</span>, <span className="font-mono">GetType</span>…). Питоновские запреты из
        условия к C# не относятся.
      </div>
    </div>
  );
}

function errorResult(length: number, message: string): RunResult {
  return { status: 'error', length, testsPassed: 0, testsTotal: 0, errorMessage: message, details: [] };
}

function ResultCard({
  result,
  kind,
  label,
  callName,
}: {
  result: RunResult;
  kind: 'check' | 'submit';
  label: string;
  callName: string;
}) {
  const passed = result.status === 'pass';
  const failedDetails = result.details.filter((d) => !d.passed);

  return (
    <div
      className={cn(
        'p-4 rounded-lg border animate-fade-in space-y-3',
        passed ? 'border-accent-green/30 bg-accent-green/5' : 'border-accent-red/30 bg-accent-red/5'
      )}
    >
      <div className="flex items-start gap-3">
        {passed ? (
          <CheckCircle className="w-6 h-6 text-accent-green flex-shrink-0" />
        ) : (
          <XCircle className="w-6 h-6 text-accent-red flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className={cn('font-bold text-lg', passed ? 'text-accent-green' : 'text-accent-red')}>
            {result.status === 'error'
              ? 'Не получилось проверить'
              : passed
                ? kind === 'check'
                  ? 'Открытые тесты пройдены!'
                  : 'Решение принято!'
                : `Пройдено ${result.testsPassed} из ${result.testsTotal}`}
          </div>
          <div className="text-sm text-text-secondary">
            Длина: <span className="font-mono font-bold">{result.length}</span>
            {kind === 'check' && passed && ' — отправь в рейтинг, там проверим и на скрытых тестах'}
          </div>
          {kind === 'submit' && passed && (
            <div className="text-sm text-text-secondary space-y-0.5">
              {result.place ? (
                <div>
                  Место в рейтинге {label}: #{result.place}
                </div>
              ) : null}
              {result.isNewBest && result.improvedBy ? (
                <div className="text-accent-green">Новый личный рекорд: короче на {result.improvedBy}!</div>
              ) : result.isNewBest ? (
                <div className="text-accent-green">Первое решение этой задачи на {label}!</div>
              ) : result.previousBestLength !== null && result.previousBestLength !== undefined ? (
                <div>Твой рекорд остаётся {result.previousBestLength} — попробуй ещё короче.</div>
              ) : null}
              {result.tookFirstPlaceFrom && (
                <div className="text-accent-green">Ты забрал первое место у {result.tookFirstPlaceFrom}!</div>
              )}
              {result.pointsEarned ? (
                <div className="text-accent-blue">
                  +{result.pointsEarned} {pluralizeRu(result.pointsEarned, ['очко', 'очка', 'очков'])}
                  {result.pointsBreakdown && result.pointsBreakdown.length > 0 && (
                    <span className="text-text-muted"> ({result.pointsBreakdown.join('; ')})</span>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {result.errorMessage && (
        <pre className="font-mono text-xs sm:text-sm whitespace-pre-wrap break-words rounded-md bg-background/60 border border-border px-3 py-2 text-text-primary">
          {result.errorMessage}
        </pre>
      )}

      {failedDetails.length > 0 && (
        <div className="space-y-2">
          {failedDetails.slice(0, 5).map((detail) =>
            detail.isHidden ? (
              <div key={detail.index} className="text-sm text-text-secondary">
                Скрытый тест не пройден{detail.error ? ` (${detail.error})` : ''}
              </div>
            ) : (
              <div
                key={detail.index}
                className="rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs sm:text-sm space-y-0.5 break-all"
              >
                <div>
                  <span className="text-text-muted">Ввод:</span> {callName}({detail.input})
                </div>
                {detail.error ? (
                  <div className="text-accent-red">{detail.error}</div>
                ) : (
                  <>
                    <div>
                      <span className="text-text-muted">Ожидалось:</span> {detail.expected}
                    </div>
                    <div>
                      <span className="text-text-muted">Получено:</span> {detail.actual}
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
