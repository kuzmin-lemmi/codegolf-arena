'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Save, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { Card, Button, Input, TierBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface TaskItem {
  id: string;
  title: string;
  slug: string;
  tier: 'bronze' | 'silver' | 'gold';
  status: 'draft' | 'published' | 'archived';
}

export default function NewCompetitionPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showSolutions, setShowSolutions] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchTasks = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/tasks', { credentials: 'include' });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || 'Не удалось загрузить задачи');
          return;
        }
        setTasks((json.data || []).filter((t: TaskItem) => t.status === 'published'));
      } catch (err) {
        setError('Не удалось загрузить задачи');
      } finally {
        setIsFetching(false);
      }
    };

    fetchTasks();
  }, [user?.isAdmin]);

  const selectedTasks = useMemo(
    () => selectedTaskIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskItem[],
    [selectedTaskIds, tasks]
  );

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    setSelectedTaskIds((prev) => {
      const index = prev.indexOf(taskId);
      if (index === -1) return prev;
      const next = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Введите название');
      return;
    }
    if (!startDate || !endDate) {
      setError('Укажите даты');
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      setError('Дата окончания должна быть позже даты начала');
      return;
    }
    if (selectedTaskIds.length === 0) {
      setError('Выберите хотя бы одну задачу');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startsAt: new Date(startDate).toISOString(),
          endsAt: new Date(endDate).toISOString(),
          taskIds: selectedTaskIds,
          showSolutions,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Не удалось создать соревнование');
        return;
      }

      router.push('/admin/competitions');
    } finally {
      setIsSaving(false);
    }
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
            href="/admin/competitions"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к соревнованиям
          </Link>
          <h1 className="text-2xl font-bold">Новое соревнование</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Основная информация</h2>
              <div className="space-y-4">
                <Input
                  label="Название"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Турнир #1"
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Описание
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 bg-background-tertiary border rounded-lg resize-y text-text-primary"
                    placeholder="Краткое описание соревнования"
                  />
                </div>
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Период проведения</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Дата начала"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  icon={Calendar}
                />
                <Input
                  label="Дата окончания"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  icon={Calendar}
                />
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Задачи</h2>
              {isFetching ? (
                <div className="text-text-secondary">Загрузка...</div>
              ) : tasks.length === 0 ? (
                <div className="text-text-secondary">Нет опубликованных задач</div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const selected = selectedTaskIds.includes(task.id);
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-lg border transition-colors',
                          selected
                            ? 'border-accent-blue bg-accent-blue/5'
                            : 'border-border hover:border-border/70'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTask(task.id)}
                          className={cn(
                            'w-5 h-5 rounded border flex items-center justify-center',
                            selected ? 'border-accent-blue' : 'border-text-muted'
                          )}
                        >
                          {selected && <div className="w-2.5 h-2.5 rounded bg-accent-blue" />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{task.title}</span>
                            <TierBadge tier={task.tier} />
                          </div>
                          <div className="text-xs text-text-muted">{task.slug}</div>
                        </div>
                        {selected && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveTask(task.id, 'up')}
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveTask(task.id, 'down')}
                            >
                              ↓
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card padding="lg">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                Настройки
              </h3>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowSolutions(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors w-full',
                    showSolutions
                      ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                      : 'border-border text-text-secondary'
                  )}
                >
                  <Eye className="w-4 h-4" />
                  Решения открыты
                </button>
                <button
                  type="button"
                  onClick={() => setShowSolutions(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors w-full',
                    !showSolutions
                      ? 'border-text-muted bg-background-tertiary text-text-secondary'
                      : 'border-border text-text-secondary'
                  )}
                >
                  <EyeOff className="w-4 h-4" />
                  Решения скрыты
                </button>
              </div>
            </Card>

            <Card padding="lg">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                Выбрано задач
              </h3>
              {selectedTasks.length === 0 ? (
                <div className="text-text-secondary text-sm">Ничего не выбрано</div>
              ) : (
                <ul className="space-y-2">
                  {selectedTasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-2 text-sm">
                      <TierBadge tier={task.tier} />
                      <span>{task.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {error && (
              <Card padding="md" className="border-accent-red/30">
                <div className="text-sm text-accent-red">{error}</div>
              </Card>
            )}

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSubmit}
                loading={isSaving}
              >
                Создать соревнование
              </Button>
              <Button variant="ghost" onClick={() => router.push('/admin/competitions')}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
