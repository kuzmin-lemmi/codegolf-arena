// src/components/task/TaskTabs.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn, pluralizeRu } from '@/lib/utils';
import { LeaderboardTable, LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import {
  Lock,
  Code2,
  Trophy,
  Loader2,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogIn,
  Scissors,
} from 'lucide-react';
import { Button } from '@/components/ui';

interface TaskTabsProps {
  leaderboard: LeaderboardEntry[];
  taskSlug: string;
  refreshKey?: number;
  currentUserRank?: number;
  isLoggedIn?: boolean;
}

interface SolutionEntry {
  rank: number;
  nickname: string;
  code: string;
  codeLength: number;
  achievedAt: Date | string;
}

type TabId = 'description' | 'leaderboard' | 'solutions' | 'attempts';

interface SubmissionAttempt {
  id: string;
  status: 'pending' | 'pass' | 'fail' | 'error';
  codeLength: number;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  errorMessage: string | null;
  createdAt: Date | string;
}

interface SubmissionRecord {
  submissionId: string;
  codeLength: number;
  createdAt: Date | string;
  savedChars: number | null;
}

interface SubmissionHistory {
  attempts: SubmissionAttempt[];
  records: SubmissionRecord[];
  stats: {
    attemptsTotal: number;
    passesTotal: number;
    firstLength: number | null;
    bestLength: number | null;
    totalSaved: number;
    improvements: number;
  };
}

export function TaskTabs({
  leaderboard,
  taskSlug,
  refreshKey,
  currentUserRank,
  isLoggedIn = false,
}: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');
  const [solutions, setSolutions] = useState<SolutionEntry[]>([]);
  const [canViewSolutions, setCanViewSolutions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<SubmissionHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSolutions = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskSlug}/solutions`);
        const json = await res.json();

        if (!isMounted) return;

        if (!json.success) {
          setCanViewSolutions(false);
          setSolutions([]);
          setMessage(json.error || 'Не удалось загрузить решения');
          return;
        }

        setCanViewSolutions(!!json.data?.canView);
        setSolutions(json.data?.solutions || []);
        setMessage(json.data?.message || null);
      } catch (error) {
        if (!isMounted) return;
        setCanViewSolutions(false);
        setSolutions([]);
        setMessage('Не удалось загрузить решения');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSolutions();
    return () => {
      isMounted = false;
    };
  }, [taskSlug, refreshKey]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHistory(null);
      setHistoryError(null);
      return;
    }

    let isMounted = true;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskSlug}/submissions`, { cache: 'no-store' });
        const json = await res.json();

        if (!isMounted) return;

        if (!json.success) {
          setHistory(null);
          setHistoryError(json.error || 'Не удалось загрузить историю попыток');
          return;
        }

        setHistory(json.data || null);
        setHistoryError(null);
      } catch {
        if (!isMounted) return;
        setHistory(null);
        setHistoryError('Не удалось загрузить историю попыток');
      } finally {
        if (isMounted) {
          setHistoryLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [taskSlug, refreshKey, isLoggedIn]);

  const tabs = [
    { id: 'leaderboard' as const, label: 'Лидерборд', icon: Trophy },
    { id: 'solutions' as const, label: 'Решения', icon: Code2, locked: !canViewSolutions },
    { id: 'attempts' as const, label: 'Мои попытки', icon: History },
  ];

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-1 -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveTab(tab.id)}
            className={cn(
              'shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'text-accent-blue border-accent-blue'
                : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border',
              tab.locked && 'opacity-50 cursor-not-allowed'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.locked && <Lock className="w-3 h-3 ml-1" />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'leaderboard' && (
          <LeaderboardContent
            entries={leaderboard}
            currentUserRank={currentUserRank}
          />
        )}

        {activeTab === 'solutions' && (
          <SolutionsContent
            solutions={solutions}
            canView={canViewSolutions}
            message={message}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'attempts' && (
          <SubmissionHistoryContent
            history={history}
            error={historyError}
            isLoading={historyLoading}
            isLoggedIn={isLoggedIn}
            taskSlug={taskSlug}
          />
        )}
      </div>
    </div>
  );
}

