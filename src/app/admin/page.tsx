// src/app/admin/page.tsx

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { 
  LayoutDashboard, FileText, Trophy, Users, Settings,
  Plus, ArrowRight 
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth';

// Server-side admin check
async function getAdminUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('arena_session')?.value;
  
  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token: hashToken(sessionToken) },
    include: {
      user: {
        select: {
          id: true,
          isAdmin: true,
          displayName: true,
        },
      },
    },
  });

  // Старый формат (plaintext token) — инвалидируем
  if (!session) {
    const legacy = await prisma.session.findUnique({ where: { token: sessionToken } });
    if (legacy) {
      await prisma.session.delete({ where: { id: legacy.id } });
    }
    return null;
  }

  if (session.expiresAt < new Date() || !session.user.isAdmin) {
    return null;
  }

  return session.user;
}

// Get real stats from database
async function getAdminStats() {
  const [taskCount, userCount, submissionCount, activeCompetitions] = await Promise.all([
    prisma.task.count(),
    prisma.user.count(),
    prisma.submission.count(),
    prisma.competition.count({ where: { isActive: true } }),
  ]);

  return {
    tasks: taskCount,
    users: userCount,
    submissions: submissionCount,
    activeCompetitions,
  };
}

export default async function AdminPage() {
  const user = await getAdminUser();
  
  if (!user) {
    redirect('/');
  }

  const stats = await getAdminStats();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-accent-blue" />
            <div>
              <h1 className="text-2xl font-bold">Админ-панель</h1>
              <p className="text-text-secondary">Управление платформой</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Tasks */}
          <AdminCard
            icon={FileText}
            title="Задачи"
            description="Создание, редактирование и публикация задач"
            href="/admin/tasks"
            stats={`${stats.tasks} задач`}
            color="blue"
          />

          {/* Competitions */}
          <AdminCard
            icon={Trophy}
            title="Соревнования"
            description="Управление турнирами и задачей недели"
            href="/admin/competitions"
            stats={`${stats.activeCompetitions} активных`}
            color="gold"
          />

          {/* Users */}
          <AdminCard
            icon={Users}
            title="Пользователи"
            description="Просмотр и модерация пользователей"
            href="/admin/users"
            stats={`${stats.users} пользователей`}
            color="green"
          />

          {/* Settings */}
          <AdminCard
            icon={Settings}
            title="Настройки"
            description="Общие настройки платформы"
            href="/admin/settings"
            stats={`${stats.submissions} сабмитов всего`}
            color="purple"
          />
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Быстрые действия</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/tasks/new">
              <Button variant="primary" icon={Plus}>
                Создать задачу
              </Button>
            </Link>
            <Link href="/admin/competitions/new">
              <Button variant="secondary" icon={Plus}>
                Создать соревнование
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminCard({
  icon: Icon,
  title,
  description,
  href,
  stats,
  color,
}: {
  icon: any;
  title: string;
  description: string;
  href: string;
  stats: string;
  color: 'blue' | 'gold' | 'green' | 'purple';
}) {
  const colorClasses = {
    blue: 'text-accent-blue bg-accent-blue/10',
    gold: 'text-tier-gold bg-tier-gold/10',
    green: 'text-accent-green bg-accent-green/10',
    purple: 'text-accent-amber bg-accent-amber/10',
  };

  const content = (
    <Card hover padding="lg" className="h-full">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <span className="text-sm text-text-muted">{stats}</span>
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-text-secondary text-sm mb-4">{description}</p>
      <div className="flex items-center gap-1 text-accent-blue text-sm font-medium">
        Перейти
        <ArrowRight className="w-4 h-4" />
      </div>
    </Card>
  );

  return <Link href={href}>{content}</Link>;
}
