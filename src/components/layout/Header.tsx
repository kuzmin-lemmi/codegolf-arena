// src/components/layout/Header.tsx

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User, ChevronDown, LogOut, Loader2, Code2, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';

const navigation = [
  { name: 'Задача недели', href: '/' },
  { name: 'Задачи', href: '/tasks' },
  { name: 'Соревнования', href: '/competitions' },
  { name: 'Рейтинг', href: '/leaderboard' },
  { name: 'Правила', href: '/rules' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isLoggedIn, logout } = useAuth();
  const { theme, toggleTheme, mounted } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    router.push('/');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Логотип */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-accent-blue to-accent-purple">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg hidden sm:block">
              <span className="text-accent-blue">АРЕНА</span>{' '}
              <span className="text-text-primary">ОДНОСТРОЧНИКОВ</span>
            </span>
          </Link>

          {/* Навигация */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'text-accent-blue bg-accent-blue/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Пользователь + Тема */}
          <div className="flex items-center gap-3">
            {/* Кнопка темы */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
                title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
            )}

            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            ) : isLoggedIn && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-background-tertiary transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-green flex items-center justify-center text-white font-medium text-sm">
                    {(user.nickname || user.displayName)?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium hidden sm:block">
                    {user.nickname || user.displayName}
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-secondary" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 py-1 bg-background-secondary border border-border rounded-lg shadow-lg z-20 animate-fade-in">
                      <Link
                        href="/profile"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="w-4 h-4" />
                        Профиль
                      </Link>
                      <hr className="my-1 border-border" />
                      <button
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-accent-red hover:bg-background-tertiary transition-colors"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4" />
                        Выйти
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/auth" className="btn-primary text-sm">
                Войти
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