function SubmissionHistoryContent({
  history,
  error,
  isLoading,
  isLoggedIn,
  taskSlug,
}: {
  history: SubmissionHistory | null;
  error: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  taskSlug: string;
}) {
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <LogIn className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">История попыток — для своих</h3>
        <p className="text-text-secondary max-w-sm mb-4">
          Войди, и здесь будет видно, как твой рекорд по задаче становится короче.
        </p>
        <Link href={`/auth?returnTo=${encodeURIComponent(`/task/${taskSlug}`)}`}>
          <Button variant="primary" size="sm">
            Войти
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Загрузка попыток</h3>
        <p className="text-text-secondary">Подождите немного</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-accent-yellow" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Не удалось загрузить</h3>
        <p className="text-text-secondary max-w-sm">{error}</p>
      </div>
    );
  }

  const attempts = history?.attempts || [];

  if (attempts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Пока нет попыток</h3>
        <p className="text-text-secondary">Отправь первое решение и здесь появится история.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history && history.records.length > 0 && <RecordProgress history={history} />}

      <div className="space-y-3">
        {attempts.map((entry) => (
          <div key={entry.id} className="p-3 rounded-lg border border-border bg-background-tertiary/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                {entry.status === 'pass' ? (
                  <CheckCircle2 className="w-4 h-4 text-accent-green" />
                ) : entry.status === 'fail' ? (
                  <XCircle className="w-4 h-4 text-accent-red" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-accent-yellow" />
                )}
                <span className="font-medium uppercase">{entry.status}</span>
                <span className="text-text-muted">{new Date(entry.createdAt).toLocaleString('ru-RU')}</span>
              </div>
              <span className="font-mono text-accent-blue">{entry.codeLength} симв.</span>
            </div>

            <div className="mt-2 text-xs text-text-secondary flex flex-wrap gap-3">
              <span>
                Тесты: {entry.testsPassed}/{entry.testsTotal}
              </span>
              {entry.runtimeMs !== null && <span>Время: {entry.runtimeMs} мс</span>}
              {entry.errorMessage && <span className="text-accent-red">{entry.errorMessage}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * «Было 47 → 38 → 31»: видно собственный прогресс по задаче.
 */
function RecordProgress({ history }: { history: SubmissionHistory }) {
  const { records, stats } = history;

  return (
    <div className="rounded-lg border border-accent-green/30 bg-accent-green/5 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Scissors className="w-4 h-4 text-accent-green" />
          Твой прогресс по задаче
        </div>
        {stats.totalSaved > 0 && (
          <div className="text-xs text-text-secondary">
            срезано{' '}
            <span className="font-mono font-bold text-accent-green">{stats.totalSaved}</span>{' '}
            {pluralizeRu(stats.totalSaved, ['символ', 'символа', 'символов'])} за {stats.improvements}{' '}
            {pluralizeRu(stats.improvements, ['улучшение', 'улучшения', 'улучшений'])}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {records.map((record, index) => (
          <div key={record.submissionId} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-text-muted">→</span>}
            <span
              className={cn(
                'inline-flex flex-col items-center px-2 py-1 rounded-md border font-mono',
                index === records.length - 1
                  ? 'border-accent-green/60 bg-accent-green/10 text-accent-green font-bold'
                  : 'border-border bg-background-tertiary/60 text-text-secondary'
              )}
              title={new Date(record.createdAt).toLocaleString('ru-RU')}
            >
              <span className="text-sm">{record.codeLength}</span>
              {record.savedChars ? (
                <span className="text-[10px] text-text-muted">−{record.savedChars}</span>
              ) : (
                <span className="text-[10px] text-text-muted">старт</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {stats.totalSaved === 0 && records.length === 1 && (
        <p className="mt-3 text-xs text-text-secondary">
          Рекорд поставлен. Теперь самое интересное — укоротить его: за это дают очки.
        </p>
      )}
    </div>
  );
}

function LeaderboardContent({
  entries,
  currentUserRank,
}: {
  entries: LeaderboardEntry[];
  currentUserRank?: number;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Trophy className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Рейтинг пока пуст</h3>
        <p className="text-text-secondary max-w-sm mb-4">
          Будь первым в таблице этой задачи и задай ориентир для остальных.
        </p>
        <Link href="https://t.me/codegolf_arena" target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm">Обсудить в чате</Button>
        </Link>
      </div>
    );
  }

  // Отмечаем текущего пользователя
  const entriesWithCurrentUser = entries.map((entry) => ({
    ...entry,
    isCurrentUser: entry.rank === currentUserRank,
  }));

  return (
    <LeaderboardTable
      entries={entriesWithCurrentUser}
      emptyMessage="Пока никто не решил эту задачу. Будь первым!"
    />
  );
}

function SolutionsContent({
  solutions,
  canView,
  message,
  isLoading,
}: {
  solutions: SolutionEntry[];
  canView: boolean;
  message?: string | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-text-muted animate-spin" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Загрузка решений</h3>
        <p className="text-text-secondary">Подождите немного</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Решения скрыты</h3>
        <p className="text-text-secondary max-w-sm">
          {message || 'Решите задачу, чтобы увидеть решения других участников'}
        </p>
      </div>
    );
  }

  if (solutions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Code2 className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Нет решений</h3>
        <p className="text-text-secondary">
          Пока никто не открыл решения. Реши задачу, и здесь появятся лучшие подходы.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Лучшие решения других участников
      </p>
      <div className="space-y-3">
        {solutions.map((solution) => (
          <SolutionCard key={solution.rank} solution={solution} />
        ))}
      </div>
    </div>
  );
}

function SolutionCard({ solution }: { solution: SolutionEntry }) {
  return (
    <div className="p-4 bg-background-secondary rounded-lg border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-text-muted">#{solution.rank}</span>
          <span className="font-medium">{solution.nickname}</span>
        </div>
        <span className="font-mono text-accent-green font-bold">
          Длина: {solution.codeLength}
        </span>
      </div>
      <div className="p-3 bg-background-tertiary rounded-md overflow-x-auto">
        <code className="font-mono text-sm text-accent-blue whitespace-pre">
          {solution.code}
        </code>
      </div>
    </div>
  );
}
