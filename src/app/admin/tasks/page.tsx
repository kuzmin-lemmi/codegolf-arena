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
import { mockTasks } from '@/lib/mock-data';
import { cn, formatDate } from '@/lib/utils';

export default function AdminTasksPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState(mockTasks);

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

  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleStatus = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === 'published' ? 'draft' : 'published' }
          : t
      )
    );
  };

  const handleDelete = (taskId: string) => {
    if (confirm('Удалить задачу? Это действие нельзя отменить.')) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
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
        <div className="mb-6">
          <Input
            placeholder="Поиск по названию или slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={Search}
            className="max-w-md"
          />
        </div>

        {/* Tasks Table */}
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-secondary">
                  <th className="px-4 py-3 font-medium">Задача</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Сложность</th>
                  <th className="px-4 py-3 font-medium">Режим</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
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
                        onClick={() => handleToggleStatus(task.id)}
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
                    <td className="px-4 py-4 text-text-secondary">
                      6 тестов
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
