// src/app/admin/weekly/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Trophy, Calendar, Users, Clock,
  Play, Pause, Save, AlertCircle
} from 'lucide-react';
import { Card, Button, Input, TierBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn, formatDate } from '@/lib/utils';

export default function AdminWeeklyPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Редирект если не админ
  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  useEffect(() => {
    if (!user?.isAdmin) return;

    const fetchData = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const [tasksRes, weeklyRes] = await Promise.all([
          fetch('/api/admin/tasks', { credentials: 'include' }),
          fetch('/api/admin/weekly', { credentials: 'include' }),
        ]);

        const tasksJson = await tasksRes.json();
        if (!tasksJson.success) throw new Error(tasksJson.error || 'Не удалось загрузить задачи');

        const weeklyJson = await weeklyRes.json();
        if (!weeklyJson.success) throw new Error(weeklyJson.error || 'Не удалось загрузить турнир недели');

        const published = (tasksJson.data || []).filter((t: any) => t.status === 'published');
        setTasks(published);

        const weekly = weeklyJson.data;
        if (weekly) {
          setWeeklyId(weekly.id);
          setSelectedTaskId(weekly.taskId);
          setStartDate(formatDateInput(new Date(weekly.startsAt)));
          setEndDate(formatDateInput(new Date(weekly.endsAt)));
          setIsActive(weekly.isActive);
        } else if (published.length > 0) {
          setSelectedTaskId(published[0].id);
          const now = new Date();
          const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          setStartDate(formatDateInput(now));
          setEndDate(formatDateInput(weekLater));
        }
      } catch (err: any) {
        setError(err.message || 'Не удалось загрузить данные');
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, [user?.isAdmin]);

  if (isLoading || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  const publishedTasks = tasks;
  const selectedTask = publishedTasks.find((t) => t.id === selectedTaskId);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const res = await fetch('/api/admin/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId: selectedTaskId,
          startsAt: new Date(startDate).toISOString(),
          endsAt: new Date(endDate).toISOString(),
          isActive,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        alert(json.error || 'Не удалось сохранить');
        return;
      }

      setWeeklyId(json.data.id);
      alert('Турнир недели обновлён!');
    } finally {
      setIsSaving(false);
    }
  };

  const timeRemaining = endDate ? new Date(endDate).getTime() - Date.now() : 0;
  const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

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
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-tier-gold" />
            <div>
              <h1 className="text-2xl font-bold">Турнир недели</h1>
              <p className="text-text-secondary">Управление еженедельными соревнованиями</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {error && (
              <Card padding="md" className="border-accent-red/30">
                <div className="flex items-center gap-2 text-accent-red text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              </Card>
            )}
            {/* Task Selection */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Выбор задачи</h2>
              
              {isFetching ? (
                <div className="text-text-secondary">Загрузка...</div>
              ) : publishedTasks.length === 0 ? (
                <div className="text-text-secondary">Нет опубликованных задач</div>
              ) : (
                <div className="space-y-3">
                  {publishedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                      selectedTaskId === task.id
                        ? 'border-tier-gold bg-tier-gold/5'
                        : 'border-border hover:border-border/70 hover:bg-background-tertiary/50'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        selectedTaskId === task.id
                          ? 'border-tier-gold'
                          : 'border-text-muted'
                      )}
                    >
                      {selectedTaskId === task.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-tier-gold" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.title}</span>
                        <TierBadge tier={task.tier} />
                      </div>
                      <div className="text-sm text-text-secondary">
                        {task.slug}
                      </div>
                    </div>
                  </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Dates */}
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

              {new Date(startDate) >= new Date(endDate) && (
                <div className="mt-3 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-center gap-2 text-sm text-accent-red">
                  <AlertCircle className="w-4 h-4" />
                  Дата окончания должна быть позже даты начала
                </div>
              )}
            </Card>

            {/* Status */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Статус</h2>
              
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                    isActive
                      ? 'border-accent-green bg-accent-green/10 text-accent-green'
                      : 'border-border text-text-secondary hover:border-border/70'
                  )}
                >
                  <Play className="w-4 h-4" />
                  Активен
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                    !isActive
                      ? 'border-accent-yellow bg-accent-yellow/10 text-accent-yellow'
                      : 'border-border text-text-secondary hover:border-border/70'
                  )}
                >
                  <Pause className="w-4 h-4" />
                  Приостановлен
                </button>
              </div>
            </Card>

            {/* Save Button */}
            <div className="flex items-center gap-4">
              <Button
                variant="primary"
                icon={Save}
                onClick={handleSave}
                loading={isSaving}
                size="lg"
                disabled={!selectedTaskId || !startDate || !endDate || new Date(startDate) >= new Date(endDate)}
              >
                Сохранить изменения
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-6">
            {/* Current Status */}
            <Card padding="lg" className="bg-gradient-to-br from-tier-gold/10 to-tier-gold/5">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                Текущий статус
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Статус</span>
                  <span className={cn(
                    'px-2 py-1 rounded text-sm font-medium',
                    isActive ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-yellow/20 text-accent-yellow'
                  )}>
                    {isActive ? 'Активен' : 'Приостановлен'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Осталось</span>
                  <span className="font-bold text-tier-gold">
                    {daysRemaining > 0 ? `${daysRemaining} дн.` : 'Завершён'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Selected Task Preview */}
            {selectedTask && (
              <Card padding="lg">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                  Выбранная задача
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{selectedTask.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={selectedTask.tier} />
                    <span className="text-sm text-text-muted">
                      {selectedTask.mode === 'tournament' ? 'Турнирная' : 'Практика'}
                    </span>
                  </div>
                  <code className="block text-sm text-text-secondary bg-background-tertiary p-2 rounded">
                    {selectedTask.functionSignature}
                  </code>
                  
                  <Link href={`/task/${selectedTask.slug}`}>
                    <Button variant="secondary" size="sm" className="w-full mt-2">
                      Открыть задачу
                    </Button>
                  </Link>
                </div>
              </Card>
            )}

            {weeklyId && (
              <Card padding="lg">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                  Идентификатор турнира
                </h3>
                <code className="text-sm text-text-secondary bg-background-tertiary p-2 rounded block">
                  {weeklyId}
                </code>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDateInput(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
