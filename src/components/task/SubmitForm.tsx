// src/components/task/SubmitForm.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CodeEditor } from './CodeEditor';
import { Button } from '@/components/ui';
import { Send, RotateCcw, Play, CheckCircle, XCircle, Loader2, LogIn, Download } from 'lucide-react';
import { validateOneliner, calculateCodeLength, cn } from '@/lib/utils';
import { usePyodide } from '@/hooks/usePyodide';
import { SubmissionStatus } from '@/types';

interface SubmitFormProps {
  taskSlug: string;
  isLoggedIn?: boolean;
  functionArgs?: string[];
  testcases?: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
  allowedImports?: string[];
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
  isLoggedIn = false,
  functionArgs = ['s'],
  testcases = [],
  allowedImports = [],
}: SubmitFormProps) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [localResult, setLocalResult] = useState<LocalCheckResult | null>(null);

  const { isLoading: pyodideLoading, loadProgress, checkCode } = usePyodide();

  const validation = validateOneliner(code);
  const length = calculateCodeLength(code);
  const canSubmit = validation.valid && code.trim().length > 0;

  // Отправка решения (для авторизованных)
  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
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

      setResult(data.data);
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
    }
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
  };

  return (
    <div className="space-y-4">
      {/* Code Editor */}
      {/* Visual code scaffold */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Static header - function definition */}
        <div className="bg-[#1a1f2a] px-4 py-2 border-b border-border/50 font-mono text-sm flex items-center justify-between">
          <div>
            <span className="text-[#c586c0]">def</span>{' '}
            <span className="text-[#dcdcaa]">solution</span>
            <span className="text-text-muted">(</span>
            <span className="text-[#9cdcfe]">{functionArgs.join(', ')}</span>
            <span className="text-text-muted">):</span>
          </div>
          <div className="text-text-muted">
            <span className="text-text-secondary">Длина:</span>{' '}
            <span className="text-[#9cdcfe] font-bold">{length}</span>
            <span className="text-text-muted"> символов</span>
          </div>
        </div>
        
        {/* Return line with editable expression */}
        <div className="bg-[#1e1e1e] flex items-stretch">
          {/* Static return keyword */}
          <div className="flex-shrink-0 px-4 py-3 font-mono text-sm bg-[#1a1f2a] border-r border-border/50 flex items-center">
            <span className="text-text-muted select-none">    </span>
            <span className="text-[#c586c0] select-none">return</span>
            <span className="text-text-muted select-none ml-1"> </span>
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
      <div className="flex flex-wrap items-center gap-3">
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
          <Link href="/auth">
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

      {/* Server result */}
      {result && <SubmitResultCard result={result} />}

      {/* Local check result */}
      {localResult && !result && (
        <LocalCheckResultCard 
          result={localResult} 
          isLoggedIn={isLoggedIn}
        />
      )}
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
  isLoggedIn 
}: { 
  result: LocalCheckResult; 
  isLoggedIn: boolean;
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
              <Link href="/auth">
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
  const [viewMode, setViewMode] = useState<'all' | 'fail'>('all');
  const [expandedTests, setExpandedTests] = useState<Record<number, boolean>>({});
  const failedTests = details.filter((d) => !d.passed);
  const visibleTests = viewMode === 'all' ? details : failedTests;
  const hiddenCount = Math.max(0, testsTotal - details.length);

  if (details.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-text-secondary">
          Тесты: <span className="text-text-primary font-medium">{testsPassed}</span> из{' '}
          <span className="text-text-primary font-medium">{testsTotal}</span>
          {hiddenCount > 0 && (
            <span className="text-text-muted"> · скрытых: {hiddenCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full border transition-colors',
              viewMode === 'all'
                ? 'border-accent-blue text-accent-blue bg-accent-blue/10'
                : 'border-border text-text-muted hover:text-text-primary'
            )}
          >
            Все
          </button>
          <button
            onClick={() => setViewMode('fail')}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full border transition-colors',
              viewMode === 'fail'
                ? 'border-accent-red text-accent-red bg-accent-red/10'
                : 'border-border text-text-muted hover:text-text-primary'
            )}
          >
            Только ошибки
          </button>
        </div>
      </div>

      {hiddenCount > 0 && (
        <div className="mt-2 text-xs text-text-muted">
          Скрытые тесты проверяются при отправке в рейтинг.
        </div>
      )}

      <div className="mt-3 space-y-2">
        {visibleTests.map((test) => (
          <div
            key={test.index}
            className={cn(
              'p-3 rounded-lg text-sm border',
              test.passed
                ? 'border-accent-green/30 bg-accent-green/5'
                : 'border-accent-red/30 bg-accent-red/5'
            )}
          >
            <div className="flex items-center justify-between gap-2">
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
              {(test.passed || test.actual || test.expected) && (
                <button
                  onClick={() =>
                    setExpandedTests((prev) => ({
                      ...prev,
                      [test.index]: !prev[test.index],
                    }))
                  }
                  className="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {expandedTests[test.index] ? 'Скрыть детали' : 'Показать детали'}
                </button>
              )}
            </div>
            {test.input && (
              <div className="font-mono text-xs text-text-muted mt-2">Ввод: {test.input}</div>
            )}
            {(!test.passed || expandedTests[test.index]) && (
              <div className="font-mono text-xs text-text-muted mt-2 space-y-0.5">
                {test.expected && <div>Ожидалось: {test.expected}</div>}
                {test.actual && <div>Получено: {test.actual}</div>}
                {test.error && <div className="text-accent-red">{test.error}</div>}
              </div>
            )}
          </div>
        ))}
        {viewMode === 'fail' && failedTests.length === 0 && (
          <div className="text-sm text-text-muted">Ошибок нет — все тесты пройдены.</div>
        )}
      </div>
    </div>
  );
}
