// src/components/task/TaskTabs.tsx

'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LeaderboardTable, LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import { Lock, Code2, Trophy, FileText } from 'lucide-react';

interface TaskTabsProps {
  leaderboard: LeaderboardEntry[];
  solutions?: SolutionEntry[];
  canViewSolutions: boolean;
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
  solutions = [],
  canViewSolutions,
  currentUserRank,
}: TaskTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');

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
}: {
  solutions: SolutionEntry[];
  canView: boolean;
}) {
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-text-muted" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Решения скрыты</h3>
        <p className="text-text-secondary max-w-sm">
          Решите задачу, чтобы увидеть решения других участников
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
          Пока нет решений для отображения
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
