// src/app/admin/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutDashboard, FileText, Trophy, Users, Settings,
  Plus, ArrowRight 
} from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();

  // Редирект если не админ
  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null;
  }

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
            stats="5 задач"
            actions={
              <Link href="/admin/tasks/new">
                <Button variant="primary" size="sm" icon={Plus}>
                  Новая задача
                </Button>
              </Link>
            }
          />

          {/* Weekly Challenge */}
          <AdminCard
            icon={Trophy}
            title="Турнир недели"
            description="Управление еженедельными соревнованиями"
            href="/admin/weekly"
            stats="Активен до 1 февраля"
            color="gold"
          />

          {/* Users */}
          <AdminCard
            icon={Users}
            title="Пользователи"
            description="Просмотр и управление аккаунтами"
            href="/admin/users"
            stats="127 пользователей"
            color="green"
            disabled
          />

          {/* Settings */}
          <AdminCard
            icon={Settings}
            title="Настройки"
            description="Конфигурация платформы"
            href="/admin/settings"
            color="purple"
            disabled
          />
        </div>

        {/* Quick Stats */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Быстрая статистика</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Всего задач" value="5" />
            <StatCard label="Решений сегодня" value="47" />
            <StatCard label="Новых пользователей" value="12" />
            <StatCard label="Активных сессий" value="34" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdminCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  stats?: string;
  color?: 'blue' | 'gold' | 'green' | 'purple';
  actions?: React.ReactNode;
  disabled?: boolean;
}

function AdminCard({ 
  icon: Icon, 
  title, 
  description, 
  href, 
  stats, 
  color = 'blue',
  actions,
  disabled = false,
}: AdminCardProps) {
  const colorClasses = {
    blue: 'text-accent-blue bg-accent-blue/10',
    gold: 'text-tier-gold bg-tier-gold/10',
    green: 'text-accent-green bg-accent-green/10',
    purple: 'text-accent-amber bg-accent-amber/10',
  };

  const content = (
    <Card 
      padding="lg" 
      hover={!disabled}
      className={disabled ? 'opacity-50 cursor-not-allowed' : ''}
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">{title}</h3>
          <p className="text-sm text-text-secondary mb-3">{description}</p>
          {stats && (
            <div className="text-sm text-text-muted">{stats}</div>
          )}
          {actions && (
            <div className="mt-3">{actions}</div>
          )}
          {disabled && (
            <div className="text-xs text-text-muted mt-2">Скоро</div>
          )}
        </div>
        {!disabled && (
          <ArrowRight className="w-5 h-5 text-text-muted" />
        )}
      </div>
    </Card>
  );

  if (disabled) {
    return content;
  }

  return <Link href={href}>{content}</Link>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md">
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      <div className="text-sm text-text-secondary">{label}</div>
    </Card>
  );
}
