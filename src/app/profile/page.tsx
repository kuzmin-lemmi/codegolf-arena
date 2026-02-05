// src/app/profile/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  User, Trophy, Code2, Calendar, Edit2, Check, X, 
  ExternalLink, ChevronRight, Lock
} from 'lucide-react';
import { Card, Button, Input, TierBadge, Avatar } from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

export default function ProfilePage() {
  const { data, isLoading, refetch } = useProfile();
  const { refresh } = useAuth();
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [tempNickname, setTempNickname] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (!data) return;
    const name = data.nickname || data.displayName;
    setNickname(name);
    setTempNickname(name);
  }, [data]);

  const handleSaveNickname = async () => {
    if (!tempNickname.trim()) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: tempNickname.trim() }),
      });

      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error || 'Не удалось обновить ник');
        return;
      }

      await refetch();
      await refresh();
      setIsEditingNickname(false);
    } catch (err) {
      setSaveError('Ошибка соединения');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Заполните все поля');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Минимум 8 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!json.success) {
        setPasswordError(json.error || 'Не удалось изменить пароль');
        return;
      }
      setPasswordSuccess('Пароль обновлён');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError('Не удалось изменить пароль');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCancelEdit = () => {
    setTempNickname(nickname);
    setIsEditingNickname(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-secondary">Загрузка профиля...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-secondary">Профиль недоступен</div>
      </div>
    );
  }

  const solvedTasks = data.solvedTasks || [];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-6">
            <Avatar
              src={data.avatarUrl}
              name={nickname}
              size="lg"
              className="w-20 h-20 text-2xl"
            />
            <div>
              <h1 className="text-2xl font-bold mb-1">{nickname}</h1>
              <p className="text-text-secondary flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                На платформе с {formatDate(new Date(data.createdAt))}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Settings & Info */}
          <div className="space-y-6">
            {/* Account Info */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Аккаунт
              </h2>

              <div className="space-y-4">
                {/* Nickname */}
                <div>
                  <label className="block text-sm text-text-secondary mb-2">
                    Ник в таблице
                  </label>
                  {isEditingNickname ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={tempNickname}
                        onChange={(e) => setTempNickname(e.target.value)}
                        className="flex-1"
                        maxLength={20}
                      />
                      <button
                        onClick={handleSaveNickname}
                        disabled={isSaving}
                        className="p-2 text-accent-green hover:bg-accent-green/10 rounded-md transition-colors"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="p-2 text-accent-red hover:bg-accent-red/10 rounded-md transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
                      <span className="font-medium">{nickname}</span>
                      <button
                        onClick={() => setIsEditingNickname(true)}
                        className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-background-secondary rounded-md transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {saveError && (
                    <p className="text-xs text-accent-red mt-2">{saveError}</p>
                  )}
                  <p className="text-xs text-text-muted mt-1">
                    Можно менять раз в 7 дней
                  </p>
                </div>

                {/* Stepik Link */}
                {data.stepikUserId && (
                  <div>
                  <label className="block text-sm text-text-secondary mb-2">
                    Связь с аккаунтом
                  </label>
                  <div className="flex items-center gap-3 p-3 bg-background-tertiary rounded-lg">
                    <div className="w-8 h-8 rounded bg-accent-blue flex items-center justify-center">
                      <span className="text-white font-bold text-sm">S</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Stepik</div>
                      <div className="text-sm text-text-secondary">
                        ID: {data.stepikUserId}
                      </div>
                    </div>
                    <a
                      href={`https://stepik.org/users/${data.stepikUserId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-text-secondary hover:text-accent-blue transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                )}
              </div>
            </Card>

            {/* Stats */}
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-tier-gold" />
                Статистика
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <StatBlock
                  label="Решено задач"
                  value={data.tasksSolved}
                />
                <StatBlock
                  label="Лучшее место"
                  value={data.bestRank ? `#${data.bestRank}` : '—'}
                  highlight
                />
                <StatBlock
                  label="Всего попыток"
                  value={data.totalSubmissions}
                />
                <StatBlock
                  label="Очки прогресса"
                  value={data.totalPoints}
                />
              </div>
            </Card>

            {/* Password */}
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-accent-blue/10">
                  <Lock className="w-5 h-5 text-accent-blue" />
                </div>
                <h2 className="text-lg font-semibold">Пароль</h2>
              </div>

              {data.email ? (
                <div className="space-y-4">
                  <Input
                    label="Текущий пароль"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <Input
                    label="Новый пароль"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Input
                    label="Повторите пароль"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />

                  {passwordError && (
                    <p className="text-sm text-accent-red">{passwordError}</p>
                  )}
                  {passwordSuccess && (
                    <p className="text-sm text-accent-green">{passwordSuccess}</p>
                  )}

                  <Button
                    variant="secondary"
                    onClick={handleChangePassword}
                    loading={isChangingPassword}
                  >
                    Обновить пароль
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  Этот аккаунт создан через Stepik. Пароль недоступен.
                </p>
              )}
            </Card>
          </div>

          {/* Right Column - Solved Tasks */}
          <div className="lg:col-span-2">
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-accent-blue" />
                  Решённые задачи
                </h2>
                <Link
                  href="/tasks"
                  className="text-sm text-accent-blue hover:underline"
                >
                  Все задачи →
                </Link>
              </div>

              {solvedTasks.length === 0 ? (
                <div className="text-center py-12">
                  <Code2 className="w-12 h-12 mx-auto text-text-muted mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Пока нет решённых задач</h3>
                  <p className="text-text-secondary mb-4">
                    Начните решать задачи и ваш прогресс появится здесь
                  </p>
                  <Link href="/tasks">
                    <Button variant="primary">Перейти к задачам</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {solvedTasks.map((task) => (
                    <Link
                      key={task.slug}
                      href={`/task/${task.slug}`}
                      className="flex items-center gap-4 p-4 bg-background-tertiary rounded-lg hover:bg-background-tertiary/70 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{task.title}</span>
                          <TierBadge tier={task.tier} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-text-secondary">
                          <span>
                            Длина: <span className="text-accent-green font-mono font-bold">{task.length}</span>
                          </span>
                          <span>
                            Решено: <span className="text-text-primary">{formatDate(new Date(task.achievedAt))}</span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-text-primary transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="p-4 bg-background-tertiary rounded-lg">
      <div className="text-sm text-text-secondary mb-1">{label}</div>
      <div
        className={cn(
          'text-2xl font-bold',
          highlight ? 'text-tier-gold' : 'text-text-primary'
        )}
      >
        {value}
      </div>
    </div>
  );
}
