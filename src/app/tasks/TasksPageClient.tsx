'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trophy, Users } from 'lucide-react';
import { Button, Card, TierBadge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { TaskTier } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { topicLabel } from '@/lib/task-topics';

interface TaskListItem {
  id: string;
  slug: string;
  title: string;
  tier: TaskTier;
  mode: 'practice' | 'tournament';
  functionSignature: string;
  statementMd: string;
  topics: string[];
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
  const [topic, setTopic] = useState<string>('all');
  const [solvedSlugs, setSolvedSlugs] = useState<Set<string>>(new Set());

  const topicOptions = useMemo(() => {
    const set = new Set<string>();
    for (const task of tasks) {
      for (const value of task.topics || []) {
        const normalized = String(value).trim().toLowerCase();
        if (normalized) set.add(normalized);
      }
    }
    return ['all', ...Array.from(set).sort()];
  }, [tasks]);

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

      if (topic !== 'all' && !(task.topics || []).includes(topic)) return false;

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
  }, [tasks, search, tier, topic, progress, sortMode, solvedSlugs]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card padding="md" className="mb-6 border-accent-blue/20">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="input h-11 pl-10 bg-background-tertiary/70 border-accent-blue/30 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 text-text-primary font-mono"
              placeholder="// Поиск по названию или условию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
             <FilterButton
               active={tier === 'all'}
               onClick={() => setTier('all')}
               label={`ВСЕ (${tierCounts.all})`}
               className={tier === 'all' ? 'neon-button' : 'neon-button-secondary'}
             />
             <FilterButton
               active={tier === 'bronze'}
               onClick={() => setTier('bronze')}
               label={`BRONZE (${tierCounts.bronze})`}
               className={tier === 'bronze' ? 'neon-button' : 'neon-button-secondary'}
             />
             <FilterButton
               active={tier === 'silver'}
               onClick={() => setTier('silver')}
               label={`SILVER (${tierCounts.silver})`}
               className={tier === 'silver' ? 'neon-button' : 'neon-button-secondary'}
             />
             <FilterButton
               active={tier === 'gold'}
               onClick={() => setTier('gold')}
               label={`GOLD (${tierCounts.gold})`}
               className={tier === 'gold' ? 'neon-button' : 'neon-button-secondary'}
             />

          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          <FilterButton
            active={progress === 'all'}
            onClick={() => setProgress('all')}
            label="ВСЕ СТАТУСЫ"
            className={progress === 'all' ? 'neon-button' : 'neon-button-secondary'}
          />
          <FilterButton
            active={progress === 'unsolved'}
            onClick={() => setProgress('unsolved')}
            label="ЕЩЁ НЕ РЕШАЛ"
            className={progress === 'unsolved' ? 'neon-button' : 'neon-button-secondary'}
          />
          <FilterButton
            active={progress === 'solved'}
            onClick={() => setProgress('solved')}
            label="УЖЕ РЕШАЛ"
            className={progress === 'solved' ? 'neon-button' : 'neon-button-secondary'}
          />
        </div>

        {topicOptions.length > 1 && (
          <div className="mt-4">
            <div className="text-xs text-text-muted font-mono mb-2">ТЕМЫ</div>
            <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
              {topicOptions.map((topicOption) => (
                <FilterButton
                  key={topicOption}
                  active={topic === topicOption}
                  onClick={() => setTopic(topicOption)}
                  label={topicOption === 'all' ? 'ВСЕ ТЕМЫ' : topicLabel(topicOption).toUpperCase()}
                  className={topic === topicOption ? 'neon-button' : 'neon-button-secondary'}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-text-muted font-mono">
            Показано задач: <span className="text-accent-blue font-bold">{filteredTasks.length}</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-xs text-text-muted whitespace-nowrap font-mono">СОРТИРОВКА:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="input h-10 py-1 text-sm w-full sm:w-auto sm:min-w-[220px] font-mono bg-background-tertiary/70 border-accent-blue/30 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 text-text-primary"
            >
              <option value="popular">САМЫЕ ПОПУЛЯРНЫЕ</option>
              <option value="new">НОВЫЕ</option>
              <option value="records">С РЕКОРДАМИ</option>
            </select>

          </div>
        </div>
      </Card>

      {filteredTasks.length === 0 ? (
        <Card padding="lg" className="text-center border-accent-red/20">
          <div className="text-text-secondary mb-3 font-mono">// НИЧЕГО НЕ НАЙДЕНО</div>
          <Link href="/tasks">
            <Button variant="secondary" size="sm" className="neon-button-secondary">СБРОСИТЬ ФИЛЬТРЫ</Button>
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
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      size="sm"
      onClick={onClick}
      className={cn('whitespace-nowrap min-h-9', active ? '' : 'text-text-secondary', className)}
    >
      {label}
    </Button>
  );
}

function TaskCard({ task, solved }: { task: TaskListItem; solved: boolean }) {
  const isTournament = task.mode === 'tournament';
  const solvePoints = task.tier === 'bronze' ? 10 : task.tier === 'silver' ? 20 : 30;

  return (
    <Card hover padding="md" className={cn(
      "group relative overflow-hidden ",
      solved ? "border-accent-green/50 shadow-[0_0_15px_rgba(0,255,255,0.2)]" : ""
    )}>
      {solved && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-accent-green/20 text-accent-green text-xs font-mono rounded-none border border-accent-green/40">
          // РЕШЕНО
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={task.tier} />
            {isTournament && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-none bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40">
                <Trophy className="w-3 h-3" />
                ТУРНИР
              </span>
            )}
          </div>
          <Link
            href={`/task/${task.slug}`}
            className="text-xl font-bold text-text-primary group-hover:text-accent-blue transition-colors font-mono tracking-wide"
          >
            {task.title.toUpperCase()}
          </Link>
          <div className="text-sm text-text-secondary line-clamp-2 font-mono">
            // {task.statementMd.split('\n')[0]}
          </div>
          <div className="text-xs font-mono text-text-muted">
            {task.functionSignature}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge bg-background-tertiary/50 text-text-secondary border border-border/60 font-mono">
              ПЕРВОЕ РЕШЕНИЕ: +{solvePoints}
            </span>
            <span className="badge bg-background-tertiary/50 text-text-secondary border border-border/60 font-mono">
              ТОП-1: +25
            </span>
            {(task.topics || []).slice(0, 4).map((topic) => (
              <span key={topic} className="badge bg-accent-blue/10 text-accent-blue border border-accent-blue/30 font-mono">
                #{topicLabel(topic).toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex items-center gap-2 text-sm text-text-secondary font-mono">
            <Users className="w-4 h-4 text-accent-blue" />
            {task.participantsCount} УЧАСТНИКОВ
          </div>
          <div className="text-lg font-mono">
            {task.bestLength ? (
              <span className="font-bold text-accent-green drop-shadow-[0_0_5px_rgba(0,255,255,0.4)]">
                РЕКОРД: {task.bestLength}
              </span>
            ) : (
              <span className="text-text-muted">// НЕТ РЕКОРДОВ</span>
            )}
          </div>
          <Link href={`/task/${task.slug}`}>
            <Button size="sm" variant="secondary" className="neon-button-secondary">
              ОТКРЫТЬ
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
