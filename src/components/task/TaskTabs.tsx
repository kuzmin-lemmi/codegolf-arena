// src/components/task/TaskTabs.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { LeaderboardTable, LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import { Lock, Code2, Trophy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

interface TaskTabsProps {
  leaderboard: LeaderboardEntry[];
  taskSlug: string;
  refreshKey?: number;
  currentUserRank?: number;
}

interface SolutionEntry {
  rank: number;
  nickname: string;
  code: string;
  codeLength: number;
  achievedAt: Date | string;
}

type TabId = 'description' | 'leaderboard' | 'solutions';

export function TaskTabs({
  leaderboard,
  taskSlug,
  refreshKey,
  currentUserRank,
}: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');
  const [solutions, setSolutions] = useState<SolutionEntry[]>([]);
  const [canViewSolutions, setCanViewSolutions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  const tabs = [
    { id: 'leaderboard' as const, label: 'Лидерборд', icon: Trophy },
    { id: 'solutions' as const, label: 'Решения', icon: Code2, locked: !canViewSolutions },
  ];

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.locked && setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
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
      </div>
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
