'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trophy, Users } from 'lucide-react';
import { Button, Card, TierBadge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { TaskTier } from '@/types';
import { useAuth } from '@/context/AuthContext';

interface TaskListItem {
  id: string;
  slug: string;
  title: string;
  tier: TaskTier;
  mode: 'practice' | 'tournament';
  functionSignature: string;
  statementMd: string;
  createdAt: Date | string;
  participantsCount: number;
  bestLength: number | null;
}

interface TasksPageClientProps {
  tasks: TaskListItem[];
  tierCounts: {
    all: number;
    bronze: number;
    silver: number;
    gold: number;
  };
}

type TierFilter = 'all' | TaskTier;
type ProgressFilter = 'all' | 'unsolved' | 'solved';
type SortMode = 'popular' | 'new' | 'records';

export function TasksPageClient({ tasks, tierCounts }: TasksPageClientProps) {
  const { isLoggedIn } = useAuth();
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<TierFilter>('all');
  const [progress, setProgress] = useState<ProgressFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('popular');
  const [solvedSlugs, setSolvedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn) {
      setSolvedSlugs(new Set());
      return;
    }

    const fetchSolved = async () => {
      try {
        const res = await fetch('/api/profile');
        const json = await res.json();
        if (!json.success) return;
        const slugs = (json.data?.solvedTasks || []).map((t: any) => t.slug);
        setSolvedSlugs(new Set(slugs));
      } catch {
        // ignore
      }
    };

    fetchSolved();
  }, [isLoggedIn]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = tasks.filter((task) => {
      if (tier !== 'all' && task.tier !== tier) return false;

      const solved = solvedSlugs.has(task.slug);
      if (progress === 'solved' && !solved) return false;
      if (progress === 'unsolved' && solved) return false;

      if (!query) return true;
      return (
        task.title.toLowerCase().includes(query) ||
        task.slug.toLowerCase().includes(query) ||
        task.statementMd.toLowerCase().includes(query)
      );
    });

    list.sort((a, b) => {
      if (sortMode === 'new') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === 'records') {
        if (a.bestLength === null && b.bestLength === null) return 0;
        if (a.bestLength === null) return 1;
        if (b.bestLength === null) return -1;
        return a.bestLength - b.bestLength;
      }
      return b.participantsCount - a.participantsCount;
    });

    return list;
  }, [tasks, search, tier, progress, sortMode, solvedSlugs]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card padding="md" className="mb-6">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="input h-11 pl-10"
              placeholder="Поиск по названию или условию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
            <FilterButton
              active={tier === 'all'}
              onClick={() => setTier('all')}
              label={`Все (${tierCounts.all})`}
            />
            <FilterButton
              active={tier === 'bronze'}
              onClick={() => setTier('bronze')}
              label={`Bronze (${tierCounts.bronze})`}
            />
            <FilterButton
              active={tier === 'silver'}
              onClick={() => setTier('silver')}
              label={`Silver (${tierCounts.silver})`}
            />
            <FilterButton
              active={tier === 'gold'}
              onClick={() => setTier('gold')}
              label={`Gold (${tierCounts.gold})`}
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          <FilterButton
            active={progress === 'all'}
            onClick={() => setProgress('all')}
            label="Все статусы"
          />
          <FilterButton
            active={progress === 'unsolved'}
            onClick={() => setProgress('unsolved')}
            label="Ещё не решал"
          />
          <FilterButton
            active={progress === 'solved'}
            onClick={() => setProgress('solved')}
            label="Уже решал"
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-text-muted">
            Показано задач: <span className="text-text-primary font-medium">{filteredTasks.length}</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-xs text-text-muted whitespace-nowrap">Сортировка:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="input h-10 py-1 text-sm w-full sm:w-auto sm:min-w-[220px]"
            >
              <option value="popular">Самые популярные</option>
              <option value="new">Новые</option>
              <option value="records">С рекордами</option>
            </select>
          </div>
        </div>
      </Card>

      {filteredTasks.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="text-text-secondary mb-3">Ничего не найдено</div>
          <Link href="/tasks">
            <Button variant="secondary" size="sm">Сбросить фильтры</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} solved={solvedSlugs.has(task.slug)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      size="sm"
      onClick={onClick}
      className={cn('whitespace-nowrap min-h-9', active ? '' : 'text-text-secondary')}
    >
      {label}
    </Button>
  );
}

function TaskCard({ task, solved }: { task: TaskListItem; solved: boolean }) {
  const isTournament = task.mode === 'tournament';
  const solvePoints = task.tier === 'bronze' ? 10 : task.tier === 'silver' ? 20 : 30;

  return (
    <Card hover padding="md" className="group">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={task.tier} />
            {isTournament && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-yellow/20 text-accent-yellow">
                <Trophy className="w-3 h-3" />
                Турнир
              </span>
            )}
          </div>
          <Link
            href={`/task/${task.slug}`}
            className="text-lg font-semibold text-text-primary group-hover:text-accent-blue"
          >
            {task.title}
          </Link>
          <div className="text-sm text-text-secondary line-clamp-2">
            {task.statementMd.split('\n')[0]}
          </div>
          <div className="text-xs font-mono text-text-muted">
            {task.functionSignature}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge bg-background-tertiary text-text-secondary border border-border/60">
              Первое решение: +{solvePoints}
            </span>
            <span className="badge bg-background-tertiary text-text-secondary border border-border/60">
              Топ-1: +25
            </span>
            {solved && (
              <span className="badge bg-accent-green/15 text-accent-green border border-accent-green/30">
                Уже решена
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Users className="w-4 h-4" />
            {task.participantsCount} участников
          </div>
          <div className="text-sm">
            {task.bestLength ? (
              <span className="font-mono font-semibold text-accent-green">
                Лучший: {task.bestLength}
              </span>
            ) : (
              <span className="text-text-muted">Пока нет решений</span>
            )}
          </div>
          <Link href={`/task/${task.slug}`}>
            <Button size="sm" variant="secondary">
              Открыть
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
