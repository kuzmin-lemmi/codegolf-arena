'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { Card, Button, Input, Avatar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatDate, cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string | null;
  stepikUserId: number | null;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  isAdmin: boolean;
  createdAt: string;
  submissionsCount: number;
  bestSubmissionsCount: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
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

    const fetchUsers = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/users', { credentials: 'include' });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || 'Не удалось загрузить пользователей');
          return;
        }
        setUsers(json.data || []);
      } catch (err) {
        setError('Не удалось загрузить пользователей');
      } finally {
        setIsFetching(false);
      }
    };

    fetchUsers();
  }, [user?.isAdmin]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return users;

    return users.filter((u) => {
      const name = (u.nickname || u.displayName).toLowerCase();
      const email = (u.email || '').toLowerCase();
      const stepik = u.stepikUserId ? String(u.stepikUserId) : '';
      return name.includes(query) || email.includes(query) || stepik.includes(query);
    });
  }, [users, searchQuery]);

  const handleToggleAdmin = async (targetUser: AdminUser) => {
    const nextValue = !targetUser.isAdmin;
    const label = nextValue ? 'дать админ-доступ' : 'снять админ-доступ';
    if (!confirm(`Вы уверены, что хотите ${label} пользователю ${targetUser.nickname || targetUser.displayName}?`)) {
      return;
    }

    const res = await fetch(`/api/admin/users/${targetUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isAdmin: nextValue }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось обновить пользователя');
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === targetUser.id ? { ...u, isAdmin: nextValue } : u))
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
              <h1 className="text-2xl font-bold">Пользователи</h1>
              <p className="text-text-secondary">{users.length} пользователей</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Input
            placeholder="Поиск по нику, email или Stepik ID..."
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
              Загрузка пользователей...
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-text-secondary">
                  <th className="px-4 py-3 font-medium">Пользователь</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Stepik</th>
                  <th className="px-4 py-3 font-medium">Очки</th>
                  <th className="px-4 py-3 font-medium">Решено</th>
                  <th className="px-4 py-3 font-medium">Сабмиты</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium">Создан</th>
                  <th className="px-4 py-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={u.avatarUrl}
                          name={u.nickname || u.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.nickname || u.displayName}</div>
                          <div className="text-xs text-text-muted truncate">{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      {u.email || '—'}
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      {u.stepikUserId || '—'}
                    </td>
                    <td className="px-4 py-4 text-text-secondary">{u.totalPoints}</td>
                    <td className="px-4 py-4 text-text-secondary">{u.bestSubmissionsCount}</td>
                    <td className="px-4 py-4 text-text-secondary">{u.submissionsCount}</td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded',
                          u.isAdmin
                            ? 'bg-accent-blue/10 text-accent-blue'
                            : 'bg-background-tertiary text-text-muted'
                        )}
                      >
                        {u.isAdmin ? 'Админ' : 'Пользователь'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={u.isAdmin ? ShieldOff : ShieldCheck}
                          onClick={() => handleToggleAdmin(u)}
                        >
                          {u.isAdmin ? 'Снять админа' : 'Сделать админом'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && !isFetching && (
            <div className="text-center py-12">
              <p className="text-text-secondary">Пользователи не найдены</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
