'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trophy, Users } from 'lucide-react';
import { Button, Card, TierBadge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { TaskTier } from '@/types';

interface TaskListItem {
  id: string;
  slug: string;
  title: string;
  tier: TaskTier;
  mode: 'practice' | 'tournament';
  functionSignature: string;
  statementMd: string;
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

export function TasksPageClient({ tasks, tierCounts }: TasksPageClientProps) {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<TierFilter>('all');

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (tier !== 'all' && task.tier !== tier) return false;
      if (!query) return true;
      return (
        task.title.toLowerCase().includes(query) ||
        task.slug.toLowerCase().includes(query) ||
        task.statementMd.toLowerCase().includes(query)
      );
    });
  }, [tasks, search, tier]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card padding="md" className="mb-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              className="input pl-10"
              placeholder="Поиск по названию или условию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
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
      </Card>

      {filteredTasks.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="text-text-secondary">Ничего не найдено</div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
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
      className={cn(active ? '' : 'text-text-secondary')}
    >
      {label}
    </Button>
  );
}

function TaskCard({ task }: { task: TaskListItem }) {
  const isTournament = task.mode === 'tournament';

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
