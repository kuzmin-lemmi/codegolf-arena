'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, Eye, EyeOff, Play, Pause } from 'lucide-react';
import { Card, Button, Input, TierBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn, formatDate } from '@/lib/utils';

interface CompetitionItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  showSolutions: boolean;
  tasks: Array<{
    task: { title: string; tier: 'bronze' | 'silver' | 'gold'; slug: string };
  }>;
  _count: { entries: number };
}

export default function AdminCompetitionsPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [competitions, setCompetitions] = useState<CompetitionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchCompetitions = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const res = await fetch('/api/competitions', { credentials: 'include' });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || 'Не удалось загрузить соревнования');
          return;
        }
        setCompetitions(json.data || []);
      } catch (err) {
        setError('Не удалось загрузить соревнования');
      } finally {
        setIsFetching(false);
      }
    };

    fetchCompetitions();
  }, [user?.isAdmin]);

  const filteredCompetitions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return competitions;
    return competitions.filter((c) => c.title.toLowerCase().includes(query));
  }, [competitions, searchQuery]);

  const handleToggleActive = async (competition: CompetitionItem) => {
    const nextValue = !competition.isActive;
    const res = await fetch(`/api/competitions/${competition.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: nextValue }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось обновить');
      return;
    }

    setCompetitions((prev) =>
      prev.map((c) => (c.id === competition.id ? { ...c, isActive: nextValue } : c))
    );
  };

  const handleToggleSolutions = async (competition: CompetitionItem) => {
    const nextValue = !competition.showSolutions;
    const res = await fetch(`/api/competitions/${competition.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ showSolutions: nextValue }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось обновить');
      return;
    }

    setCompetitions((prev) =>
      prev.map((c) => (c.id === competition.id ? { ...c, showSolutions: nextValue } : c))
    );
  };

  if (isLoading || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад в админку
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Соревнования</h1>
              <p className="text-text-secondary">{competitions.length} всего</p>
            </div>
            <Link href="/admin/competitions/new">
              <Button variant="primary" icon={Plus}>
                Новое соревнование
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={Search}
            className="max-w-md"
          />
        </div>

        <Card padding="none">
          {error && (
            <div className="px-4 py-3 text-sm text-accent-red border-b border-border">
              {error}
            </div>
          )}
          {isFetching && (
            <div className="px-4 py-6 text-center text-text-secondary">
              Загрузка соревнований...
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-secondary">
                  <th className="px-4 py-3 font-medium">Название</th>
                  <th className="px-4 py-3 font-medium">Даты</th>
                  <th className="px-4 py-3 font-medium">Задачи</th>
                  <th className="px-4 py-3 font-medium">Участники</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Решения</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompetitions.map((comp) => (
                  <tr
                    key={comp.id}
                    className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium">{comp.title}</div>
                      {comp.description && (
                        <div className="text-xs text-text-muted truncate max-w-[280px]">
                          {comp.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      <div>{formatDate(comp.startsAt)}</div>
                      <div className="text-xs text-text-muted">→ {formatDate(comp.endsAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {comp.tasks.map((t, idx) => (
                          <span key={`${comp.id}-${idx}`} className="inline-flex items-center gap-1 text-xs text-text-secondary">
                            <TierBadge tier={t.task.tier} />
                            {t.task.title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-text-secondary">{comp._count.entries}</td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded',
                          comp.isActive
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'bg-accent-yellow/20 text-accent-yellow'
                        )}
                      >
                        {comp.isActive ? 'Активно' : 'Пауза'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded',
                          comp.showSolutions
                            ? 'bg-accent-blue/10 text-accent-blue'
                            : 'bg-background-tertiary text-text-muted'
                        )}
                      >
                        {comp.showSolutions ? 'Открыты' : 'Скрыты'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/competitions/${comp.id}`}>
                          <Button variant="ghost" size="sm" icon={Eye}>
                            Просмотр
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={comp.isActive ? Pause : Play}
                          onClick={() => handleToggleActive(comp)}
                        >
                          {comp.isActive ? 'Пауза' : 'Активировать'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={comp.showSolutions ? EyeOff : Eye}
                          onClick={() => handleToggleSolutions(comp)}
                        >
                          {comp.showSolutions ? 'Скрыть решения' : 'Показать решения'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredCompetitions.length === 0 && !isFetching && (
            <div className="text-center py-12">
              <p className="text-text-secondary">Соревнования не найдены</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
