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
import { mockTasks, mockWeeklyChallenge } from '@/lib/mock-data';
import { cn, formatDate } from '@/lib/utils';

export default function AdminWeeklyPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  
  const [selectedTaskId, setSelectedTaskId] = useState(mockWeeklyChallenge.task.id);
  const [startDate, setStartDate] = useState(formatDateInput(mockWeeklyChallenge.startsAt));
  const [endDate, setEndDate] = useState(formatDateInput(mockWeeklyChallenge.endsAt));
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  const publishedTasks = mockTasks.filter((t) => t.status === 'published');
  const selectedTask = publishedTasks.find((t) => t.id === selectedTaskId);

  const handleSave = async () => {
    setIsSaving(true);
    
    // TODO: API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    alert('Турнир недели обновлён!');
    setIsSaving(false);
  };

  const timeRemaining = new Date(endDate).getTime() - Date.now();
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
            {/* Task Selection */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4">Выбор задачи</h2>
              
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

            {/* Stats */}
            <Card padding="lg">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
                Статистика турнира
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Участников
                  </span>
                  <span className="font-bold">47</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Решений</span>
                  <span className="font-bold">156</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Лучший результат</span>
                  <span className="font-bold text-accent-green">28 симв.</span>
                </div>
              </div>
            </Card>
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
