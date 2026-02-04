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
      <div className="text-sm text-text-secondary">
        Вводи только выражение — оно подставится после <span className="font-mono">return</span>.
      </div>

      <div className="rounded-lg border border-border bg-background-tertiary p-3 font-mono text-sm text-text-muted">
        <div>def solution(s):</div>
        <div>    return &lt;твой код&gt;</div>
      </div>

      <CodeEditor
        value={code}
        onChange={setCode}
        disabled={isSubmitting}
        placeholder="<твой код>"
      />

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          loading={isSubmitting}
          icon={Send}
        >
          {isLoggedIn ? 'Отправить' : 'Отправить (без рейтинга)'}
        </Button>

        {!isLoggedIn && (
          <Link href="/auth">
            <Button variant="secondary" icon={LogIn}>
              Войти для рейтинга
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
        'p-4 rounded-lg border animate-fade-in',
        isPassed && 'bg-accent-green/10 border-accent-green/30',
        isFailed && 'bg-accent-red/10 border-accent-red/30',
        isError && 'bg-accent-yellow/10 border-accent-yellow/30'
      )}
    >
      <div className="flex items-center gap-3">
        {isPassed && (
          <>
            <CheckCircle className="w-6 h-6 text-accent-green" />
            <div>
              <div className="font-semibold text-accent-green text-lg">
                PASS
                {result.place && (
                  <span className="ml-2 text-text-primary">
                    Ты на {result.place} месте!
                  </span>
                )}
              </div>
              <div className="text-sm text-text-secondary">
                {result.isNewBest ? 'Новый лучший результат: ' : 'Твой результат: '}
                <span className="font-mono font-bold text-text-primary">{result.length}</span> символов
              </div>
            </div>
          </>
        )}

        {isFailed && (
          <>
            <XCircle className="w-6 h-6 text-accent-red" />
            <div>
              <div className="font-semibold text-accent-red text-lg">FAIL</div>
              <div className="text-sm text-text-secondary">
                Пройдено тестов: {result.testsPassed} из {result.testsTotal}
              </div>
            </div>
          </>
        )}

        {isError && (
          <>
            <XCircle className="w-6 h-6 text-accent-yellow" />
            <div>
              <div className="font-semibold text-accent-yellow text-lg">Ошибка</div>
              <div className="text-sm text-text-secondary">
                {result.errorMessage || 'Произошла ошибка при выполнении'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Test details */}
      {result.details && result.details.length > 0 && (
        <TestDetails details={result.details} />
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
        'p-4 rounded-lg border animate-fade-in',
        isPassed ? 'bg-accent-blue/10 border-accent-blue/30' : 'bg-accent-red/10 border-accent-red/30'
      )}
    >
      <div className="flex items-start gap-3">
        {isPassed ? (
          <CheckCircle className="w-6 h-6 text-accent-blue flex-shrink-0" />
        ) : (
          <XCircle className="w-6 h-6 text-accent-red flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="font-semibold text-lg">
            {isPassed ? (
              <span className="text-accent-blue">Все тесты пройдены!</span>
            ) : (
              <span className="text-accent-red">
                Пройдено {result.testsPassed} из {result.testsTotal} тестов
              </span>
            )}
          </div>
          
          <div className="text-sm text-text-secondary mb-2">
            Длина: <span className="font-mono font-bold text-text-primary">{result.length}</span> символов
            {result.totalTime > 0 && (
              <span className="ml-2">• {result.totalTime.toFixed(0)} мс</span>
            )}
          </div>

          {isPassed && !isLoggedIn && (
            <div className="mt-3 p-3 bg-background-tertiary rounded-lg">
              <div className="text-sm text-text-secondary mb-2">
                🏆 Хочешь попасть в рейтинг?
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
            <TestDetails details={result.details} />
          )}
        </div>
      </div>
    </div>
  );
}

function TestDetails({ details }: { details: TestResultDetail[] }) {
  const [expanded, setExpanded] = useState(false);
  const failedTests = details.filter((d) => !d.passed);
  const showDetails = expanded ? details : failedTests.slice(0, 3);

  if (details.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        {expanded ? '▼ Скрыть детали' : `▶ Показать детали (${failedTests.length} ошибок)`}
      </button>
      
      {(expanded || failedTests.length > 0) && (
        <div className="mt-2 space-y-2">
          {showDetails.map((test) => (
            <div
              key={test.index}
              className={cn(
                'p-3 rounded-lg text-sm',
                test.passed ? 'bg-accent-green/5' : 'bg-accent-red/5'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {test.passed ? (
                  <CheckCircle className="w-4 h-4 text-accent-green" />
                ) : (
                  <XCircle className="w-4 h-4 text-accent-red" />
                )}
                <span className="font-medium">Тест {test.index + 1}</span>
              </div>
              {!test.passed && (
                <div className="font-mono text-xs text-text-muted mt-1 space-y-0.5">
                  {test.input && <div>Ввод: {test.input}</div>}
                  {test.expected && <div>Ожидалось: {test.expected}</div>}
                  {test.actual && <div>Получено: {test.actual}</div>}
                  {test.error && <div className="text-accent-red">{test.error}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
