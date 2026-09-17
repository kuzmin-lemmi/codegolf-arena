// src/components/layout/NotificationBell.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2 } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  text: string;
  href: string | null;
  createdAt: string;
  isRead: boolean;
}

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      const json = await res.json();

      if (!json.success) {
        return;
      }

      setItems(json.data?.items || []);
      setUnreadCount(json.data?.unreadCount || 0);
    } catch {
      // Молча: колокольчик не должен ломать шапку
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const timer = setInterval(load, POLL_INTERVAL_MS);
    const handleFocus = () => load();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [load]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setUnreadCount(0);
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch {
      // Оставляем как есть: в следующий опрос счётчик восстановится
    }
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);

    if (next) {
      load();
      if (unreadCount > 0) {
        markAllRead();
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
        title="Уведомления"
        aria-label="Уведомления"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-red text-white text-[11px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-background-secondary border border-border rounded-lg shadow-lg z-20 animate-fade-in overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold">Уведомления</span>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-6 text-sm text-text-secondary text-center">
                  Пока тихо. Здесь появится сообщение, если кто-то побьёт твой рекорд.
                </div>
              ) : (
                items.map((item) => {
                  const content = (
                    <div
                      className={cn(
                        'px-4 py-3 border-b border-border/60 last:border-0 transition-colors',
                        item.href && 'hover:bg-background-tertiary/60',
                        !item.isRead && 'bg-accent-blue/5'
                      )}
                    >
                      <div className="text-sm font-medium mb-0.5">{item.title}</div>
                      <div className="text-xs text-text-secondary">{item.text}</div>
                      <div className="text-[11px] text-text-muted mt-1">
                        {formatRelativeTime(item.createdAt)}
                      </div>
                    </div>
                  );

                  if (!item.href) {
                    return <div key={item.id}>{content}</div>;
                  }

                  return (
                    <Link key={item.id} href={item.href} onClick={() => setIsOpen(false)}>
                      {content}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
