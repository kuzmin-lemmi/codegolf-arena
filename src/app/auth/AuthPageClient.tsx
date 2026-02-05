'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Code2, Shield, Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

type AuthMode = 'login' | 'register';

export default function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const { login, register } = useAuth();
  const returnToParam = searchParams.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') && !returnToParam.startsWith('//')
      ? returnToParam
      : '/';

  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Форма
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);

    try {
      const result = mode === 'login'
        ? await login(email, password)
        : await register(email, password, nickname);

      if (!result.success) {
        setFormError(result.error || 'Произошла ошибка');
        return;
      }

      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setFormError('Ошибка соединения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStepikLogin = () => {
    const target = returnTo ? `/api/auth/stepik?returnTo=${encodeURIComponent(returnTo)}` : '/api/auth/stepik';
    window.location.href = target;
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-amber mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Арена однострочников</h1>
          <p className="text-text-secondary">
            {mode === 'login' ? 'Войдите в аккаунт' : 'Создайте аккаунт'}
          </p>
        </div>

        {/* OAuth Error */}
        {error && (
          <div className="mb-4 p-4 bg-accent-red/10 border border-accent-red/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent-red flex-shrink-0 mt-0.5" />
            <div className="text-sm text-accent-red">
              {error === 'oauth_not_configured' && 'OAuth через Stepik не настроен'}
              {error === 'oauth_denied' && 'Вы отменили авторизацию'}
              {error === 'auth_failed' && 'Ошибка авторизации через Stepik'}
              {error === 'csrf_failed' && 'Ошибка безопасности (CSRF). Попробуйте войти еще раз'}
              {!['oauth_not_configured', 'oauth_denied', 'auth_failed', 'csrf_failed'].includes(error) && 'Ошибка авторизации'}
            </div>
          </div>
        )}

        {/* Auth Card */}
        <Card padding="lg" className="mb-6">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-border">
            <button
              onClick={() => { setMode('login'); setFormError(null); }}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                mode === 'login'
                  ? 'text-accent-blue border-accent-blue'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => { setMode('register'); setFormError(null); }}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                mode === 'register'
                  ? 'text-accent-blue border-accent-blue'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
              }`}
            >
              Регистрация
            </button>
          </div>

          {/* Form Error */}
          {formError && (
            <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg text-sm text-accent-red flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Input
                label="Никнейм"
                placeholder="your_nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                icon={User}
                required
                minLength={3}
                maxLength={20}
              />
            )}

            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={Mail}
              required
            />

            <Input
              label="Пароль"
              type="password"
              placeholder={mode === 'register' ? 'Минимум 8 символов' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={Lock}
              required
              minLength={mode === 'register' ? 8 : 1}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
            >
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-background-secondary text-text-muted">или</span>
            </div>
          </div>

          {/* Stepik Login */}
          <button
            onClick={handleStepikLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-lg font-medium transition-colors"
          >
            <StepikLogo />
            <span>Войти через Stepik</span>
          </button>

          {/* Privacy notice */}
          <div className="mt-6 p-4 bg-background-tertiary rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-accent-green flex-shrink-0 mt-0.5" />
              <div className="text-sm text-text-secondary">
                Мы не передаём ваши данные третьим лицам. При входе через Stepik используем только публичный ник.
              </div>
            </div>
          </div>
        </Card>

        {/* Guest mode notice */}
        <Card padding="md" className="bg-background-secondary/50 text-center">
          <p className="text-sm text-text-secondary mb-3">
            Хотите просто попробовать?
          </p>
          <Link href="/tasks">
            <Button variant="ghost" size="sm">
              Решать без регистрации
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-xs text-text-muted mt-2">
            Результаты не будут сохранены в рейтинге
          </p>
        </Card>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

function StepikLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="white" />
      <path d="M7 8h10v2H7V8zm0 4h10v2H7v-2zm0 4h6v2H7v-2z" fill="rgb(var(--accent-blue))" />
    </svg>
  );
}
