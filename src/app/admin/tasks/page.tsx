// src/app/admin/tasks/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Plus, Edit2, Trash2, Eye, EyeOff,
  Search, Filter 
} from 'lucide-react';
import { Card, Button, Input, TierBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn, formatDate } from '@/lib/utils';

export default function AdminTasksPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeklyTaskId, setWeeklyTaskId] = useState<string | null>(null);
  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<'all' | 'bronze' | 'silver' | 'gold'>('all');

  // Редирект если не админ
  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  if (isLoading || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchTasks = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const [tasksRes, weeklyRes] = await Promise.all([
          fetch('/api/admin/tasks', { credentials: 'include' }),
          fetch('/api/admin/weekly', { credentials: 'include' }),
        ]);

        const tasksJson = await tasksRes.json();
        if (!tasksJson.success) {
          setError(tasksJson.error || 'Не удалось загрузить задачи');
          return;
        }

        const weeklyJson = await weeklyRes.json();
        if (!weeklyJson.success) {
          setError(weeklyJson.error || 'Не удалось загрузить турнир недели');
          return;
        }

        setTasks(tasksJson.data || []);

        const weekly = weeklyJson.data;
        if (weekly) {
          setWeeklyTaskId(weekly.taskId);
          setWeeklyId(weekly.id);
        } else {
          setWeeklyTaskId(null);
          setWeeklyId(null);
        }
      } catch (err) {
        setError('Не удалось загрузить задачи');
      } finally {
        setIsFetching(false);
      }
    };

    fetchTasks();
  }, [user?.isAdmin]);

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === 'all' || task.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'published' ? 'draft' : 'published';
    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось изменить статус');
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );
  };

  const handleDelete = async (taskId: string) => {
    if (confirm('Удалить задачу? Это действие нельзя отменить.')) {
      const res = await fetch(`/api/admin/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await res.json();
      if (!json.success) {
        alert(json.error || 'Не удалось удалить задачу');
        return;
      }

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  const handleToggleWeekly = async (taskId: string, checked: boolean) => {
    if (checked) {
      if (weeklyTaskId && weeklyTaskId !== taskId) {
        const ok = confirm('Заменить текущую задачу недели на эту?');
        if (!ok) return;
      }

      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await fetch('/api/admin/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId,
          startsAt: now.toISOString(),
          endsAt: weekLater.toISOString(),
          isActive: true,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        alert(json.error || 'Не удалось назначить задачу недели');
        return;
      }

      setWeeklyTaskId(taskId);
      setWeeklyId(json.data?.id || null);
      return;
    }

    if (!weeklyId) {
      setWeeklyTaskId(null);
      return;
    }

    const res = await fetch('/api/admin/weekly', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: weeklyId, isActive: false }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось снять задачу недели');
      return;
    }

    setWeeklyTaskId(null);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
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
              <h1 className="text-2xl font-bold">Управление задачами</h1>
              <p className="text-text-secondary">{tasks.length} задач</p>
            </div>
            <Link href="/admin/tasks/new">
              <Button variant="primary" icon={Plus}>
                Новая задача
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Поиск по названию или slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={Search}
            className="max-w-md"
          />
          <div className="flex items-center gap-2">
            {(['all', 'bronze', 'silver', 'gold'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  tierFilter === tier
                    ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                    : 'border-border text-text-secondary hover:border-border/70'
                )}
              >
                {tier === 'all' ? 'Все' : tier[0].toUpperCase() + tier.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks Table */}
        <Card padding="none">
          {error && (
            <div className="px-4 py-3 text-sm text-accent-red border-b border-border">
              {error}
            </div>
          )}
          {isFetching && (
            <div className="px-4 py-6 text-center text-text-secondary">
              Загрузка задач...
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-secondary">
                  <th className="px-4 py-3 font-medium">Задача</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Сложность</th>
                  <th className="px-4 py-3 font-medium">Режим</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Неделя</th>
                  <th className="px-4 py-3 font-medium">Тестов</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium">{task.title}</div>
                      <div className="text-xs text-text-muted">
                        {formatDate(task.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <code className="text-sm text-text-secondary bg-background-tertiary px-2 py-0.5 rounded">
                        {task.slug}
                      </code>
                    </td>
                    <td className="px-4 py-4">
                      <TierBadge tier={task.tier} />
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded',
                          task.mode === 'tournament'
                            ? 'bg-tier-gold/20 text-tier-gold'
                            : 'bg-background-tertiary text-text-secondary'
                        )}
                      >
                        {task.mode === 'tournament' ? 'Турнир' : 'Практика'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleToggleStatus(task.id, task.status)}
                        className={cn(
                          'flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors',
                          task.status === 'published'
                            ? 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'
                            : 'bg-background-tertiary text-text-muted hover:bg-background-tertiary/70'
                        )}
                      >
                        {task.status === 'published' ? (
                          <>
                            <Eye className="w-3 h-3" />
                            Опубликовано
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            Черновик
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={weeklyTaskId === task.id}
                        onChange={(e) => handleToggleWeekly(task.id, e.target.checked)}
                        className="h-4 w-4 accent-accent-blue"
                        title="Сделать задачей недели"
                      />
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      {task.testcasesCount ?? 0} тестов
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/task/${task.slug}`}>
                          <Button variant="ghost" size="sm" icon={Eye}>
                            Просмотр
                          </Button>
                        </Link>
                        <Link href={`/admin/tasks/${task.id}/edit`}>
                          <Button variant="secondary" size="sm" icon={Edit2}>
                            Изменить
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          className="text-accent-red hover:bg-accent-red/10"
                          onClick={() => handleDelete(task.id)}
                        >
                          Удалить
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredTasks.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary">Задачи не найдены</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
